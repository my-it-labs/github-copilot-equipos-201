#!/usr/bin/env node
// Comprueba una especificación OpenAPI (JSON) de la API pública de pedidos contra el servidor en marcha.
// Lo usa el laboratorio de M04 «README y OpenAPI».
//
//   node scripts/m04-comprobar-openapi.mjs teatralia/docs/api-pedidos.openapi.json
//   API=http://localhost:3000 node scripts/m04-comprobar-openapi.mjs <spec>
//
// Hace una compra real en Sala Faro (Jazz en el Faro, EV-FARO-0042): crea un pedido con la primera butaca
// libre, lo paga con la tarjeta de prueba, lo consulta y provoca tres errores. Para cada llamada comprueba
// que el código HTTP está documentado y que los campos de la respuesta coinciden con los del esquema.
// Termina con código 1 si encuentra alguna diferencia.
import { readFileSync } from 'node:fs';

const specPath = process.argv[2];
if (!specPath) {
  console.error('Uso: node scripts/m04-comprobar-openapi.mjs <especificación.json>');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const API = process.env.API ?? 'http://localhost:3000';
const TENANT = { 'x-teatralia-tenant-slug': 'sala-faro' };
const EVENT = 'EV-FARO-0042';
let problemas = 0;

// Sigue un $ref interno (#/components/schemas/…)
function resolve(schema) {
  if (schema?.$ref) return resolve(schema.$ref.slice(2).split('/').reduce((o, k) => o?.[k], spec));
  return schema;
}

// Claves de nivel superior que el esquema documenta (también si es un array de objetos)
function documentedKeys(schema) {
  const s = resolve(schema);
  if (!s) return null;
  if (s.type === 'array') return documentedKeys(s.items);
  if (s.allOf) return s.allOf.flatMap((x) => documentedKeys(x) ?? []);
  return Object.keys(s.properties ?? {});
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { ...TENANT, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

function check(name, specPathKey, method, res) {
  const op = spec.paths?.[specPathKey]?.[method];
  const line = `${method.toUpperCase()} ${specPathKey} → ${res.status}`;
  if (!op) {
    console.log(`✗ ${name}: ${line} — la operación no está en la especificación`);
    problemas++;
    return;
  }
  const doc = resolve(op.responses?.[String(res.status)]);
  if (!doc) {
    console.log(`✗ ${name}: ${line} — código ${res.status} no documentado (documentados: ${Object.keys(op.responses ?? {}).join(', ')})`);
    problemas++;
    return;
  }
  const schema = doc.content?.['application/json']?.schema;
  const expected = documentedKeys(schema);
  if (!expected) {
    console.log(`✗ ${name}: ${line} — la respuesta no tiene esquema`);
    problemas++;
    return;
  }
  compare(name, line, expected, Object.keys(res.json));
}

// Compara los campos documentados con los que devuelve el servidor
function compare(name, line, expected, got) {
  const sobran = got.filter((k) => !expected.includes(k));
  const faltan = expected.filter((k) => !got.includes(k));
  if (sobran.length || faltan.length) {
    if (sobran.length) console.log(`✗ ${name}: ${line} — el servidor devuelve y no está documentado: ${sobran.join(', ')}`);
    if (faltan.length) console.log(`✗ ${name}: ${line} — documentado y el servidor no lo devuelve: ${faltan.join(', ')}`);
    problemas++;
    return;
  }
  console.log(`✓ ${name}: ${line} — ${got.length} campos, coinciden`);
}

const seats = await call('GET', `/api/public/events/${EVENT}/seats`);
const seat = seats.json.find?.((s) => s.status === 'free');
if (!seat) {
  console.error(`No hay butacas libres en ${EVENT} (¿está la API en marcha en ${API}?)`);
  process.exit(2);
}
const email = 'comprobador.openapi@ejemplo.test';

const created = await call('POST', '/api/public/orders', { event_id: EVENT, buyer_email: email, items: [{ seat_id: seat.id }] });
check('crear pedido', '/api/public/orders', 'post', created);
const id = created.json.id;

const paid = await call('POST', `/api/public/orders/${id}/pay`, { card: '4242 4242 4242 4242' });
check('pagar', '/api/public/orders/{id}/pay', 'post', paid);

const got = await call('GET', `/api/public/orders/${id}?email=${encodeURIComponent(email)}`);
check('consultar', '/api/public/orders/{id}', 'get', got);
// Cada entrada del pedido, contra el esquema de los elementos de «tickets»
const orderSchema = resolve(spec.paths?.['/api/public/orders/{id}']?.get?.responses?.['200']?.content?.['application/json']?.schema);
const ticketsSchema = orderSchema?.properties?.tickets;
if (got.json.tickets?.[0]) {
  if (ticketsSchema) {
    compare('cada entrada', 'GET /api/public/orders/{id} → tickets[]', documentedKeys(ticketsSchema), Object.keys(got.json.tickets[0]));
  } else {
    console.log('✗ cada entrada: «tickets» no está descrito en la especificación');
    problemas++;
  }
}

const again = await call('POST', `/api/public/orders/${id}/pay`, { card: '4242 4242 4242 4242' });
check('pagar dos veces', '/api/public/orders/{id}/pay', 'post', again);

const wrong = await call('GET', `/api/public/orders/${id}?email=otra.persona@ejemplo.test`);
check('consultar con otro email', '/api/public/orders/{id}', 'get', wrong);

const taken = await call('POST', '/api/public/orders', { event_id: EVENT, buyer_email: email, items: [{ seat_id: seat.id }] });
check('butaca ocupada', '/api/public/orders', 'post', taken);

console.log(problemas ? `\n${problemas} diferencia(s) entre la especificación y el servidor` : '\nLa especificación coincide con el servidor');
process.exit(problemas ? 1 : 0);
