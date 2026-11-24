# Laboratorio: README y OpenAPI

[← Página anterior](07-lab-inyeccion-sql.md) · [Siguiente página →](09-lab-notas-de-version.md)

Un partner quiere vender entradas de los promotores de Teatralia desde su propia web y pide la documentación de la API de pedidos (TEA-112). No existe: ni especificación OpenAPI ni README. Copilot genera una especificación completa en segundos a partir de las rutas, y ese es el riesgo: una especificación que **parece** correcta, con campos que el servidor no devuelve o sin códigos de error que sí devuelve, hace que el partner programe contra una API que no existe. En este lab generas la especificación de las tres operaciones de compra, la compruebas contra el servidor en marcha con un comprobador del curso y corriges lo que no cuadre.

### Objetivo

Comprender qué es documentación técnica generada y verificada: cómo se genera con Copilot a partir del código, cómo debe ser una especificación fiable (cada campo y cada código de respuesta, tal como los devuelve el servidor), cómo se detectan los campos inventados o los olvidados y cómo se corrige con la salida real como fuente.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio.
- Teatralia en su estado inicial y la plataforma en marcha en una **segunda terminal**:

```bash
# Terminal 1: descarta tus cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

```bash
# Terminal 2: arranca la plataforma y déjala abierta
make up
```

- Código de las rutas: `teatralia/services/api/src/routes/public.ts` y `teatralia/services/api/src/orders/service.ts`.
- Comprobador del curso: `scripts/m04-comprobar-openapi.mjs` (lo ves por dentro en el paso 5).
- Vista **Chat** de Copilot (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>).

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| El partner crea un pedido, lo paga y consulta las entradas | `POST /api/public/orders`, `POST /api/public/orders/{id}/pay`, `GET /api/public/orders/{id}?email=` |
| Cada promotor es una tienda distinta | Cabecera `x-teatralia-tenant-slug` (aquí, `sala-faro`) |
| El partner programa contra el contrato publicado | `teatralia/docs/api-pedidos.openapi.json` |
| Alguien comprueba que el contrato y el servidor coinciden | El comprobador hace una compra real y compara campo a campo |

### 1 — Lee la petición y localiza las rutas

```bash
cd teatralia
# La incidencia
cat docs/backlog/TEA-112-documentar-api.md
# Las rutas públicas de la API
grep -n "app\.\(get\|post\)" services/api/src/routes/public.ts
```

**Resultado esperado:**

```text
---
titulo: "Documentar la API de pedidos"
etiquetas: [documentación]
---
Un partner quiere integrarse. No hay especificación OpenAPI ni README de la API.
15:  app.get('/api/public/tenants', async () => {
24:  app.get('/api/public/site', async (req) => {
34:  app.get<{ Params: { id: string } }>('/api/public/events/:id', async (req) => {
57:  app.get<{ Params: { id: string } }>('/api/public/events/:id/seats', async (req) => {
74:  app.post<{ Body: { event_id: string; buyer_email: string; items: CartItem[] } }>(
90:  app.post<{ Params: { id: string }; Body: { card: string } }>('/api/public/orders/:id/pay', async (req) => {
95:  app.get<{ Params: { id: string }; Querystring: { email?: string } }>('/api/public/orders/:id', async (req) => {
```

Las tres últimas son las de pedidos. Las rutas solo dicen qué reciben; lo que **devuelven** lo construyen `createOrder`, `payOrder` y `getBuyerOrder` en `service.ts`.

### 2 — Mira las respuestas reales antes de documentar

La fuente de verdad de una especificación es lo que el servidor devuelve. Haz una compra completa en Sala Faro: butaca H-7 y un pase «De pie» de *Jazz en el Faro*.

```bash
H='x-teatralia-tenant-slug: sala-faro'
# 1. Crear el pedido
curl -s -X POST localhost:3000/api/public/orders -H "$H" -H 'content-type: application/json' \
  -d '{"event_id":"EV-FARO-0042","buyer_email":"Marta.Partner@ejemplo.test","items":[{"seat_id":"H-7"},{"pass_type_id":"EV-FARO-0042-PIE","quantity":1}]}' | jq .
```

**Resultado esperado** (el número de pedido depende de los pedidos creados desde el `make reset`):

```json
{
  "id": "PED-2026-2468",
  "status": "pending",
  "subtotal_cents": 5350,
  "fee_cents": 180,
  "total_cents": 5530,
  "commission_cents": 401,
  "lines": [
    {
      "price_cents": 3550,
      "fee_cents": 90,
      "commission_cents": 266
    },
    {
      "price_cents": 1800,
      "fee_cents": 90,
      "commission_cents": 135
    }
  ],
  "hold_minutes": 10
}
```

```bash
# 2. Pagarlo y 3. consultarlo con el email del comprador (en minúsculas: así lo guarda la API)
curl -s -X POST localhost:3000/api/public/orders/PED-2026-2468/pay -H "$H" -H 'content-type: application/json' -d '{"card":"4242 4242 4242 4242"}' | jq -c .
curl -s "localhost:3000/api/public/orders/PED-2026-2468?email=marta.partner@ejemplo.test" -H "$H" | jq .
```

**Resultado esperado** (cambian `charge_id`, `paid_at` y los `qr_token`):

```json
{"id":"PED-2026-2468","status":"paid","charge_id":"ch_8af1640fff0df51e"}
{
  "id": "PED-2026-2468",
  "status": "paid",
  "buyer_email": "marta.partner@ejemplo.test",
  "subtotal_cents": 5350,
  "fee_cents": 180,
  "total_cents": 5530,
  "paid_at": "2026-11-24T03:29:57.218Z",
  "event_id": "EV-FARO-0042",
  "event_title": "Jazz en el Faro",
  "venue": "Sala Faro, A Coruña",
  "starts_at": "2026-12-12T20:00:00.000Z",
  "tickets": [
    {
      "id": "PED-2026-2468-1",
      "kind": "seat",
      "seat_id": "H-7",
      "status": "valid",
      "price_cents": 3550,
      "fee_cents": 90,
      "qr_token": "PED-2026-2468-1.JHEF3Je7r0I8oJvHNf15Dd",
      "pass_name": null
    },
    {
      "id": "PED-2026-2468-2",
      "kind": "pass",
      "seat_id": null,
      "status": "valid",
      "price_cents": 1800,
      "fee_cents": 90,
      "qr_token": "PED-2026-2468-2.zs2vCggFusagrJZhAPzCRA",
      "pass_name": "De pie"
    }
  ]
}
```

Y los errores, que un partner también necesita conocer:

```bash
# Pagar dos veces, consultar con otro email, una butaca ocupada, un email inválido y una tarjeta rechazada
curl -s -X POST localhost:3000/api/public/orders/PED-2026-2468/pay -H "$H" -H 'content-type: application/json' -d '{"card":"4242 4242 4242 4242"}' -w ' HTTP %{http_code}\n'
curl -s "localhost:3000/api/public/orders/PED-2026-2468?email=otra@ejemplo.test" -H "$H" -w ' HTTP %{http_code}\n'
curl -s -X POST localhost:3000/api/public/orders -H "$H" -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"x@ejemplo.test","items":[{"seat_id":"H-7"}]}' -w ' HTTP %{http_code}\n'
curl -s -X POST localhost:3000/api/public/orders -H "$H" -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"no-es-un-email","items":[{"seat_id":"A-2"}]}' -w ' HTTP %{http_code}\n'
```

**Resultado esperado:**

```text
{"error":"el pedido está paid"} HTTP 409
{"error":"no hay ningún pedido con ese número y ese email"} HTTP 404
{"error":"la butaca H-7 ya no está libre"} HTTP 409
{"error":"email del comprador no válido"} HTTP 400
```

Con la tarjeta `4000 0000 0000 0002` el pago responde `{"error":"pago rechazado: fondos insuficientes"}` con HTTP 402. Ya sabes qué tiene que decir la especificación.

### 3 — Genera la especificación con Copilot

Conversación nueva en modo **Agent**:

```text
#file:teatralia/services/api/src/routes/public.ts
#file:teatralia/services/api/src/orders/service.ts
#file:teatralia/services/api/src/server.ts

Crea teatralia/docs/api-pedidos.openapi.json: una especificación OpenAPI 3.1 en JSON de las tres
operaciones de pedidos de la API pública (crear, pagar y consultar). Incluye la cabecera obligatoria
x-teatralia-tenant-slug, el cuerpo de cada petición, el esquema de cada respuesta con exactamente
los campos que devuelve el código (mira los SELECT y los return de service.ts) y todos los códigos
de error que puede devolver cada operación, con el esquema {"error": string}. Importes en céntimos.
Usa components/schemas y $ref. No inventes campos.
```

**Qué debe contener la respuesta** (el fichero varía en cada ejecución):

- un fichero `docs/api-pedidos.openapi.json` con `"openapi": "3.1.0"` y las tres rutas;
- respuestas `201` (crear), `200` (pagar y consultar) y errores 400, 402, 404 y 409 repartidos según el paso 2;
- esquemas con `$ref` a `components/schemas`.

Comprueba que es JSON válido y qué operaciones documenta:

```bash
# JSON válido y lista de operaciones documentadas
jq . docs/api-pedidos.openapi.json > /dev/null && echo "JSON válido"
jq -r '.paths | to_entries[] | .key as $p | .value | keys[] | "\(.|ascii_upcase) \($p)"' docs/api-pedidos.openapi.json
```

**Resultado esperado:**

```text
JSON válido
POST /api/public/orders
POST /api/public/orders/{id}/pay
GET /api/public/orders/{id}
```

### 4 — Lee la especificación con ojos de partner

Antes de comprobarla, ábrela en el editor y busca los errores típicos de una especificación generada:

| Busca | Por qué |
|-------|---------|
| Campos que no viste en el paso 2 (`currency`, `created_at`, `customer`…) | Copilot completa con lo que «suele» tener una API de pedidos |
| Campos del paso 2 que faltan (`hold_minutes`, `commission_cents`, `pass_name`) | Los que no son obvios se olvidan |
| El `409` de pagar dos veces, el `402` de tarjeta rechazada | Los errores de negocio se documentan menos que los técnicos |
| La cabecera `x-teatralia-tenant-slug` | Sin ella, todas las llamadas dan 404 |

Leer ayuda, pero no escala: el paso siguiente lo comprueba la máquina.

### 5 — Compruébala contra el servidor

El comprobador del curso hace una compra real en Sala Faro (crear, pagar, consultar y tres errores) y, para cada respuesta, mira si el código HTTP está documentado y si los campos coinciden con el esquema.

```bash
# Desde la raíz del repositorio
cd ..
node scripts/m04-comprobar-openapi.mjs teatralia/docs/api-pedidos.openapi.json
```

<details>
<summary>Qué hace por dentro (<code>scripts/m04-comprobar-openapi.mjs</code>)</summary>

```js
// Sigue los $ref internos (#/components/schemas/…, #/components/responses/…)
function resolve(schema) {
  if (schema?.$ref) return resolve(schema.$ref.slice(2).split('/').reduce((o, k) => o?.[k], spec));
  return schema;
}

// Para cada llamada real: ¿está la operación?, ¿está documentado este código HTTP?,
// ¿coinciden los campos de la respuesta con las propiedades del esquema?
function check(name, specPathKey, method, res) {
  const op = spec.paths?.[specPathKey]?.[method];
  const doc = resolve(op.responses?.[String(res.status)]);
  const expected = documentedKeys(doc.content?.['application/json']?.schema);
  compare(name, line, expected, Object.keys(res.json));   // sobran / faltan
}

// La compra: primera butaca libre de EV-FARO-0042, pago con 4242…, consulta,
// pagar dos veces (409), consultar con otro email (404) y butaca ocupada (409)
const created = await call('POST', '/api/public/orders', { event_id: EVENT, buyer_email: email, items: [{ seat_id: seat.id }] });
check('crear pedido', '/api/public/orders', 'post', created);
```

Termina con código 1 si encuentra alguna diferencia. La API por defecto es `http://localhost:3000`; otra, con `API=…`.

</details>

**Resultado esperado:** depende de lo que haya generado Copilot. Como ejemplo, con una especificación que tiene tres errores típicos (no documenta `commission_cents`, inventa un campo `currency` en el pedido y olvida el 409 de pagar dos veces) la salida es:

```text
✗ crear pedido: POST /api/public/orders → 201 — el servidor devuelve y no está documentado: commission_cents
✓ pagar: POST /api/public/orders/{id}/pay → 200 — 3 campos, coinciden
✗ consultar: GET /api/public/orders/{id} → 200 — documentado y el servidor no lo devuelve: currency
✓ cada entrada: GET /api/public/orders/{id} → tickets[] — 8 campos, coinciden
✗ pagar dos veces: POST /api/public/orders/{id}/pay → 409 — código 409 no documentado (documentados: 200, 402, 404)
✓ consultar con otro email: GET /api/public/orders/{id} → 404 — 1 campos, coinciden
✓ butaca ocupada: POST /api/public/orders → 409 — 1 campos, coinciden

3 diferencia(s) entre la especificación y el servidor
```

| Línea | Qué significa para el partner |
|-------|-------------------------------|
| `devuelve y no está documentado` | Recibe un campo que no sabe qué es |
| `documentado y el servidor no lo devuelve` | Programa contra un campo que nunca llega |
| `código 409 no documentado` | No sabe tratar un error que va a recibir |

### 6 — Corrige con la salida del comprobador

Pega la salida en el mismo chat del paso 3:

```text
#terminalLastCommand

Corrige docs/api-pedidos.openapi.json para que el comprobador no encuentre diferencias. La fuente de
verdad es el servidor: añade lo que devuelve y no está documentado y quita lo que no devuelve.
No cambies código de la API.
```

> [!NOTE]
> `#terminalLastCommand` adjunta el último comando de la terminal y su salida. Si no aparece al escribir `#`, selecciona la salida y usa `#terminalSelection`, o pégala.

Repite el comprobador hasta que no haya diferencias:

```bash
node scripts/m04-comprobar-openapi.mjs teatralia/docs/api-pedidos.openapi.json
```

**Resultado esperado** (con la solución de referencia):

```text
✓ crear pedido: POST /api/public/orders → 201 — 8 campos, coinciden
✓ pagar: POST /api/public/orders/{id}/pay → 200 — 3 campos, coinciden
✓ consultar: GET /api/public/orders/{id} → 200 — 12 campos, coinciden
✓ cada entrada: GET /api/public/orders/{id} → tickets[] — 8 campos, coinciden
✓ pagar dos veces: POST /api/public/orders/{id}/pay → 409 — 1 campos, coinciden
✓ consultar con otro email: GET /api/public/orders/{id} → 404 — 1 campos, coinciden
✓ butaca ocupada: POST /api/public/orders → 409 — 1 campos, coinciden

La especificación coincide con el servidor
```

<details>
<summary>Solución de referencia: <code>teatralia/docs/api-pedidos.openapi.json</code> (esquemas)</summary>

Las tres rutas usan `$ref` a estos esquemas; los errores, a `#/components/responses/Error` (`{"error": string}`). Crear documenta 201, 400, 404 y 409; pagar, 200, 402, 404 y 409; consultar, 200 y 404.

```json
"PedidoCreado": {
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "status": { "type": "string", "enum": ["pending"] },
    "subtotal_cents": { "type": "integer" },
    "fee_cents": { "type": "integer" },
    "total_cents": { "type": "integer" },
    "commission_cents": { "type": "integer", "description": "Comisión de Teatralia (la paga el promotor, no el comprador)" },
    "lines": { "type": "array", "items": { "$ref": "#/components/schemas/Linea" } },
    "hold_minutes": { "type": "integer" }
  }
},
"PedidoPagado": {
  "type": "object",
  "properties": { "id": { "type": "string" }, "status": { "type": "string", "enum": ["paid"] }, "charge_id": { "type": "string" } }
},
"Entrada": {
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "kind": { "type": "string", "enum": ["seat", "pass"] },
    "seat_id": { "type": ["string", "null"] },
    "status": { "type": "string", "enum": ["pending", "valid", "void", "refunded"] },
    "price_cents": { "type": "integer" },
    "fee_cents": { "type": "integer" },
    "qr_token": { "type": ["string", "null"], "description": "Solo si la entrada es válida" },
    "pass_name": { "type": ["string", "null"] }
  }
},
"Pedido": {
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "status": { "type": "string", "enum": ["pending", "paid", "failed", "refunded", "partially_refunded"] },
    "buyer_email": { "type": "string" },
    "subtotal_cents": { "type": "integer" },
    "fee_cents": { "type": "integer" },
    "total_cents": { "type": "integer" },
    "paid_at": { "type": ["string", "null"], "format": "date-time" },
    "event_id": { "type": "string" },
    "event_title": { "type": "string" },
    "venue": { "type": "string" },
    "starts_at": { "type": "string", "format": "date-time" },
    "tickets": { "type": "array", "items": { "$ref": "#/components/schemas/Entrada" } }
  }
}
```

</details>

### 7 — Escribe el README de la API y prueba sus ejemplos

La especificación es para máquinas; el partner empieza por un README. Pide a Copilot `teatralia/docs/api-pedidos.md` con el flujo de compra en tres llamadas `curl`, la tabla de errores y una nota sobre importes en céntimos, **usando como ejemplos los comandos y respuestas del paso 2** (están en tu terminal). Después, ejecuta cada `curl` del README tal cual y compara con lo que dice: un ejemplo de documentación que no funciona es peor que ninguno.

<details>
<summary>Solución de referencia: <code>teatralia/docs/api-pedidos.md</code> (extracto)</summary>

````markdown
# API pública de pedidos

Compra de entradas en la tienda de un promotor. Importes en **céntimos** de euro.
Todas las llamadas llevan la cabecera `x-teatralia-tenant-slug` con el promotor (p. ej. `sala-faro`).
Especificación completa: [api-pedidos.openapi.json](api-pedidos.openapi.json).

## Comprar en tres llamadas

1. Crear el pedido: bloquea las butacas o pases `hold_minutes` minutos (máximo 10 entradas).

   ```bash
   curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' \
     -H 'content-type: application/json' \
     -d '{"event_id":"EV-FARO-0042","buyer_email":"ana@ejemplo.test","items":[{"seat_id":"H-7"}]}'
   ```

2. Pagar: `POST /api/public/orders/{id}/pay` con `{"card": "4242 4242 4242 4242"}` (tarjeta de pruebas).
3. Consultar: `GET /api/public/orders/{id}?email=…` con el email del comprador en minúsculas.

## Errores

| Código | Cuándo | Ejemplo |
|--------|--------|---------|
| 400 | Datos no válidos | `{"error":"email del comprador no válido"}` |
| 402 | Tarjeta rechazada | `{"error":"pago rechazado: fondos insuficientes"}` |
| 404 | Promotor, evento o pedido inexistente, o email que no coincide | `{"error":"no hay ningún pedido con ese número y ese email"}` |
| 409 | Butaca ocupada, pases agotados o pedido ya pagado | `{"error":"la butaca H-7 ya no está libre"}` |
````

</details>

## Comprueba tu entendimiento

**Un campo inventado**
Añade a mano en el esquema del pedido creado una propiedad `"currency": { "type": "string" }` y ejecuta el comprobador.
→ `✗ crear pedido: … — documentado y el servidor no lo devuelve: currency` y código de salida 1. Quítala.

**Por qué no basta con leer el código**
Explica con el paso 2 de dónde salen `event_title` y `venue` en la consulta de un pedido.
→ Del `JOIN` con `events` en el `SELECT` de `getBuyerOrder`: no están en la tabla `orders`, y una especificación hecha mirando solo el esquema de la base de datos los olvidaría.

## Investiga

La especificación de referencia documenta `commission_cents` en la respuesta de crear pedido, con la descripción «la paga el promotor, no el comprador». Pregúntate si un **comprador** (o un partner) debería ver lo que Teatralia cobra al promotor. Busca si la tienda lo usa:

```bash
# ¿Usa la tienda o sus componentes la comisión?
grep -rn "commission" teatralia/apps teatralia/packages --include=*.ts --include=*.tsx | wc -l
```

**Resultado esperado:**

```text
0
```

Ningún frontal la usa: la API pública expone un dato comercial del promotor que nadie necesita. Documentar es también la forma más rápida de ver lo que una API enseña de más. Lo correcto no es esconderlo en la especificación, sino abrir una incidencia para quitarlo de la respuesta (y actualizar la especificación cuando se quite).

## Reto

### 1 — Sin la cabecera del promotor

**La situación:** el partner hace su primera prueba sin la cabecera `x-teatralia-tenant-slug` y recibe un 404 que no está en la documentación. Pregunta si es un fallo vuestro.

**Qué haces:** reproduce la llamada sin cabecera, decide cómo debe documentarse (código, mensaje y en qué operaciones) y añádelo a la especificación y a la tabla de errores del README.

```bash
# Crear un pedido sin decir de qué promotor
curl -s -X POST localhost:3000/api/public/orders -H 'content-type: application/json' \
  -d '{"event_id":"EV-FARO-0042","buyer_email":"a@ejemplo.test","items":[{"seat_id":"A-5"}]}' -w ' HTTP %{http_code}\n'
```

**Pistas:** mira `tenantOf` al principio de `public.ts`: se llama en todas las rutas públicas. El comprobador del curso no prueba este caso; la comprobación es tu `curl`.

**Lo que buscas:** la respuesta exacta documentada como 404 en las tres operaciones y en el README, y el comprobador todavía sin diferencias.

<details>
<summary>Ver solución</summary>

```text
{"error":"no hay ningún promotor en este dominio"} HTTP 404
```

No es un fallo: la API identifica al promotor por la cabecera o por el dominio, y sin ninguno de los dos no sabe en qué tienda comprar. En la especificación, el 404 de las tres operaciones ya apunta a `#/components/responses/Error`; basta con ampliar su descripción («promotor no indicado o inexistente, evento o pedido no encontrado») y marcar la cabecera como `required: true`. En el README, una línea en la tabla de errores y una frase al principio: «todas las llamadas llevan la cabecera». El comprobador sigue en verde porque el esquema del error no cambia. **La regla:** lo primero que se equivoca un integrador es la autenticación o la identificación; documenta su error con el mensaje literal.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `No hay butacas libres en EV-FARO-0042` en el comprobador | Ejecutado muchas veces o API parada | `make up`; si persiste, `CONFIRM=1 make reset` |
| `SyntaxError: … in JSON` al ejecutar el comprobador | Copilot escribió YAML o JSON con comentarios | Pide «JSON estricto, sin comentarios» o corrígelo; `jq .` dice la línea |
| `la operación no está en la especificación` | Ruta escrita con `:id` en vez de `{id}` | En OpenAPI los parámetros de ruta van entre llaves |
| La consulta devuelve 404 con el email correcto | Email con mayúsculas: la API lo guarda en minúsculas | Consulta con el email en minúsculas |
| Un ejemplo del README falla | Copilot escribió el ejemplo sin ejecutarlo | Sustitúyelo por el comando y la respuesta reales del paso 2 |

## Conclusiones

### Qué es documentación técnica generada y verificada

Una especificación (OpenAPI) y un README escritos con ayuda de Copilot a partir del código, y **comprobados contra el servidor**: cada operación, cada código de respuesta y cada campo, con una llamada real.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Cada campo sale de una respuesta real | 8 campos al crear, 3 al pagar, 12 al consultar, 8 por entrada |
| Documenta los errores de negocio | 400, 402, 404 y 409, con `{"error": …}` |
| Se comprueba automáticamente | `m04-comprobar-openapi.mjs`, código de salida 0 |
| Los ejemplos del README se ejecutan | Los `curl` del paso 2 |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Campo inventado | `documentado y el servidor no lo devuelve: currency` | El partner programa contra algo que no llega |
| Campo olvidado | `devuelve y no está documentado: commission_cents` | Datos sin explicar (y una fuga que nadie ve) |
| Error sin documentar | `código 409 no documentado` | Integraciones que no tratan casos normales |
| Ejemplo sin ejecutar | Comparando el README con el paso 2 | Documentación que falla a la primera |

### Cómo se perfecciona

- Generar desde el código **y** desde las respuestas reales, y comprobar con una llamada por operación.
- Ejecutar el comprobador en integración continua: si alguien cambia una respuesta sin tocar la especificación, falla.
- Revisar lo que se documenta como revisión de diseño: documentar es ver lo que la API enseña.

### En una frase

> 🔑 Una especificación generada solo vale cuando una llamada real al servidor confirma cada campo y cada código que dice.
