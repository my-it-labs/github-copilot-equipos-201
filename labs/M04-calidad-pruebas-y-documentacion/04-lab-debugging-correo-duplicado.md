# Laboratorio: debugging del correo duplicado

[← Página anterior](03-lab-caso-limite-redondeo.md) · [Siguiente página →](05-lab-refactor-con-red.md)

La incidencia TEA-107 dice que algunos compradores, sobre todo de Teatro Cierzo, reciben la confirmación de compra dos y tres veces, y que en el backoffice (**Correos**) esos pedidos no aparecen ni una vez. Con un síntoma así es fácil que Copilot proponga causas plausibles y falsas («un doble clic en Pagar», «el webhook de la pasarela se repite»). En este lab trabajas al revés: reproduces el fallo comprando una entrada de *Historia de un idiota contada por él mismo: versión íntegra* (`EV-CIERZO-0027`), reúnes la evidencia (la traza del servicio de correo, la tabla `email_log`) y solo entonces le pides a Copilot que la explique. Terminas con dos arreglos: el del caso y el que evita toda la familia de fallos.

### Objetivo

Comprender qué es el debugging guiado por evidencia con un asistente: cómo se reproduce el fallo y se recoge la traza antes de pedir una explicación, cómo debe ser la causa (la que explica todos los síntomas a la vez), cómo se detecta una hipótesis que no encaja con los datos y cómo se mejora el código para que el mismo tipo de fallo no vuelva a duplicar correos.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio.
- Teatralia en su estado inicial y la plataforma en marcha en una **segunda terminal**, que vas a leer:

```bash
# Terminal 1: descarta tus cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

```bash
# Terminal 2: arranca la plataforma y déjala a la vista
make up
```

- Teatro Cierzo: tienda con `x-teatralia-tenant-slug: teatro-cierzo`, backoffice con el token `cierzo-dev-token`. Su proveedor de correo es Mailgun **emulado**: no envía nada a internet ni a Mailpit; cada envío se ve como una línea `[mailgun emulado]` en la terminal 2.
- Tarjeta de prueba que aprueba: `4242 4242 4242 4242`.

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Al pagar, la API deja un trabajo «enviar confirmación» en una cola | `enqueueEmail` en `services/api/src/queue.ts` (BullMQ sobre Redis) |
| Un servicio aparte recoge el trabajo y envía el correo | `services/notifier` (`[correo]` en la terminal 2) |
| Si el trabajo falla, la cola lo reintenta | `attempts: 3` con espera exponencial |
| El backoffice enseña los correos enviados | La tabla `email_log` (pantalla **Correos**) |

El síntoma tiene dos partes que una buena causa debe explicar a la vez: **varios correos** al comprador y **ningún registro** en `email_log`.

### 1 — Lee la incidencia y las quejas de los clientes

```bash
cd teatralia
# La incidencia del backlog
cat docs/backlog/TEA-107-correo-duplicado.md
```

**Resultado esperado:**

```text
---
titulo: "Algunos compradores reciben dos correos de confirmación"
etiquetas: [bug, notificaciones]
---
Hay incidencias de compradores que reciben la confirmación dos y tres veces, sobre todo del Teatro Cierzo.
En el backoffice (Correos) esos pedidos no aparecen: ni una vez ni tres.
```

### 2 — Pide hipótesis, no una causa

Antes de reproducir nada, pide a Copilot que razone sobre el flujo y te diga **qué evidencia** distinguiría cada hipótesis. Conversación nueva en modo **Ask**:

```text
#file:teatralia/services/api/src/queue.ts
#file:teatralia/services/notifier/src/index.ts
#file:teatralia/services/notifier/src/jobs.ts

