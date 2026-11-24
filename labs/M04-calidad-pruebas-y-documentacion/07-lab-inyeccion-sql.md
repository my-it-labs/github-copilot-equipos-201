# Laboratorio: revisión de seguridad

[← Página anterior](06-lab-regresion-con-bisect.md) · [Siguiente página →](08-lab-readme-y-openapi.md)

La incidencia TEA-108 parece un fallo menor: «Al buscar O'Connor en Pedidos el backoffice muestra error interno». En una revisión de seguridad, un error con un apóstrofo es una alarma: suele significar que el texto del usuario acaba **dentro** de una consulta SQL. En este lab pides a Copilot una revisión de la búsqueda de pedidos del backoffice, compruebas en local que un promotor puede leer los pedidos de los demás promotores, corriges la consulta con parámetros y dejas un test que impide que vuelva.

### Objetivo

Comprender qué es una revisión de seguridad asistida: cómo se pide a Copilot que busque una vulnerabilidad concreta, cómo debe ser la prueba que la confirma (explotarla en local, con datos de ejemplo y sin tocar sistemas reales), cómo se detecta que un arreglo es aparente y cómo se corrige de raíz con consultas parametrizadas.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio.
- Teatralia en su estado inicial y la plataforma en marcha en una **segunda terminal**:

```bash
# Terminal 1: descarta tus cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

```bash
# Terminal 2: arranca la plataforma y déjala abierta
make up
```

- Backoffice: `http://localhost:5174` (en Codespaces, pestaña **Ports**, puerto 5174), token de Sala Faro `faro-dev-token`.
- Código: `GET /api/admin/orders` en `teatralia/services/api/src/routes/admin.ts`.

> [!WARNING]
> Todo lo que haces en este lab es contra tu Teatralia local, con datos inventados. Probar una inyección contra un sistema que no es tuyo, o sin permiso de su dueño, es un delito.

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Cada promotor solo ve sus pedidos en el backoffice | La consulta filtra por `o.tenant_id = $1`, el promotor del token |
| La búsqueda rápida acepta un email o un número de pedido | El parámetro `q` de `/api/admin/orders` |
| Un texto del usuario que entra en el SQL sin parámetros | `ILIKE '%${req.query.q}%'` dentro de la consulta |
| Un promotor curioso (o un token robado) | `curl` con el token de Sala Faro |

### 1 — Reproduce el síntoma de la incidencia

Primero en el backoffice: entra con `faro-dev-token`, abre **Pedidos** y escribe `O'Connor` en la búsqueda. Verás el aviso de error interno. Después, lo mismo contra la API:

```bash
cd teatralia
# Búsqueda normal: devuelve cuántos pedidos de Sala Faro contienen «ana»
curl -s -G localhost:3000/api/admin/orders -H 'authorization: Bearer faro-dev-token' --data-urlencode 'q=ana' | jq 'length'
# La búsqueda de la incidencia
curl -s -G localhost:3000/api/admin/orders -H 'authorization: Bearer faro-dev-token' --data-urlencode "q=O'Connor" -w '\nHTTP %{http_code}\n'
```

**Resultado esperado:**

```text
9
{"error":"error interno"}
HTTP 500
```

En la terminal 2, la línea de `[api]` del error (un JSON de nivel 50) contiene `"msg":"syntax error at or near \"Connor\""` y el código de PostgreSQL `"code":"42601"`. Un **error de sintaxis SQL** por un apellido: el apóstrofo de `O'Connor` cierra la cadena de texto que el código había abierto en la consulta.

### 2 — Pide a Copilot una revisión de seguridad acotada

Conversación nueva en modo **Ask**. Una revisión útil dice qué buscar y dónde; «revisa la seguridad» a secas da una lista genérica.

```text
#file:teatralia/services/api/src/routes/admin.ts

Haz una revisión de seguridad de la ruta GET /api/admin/orders. Al buscar «O'Connor» en q da
«syntax error at or near "Connor"». Dime: 1) la línea exacta donde el texto de q entra en el SQL;
2) qué tipo de vulnerabilidad es; 3) un valor de q que, con el token de un promotor, devolvería
pedidos de OTROS promotores, explicando cómo queda el WHERE; 4) cómo se corrige con pg. No cambies código.
```

