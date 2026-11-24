#!/usr/bin/env bash
# M03 · Revisar un diff con Copilot.
# Crea la rama revision/tea-111 con el trabajo de un compañero: exportar las ventas de un evento a CSV (TEA-111).
# El cambio compila y sus tests pasan, pero trae fallos que una revisión tiene que encontrar.
# Uso (desde la raíz del repo): scripts/m03-rama-revision.sh
set -euo pipefail
cd "$(dirname "$0")/.."

rama=revision/tea-111
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
diff --git a/teatralia/services/api/src/reports/sales-csv.ts b/teatralia/services/api/src/reports/sales-csv.ts
new file mode 100644
index 0000000..d5d192b
--- /dev/null
+++ b/teatralia/services/api/src/reports/sales-csv.ts
@@ -0,0 +1,16 @@
+// TEA-111: hoja de liquidación de un evento para Finanzas
+export interface SaleRow {
+  id: string;
+  paid_at: Date | null;
+  tickets: number;
+  total_cents: number;
+  commission_cents: number;
+  refunded_cents: number;
+}
+
+export const CSV_HEADER = 'pedido;fecha;entradas;total;comision;reembolsado';
+
+export function toCsvRow(r: SaleRow): string {
+  const fecha = r.paid_at ? r.paid_at.toISOString().slice(0, 10) : '';
+  return [r.id, fecha, r.tickets, r.total_cents / 100, r.commission_cents / 100, r.refunded_cents / 100].join(';');
+}
diff --git a/teatralia/services/api/src/routes/admin.ts b/teatralia/services/api/src/routes/admin.ts
index ebd87e7..9ceddb4 100644
--- a/teatralia/services/api/src/routes/admin.ts
+++ b/teatralia/services/api/src/routes/admin.ts
@@ -4,6 +4,7 @@ import { pool } from '../db.js';
 import { HttpError } from '../errors.js';
 import { enqueueEmail } from '../queue.js';
 import { refundOrder, type RefundReason } from '../orders/refunds.js';
+import { CSV_HEADER, toCsvRow } from '../reports/sales-csv.js';
 import { resolveAdminTenant } from '../tenants/resolve.js';
 
 export const EMAIL_PROVIDERS = ['smtp', 'sendgrid', 'mailgun', 'ses', 'postmark'] as const;
@@ -210,6 +211,21 @@ export async function adminRoutes(app: FastifyInstance) {
     return r.rows;
   });
 
+  // TEA-111: ventas de un evento en CSV para la liquidación con Finanzas
+  app.get<{ Params: { id: string } }>('/api/admin/events/:id/sales.csv', async (req, reply) => {
+    await adminOf(req);
+    const r = await pool.query(
+      `SELECT o.id, o.paid_at, o.total_cents, o.commission_cents, o.refunded_cents,
+              (SELECT count(*) FROM tickets k WHERE k.order_id = o.id)::int AS tickets
+         FROM orders o
+        WHERE o.event_id = '${req.params.id}' AND o.status IN ('paid', 'partially_refunded', 'refunded')
+        ORDER BY o.paid_at`,
+    );
+    reply.header('content-type', 'text/csv; charset=utf-8');
+    reply.header('content-disposition', `attachment; filename="ventas-${req.params.id}.csv"`);
+    return [CSV_HEADER, ...r.rows.map(toCsvRow)].join('\n') + '\n';
+  });
+
   app.get('/api/admin/venues', async (req) => {
     const t = await adminOf(req);
     return (await pool.query('SELECT * FROM venues WHERE tenant_id = $1 ORDER BY name', [t.id])).rows;
diff --git a/teatralia/services/api/test/sales-csv.test.ts b/teatralia/services/api/test/sales-csv.test.ts
new file mode 100644
index 0000000..429804c
--- /dev/null
+++ b/teatralia/services/api/test/sales-csv.test.ts
@@ -0,0 +1,16 @@
+import { describe, expect, it } from 'vitest';
+import { CSV_HEADER, toCsvRow } from '../src/reports/sales-csv.js';
+
+describe('exportación de ventas (TEA-111)', () => {
+  it('la cabecera tiene las columnas que pide Finanzas', () => {
+    expect(CSV_HEADER.split(';')).toEqual(['pedido', 'fecha', 'entradas', 'total', 'comision', 'reembolsado']);
+  });
+
+  it('una fila por pedido', () => {
+    const row = toCsvRow({
+      id: 'PED-2026-0107', paid_at: new Date('2026-11-02T10:00:00Z'), tickets: 3,
+      total_cents: 13370, commission_cents: 982, refunded_cents: 0,
+    });
+    expect(row).toBe('PED-2026-0107;2026-11-02;3;133.7;9.82;0');
+  });
+});
PATCH
git -c user.name="Compañero de Plataforma" -c user.email="plataforma@teatralia.example" \
  commit -q -m "TEA-111: exportar las ventas de un evento a CSV" \
  -m "GET /api/admin/events/:id/sales.csv con pedido, fecha, entradas, total, comisión y reembolsado. Tests incluidos."

echo "Rama $rama creada desde $base con 1 commit:"
git log --oneline -1
git diff --stat "$base...$rama"
echo
echo "Ahora estás en $rama. Para ver el cambio completo: git diff $base...$rama"
