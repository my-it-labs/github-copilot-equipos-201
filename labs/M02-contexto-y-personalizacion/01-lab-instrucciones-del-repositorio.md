# Laboratorio: instrucciones del repositorio

[← Página anterior](00-el-contexto-cambia-el-diff.md) · [Siguiente página →](02-lab-instrucciones-por-ruta.md)

Cada conversación nueva con Copilot empieza sin saber nada de Teatralia: ni que el dinero va en céntimos, ni que
cada consulta del backoffice filtra por promotor, ni cómo se devuelven los errores. En este laboratorio escribes
esas convenciones en `.github/copilot-instructions.md`, comprobando cada una en el código, y pides con ellas un
endpoint nuevo del backoffice: **la ficha de un recinto**, `GET /api/admin/venues/:id`. Después compruebas con
`curl` y `grep` que el endpoint cumple las reglas, no solo que funciona.

### Objetivo

Comprender qué son las instrucciones del repositorio: cómo llegan solas a cada petición, cómo tienen que estar
escritas para que sirvan, cómo se detecta si se han aplicado y cómo se mejoran cuando una regla no basta.

### Punto de partida

- Terminal en la raíz del repositorio. Deja Teatralia en su estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- En otra terminal, deja la plataforma en marcha (la API se recarga sola cuando cambia el código):

```bash
# Arranca api, pagos, correo, tienda y backoffice; deja esta terminal abierta
make up
```

- Sin fichero de instrucciones. Si lo tienes de otro laboratorio, apártalo:

```bash
# Sin salida: no hay instrucciones. Si aparece la ruta, muévela fuera con el segundo comando
ls .github/copilot-instructions.md 2>/dev/null
mkdir -p ~/aparte && mv .github/copilot-instructions.md ~/aparte/ 2>/dev/null; true
```

- Token del promotor **Sala Faro**: `faro-dev-token`. Su recinto es `VN-FARO`; el de Teatro Lumen, `VN-LUMEN`.

### Qué está pasando

En el equipo de Plataforma, cada persona que abre Copilot le explica (o no) las mismas cosas: «los importes van en
céntimos», «usa `HttpError`», «nunca concatenes SQL». Lo que no se explica, Copilot lo rellena con lo habitual. El
fichero `.github/copilot-instructions.md` es la forma de explicarlo **una vez, en el repositorio**: VS Code lo añade
a cada petición de chat del workspace, de cualquier persona que haya clonado el repo.

| En el equipo | En este laboratorio |
|--------------|---------------------|
| Las convenciones que se repiten en cada revisión | Las seis reglas que escribes en `copilot-instructions.md` |
| Un endpoint nuevo que pide el equipo de producto | `GET /api/admin/venues/:id`, ficha de un recinto con sus eventos |
| La revisión de la pull request | `curl` contra la API y `grep` sobre el diff |

### 1 — Mira las convenciones en el código

Antes de escribir una regla, compruebas que de verdad es así en Teatralia. Una regla falsa en las instrucciones
genera código que no encaja, en cada petición.

```bash
# Desde teatralia/: columnas de importes en el esquema, 404 con HttpError y filtro por promotor
cd teatralia
grep -c "_cents" services/api/migrations/001_init.sql
grep -n "HttpError(404" services/api/src/routes/admin.ts
grep -n 'WHERE id = \$1 AND tenant_id = \$2' services/api/src/routes/admin.ts
```

**Resultado esperado:**

