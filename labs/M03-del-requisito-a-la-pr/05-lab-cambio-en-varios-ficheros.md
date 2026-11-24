# Laboratorio: un cambio en varios ficheros

[← Página anterior](04-lab-plan-antes-de-ejecutar.md) · [Siguiente página →](06-lab-commit-y-pull-request.md)

Los códigos de descuento (issue **TEA-104**) atraviesan Teatralia de arriba abajo: una tabla nueva, el cálculo del
pedido, la API pública donde el comprador escribe el código, la API del backoffice donde el promotor lo crea y una
pantalla nueva en el backoffice. En este laboratorio implementas el cambio con el agente de Copilot y lo revisas
**fichero a fichero**, cada uno con su pregunta, antes de aceptar nada; después lo pruebas con tests y `curl`.

### Objetivo

Comprender cómo se controla una implementación multi-fichero con el agente: cómo funciona (una petición, varios
ficheros editados), cómo debe revisarse (cada fichero contra la regla que le toca), cómo se detectan los fallos que
solo aparecen al juntar los ficheros y cómo se mejora con tests y llamadas reales.

### Punto de partida

- Codespace del fork, terminal en la raíz del repositorio.
- Estado limpio y plataforma arrancada (la segunda orden en otra terminal, que dejas abierta):

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
# API en 3000, backoffice en 5174 (token faro-dev-token)
make up
```

- Copilot Chat: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>, modo **Agent**.
- Las reglas del cambio están en esta página (paso 2). No hace falta haber hecho el laboratorio de especificación.

### Qué está pasando

Un cambio en un solo fichero se revisa leyendo el diff. Un cambio en ocho no: hay que saber qué debe hacer **cada**
fichero y comprobar que lo hace, porque el fallo suele estar en la costura (la API guarda el descuento pero el total
se calcula antes; el backoffice manda euros y la API espera céntimos).

| Capa | Fichero | Qué tiene que hacer |
|------|---------|---------------------|
| Datos | `services/api/migrations/003_codigos_descuento.sql` (nuevo) | Tabla de códigos y descuento del pedido |
| Reglas | `services/api/src/orders/discounts.ts` (nuevo) | Calcular el descuento y validar el código |
| Pedido | `services/api/src/orders/service.ts` | Aplicar el código al crear el pedido |
| Tienda (API) | `services/api/src/routes/public.ts` | Aceptar `discount_code` en `POST /api/public/orders` |
| Backoffice (API) | `services/api/src/routes/admin.ts` | Crear y listar códigos del promotor |
| Backoffice (UI) | `apps/backoffice/src/discounts.tsx` (nuevo) y `main.tsx` | Pantalla **Descuentos** |
| Tests | `services/api/test/discounts.test.ts` (nuevo) | El cálculo con los números de las reglas |

### 1 — Mira el punto de partida de cada capa

Antes de pedir nada, confirma que no existe nada de descuentos y cómo se calcula hoy el total:

```bash
# Nada de descuentos en el código de partida
grep -rli "discount" teatralia/services teatralia/apps --include=*.ts --include=*.tsx --include=*.sql --exclude-dir=node_modules
# El total del pedido hoy: subtotal + gastos
grep -n "const total" teatralia/services/api/src/orders/pricing.ts
```

**Resultado esperado:**

```text
59:  const total = sub + fees;
```

**Cómo se lee:** el primer `grep` no devuelve nada: todo lo que aparezca después lo ha escrito el agente. El total es
`subtotal + gastos`; el descuento tiene que restarse del subtotal sin tocar los gastos.

### 2 — Pide el cambio al agente con las reglas

Chat nuevo, modo **Agent**. El prompt lleva las reglas y la lista de ficheros: el agente no tiene que decidir la
arquitectura, solo escribirla.

```text
Implementa TEA-104 (#file:teatralia/docs/backlog/TEA-104-codigos-de-descuento.md) con estas reglas:
- Código de un promotor (tenant), opcionalmente limitado a un evento; porcentaje (1-100) o importe fijo en céntimos;
  caducidad (expires_at) y máximo de usos. Se guarda en mayúsculas; al usarlo da igual mayúsculas y espacios.
- Un pedido lleva como mucho un código. El descuento se resta del subtotal de las entradas, nunca de los gastos,
  y nunca deja el subtotal en negativo. Porcentaje redondeado al céntimo (Math.round).
- Errores 400 en español: "código de descuento no válido", "el código no es válido para este evento",
  "el código de descuento ha caducado", "el código de descuento ya no tiene usos". Duplicado al crear: 409.
Ficheros, y solo estos:
1. teatralia/services/api/migrations/003_codigos_descuento.sql: tabla discount_codes y en orders
   discount_code_id y discount_cents.
2. teatralia/services/api/src/orders/discounts.ts: calcDiscount(subtotalCents, regla) puro y la validación
   del código dentro de la transacción del pedido (SELECT … FOR UPDATE).
3. orders/service.ts: createOrder acepta discountCode y guarda total_cents ya con el descuento.
4. routes/public.ts: POST /api/public/orders acepta discount_code.
5. routes/admin.ts: GET y POST /api/admin/discount-codes, filtrados por el promotor del token.
6. apps/backoffice/src/discounts.tsx y main.tsx: sección "Descuentos" con lista y formulario
   (el importe fijo se escribe en euros y se envía en céntimos).
7. teatralia/services/api/test/discounts.test.ts: tests de calcDiscount.
SQL siempre parametrizado. No toques la tienda (packages/ui, apps/storefront) ni los reembolsos.
```

**Qué debe pasar:** el agente lee los ficheros, crea y edita, y deja cada cambio pendiente de **Keep** / **Undo**. Puede
pedir permiso para ejecutar órdenes (`npm test`, `tsc`): acéptalas si son de comprobación. **No pulses Keep todavía.**

### 3 — Comprueba que ha tocado solo lo pedido

```bash
# Prepara todo para verlo junto (incluidos los ficheros nuevos) y lista qué ha cambiado
git add -A teatralia
git diff --cached --stat
```

**Resultado esperado** (con la solución de referencia; tus números de líneas pueden variar):

```text
 teatralia/apps/backoffice/src/discounts.tsx        | 72 ++++++++++++++++++++++
 teatralia/apps/backoffice/src/main.tsx             |  4 ++
 .../api/migrations/003_codigos_descuento.sql       | 21 +++++++
 teatralia/services/api/src/orders/discounts.ts     | 41 ++++++++++++
 teatralia/services/api/src/orders/service.ts       | 21 +++++--
 teatralia/services/api/src/routes/admin.ts         | 46 ++++++++++++++
 teatralia/services/api/src/routes/public.ts        |  3 +-
 teatralia/services/api/test/discounts.test.ts      | 30 +++++++++
 8 files changed, 233 insertions(+), 5 deletions(-)
```

**Cómo se lee:** ocho ficheros, los siete puntos del prompt. Si aparece `packages/ui`, `refunds.ts` o `pricing.ts`, el
agente se ha salido del alcance: mira por qué con `git diff --cached -- <fichero>` antes del paso 4.

### 4 — Revisa la migración

Cada fichero se mira con su propio diff y una pregunta concreta. Empieza por los datos:

```bash
# La migración entera
git diff --cached -- teatralia/services/api/migrations/
```

**Qué compruebas:**

| Pregunta | Lo que debe verse |
|----------|-------------------|
| ¿Un código es de un promotor? | `tenant_id … REFERENCES tenants(id)` y `UNIQUE (tenant_id, code)` |
| ¿Importes en céntimos? | `value integer` y `discount_cents integer` (nunca `numeric` ni `float`) |
| ¿Un código por pedido? | Una sola columna `discount_code_id` en `orders` |
| ¿Fichero nuevo? | `003_…`, sin cambios en `001` ni `002` |

Si algo no cumple, díselo al agente en una frase sobre **ese** fichero («en la migración, `value` en céntimos como
`integer`») y vuelve a mirar solo ese diff.

### 5 — Revisa las reglas y el pedido

```bash
# Cálculo y validación del código
git diff --cached -- teatralia/services/api/src/orders/discounts.ts
# Dónde se aplica en la creación del pedido
git diff --cached -- teatralia/services/api/src/orders/service.ts
```

**Qué compruebas:**

| Pregunta | Lo que debe verse |
|----------|-------------------|
| ¿Descuento sobre el subtotal? | `calcDiscount(amounts.subtotal_cents, …)`, no sobre `total_cents` |
| ¿Tope para no quedar en negativo? | `Math.min(…, subtotalCents)` |
| ¿Filtra por promotor al buscar el código? | `WHERE tenant_id = $1 AND code = $2` |
| ¿Dentro de la transacción del pedido? | La consulta usa `db` (el cliente de `withTransaction`) y `FOR UPDATE` |
| ¿El total guardado ya lleva el descuento? | En el `INSERT INTO orders` va `total`, no `amounts.total_cents` |

La última fila es la costura típica: si el `INSERT` sigue guardando `amounts.total_cents`, el pedido muestra un
descuento y cobra el precio entero.

### 6 — Revisa las rutas de la API

```bash
# Tienda: el comprador manda el código
git diff --cached -- teatralia/services/api/src/routes/public.ts
# Backoffice: alta y lista de códigos
git diff --cached -- teatralia/services/api/src/routes/admin.ts
```

**Qué compruebas:** en `admin.ts`, que **las dos** rutas llaman a `adminOf(req)` y usan `t.id` en el SQL (un
promotor no ve ni crea códigos de otro), que el `event_id` opcional se comprueba contra el promotor y que el error de
clave duplicada (`23505`) se traduce en 409. En `public.ts`, que solo se añade `discount_code` y se pasa a `createOrder`.

### 7 — Revisa el backoffice y los tests

```bash
# Pantalla nueva y su entrada en el menú
git diff --cached -- teatralia/apps/backoffice/src/
# Tests nuevos
git diff --cached -- teatralia/services/api/test/
```

**Qué compruebas:** en `discounts.tsx`, que el importe fijo escrito en euros se multiplica por 100 antes de enviarse y
que la lista muestra el porcentaje con `%` y el fijo con `formatEuros`. En los tests, que los números son los de las
reglas (10 % de 13100 = 1310; 15 % de 3650 = 548; fijo de 3000 sobre 2500 = 2500).

Con los siete ficheros revisados, pulsa **Keep** en el chat.

<details>
<summary>Solución de referencia (ficheros clave)</summary>

La solución completa, probada, la crea `scripts/m03-rama-descuentos.sh` en una rama `feature/tea-104`. Para comparar
tu trabajo con ella sin perderlo: haz commit de lo tuyo en una rama y, desde la rama principal, ejecuta el script y
`git diff <tu-rama> feature/tea-104 -- teatralia`.

`teatralia/services/api/migrations/003_codigos_descuento.sql`:

```sql
-- TEA-104: códigos de descuento por promotor

CREATE TABLE discount_codes (
  id          bigserial PRIMARY KEY,
  tenant_id   text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code        text NOT NULL,                       -- NAVIDAD10 (se guarda en mayúsculas)
  kind        text NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value       integer NOT NULL CHECK (value > 0),  -- percent: 1..100 · fixed: céntimos
  event_id    text REFERENCES events(id) ON DELETE CASCADE, -- NULL = todos los eventos del promotor
  expires_at  timestamptz NOT NULL,
  max_uses    integer NOT NULL CHECK (max_uses > 0),
  used        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  CHECK (kind = 'fixed' OR value <= 100)
);

-- Un pedido lleva como mucho un código: no se acumulan
ALTER TABLE orders
  ADD COLUMN discount_code_id bigint REFERENCES discount_codes(id),
  ADD COLUMN discount_cents   integer NOT NULL DEFAULT 0;
```

`teatralia/services/api/src/orders/discounts.ts`:

```ts
// Códigos de descuento (TEA-104). Reglas en docs/specs/TEA-104-codigos-de-descuento.md
import type { PoolClient } from 'pg';
import { HttpError } from '../errors.js';

export interface DiscountRule {
  kind: 'percent' | 'fixed';
  value: number; // percent: 1..100 · fixed: céntimos
}

export interface DiscountCodeRow extends DiscountRule {
  id: string;
  event_id: string | null;
  expires_at: Date;
  max_uses: number;
  used: number;
}

export const normalizeCode = (code: string) => code.trim().toUpperCase();

// Descuento en céntimos sobre el subtotal de las entradas. Nunca toca los gastos de gestión
// y nunca deja el subtotal por debajo de cero.
export function calcDiscount(subtotalCents: number, rule: DiscountRule): number {
  const raw = rule.kind === 'percent' ? Math.round((subtotalCents * rule.value) / 100) : rule.value;
  return Math.min(raw, subtotalCents);
}

// Busca el código del promotor y lo bloquea hasta el final de la transacción del pedido.
export async function takeDiscountCode(db: PoolClient, tenantId: string, eventId: string, code: string) {
  const r = await db.query<DiscountCodeRow>(
    `SELECT id, kind, value, event_id, expires_at, max_uses, used FROM discount_codes
      WHERE tenant_id = $1 AND code = $2 FOR UPDATE`,
    [tenantId, normalizeCode(code)],
  );
  const dc = r.rows[0];
  if (!dc) throw new HttpError(400, 'código de descuento no válido');
  if (dc.event_id && dc.event_id !== eventId) throw new HttpError(400, 'el código no es válido para este evento');
  if (new Date(dc.expires_at) < new Date()) throw new HttpError(400, 'el código de descuento ha caducado');
  if (dc.used >= dc.max_uses) throw new HttpError(400, 'el código de descuento ya no tiene usos');
  await db.query('UPDATE discount_codes SET used = used + 1 WHERE id = $1', [dc.id]);
  return dc;
}
```

`teatralia/services/api/src/orders/service.ts` (diff):

```diff
+import { calcDiscount, takeDiscountCode } from './discounts.js';
 import { charge } from './payments-client.js';
@@
   items: CartItem[];
+  discountCode?: string;
 }
