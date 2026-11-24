# Laboratorio: plan antes de ejecutar

[← Página anterior](03-lab-analisis-de-impacto.md) · [Siguiente página →](05-lab-cambio-en-varios-ficheros.md)

Atención al cliente de Teatralia recibe incidencias de «cambio de titular»: alguien regala su entrada y quiere que
figure a nombre de otra persona. El issue **TEA-109** lo resume en una línea: hoy las entradas no tienen titular. Es una
tarea acotada (una columna y un endpoint del backoffice), justo el tamaño en que es tentador decirle al agente «hazlo».
En este laboratorio le pides primero **un plan**, lo corriges con lo que sabes de Teatralia y solo entonces le dejas
ejecutar, revisando que ha hecho lo aprobado y nada más.

### Objetivo

Comprender cómo se planifica un cambio con el agente: cómo funciona pedir un plan sin ejecutar, cómo debe ser un plan
revisable, cómo se detectan en el plan los fallos que luego estarían en el código (promotor, estados, alcance) y cómo
se mejora con una corrección antes de la primera edición.

### Punto de partida

- Codespace del fork, terminal en la raíz del repositorio.
- Estado limpio y plataforma arrancada (la segunda orden en otra terminal, que dejas abierta):

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
# API en 3000 (recarga sola al guardar), backoffice en 5174
make up
```

- Copilot Chat: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>, modo **Agent**.

### Qué está pasando

En modo Agent, Copilot lee ficheros, edita y ejecuta órdenes encadenando pasos. Si le das la tarea entera, sus
decisiones aparecen ya escritas en el código y hay que descubrirlas en el diff. Si le pides antes un **plan**, las
decisiones aparecen en una lista corta que se revisa en un minuto: qué ficheros, qué comprobaciones, qué queda fuera.
Corregir una línea del plan cuesta una frase; corregir el código que salió de ella, otra ronda de edición y revisión.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Las incidencias de clientes | `support_cases` con categoría *cambio de titular* |
| Quien cambia el titular | Atención al cliente, desde el backoffice del promotor |
| La propuesta del compañero | El plan del agente |
| La revisión del plan | La lista de comprobación del paso 3, contrastada con `grep` |

### 1 — Mira el issue y las incidencias que lo originan

```bash
# El issue
cat teatralia/docs/backlog/TEA-109-cambio-de-titular.md
# Las incidencias de cambio de titular, con su pedido y la fecha del evento
psql "$DATABASE_URL" -c "
SELECT c.id, c.order_id, c.status, t.slug AS promotor, e.starts_at::date AS evento
  FROM support_cases c JOIN tenants t ON t.id = c.tenant_id
  JOIN orders o ON o.id = c.order_id JOIN events e ON e.id = o.event_id
 WHERE c.category = 'cambio de titular' ORDER BY c.id;"
```

**Resultado esperado:**

```text
---
titulo: "Cambio de titular de una entrada"
etiquetas: [petición de negocio]
---
Muchas incidencias piden poner la entrada a nombre de otra persona. Hoy las entradas no tienen titular.
    id    |   order_id    |  status  |     promotor      |   evento   
----------+---------------+----------+-------------------+------------
 INC-0009 | PED-2026-0431 | resuelta | festival-alborada | 2026-09-12
 INC-0019 | PED-2026-2191 | resuelta | sala-faro         | 2026-12-12
 INC-0029 | PED-2026-0569 | abierta  | festival-alborada | 2026-09-12
 INC-0039 | PED-2026-0913 | resuelta | sala-faro         | 2026-10-10