Síntoma: algunos compradores reciben 2 o 3 correos de confirmación iguales y en email_log no
queda ninguna fila de esos pedidos. Dame como mucho tres hipótesis que expliquen LAS DOS cosas a
la vez y, para cada una, qué vería en la traza del notifier o en la base de datos si fuera cierta.
No propongas arreglos todavía.
```

**Qué debe contener la respuesta** (las hipótesis y su orden cambian en cada ejecución):

- que la cola reintenta un trabajo fallido hasta 3 veces (`attempts: 3` en `queue.ts`);
- que en `sendOrderConfirmed` el envío (`provider.send`) va **antes** del registro (`logEmail`): si el registro falla, el correo ya ha salido y el reintento lo vuelve a enviar;
- qué buscar: líneas `✗ order-confirmed` con un error de base de datos y varios `intento N` del mismo trabajo.

Una hipótesis como «el comprador pulsa dos veces Pagar» explica los correos repetidos pero no la ausencia de registro: descártala por los datos, no por intuición.

### 3 — Reproduce el fallo con una compra real

Compra una butaca libre de `EV-CIERZO-0027` en la tienda de Teatro Cierzo y págala.

```bash
# Crea el pedido de la butaca A-1 (queda pendiente de pago unos minutos)
curl -s localhost:3000/api/public/orders \
  -H 'x-teatralia-tenant-slug: teatro-cierzo' -H 'content-type: application/json' \
  -d '{"event_id":"EV-CIERZO-0027","buyer_email":"lucia.prueba@correo.test","items":[{"seat_id":"A-1"}]}'
```

**Resultado esperado:**

```text
{"id":"PED-2026-2468","status":"pending","subtotal_cents":2275,"fee_cents":80,"total_cents":2355,"commission_cents":171,"lines":[{"price_cents":2275,"fee_cents":80,"commission_cents":171}],"hold_minutes":10}
```

Si en tu base de datos ya se creó algún pedido después del `make reset`, el número será otro: úsalo en los pasos siguientes.

```bash
# Paga el pedido con la tarjeta de prueba
curl -s localhost:3000/api/public/orders/PED-2026-2468/pay \
  -H 'x-teatralia-tenant-slug: teatro-cierzo' -H 'content-type: application/json' \
  -d '{"card":"4242 4242 4242 4242"}'
```

**Resultado esperado** (el `charge_id` cambia):

```text
{"id":"PED-2026-2468","status":"paid","charge_id":"ch_0fb42bedfa5f64e0"}
```

### 4 — Lee la traza del servicio de correo

Espera unos 10 s (los reintentos esperan 1 s, 2 s…) y mira la terminal 2. Las líneas del notifier llevan el prefijo `[correo]`.

**Resultado esperado** (el número de trabajo `#…` y los identificadores de mensaje cambian):

```text
→ order-confirmed #1 (intento 1)
[mailgun emulado] lucia.prueba@correo.test · Tus entradas para Historia de un idiota contada por él mismo: versión íntegra — PED-2026-2468 · <d48c44d659b07ed5@mailgun.emulado>
✗ order-confirmed #1: value too long for type character varying(80)
→ order-confirmed #1 (intento 2)
[mailgun emulado] lucia.prueba@correo.test · Tus entradas para Historia de un idiota contada por él mismo: versión íntegra — PED-2026-2468 · <d512bb7fa11dbfee@mailgun.emulado>
✗ order-confirmed #1: value too long for type character varying(80)
→ order-confirmed #1 (intento 3)
[mailgun emulado] lucia.prueba@correo.test · Tus entradas para Historia de un idiota contada por él mismo: versión íntegra — PED-2026-2468 · <bc103e86ba0267a0@mailgun.emulado>
✗ order-confirmed #1: value too long for type character varying(80)
```

| Línea | Qué significa |
|-------|---------------|
| `→ order-confirmed #1 (intento 1)` | El notifier recoge el trabajo de la cola |
| `[mailgun emulado] …` | El correo **sale**: tres veces, con tres identificadores distintos |
| `✗ … value too long for type character varying(80)` | Después del envío, algo de 80 caracteres no cabe en la base de datos |

### 5 — Comprueba que no queda registro