@@
+    // TEA-104: un solo código por pedido; el descuento sale del subtotal, no de los gastos
+    let discountCodeId: string | null = null;
+    let discount = 0;
+    if (input.discountCode?.trim()) {
+      const dc = await takeDiscountCode(db, input.tenantId, input.eventId, input.discountCode);
+      discountCodeId = dc.id;
+      discount = calcDiscount(amounts.subtotal_cents, dc);
+    }
+    const total = amounts.total_cents - discount;
+
     const year = new Date().getFullYear();
@@
-      `INSERT INTO orders (id, tenant_id, event_id, buyer_email, subtotal_cents, fee_cents, total_cents, commission_cents)
-       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
+      `INSERT INTO orders (id, tenant_id, event_id, buyer_email, subtotal_cents, fee_cents, total_cents, commission_cents,
+                           discount_code_id, discount_cents)
+       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
       [orderId, input.tenantId, input.eventId, input.buyerEmail.toLowerCase(),
-        amounts.subtotal_cents, amounts.fee_cents, amounts.total_cents, amounts.commission_cents],
+        amounts.subtotal_cents, amounts.fee_cents, total, amounts.commission_cents, discountCodeId, discount],
@@
-    return { id: orderId, status: 'pending', ...amounts, hold_minutes: config.holdMinutes };
+    return { id: orderId, status: 'pending', ...amounts, discount_cents: discount, total_cents: total, hold_minutes: config.holdMinutes };
```

`teatralia/services/api/test/discounts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calcDiscount, normalizeCode } from '../src/orders/discounts.js';

