# Laboratorio: escenarios y datos de prueba

[← Página anterior](01-lab-tests-de-la-comision.md) · [Siguiente página →](03-lab-caso-limite-redondeo.md)

Los fallos caros de Teatralia no salen con el pedido normal de dos butacas, sino con los pedidos raros: una entrada infantil gratis junto a una general, una devolución de una sola entrada de dos, un doble cobro de la pasarela o alguien que pide más pases VIP de los que quedan. En este lab conviertes esos cuatro escenarios en **datos de prueba** (*fixtures*) con ayuda de Copilot, sacados de pedidos reales de la base de datos, y los validas contra la política de devoluciones, contra la base de datos y contra la API antes de usarlos en un test.

### Objetivo

Comprender qué son los datos de prueba de un escenario de negocio: cómo se generan con Copilot a partir de datos reales, cómo debe ser un fixture fiable (origen trazable y valor esperado de la política), cómo se detecta uno inventado o mal calculado y cómo se mejora la batería con escenarios nuevos.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio.
- Teatralia en su estado inicial y la plataforma en marcha en una **segunda terminal** (el último paso llama a la API):

```bash
# Terminal 1: descarta tus cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

```bash
# Terminal 2: arranca la plataforma y déjala abierta
make up
```

- La política de devoluciones: `teatralia/docs/politica-devoluciones.md`.
- Vista **Chat** de Copilot (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>).

### Qué está pasando

| Escenario de negocio | Pedido real en los datos | Qué se comprueba |
|----------------------|--------------------------|------------------|
| Invitación de precio 0 junto a una entrada de pago | `PED-2026-1161`: pase infantil (0 €) y general (29,00 €) de *Alborada de invierno* | La invitación no paga gastos ni comisión |
| Reembolso parcial por petición del cliente | `PED-2026-1100`: devuelve una de sus dos entradas de 32,00 € | Precio − 10 %, sin gastos |
| Doble cobro | `PED-2026-0107`, el pedido de Ana | Se devuelve el cargo completo |
| Agotado | Quedan 9 pases VIP de *Jazz en el Faro* | Pedir 10 da error 409 |

Un fixture es un dato de prueba con nombre: la entrada de una función y lo que debe devolver. Copilot genera fixtures muy deprisa, pero también inventa precios y gastos que «suenan bien». Por eso cada fixture lleva el pedido real del que sale y un valor esperado que se puede rehacer a mano con la política.

### 1 — Lee los escenarios en la política

La política dice qué se devuelve en cada caso. Mira sus apartados antes de pedir nada.

```bash
cd teatralia
# Los títulos y las reglas con importes de la política
grep -n "^## \|devuelve\|Doble\|precio 0" docs/politica-devoluciones.md
```

**Resultado esperado:**

```text
8:## 1. Evento cancelado
10:- Se devuelve **todo**: el precio de las entradas y los gastos de gestión.
13:## 2. Evento aplazado
17:- Se devuelve el **precio de las entradas**. Los **gastos de gestión no se devuelven**: el servicio de venta ya se prestó.
19:## 3. Petición del cliente (evento que se celebra)
23:- Se devuelve el precio de las entradas con una **penalización del 10 %**. Los gastos de gestión no se devuelven.
27:## 4. Doble cobro
29:- Si la pasarela cobró dos veces el mismo pedido, se devuelve el **cargo duplicado completo**.
31:## 5. Invitaciones
33:- Las entradas de precio 0 no generan devolución.
35:## 6. Registro
```

Tres reglas que usarás: §3 (precio − 10 %, sin gastos), §4 (el cargo completo, es decir, el `total_cents` del pedido) y §5 (las invitaciones no se devuelven).

### 2 — Saca de la base de datos los pedidos de cada escenario

Los fixtures se basan en pedidos que existen. Consulta los tres pedidos, sus entradas y la devolución que ya tiene `PED-2026-1100`.

```bash
# Cabecera de los tres pedidos
psql "$DATABASE_URL" -c "SELECT o.id, o.event_id, o.status, o.subtotal_cents, o.fee_cents, o.total_cents, o.commission_cents, o.refunded_cents FROM orders o WHERE o.id IN ('PED-2026-1161', 'PED-2026-1100', 'PED-2026-0107') ORDER BY o.id;"
# Sus entradas
psql "$DATABASE_URL" -c "SELECT t.id, t.order_id, coalesce(t.seat_id, t.pass_type_id) AS que, t.price_cents, t.fee_cents, t.status FROM tickets t WHERE t.order_id IN ('PED-2026-1161', 'PED-2026-1100', 'PED-2026-0107') ORDER BY t.id;"
# La devolución parcial que ya se hizo
psql "$DATABASE_URL" -c "SELECT order_id, reason, amount_cents, ticket_ids FROM refunds WHERE order_id = 'PED-2026-1100';"
```

**Resultado esperado:**

```text
      id       |    event_id     |       status       | subtotal_cents | fee_cents | total_cents | commission_cents | refunded_cents 
