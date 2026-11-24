# Laboratorio: trazabilidad requisito, código y prueba

[← Página anterior](07-lab-revisar-un-diff.md) · [Siguiente página →](../M04-calidad-pruebas-y-documentacion/README.md)

Los códigos de descuento (issue **TEA-104**) están implementados en la rama `feature/tea-104`: especificación con 11
criterios de aceptación, migración, API, pantalla del backoffice y tests en verde. Antes del merge, el responsable de
producto pregunta: «¿qué criterio está probado y cuál no?». En este laboratorio construyes con Copilot una **matriz de
trazabilidad** criterio → código → test, verificas cada celda contra el repositorio y la API, y sacas los huecos.

### Objetivo

Comprender qué es la trazabilidad entre requisito, desarrollo y prueba: cómo se construye la matriz, cómo debe ser
(cada celda con una referencia que se puede abrir o ejecutar), cómo se detectan los huecos (criterios sin test, código
sin criterio, requisitos sin criterio) y cómo se cierran.

### Punto de partida

- Codespace del fork, terminal en la raíz del repositorio, en la rama principal (`main`) y sin cambios.
- Estado limpio, la rama con TEA-104 creada y la plataforma arrancada (la última orden en otra terminal, que dejas
  abierta; al arrancar aplica la migración 003):

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
# Crea la rama feature/tea-104 con la implementación completa y se cambia a ella
scripts/m03-rama-descuentos.sh
# API en 3000 con el código de la rama
make up
```

**Resultado esperado** del script (el hash cambia en cada ejecución):

```text
Rama feature/tea-104 creada desde main con 1 commit:
746faf2 TEA-104: códigos de descuento por promotor
 teatralia/apps/backoffice/src/discounts.tsx        | 72 ++++++++++++++++++++++
 teatralia/apps/backoffice/src/main.tsx             |  4 ++
 .../docs/specs/TEA-104-codigos-de-descuento.md     | 39 ++++++++++++
 .../api/migrations/003_codigos_descuento.sql       | 21 +++++++
 teatralia/services/api/src/orders/discounts.ts     | 41 ++++++++++++
 teatralia/services/api/src/orders/service.ts       | 21 +++++--
 teatralia/services/api/src/routes/admin.ts         | 46 ++++++++++++++
 teatralia/services/api/src/routes/public.ts        |  3 +-
 teatralia/services/api/test/discounts.test.ts      | 30 +++++++++
 9 files changed, 272 insertions(+), 5 deletions(-)