// PED-2026-0107: 2 butacas de 35,50 € + 1 VIP de 60 € → subtotal 131,00 €, gastos 2,70 €
const SUBTOTAL_0107 = 13100;

describe('calcDiscount', () => {
  it('un 10 % se calcula sobre el subtotal de las entradas', () => {
    expect(calcDiscount(SUBTOTAL_0107, { kind: 'percent', value: 10 })).toBe(1310);
  });

  it('un importe fijo se descuenta tal cual, en céntimos', () => {
    expect(calcDiscount(SUBTOTAL_0107, { kind: 'fixed', value: 500 })).toBe(500);
  });

  it('el porcentaje se redondea al céntimo más cercano', () => {
    // 2 × 18,25 € con un 15 % → 5,475 € → 5,48 €
    expect(calcDiscount(3650, { kind: 'percent', value: 15 })).toBe(548);
  });

  it('un importe fijo mayor que el subtotal deja las entradas a cero, no en negativo', () => {
    expect(calcDiscount(2500, { kind: 'fixed', value: 3000 })).toBe(2500);
  });
});

describe('normalizeCode', () => {
  it('ignora mayúsculas y espacios', () => {
    expect(normalizeCode('  navidad10 ')).toBe('NAVIDAD10');
  });
});
```

Las rutas de `admin.ts` (`GET`/`POST /api/admin/discount-codes`), el cambio de `public.ts` y la pantalla
`discounts.tsx` están en la rama que crea el script.

</details>

### 8 — Compila y pasa los tests

```bash
# Tipos de la API y del backoffice
npm --prefix teatralia run typecheck -w @teatralia/api -w @teatralia/backoffice
# Todos los tests
make test
```

**Resultado esperado:**

```text
> typecheck
> tsc -p tsconfig.json


