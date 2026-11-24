# Laboratorio: un prompt file reutilizable

[← Página anterior](02-lab-instrucciones-por-ruta.md) · [Siguiente página →](04-lab-codebase-frente-a-file.md)

En el equipo de Plataforma se crean endpoints del backoffice a menudo, y cada persona los pide a Copilot con un
prompt distinto: unos se acuerdan de filtrar por promotor, otros de validar el id, casi nadie pide las pruebas.
Un **prompt file** convierte esa petición en una tarea del equipo: un fichero `.github/prompts/nuevo-endpoint.prompt.md`
con los requisitos fijos y **variables** para lo que cambia (método, ruta, qué hace), que se invoca con
`/nuevo-endpoint`. En este laboratorio lo escribes y lo pruebas con dos endpoints distintos de las **incidencias** de
clientes: leer una incidencia y cambiar su estado.

### Objetivo

Comprender qué es un prompt file: cómo se separa lo fijo de lo variable, cómo se invoca, cómo se prueba con más de
un caso y cómo se corrige cuando un caso sale mal.

### Punto de partida

- Terminal en la raíz del repositorio y Teatralia en su estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- En otra terminal, la plataforma en marcha (la API se recarga sola al guardar):

```bash
# Arranca api, pagos, correo, tienda y backoffice; deja esta terminal abierta
make up
```

- Token de **Sala Faro**: `faro-dev-token`. Sus incidencias de ejemplo son `INC-0003` y `INC-0004`; `INC-0005` es de
  Auditorio El Olivo.
- No hace falta ningún otro fichero de `.github/`: el prompt file lleva dentro todo lo que necesita.

### Qué está pasando

| En el equipo | En este laboratorio |
|--------------|---------------------|
| «Cómo pedimos un endpoint» vive en la cabeza de cada uno | `.github/prompts/nuevo-endpoint.prompt.md`, versionado en el repo |
| Lo que cambia en cada endpoint | Variables `${input:metodo}`, `${input:ruta}`, `${input:que}` |
| Lo que no cambia: promotor, validación, SQL, errores, pruebas | El cuerpo del prompt, igual para todos |
| La revisión del endpoint | Tres `curl`: caso bueno, otro promotor, entrada no válida |

Las incidencias están en la tabla `support_cases`; el backoffice ya tiene `GET /api/admin/cases` (lista), pero no el
detalle ni el cambio de estado (`abierta`, `en curso`, `resuelta`).

### 1 — Mira la incidencia que vas a servir

Antes de pedir nada, miras el dato en crudo: qué columnas tiene una incidencia y de qué promotor es cada una.

```bash
# Tres incidencias: dos de Sala Faro (TN-FARO) y una de El Olivo
psql "$DATABASE_URL" -c "SELECT id, tenant_id, category, status, subject FROM support_cases WHERE id IN ('INC-0003', 'INC-0004', 'INC-0005') ORDER BY id"
```

**Resultado esperado:**

```text
    id    | tenant_id |  category  | status  |           subject           
----------+-----------+------------+---------+-----------------------------
 INC-0003 | TN-FARO   | devolución | abierta | Devolución por aplazamiento
 INC-0004 | TN-FARO   | correo     | abierta | No me ha llegado el correo
 INC-0005 | TN-OLIVO  | cobro      | abierta | Me habéis cobrado dos veces
(3 rows)
```

**Cómo se lee:** con el token de Sala Faro, `INC-0003` y `INC-0004` existen; `INC-0005` no debe existir (404).

### 2 — Escribe el prompt file

Creas el fichero en `.github/prompts/`. La cabecera describe el prompt y elige el modo; el cuerpo es la petición con
los requisitos del equipo, y las variables `${input:nombre:texto de ayuda}` marcan lo que cambia en cada uso.