---------------+-----------------+--------------------+----------------+-----------+-------------+------------------+----------------
 PED-2026-0107 | EV-FARO-0042    | paid               |          13100 |       270 |       13370 |              982 |              0
 PED-2026-1100 | EV-OLIVO-0103   | partially_refunded |           6400 |       200 |        6600 |              480 |           2880
 PED-2026-1161 | EV-ALBORADA-INV | paid               |           2900 |       150 |        3050 |              218 |              0
(3 rows)

       id        |   order_id    |         que         | price_cents | fee_cents |  status  
-----------------+---------------+---------------------+-------------+-----------+----------
 PED-2026-0107-1 | PED-2026-0107 | F-12                |        3550 |        90 | valid
 PED-2026-0107-2 | PED-2026-0107 | F-13                |        3550 |        90 | valid
 PED-2026-0107-3 | PED-2026-0107 | EV-FARO-0042-VIP    |        6000 |        90 | valid
 PED-2026-1100-1 | PED-2026-1100 | J-16                |        3200 |       100 | refunded
 PED-2026-1100-2 | PED-2026-1100 | D-15                |        3200 |       100 | valid
 PED-2026-1161-1 | PED-2026-1161 | EV-ALBORADA-INV-NIN |           0 |         0 | valid
 PED-2026-1161-2 | PED-2026-1161 | EV-ALBORADA-INV-GEN |        2900 |       150 | valid
(7 rows)

   order_id    |        reason        | amount_cents |    ticket_ids     
---------------+----------------------+--------------+-------------------
 PED-2026-1100 | petición del cliente |         2880 | {PED-2026-1100-1}
(1 row)
```

Cómo se lee: `PED-2026-1161` paga 30,50 € (29,00 + 1,50 de gastos de la general; el pase infantil, 0 y 0). En `PED-2026-1100` se devolvió `J-16` por 28,80 € (32,00 − 10 %). El cargo de Ana es de 133,70 €. Deja esta salida en la terminal: es lo que le pasarás a Copilot.

### 3 — Pide los fixtures a Copilot con los datos reales

Selecciona con el ratón en la terminal la salida de las tres consultas. Abre una conversación nueva en modo **Agent** y pega:

```text
#terminalSelection
#file:teatralia/docs/politica-devoluciones.md
#file:teatralia/services/api/src/orders/pricing.ts
#file:teatralia/services/api/src/orders/refunds.ts

Crea teatralia/services/api/test/fixtures/pedidos-limite.ts con datos de prueba tipados
(usa los tipos PricedItem, EventPricing, RefundableTicket y RefundReason del código) para:
1. invitacionConGeneral: la compra de PED-2026-1161 (evento con fee_cents 150 y commission_bps 750)
   con su subtotal, gastos, total y comisión esperados;
2. reembolsoParcial: la devolución por petición del cliente de PED-2026-1100-1;
3. dobleCobro: el doble cobro de PED-2026-0107 (todas sus entradas);
4. vipAgotado: pedir 10 pases EV-FARO-0042-VIP cuando quedan 9 → 409 «no quedan suficientes pases EV-FARO-0042-VIP».
Cada fixture lleva el número de pedido real y el valor esperado según la POLÍTICA, con la cuenta en un
comentario. Usa solo los precios y gastos de la selección; no inventes datos. No crees tests todavía.
```

> [!NOTE]
> `#terminalSelection` adjunta lo seleccionado en la terminal. Si tu versión de Copilot no lo ofrece al escribir `#`, copia la salida y pégala en el prompt debajo de una línea «Datos:».