**Qué debe contener la respuesta** (varía en cada ejecución):

- la línea `where += \` AND (o.buyer_email ILIKE '%${req.query.q}%' OR o.id ILIKE '%${req.query.q}%')\`;`;
- que es una **inyección SQL**: el texto del usuario se concatena en la consulta en lugar de ir como parámetro;
- un valor que cierre el paréntesis y añada una condición siempre cierta, del tipo `') OR true --`, y por qué escapa del filtro `o.tenant_id = $1`;
- la corrección: `params.push('%' + q + '%')` y `ILIKE $n`, como ya hacen `status` y `event` en la misma función.

Copilot a veces propone `' OR '1'='1`, el ejemplo de manual. El paso siguiente comprueba si ese valor funciona aquí.

### 3 — Prueba el valor de manual

Comprueba lo que dice Copilot contra el sistema, contando de qué promotor son los pedidos devueltos (el prefijo del evento: `EV-FARO-…`, `EV-LUMEN-…`).

```bash
# Inyección de manual: ¿devuelve pedidos de otros promotores?
curl -s -G localhost:3000/api/admin/orders -H 'authorization: Bearer faro-dev-token' \
  --data-urlencode "q=' OR '1'='1" | jq '[.[].event_id[0:8]] | group_by(.) | map({(.[0]): length}) | add'
```

**Resultado esperado:**

```text
{
  "EV-FARO-": 100
}
```

Devuelve 100 pedidos (el `LIMIT` de la consulta), pero todos de Sala Faro. La consulta queda `o.tenant_id = $1 AND (o.buyer_email ILIKE '%' OR '1'='1%' OR …)`: los paréntesis del propio código encierran el `OR`, y el filtro del promotor se mantiene. La vulnerabilidad existe (el texto cambia la consulta), pero este valor no la explota. Una revisión no termina con «Copilot dice que es vulnerable»: termina con la prueba.

### 4 — Explota la inyección en local

Para escapar del filtro del promotor hay que cerrar el paréntesis del código, añadir una condición siempre cierta y comentar el resto de la línea con `--`:

```bash
# Cierra el paréntesis, añade OR true y comenta el resto de la consulta
curl -s -G localhost:3000/api/admin/orders -H 'authorization: Bearer faro-dev-token' \
  --data-urlencode "q=') OR true --" | jq 'length, ([.[].event_id | split("-")[1]] | group_by(.) | map({(.[0]): length}) | add)'
```

**Resultado esperado:**

```text
2466
{
  "ALBORADA": 612,
  "CIERZO": 208,
  "FARO": 383,
  "LUMEN": 264,
  "MAREA": 475,
  "OLIVO": 524
}
```

Con el token de Sala Faro salen los 2.466 pedidos de la plataforma, de los seis promotores, con el email de cada comprador. El `WHERE` queda así:

```sql
o.tenant_id = $1 AND (o.buyer_email ILIKE '%') OR true -- %' OR o.id ILIKE …) ORDER BY … LIMIT 100
```

`AND` se evalúa antes que `OR`, así que la condición es «(Faro y cualquier email) **o** verdadero»: todo. El `--` comenta además el `ORDER BY` y el `LIMIT`. En la realidad es una fuga de datos personales entre clientes de la plataforma.

### 5 — Corrige con una consulta parametrizada

La corrección no es «limpiar» el texto, sino no meterlo nunca en el SQL: se pasa como parámetro y PostgreSQL lo trata siempre como un valor. Pídeselo a Copilot en modo **Edit**:

```text
#file:teatralia/services/api/src/routes/admin.ts

Corrige la inyección SQL de q en GET /api/admin/orders: pasa el texto como parámetro de pg
(params.push con los % incluidos y $n en el ILIKE), igual que se hace con status y event.
Solo ese bloque; no cambies el resto de la función.
```

**Qué debe contener la respuesta:** un diff de pocas líneas en el bloque `if (req.query.q)`, sin `${req.query.q}` dentro del SQL. Revisa el diff y pulsa **Keep**.

<details>
<summary>Solución de referencia</summary>