El backoffice lee los correos de `email_log`. Consulta si hay alguna fila de tu pedido y cuántos pedidos pagados del mismo evento tienen registro.

```bash
# Filas de email_log de tu pedido
psql "$DATABASE_URL" -c "SELECT count(*) FROM email_log WHERE subject LIKE '%PED-2026-2468%';"
# Pedidos pagados de EV-CIERZO-0027 en los datos de ejemplo y sus registros de correo
psql "$DATABASE_URL" -c "SELECT o.id AS pedido, count(l.id) AS correos_registrados FROM orders o LEFT JOIN email_log l ON l.job_id = 'seed-' || o.id WHERE o.event_id = 'EV-CIERZO-0027' AND o.status = 'paid' GROUP BY o.id ORDER BY o.id;"
```

**Resultado esperado** (la segunda consulta, con los datos de ejemplo; tu pedido no aparece porque su trabajo no se llama `seed-…`):

```text
 count 
-------
     0
(1 row)

    pedido     | correos_registrados 
---------------+---------------------
 PED-2026-1467 |                   0
 PED-2026-1514 |                   0
 PED-2026-1519 |                   0
 PED-2026-1701 |                   0
 PED-2026-1756 |                   0
 PED-2026-1913 |                   0
 PED-2026-2181 |                   0
 PED-2026-2355 |                   0
 PED-2026-2448 |                   0
(9 rows)
```

Ningún pedido de este evento tiene registro. Los otros eventos de Teatro Cierzo sí: el problema no es el promotor ni Mailgun, es algo de este evento.

### 6 — Da la evidencia a Copilot y pide la causa

Ahora sí: selecciona en la terminal 2 las nueve líneas de la traza y, en el mismo chat del paso 2, pega:

```text
#terminalSelection
#file:teatralia/services/notifier/src/templates.ts
#file:teatralia/services/api/migrations/001_init.sql

Esta es la traza del notifier al pagar PED-2026-2468 de EV-CIERZO-0027. email_log no tiene
ninguna fila de ese pedido ni de ningún pedido de ese evento. ¿Qué columna no admite el valor,
qué valor exacto se intenta guardar, cuántos caracteres tiene, y por qué eso produce 3 correos?
```

**Qué debe contener la respuesta:**

- la columna `subject varchar(80)` de `email_log` (en `001_init.sql`);
- el asunto que construye `orderConfirmedEmail`: `Tus entradas para {título} — {pedido}`;
- que con este título el asunto pasa de 80 caracteres, el `INSERT` falla **después** de `provider.send`, el trabajo se marca como fallido y BullMQ lo reintenta 3 veces: 3 envíos y 0 filas.

Comprueba los dos números contra la base de datos:

```bash
# La definición de la columna
psql "$DATABASE_URL" -c "\d email_log" | grep subject
# Longitud del asunto del pedido y de los asuntos más largos del catálogo
psql "$DATABASE_URL" -c "SELECT e.id, length(e.title) AS titulo, length('Tus entradas para ' || e.title || ' — PED-2026-0000') AS asunto FROM events e ORDER BY asunto DESC LIMIT 4;"
```

**Resultado esperado:**

```text
 subject    | character varying(80)    |           | not null | 
        id        | titulo | asunto 
------------------+--------+--------
 EV-CIERZO-0027   |     59 |     93
 EV-LUMEN-0010    |     30 |     64
 EV-ALBORADA-2027 |     30 |     64
 EV-OLIVO-0101    |     28 |     62
(4 rows)
```

93 caracteres en una columna de 80, y es el único evento que pasa del límite. La causa explica los dos síntomas: el correo sale antes de fallar (tres envíos) y el registro nunca llega a escribirse (cero filas).

### 7 — Fija el síntoma con un test

El asunto lo construye una función pura (`orderConfirmedEmail` en `templates.ts`), así que el fallo se puede reproducir sin cola ni base de datos. Crea `services/notifier/test/asunto.test.ts` (a mano o con Copilot en modo **Agent**, pidiendo que no toque `src/`):