> typecheck
> tsc -p tsconfig.json

 Test Files  7 passed (7)
      Tests  26 passed (26)
```

**Cómo se lee:** dos compilaciones sin errores y 26 tests (los 21 de partida más los 5 de `discounts.test.ts`). Los
tests solo prueban `calcDiscount`: no saben si `service.ts` lo usa bien. Eso lo dice el paso siguiente.

### 9 — Prueba el flujo completo con curl

La migración se aplica al arrancar la API. Para la terminal de `make up` (<kbd>Ctrl</kbd>+<kbd>C</kbd>) y vuelve a
lanzarlo. Después: el promotor crea un código de 2 usos, un comprador lo usa, otro promotor lo intenta, y se fuerzan
dos errores de alta.

```bash
# Sala Faro crea NAVIDAD10 (10 %, 2 usos)
curl -s -X POST localhost:3000/api/admin/discount-codes -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"code":"navidad10","kind":"percent","value":10,"expires_at":"2026-12-31T23:59:00+01:00","max_uses":2}' | jq -c .
# Pedido de dos pases «De pie» (18 € + 0,90 € de gastos cada uno) con el código
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"prueba@ejemplo.test","items":[{"pass_type_id":"EV-FARO-0042-PIE","quantity":2}],"discount_code":"NAVIDAD10"}' | jq -c '{id, subtotal_cents, fee_cents, discount_cents, total_cents}'
# El mismo código en un evento del Teatro Lumen
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: teatro-lumen' -H 'content-type: application/json' -d '{"event_id":"EV-LUMEN-0007","buyer_email":"prueba@ejemplo.test","items":[{"pass_type_id":"EV-LUMEN-0007-GEN","quantity":1}],"discount_code":"NAVIDAD10"}' | jq -c .
# Alta duplicada y porcentaje imposible
curl -s -X POST localhost:3000/api/admin/discount-codes -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"code":"NAVIDAD10","kind":"fixed","value":500,"expires_at":"2026-12-31T23:59:00+01:00","max_uses":5}' | jq -c .
curl -s -X POST localhost:3000/api/admin/discount-codes -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"code":"MITAD","kind":"percent","value":150,"expires_at":"2026-12-31T23:59:00+01:00","max_uses":5}' | jq -c .
```

**Resultado esperado** (el número de pedido puede variar si has creado otros pedidos):

```text
{"id":"1","code":"NAVIDAD10","kind":"percent","value":10,"event_id":null,"expires_at":"2026-12-31T22:59:00.000Z","max_uses":2,"used":0}
{"id":"PED-2026-2468","subtotal_cents":3600,"fee_cents":180,"discount_cents":360,"total_cents":3420}
{"error":"código de descuento no válido"}
{"error":"ese código ya existe"}
{"error":"valor no válido: porcentaje de 1 a 100 o importe en céntimos"}
```

**Cómo se lee:** el código se guarda en mayúsculas; el pedido descuenta 360 (10 % de 3600) y mantiene los 180 de gastos:
3600 − 360 + 180 = 3420. El Teatro Lumen no encuentra el código de Sala Faro. Cada fila prueba una costura entre
ficheros: migración (`UNIQUE`), reglas, `service.ts` (total guardado) y `admin.ts` (promotor).

Paga el pedido y comprueba lo que cobra la pasarela:

```bash
# Pago con la tarjeta de pruebas que aprueba
curl -s -X POST localhost:3000/api/public/orders/PED-2026-2468/pay -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"card":"4242 4242 4242 4242"}' | jq -c .
# Lo que ha quedado en la base de datos
psql "$DATABASE_URL" -c "SELECT o.id, o.status, o.subtotal_cents, o.fee_cents, o.discount_cents, o.total_cents, d.code FROM orders o LEFT JOIN discount_codes d ON d.id = o.discount_code_id WHERE o.discount_code_id IS NOT NULL ORDER BY o.id;"
```

**Resultado esperado** (el `charge_id` cambia en cada pago):

```text
{"id":"PED-2026-2468","status":"paid","charge_id":"ch_3d3b78c78b4815d0"}
      id       | status  | subtotal_cents | fee_cents | discount_cents | total_cents |   code    