**Qué debe contener la respuesta** (el código cambia en cada ejecución):

- un fichero nuevo en `services/api/test/fixtures/` y ningún cambio en `src/`;
- `invitacionConGeneral` con total **3050** y comisión **218**;
- `reembolsoParcial` con **2880** (sin los 100 de gastos);
- `dobleCobro` con **13370**, el `total_cents` del pedido de Ana;
- `vipAgotado` con 9 disponibles, 10 pedidos y estado **409**.

<details>
<summary>Solución de referencia: <code>services/api/test/fixtures/pedidos-limite.ts</code></summary>

```ts
// Escenarios límite de pedidos de Teatralia, sacados de pedidos reales de los datos de ejemplo.
// Los importes esperados salen de docs/politica-devoluciones.md y de la base de datos, no del código.
import type { EventPricing, PricedItem } from '../../src/orders/pricing.js';
import type { RefundableTicket, RefundReason } from '../../src/orders/refunds.js';

export interface EscenarioCompra {
  nombre: string;
  pedido: string; // pedido real en el que se basa
  evento: EventPricing;
  entradas: PricedItem[];
  esperado: { subtotal_cents: number; fee_cents: number; total_cents: number; commission_cents: number };
}

export interface EscenarioReembolso {
  nombre: string;
  pedido: string;
  motivo: RefundReason;
  entradas: RefundableTicket[]; // las que se devuelven
  esperado_cents: number;
}

// Invitación: un pase infantil de precio 0 y una general en el mismo pedido (Alborada de invierno)
export const invitacionConGeneral: EscenarioCompra = {
  nombre: 'invitación de precio 0 junto a una entrada general',
  pedido: 'PED-2026-1161',
  evento: { fee_cents: 150, commission_bps: 750 },
  entradas: [
    { kind: 'pass', ref: 'EV-ALBORADA-INV-NIN', price_cents: 0 },
    { kind: 'pass', ref: 'EV-ALBORADA-INV-GEN', price_cents: 2900 },
  ],
  // la invitación no paga gastos ni comisión; 2900 × 7,5 % = 217,5 → 218
  esperado: { subtotal_cents: 2900, fee_cents: 150, total_cents: 3050, commission_cents: 218 },
};

// Reembolso parcial: el cliente devuelve una de sus dos entradas de 32,00 € (Flamenco de cámara)
export const reembolsoParcial: EscenarioReembolso = {
  nombre: 'petición del cliente, una entrada de dos',
  pedido: 'PED-2026-1100',
  motivo: 'petición del cliente',
  entradas: [{ id: 'PED-2026-1100-1', price_cents: 3200, fee_cents: 100 }],
  esperado_cents: 2880, // 3200 − 10 %; los gastos no se devuelven
};

// Doble cobro: la pasarela cobró dos veces PED-2026-0107; se devuelve el cargo duplicado completo
export const dobleCobro: EscenarioReembolso = {
  nombre: 'doble cobro del pedido de Ana',
  pedido: 'PED-2026-0107',
  motivo: 'doble cobro',
  entradas: [
    { id: 'PED-2026-0107-1', price_cents: 3550, fee_cents: 90 },
    { id: 'PED-2026-0107-2', price_cents: 3550, fee_cents: 90 },
    { id: 'PED-2026-0107-3', price_cents: 6000, fee_cents: 90 },
  ],
  esperado_cents: 13370, // = total_cents del pedido
};

// Agotado: quedan 9 pases VIP de Jazz en el Faro y se piden 10 (se comprueba contra la API)
export const vipAgotado = {
  nombre: 'más pases VIP de los que quedan',
  evento: 'EV-FARO-0042',
  pase: 'EV-FARO-0042-VIP',
  disponibles: 9,
  pedidos: 10,
  esperado: { status: 409, error: 'no quedan suficientes pases EV-FARO-0042-VIP' },
};
```