(4 rows)
```

**Cómo se lee:** cuatro incidencias reales. La única abierta (INC-0029) es de un evento ya celebrado: un plan que no
compruebe la fecha del evento dejaría cambiar el titular de una entrada usada. `PED-2026-2191` (Sala Faro, 12 de
diciembre) es el caso que sí debe funcionar.

### 2 — Pide el plan, sin ejecutar nada

Chat nuevo, modo **Agent**. La primera línea del prompt es la que impide que edite:

```text
NO edites ni crees ficheros todavía: solo quiero un plan.
Tarea: TEA-109 (#file:teatralia/docs/backlog/TEA-109-cambio-de-titular.md). Atención al cliente pone
una entrada a nombre de otra persona desde el backoffice. Alcance: solo la API.
Dame un plan numerado con: ficheros que crearás o cambiarás (ruta exacta), el endpoint (método, ruta,
cuerpo, respuestas y códigos de error), las comprobaciones que hará, y cómo lo probarás con curl.
Al final, lista lo que NO vas a hacer.
```

**Qué debe contener la respuesta** (cambia en cada ejecución): una migración nueva en
`teatralia/services/api/migrations/`, una ruta nueva en `routes/admin.ts`, un cuerpo con el nombre del titular y unos
`curl`. Fíjate en lo que **falta** o **sobra**; es lo habitual:

- no comprueba que la entrada sea del promotor del token (o lo comprueba con una columna que no existe);
- no comprueba el estado de la entrada ni la fecha del evento;
- añade cosas fuera del alcance: regenerar el QR, enviar un correo, tocar la tienda, una pantalla del backoffice;
- llama a la migración `001_…` o la mete en un fichero existente.

No pulses nada que aplique cambios. Si el agente ha editado algo pese a todo, descártalo con **Undo**.

### 3 — Revisa el plan contra el sistema

Cada duda del plan se resuelve mirando Teatralia, no preguntándole al agente si está seguro. Dos comprobaciones:

```bash
# ¿Tienen las entradas columna de promotor? (la tabla tickets en el esquema)
grep -n -A4 "CREATE TABLE tickets" teatralia/services/api/migrations/001_init.sql
# ¿Qué número le toca a la migración nueva?
ls teatralia/services/api/migrations/
```

**Resultado esperado:**

```text
68:CREATE TABLE tickets (
69-  id               text PRIMARY KEY,              -- PED-2026-0107-1
70-  order_id         text NOT NULL REFERENCES orders(id),
71-  event_id         text NOT NULL REFERENCES events(id),
72-  kind             text NOT NULL,                 -- seat | pass
001_init.sql
002_teatralia.sql
```

**Cómo se lee:** `tickets` no tiene `tenant_id`; el promotor se saca del pedido (`order_id` → `orders.tenant_id`). La
migración nueva es `003_…`. Con esto y el paso 1, revisa el plan fila a fila:

| Comprobación | Lo que el plan debe decir | Por qué en Teatralia |
|--------------|---------------------------|----------------------|
| Promotor | Busca la entrada uniendo con `orders` y filtra por `tenant_id` del token; si no, 404 | Sin esto, un promotor cambia entradas de otro |
| Estado | Solo entradas `valid`; `refunded` o `void` → 409 | Una entrada devuelta no tiene titular |
| Fecha | Evento sin empezar; si ya empezó → 409 | INC-0029 es de un evento celebrado |
| Validación | Nombre recortado, longitud mínima y máxima → 400 | Evita titulares vacíos |
| SQL | Parámetros `$1, $2…`, nunca concatenado | Convención del repo |
| Migración | Fichero nuevo `003_…`, sin tocar `001` ni `002` | Las migraciones aplicadas no se reescriben |
| Detalle del pedido | `GET /api/admin/orders/:id` devuelve también el titular | Si no se ve, atención al cliente no sabe si se cambió |
| Fuera de alcance | Sin QR nuevo, sin correo, sin tienda, sin pantalla | Alcance pedido: solo la API |

### 4 — Corrige el plan

Escribe al agente solo las correcciones, en el mismo chat. Un ejemplo con las más habituales (adapta las que tu plan
ya cumpla):

```text
Correcciones al plan, sigue sin editar:
1. tickets no tiene tenant_id: busca la entrada con JOIN a orders y filtra por o.tenant_id del token.
   Si no es del promotor, 404 "entrada no encontrada".
2. Solo entradas en estado valid (409 si no) y de eventos que no hayan empezado (409 "el evento ya ha empezado").
3. holder_name recortado, de 3 a 80 caracteres (400 si no).
4. Migración nueva 003_titular_de_entrada.sql con ALTER TABLE tickets ADD COLUMN holder_name text.
5. GET /api/admin/orders/:id devuelve holder_name en cada entrada.
6. Fuera: QR, correos, tienda y pantallas del backoffice.
Devuélveme el plan corregido, numerado.
```

**Qué debe contener la respuesta:** el plan con exactamente dos ficheros (`migrations/003_titular_de_entrada.sql` y
`routes/admin.ts`), las cuatro comprobaciones y la lista de lo que no hará. Si añade algo nuevo («y un test e2e»),
quítalo ahora con otra frase.

### 5 — Deja ejecutar el plan aprobado

```text
El plan corregido está aprobado. Ejecútalo tal cual, sin pasos extra. Cuando termines, dime qué
ficheros has tocado.
```

El agente edita y deja los cambios pendientes de **Keep** / **Undo**. Antes de aceptar, mira en la terminal qué ha
tocado de verdad:

```bash
# Ficheros cambiados y nuevos en teatralia/
git status --short
git diff --stat
```

**Resultado esperado** (con la solución de referencia):

```text
 M teatralia/services/api/src/routes/admin.ts
?? teatralia/services/api/migrations/003_titular_de_entrada.sql
 teatralia/services/api/src/routes/admin.ts | 21 ++++++++++++++++++++-
 1 file changed, 20 insertions(+), 1 deletion(-)
```

**Cómo se lee:** un fichero cambiado y uno nuevo (`??`, sin seguimiento, por eso no sale en `git diff --stat`). Si
aparece cualquier otro fichero, no estaba en el plan: **Undo** en ese fichero o pregunta al agente por qué. Pulsa
**Keep** solo cuando la lista coincida con el plan.

> [!IMPORTANT]
> La API aplica las migraciones al arrancar. `make up` reinicia la API al guardar `admin.ts`, pero no al crear un
> `.sql`: si el agente creó la migración después de editar `admin.ts`, la columna no existe todavía. Para la API en su
> terminal (<kbd>Ctrl</kbd>+<kbd>C</kbd>) y vuelve a lanzar `make up`.

<details>
<summary>Solución de referencia</summary>

`teatralia/services/api/migrations/003_titular_de_entrada.sql`:

```sql
-- TEA-109: titular de la entrada (nombre de la persona que va a usarla). NULL = el comprador
ALTER TABLE tickets ADD COLUMN holder_name text;
```

`teatralia/services/api/src/routes/admin.ts` (diff):

```diff
@@ -174,7 +174,7 @@ export async function adminRoutes(app: FastifyInstance) {
     );
     if (!o.rows[0]) throw new HttpError(404, 'pedido no encontrado');
     const tickets = await pool.query(
-      `SELECT id, kind, seat_id, pass_type_id, price_cents, fee_cents, status, checked_in_at
+      `SELECT id, kind, seat_id, pass_type_id, price_cents, fee_cents, status, checked_in_at, holder_name
          FROM tickets WHERE order_id = $1 ORDER BY id`,
       [req.params.id],
     );
@@ -194,6 +194,25 @@ export async function adminRoutes(app: FastifyInstance) {
     },
   );
 
+  // TEA-109: atención al cliente pone una entrada a nombre de otra persona
+  app.put<{ Params: { id: string }; Body: { holder_name: string } }>('/api/admin/tickets/:id/holder', async (req) => {
+    const t = await adminOf(req);
+    const name = String(req.body?.holder_name ?? '').trim();
+    if (name.length < 3 || name.length > 80) throw new HttpError(400, 'el titular debe tener entre 3 y 80 caracteres');
+    const r = await pool.query(
+      `SELECT k.id, k.status, e.starts_at FROM tickets k
+         JOIN orders o ON o.id = k.order_id JOIN events e ON e.id = k.event_id
+        WHERE k.id = $1 AND o.tenant_id = $2`,
+      [req.params.id, t.id],
+    );
+    const ticket = r.rows[0];
+    if (!ticket) throw new HttpError(404, 'entrada no encontrada');
+    if (ticket.status !== 'valid') throw new HttpError(409, `no se puede cambiar el titular de una entrada ${ticket.status}`);
+    if (new Date(ticket.starts_at) <= new Date()) throw new HttpError(409, 'el evento ya ha empezado');
+    await pool.query('UPDATE tickets SET holder_name = $1 WHERE id = $2', [name, req.params.id]);
+    return { id: req.params.id, holder_name: name };
+  });
+
   // Panel: ventas por evento
```

</details>

### 6 — Comprueba el plan con el sistema

Cada comprobación del plan es un caso de `curl`. Primero el caso bueno, después el de otro promotor y el del evento
celebrado:

```bash
# Sala Faro cambia el titular de una entrada válida de PED-2026-2191 (evento el 12 de diciembre)
curl -s -X PUT localhost:3000/api/admin/tickets/PED-2026-2191-1/holder -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"holder_name":"Lucía Pérez"}'; echo
# El Teatro Lumen intenta lo mismo con la entrada de Sala Faro
curl -s -X PUT localhost:3000/api/admin/tickets/PED-2026-2191-1/holder -H 'authorization: Bearer lumen-dev-token' -H 'content-type: application/json' -d '{"holder_name":"Intruso"}'; echo
# INC-0029: entrada de un evento ya celebrado
curl -s -X PUT localhost:3000/api/admin/tickets/PED-2026-0569-1/holder -H 'authorization: Bearer alborada-dev-token' -H 'content-type: application/json' -d '{"holder_name":"Marta Gil"}'; echo
```

**Resultado esperado:**

```text
{"id":"PED-2026-2191-1","holder_name":"Lucía Pérez"}
{"error":"entrada no encontrada"}
{"error":"el evento ya ha empezado"}
```

Y en el detalle del pedido, el titular queda guardado solo en esa entrada:

```bash
# El detalle que ve atención al cliente
curl -s localhost:3000/api/admin/orders/PED-2026-2191 -H 'authorization: Bearer faro-dev-token' | jq -c '.tickets[] | {id, status, holder_name}'
```

```text
{"id":"PED-2026-2191-1","status":"valid","holder_name":"Lucía Pérez"}
{"id":"PED-2026-2191-2","status":"valid","holder_name":null}
{"id":"PED-2026-2191-3","status":"valid","holder_name":null}
{"id":"PED-2026-2191-4","status":"valid","holder_name":null}
```

**Cómo se lee:** cada línea responde a una fila de la tabla del paso 3. Si el segundo `curl` devuelve el titular
cambiado, el filtro por promotor falta y el plan corregido no se ha cumplido: vuelve al diff.

## Comprueba tu entendimiento

**Entrada devuelta**
Busca una entrada reembolsada de Sala Faro de un evento futuro y pide cambiar su titular:

```bash
# Primera entrada reembolsada de Sala Faro de un evento que no ha empezado
psql "$DATABASE_URL" -Atc "SELECT k.id FROM tickets k JOIN events e ON e.id = k.event_id WHERE e.tenant_id = 'TN-FARO' AND k.status = 'refunded' AND e.starts_at > now() ORDER BY k.id LIMIT 1;"
# Cambia PED-2026-0808-1 por el id que te haya salido
curl -s -X PUT localhost:3000/api/admin/tickets/PED-2026-0808-1/holder -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"holder_name":"Lucía Pérez"}'; echo
```

→ `PED-2026-0808-1` y `{"error":"no se puede cambiar el titular de una entrada refunded"}`.

**Nombre vacío**
Repite el primer `curl` del paso 6 con `"holder_name":" "` sobre `PED-2026-2191-2`.
→ `{"error":"el titular debe tener entre 3 y 80 caracteres"}`.

## Experimenta

**Predice antes:** si abres un chat nuevo en modo Agent y pegas solo la tarea del paso 2 **sin** la primera línea
(«NO edites… solo quiero un plan»), ¿cuántos ficheros tocará el agente y cuántas de las cuatro comprobaciones (promotor,
estado, fecha, nombre) tendrá el código?

Prueba con `CONFIRM=1 make reset` antes y compara `git status --short` y el diff con los de la solución. Lo habitual es
que el agente edite directamente, a veces con un fichero de más (un componente del backoffice, un test) y alguna
comprobación de menos. Cuenta las diferencias: son las correcciones que el plan te habría ahorrado. Vuelve a dejarlo
como estaba con `CONFIRM=1 make reset`.

## Reto

### 1 — Una regla que el plan no tenía

**La situación:** el responsable de atención al cliente lee tu PR y pide una regla más: «una entrada que ya ha pasado
por la puerta (`checked_in_at` no nulo) no puede cambiar de titular, aunque el evento dure varios días». Los pases de
varios días del Festival Alborada son exactamente eso.

**Qué haces:** pide al agente un plan **solo para este cambio**, revísalo (una línea en la consulta, un 409 y nada
más) y ejecútalo. Después pruébalo marcando una entrada como usada en la base de datos.

**Pistas:** la consulta de la ruta ya lee la entrada; basta con traer `k.checked_in_at` y comprobarlo antes de la
fecha. Para simular la puerta: `UPDATE tickets SET checked_in_at = now() WHERE id = '…'`.

**Lo que buscas:** que una entrada válida con `checked_in_at` responda 409 y que el resto de casos del paso 6 sigan
igual.

<details>
<summary>Ver solución</summary>

El cambio en `routes/admin.ts`, dentro de la ruta del titular:

```diff
-      `SELECT k.id, k.status, e.starts_at FROM tickets k
+      `SELECT k.id, k.status, k.checked_in_at, e.starts_at FROM tickets k
...
     if (ticket.status !== 'valid') throw new HttpError(409, `no se puede cambiar el titular de una entrada ${ticket.status}`);
+    if (ticket.checked_in_at) throw new HttpError(409, 'la entrada ya se ha usado');
     if (new Date(ticket.starts_at) <= new Date()) throw new HttpError(409, 'el evento ya ha empezado');
```

La prueba:

```bash
# Marca como usada la segunda entrada de PED-2026-2191 y pide el cambio
psql "$DATABASE_URL" -c "UPDATE tickets SET checked_in_at = now() WHERE id = 'PED-2026-2191-2';"
curl -s -X PUT localhost:3000/api/admin/tickets/PED-2026-2191-2/holder -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"holder_name":"Lucía Pérez"}'; echo
```

```text
UPDATE 1
{"error":"la entrada ya se ha usado"}
```

La regla nueva cabe en el plan como una línea más; si se hubiera pedido «añade lo del check-in» sin plan, el agente
podría haber tocado también `routes/tickets.ts` (la validación en puerta). **La regla:** cada cambio, por pequeño que
sea, pasa por plan → revisión → ejecución; el plan pequeño se revisa en segundos y fija el alcance.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| El agente empieza a editar en el paso 2 | El modo Agent ejecuta si el prompt lo permite | Primera línea «NO edites… solo un plan»; si ya editó, **Undo** |
| `{"error":"error interno"}` y en la terminal de la API `column "holder_name" does not exist` | La migración se creó después del último arranque de la API | <kbd>Ctrl</kbd>+<kbd>C</kbd> en la terminal de `make up` y vuelve a lanzar `make up` |
| `git status` muestra ficheros fuera del plan | El agente ha añadido pasos «útiles» | **Undo** en esos ficheros o `git restore <fichero>` |
| El segundo `curl` (Teatro Lumen) cambia el titular | Falta el filtro por `o.tenant_id` | Corrige la consulta: `JOIN orders o … AND o.tenant_id = $2` |
| `{"error":"el evento ya ha empezado"}` en `PED-2026-2191` | Haces el lab después del 12 de diciembre de 2026 | Usa una entrada válida de un evento futuro (`EV-FARO-0047`, enero de 2027) |

## Conclusiones

### Qué es planificar con el agente

Es separar **decidir** de **ejecutar**: el agente propone qué ficheros tocará, qué comprobará y qué deja fuera; tú lo
contrastas con el sistema y lo corriges; solo con el plan aprobado edita. El plan es el contrato con el que luego se
revisa el diff.

### Cómo debe ser un plan revisable

| Requisito | En el lab |
|-----------|-----------|
| Rutas exactas de los ficheros | `migrations/003_titular_de_entrada.sql`, `routes/admin.ts` |
| Contrato del endpoint con errores | `PUT /api/admin/tickets/:id/holder`, 400 / 404 / 409 |
| Comprobaciones de negocio explícitas | Promotor, estado, fecha, nombre |
| Lo que no se hará | QR, correo, tienda, pantallas |
| Cómo se probará | Cuatro `curl` con resultados conocidos |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Filtro por promotor ausente o con columna inventada | `grep CREATE TABLE tickets`: no hay `tenant_id` | Un promotor modifica entradas de otro |
| Sin comprobación de fecha | INC-0029 de un evento celebrado | Titular cambiado en una entrada ya usada |
| Alcance que crece | Ficheros de más en `git status` | Un diff más grande que el pedido |
| Migración creada tarde | `column … does not exist` | El cambio parece roto sin estarlo |

### Cómo se perfecciona

El equipo guarda la lista del paso 3 como prompt file (`/plan` con las filas promotor, estado, céntimos, SQL
parametrizado, migración nueva, fuera de alcance) y la añade a las instrucciones del repositorio. El plan aprobado se
pega en la descripción de la PR: quien revisa compara el diff con él.

### En una frase

> 🔑 Pedir el plan antes que el código convierte las decisiones del agente en una lista que se corrige con una frase, en lugar de un diff que se corrige con otra ronda de trabajo.