Ahora estás en feature/tea-104. La migración 003 se aplica al arrancar la API (make up) o con: make db-reset
```

<details>
<summary>Qué hace por dentro (<code>scripts/m03-rama-descuentos.sh</code>)</summary>

```bash
rama=feature/tea-104
# No pisa tu trabajo: sale si hay cambios en teatralia/ o si la rama ya existe
[ -n "$(git status --porcelain -- teatralia)" ] && exit 1
git show-ref --verify --quiet "refs/heads/$rama" && exit 1
git switch -q -c "$rama"
git apply --index <<'PATCH'     # especificación, migración, API, backoffice y tests (incluidos en el script)
…
PATCH
git -c user.name="Compañero de Plataforma" … commit -q -m "TEA-104: códigos de descuento por promotor" …
```

</details>

- Copilot Chat: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>, modo **Ask**.

### Qué está pasando

Trazar es poder seguir el hilo en las dos direcciones: de un criterio de aceptación al código que lo implementa y al
test que lo demuestra, y de una línea de código al criterio que la justifica. Con la matriz delante, tres tipos de
hueco saltan a la vista: **criterio sin test** (nadie demuestra que funciona), **criterio sin código** (se aprobó y
nadie lo hizo) y **requisito sin criterio** (el issue lo pedía y la especificación lo perdió).

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Los criterios aprobados | `teatralia/docs/specs/TEA-104-codigos-de-descuento.md` (CA-01…CA-11) |
| La implementación | `orders/discounts.ts`, `orders/service.ts`, `routes/admin.ts`, `routes/public.ts`, backoffice |
| Las pruebas automáticas | `services/api/test/discounts.test.ts` |
| La prueba manual | `curl` contra la API |
| La matriz | Tabla Markdown en `teatralia/docs/specs/TEA-104-trazabilidad.md` |

### 1 — Lista los criterios

La fuente es la especificación. Saca solo las líneas de criterio:

```bash
# Los criterios de aceptación, con su número de línea
grep -n "^- CA-" teatralia/docs/specs/TEA-104-codigos-de-descuento.md
```

**Resultado esperado:**

```text
20:- CA-01 (R2, R6) **Porcentaje.** Dado el código `NAVIDAD10` (10 %) de Sala Faro, cuando el comprador paga el carrito
22:- CA-02 (R2) **Importe fijo.** Dado `FARO5` (500 céntimos), con el mismo carrito, el descuento es 500 y el total 12870.
23:- CA-03 (R6, R7) **Gastos intactos.** Dado `FARO30` (3000 céntimos) y un pase «De pie» de 1800, el descuento es 1800 y
25:- CA-04 (R8) **Redondeo.** Con un 15 % sobre un subtotal de 3650, el descuento es 548.
26:- CA-05 (R4) **Caducado.** Dado un código caducado, el pedido se rechaza con «el código de descuento ha caducado» y no se crea.
27:- CA-06 (R4) **Sin usos.** Dado un código con 2 usos máximos ya consumidos, el tercer pedido se rechaza con
29:- CA-07 (R3) **Otro evento.** Dado un código limitado a EV-FARO-0042, un pedido de EV-FARO-0047 se rechaza.
30:- CA-08 (R1) **Otro promotor.** El código de Sala Faro en un pedido del Teatro Lumen se rechaza con «código de descuento no válido».
31:- CA-09 (R5) **Sin acumular.** Un pedido no admite dos códigos.
32:- CA-10 (R9) **Mayúsculas.** `navidad10` y ` NAVIDAD10 ` aplican el mismo código.
33:- CA-11 (R1–R4) **Alta en el backoffice.** El promotor crea un código en **Descuentos** y lo ve en la lista con sus usos (0 / N).
```

**Cómo se lee:** 11 criterios, cada uno con las reglas que prueba entre paréntesis. Son las filas de la matriz.

### 2 — Lista los tests que existen de verdad

Los nombres de los tests son la otra mitad. Pídeselos a vitest, no a Copilot:

```bash
# Tests de descuentos, uno por línea con su nombre
cd teatralia && npx vitest run services/api/test/discounts.test.ts --reporter verbose; cd ..
```

**Resultado esperado** (los milisegundos varían):

```text
 ✓ |api| test/discounts.test.ts > calcDiscount > un 10 % se calcula sobre el subtotal de las entradas 1ms
 ✓ |api| test/discounts.test.ts > calcDiscount > un importe fijo se descuenta tal cual, en céntimos 0ms
 ✓ |api| test/discounts.test.ts > calcDiscount > el porcentaje se redondea al céntimo más cercano 0ms
 ✓ |api| test/discounts.test.ts > calcDiscount > un importe fijo mayor que el subtotal deja las entradas a cero, no en negativo 0ms
 ✓ |api| test/discounts.test.ts > normalizeCode > ignora mayúsculas y espacios 0ms
      Tests  5 passed (5)