```bash
# Desde la raíz del repositorio
mkdir -p .github/prompts
cat > .github/prompts/nuevo-endpoint.prompt.md <<'EOF'
---
description: Crea un endpoint de la API de Teatralia con las convenciones del equipo
agent: agent
argument-hint: metodo=GET ruta=/api/admin/... que="qué devuelve o qué cambia"
---
Crea el endpoint `${input:metodo:GET, POST, PATCH…} ${input:ruta:/api/admin/…}` en la API de Teatralia.

Qué hace: ${input:que:qué devuelve o qué cambia}

Requisitos:
1. Ponlo en `teatralia/services/api/src/routes/admin.ts` si la ruta empieza por `/api/admin` (o en `public.ts` si empieza por `/api/public`), junto a los endpoints del mismo recurso.
2. Backoffice: el promotor sale de `adminOf(req)` y toda consulta filtra por su `tenant_id`. Lo que es de otro promotor responde 404, igual que lo que no existe.
3. Valida el formato del id de la ruta con una expresión regular de su prefijo y los valores del cuerpo; si no valen, `HttpError(400, …)` antes de consultar.
4. SQL parametrizado con `$1`, `$2`…; devuelve solo las columnas necesarias, nunca `SELECT *`.
5. Errores con `HttpError` de `services/api/src/errors.ts`, mensajes en español, en minúscula y sin punto final.
6. No cambies otros endpoints ni otros ficheros.

Al terminar, dame tres comandos `curl` contra `localhost:3000` con la cabecera `authorization: Bearer faro-dev-token`:
el caso bueno, un id de otro promotor y una entrada no válida, con la respuesta que esperas de cada uno.
EOF
grep -o '\${input:[a-z]*' .github/prompts/nuevo-endpoint.prompt.md | sort | uniq -c
```

**Resultado esperado:**

```text
      1 ${input:metodo
      1 ${input:que
      1 ${input:ruta
```

**Cómo se lee:** tres variables, cada una una vez. Todo lo demás es fijo y lo recibirá Copilot igual sea quien sea
quien lo invoque.

> [!NOTE]
> En versiones anteriores de VS Code el campo de la cabecera se llamaba `mode:` en lugar de `agent:`. Si el prompt no
> aparece al escribir `/` en el chat, cambia `agent: agent` por `mode: agent`.

### 3 — Primer caso: leer una incidencia

Invocas el prompt con los valores del primer endpoint.

1. Vista **Chat** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>), conversación nueva con **+**.
2. Escribe `/nuevo-endpoint` seguido de los valores y envía:

```text
/nuevo-endpoint metodo=GET ruta=/api/admin/cases/:id que=detalle de una incidencia del promotor (asunto, texto, categoría, estado, pedido y email del comprador)
```

3. Revisa el diff en `admin.ts` y pulsa **Keep**.

> [!TIP]
> Si VS Code te pide los valores en cuadros de texto en lugar de leerlos de la línea, rellénalos ahí: es otra forma de
> dar las mismas variables. Lo que escribas sustituye a `${input:…}` antes de enviar el prompt.

**Qué debe contener la respuesta** (varía en cada ejecución): un `app.get('/api/admin/cases/:id', …)` en `admin.ts`
cerca de `GET /api/admin/cases`, con `adminOf(req)`, una expresión regular como `^INC-\d{4}$`, `tenant_id = $2` en la
consulta, un 404 «incidencia no encontrada» y, al final, tres `curl`.

### 4 — Prueba el primer endpoint

Ejecutas los tres casos que pide el prompt. Copilot te ha dado sus `curl`; estos son los mismos casos con los ids del
punto de partida.

```bash
# Caso bueno, incidencia de otro promotor y id mal formado
curl -s localhost:3000/api/admin/cases/INC-0003 -H 'authorization: Bearer faro-dev-token'; echo
curl -s -i localhost:3000/api/admin/cases/INC-0005 -H 'authorization: Bearer faro-dev-token' | sed -n '1p;$p'; echo
curl -s -i localhost:3000/api/admin/cases/0003 -H 'authorization: Bearer faro-dev-token' | sed -n '1p;$p'; echo
```