```ts
import { describe, expect, it } from 'vitest';
import { orderConfirmedEmail } from '../src/templates.js';

const datos = (eventTitle: string) => ({
  tenantName: 'Teatro Cierzo',
  orderId: 'PED-2026-2468',
  eventTitle,
  venue: 'Teatro Cierzo',
  startsAt: '2027-02-06T19:00:00Z',
  totalCents: 2355,
  ticketsUrl: 'http://localhost:5173/t/teatro-cierzo/mis-entradas',
  tickets: [],
});

describe('asunto de la confirmación', () => {
  it('cabe en email_log.subject (varchar(80)) con el título más largo del catálogo', () => {
    const { subject } = orderConfirmedEmail(datos('Historia de un idiota contada por él mismo: versión íntegra'));
    expect(subject.length).toBeLessThanOrEqual(80);
    expect(subject).toContain('PED-2026-2468'); // el número de pedido no se pierde
  });

  it('un título corto queda igual', () => {
    expect(orderConfirmedEmail(datos('Jazz en el Faro')).subject).toBe('Tus entradas para Jazz en el Faro — PED-2026-2468');
  });
});
```

```bash
npx vitest run services/notifier/test/asunto.test.ts
```

**Resultado esperado** (líneas clave):

```text
     × cabe en email_log.subject (varchar(80)) con el título más largo del catálogo 16ms
AssertionError: expected 93 to be less than or equal to 80
      Tests  1 failed | 1 passed (2)
```

### 8 — Arreglo del caso: el asunto cabe en 80 caracteres

Pide el arreglo a Copilot en modo **Edit**, con el test como criterio:

```text
#file:teatralia/services/notifier/src/templates.ts
#file:teatralia/services/notifier/test/asunto.test.ts

Haz que el asunto de orderConfirmedEmail no pase de 80 caracteres (el tamaño de email_log.subject):
recorta el título del evento con «…» y no recortes nunca el número de pedido. Los títulos cortos no
cambian. No toques el test.
```

<details>
<summary>Solución de referencia (<code>templates.ts</code>)</summary>

```ts
// email_log.subject es varchar(80): el asunto se recorta por el título, nunca por el número de pedido
export const SUBJECT_MAX = 80;

function confirmationSubject(eventTitle: string, orderId: string) {
  const room = SUBJECT_MAX - `Tus entradas para  — ${orderId}`.length;
  const title = eventTitle.length > room ? eventTitle.slice(0, room - 1).trimEnd() + '…' : eventTitle;
  return `Tus entradas para ${title} — ${orderId}`;
}

export function orderConfirmedEmail(d: OrderEmailData) {
  const subject = confirmationSubject(d.eventTitle, d.orderId);
  // … el resto de la función no cambia
```

</details>

```bash
npx vitest run services/notifier/test/asunto.test.ts
```

**Resultado esperado:**

```text
      Tests  2 passed (2)
```

### 9 — Arreglo de la familia: registrar antes de enviar, una sola vez

Recortar el asunto arregla este título. Pero el patrón «enviar y después registrar, con reintentos» duplicará correos con **cualquier** fallo del registro: otra columna que se queda corta, la base de datos caída un segundo, un `tenant_id` que no existe. El arreglo de la familia invierte el orden y hace el envío idempotente: se registra en una transacción, se envía y se confirma; si el registro falla, no sale nada; si el trabajo ya se registró en un intento anterior (mismo `job_id`), no se repite.

Pídeselo a Copilot en modo **Agent**:

```text
#file:teatralia/services/notifier/src/jobs.ts

Cambia sendOrderConfirmed y sendTestEmail para que un reintento de la cola nunca duplique un correo:
abre una transacción, comprueba si ya hay una fila en email_log con ese job_id (si la hay, no envíes),
inserta la fila, envía con el proveedor y haz COMMIT; si algo falla, ROLLBACK y relanza el error.
Extrae esa lógica a una función sendOnce. Después ejecuta npm run typecheck -w @teatralia/notifier.
```