```text
10
87:    if (!r.rows[0]) throw new HttpError(404, 'evento no encontrado');
99:    if (!r.rows[0]) throw new HttpError(404, 'evento no encontrado');
175:    if (!o.rows[0]) throw new HttpError(404, 'pedido no encontrado');
84:         FROM events WHERE id = $1 AND tenant_id = $2`,
```

**Cómo se lee:** diez columnas `*_cents` en el esquema; los «no encontrado» se lanzan con `HttpError(404, …)` y un
mensaje en español en minúscula; las consultas del backoffice filtran por `id` **y** por `tenant_id` con parámetros
`$1`, `$2`. Los prefijos de los ids están comentados en las migraciones:

```bash
# Ids de cada tabla y su formato (comentario a la derecha)
grep -n "id  *text PRIMARY KEY" services/api/migrations/*.sql
```

```text
services/api/migrations/001_init.sql:4:  id            text PRIMARY KEY,                 -- TN-FARO
services/api/migrations/001_init.sql:21:  id              text PRIMARY KEY,               -- EV-FARO-0042
services/api/migrations/001_init.sql:33:  id          text PRIMARY KEY,                   -- EV-FARO-0042-VIP
services/api/migrations/001_init.sql:54:  id               text PRIMARY KEY,              -- PED-2026-0107
services/api/migrations/001_init.sql:69:  id               text PRIMARY KEY,              -- PED-2026-0107-1
services/api/migrations/002_teatralia.sql:4:  id              text PRIMARY KEY,               -- VN-FARO
services/api/migrations/002_teatralia.sql:23:  id           text PRIMARY KEY,                  -- RE-PED-2026-0107-1
services/api/migrations/002_teatralia.sql:33:  id          text PRIMARY KEY,                   -- INC-0001
```

### 2 — Escribe el fichero de instrucciones

Creas `.github/copilot-instructions.md` en la **raíz del repositorio** (no dentro de `teatralia/`): es la raíz del
workspace que abre el Codespace y ahí es donde VS Code lo busca. Cada línea es una regla que acabas de ver en el
código, escrita con sus nombres reales para que se pueda comprobar en un diff.

```bash
# Vuelve a la raíz del repositorio y crea el fichero de instrucciones
cd ..
mkdir -p .github
cat > .github/copilot-instructions.md <<'EOF'
# Teatralia: instrucciones para Copilot

Plataforma SaaS de venta de entradas. El código está en `teatralia/`: API Fastify + PostgreSQL (`services/api`),
pasarela emulada (`services/payments`), correo por cola BullMQ (`services/notifier`) y apps React (`apps/`).

## Convenciones

- Importes: enteros en céntimos (`price_cents`, `total_cents`). Nunca euros con decimales. Comisión en puntos básicos (`commission_bps`: 750 = 7,5 %).
- Ids con prefijo: promotores `TN-FARO`, recintos `VN-FARO`, eventos `EV-FARO-0042`, pedidos `PED-2026-0107`, reembolsos `RE-PED-2026-0107-1`, incidencias `INC-0001`.
- SQL siempre parametrizado (`pool.query(sql, [valores])` con `$1`, `$2`…). Nunca valores concatenados en el SQL. Sin `SELECT *` en endpoints nuevos.
- Backoffice: el promotor sale de `adminOf(req)` y toda consulta filtra por su `tenant_id`. Lo que es de otro promotor responde 404, igual que lo que no existe.
- Errores de la API: `throw new HttpError(status, 'mensaje')` de `services/api/src/errors.ts`.
- Mensajes al usuario en español, en minúscula y sin punto final (`'pedido no encontrado'`).
EOF
wc -l .github/copilot-instructions.md
```

**Resultado esperado:**

```text
13 .github/copilot-instructions.md
```

> [!TIP]
> Corto y comprobable gana a largo y genérico. «Escribe código limpio y seguro» no cambia nada; «sin `SELECT *` en
> endpoints nuevos» se ve en el diff.

### 3 — Pide el endpoint en una conversación nueva

Pides el endpoint sin repetir ninguna regla en el prompt: si sale bien, es por las instrucciones.

1. Abre la vista **Chat** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>) y empieza una conversación nueva con **+**.
2. En el selector de modo bajo la caja de texto, elige **Agent**.
3. Pega este prompt y envíalo:

```text
Añade a la API de backoffice el endpoint GET /api/admin/venues/:id: la ficha de un recinto
del promotor (nombre, ciudad, aforo, plazas de movilidad reducida) con la lista de sus eventos
publicados ordenados por fecha. Ponlo junto a GET /api/admin/venues.
```

4. Revisa el diff que propone en `teatralia/services/api/src/routes/admin.ts` y pulsa **Keep**.

**Qué debe contener la respuesta** (varía en cada ejecución):

- Un `app.get` nuevo en `admin.ts`, justo después de `GET /api/admin/venues`.
- `adminOf(req)` y `tenant_id = $2` en la consulta del recinto; una consulta de eventos con `venue_id`.
- `throw new HttpError(404, 'recinto no encontrado')` o un mensaje equivalente en español y minúscula.
- En la lista de referencias de la respuesta (**Used n references**, desplegable), `.github/copilot-instructions.md`.

> [!NOTE]
> Según la versión de VS Code, la lista de referencias aparece encima o debajo de la respuesta y con otro texto
> («Used n references», «n referencias»). Si no aparece el fichero de instrucciones, mira en **Settings** que la
> opción de usar ficheros de instrucciones (`github.copilot.chat.codeGeneration.useInstructionFiles`) está activada.

### 4 — Prueba el caso bueno

La API se ha recargado sola al guardar `admin.ts`. Pides la ficha del recinto de Sala Faro con su token.

```bash
# Ficha de VN-FARO como Sala Faro
curl -s localhost:3000/api/admin/venues/VN-FARO -H 'authorization: Bearer faro-dev-token'
```

**Resultado esperado** (con la solución de referencia; la tuya puede traer otros campos o en otro orden):

```text
{"id":"VN-FARO","name":"Sala Faro","city":"A Coruña","capacity":450,"accessible_seats":4,"events":[{"id":"EV-FARO-0038","title":"Noche de boleros","status":"on_sale","starts_at":"2026-10-10T19:00:00.000Z"},{"id":"EV-FARO-0042","title":"Jazz en el Faro","status":"on_sale","starts_at":"2026-12-12T20:00:00.000Z"},{"id":"EV-FARO-0045","title":"Cuarteto Atlántico","status":"sold_out","starts_at":"2026-12-19T19:30:00.000Z"},{"id":"EV-FARO-0047","title":"Tributo a Mercedes Sosa","status":"on_sale","starts_at":"2027-01-23T20:00:00.000Z"},{"id":"EV-FARO-0049","title":"Fado y saudade","status":"postponed","starts_at":"2027-02-13T20:00:00.000Z"}]}
```

**Cómo se lee:** aforo 450 con 4 plazas de movilidad reducida y cinco eventos publicados, del más próximo al más
lejano. Si ves `tenant_id` o `admin_token` en la respuesta, el endpoint usa `SELECT *`: incumple una regla.

### 5 — Prueba lo que dicen las reglas, no solo el caso bueno

Las reglas de aislamiento entre promotores y de errores solo se ven con peticiones que deberían fallar.

```bash
# Recinto de otro promotor (Teatro Lumen) pedido con el token de Sala Faro
curl -s -i localhost:3000/api/admin/venues/VN-LUMEN -H 'authorization: Bearer faro-dev-token' | sed -n '1p;$p'
# Un id con SQL dentro: con consultas parametrizadas no puede dar 500
curl -s -i "localhost:3000/api/admin/venues/VN-FARO'%20OR%201=1--" -H 'authorization: Bearer faro-dev-token' | sed -n '1p;$p'
# Sin token
curl -s -i localhost:3000/api/admin/venues/VN-FARO | sed -n '1p;$p'
```

**Resultado esperado** (solución de referencia):

```text
HTTP/1.1 404 Not Found
{"error":"recinto no encontrado"}
HTTP/1.1 400 Bad Request
{"error":"id de recinto no válido"}
HTTP/1.1 401 Unauthorized
{"error":"token de promotor no válido"}
```

**Cómo se lee:**

| Petición | Respuesta correcta | Si sale otra cosa |
|----------|--------------------|-------------------|
| `VN-LUMEN` con token de Faro | 404 | 200: falta el filtro por `tenant_id`; un promotor ve datos de otro |
| Id con comillas y `OR 1=1` | 400 o 404 | 500 o datos: el id se ha concatenado en el SQL |
| Sin token | 401 | 200: falta `adminOf(req)` |

Si tu endpoint no valida el formato del id, la segunda petición da 404 en vez de 400: también es correcto, porque
el SQL está parametrizado y el id raro simplemente no existe.

### 6 — Revisa el diff contra las reglas

Lo último es leer el cambio como lo haría quien revisa la pull request, buscando cada regla.

```bash
# Desde la raíz: qué ha cambiado y si hay SELECT *, concatenación o mensajes en inglés
git diff --stat
git diff teatralia/services/api/src/routes/admin.ts | grep -n '^+.*\(SELECT \*\|${req\|not found\)'
```

**Resultado esperado** (solución de referencia):

```text
 teatralia/services/api/src/routes/admin.ts | 17 +++++++++++++++++
 1 file changed, 17 insertions(+)
```

**Cómo se lee:** un solo fichero tocado y el `grep` sin salida: en las líneas añadidas (las que empiezan por `+`)
no hay `SELECT *`, ni `${req…}` dentro del SQL, ni mensajes en inglés. El `SELECT *` que ya tenía `GET /api/admin/venues`
no cuenta: es código anterior. Si el `grep` imprime algo, esa línea nueva incumple una regla de las instrucciones.

<details>
<summary>Solución de referencia (<code>services/api/src/routes/admin.ts</code>)</summary>

```typescript
  // Ficha de un recinto del promotor, con sus eventos publicados: /api/admin/venues/VN-FARO
  app.get<{ Params: { id: string } }>('/api/admin/venues/:id', async (req) => {
    const t = await adminOf(req);
    if (!/^VN-[A-Z0-9]+$/.test(req.params.id)) throw new HttpError(400, 'id de recinto no válido');
    const v = await pool.query(
      `SELECT id, name, city, capacity, accessible_seats FROM venues WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, t.id],
    );
    if (!v.rows[0]) throw new HttpError(404, 'recinto no encontrado');
    const e = await pool.query(
      `SELECT id, title, status, starts_at FROM events
        WHERE venue_id = $1 AND tenant_id = $2 AND published ORDER BY starts_at`,
      [req.params.id, t.id],
    );
    return { ...v.rows[0], events: e.rows };
  });
```

</details>

## Comprueba tu entendimiento

**Las instrucciones llegan sin adjuntarlas**
En una conversación nueva, modo **Ask**, sin adjuntar nada, pregunta: «¿Qué formato tiene el id de una incidencia en Teatralia?».
→ Responde `INC-0001` (cuatro cifras) y la lista de referencias incluye `.github/copilot-instructions.md`.

**El endpoint respeta el aislamiento**
`curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/admin/venues/VN-OLIVO -H 'authorization: Bearer faro-dev-token'`
→ `404`: el recinto de Auditorio El Olivo no existe para Sala Faro.

## Investiga

¿Qué otra regla de Teatralia falta en tus instrucciones? Busca en el código algo que se repita y que Copilot no
pueda adivinar. Por ejemplo, el límite de entradas por pedido:

```bash
# Desde teatralia/: reglas de negocio escritas como comentario en el cálculo de importes
grep -n "máximo\|gastos\|comisión" services/api/src/orders/pricing.ts
```

```text
38:    // gastos: por entrada, salvo invitaciones (precio 0) que no pagan gastos
43:    // comisión de plataforma: bps sobre el precio, redondeo por entrada (lo pide liquidaciones)
52:  // máximo 10 entradas por pedido (antirreventa)
54:    throw new Error('máximo 10 entradas por pedido');
```

Decide si cada una merece estar en las instrucciones (aplica a muchas peticiones) o no (solo importa al tocar
`pricing.ts`, y ahí Copilot ya la lee en el código).

## Experimenta

Predice antes de probar: si borras de las instrucciones la línea del backoffice (`adminOf(req)` y `tenant_id`) y
pides en una conversación nueva `GET /api/admin/cases/:id` (detalle de una incidencia), ¿filtrará por promotor?

1. Borra esa línea de `.github/copilot-instructions.md` y guarda.
2. Conversación nueva, modo **Agent**, pide el endpoint y pulsa **Keep**.
3. Compruébalo con una incidencia de otro promotor (`INC-0005` es de Auditorio El Olivo):

```bash
# Incidencia de El Olivo pedida con el token de Sala Faro: lo correcto es 404
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/admin/cases/INC-0005 -H 'authorization: Bearer faro-dev-token'
```

Con la regla, la solución de referencia responde `404`. Sin la regla, Copilot muchas veces la sigue cumpliendo
porque copia el patrón de los endpoints vecinos de `admin.ts`; otras veces no. Esa incertidumbre es la razón de
escribir la regla. Vuelve a poner la línea al terminar.

## Reto

### 1 — Una regla vaga frente a una comprobable

**La situación:** un compañero propone añadir a las instrucciones «Valida bien las entradas de los endpoints».
Tú sospechas que no cambia nada, porque no dice qué es «bien». En Teatralia el equipo ha decidido que un id con
formato incorrecto responde 400 antes de consultar la base de datos.

**Qué haces:** sustituye su frase por una regla comprobable en `.github/copilot-instructions.md` y pide en una
conversación nueva, modo **Agent**, el endpoint `GET /api/admin/refunds/:id` (detalle de un reembolso del
promotor). Pruébalo con un id bueno de Sala Faro, uno de otro promotor y uno mal formado:

```bash
# Bueno (Sala Faro), de otro promotor (Teatro Cierzo) y mal formado
for id in RE-PED-2026-1463-1 RE-PED-2026-0833-1 PED-2026-1463; do
  curl -s -i localhost:3000/api/admin/refunds/$id -H 'authorization: Bearer faro-dev-token' | sed -n '1p;$p'
done
```

**Pistas:** la regla tiene que decir qué se valida (el id de la ruta), cómo (expresión regular con el prefijo de la
tabla), qué se responde (`HttpError(400, …)`) y cuándo (antes de la consulta). Los reembolsos se unen con `orders`
para saber de qué promotor son.

**Lo que buscas:** 200, 404 y 400, en ese orden, y el `grep` del paso 6 sin salida.

<details>
<summary>Ver solución</summary>

La regla, en la lista de convenciones:

```markdown
- Ids de la ruta: valida el formato con una expresión regular de su prefijo (`^VN-…`, `^INC-\d{4}$`…) antes de consultar; si no casa, `HttpError(400, 'id de … no válido')`.
```

Un endpoint que la cumple:

```typescript
  // Detalle de un reembolso: /api/admin/refunds/RE-PED-2026-1463-1
  app.get<{ Params: { id: string } }>('/api/admin/refunds/:id', async (req) => {
    const t = await adminOf(req);
    if (!/^RE-PED-\d{4}-\d{4}-\d+$/.test(req.params.id)) throw new HttpError(400, 'id de reembolso no válido');
    const r = await pool.query(
      `SELECT r.id, r.order_id, r.amount_cents, r.reason, r.ticket_ids, r.created_at
         FROM refunds r JOIN orders o ON o.id = r.order_id
        WHERE r.id = $1 AND o.tenant_id = $2`,
      [req.params.id, t.id],
    );
    if (!r.rows[0]) throw new HttpError(404, 'reembolso no encontrado');
    return r.rows[0];
  });
```

Salida real (la fecha `created_at` cambia en cada `make reset`):

```text
HTTP/1.1 200 OK
{"id":"RE-PED-2026-1463-1","order_id":"PED-2026-1463","amount_cents":7110,"reason":"petición del cliente","ticket_ids":["PED-2026-1463-1","PED-2026-1463-2"],"created_at":"2026-11-02T21:39:22.951Z"}
HTTP/1.1 404 Not Found
{"error":"reembolso no encontrado"}
HTTP/1.1 400 Bad Request
{"error":"id de reembolso no válido"}
```

`RE-PED-2026-0833-1` existe, pero es de Teatro Cierzo: para Sala Faro no existe. Con la frase vaga, Copilot puede
validar o no, y con cualquier criterio; con la regla concreta, quien revisa sabe qué buscar en el diff.
**La regla:** una instrucción sirve si alguien puede decir, mirando un diff, si se ha cumplido.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| La respuesta no lista `copilot-instructions.md` | El fichero está en `teatralia/.github/` en lugar de en `.github/` de la raíz | `mv teatralia/.github/copilot-instructions.md .github/` |
| Tampoco aparece con el fichero en su sitio | La opción de ficheros de instrucciones está desactivada | En **Settings**, busca `useInstructionFiles` y actívala |
| `curl` responde `Connection refused` | `make up` no está en marcha o se paró | Vuelve a lanzar `make up` en su terminal |
| `curl` responde `{"message":"Route GET:/api/admin/venues/VN-FARO not found",…}` | El cambio no se ha guardado o no se pulsó **Keep** | Pulsa **Keep**, guarda con <kbd>Ctrl</kbd>+<kbd>S</kbd> y repite |
| La conversación aplica reglas de un intento anterior | Se reutilizó la conversación | Empieza otra con **+** |

## Conclusiones

### Qué son las instrucciones del repositorio

Un fichero Markdown en `.github/copilot-instructions.md` que VS Code añade a cada petición de chat del workspace.
No es configuración que se ejecute: es contexto que el modelo lee antes de tu prompt.

```text
tu prompt  +  .github/copilot-instructions.md  +  ficheros y búsquedas  →  modelo  →  respuesta
```

### Cómo deben ser

| Requisito | En el lab |
|-----------|-----------|
| Cada regla, comprobada antes en el código | `grep` de `_cents`, `HttpError(404`, `tenant_id = $2` |
| Escrita con los nombres reales | `adminOf(req)`, `price_cents`, `$1` |
| Verificable en un diff | `grep` de las líneas añadidas sin salida |
| Corta | 13 líneas |
| En la raíz del workspace | `.github/` junto a `Makefile`, no en `teatralia/` |

### Dónde se rompen y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Regla vaga | El reto: «valida bien» no dice qué responder | Cada endpoint valida a su manera |
| Regla que falta | Experimenta: sin la línea de `tenant_id` el resultado depende de la suerte | Un promotor puede ver datos de otro |
| Fichero en la ruta equivocada | No aparece en las referencias | Las reglas no llegan |
| Confiar en la regla | Paso 5: solo los casos que fallan prueban el aislamiento | Un fallo de seguridad pasa la revisión |

### Cómo se perfecciona

En un equipo real el fichero se revisa en pull request como el código, se poda cuando crece (cada línea cuesta
contexto en cada petición) y se completa con instrucciones por ruta para lo que solo aplica a una parte del
monorepo. Las reglas que más importan se convierten también en tests o en reglas de lint, que sí se cumplen siempre.

### En una frase

> 🔑 Las instrucciones del repositorio escriben una vez lo que el equipo repetía en cada revisión; sirven si cada
> regla se puede comprobar en un diff, y se comprueban con peticiones que deberían fallar.