**Resultado esperado** (solución de referencia; la fecha depende de la carga de datos):

```text
{"id":"INC-0003","order_id":"PED-2026-1559","buyer_email":"santiago.paz@mail.test","category":"devolución","status":"abierta","subject":"Devolución por aplazamiento","body":"El evento se ha aplazado y la nueva fecha no me viene bien. Pido la devolución completa, gastos incluidos.","created_at":"2026-10-31T19:00:00.000Z"}
HTTP/1.1 404 Not Found
{"error":"incidencia no encontrada"}
HTTP/1.1 400 Bad Request
{"error":"id de incidencia no válido"}
```

**Cómo se lee:** 200 con la incidencia completa, 404 para la de El Olivo y 400 para el id sin prefijo. Si el tercer
caso da 404, el endpoint no valida el formato (requisito 3): el prompt lo pedía, así que es un fallo de este uso.

### 5 — Segundo caso: cambiar el estado

Un prompt file se prueba con **otro** caso, distinto del primero: ahora un endpoint que escribe y tiene cuerpo.

1. Conversación nueva con **+**.
2. Envía:

```text
/nuevo-endpoint metodo=PATCH ruta=/api/admin/cases/:id que=cambia el estado de una incidencia; el cuerpo es {"status": "..."} y solo admite abierta, en curso o resuelta
```

3. Revisa el diff y pulsa **Keep**.

```bash
# Cambio válido, estado inventado, incidencia de otro promotor y estado final en la base de datos
curl -s -X PATCH localhost:3000/api/admin/cases/INC-0004 -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"status":"en curso"}'; echo
curl -s -i -X PATCH localhost:3000/api/admin/cases/INC-0004 -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"status":"cerrada"}' | sed -n '1p;$p'; echo
curl -s -i -X PATCH localhost:3000/api/admin/cases/INC-0005 -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' -d '{"status":"resuelta"}' | sed -n '1p;$p'; echo
psql "$DATABASE_URL" -c "SELECT id, status FROM support_cases WHERE id IN ('INC-0004', 'INC-0005') ORDER BY id"
```

**Resultado esperado** (solución de referencia):

```text
{"id":"INC-0004","status":"en curso"}
HTTP/1.1 400 Bad Request
{"error":"estado no válido: abierta, en curso o resuelta"}
HTTP/1.1 404 Not Found
{"error":"incidencia no encontrada"}
    id    |  status  
----------+----------
 INC-0004 | en curso
 INC-0005 | abierta
(2 rows)
```

**Cómo se lee:** la incidencia de Sala Faro cambia, el estado inventado se rechaza y la de El Olivo **no cambia**
aunque la petición se haya hecho: `INC-0005` sigue `abierta`. Es la comprobación que importa en un endpoint que escribe.

<details>
<summary>Solución de referencia (los dos endpoints en <code>admin.ts</code>)</summary>

```typescript
  // Detalle de una incidencia: /api/admin/cases/INC-0003
  app.get<{ Params: { id: string } }>('/api/admin/cases/:id', async (req) => {
    const t = await adminOf(req);
    if (!/^INC-\d{4}$/.test(req.params.id)) throw new HttpError(400, 'id de incidencia no válido');
    const r = await pool.query(
      `SELECT id, order_id, buyer_email, category, status, subject, body, created_at FROM support_cases
        WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, t.id],
    );
    if (!r.rows[0]) throw new HttpError(404, 'incidencia no encontrada');
    return r.rows[0];
  });

  // Cambio de estado de una incidencia: { "status": "en curso" }
  const CASE_STATUSES = ['abierta', 'en curso', 'resuelta'];
  app.patch<{ Params: { id: string }; Body: { status: string } }>('/api/admin/cases/:id', async (req) => {
    const t = await adminOf(req);
    if (!/^INC-\d{4}$/.test(req.params.id)) throw new HttpError(400, 'id de incidencia no válido');
    const status = String(req.body?.status ?? '');
    if (!CASE_STATUSES.includes(status)) {
      throw new HttpError(400, 'estado no válido: abierta, en curso o resuelta');
    }
    const r = await pool.query(
      `UPDATE support_cases SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, status`,
      [status, req.params.id, t.id],
    );
    if (!r.rows[0]) throw new HttpError(404, 'incidencia no encontrada');
    return r.rows[0];
  });
