# Demo: de la petición al merge

[← Página anterior](README.md) · [Siguiente página →](01-lab-preguntas-aclaratorias.md)

Esta demostración recorre entero el ciclo de un cambio asistido sobre el issue más pequeño del backlog de Teatralia,
**TEA-101 · La tienda debería filtrar eventos por ciudad**: se lee el issue, se le pregunta a Copilot qué falta, se
comprueba con los datos, el agente hace el cambio, se verifica con `curl`, se escribe el commit y la PR, y se hace
el merge. Cada paso se cierra contra el sistema y no contra lo que dice el chat. Los laboratorios del módulo
practican cada paso por separado con otros issues.

## Punto de partida

- Codespace del fork, terminal en la raíz del repositorio.
- Estado limpio y plataforma arrancada (la segunda orden, en una terminal que se deja abierta):

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
# Arranca API (3000), tienda, backoffice y el resto
make up
```

- Los issues del backlog creados en el fork (una sola vez por fork; necesita `gh`, que en Codespaces ya tiene sesión):

```bash
# Crea un issue por cada fichero teatralia/docs/backlog/TEA-*.md
make backlog
```

El script escribe una línea `creado: TEA-101 · La tienda debería filtrar eventos por ciudad` por issue (o `ya existe:`
si se lanzó antes). El número del issue en GitHub (`#1`, `#2`…) depende del fork.

- Copilot Chat abierto con <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>.

## Recorrido

### 1 — El issue tal como llega

El issue vive en GitHub y también en el repositorio, en `teatralia/docs/backlog/`. Leído en la terminal:

```bash
# El issue TEA-101 tal como lo escribió el equipo
cat teatralia/docs/backlog/TEA-101-filtro-por-ciudad.md
```

```text
---
titulo: "La tienda debería filtrar eventos por ciudad"
etiquetas: [mejora, tienda]
---
Los promotores con salas en varias ciudades piden que la tienda pueda listar solo los eventos de una ciudad.
Ahora `GET /api/public/site` devuelve todos los eventos publicados del promotor.
```

**Cómo se lee:** dos frases. Dicen qué ruta tocar, pero no cómo se llama el parámetro, si distingue mayúsculas ni
qué pasa con una ciudad que no existe. Son las preguntas que el laboratorio [01](01-lab-preguntas-aclaratorias.md)
practica con una petición mucho más ambigua.

### 2 — Preguntar a Copilot qué falta (modo Ask)

En la vista **Chat**, con el modo **Ask** elegido en el desplegable bajo la caja de texto, se envía:

```text
#file:teatralia/docs/backlog/TEA-101-filtro-por-ciudad.md #file:teatralia/services/api/src/routes/public.ts
¿Qué cambio mínimo resuelve este issue? Dime el fichero, la función y la consulta SQL que cambian,
y qué decisiones no están en el issue. No escribas código todavía.
```

**Qué debe contener la respuesta** (el texto cambia en cada ejecución): la ruta `/api/public/site` de `public.ts`,
la consulta `SELECT … FROM events WHERE tenant_id = $1 AND published`, un parámetro de consulta (`?city=` o
similar) y alguna decisión abierta: mayúsculas, ciudad vacía, ciudad inexistente. Si propone filtrar en la tienda
(en el navegador) en vez de en la API, se descarta: el issue nombra la API.

### 3 — Mirar los datos antes de programar

Copilot no sabe qué ciudades hay. La base de datos sí:

```bash
# Cuántas ciudades tiene cada promotor
psql "$DATABASE_URL" -c "SELECT t.name AS promotor, count(DISTINCT e.city) AS ciudades, string_agg(DISTINCT e.city, ', ') AS cuales FROM events e JOIN tenants t ON t.id = e.tenant_id GROUP BY t.name ORDER BY t.name;"
```

```text
      promotor      | ciudades |  cuales  
--------------------+----------+----------
 Auditorio El Olivo |        1 | Sevilla
 Festival Alborada  |        1 | Valencia
 Sala Faro          |        1 | A Coruña
 Sala Marea         |        1 | Bilbao
 Teatro Cierzo      |        1 | Zaragoza
 Teatro Lumen       |        1 | Madrid
(6 rows)
```