</details>

### 4 — Valida cada fixture contra su fuente

Antes de usar un fixture, compruébalo campo a campo. Abre el fichero y rellena mentalmente esta tabla con lo que ha escrito Copilot:

| Fixture | Campo | Valor correcto | Fuente |
|---------|-------|----------------|--------|
| `invitacionConGeneral` | `total_cents` / `commission_cents` | 3050 / 218 | `orders` de `PED-2026-1161` (paso 2) |
| `invitacionConGeneral` | `fee_cents` del evento | 150 | `fee_cents` de la entrada general |
| `reembolsoParcial` | `esperado_cents` | 2880 | Política §3 y `refunds` de `PED-2026-1100` |
| `dobleCobro` | `esperado_cents` | 13370 | Política §4 y `total_cents` de `PED-2026-0107` |
| `vipAgotado` | `disponibles` | 9 | Consulta del paso 6 |

Los errores típicos al generar fixtures: gastos de otro evento (90 en vez de 150), el reembolso parcial con los gastos sumados (2980), el doble cobro de una sola entrada o un número de pedido que no existe. Para descartar lo último:

```bash
# Todos los números de pedido que aparecen en tus fixtures, uno por línea
grep -o "PED-2026-[0-9]*" services/api/test/fixtures/pedidos-limite.ts | sort -u
```

**Resultado esperado** (con la solución de referencia):

```text
PED-2026-0107
PED-2026-1100
PED-2026-1161
```

Los tres están en la salida del paso 2.

### 5 — Usa los fixtures en un test

Con los datos validados, el test es corto: recorre los escenarios y compara con lo esperado. Pídeselo a Copilot en el mismo chat:

```text
Crea teatralia/services/api/test/pedidos-limite.test.ts que use los fixtures: invitacionConGeneral
contra calcOrderAmounts (toMatchObject con esperado) y reembolsoParcial y dobleCobro con un it.each
contra calcRefund. vipAgotado no va aquí: lo comprobaré contra la API. Ejecuta el test.
```

<details>
<summary>Solución de referencia: <code>services/api/test/pedidos-limite.test.ts</code></summary>

```ts
import { describe, expect, it } from 'vitest';
import { calcOrderAmounts } from '../src/orders/pricing.js';
import { calcRefund } from '../src/orders/refunds.js';
import { dobleCobro, invitacionConGeneral, reembolsoParcial } from './fixtures/pedidos-limite.js';

describe('pedidos límite', () => {
  it(`compra: ${invitacionConGeneral.nombre}`, () => {
    const r = calcOrderAmounts(invitacionConGeneral.entradas, invitacionConGeneral.evento);
    expect(r).toMatchObject(invitacionConGeneral.esperado);
  });

  it.each([reembolsoParcial, dobleCobro])('reembolso: $nombre', (e) => {
    expect(calcRefund(e.entradas, e.motivo)).toBe(e.esperado_cents);
  });
});
```

</details>

```bash
# El test de los escenarios límite
npx vitest run services/api/test/pedidos-limite.test.ts --reporter=verbose
```

**Resultado esperado:**

```text
 ✓ |api| test/pedidos-limite.test.ts > pedidos límite > compra: invitación de precio 0 junto a una entrada general 2ms
 ✓ |api| test/pedidos-limite.test.ts > pedidos límite > reembolso: petición del cliente, una entrada de dos 0ms
 ✓ |api| test/pedidos-limite.test.ts > pedidos límite > reembolso: doble cobro del pedido de Ana 0ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

El fichero de fixtures no se ejecuta como test (no acaba en `.test.ts`): solo lo importan los tests.

### 6 — Comprueba el escenario de agotado contra la API

El escenario de agotado depende del estado de la base de datos, así que se valida contra el sistema en marcha. Primero mira cuántos pases VIP quedan; después pide 10.

```bash
# Capacidad y pases vendidos o reservados del VIP de Jazz en el Faro
psql "$DATABASE_URL" -c "SELECT pt.id, pt.capacity, count(t.id) FILTER (WHERE t.status IN ('pending', 'valid')) AS vendidos FROM pass_types pt LEFT JOIN tickets t ON t.pass_type_id = pt.id WHERE pt.id = 'EV-FARO-0042-VIP' GROUP BY pt.id;"
# Pedido de 10 pases VIP en la tienda de Sala Faro: primera y última línea de la respuesta
curl -s -i -X POST localhost:3000/api/public/orders \
  -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' \
  -d '{"event_id":"EV-FARO-0042","buyer_email":"prueba@correo.test","items":[{"pass_type_id":"EV-FARO-0042-VIP","quantity":10}]}' | sed -n '1p;$p'
