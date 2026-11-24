#!/usr/bin/env bash
# M03 · Commit y pull request.
# Deja en teatralia/ cambios sin confirmar, como al final de una tarde de trabajo:
# la tabla Eventos del backoffice con categoría y ciudad, y algo más que se coló mientras probabas.
# Uso (desde la raíz del repo): scripts/m03-cambio-pendiente.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain -- teatralia)" ]; then
  echo "Tienes cambios sin guardar en teatralia/. Guárdalos con un commit o descártalos con: CONFIRM=1 make reset" >&2
  exit 1
fi

git apply <<'PATCH'
diff --git a/teatralia/apps/backoffice/src/sections.tsx b/teatralia/apps/backoffice/src/sections.tsx
index 506bbe2..abcc86b 100644
--- a/teatralia/apps/backoffice/src/sections.tsx
+++ b/teatralia/apps/backoffice/src/sections.tsx
@@ -15,17 +15,20 @@ function useAdmin<T>(path: string) {
 const storefrontOrigin = () => location.origin.replace(/5174/, '5173');
 
 export function Events() {
-  const { data, error } = useAdmin<{ id: string; title: string; venue: string; starts_at: string; sold: number }[]>('/events');
+  const { data, error } = useAdmin<
+    { id: string; title: string; venue: string; city: string; category: string; starts_at: string; sold: number }[]
+  >('/events');
   return (
     <section className="card">
       <h2>Eventos</h2>
       {error && <p role="alert">{error}</p>}
       <table>
-        <thead><tr><th>Evento</th><th>Fecha</th><th>Vendidas</th><th></th></tr></thead>
+        <thead><tr><th>Evento</th><th>Categoría</th><th>Fecha</th><th>Vendidas</th><th></th></tr></thead>
         <tbody>
           {data?.map((e) => (
             <tr key={e.id}>
-              <td><strong>{e.title}</strong><br /><small>{e.id} · {e.venue}</small></td>
+              <td><strong>{e.title}</strong><br /><small>{e.id} · {e.venue} · {e.city}</small></td>
+              <td>{e.category}</td>
               <td>{formatDate(e.starts_at)}</td>
               <td>{e.sold}</td>
               <td><a href={`#/eventos/${e.id}`}>Editar página</a></td>
diff --git a/teatralia/services/api/src/config.ts b/teatralia/services/api/src/config.ts
index d0bb83f..e95462a 100644
--- a/teatralia/services/api/src/config.ts
+++ b/teatralia/services/api/src/config.ts
@@ -4,5 +4,5 @@ export const config = {
   redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
   paymentsUrl: process.env.PAYMENTS_URL ?? 'http://localhost:3001',
   ticketsSecret: process.env.TICKETS_SECRET ?? 'teatralia-dev-solo-para-el-curso',
-  holdMinutes: 10,
+  holdMinutes: 15,
 };
PATCH

echo "Cambios sin confirmar en teatralia/ (no hay commit todavía):"
git status --short -- teatralia