**Cómo se lee:** ningún promotor de los datos de ejemplo tiene salas en varias ciudades. El filtro se puede probar
igual (una ciudad devuelve todo, otra no devuelve nada), pero el dato sirve para una pregunta al negocio: ¿qué
promotor lo pide? Es el tipo de hallazgo que solo aparece mirando el sistema, nunca leyendo el issue.

### 4 — El agente hace el cambio (modo Agent)

En un chat nuevo (**+**, *New Chat*) con el modo **Agent**:

```text
Resuelve TEA-101 (#file:teatralia/docs/backlog/TEA-101-filtro-por-ciudad.md) solo en
teatralia/services/api/src/routes/public.ts: GET /api/public/site acepta ?city=<ciudad>,
sin distinguir mayúsculas; sin el parámetro devuelve lo de siempre. SQL parametrizado,
el filtro por tenant_id se mantiene. No toques otros ficheros.
```

El agente propone la edición y la deja pendiente de **Keep** / **Undo**. Una solución que cumple, y que es la que
se usa en el resto de la demo:

```bash
# Qué ha cambiado, en concreto
git diff
```

```text
diff --git a/teatralia/services/api/src/routes/public.ts b/teatralia/services/api/src/routes/public.ts
index 4211f62..ebd4bbe 100644
--- a/teatralia/services/api/src/routes/public.ts
+++ b/teatralia/services/api/src/routes/public.ts
@@ -21,12 +21,15 @@ export async function publicRoutes(app: FastifyInstance) {
     return r.rows;
   });
 
-  app.get('/api/public/site', async (req) => {
+  // ?city=Madrid filtra por ciudad (sin distinguir mayúsculas); sin parámetro, todos los eventos
+  app.get<{ Querystring: { city?: string } }>('/api/public/site', async (req) => {
     const tenant = await tenantOf(req);
+    const city = req.query.city?.trim() || null;
     const events = await pool.query(
       `SELECT id, title, venue, city, category, status, starts_at FROM events
-        WHERE tenant_id = $1 AND published ORDER BY starts_at`,
-      [tenant.id],
+        WHERE tenant_id = $1 AND published AND ($2::text IS NULL OR lower(city) = lower($2))
+        ORDER BY starts_at`,
+      [tenant.id, city],
     );
     return { tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name }, events: events.rows };
   });
```

**Cómo se lee:** un fichero, la ciudad entra como parámetro `$2` (no concatenada en el SQL) y `tenant_id = $1` sigue
en su sitio. Si el agente hubiera tocado más ficheros o quitado el filtro por promotor, se descartaría con **Undo**.

### 5 — Comprobar con el sistema

La API recarga sola al guardar (`make up` vigila los ficheros). Tres llamadas: la ciudad del promotor en minúsculas,
la de otro promotor con su propio slug y la de otro promotor desde el Teatro Lumen:

```bash
# Teatro Lumen, ciudad en minúsculas: tiene que devolver sus 6 eventos
curl -s "localhost:3000/api/public/site?city=madrid" -H "x-teatralia-tenant-slug: teatro-lumen" | jq -r '.events[] | [.id, .city, .title] | @tsv'
# Teatro Lumen pidiendo Sevilla: ninguno
curl -s "localhost:3000/api/public/site?city=Sevilla" -H "x-teatralia-tenant-slug: teatro-lumen" | jq '.events | length'
# Auditorio El Olivo pidiendo Sevilla: los suyos
curl -s "localhost:3000/api/public/site?city=Sevilla" -H "x-teatralia-tenant-slug: auditorio-olivo" | jq '.events | length'
```

```text
EV-LUMEN-0005	Madrid	La casa de Bernarda Alba
EV-LUMEN-0007	Madrid	Impro a la carta
EV-LUMEN-0009	Madrid	Esperando a Godot
EV-LUMEN-0010	Madrid	Cuentos para dormir despiertos
EV-LUMEN-0012	Madrid	Monólogos de enero
EV-LUMEN-0014	Madrid	Bodas de sangre
0
5
```

```bash
# Los tests y el tipado siguen en verde
make test
```

```text
 Test Files  6 passed (6)
      Tests  21 passed (21)
