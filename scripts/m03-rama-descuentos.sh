#!/usr/bin/env bash
# M03 · Trazabilidad requisito, código y prueba.
# Crea la rama feature/tea-104 con los códigos de descuento ya implementados (TEA-104):
# especificación con criterios de aceptación, migración, API, backoffice y tests.
# Uso (desde la raíz del repo): scripts/m03-rama-descuentos.sh
set -euo pipefail
cd "$(dirname "$0")/.."

rama=feature/tea-104
base=$(git rev-parse --abbrev-ref HEAD)

if [ -n "$(git status --porcelain -- teatralia)" ]; then
  echo "Tienes cambios sin guardar en teatralia/. Guárdalos con un commit o descártalos con: CONFIRM=1 make reset" >&2
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/$rama"; then
  echo "La rama $rama ya existe. Para empezar de cero: git switch main && git branch -D $rama" >&2
  exit 1
fi

git switch -q -c "$rama"
git apply --index <<'PATCH'
diff --git a/teatralia/apps/backoffice/src/discounts.tsx b/teatralia/apps/backoffice/src/discounts.tsx
new file mode 100644
index 0000000..b4bdae1
--- /dev/null
+++ b/teatralia/apps/backoffice/src/discounts.tsx
@@ -0,0 +1,72 @@
+// TEA-104: el promotor crea y consulta sus códigos de descuento
+import { formatEuros } from '@teatralia/ui';
+import { useEffect, useState, type FormEvent } from 'react';
+import { admin } from './api.js';
+
+interface DiscountCode {
+  id: string; code: string; kind: 'percent' | 'fixed'; value: number; event_id: string | null;
+  expires_at: string; max_uses: number; used: number;
+}
+
+const empty = { code: '', kind: 'percent', value: '', event_id: '', expires_at: '', max_uses: '100' };
+
+export function Discounts() {
+  const [codes, setCodes] = useState<DiscountCode[]>([]);
+  const [form, setForm] = useState(empty);
+  const [msg, setMsg] = useState<string | null>(null);
+  const load = () => admin<DiscountCode[]>('/discount-codes').then(setCodes, (e: Error) => setMsg(e.message));
+  useEffect(() => {
+    void load();
+  }, []);
+
+  async function create(e: FormEvent) {
+    e.preventDefault();
+    try {
+      // el importe fijo se escribe en euros y se envía en céntimos
+      const value = form.kind === 'fixed' ? Math.round(Number(form.value.replace(',', '.')) * 100) : Number(form.value);
+      await admin('/discount-codes', {
+        method: 'POST',
+        body: JSON.stringify({ ...form, value, max_uses: Number(form.max_uses), event_id: form.event_id || null }),
+      });
+      setForm(empty);
+      setMsg(null);
+      await load();
+    } catch (err) {
+      setMsg((err as Error).message);
+    }
+  }
+
+  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
+  return (
+    <section className="card">
+      <h2>Códigos de descuento</h2>
+      <form onSubmit={create} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
+        <input aria-label="Código" placeholder="NAVIDAD10" value={form.code} onChange={set('code')} required />
+        <select aria-label="Tipo" value={form.kind} onChange={set('kind')}>
+          <option value="percent">Porcentaje</option>
+          <option value="fixed">Importe fijo (€)</option>
+        </select>
+        <input aria-label="Valor" placeholder={form.kind === 'percent' ? '10' : '5,00'} value={form.value} onChange={set('value')} required />
+        <input aria-label="Evento" placeholder="Evento (opcional)" value={form.event_id} onChange={set('event_id')} />
+        <input aria-label="Caduca" type="datetime-local" value={form.expires_at} onChange={set('expires_at')} required />
+        <input aria-label="Usos máximos" type="number" min={1} value={form.max_uses} onChange={set('max_uses')} required />
+        <button>Crear código</button>
+      </form>
+      {msg && <p role="alert">{msg}</p>}
+      <table>
+        <thead><tr><th>Código</th><th>Descuento</th><th>Evento</th><th>Caduca</th><th>Usos</th></tr></thead>
+        <tbody>
+          {codes.map((c) => (
+            <tr key={c.id}>
+              <td><strong>{c.code}</strong></td>
+              <td>{c.kind === 'percent' ? `${c.value} %` : formatEuros(c.value)}</td>
+              <td>{c.event_id ?? 'todos'}</td>
+              <td>{new Date(c.expires_at).toLocaleString('es-ES')}</td>
+              <td>{c.used} / {c.max_uses}</td>
+            </tr>
+          ))}
+        </tbody>
+      </table>
+    </section>
+  );
+}
diff --git a/teatralia/apps/backoffice/src/main.tsx b/teatralia/apps/backoffice/src/main.tsx
index df5c024..5303a44 100644
--- a/teatralia/apps/backoffice/src/main.tsx
+++ b/teatralia/apps/backoffice/src/main.tsx
@@ -1,6 +1,7 @@
 import { StrictMode, useEffect, useState } from 'react';
 import { createRoot } from 'react-dom/client';
 import { admin, session, type Me } from './api.js';