```diff
     if (req.query.q) {
-      // búsqueda rápida por email o número de pedido
-      where += ` AND (o.buyer_email ILIKE '%${req.query.q}%' OR o.id ILIKE '%${req.query.q}%')`;
+      // búsqueda rápida por email o número de pedido; el texto va como parámetro, nunca dentro del SQL
+      params.push(`%${req.query.q}%`);
+      where += ` AND (o.buyer_email ILIKE $${params.length} OR o.id ILIKE $${params.length})`;
     }
```

`$${params.length}` escribe en la consulta `$2`, `$3`… según cuántos filtros haya: el texto del usuario viaja aparte, en `params`.

</details>

### 6 — Comprueba el arreglo contra la API

`make up` recarga la API al guardar. Repite las búsquedas: la normal, la de la incidencia, la inyección y una por número de pedido.

```bash
H='authorization: Bearer faro-dev-token'
curl -s -G localhost:3000/api/admin/orders -H "$H" --data-urlencode 'q=ana' | jq 'length'
curl -s -G localhost:3000/api/admin/orders -H "$H" --data-urlencode "q=O'Connor" -w '\nHTTP %{http_code}\n'
curl -s -G localhost:3000/api/admin/orders -H "$H" --data-urlencode "q=') OR true --" -w '\nHTTP %{http_code}\n'
curl -s -G localhost:3000/api/admin/orders -H "$H" --data-urlencode 'q=0107' | jq -c '.[] | {id, buyer_email, total_cents}'
```

**Resultado esperado:**

```text
9
[]
HTTP 200
[]
HTTP 200
{"id":"PED-2026-0107","buyer_email":"ana.compradora@ejemplo.test","total_cents":13370}
```

| Búsqueda | Antes | Después |
|----------|-------|---------|
| `ana` | 9 | 9 (la búsqueda sigue funcionando) |
| `O'Connor` | 500 error interno | 200, lista vacía (no hay ningún O'Connor) |
| `') OR true --` | 2.466 pedidos de 6 promotores | 200, lista vacía (se busca ese texto literal) |
| `0107` | — | El pedido de Ana |

### 7 — Busca la misma familia en el resto de la API

Una inyección rara vez viene sola: el mismo patrón (un valor de la petición dentro de un *template string* de SQL) puede estar en otras rutas. Búscalo en el código:

```bash
# Valores de la petición (req.…) metidos con ${…} en el código de la API
grep -rnE '\$\{req\.' services/api/src
# Consultas construidas con ${…}
grep -rnE "query\(\s*\`[^\`]*\\$\{" services/api/src
```

**Resultado esperado** (tras el arreglo):

```text
services/api/src/routes/admin.ts:157:      params.push(`%${req.query.q}%`);
services/api/src/seed.ts:96:    await db.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}`, params);
```

La primera línea es tu arreglo: `req.query.q` se interpola en el **dato** que va a `params`, no en el SQL. La segunda es la carga de datos de ejemplo, que construye el SQL con nombres de tabla y columnas del propio código (no de una petición) y pasa los valores en `params`: tampoco es una inyección. Antes del arreglo, la primera búsqueda señalaba la línea del `where +=` con `${req.query.q}` dentro de las comillas del SQL. Esa distinción (de dónde viene lo que se interpola) es la que tienes que hacer en cada resultado.

## Comprueba tu entendimiento

**Por qué el valor de manual no bastaba**
Explica con el `WHERE` del paso 4 por qué `' OR '1'='1` devolvió solo pedidos de Sala Faro.
→ Los paréntesis del código encierran el `OR` inyectado y el `AND o.tenant_id = $1` sigue fuera; hay que cerrar el paréntesis para escapar del filtro.

**El parámetro en la consulta**
En el diff del paso 5, explica qué viaja a PostgreSQL como texto de la consulta y qué como dato cuando buscas `O'Connor`.
→ La consulta lleva `ILIKE $2`; el dato `%O'Connor%` va en `params`. El apóstrofo ya no forma parte del SQL.

## Mejora

El arreglo debe quedar protegido por un test. Este usa el servidor real (`buildServer`) contra la base de datos del Codespace, sin levantar puertos, con `app.inject`. Crea `services/api/test/busqueda-pedidos.test.ts`:

```ts
// Necesita la base de datos con los datos de ejemplo (make db-reset)
import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { buildServer } from '../src/server.js';

const app = buildServer();
afterAll(async () => {
  await app.close();
  await pool.end();
});

const buscar = (q: string) =>
  app.inject({
    method: 'GET',
    url: '/api/admin/orders',
    query: { q },
    headers: { authorization: 'Bearer faro-dev-token' },
  });

describe('búsqueda de pedidos del backoffice', () => {
  it("un apellido con apóstrofo (O'Connor) no da error", async () => {
    const r = await buscar("O'Connor");
    expect(r.statusCode).toBe(200);
  });

  it('un texto con SQL no saca pedidos de otros promotores', async () => {
    const r = await buscar("') OR true --");
    expect(r.statusCode).toBe(200);
    const ajenos = r.json().filter((o: { event_id: string }) => !o.event_id.startsWith('EV-FARO-'));
    expect(ajenos).toHaveLength(0);
  });

  it('sigue encontrando por número de pedido', async () => {
    const r = await buscar('0107');
    expect(r.json().map((o: { id: string }) => o.id)).toContain('PED-2026-0107');
  });
});
```

```bash
# LOG_LEVEL=silent evita el registro de cada petición en la salida del test
LOG_LEVEL=silent npx vitest run services/api/test/busqueda-pedidos.test.ts --reporter=verbose
```

**Resultado esperado** con el arreglo:

```text
 ✓ |api| test/busqueda-pedidos.test.ts > búsqueda de pedidos del backoffice > un apellido con apóstrofo (O'Connor) no da error 46ms
 ✓ |api| test/busqueda-pedidos.test.ts > búsqueda de pedidos del backoffice > un texto con SQL no saca pedidos de otros promotores 4ms
 ✓ |api| test/busqueda-pedidos.test.ts > búsqueda de pedidos del backoffice > sigue encontrando por número de pedido 3ms
      Tests  3 passed (3)
```

Y con el código original (pruébalo con `git stash`, ejecuta el test y `git stash pop`):

```text
 × |api| test/busqueda-pedidos.test.ts > búsqueda de pedidos del backoffice > un apellido con apóstrofo (O'Connor) no da error 43ms
 × |api| test/busqueda-pedidos.test.ts > búsqueda de pedidos del backoffice > un texto con SQL no saca pedidos de otros promotores 35ms
 ✓ |api| test/busqueda-pedidos.test.ts > búsqueda de pedidos del backoffice > sigue encontrando por número de pedido 4ms
AssertionError: expected 500 to be 200 // Object.is equality
AssertionError: expected [ …(2083) ] to have a length of +0 but got 2083
      Tests  2 failed | 1 passed (3)
```

2.083 pedidos ajenos: los de los otros cinco promotores. Este test necesita la base de datos; para que funcione también en integración continua, el workflow tiene que levantar un Postgres y cargar los datos (se ve en [Laboratorio: workflow de tests en GitHub Actions](10-lab-workflow-de-tests.md)).

## Reto

### 1 — La lista negra de comillas

**La situación:** en la revisión de tu pull request, un compañero propone una alternativa «más simple»: dejar la consulta como estaba y quitar las comillas del texto antes de meterlo (`q.replace(/'/g, '')`). «Sin comillas no hay inyección». Antes de discutir, lo pruebas.

**Qué haces:** crea en Sala Faro un pedido de un comprador con apóstrofo en el email; después aplica la lista negra en lugar de tus parámetros y busca `O'Connor`, `') OR true --` y `connor`.

```bash
# Un comprador real con apóstrofo (queda como pedido pendiente)
curl -s localhost:3000/api/public/orders -H 'x-teatralia-tenant-slug: sala-faro' -H 'content-type: application/json' \
  -d "{\"event_id\":\"EV-FARO-0042\",\"buyer_email\":\"sean.o'connor@correo.test\",\"items\":[{\"seat_id\":\"A-1\"}]}" | jq -c '{id,status}'
```

**Pistas:** en el bloque `if (req.query.q)`, `const q = String(req.query.q).replace(/'/g, '');` y la consulta original con `${q}`. Compara con lo que devuelve tu versión parametrizada para `O'Connor`.