```

**Cómo se lee:** cinco tests, todos de funciones puras (`calcDiscount`, `normalizeCode`). Ninguno crea un pedido ni
llama a la API. Ya sabes que como mucho cinco criterios tendrán test, y solo en su parte de cálculo.

### 3 — Pide a Copilot la matriz

Chat nuevo, modo **Ask**, con la especificación y el código adjuntos:

```text
#file:teatralia/docs/specs/TEA-104-codigos-de-descuento.md #file:teatralia/services/api/src/orders/discounts.ts
#file:teatralia/services/api/src/orders/service.ts #file:teatralia/services/api/src/routes/admin.ts
#file:teatralia/services/api/src/routes/public.ts #file:teatralia/services/api/test/discounts.test.ts
Construye una matriz de trazabilidad en Markdown con una fila por criterio CA-01…CA-11 y columnas:
criterio | código (fichero:línea) | test (nombre exacto del it(...) o "—") | estado (cubierto / parcial / sin test / sin código).
"Parcial" = el test prueba el cálculo pero no el flujo del pedido. No inventes tests: si no hay un it() que lo pruebe, "—".
Después lista: requisitos del issue TEA-104 que no tienen ningún criterio.
```

**Qué debe contener la respuesta** (varía en cada ejecución): CA-01, CA-02, CA-04, CA-10 con test; CA-03 con el test
del tope (*no en negativo*); CA-05 a CA-09 y CA-11 sin test. Comprueba sobre todo dos cosas: que cada nombre de test
existe **literalmente** en la salida del paso 2 (Copilot a veces inventa «debería rechazar códigos caducados») y que
cada `fichero:línea` existe. Copia la tabla a `teatralia/docs/specs/TEA-104-trazabilidad.md`.

### 4 — Verifica la columna de código

Las líneas que implementan las reglas, sacadas del repositorio:

```bash
# Reglas y errores en discounts.ts, aplicación en service.ts, rutas y 409 en admin.ts, unicidad en la migración
grep -n "Math.min\|Math.round\|toUpperCase\|HttpError(400" teatralia/services/api/src/orders/discounts.ts
grep -n "calcDiscount(amounts\|const total = amounts" teatralia/services/api/src/orders/service.ts
grep -n "discount-codes\|23505" teatralia/services/api/src/routes/admin.ts
grep -n "UNIQUE\|discount_code_id" teatralia/services/api/migrations/003_codigos_descuento.sql
```

**Resultado esperado:**

```text
18:export const normalizeCode = (code: string) => code.trim().toUpperCase();
23:  const raw = rule.kind === 'percent' ? Math.round((subtotalCents * rule.value) / 100) : rule.value;
24:  return Math.min(raw, subtotalCents);
35:  if (!dc) throw new HttpError(400, 'código de descuento no válido');
36:  if (dc.event_id && dc.event_id !== eventId) throw new HttpError(400, 'el código no es válido para este evento');
37:  if (new Date(dc.expires_at) < new Date()) throw new HttpError(400, 'el código de descuento ha caducado');
38:  if (dc.used >= dc.max_uses) throw new HttpError(400, 'el código de descuento ya no tiene usos');
95:      discount = calcDiscount(amounts.subtotal_cents, dc);
97:    const total = amounts.total_cents - discount;
35:      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'ese slug ya existe');
58:      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'ese dominio ya está en uso');
215:  app.get('/api/admin/discount-codes', async (req) => {
227:  }>('/api/admin/discount-codes', async (req, reply) => {
254:      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'ese código ya existe');
14:  UNIQUE (tenant_id, code),
20:  ADD COLUMN discount_code_id bigint REFERENCES discount_codes(id),
```

**Cómo se lee:** cada criterio de rechazo tiene su línea (`discounts.ts:35` a `38`); el promotor se filtra en la
consulta de `discounts.ts:31` (`WHERE tenant_id = $1 AND code = $2`). Busca en esta salida algo para CA-09 («sin
acumular»): solo hay una columna `discount_code_id` (migración, línea 20). Es una restricción de diseño, no una
comprobación: ¿qué pasa si alguien manda dos?

### 5 — Comprueba con la API los criterios sin test

Lo que no tiene test se comprueba a mano, una vez, y se deja escrito. Sala Faro crea tres códigos y se prueban CA-05,
CA-07, CA-03 y CA-09:

```bash
# Tres códigos de Sala Faro: caducado, limitado a un evento y fijo de 30 €
curl -s -X POST localhost:3000/api/admin/discount-codes -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"code":"CADUCADO","kind":"percent","value":10,"expires_at":"2026-01-01T00:00:00+01:00","max_uses":5}' | jq -c '{code, kind, value, event_id, max_uses}'
curl -s -X POST localhost:3000/api/admin/discount-codes -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"code":"SOLOJAZZ","kind":"percent","value":10,"event_id":"EV-FARO-0042","expires_at":"2026-12-31T23:59:00+01:00","max_uses":5}' | jq -c '{code, kind, value, event_id, max_uses}'
curl -s -X POST localhost:3000/api/admin/discount-codes -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"code":"FARO30","kind":"fixed","value":3000,"expires_at":"2026-12-31T23:59:00+01:00","max_uses":5}' | jq -c '{code, kind, value, event_id, max_uses}'
# CA-05: código caducado
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"prueba@ejemplo.test","items":[{"pass_type_id":"EV-FARO-0042-PIE","quantity":1}],"discount_code":"CADUCADO"}' | jq -c .
# CA-07: código de EV-FARO-0042 en EV-FARO-0047
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0047","buyer_email":"prueba@ejemplo.test","items":[{"seat_id":"A-1"}],"discount_code":"SOLOJAZZ"}' | jq -c .
# CA-03: 30 € de descuento sobre un pase de 18 €
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"prueba@ejemplo.test","items":[{"pass_type_id":"EV-FARO-0042-PIE","quantity":1}],"discount_code":"FARO30"}' | jq -c '{id, subtotal_cents, fee_cents, discount_cents, total_cents}'
# CA-09: dos códigos en el mismo pedido
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"prueba@ejemplo.test","items":[{"pass_type_id":"EV-FARO-0042-PIE","quantity":1}],"discount_code":["FARO30","SOLOJAZZ"]}' | jq -c .
```

**Resultado esperado:**

```text
{"code":"CADUCADO","kind":"percent","value":10,"event_id":null,"max_uses":5}
{"code":"SOLOJAZZ","kind":"percent","value":10,"event_id":"EV-FARO-0042","max_uses":5}
{"code":"FARO30","kind":"fixed","value":3000,"event_id":null,"max_uses":5}
{"error":"el código de descuento ha caducado"}
{"error":"el código no es válido para este evento"}
{"id":"PED-2026-2468","subtotal_cents":1800,"fee_cents":90,"discount_cents":1800,"total_cents":90}
{"error":"error interno"}
```

**Cómo se lee:** CA-05, CA-07 y CA-03 se cumplen en el flujo real (el pedido de 18 € queda en los 90 céntimos de
gastos). CA-09 **no**: mandar dos códigos tumba la API con un 500 (`input.discountCode?.trim` sobre una lista). El
criterio estaba en la especificación, el código lo daba por imposible y ningún test lo probaba: un hueco que solo
aparece al intentar trazarlo.

### 6 — Comprueba las preguntas abiertas que nadie trazó

La especificación terminaba con preguntas abiertas (P1 a P3) «no implementadas». Una pregunta abierta sin criterio es
una fila que falta en la matriz. Prueba P2 (devolución de un pedido con descuento) con el pedido del paso 5:

```bash
# Paga PED-2026-2468 (total 90) y pide su reembolso por cancelación del evento
curl -s -X POST localhost:3000/api/public/orders/PED-2026-2468/pay -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"card":"4242 4242 4242 4242"}' | jq -c '{id, status}'
curl -s -X POST localhost:3000/api/admin/orders/PED-2026-2468/refunds -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"reason":"cancelación"}'; echo
```

**Resultado esperado:**

```text
{"id":"PED-2026-2468","status":"paid"}
{"error":"error interno"}
```

**Cómo se lee:** en la terminal de `make up`, el error es `pasarela: HTTP 409`: `calcRefund` pide devolver 1890
(precio + gastos de la entrada) de un cargo de 90, y la pasarela lo rechaza. Si un evento con códigos se cancela, el
backoffice no podrá reembolsar esos pedidos. No es un fallo de la rama (estaba fuera de alcance), pero la matriz tiene
que mostrarlo como riesgo antes del merge.

### 7 — Busca requisitos del issue que se quedaron sin criterio

Vuelve al issue: «El comprador lo introduce **al pagar**». ¿Hay algo en la tienda?

```bash
# Rastro de descuentos en la tienda y en el componente de pago
grep -rn "discount" teatralia/packages/ui/src teatralia/apps/storefront/src
```

**Resultado esperado:** ninguna línea. La API acepta `discount_code`, pero ningún comprador puede escribirlo: el
requisito del issue no tiene criterio en la especificación ni código en la tienda.

<details>
<summary>Matriz de referencia</summary>

| Criterio | Código | Test | Comprobación manual | Estado |
|----------|--------|------|---------------------|--------|
| CA-01 Porcentaje | `discounts.ts:23`, `service.ts:95-97` | *un 10 % se calcula sobre el subtotal de las entradas* | — | Parcial (cálculo, no pedido) |
| CA-02 Importe fijo | `discounts.ts:23` | *un importe fijo se descuenta tal cual, en céntimos* | — | Parcial |
| CA-03 Gastos intactos | `discounts.ts:24`, `service.ts:97` | *un importe fijo mayor que el subtotal deja las entradas a cero…* | Paso 5: total 90 | Cubierto (test + curl) |
| CA-04 Redondeo | `discounts.ts:23` | *el porcentaje se redondea al céntimo más cercano* | — | Cubierto |
| CA-05 Caducado | `discounts.ts:37` | — | Paso 5 | Sin test |
| CA-06 Sin usos | `discounts.ts:38` | — | — | Sin test |
| CA-07 Otro evento | `discounts.ts:36` | — | Paso 5 | Sin test |
| CA-08 Otro promotor | `discounts.ts:31`, `:35` | — | — | Sin test |
| CA-09 Sin acumular | `003_codigos_descuento.sql:20` (una columna) | — | Paso 5: **error interno** | Hueco: falla |
| CA-10 Mayúsculas | `discounts.ts:18` | *ignora mayúsculas y espacios* | — | Parcial |
| CA-11 Alta en backoffice | `admin.ts:215`, `:227`, `discounts.tsx` | — | — | Sin test |
| P2 Devolución con descuento | — | — | Paso 6: **error interno** | Sin criterio, falla |
| Issue: «lo introduce al pagar» | — (tienda) | — | Paso 7: sin código | Requisito sin criterio |

</details>

## Comprueba tu entendimiento

**Del código al criterio**
Abre `teatralia/services/api/src/orders/discounts.ts` en la línea 38 y busca en la matriz qué criterio la justifica.
→ CA-06 (sin usos). Si una línea de lógica no tiene criterio, o sobra o falta un criterio.

**Un nombre de test que existe**
Elige un test de la columna «Test» de tu matriz y búscalo en la salida del paso 2.
→ Aparece literalmente; si no, Copilot lo ha inventado y la celda es «—».

## Investiga

¿Cuántos criterios de la matriz se podrían probar sin base de datos? Abre `discounts.ts` y separa lo que es una función
pura (`calcDiscount`, `normalizeCode`) de lo que necesita una consulta (`takeDiscountCode`). Después mira cómo prueba
Teatralia el resto de la API:

```bash
# Ficheros de test de la API
ls teatralia/services/api/test/
```

```text
discounts.test.ts
pricing.test.ts
qr.test.ts
```

Todos son de funciones puras: la API no tiene tests contra la base de datos. Por eso CA-05 a CA-09 y CA-11 no tienen
test: no hay dónde ponerlos sin antes montar esa red (es lo que trabaja el módulo M04). La matriz hace visible una
carencia del proyecto, no solo de esta rama.

## Experimenta

**Predice antes:** si alguien cambia `Math.round` por `Math.floor` en `calcDiscount`, ¿qué test falla? ¿Y si quita
`tenant_id = $1` de la consulta de `takeDiscountCode` (CA-08)?

Haz el primer cambio en `discounts.ts:23` y, tras cada cambio, ejecuta los tests y deshazlo. Después, el segundo:
cambia `WHERE tenant_id = $1 AND code = $2` por `WHERE code = $2 AND $1::text IS NOT NULL` en `discounts.ts:31`.

```bash
# Tests con el cambio hecho
make test
# Deshace el cambio en discounts.ts
git restore teatralia/services/api/src/orders/discounts.ts
```

Con el primer cambio, y después con el segundo:

```text
     × el porcentaje se redondea al céntimo más cercano 8ms
