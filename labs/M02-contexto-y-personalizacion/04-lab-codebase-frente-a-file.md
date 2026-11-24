# Laboratorio: #codebase frente a #file

[← Página anterior](03-lab-prompt-files.md) · [Siguiente página →](05-lab-con-y-sin-contexto.md)

Atención al cliente pregunta por el pedido `PED-2026-1463`: el comprador devolvió dos de sus tres entradas y quiere
saber por qué se le devolvieron 71,10 €. Para contestar hay que encontrar **dónde se calcula un reembolso parcial**
en Teatralia y qué estado queda en el pedido. En este laboratorio haces la misma pregunta a Copilot con tres
referencias de contexto distintas (un fichero equivocado, una búsqueda en todo el repositorio y una selección) y
compruebas cada respuesta contra el código y la base de datos.

### Objetivo

Comprender qué ve Copilot con cada referencia de contexto (`#file`, `#codebase`, selección): cómo funciona cada una,
cuándo conviene, cómo se detecta que una respuesta se ha quedado corta y cómo se elige la adecuada.

### Punto de partida

- Terminal en la raíz del repositorio y Teatralia en su estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- En otra terminal, la plataforma en marcha (hace falta para el apartado Experimenta):

```bash
# Arranca api, pagos, correo, tienda y backoffice; deja esta terminal abierta
make up
```

- Vista **Chat** de Copilot en modo **Ask** (solo responde, no edita). Token de **Sala Faro**: `faro-dev-token`.

### Qué está pasando

Un reembolso parcial cruza varias piezas de Teatralia: la pantalla del pedido en el backoffice, la ruta de la API,
la función que calcula el importe y la que actualiza el pedido. Copilot solo responde sobre lo que tiene delante, y
cada referencia le pone delante una cosa distinta:

| Referencia | Qué recibe Copilot | En este laboratorio |
|------------|--------------------|---------------------|
| `#file:ruta` | Ese fichero entero | `pricing.ts`, el que «suena» a importes |
| `#codebase` | Fragmentos que encuentra buscando en todo el repositorio | La búsqueda de dónde está el reembolso |
| Selección | Solo las líneas seleccionadas en el editor | La función `calcRefund` |

### 1 — Mira el pedido en crudo

Antes de preguntar, miras qué pasó: qué entradas se devolvieron, a qué precio y cuánto se devolvió.

```bash
# Entradas de PED-2026-1463 y su reembolso
psql "$DATABASE_URL" -c "SELECT id, price_cents, fee_cents, status FROM tickets WHERE order_id = 'PED-2026-1463' ORDER BY id" -c "SELECT id, reason, amount_cents, ticket_ids FROM refunds WHERE order_id = 'PED-2026-1463'"
```

**Resultado esperado:**

```text
       id        | price_cents | fee_cents |  status  
-----------------+-------------+-----------+----------
 PED-2026-1463-1 |        5500 |        90 | refunded
 PED-2026-1463-2 |        2400 |        90 | refunded
 PED-2026-1463-3 |        3550 |        90 | valid
(3 rows)

         id         |        reason        | amount_cents |            ticket_ids             
--------------------+----------------------+--------------+-----------------------------------
 RE-PED-2026-1463-1 | petición del cliente |         7110 | {PED-2026-1463-1,PED-2026-1463-2}
(1 row)
```

**Cómo se lee:** se devolvieron las entradas de 55,00 € y 24,00 € por **petición del cliente**; 79,00 € menos un 10 %
son 71,10 €, y los gastos (0,90 € por entrada) no se devolvieron. La tercera entrada sigue válida. La pregunta es
dónde está escrito eso.

### 2 — Pregunta con el fichero equivocado

Pruebas primero lo que haría alguien que no conoce el código: adjuntar el fichero cuyo nombre suena a importes.

1. Conversación nueva con **+**, modo **Ask**.
2. Envía:

```text
#file:teatralia/services/api/src/orders/pricing.ts
¿Dónde se calcula el importe de un reembolso parcial de un pedido y qué estado queda en el pedido?
Cita fichero, función y línea.
```

**Qué debe contener la respuesta** (varía en cada ejecución): lo correcto es que diga que **en `pricing.ts` no está**:
ese fichero calcula los importes de una compra (`calcOrderAmounts`), no de una devolución. Si en lugar de eso explica
un cálculo de reembolso «que podría hacerse» con `calcOrderAmounts`, se lo está inventando a partir del único fichero
que le has dado.

**La comprobación:** en `pricing.ts` no aparece ninguna devolución:

```bash
# Desde teatralia/: funciones e interfaces de pricing.ts; ninguna habla de reembolsos
cd teatralia
grep -n "refund\|export" services/api/src/orders/pricing.ts
```

```text
4:export interface PricedItem {
10:export interface EventPricing {
15:export interface TicketAmounts {
21:export interface OrderAmounts {
29:export function calcOrderAmounts(items: PricedItem[], ev: EventPricing): OrderAmounts {
```

### 3 — La misma pregunta con #codebase

Ahora dejas que Copilot busque en todo el repositorio.

1. Conversación nueva con **+**, modo **Ask**.
2. Envía:

```text
#codebase ¿Dónde se calcula el importe de un reembolso parcial de un pedido y qué estado queda en el pedido?
Cita fichero, función y línea, desde la pantalla del backoffice hasta la base de datos.
```

**Qué debe contener la respuesta:**

- `services/api/src/orders/refunds.ts`: `calcRefund` calcula el importe (penalización del 10 % para «petición del
  cliente») y `refundOrder` se queda solo con las entradas pedidas (`ticketIds`), lo registra y pone el pedido en
  `partially_refunded` si no se devuelven todas, o `refunded` si sí.
- `services/api/src/routes/admin.ts`: `POST /api/admin/orders/:id/refunds` llama a `refundOrder`.
- Con suerte, `apps/backoffice/src/operations.tsx`, que envía `reason` y `ticket_ids` desde el detalle del pedido.
- En las referencias, varios fragmentos de esos ficheros.

**La comprobación:** las líneas que tiene que citar, buscadas directamente:

```bash
# Dónde se calcula, cómo se filtran las entradas y qué estado se guarda
grep -n "calcRefund\|const selected\|const all\|partially_refunded\|refundOrder" services/api/src/orders/refunds.ts services/api/src/routes/admin.ts
```

```text
services/api/src/routes/admin.ts:6:import { refundOrder, type RefundReason } from '../orders/refunds.js';
services/api/src/routes/admin.ts:192:      const r = await refundOrder(t.id, req.params.id, req.body?.reason, req.body?.ticket_ids);
services/api/src/routes/admin.ts:204:                WHERE o.event_id = e.id AND o.status IN ('paid', 'partially_refunded', 'refunded'))::int AS gross_cents,
services/api/src/orders/refunds.ts:16:export function calcRefund(tickets: RefundableTicket[], reason: RefundReason): number {
services/api/src/orders/refunds.ts:34:export async function refundOrder(tenantId: string, orderId: string, reason: RefundReason, ticketIds?: string[]) {
services/api/src/orders/refunds.ts:44:  if (order.status !== 'paid' && order.status !== 'partially_refunded') {
services/api/src/orders/refunds.ts:56:  const selected = ticketIds?.length ? t.rows.filter((x) => ticketIds.includes(x.id)) : t.rows;
services/api/src/orders/refunds.ts:59:  const amount = calcRefund(selected, reason);
services/api/src/orders/refunds.ts:61:  const all = selected.length === t.rows.length;
services/api/src/orders/refunds.ts:73:      [orderId, amount, all ? 'refunded' : 'partially_refunded'],
```

**Cómo se lee:** compara las líneas que citó Copilot con estas. Si cita `refunds.ts` pero con otros números de línea,
lo ha entendido pero no lo ha leído con precisión: abre el fichero y compruébalo. La línea 204 de `admin.ts` es el
panel de ventas, que solo lee el estado: una búsqueda trae también fragmentos que no responden a la pregunta.

### 4 — Una pregunta sobre un cálculo: la selección

Para explicar el importe concreto no hace falta todo el repositorio: basta la función. La seleccionas y preguntas
sobre ella.

1. Abre `teatralia/services/api/src/orders/refunds.ts` y selecciona las líneas 16 a 30 (la función `calcRefund` entera).
2. Conversación nueva, modo **Ask** (con la selección hecha, el chat la adjunta como contexto).
3. Envía:

```text
Con esta función, calcula paso a paso el reembolso de dos entradas de 5500 y 2400 céntimos
(gastos 90 cada una) devueltas por "petición del cliente".
```

**Qué debe contener la respuesta:** `Math.floor(5500 × 0,9) = 4950`, `Math.floor(2400 × 0,9) = 2160`, total **7110**
céntimos, sin gastos. Es lo que se guardó en `RE-PED-2026-1463-1`.

**La comprobación:** la función real con esos datos:

```bash
# Ejecuta calcRefund con las dos entradas devueltas de PED-2026-1463
npx tsx -e "
import { calcRefund } from './services/api/src/orders/refunds.ts';
const devueltas = [
  { id: 'PED-2026-1463-1', price_cents: 5500, fee_cents: 90 },
  { id: 'PED-2026-1463-2', price_cents: 2400, fee_cents: 90 },
];
console.log(calcRefund(devueltas, 'petición del cliente'));
"
```

**Resultado esperado:**

```text
7110
```

**Cómo se lee:** Copilot, la función y la base de datos dicen lo mismo. La selección bastaba para esta pregunta, pero
no habría servido para la del paso 3: no ve ni la ruta ni el cambio de estado del pedido.

## Comprueba tu entendimiento

**Cada referencia, su pregunta**
Con `refunds.ts` adjunto (`#file:teatralia/services/api/src/orders/refunds.ts`), pregunta: «¿Desde qué pantalla del backoffice se lanza un reembolso?».
→ Lo correcto es que diga que en ese fichero no aparece; con `#codebase`, cita `operations.tsx` (detalle del pedido).

**Selección sin contexto de alrededor**
Selecciona solo la línea 61 de `refunds.ts` y pregunta qué es `t.rows`.
→ Una buena respuesta dice que no puede saberlo con esa línea sola; con la función entera, que son las entradas válidas del pedido.

## Investiga

¿Qué entradas cuenta `refundOrder` como «todas»? Lee las líneas 52 a 61 de `refunds.ts` y comprueba tu respuesta con
los datos: en `PED-2026-1463` queda una entrada válida, así que si se devuelve, ¿el pedido pasa a `refunded` aunque
antes ya hubo un reembolso? Pregúntaselo a Copilot con la selección de esas líneas y contrástalo con el código: la
consulta de la línea 53 solo trae entradas con `status = 'valid'`.

## Experimenta

Predice antes de lanzarlo: si devuelves solo la entrada `PED-2026-1396-3` (una butaca de anfiteatro de 24,00 €) por
petición del cliente, ¿cuánto se devuelve y en qué estado queda el pedido?

```bash
# Reembolso parcial de una entrada, como lo haría el backoffice
curl -s -X POST localhost:3000/api/admin/orders/PED-2026-1396/refunds \
  -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' \
  -d '{"reason":"petición del cliente","ticket_ids":["PED-2026-1396-3"]}'; echo
# Estado del pedido y de sus entradas
psql "$DATABASE_URL" -c "SELECT id, status, total_cents, refunded_cents FROM orders WHERE id = 'PED-2026-1396'" -c "SELECT id, seat_id, price_cents, status FROM tickets WHERE order_id = 'PED-2026-1396' ORDER BY id"
```

**Resultado esperado** (la primera vez tras `make reset`; si lo repites, la entrada ya no es válida y la API lo rechaza):

```text
{"id":"RE-PED-2026-1396-1","order_id":"PED-2026-1396","amount_cents":2160,"reason":"petición del cliente","gateway_id":"manual_ch_seed_1396","tickets":["PED-2026-1396-3"]}
      id       |       status       | total_cents | refunded_cents 
---------------+--------------------+-------------+----------------
 PED-2026-1396 | partially_refunded |       13410 |           2160
(1 row)

       id        | seat_id | price_cents |  status  
-----------------+---------+-------------+----------
 PED-2026-1396-1 | G-5     |        3550 | valid
 PED-2026-1396-2 | C-19    |        3550 | valid
 PED-2026-1396-3 | N-19    |        2400 | refunded
 PED-2026-1396-4 | J-11    |        3550 | valid
(4 rows)
```

`2400 × 0,9 = 2160`, una entrada de cuatro: `partially_refunded`, como dicen las líneas 59 a 73. El `gateway_id`
empieza por `manual_` porque los pedidos de los datos de ejemplo se cobraron con una pasarela antigua (lo explica el
comentario de `services/api/src/orders/payments-client.ts`).

## Reto

### 1 — ¿Vuelve la butaca a la venta?

**La situación:** tras el reembolso del apartado Experimenta, el comprador de `PED-2026-1396` pregunta si alguien más
puede comprar ya la butaca **N-19** de *Tributo a Mercedes Sosa* (`EV-FARO-0047`). Un compañero cree que hace falta
un proceso aparte que libere las butacas reembolsadas.

**Qué haces:** elige la referencia de contexto que necesita esta pregunta, pregúntaselo a Copilot y compruébalo con
la API de la tienda, que es lo que ve el comprador:

```bash
# Estado de la butaca N-19 en la tienda de Sala Faro
curl -s localhost:3000/api/public/events/EV-FARO-0047/seats -H 'x-teatralia-tenant-slug: sala-faro' | grep -o '{[^}]*"id":"N-19"[^}]*}'
```

**Pistas:** la respuesta cruza dos ficheros: el que marca la entrada como reembolsada y el que decide si una butaca
está libre. Con `#file` tendrías que saber cuáles son.

**Lo que buscas:** una respuesta que cite los dos sitios del código, y la butaca en estado `free` en la tienda.

<details>
<summary>Ver solución</summary>

La referencia es `#codebase` (o los dos `#file`, si ya sabes cuáles son):

```text
#codebase Cuando se reembolsa una entrada con butaca, ¿la butaca vuelve a estar disponible en la tienda?
¿Hace falta algún proceso aparte? Cita fichero y línea.
```

Lo que tiene que citar, y se comprueba con `grep`:

```bash
grep -n "SET status = 'refunded'" services/api/src/orders/refunds.ts
grep -n "status IN ('pending', 'valid')" services/api/src/routes/public.ts
```

```text
70:    await db.query(`UPDATE tickets SET status = 'refunded' WHERE id = ANY($1)`, [selected.map((x) => x.id)]);
45:                              WHERE t.pass_type_id = pt.id AND t.status IN ('pending', 'valid'))::int AS available
64:                                   AND t.status IN ('pending', 'valid'))
```

La tienda considera ocupada una butaca solo si tiene una entrada `pending` o `valid`; al pasar a `refunded`, queda
libre sin ningún proceso. Antes del reembolso y después:

```text
{"id":"N-19","zone":"anfiteatro","row_label":"N","number":19,"price_cents":2400,"status":"taken"}
{"id":"N-19","zone":"anfiteatro","row_label":"N","number":19,"price_cents":2400,"status":"free"}
```

**La regla:** una pregunta que cruza ficheros necesita `#codebase` o saber de antemano qué ficheros adjuntar; una
pregunta sobre un cálculo, solo ese cálculo.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| Con `#file:…pricing.ts` explica un reembolso con detalle | Se lo inventa a partir del único fichero que tiene | Pide que cite línea y compruébala con `grep`; cambia de referencia |
| `#file:` no autocompleta la ruta | La ruta empieza en `teatralia/` desde la raíz del workspace | Escribe `#file:` y elige el fichero en la lista, o usa **Add Context…** |
| La selección no llega al chat | Se perdió al cambiar de pestaña antes de enviar | Vuelve a seleccionar con el editor activo y envía |
| `npx tsx -e` da `Cannot find module` | Se ejecutó fuera de `teatralia/` | `cd teatralia` y repite |
| El `curl` de Experimenta responde 400 «no hay entradas válidas que reembolsar» | Ya se había reembolsado esa entrada | `CONFIRM=1 make reset` y repite |

## Conclusiones

### Qué es una referencia de contexto

La forma de decirle a Copilot dónde mirar en esta petición. No cambia lo que sabe del repositorio en general: cambia
qué texto lee antes de responder.

```text
selección        ⊂        #file        ⊂        #codebase
(un cálculo)        (un fichero entero)     (fragmentos de todo el repo)
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| La referencia más estrecha que contiene la respuesta | Selección para el importe; `#codebase` para el recorrido |
| Pedir que cite fichero y línea | Las tres preguntas lo piden |
| Contrastar las citas con el código | `grep -n` de `refunds.ts` y `admin.ts` |
| Contrastar el resultado con los datos | 7110 en `refunds` y en `calcRefund` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Fichero equivocado | Paso 2: `pricing.ts` no tiene reembolsos | Una respuesta segura sobre algo que no está ahí |
| Búsqueda con ruido | Paso 3: la línea 204 del panel aparece sin venir a cuento | Citas que hay que filtrar |
| Selección demasiado estrecha | Comprueba: la línea 61 sola no explica `t.rows` | Respuestas incompletas o inventadas |

### Cómo se perfecciona

Empieza por `#codebase` cuando no sabes dónde está algo; en cuanto lo sabes, adjunta esos ficheros o selecciona el
trozo y haz las preguntas de detalle ahí. Así cada respuesta lee menos ruido y gasta menos contexto.

### En una frase

> 🔑 `#codebase` encuentra, `#file` y la selección explican: elige la referencia por la pregunta y comprueba cada cita
> con `grep` y los datos.