```

**Cómo se lee:** `madrid` en minúsculas encuentra `Madrid`; Sevilla desde el Teatro Lumen da 0 aunque el Auditorio
El Olivo tenga 5 eventos en Sevilla: el filtro por promotor se mantiene. Los tests no cubren la ruta nueva (no hay
tests de rutas en la API); esa ausencia es la que el laboratorio [08](08-lab-trazabilidad.md) convierte en un hueco visible.

### 6 — Rama, commit y mensaje generado

El cambio va en su rama. En la vista **Source Control** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>) el botón de
destellos ✨ de la caja del mensaje (*Generate Commit Message with Copilot*) propone un mensaje a partir del diff
preparado. Se corrige contra el diff y se le añade la referencia al issue (`Closes #1`, con el número del fork):

```bash
# Rama del issue
git switch -c tea-101-filtro-por-ciudad
git add teatralia/services/api/src/routes/public.ts
git commit
```

Mensaje que queda tras corregir el de Copilot:

```text
TEA-101: filtrar eventos de la tienda por ciudad

GET /api/public/site acepta ?city=<ciudad> (sin distinguir mayúsculas).
Sin el parámetro devuelve todos los eventos publicados, como antes.

Closes #1
```

```bash
# Lo que contiene el commit
git show --stat HEAD | tail -3
```

```text
 teatralia/services/api/src/routes/public.ts | 9 ++++++---
 1 file changed, 6 insertions(+), 3 deletions(-)
```

**Cómo se lee:** el mensaje dice qué cambia, el comportamiento por defecto y a qué issue cierra. Nada de «mejora el
rendimiento» ni «añade tests», que es lo que a veces añade la propuesta automática sin que esté en el diff. El
laboratorio [06](06-lab-commit-y-pull-request.md) practica esta corrección con un diff que trae una sorpresa.

### 7 — Pull request y merge

La rama se sube al fork y la PR se abre contra la rama principal del propio fork (no contra el repositorio del curso):

```bash
# Sube la rama a tu fork
git push -u origin tea-101-filtro-por-ciudad
# Abre la PR en tu fork; --fill toma el título y el cuerpo del commit
gh pr create --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" --base main --fill
```

En github.com, la PR muestra en **Files changed** el mismo diff del paso 4. Quien revisa comprueba lo mismo que se ha
comprobado aquí (ciudad parametrizada, filtro por promotor) y aprueba. El merge, con *Squash and merge* en la web o
desde la terminal:

```bash
# Merge con squash y borrado de la rama remota; el issue se cierra por el «Closes #1»
gh pr merge --squash --delete-branch
```

En la pestaña **Issues**, TEA-101 aparece cerrado y enlazado a la PR.

> [!NOTE]
> En github.com, el editor de la descripción de la PR muestra un botón de Copilot para resumir los cambios y la PR
> puede pedir a **Copilot** como revisor (*Reviewers*). Ambas funciones dependen del plan de Copilot de la cuenta;
> con Copilot Free el camino de este módulo es generar la descripción y revisar el diff en el chat de VS Code.

## Qué queda visto

Un issue pequeño ha pasado por todos los eslabones: lectura, preguntas a Copilot, contraste con los datos, cambio del
agente revisado en el diff, prueba con `curl`, commit y PR con mensaje corregido, y merge que cierra el issue. Cada
laboratorio del módulo amplía un eslabón con otro issue: preguntas aclaratorias sobre la lista de espera
([01](01-lab-preguntas-aclaratorias.md)), especificación de los códigos de descuento ([02](02-lab-especificacion-desde-un-issue.md)),
impacto del abono de temporada ([03](03-lab-analisis-de-impacto.md)), plan del agente para el cambio de titular
([04](04-lab-plan-antes-de-ejecutar.md)), cambio en varios ficheros ([05](05-lab-cambio-en-varios-ficheros.md)),
commit y PR ([06](06-lab-commit-y-pull-request.md)), revisión de un diff ([07](07-lab-revisar-un-diff.md)) y
trazabilidad ([08](08-lab-trazabilidad.md)). Todos se pueden hacer sin haber seguido esta demostración.

La pregunta que queda abierta: aquí el issue era tan pequeño que se podía programar casi sin preguntar. ¿Qué pasa
cuando la petición es una frase de un correo y nadie ha decidido todavía qué significa?