```

Con los dos endpoints, la API sigue compilando y los tests siguen en verde:

```bash
# Desde teatralia/
npm run typecheck -w @teatralia/api && npm test 2>&1 | grep "Tests "
```

```text

> typecheck
> tsc -p tsconfig.json

      Tests  21 passed (21)
```

</details>

## Comprueba tu entendimiento

**El prompt es del repositorio, no de la conversación**
En una conversación nueva escribe `/` en la caja del chat.
→ `nuevo-endpoint` aparece en la lista con la descripción de la cabecera.

**Las variables se sustituyen**
Invoca `/nuevo-endpoint` sin valores en una conversación nueva y para la respuesta en cuanto empiece (botón de detener).
→ Copilot pide los valores o trabaja con los textos de ayuda (`/api/admin/…`): sin variables, el prompt no sabe qué endpoint crear.

## Experimenta

Predice: si quitas el requisito 3 (validar el formato del id) y repites el primer caso en una rama limpia, ¿qué
responderá `GET /api/admin/cases/0003`?

```bash
# Deja teatralia/ como al principio (el prompt file de .github/ no se toca)
CONFIRM=1 make reset
```

Borra la línea del requisito 3 del prompt, vuelve a invocar `/nuevo-endpoint` con los valores del paso 3 y repite el
tercer `curl` del paso 4. Lo más probable es un 404 «incidencia no encontrada» en lugar de un 400: el endpoint
funciona, pero ya no distingue un id mal escrito de uno que no existe. Ese matiz solo llega a todos los endpoints si
está escrito en el prompt. Vuelve a poner la línea.

## Reto

### 1 — El prompt también para la API pública

**La situación:** el equipo de la tienda quiere usar `/nuevo-endpoint` para `/api/public/…`, pero el requisito 2 habla
de `adminOf(req)` y del token del promotor, que en la API pública no existen: allí el promotor sale del dominio o de
la cabecera `x-teatralia-tenant-slug` con `tenantOf(req)`, y no hay token.

**Qué haces:** cambia el prompt para que el requisito 2 distinga backoffice y API pública, y los `curl` finales
también. Pruébalo con:

```text
/nuevo-endpoint metodo=GET ruta=/api/public/venues/:id que=nombre, ciudad y aforo de un recinto del promotor de la tienda
```

y compruébalo con el recinto de Sala Faro y con el de otro promotor:

```bash
# Recinto propio y recinto de Teatro Lumen, pedidos a la tienda de Sala Faro
curl -s localhost:3000/api/public/venues/VN-FARO -H 'x-teatralia-tenant-slug: sala-faro'; echo
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/public/venues/VN-LUMEN -H 'x-teatralia-tenant-slug: sala-faro'
```

**Pistas:** mira cómo empiezan los endpoints de `teatralia/services/api/src/routes/public.ts`. Las variables pueden
aparecer en una frase condicional («si `${input:ruta}` empieza por…»).

**Lo que buscas:** el primer `curl` devuelve Sala Faro sin `tenant_id` ni `admin_token`; el segundo, `404`.

<details>
<summary>Ver solución</summary>

El requisito 2, reescrito:

```markdown
2. Promotor: en `/api/admin/…` sale de `adminOf(req)` (token del backoffice); en `/api/public/…`, de `tenantOf(req)` (cabecera `x-teatralia-tenant-slug` o dominio). En los dos casos toda consulta filtra por su `tenant_id`, y lo de otro promotor responde 404.
```

Y el final: «…con la cabecera `authorization: Bearer faro-dev-token` si la ruta es de `/api/admin`, o
`x-teatralia-tenant-slug: sala-faro` si es de `/api/public`».

Un endpoint que lo cumple, en `public.ts`:

```typescript
  app.get<{ Params: { id: string } }>('/api/public/venues/:id', async (req) => {
    const tenant = await tenantOf(req);
    if (!/^VN-[A-Z0-9]+$/.test(req.params.id)) throw new HttpError(400, 'id de recinto no válido');
    const r = await pool.query(
      `SELECT id, name, city, capacity FROM venues WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenant.id],
    );
    if (!r.rows[0]) throw new HttpError(404, 'recinto no encontrado');
    return r.rows[0];
  });
```

Salida real:

```text
{"id":"VN-FARO","name":"Sala Faro","city":"A Coruña","capacity":450}
404
```

**La regla:** un prompt file se prueba con casos que lo estiran (otro método, otra parte de la API); cada caso que sale
mal es una línea que el prompt tiene que decir y no decía.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `/nuevo-endpoint` no aparece al escribir `/` | El fichero no acaba en `.prompt.md` o no está en `.github/prompts/` de la raíz | `ls .github/prompts/` y renómbralo |
| Aparece, pero se ejecuta en modo Ask y no edita | La cabecera no tiene `agent: agent` (o `mode: agent` en versiones anteriores) | Corrige la cabecera y vuelve a invocar |
| El prompt llega con `${input:ruta}` sin sustituir | Los valores no se escribieron como `nombre=valor` | Usa `ruta=/api/admin/cases/:id`, sin espacios alrededor del `=` |
| El PATCH devuelve 200 pero la base de datos no cambia | El `UPDATE` filtra por un `tenant_id` equivocado o no tiene `RETURNING` | Revisa la consulta con `psql` como en el paso 5 |
| `curl` del PATCH da 415 | Falta la cabecera `content-type: application/json` | Añádela al `curl` |

## Conclusiones

### Qué es un prompt file

Un fichero `.github/prompts/<nombre>.prompt.md` que se invoca con `/<nombre>` en el chat: una cabecera (descripción,
modo, ayuda de argumentos) y un cuerpo con la petición, donde `${input:…}` marca lo que cambia en cada uso.

```text
/nuevo-endpoint metodo=PATCH ruta=… que=…  →  cuerpo del prompt con los valores  →  Agent  →  diff + 3 curl
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Lo fijo en el cuerpo, lo variable en `${input:…}` | Tres variables, seis requisitos fijos |
| Pide su propia comprobación | Tres `curl`: bueno, otro promotor, no válido |
| Probado con casos distintos | GET de detalle y PATCH con cuerpo |
| Versionado en el repositorio | `.github/prompts/` junto al código |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Requisito que falta | Experimenta: sin el requisito 3, 404 en vez de 400 | Cada endpoint valida a su manera |
| Requisito que solo vale para un caso | Reto: `adminOf` no existe en la API pública | Código que no compila o que no aísla promotores |
| Fiarse de los `curl` de Copilot | Paso 5: solo `psql` muestra que `INC-0005` no cambió | Un PATCH «que funciona» sobre datos ajenos |

### Cómo se perfecciona

Un prompt por tarea repetida, con su caso de prueba anotado en el propio repositorio (por ejemplo, en la descripción
de la pull request que lo introduce), y revisión cuando un uso sale mal. Lo que vale para todas las peticiones sube a
las instrucciones del repositorio; lo que solo vale para esta tarea se queda en el prompt.

### En una frase

> 🔑 Un prompt file convierte «cómo le pedimos esto a Copilot» en código del equipo: lo fijo escrito una vez, lo
> variable en `${input:…}`, y probado con más de un caso.