```

**Resultado esperado:**

```text
        id        | capacity | vendidos 
------------------+----------+----------
 EV-FARO-0042-VIP |       20 |       11
(1 row)

HTTP/1.1 409 Conflict
{"error":"no quedan suficientes pases EV-FARO-0042-VIP"}
```

20 − 11 = 9 disponibles: el fixture `vipAgotado` cuadra con el sistema y la API responde lo que esperaba. Si has comprado pases VIP en otro lab sin reiniciar, el número de vendidos cambia: repite `CONFIRM=1 make reset`.

## Comprueba tu entendimiento

**Un fixture con los gastos sumados**
Cambia en `reembolsoParcial` el `esperado_cents` por `2980` y ejecuta `npx vitest run services/api/test/pedidos-limite.test.ts`.
→ `AssertionError: expected 2880 to be 2980` y `Tests  1 failed | 2 passed (3)`. El código cumple la política §3 y el fixture no. Vuelve a `2880`.

**El origen de cada número**
Elige un fixture y señala de qué fila de la salida del paso 2 sale cada importe.
→ Cada precio, gasto y total del fixture aparece en una de las tres consultas.

## Experimenta

**Predice** qué pasará si cambias el reembolso parcial por el de otro pedido real, `PED-2026-1250`: una entrada de 18,25 € devuelta por petición del cliente. Con la política, 1825 − 10 % = 1642,5, que redondeado al céntimo es **1643**. Cambia en `reembolsoParcial` el pedido, la entrada (`PED-2026-1250-1`, `price_cents: 1825`, `fee_cents: 100`) y `esperado_cents: 1643`, y ejecuta el test.

```bash
npx vitest run services/api/test/pedidos-limite.test.ts
```

**Resultado esperado** (líneas clave):

```text
     × reembolso: petición del cliente, una entrada de dos 4ms
AssertionError: expected 1642 to be 1643 // Object.is equality
      Tests  1 failed | 2 passed (3)
```

El fixture de 32,00 € pasaba porque su 10 % es exacto; el de 18,25 € deja medio céntimo y descubre que `calcRefund` trunca. Un buen dato de prueba es el que cae donde la regla se nota. Ese fallo se reproduce y se corrige en [Laboratorio: el caso límite del redondeo](03-lab-caso-limite-redondeo.md); aquí, deja el fixture como estaba.

## Reto

### 1 — El evento con invitaciones se cancela

**La situación:** Festival Alborada avisa de que podría cancelar *Alborada de invierno*. Atención al cliente quiere saber cuánto se devolvería a la compradora de `PED-2026-1161` (un pase infantil gratis y una general) antes de pulsar el botón.

**Qué haces:** añade a `fixtures/pedidos-limite.ts` un escenario `cancelacionConInvitacion` con las dos entradas del pedido y el motivo `cancelación`, calcula el esperado con la política (§1 y §5) e inclúyelo en el `it.each` de `pedidos-limite.test.ts`. Ejecuta el test.

**Pistas:** las entradas y gastos están en la salida del paso 2. §1 devuelve precio y gastos; §5 dice que la entrada de precio 0 no genera devolución.

**Lo que buscas:** un cuarto caso en verde cuyo esperado coincide con `total_cents` del pedido.

<details>
<summary>Ver solución</summary>

```ts
// Cancelación de un pedido con invitación: se devuelve todo (§1) y la invitación no genera devolución (§5)
export const cancelacionConInvitacion: EscenarioReembolso = {
  nombre: 'cancelación de un pedido con una invitación',
  pedido: 'PED-2026-1161',
  motivo: 'cancelación',
  entradas: [
    { id: 'PED-2026-1161-1', price_cents: 0, fee_cents: 0 },
    { id: 'PED-2026-1161-2', price_cents: 2900, fee_cents: 150 },
  ],
  esperado_cents: 3050, // 0 de la invitación + 2900 + 150 de gastos = total del pedido
};
```

En el test, importa `cancelacionConInvitacion` y añádelo a `it.each([reembolsoParcial, dobleCobro, cancelacionConInvitacion])`.

```text
 ✓ |api| test/pedidos-limite.test.ts > pedidos límite > compra: invitación de precio 0 junto a una entrada general 2ms
 ✓ |api| test/pedidos-limite.test.ts > pedidos límite > reembolso: petición del cliente, una entrada de dos 0ms
 ✓ |api| test/pedidos-limite.test.ts > pedidos límite > reembolso: doble cobro del pedido de Ana 0ms
 ✓ |api| test/pedidos-limite.test.ts > pedidos límite > reembolso: cancelación de un pedido con una invita… 0ms
      Tests  4 passed (4)