<details>
<summary>Solución de referencia (<code>jobs.ts</code>)</summary>

```ts
// Registra el correo y lo envía en la misma transacción: si el registro falla, no sale nada,
// y si el trabajo ya se envió en un intento anterior (mismo job_id), no se repite.
async function sendOnce(
  log: { tenantId: string; provider: string; to: string; subject: string; jobId?: string },
  send: () => Promise<unknown>,
) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    if (log.jobId) {
      const sent = await db.query('SELECT 1 FROM email_log WHERE job_id = $1', [log.jobId]);
      if (sent.rowCount) {
        await db.query('ROLLBACK');
        return;
      }
    }
    await db.query(
      'INSERT INTO email_log (tenant_id, provider, to_address, subject, job_id) VALUES ($1, $2, $3, $4, $5)',
      [log.tenantId, log.provider, log.to, log.subject, log.jobId ?? null],
    );
    await send();
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}
```

En `sendOrderConfirmed`, las dos últimas líneas (`provider.send` y `logEmail`) se sustituyen por:

```ts
  await sendOnce(
    { tenantId: tenant.id, provider: provider.name, to: order.buyer_email, subject: email.subject, jobId },
    () => provider.send({ from: tenant.email_from, to: order.buyer_email, ...email, attachments }),
  );
```

y `sendTestEmail` hace lo mismo con su correo de prueba. Como `attachments` pasa a usarse dentro de una función, TypeScript pide su tipo: `const attachments: { filename: string; content: Buffer; cid: string }[] = [];`. La función `logEmail` deja de usarse y se borra.

</details>

```bash
# Tipos del notifier y todos los tests
npm run typecheck -w @teatralia/notifier && npx vitest run services/notifier/test/
```

**Resultado esperado** (líneas clave):

```text
> tsc -p tsconfig.json

 Test Files  2 passed (2)
      Tests  5 passed (5)
```

### 10 — Comprueba el arreglo con otra compra

`make up` reinicia el notifier al guardar. Compra y paga la butaca A-2 del mismo evento.

```bash
# Pedido nuevo y pago, en un solo bloque
curl -s localhost:3000/api/public/orders \
  -H 'x-teatralia-tenant-slug: teatro-cierzo' -H 'content-type: application/json' \
  -d '{"event_id":"EV-CIERZO-0027","buyer_email":"lucia.prueba@correo.test","items":[{"seat_id":"A-2"}]}'
echo
curl -s localhost:3000/api/public/orders/PED-2026-2469/pay \
  -H 'x-teatralia-tenant-slug: teatro-cierzo' -H 'content-type: application/json' \
  -d '{"card":"4242 4242 4242 4242"}'
```

**Resultado esperado** en la terminal 2 (números de trabajo y de mensaje cambian):

```text
→ order-confirmed #2 (intento 1)
[mailgun emulado] lucia.prueba@correo.test · Tus entradas para Historia de un idiota contada por él mismo: v… — PED-2026-2469 · <5907eb949a10adcc@mailgun.emulado>
✓ order-confirmed #2
```

```bash
psql "$DATABASE_URL" -c "SELECT provider, subject, job_id FROM email_log WHERE subject LIKE '%PED-2026-2469%';"
```

```text
 provider |                                     subject                                      | job_id 
----------+----------------------------------------------------------------------------------+--------
 mailgun  | Tus entradas para Historia de un idiota contada por él mismo: v… — PED-2026-2469 | 2
(1 row)
```

Un envío, una fila. En el backoffice (`http://localhost:5174`, token `cierzo-dev-token`, menú **Correos**) el pedido aparece arriba.

## Comprueba tu entendimiento

**La hipótesis que no encaja**
Alguien sugiere que el comprador pulsó dos veces **Pagar**. Vuelve a pagar `PED-2026-2469` con el mismo `curl` del paso 10.
→ `{"error":"el pedido está paid"}`: la API no cobra dos veces, y esa hipótesis tampoco explicaba la ausencia de filas en `email_log`.