---------------+---------+----------------+-----------+----------------+-------------+-----------
 PED-2026-2468 | paid    |           3600 |       180 |            360 |        3420 | NAVIDAD10
(1 row)
```

```bash
# El cargo en la pasarela emulada (cambia el id por el tuyo)
curl -s localhost:3001/charges/ch_3d3b78c78b4815d0 | jq -c '{id, amount_cents, refunded_cents}'
```

```text
{"id":"ch_3d3b78c78b4815d0","amount_cents":3420,"refunded_cents":0}
```

**Cómo se lee:** la pasarela ha cobrado 3420, el total con descuento. Si hubiera cobrado 3780, `payOrder` estaría
leyendo un total que no incluye el descuento: un fallo que ningún test unitario de `calcDiscount` habría visto.

### 10 — Mira la pantalla del backoffice

Abre el backoffice (pestaña **Ports**, puerto 5174), entra con `faro-dev-token` y pulsa **Descuentos** en el menú.

**Resultado esperado:** la tabla con `NAVIDAD10`, «10 %», evento «todos», la caducidad y «1 / 2» en usos. Crea desde
el formulario un código `FARO5` de **Importe fijo (€)** con valor `5,00`: en la lista aparece como «5,00 €».
Comprueba que se ha enviado en céntimos:

```bash
# El valor guardado de FARO5 (debe ser 500)
psql "$DATABASE_URL" -c "SELECT code, kind, value FROM discount_codes ORDER BY id;"
```

**Cómo se lee:** `FARO5 | fixed | 500`. Si fuera `5`, el formulario envía euros y la API los guarda como céntimos: un
descuento de 5 céntimos. Es la costura UI → API que solo se ve con un dato real.

## Comprueba tu entendimiento

**Tercer uso**
Repite dos veces el pedido del paso 9 con `"discount_code":"navidad10"` (en minúsculas) y un pase VIP.
→ El primero se acepta con `discount_cents` 600 sobre 6000; el segundo responde `{"error":"el código de descuento ya no tiene usos"}`.

**Un fichero, una regla**
Elige un fichero del paso 3 y di qué regla del paso 2 implementa y qué línea la cumple.
→ Por ejemplo, `discounts.ts`: «nunca en negativo» → `Math.min(raw, subtotalCents)`.

## Investiga

¿Qué piezas de Teatralia **no** saben que existen los descuentos? La fuente en crudo es el detalle de un pedido en el
backoffice (**Pedidos**, `PED-2026-2468`): fíjate en la línea de subtotal, gastos y total. Después busca en el código:

```bash
# Quién lee el total o el subtotal de un pedido, fuera de lo que has cambiado
grep -rn "subtotal_cents\|total_cents" teatralia/apps/backoffice/src/operations.tsx teatralia/services/api/src/orders/refunds.ts teatralia/services/notifier/src --include=*.ts --include=*.tsx
```

```text
teatralia/services/notifier/src/jobs.ts:29:    `SELECT o.id, o.tenant_id, o.buyer_email, o.total_cents, e.title, e.venue, e.starts_at
teatralia/services/notifier/src/jobs.ts:58:    totalCents: order.total_cents,
teatralia/services/api/src/orders/refunds.ts:37:    `SELECT o.id, o.status, o.charge_id, o.total_cents, o.refunded_cents, e.starts_at
teatralia/apps/backoffice/src/operations.tsx:80:  id: string; event_id: string; buyer_email: string; status: string; total_cents: number;
teatralia/apps/backoffice/src/operations.tsx:117:              <td>{formatEuros(o.total_cents)}</td>
teatralia/apps/backoffice/src/operations.tsx:129:  event_title: string; starts_at: string; subtotal_cents: number; fee_cents: number;
teatralia/apps/backoffice/src/operations.tsx:161:      <p>Subtotal {formatEuros(data.subtotal_cents)} · gastos {formatEuros(data.fee_cents)} · <strong>total {formatEuros(data.total_cents)}</strong> · reembolsado {formatEuros(data.refunded_cents)}</p>
```

El correo de confirmación usa el total (correcto, ya lleva el descuento). La línea 161 del backoffice pinta subtotal,
gastos y total sin el descuento: para `PED-2026-2468` las cuentas no cuadran a la vista (36,00 + 1,80 ≠ 34,20). Y
`refunds.ts` calcula por entrada (`price_cents + fee_cents`), sin saber que el pedido llevaba descuento.
Son huecos fuera del alcance de
este cambio que deben quedar escritos en la PR (o en un issue nuevo), no arreglados de paso.

## Reto

### 1 — Un uso consumido por un pago rechazado

**La situación:** un promotor crea un código de un solo uso para un cliente concreto. El cliente lo usa, su banco
rechaza el pago y, al reintentarlo, Teatralia le dice que el código ya no tiene usos. Atención al cliente pregunta si
es un fallo.

**Qué haces:** reprodúcelo con `curl` (código de 1 uso, pedido, pago con la tarjeta de pruebas que rechaza
`4000 0000 0000 0002`, segundo pedido). Después cambia la regla para que un pedido fallido no consuma uso, en los
ficheros que haga falta, y repite la prueba.

**Pistas:** `payOrder` pone el pedido en `failed` al rechazarse el pago, y `releaseExpiredHolds` hace lo mismo con los
pedidos que caducan; en vez de mantener un contador, se puede contar los pedidos con ese `discount_code_id` cuyo estado
no es `failed`. La lista del backoffice también muestra los usos.

**Lo que buscas:** que tras un pago rechazado el mismo código se pueda volver a usar una vez, y que mientras un pedido
con el código está pendiente de pago, otro comprador no pueda usarlo.

<details>
<summary>Ver solución</summary>

Reproducción con la implementación de referencia (antes del cambio):

```bash
curl -s -X POST localhost:3000/api/admin/discount-codes -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"code":"UNAVEZ","kind":"percent","value":10,"expires_at":"2026-12-31T23:59:00+01:00","max_uses":1}' | jq -c '{code, used, max_uses}'
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"prueba@ejemplo.test","items":[{"pass_type_id":"EV-FARO-0042-PIE","quantity":1}],"discount_code":"UNAVEZ"}' | jq -c '{id, discount_cents, total_cents}'
curl -s -X POST localhost:3000/api/public/orders/PED-2026-2468/pay -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"card":"4000 0000 0000 0002"}'; echo
curl -s -X POST localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' -d '{"event_id":"EV-FARO-0042","buyer_email":"prueba@ejemplo.test","items":[{"pass_type_id":"EV-FARO-0042-PIE","quantity":1}],"discount_code":"UNAVEZ"}'; echo
```

```text
{"code":"UNAVEZ","used":0,"max_uses":1}
{"id":"PED-2026-2468","discount_cents":180,"total_cents":1710}
{"error":"pago rechazado: fondos insuficientes"}
{"error":"el código de descuento ya no tiene usos"}
```

El cambio: contar los usos en lugar de incrementar un contador (dos ficheros).

```diff
--- a/teatralia/services/api/src/orders/discounts.ts
+++ b/teatralia/services/api/src/orders/discounts.ts
@@ -35,7 +35,11 @@ export async function takeDiscountCode(db: PoolClient, tenantId: string, eventId
   if (!dc) throw new HttpError(400, 'código de descuento no válido');
   if (dc.event_id && dc.event_id !== eventId) throw new HttpError(400, 'el código no es válido para este evento');
   if (new Date(dc.expires_at) < new Date()) throw new HttpError(400, 'el código de descuento ha caducado');
-  if (dc.used >= dc.max_uses) throw new HttpError(400, 'el código de descuento ya no tiene usos');
-  await db.query('UPDATE discount_codes SET used = used + 1 WHERE id = $1', [dc.id]);
+  // un uso = un pedido con el código que no ha fallado (pendiente de pago o pagado)
+  const u = await db.query<{ n: number }>(
+    `SELECT count(*)::int AS n FROM orders WHERE discount_code_id = $1 AND status <> 'failed'`,
+    [dc.id],
+  );
+  if (u.rows[0]!.n >= dc.max_uses) throw new HttpError(400, 'el código de descuento ya no tiene usos');
   return dc;
 }