+import { Discounts } from './discounts.js';
 import { EventEditor } from './EventEditor.js';
 import { Login } from './Login.js';
 import { Cases, Dashboard, OrderSearch, OrderView } from './operations.js';
@@ -21,6 +22,7 @@ const NAV = [
   ['#/eventos', 'Eventos'],
   ['#/pedidos', 'Pedidos'],
   ['#/incidencias', 'Incidencias'],
+  ['#/descuentos', 'Descuentos'],
   ['#/dominios', 'Dominios'],
   ['#/email', 'Email'],
   ['#/correos', 'Correos'],
@@ -66,6 +68,8 @@ function App() {
           <OrderSearch />
         ) : hash.startsWith('#/incidencias') ? (
           <Cases />
+        ) : hash.startsWith('#/descuentos') ? (
+          <Discounts />
         ) : hash.startsWith('#/correos') ? (
           <Orders />
         ) : hash.startsWith('#/eventos') ? (
diff --git a/teatralia/docs/specs/TEA-104-codigos-de-descuento.md b/teatralia/docs/specs/TEA-104-codigos-de-descuento.md
new file mode 100644
index 0000000..0567d95
--- /dev/null
+++ b/teatralia/docs/specs/TEA-104-codigos-de-descuento.md
@@ -0,0 +1,39 @@
+# TEA-104 · Códigos de descuento por promotor — especificación
+
+Origen: issue TEA-104. Importes en céntimos; ejemplos con el carrito de PED-2026-0107
+(Sala Faro, *Jazz en el Faro*: butacas F-12 y F-13 a 35,50 € y un VIP a 60 €; gastos 0,90 € por entrada).
+
+## Reglas
+
+- R1. Un código pertenece a un promotor y solo vale en sus eventos.
+- R2. Un código es de porcentaje (1 a 100) o de importe fijo (céntimos).
+- R3. Un código puede limitarse a un evento; sin evento, vale para todos los del promotor.
+- R4. Un código tiene fecha de caducidad y número máximo de usos.
+- R5. Un pedido lleva como mucho un código.
+- R6. El descuento se aplica al subtotal de las entradas, nunca a los gastos de gestión.
+- R7. El descuento nunca deja el subtotal por debajo de cero.
+- R8. El porcentaje se redondea al céntimo más cercano sobre el subtotal del pedido.
+- R9. El código no distingue mayúsculas ni espacios al principio o al final.
+
+## Criterios de aceptación
+
+- CA-01 (R2, R6) **Porcentaje.** Dado el código `NAVIDAD10` (10 %) de Sala Faro, cuando el comprador paga el carrito
+  de PED-2026-0107 con ese código, entonces el descuento es 1310 y el total 12060 (13100 − 1310 + 270).
+- CA-02 (R2) **Importe fijo.** Dado `FARO5` (500 céntimos), con el mismo carrito, el descuento es 500 y el total 12870.
+- CA-03 (R6, R7) **Gastos intactos.** Dado `FARO30` (3000 céntimos) y un pase «De pie» de 1800, el descuento es 1800 y
+  el total 90: se pagan los gastos.
+- CA-04 (R8) **Redondeo.** Con un 15 % sobre un subtotal de 3650, el descuento es 548.
+- CA-05 (R4) **Caducado.** Dado un código caducado, el pedido se rechaza con «el código de descuento ha caducado» y no se crea.
+- CA-06 (R4) **Sin usos.** Dado un código con 2 usos máximos ya consumidos, el tercer pedido se rechaza con
+  «el código de descuento ya no tiene usos».
+- CA-07 (R3) **Otro evento.** Dado un código limitado a EV-FARO-0042, un pedido de EV-FARO-0047 se rechaza.
+- CA-08 (R1) **Otro promotor.** El código de Sala Faro en un pedido del Teatro Lumen se rechaza con «código de descuento no válido».
+- CA-09 (R5) **Sin acumular.** Un pedido no admite dos códigos.
+- CA-10 (R9) **Mayúsculas.** `navidad10` y ` NAVIDAD10 ` aplican el mismo código.
+- CA-11 (R1–R4) **Alta en el backoffice.** El promotor crea un código en **Descuentos** y lo ve en la lista con sus usos (0 / N).
+
+## Preguntas abiertas (no implementadas)
+
+- P1. ¿La comisión de plataforma (7,5 %) se calcula sobre el precio con descuento o sin él? Finanzas.
+- P2. ¿Cuánto se devuelve de un pedido con descuento? La política de devoluciones no lo dice.
+- P3. ¿Un pedido que no llega a pagarse consume un uso del código?
diff --git a/teatralia/services/api/migrations/003_codigos_descuento.sql b/teatralia/services/api/migrations/003_codigos_descuento.sql
new file mode 100644
index 0000000..97f8d0e
--- /dev/null
+++ b/teatralia/services/api/migrations/003_codigos_descuento.sql
@@ -0,0 +1,21 @@
+-- TEA-104: códigos de descuento por promotor
+
+CREATE TABLE discount_codes (
+  id          bigserial PRIMARY KEY,
+  tenant_id   text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
+  code        text NOT NULL,                       -- NAVIDAD10 (se guarda en mayúsculas)
+  kind        text NOT NULL CHECK (kind IN ('percent', 'fixed')),
+  value       integer NOT NULL CHECK (value > 0),  -- percent: 1..100 · fixed: céntimos
+  event_id    text REFERENCES events(id) ON DELETE CASCADE, -- NULL = todos los eventos del promotor
+  expires_at  timestamptz NOT NULL,
+  max_uses    integer NOT NULL CHECK (max_uses > 0),
+  used        integer NOT NULL DEFAULT 0,
+  created_at  timestamptz NOT NULL DEFAULT now(),
+  UNIQUE (tenant_id, code),
+  CHECK (kind = 'fixed' OR value <= 100)
+);
+
+-- Un pedido lleva como mucho un código: no se acumulan
+ALTER TABLE orders
+  ADD COLUMN discount_code_id bigint REFERENCES discount_codes(id),
+  ADD COLUMN discount_cents   integer NOT NULL DEFAULT 0;
diff --git a/teatralia/services/api/src/orders/discounts.ts b/teatralia/services/api/src/orders/discounts.ts
new file mode 100644
index 0000000..d514ad1
--- /dev/null
+++ b/teatralia/services/api/src/orders/discounts.ts
@@ -0,0 +1,41 @@
+// Códigos de descuento (TEA-104). Reglas en docs/specs/TEA-104-codigos-de-descuento.md
+import type { PoolClient } from 'pg';
+import { HttpError } from '../errors.js';
+
+export interface DiscountRule {
+  kind: 'percent' | 'fixed';
+  value: number; // percent: 1..100 · fixed: céntimos
+}
+
+export interface DiscountCodeRow extends DiscountRule {
+  id: string;
+  event_id: string | null;
+  expires_at: Date;
+  max_uses: number;
+  used: number;
+}
+
+export const normalizeCode = (code: string) => code.trim().toUpperCase();
+
+// Descuento en céntimos sobre el subtotal de las entradas. Nunca toca los gastos de gestión
+// y nunca deja el subtotal por debajo de cero.
+export function calcDiscount(subtotalCents: number, rule: DiscountRule): number {
+  const raw = rule.kind === 'percent' ? Math.round((subtotalCents * rule.value) / 100) : rule.value;
+  return Math.min(raw, subtotalCents);
+}
+
+// Busca el código del promotor y lo bloquea hasta el final de la transacción del pedido.
+export async function takeDiscountCode(db: PoolClient, tenantId: string, eventId: string, code: string) {
+  const r = await db.query<DiscountCodeRow>(
+    `SELECT id, kind, value, event_id, expires_at, max_uses, used FROM discount_codes
+      WHERE tenant_id = $1 AND code = $2 FOR UPDATE`,
+    [tenantId, normalizeCode(code)],
+  );
+  const dc = r.rows[0];
+  if (!dc) throw new HttpError(400, 'código de descuento no válido');
+  if (dc.event_id && dc.event_id !== eventId) throw new HttpError(400, 'el código no es válido para este evento');
+  if (new Date(dc.expires_at) < new Date()) throw new HttpError(400, 'el código de descuento ha caducado');
+  if (dc.used >= dc.max_uses) throw new HttpError(400, 'el código de descuento ya no tiene usos');
+  await db.query('UPDATE discount_codes SET used = used + 1 WHERE id = $1', [dc.id]);
+  return dc;
+}
diff --git a/teatralia/services/api/src/orders/service.ts b/teatralia/services/api/src/orders/service.ts
index fd54037..46069db 100644
--- a/teatralia/services/api/src/orders/service.ts
+++ b/teatralia/services/api/src/orders/service.ts
@@ -3,6 +3,7 @@ import { pool, withTransaction } from '../db.js';
 import { HttpError } from '../errors.js';
 import { enqueueEmail } from '../queue.js';
 import { createQrToken } from '../tickets/qr.js';
+import { calcDiscount, takeDiscountCode } from './discounts.js';
 import { charge } from './payments-client.js';
 import { calcOrderAmounts, type PricedItem } from './pricing.js';
 
@@ -13,6 +14,7 @@ export interface CreateOrderInput {
   eventId: string;
   buyerEmail: string;
   items: CartItem[];
+  discountCode?: string;
 }
 
 // Las entradas pendientes de pago bloquean la butaca unos minutos. Pasado ese tiempo se anulan.
@@ -84,15 +86,26 @@ export async function createOrder(input: CreateOrderInput) {
       throw new HttpError(400, (err as Error).message);
     }
 
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
     const seq = await db.query<{ n: string }>(`SELECT nextval('order_number_seq') AS n`);
     const orderId = `PED-${year}-${String(seq.rows[0]!.n).padStart(4, '0')}`;
 
     await db.query(
-      `INSERT INTO orders (id, tenant_id, event_id, buyer_email, subtotal_cents, fee_cents, total_cents, commission_cents)
-       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
+      `INSERT INTO orders (id, tenant_id, event_id, buyer_email, subtotal_cents, fee_cents, total_cents, commission_cents,
+                           discount_code_id, discount_cents)
+       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
       [orderId, input.tenantId, input.eventId, input.buyerEmail.toLowerCase(),
-        amounts.subtotal_cents, amounts.fee_cents, amounts.total_cents, amounts.commission_cents],
+        amounts.subtotal_cents, amounts.fee_cents, total, amounts.commission_cents, discountCodeId, discount],
     );
     for (let i = 0; i < priced.length; i++) {
       const it = priced[i]!;
@@ -105,7 +118,7 @@ export async function createOrder(input: CreateOrderInput) {
           line.price_cents, line.fee_cents, line.commission_cents],
       );
     }