AssertionError: expected 547 to be 548 // Object.is equality
 Test Files  1 failed | 6 passed (7)
      Tests  1 failed | 25 passed (26)
```

(extracto de la salida de `make test`; los milisegundos varían)

```text
 Test Files  7 passed (7)
      Tests  26 passed (26)
```

El redondeo está protegido: un test falla y dice qué esperaba. La fuga entre promotores pasa con todo en verde. La
matriz ya lo decía: CA-08 «sin test». La regla: una celda vacía en la columna de tests es un cambio que puede romperse
sin que nadie se entere.

## Reto

### 1 — Cerrar el hueco de CA-09

**La situación:** el responsable de producto acepta hacer el merge si se cierra el único criterio que falla
(CA-09), y deja los demás huecos documentados en la PR. Un compañero propone «envolverlo en un try/catch».

**Qué haces:** en `routes/public.ts`, rechaza con un 400 en español cualquier `discount_code` que no sea un texto,
antes de crear el pedido. Repite el `curl` de CA-09 y el de CA-03 (que debe seguir funcionando) y actualiza la fila
de la matriz.

**Pistas:** `typeof body.discount_code !== 'string'`; `body.discount_code != null` deja pasar los pedidos sin código;
`HttpError(400, '…')` ya está importado en `public.ts`.

**Lo que buscas:** CA-09 devuelve un 400 con un mensaje claro y un pedido con un solo código (en minúsculas) sigue
aplicando el descuento.

<details>
<summary>Ver solución</summary>

```diff
--- a/teatralia/services/api/src/routes/public.ts
+++ b/teatralia/services/api/src/routes/public.ts
@@ -77,6 +77,10 @@ export async function publicRoutes(app: FastifyInstance) {
       const tenant = await tenantOf(req);
       const body = req.body ?? ({} as never);
       if (!Array.isArray(body.items)) throw new HttpError(400, 'faltan las entradas del pedido');
+      // CA-09: un pedido lleva como mucho un código
+      if (body.discount_code != null && typeof body.discount_code !== 'string') {
+        throw new HttpError(400, 'solo se admite un código de descuento por pedido');
+      }
       const order = await createOrder({
         tenantId: tenant.id,
         eventId: body.event_id,
```

Tras `CONFIRM=1 make reset` (en la rama `feature/tea-104` restaura la rama, sin tu cambio: vuelve a aplicarlo),
reinicia `make up`, crea `FARO30` como en el paso 5 y repite:

```bash
# CA-09 con dos códigos y CA-03/CA-10 con uno en minúsculas
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"prueba@ejemplo.test","items":[{"pass_type_id":"EV-FARO-0042-PIE","quantity":1}],"discount_code":["FARO30","SOLOJAZZ"]}'; echo
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"prueba@ejemplo.test","items":[{"pass_type_id":"EV-FARO-0042-PIE","quantity":1}],"discount_code":"faro30"}' | jq -c '{id, discount_cents, total_cents}'
```

```text
{"error":"solo se admite un código de descuento por pedido"}
{"id":"PED-2026-2468","discount_cents":1800,"total_cents":90}
```

La fila de CA-09 pasa a «Comprobación manual: 400» y «Estado: sin test», con la nota de que hace falta un test de
ruta. Un `try/catch` habría convertido el 500 en otro error genérico sin decir al comprador qué hizo mal. **La regla:**
un hueco de la matriz se cierra con el comportamiento que dice el criterio y una comprobación que lo demuestra, y la
fila se actualiza en el mismo commit.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `relation "discount_codes" does not exist` en la terminal de la API | `make up` se arrancó antes del script | <kbd>Ctrl</kbd>+<kbd>C</kbd> y vuelve a lanzar `make up` (aplica la 003) |
| El script dice «La rama feature/tea-104 ya existe» | Lo ejecutaste antes | `git switch main && git branch -D feature/tea-104` y repite |
| La matriz de Copilot cita tests que no están en el paso 2 | Copilot completa con nombres verosímiles | Cada celda «Test» se copia de la salida de `--reporter verbose` |
| `CONFIRM=1 make reset` borra la especificación | Estás en `main`: la especificación solo existe en `feature/tea-104` | `git switch feature/tea-104` |
| `{"error":"el evento ya ha empezado"}` | Haces el lab después del 12 de diciembre de 2026 | Usa `EV-FARO-0047` (enero de 2027) y su pase VIP |

Al terminar, vuelve a la rama principal:

```bash
# Deja la rama de descuentos y vuelve al punto de partida
git switch main
CONFIRM=1 make reset
```

## Conclusiones

### Qué es la trazabilidad

Es la relación verificable entre cada criterio de aceptación, el código que lo implementa y la prueba que lo demuestra.
Se expresa en una matriz donde cada celda es una referencia que se abre (`fichero:línea`) o se ejecuta (nombre de test,
`curl`). Su valor no está en la tabla llena, sino en las celdas vacías.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Una fila por criterio, más los requisitos sin criterio | CA-01…CA-11, P2 y «al pagar» |
| Código con `fichero:línea` comprobado | `discounts.ts:35-38`, `service.ts:95-97` |
| Tests con su nombre literal | Copiados de `vitest --reporter verbose` |
| Estado honesto | Cubierto / parcial / sin test / hueco |
| Lo no automatizado, comprobado y escrito | `curl` de CA-05, CA-07, CA-03, CA-09 |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Criterio que falla sin que nadie lo sepa | CA-09: error interno (paso 5) | Un 500 ante una petición mal formada |
| Pregunta abierta sin fila | P2: reembolso imposible (paso 6) | Cancelaciones bloqueadas en producción |
| Requisito del issue sin criterio | «Al pagar»: nada en la tienda (paso 7) | Función que el comprador no puede usar |
| Criterio crítico sin test | Experimenta: quitar el filtro de promotor, todo en verde | Fuga entre promotores sin alarma |
| Tests inventados en la matriz | Paso 3 frente al paso 2 | Falsa cobertura |

### Cómo se perfecciona

La matriz se guarda junto a la especificación y se actualiza en cada PR que toca la funcionalidad. Cada criterio sin
test se convierte en un test (cuando el proyecto tenga tests contra base de datos) o en una comprobación automatizada
en el workflow de CI. Un prompt file del equipo (`/trazabilidad`) fija las columnas y la regla de no inventar tests.

### En una frase

> 🔑 La matriz criterio → código → test vale por sus huecos: Copilot la rellena deprisa, y cada celda se verifica contra el repositorio y la API antes de creerla.