--- a/teatralia/services/api/src/routes/admin.ts
+++ b/teatralia/services/api/src/routes/admin.ts
@@ -215,8 +215,9 @@ export async function adminRoutes(app: FastifyInstance) {
   app.get('/api/admin/discount-codes', async (req) => {
     const t = await adminOf(req);
     const r = await pool.query(
-      `SELECT id, code, kind, value, event_id, expires_at, max_uses, used FROM discount_codes
-        WHERE tenant_id = $1 ORDER BY created_at DESC`,
+      `SELECT d.id, d.code, d.kind, d.value, d.event_id, d.expires_at, d.max_uses,
+              (SELECT count(*) FROM orders o WHERE o.discount_code_id = d.id AND o.status <> 'failed')::int AS used
+         FROM discount_codes d WHERE d.tenant_id = $1 ORDER BY d.created_at DESC`,
       [t.id],
     );
     return r.rows;
```

Con el cambio (tras `CONFIRM=1 make reset`, reiniciar `make up` y crear de nuevo `UNAVEZ`): pedido con el código,
otro comprador mientras está pendiente, pago rechazado, reintento y lista.

```text
{"code":"UNAVEZ","used":0,"max_uses":1}
{"id":"PED-2026-2468","discount_cents":180,"total_cents":1710}
{"error":"el código de descuento ya no tiene usos"}
{"error":"pago rechazado: fondos insuficientes"}
{"id":"PED-2026-2469","discount_cents":180,"total_cents":1710}
{"code":"UNAVEZ","used":1,"max_uses":1}
```

Mientras `PED-2026-2468` está pendiente, el código está ocupado; al fallar el pago, vuelve a estar disponible. La
columna `used` de la tabla queda sin uso: en un equipo real se quitaría con otra migración. Contar en vez de mantener
un contador cubre también los pedidos que caducan sin pagar, que `releaseExpiredHolds` marca como `failed` sin pasar
por `payOrder`. **La regla:** en un cambio multi-fichero, el estado derivado (un contador) es otra costura; si se
puede calcular a partir de los datos (los pedidos), no hay que mantenerlo sincronizado a mano.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `{"error":"error interno"}` al crear el código y `relation "discount_codes" does not exist` en la terminal de la API | La API no se ha reiniciado tras crear la migración | <kbd>Ctrl</kbd>+<kbd>C</kbd> en la terminal de `make up` y vuelve a lanzar `make up` |
| `total_cents` sin descuento pero `discount_cents` correcto | El `INSERT` de `service.ts` guarda `amounts.total_cents` | Guarda el `total` calculado tras el descuento (paso 5) |
| `FARO5` se guarda con `value` 5 | El formulario envía euros | Multiplica por 100 en `discounts.tsx` antes de enviar |
| El agente cambia `pricing.ts` o los reembolsos | El prompt no fija el alcance o el agente «ayuda» | **Undo** en esos ficheros; repite con «No toques…» |
| `git diff --stat` no muestra los ficheros nuevos | Los ficheros nuevos no están preparados | `git add -A teatralia` y `git diff --cached --stat` |
| `{"error":"el evento ya ha empezado"}` | Haces el lab después del 12 de diciembre de 2026 | Usa `EV-FARO-0047` (enero de 2027) y su pase VIP |

## Conclusiones

### Qué es una implementación multi-fichero controlada

Es dejar que el agente escriba un cambio que cruza capas (datos, reglas, API, UI, tests) sin perder el control: un
prompt con reglas y lista de ficheros, una revisión fichero a fichero con una pregunta por fichero y una prueba de
extremo a extremo que mira las costuras.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Alcance cerrado en el prompt | Siete puntos y «no toques la tienda ni los reembolsos» |
| Lista de ficheros comprobada | `git diff --cached --stat`: 8 ficheros |
| Revisión por fichero con su pregunta | Migración, reglas, pedido, rutas, UI, tests |
| Tests de la regla pura | 5 tests de `calcDiscount` |
| Prueba de las costuras | `curl` + `psql` + cargo de 3420 en la pasarela |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Total guardado sin descuento | Paso 5 (`INSERT`) y cargo de la pasarela | Se cobra el precio entero |
| Euros enviados como céntimos | Paso 10, `FARO5` con `value` 5 | Descuentos cien veces menores |
| Migración no aplicada | `relation … does not exist` | El cambio parece roto |
| Uso consumido por un pago rechazado | Reto | Clientes sin el descuento que se les prometió |
| Piezas que no saben del descuento | Investiga: detalle de pedido y reembolsos | Cuentas que no cuadran y devoluciones de más |

### Cómo se perfecciona

El prompt con reglas y ficheros se guarda como prompt file del equipo para los cambios de API + backoffice. Los
pasos 4 a 7 se convierten en una lista de revisión en la plantilla de PR. Las costuras se cubren con tests de
integración (crear pedido con código contra una base de datos de pruebas) además de los tests de la regla pura.

### En una frase

> 🔑 Con varios ficheros, el agente escribe rápido y el fallo vive en las costuras: revisa cada fichero contra su regla y prueba el flujo entero con datos reales antes de aceptar.