-    return { id: orderId, status: 'pending', ...amounts, hold_minutes: config.holdMinutes };
+    return { id: orderId, status: 'pending', ...amounts, discount_cents: discount, total_cents: total, hold_minutes: config.holdMinutes };
   });
 }
 
diff --git a/teatralia/services/api/src/routes/admin.ts b/teatralia/services/api/src/routes/admin.ts
index ebd87e7..27e06e3 100644
--- a/teatralia/services/api/src/routes/admin.ts
+++ b/teatralia/services/api/src/routes/admin.ts
@@ -3,6 +3,7 @@ import type { FastifyInstance, FastifyRequest } from 'fastify';
 import { pool } from '../db.js';
 import { HttpError } from '../errors.js';
 import { enqueueEmail } from '../queue.js';
+import { normalizeCode } from '../orders/discounts.js';
 import { refundOrder, type RefundReason } from '../orders/refunds.js';
 import { resolveAdminTenant } from '../tenants/resolve.js';
 
@@ -210,6 +211,51 @@ export async function adminRoutes(app: FastifyInstance) {
     return r.rows;
   });
 
+  // TEA-104: códigos de descuento del promotor
+  app.get('/api/admin/discount-codes', async (req) => {
+    const t = await adminOf(req);
+    const r = await pool.query(
+      `SELECT id, code, kind, value, event_id, expires_at, max_uses, used FROM discount_codes
+        WHERE tenant_id = $1 ORDER BY created_at DESC`,
+      [t.id],
+    );
+    return r.rows;
+  });
+
+  app.post<{
+    Body: { code: string; kind: 'percent' | 'fixed'; value: number; event_id?: string | null; expires_at: string; max_uses: number };
+  }>('/api/admin/discount-codes', async (req, reply) => {
+    const t = await adminOf(req);
+    const b = req.body ?? ({} as never);
+    const code = normalizeCode(String(b.code ?? ''));
+    if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw new HttpError(400, 'el código admite de 3 a 20 letras, números o guiones');
+    if (b.kind !== 'percent' && b.kind !== 'fixed') throw new HttpError(400, 'el tipo es percent o fixed');
+    const value = Number(b.value);
+    if (!Number.isInteger(value) || value <= 0 || (b.kind === 'percent' && value > 100)) {
+      throw new HttpError(400, 'valor no válido: porcentaje de 1 a 100 o importe en céntimos');
+    }
+    const maxUses = Number(b.max_uses);
+    if (!Number.isInteger(maxUses) || maxUses <= 0) throw new HttpError(400, 'el máximo de usos debe ser un entero positivo');
+    const expires = new Date(b.expires_at);
+    if (Number.isNaN(expires.getTime())) throw new HttpError(400, 'fecha de caducidad no válida');
+    if (b.event_id) {
+      const ev = await pool.query('SELECT 1 FROM events WHERE id = $1 AND tenant_id = $2', [b.event_id, t.id]);
+      if (!ev.rows[0]) throw new HttpError(404, 'evento no encontrado');
+    }
+    try {
+      const r = await pool.query(
+        `INSERT INTO discount_codes (tenant_id, code, kind, value, event_id, expires_at, max_uses)
+         VALUES ($1, $2, $3, $4, $5, $6, $7)
+         RETURNING id, code, kind, value, event_id, expires_at, max_uses, used`,
+        [t.id, code, b.kind, value, b.event_id || null, expires, maxUses],
+      );
+      return reply.code(201).send(r.rows[0]);
+    } catch (err) {
+      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'ese código ya existe');
+      throw err;
+    }
+  });
+
   app.get('/api/admin/venues', async (req) => {
     const t = await adminOf(req);
     return (await pool.query('SELECT * FROM venues WHERE tenant_id = $1 ORDER BY name', [t.id])).rows;
diff --git a/teatralia/services/api/src/routes/public.ts b/teatralia/services/api/src/routes/public.ts
index 4211f62..a64e3e3 100644
--- a/teatralia/services/api/src/routes/public.ts
+++ b/teatralia/services/api/src/routes/public.ts
@@ -71,7 +71,7 @@ export async function publicRoutes(app: FastifyInstance) {
     return r.rows;
   });
 
-  app.post<{ Body: { event_id: string; buyer_email: string; items: CartItem[] } }>(
+  app.post<{ Body: { event_id: string; buyer_email: string; items: CartItem[]; discount_code?: string } }>(
     '/api/public/orders',
     async (req, reply) => {
       const tenant = await tenantOf(req);
@@ -82,6 +82,7 @@ export async function publicRoutes(app: FastifyInstance) {
         eventId: body.event_id,
         buyerEmail: String(body.buyer_email ?? ''),
         items: body.items,
+        discountCode: body.discount_code,
       });
       return reply.code(201).send(order);
     },
diff --git a/teatralia/services/api/test/discounts.test.ts b/teatralia/services/api/test/discounts.test.ts
new file mode 100644
index 0000000..85c15f6
--- /dev/null
+++ b/teatralia/services/api/test/discounts.test.ts
@@ -0,0 +1,30 @@
+import { describe, expect, it } from 'vitest';
+import { calcDiscount, normalizeCode } from '../src/orders/discounts.js';
+
+// PED-2026-0107: 2 butacas de 35,50 € + 1 VIP de 60 € → subtotal 131,00 €, gastos 2,70 €
+const SUBTOTAL_0107 = 13100;
+
+describe('calcDiscount', () => {
+  it('un 10 % se calcula sobre el subtotal de las entradas', () => {
+    expect(calcDiscount(SUBTOTAL_0107, { kind: 'percent', value: 10 })).toBe(1310);
+  });
+
+  it('un importe fijo se descuenta tal cual, en céntimos', () => {
+    expect(calcDiscount(SUBTOTAL_0107, { kind: 'fixed', value: 500 })).toBe(500);
+  });
+
+  it('el porcentaje se redondea al céntimo más cercano', () => {
+    // 2 × 18,25 € con un 15 % → 5,475 € → 5,48 €
+    expect(calcDiscount(3650, { kind: 'percent', value: 15 })).toBe(548);
+  });
+
+  it('un importe fijo mayor que el subtotal deja las entradas a cero, no en negativo', () => {
+    expect(calcDiscount(2500, { kind: 'fixed', value: 3000 })).toBe(2500);
+  });
+});
+
+describe('normalizeCode', () => {
+  it('ignora mayúsculas y espacios', () => {
+    expect(normalizeCode('  navidad10 ')).toBe('NAVIDAD10');
+  });
+});
PATCH
git -c user.name="Compañero de Plataforma" -c user.email="plataforma@teatralia.example" \
  commit -q -m "TEA-104: códigos de descuento por promotor" \
  -m "Especificación en teatralia/docs/specs/TEA-104-codigos-de-descuento.md. Migración 003, API, backoffice (Descuentos) y tests."

echo "Rama $rama creada desde $base con 1 commit:"
git log --oneline -1
git diff --stat "$base...$rama"
echo
echo "Ahora estás en $rama. La migración 003 se aplica al arrancar la API (make up) o con: make db-reset"