**Qué haría falta para que falle otra vez**
Explica con la traza del paso 4 qué tendría que ocurrir, después del arreglo del paso 9, para que un comprador recibiera dos correos.
→ Que el `COMMIT` fallase justo después de un envío correcto: el reintento no encontraría la fila y reenviaría. Es posible, pero mucho menos probable que cualquier error del `INSERT`, que ahora ocurre antes de enviar.

## Experimenta

**Predice** qué verás en la traza si aplicas **solo** el arreglo del paso 9 (registrar antes) y no el del paso 8 (recortar el asunto). Aparta el cambio de `templates.ts`, compra otra butaca y paga.

```bash
# Guarda aparte tu arreglo de templates.ts; jobs.ts conserva el arreglo de la familia
git stash push services/notifier/src/templates.ts
# Compra y paga la butaca A-4 (usa el número de pedido que te devuelva el primer curl)
curl -s localhost:3000/api/public/orders \
  -H 'x-teatralia-tenant-slug: teatro-cierzo' -H 'content-type: application/json' \
  -d '{"event_id":"EV-CIERZO-0027","buyer_email":"lucia.prueba@correo.test","items":[{"seat_id":"A-4"}]}'
echo
curl -s localhost:3000/api/public/orders/PED-2026-2471/pay \
  -H 'x-teatralia-tenant-slug: teatro-cierzo' -H 'content-type: application/json' \
  -d '{"card":"4242 4242 4242 4242"}'
```

**Resultado esperado** en la terminal 2 (pedido y trabajo dependen de cuántas compras lleves):

```text
→ order-confirmed #4 (intento 1)
✗ order-confirmed #4: value too long for type character varying(80)
→ order-confirmed #4 (intento 2)
✗ order-confirmed #4: value too long for type character varying(80)
→ order-confirmed #4 (intento 3)
✗ order-confirmed #4: value too long for type character varying(80)
```

Ninguna línea `[mailgun emulado]`: el registro falla antes de enviar y la compradora recibe **cero** correos en lugar de tres. El fallo sigue ahí, pero ahora es visible (tres errores en la traza) en vez de molesto para el cliente. Los dos arreglos son complementarios: el del paso 8 hace que el correo salga; el del paso 9, que un fallo futuro no lo duplique. Recupera tu arreglo de `templates.ts`:

```bash
git stash pop
```

## Reto

### 1 — Un trabajo que ya se envió no se repite

**La situación:** en una revisión, un compañero duda de la comprobación por `job_id` del paso 9: «si el trabajo se reintenta después de un envío correcto, ¿de verdad no se vuelve a enviar?». Quiere verlo, no leerlo.

**Qué haces:** con los dos arreglos aplicados y `make up` en marcha, compra y paga otra butaca (A-3) para tener un envío correcto reciente. Después pide a la cola que **reintente ese mismo trabajo**, ya completado, y mira la traza. El reintento se lanza con un script de una sola vez que usa la cola de BullMQ; el último argumento es el número de trabajo que ves en la traza (`#3` en el ejemplo):

```bash
# Reintenta el trabajo ya completado (cambia 3 por el número de tu traza)
npx tsx -e "
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
(async () => {
  const q = new Queue('emails', { connection: new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }) });
  const job = await q.getJob(process.argv[1] ?? '');
  console.log(job?.name, job?.data.orderId, await job?.getState());
  await job?.retry('completed');
  process.exit(0);
})();" 3
```

**Pistas:** el id del trabajo aparece en la traza (`#3`) y en la columna `job_id` de `email_log`. `sendOnce` busca ese `job_id` antes de enviar.

**Lo que buscas:** un segundo intento del mismo trabajo que termina en `✓` sin ninguna línea `[mailgun emulado]` delante, y una sola fila del pedido en `email_log`.

<details>
<summary>Ver solución</summary>