```

Se devuelven 30,50 €, lo mismo que pagó. Atención al cliente ya tiene el número, y el equipo, un escenario más que protege la regla de las invitaciones en las cancelaciones. **La regla:** un escenario nuevo se añade como dato (fixture) con su fuente y su cuenta; el test no cambia.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `#terminalSelection` no aparece al escribir `#` | Versión de Copilot Chat sin esa variable | Copia la salida y pégala en el prompt |
| `Cannot find module '../../src/orders/pricing.js'` en el fixture | El fichero está en `test/` y no en `test/fixtures/` | Muévelo o ajusta la ruta relativa |
| El fixture usa `fee_cents: 90` en Alborada | Copilot tomó los gastos de Sala Faro | Corrige a 150, la fuente es la entrada general de `PED-2026-1161` |
| La API responde 201 en vez de 409 | Alguien liberó o reservó pases y el estado cambió | `CONFIRM=1 make reset` y repite el paso 6 |
| `curl: (7) Failed to connect` | La plataforma no está en marcha | `make up` en la segunda terminal |

## Conclusiones

### Qué son los datos de prueba de un escenario

Un fixture es un caso de negocio convertido en datos: las entradas que recibe la función y lo que debe devolver, con nombre propio. Separarlo del test permite reutilizarlo (un test unitario, una comprobación contra la API) y revisarlo como lo que es: un dato que tiene que cuadrar con la realidad.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Sale de un caso real y lo cita | Cada fixture lleva `pedido: 'PED-2026-…'` |
| El esperado sale de la política, con su cuenta | 3200 − 10 % = 2880; total del pedido = 13370 |
| Cubre los bordes del negocio | Invitación, parcial, doble cobro, agotado |
| Lo que depende del estado se valida contra el sistema | `vipAgotado` contra `psql` y la API |
| No se ejecuta solo | `fixtures/pedidos-limite.ts` no es `.test.ts` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Dato inventado | Comparando con la salida de `psql` del paso 2 | Un test verde sobre un pedido que no existe |
| Esperado mal calculado | `expected 2880 to be 2980` | El test acusa al código de un error del dato |
| Escenario que no toca la regla | 32,00 € pasa; 18,25 € descubre el truncado | Falsa sensación de cobertura |
| Dato que depende del estado | Los vendidos del VIP cambian si compras | Fixture desfasado |

### Cómo se perfecciona

- Pedir a Copilot los fixtures **con los datos adjuntos** (selección de terminal o consulta) y prohibirle inventar.
- Elegir los casos donde la regla se nota: medio céntimo, precio 0, último pase, límite de entradas.
- Para lo que depende del estado, una comprobación contra el sistema (consulta + `curl`) junto al fixture.

### En una frase

> 🔑 Un dato de prueba fiable dice de dónde sale y por qué vale lo que vale; si no, es una suposición con forma de test.