**Lo que buscas:** saber si la lista negra protege y si la búsqueda sigue haciendo su trabajo.

<details>
<summary>Ver solución</summary>

El pedido creado (con la base de datos recién cargada):

```text
{"id":"PED-2026-2468","status":"pending"}
```

Con la **lista negra**:

```text
== O'Connor
[] HTTP 200
== ') OR true --
[] HTTP 200
== connor
[{"id":"PED-2026-2468","event_id":"EV-FARO-0042","buyer_email":"sean.o'connor@correo.test","status":"pending",…
```

Con los **parámetros** (tu arreglo):

```text
{"id":"PED-2026-2468","buyer_email":"sean.o'connor@correo.test","status":"pending"}
```

La lista negra bloquea esta inyección, pero rompe la búsqueda: `O'Connor` se convierte en `OConnor` y no encuentra a Sean, que sí existe. Además, depende de conocer todos los caracteres peligrosos del motor de base de datos, y la consulta sigue construyéndose con texto del usuario. Con parámetros, el texto se busca tal cual y nunca forma parte del SQL. Deja tu versión con parámetros. **La regla:** los datos del usuario van como parámetros; limpiar el texto es una defensa frágil que además cambia lo que el usuario busca.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `jq: error … Cannot index string` | La respuesta es `{"error":…}` y no una lista | Mira primero la respuesta sin `jq` |
| `curl` devuelve `{"error":"token de promotor no válido"}` | Falta la cabecera o el token está mal escrito | `-H 'authorization: Bearer faro-dev-token'` |
| La inyección devuelve 100 pedidos de Faro | El valor no cierra el paréntesis | Usa `') OR true --` (paso 4) |
| Sin `--data-urlencode`, el valor llega roto | Espacios y comillas en la URL sin codificar | Usa `curl -G … --data-urlencode "q=…"` |
| El test de la Mejora se queda colgado o falla al conectar | Base de datos parada o sin datos | `make db-reset` y comprueba `psql "$DATABASE_URL" -c 'select 1'` |

## Conclusiones

### Qué es una revisión de seguridad asistida

Buscar una clase concreta de fallo (aquí, inyección SQL) en un punto concreto, con Copilot como lector rápido del código, y **demostrarla** en local antes de corregirla. La pista suele ser un síntoma pequeño: un apellido con apóstrofo que da error interno.

```text
síntoma (O'Connor → 500) → revisión acotada (Ask) → prueba de manual (no escapa) → prueba real (2.466 pedidos)
     → arreglo con parámetros → mismas pruebas (vacío, 200) → test de regresión → búsqueda de la familia
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| La revisión dice qué buscar y dónde | Prompt con la ruta, el error y las cuatro preguntas |
| La vulnerabilidad se demuestra, no se supone | `') OR true --` devuelve pedidos de 6 promotores |
| El arreglo es de raíz | Parámetro `$n`, como `status` y `event` |
| Se comprueba con las mismas pruebas | `ana` sigue en 9; inyección y `O'Connor`, vacíos |
| Queda un test | `busqueda-pedidos.test.ts` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Texto del usuario dentro del SQL | `syntax error at or near "Connor"` | Errores con datos legítimos e inyección |
| Prueba de manual que no aplica | `' OR '1'='1` → 100 pedidos de Faro | Falsa tranquilidad («no es explotable») |
| Fuga entre promotores | 2.466 pedidos con el token de Faro | Datos personales de compradores de otros clientes |
| Arreglo con lista negra | No encuentra a `sean.o'connor` | Funcionalidad rota y defensa frágil |

### Cómo se perfecciona

- Pedir a Copilot revisiones acotadas (una ruta, una clase de fallo) y exigir un ejemplo comprobable.
- Usar siempre consultas parametrizadas; buscar periódicamente `${req.` dentro de SQL.
- Dejar un test que reproduzca el ataque, y ejecutarlo en integración continua con la base de datos.
- Complementar con herramientas automáticas (CodeQL en GitHub detecta este patrón).

### En una frase

> 🔑 Una sospecha de seguridad se demuestra en local y se corrige de raíz: el dato del usuario viaja como parámetro y nunca forma parte del SQL.