La compra de la butaca A-3 (en esta ejecución, `PED-2026-2470`) se envía una vez. El script confirma qué trabajo reintenta:

```text
order-confirmed PED-2026-2470 completed
```

Y la traza del notifier, con el envío original y el reintento:

```text
→ order-confirmed #3 (intento 1)
[mailgun emulado] lucia.prueba@correo.test · Tus entradas para Historia de un idiota contada por él mismo: v… — PED-2026-2470 · <52919ef18ee9abea@mailgun.emulado>
✓ order-confirmed #3
→ order-confirmed #3 (intento 2)
✓ order-confirmed #3
```

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM email_log WHERE subject LIKE '%PED-2026-2470%';"
```

```text
 count 
-------
     1
(1 row)
```

El intento 2 termina bien sin enviar: `sendOnce` encuentra la fila con ese `job_id` y no llama al proveedor. Esto es **idempotencia**: repetir la misma operación deja el sistema igual que hacerla una vez. En una cola con reintentos, cada consumidor con efectos externos (correo, cobro, webhook) necesita una clave así. **La regla:** si algo se puede reintentar, el efecto externo tiene que poder detectar que ya ocurrió.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| No aparece ninguna línea `[correo]` al pagar | El notifier no está en marcha o Redis no responde | Mira la terminal 2; reinicia con <kbd>Ctrl</kbd>+<kbd>C</kbd> y `make up` |
| El correo no aparece en Mailpit | Teatro Cierzo usa Mailgun **emulado** | Es lo esperado: el envío se ve en la traza, no en Mailpit |
| `la butaca A-1 ya no está libre` | Ya la compraste en otro intento | Usa otra butaca (A-4, A-5…) o `CONFIRM=1 make reset` |
| `npm run typecheck` falla en `attachments` | El array se usa dentro de una función y pierde su tipo | Decláralo con su tipo, como en la solución del paso 9 |
| Tras el paso 9 el comprador no recibe nada | Falta el arreglo del paso 8 | Es el comportamiento esperado del Experimenta: aplica también el recorte |

## Conclusiones

### Qué es el debugging guiado por evidencia

Reproducir el fallo, recoger lo que el sistema dice de él (traza, tablas) y solo entonces pedir una explicación. Copilot es muy bueno uniendo una traza con el código que la produce; es poco fiable adivinando una causa sin traza.

```text
síntoma (TEA-107) → hipótesis + qué las distingue → reproducción (PED-2026-2468)
     → traza: 3 envíos + varchar(80) → datos: 0 filas, 93 caracteres → causa → test → arreglos
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| La causa explica todos los síntomas | Envío antes del registro + reintentos: 3 correos y 0 filas |
| Cada dato de la explicación se comprueba | `\d email_log` (80) y `length(...)` (93) |
| El fallo queda fijado en un test | `asunto.test.ts`: `expected 93 to be less than or equal to 80` |
| Se arregla el caso y la familia | Recorte del asunto + `sendOnce` idempotente |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Efecto externo antes del registro | Línea `[mailgun emulado]` antes de cada `✗` | Correos repetidos en cada reintento |
| Columna más corta que el dato | `value too long for type character varying(80)` | El registro falla siempre con ese evento |
| Hipótesis plausible sin evidencia | El doble pago da `el pedido está paid` | Se arregla lo que no estaba roto |
| Arreglar solo el caso | El patrón sigue en `jobs.ts` | El próximo error del registro vuelve a duplicar |

### Cómo se perfecciona

- Pedir a Copilot hipótesis **con la evidencia que las distingue**, y darle la traza real en lugar del síntoma.
- En cada consumidor de una cola, registrar antes del efecto externo y usar una clave de idempotencia (`job_id`).
- Validar longitudes en el código con el mismo límite que la base de datos, con un test por el dato más largo real.

### En una frase

> 🔑 Primero la traza y después la explicación: la causa buena es la que explica todos los síntomas a la vez, y el arreglo bueno es el que impide toda la familia.
