# Laboratorio: un servidor MCP sobre la base de datos

[← Página anterior](00-copilot-mas-alla-del-editor.md) · [Siguiente página →](02-lab-mcp-github.md)

Finanzas pregunta a Plataforma cada semana cosas que el código no responde: qué evento de un promotor deja más dinero, cuánto se ha devuelto, qué incidencias siguen abiertas. Hasta ahora alguien abría `psql` y escribía la consulta. En este laboratorio pones en marcha el **servidor MCP de solo lectura** de Teatralia en tu VS Code, le haces preguntas de negocio desde Copilot, contrastas cada respuesta con `psql` y compruebas qué impide que ese servidor cambie datos.

### Objetivo

Comprender qué es un servidor MCP de solo lectura sobre datos: cómo funciona, cómo debe ser, cómo se detectan sus debilidades y cómo se mejora.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repo. Estado limpio de código y datos:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- Servidor MCP: [`teatralia/tools/mcp-teatralia/`](../../teatralia/tools/mcp-teatralia/server.ts), y su configuración en [`.vscode/mcp.json`](../../.vscode/mcp.json) (entrada `teatralia`).
- Copilot Chat (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>). Con Copilot Free cada mensaje cuenta para tu cupo mensual: el laboratorio usa pocos y el modelo por defecto.

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Finanzas y atención al cliente hacen preguntas sobre ventas, pedidos e incidencias | Tú, en el chat de Copilot, en modo **Agent** |
| Alguien del equipo traduce la pregunta a SQL y la lanza en producción | El modelo elige una **herramienta MCP** y sus argumentos; el servidor lanza una consulta ya escrita |
| Esa persona tiene permisos de lectura, no de escritura | El servidor abre transacciones `READ ONLY`; en la mejora, con un usuario que solo puede leer |
| El email del comprador es un dato personal | `buscar_pedido` lo devuelve enmascarado (`a***@ejemplo.test`) |

El servidor publica cuatro herramientas con nombre de negocio. No hay una herramienta para «ejecutar SQL»: lo que no está publicado, el modelo no lo puede pedir por esta vía.

### 1 — Instala las dependencias del servidor

El servidor es un paquete Node aparte (no es un workspace de `teatralia/`). Necesita el SDK oficial de MCP, el cliente de Postgres y `zod` para validar parámetros.

```bash
# Instala las dependencias del servidor MCP de Teatralia
npm --prefix teatralia/tools/mcp-teatralia install --no-audit --no-fund
```

**Resultado esperado** (el tiempo varía):

```text
added 109 packages in 748ms
```

Si ya estaban instaladas, npm dice `up to date`.

### 2 — Lee el servidor antes de usarlo

Antes de dar a Copilot acceso a datos, mira qué puede hacer. Abre [`teatralia/tools/mcp-teatralia/server.ts`](../../teatralia/tools/mcp-teatralia/server.ts) en el editor y localiza estas tres partes:

```ts
// 1. La conexión: toda la sesión es de solo lectura y ninguna consulta pasa de 5 s
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  options: '-c default_transaction_read_only=on -c statement_timeout=5000',
});

// 2. Cada consulta, parametrizada ($1, $2…) y dentro de BEGIN TRANSACTION READ ONLY
await client.query('BEGIN TRANSACTION READ ONLY');
const res = await client.query(sql, params);

// 3. Cada herramienta: nombre, descripción (lo que lee el modelo), parámetros validados y la consulta
server.registerTool('buscar_pedido', {
  description: 'Detalle de un pedido por su número (PED-AAAA-NNNN)…',
  inputSchema: { pedido: z.string().regex(/^PED-\d{4}-\d{4}$/) },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ pedido }) => { /* SELECT … WHERE o.id = $1 */ });
```

Cómo se lee: la **descripción** es lo que el modelo usa para decidir; el **`inputSchema`** rechaza argumentos mal formados antes de tocar la base de datos; la **consulta** está escrita por el equipo y recibe los valores como parámetros, nunca concatenados.

### 3 — Prueba el servidor desde la terminal

Antes de meter a Copilot en medio, comprueba que el servidor arranca y responde. `probar.ts` es un cliente MCP mínimo: arranca el servidor por stdio, pide la lista de herramientas y, si le das una, la llama.

```bash
# Lista las herramientas que publica el servidor (usa la DATABASE_URL de tu terminal)
node teatralia/tools/mcp-teatralia/probar.ts
```

**Resultado esperado:**

```text
ventas_por_evento(evento, promotor)  [solo lectura]
  Ventas de cada evento: pedidos cobrados, entradas válidas, importe cobrado, reembolsado, neto y comisión de Teatralia, en euros. Filtra por evento o por promotor; sin filtros devuelve todos, de más a menos neto.
buscar_pedido(pedido)  [solo lectura]
  Detalle de un pedido por su número (PED-AAAA-NNNN): evento, estado, importes, entradas y reembolsos. El email del comprador sale enmascarado.
incidencias_abiertas(promotor, categoria)  [solo lectura]
  Incidencias de clientes sin resolver (estado «abierta» o «en curso»), las más antiguas primero. Filtra por promotor y por categoría (devolución, cambio de titular, acceso, cobro, accesibilidad, correo).
ocupacion_evento(evento)  [solo lectura]
  Aforo de un evento (butacas numeradas + plazas de pases), entradas válidas vendidas, plazas libres y porcentaje de ocupación.
```

Cuatro herramientas, cada una con sus parámetros. Esto es exactamente lo que recibirá Copilot.

<details>
<summary>Qué hace por dentro (<code>teatralia/tools/mcp-teatralia/probar.ts</code>)</summary>

```ts
// Arranca server.ts como proceso hijo y se conecta por stdio, como hace VS Code
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL('./server.ts', import.meta.url).pathname],
  env: { ...process.env },          // DATABASE_URL llega desde tu terminal
});
const client = new Client({ name: 'probar-mcp-teatralia', version: '1.0.0' });
await client.connect(transport);    // initialize + notifications/initialized

// Sin argumentos: tools/list. Con argumentos: tools/call
const { tools } = await client.listTools();
const res = await client.callTool({ name: herramienta, arguments: JSON.parse(argumentos) });
```

</details>

### 4 — Arranca el servidor en VS Code

Ahora lo arranca VS Code, que es quien lo pondrá a disposición de Copilot.

1. Abre la paleta de comandos (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) y ejecuta **MCP: List Servers**.
2. Elige `teatralia` y pulsa **Start Server**. Si VS Code pregunta si confías en el servidor, acepta: es código del repo que acabas de leer.
3. Vuelve a **MCP: List Servers** → `teatralia` → **Show Output**.

**Resultado esperado:** el panel **Output** muestra el arranque del servidor y la línea `mcp-teatralia: listo (stdio, solo lectura)`, y a continuación que ha descubierto 4 herramientas.

> [!NOTE]
> Los nombres de estos comandos han cambiado entre versiones de VS Code. Si no los encuentras, abre `.vscode/mcp.json`: encima de cada servidor hay un enlace **Start** (o **Running** si ya está arrancado) que hace lo mismo.

### 5 — Activa sus herramientas en el chat

Las herramientas MCP solo las usa el modo **Agent**, y solo las que estén marcadas.

1. En la vista **Chat**, pulsa **+** (**Chat: New Chat**) y elige **Agent** en el selector de modo, bajo la caja de texto.
2. Pulsa el botón de herramientas (llave y destornillador, **Configure Tools…**).
3. Busca el grupo `teatralia` y comprueba que sus cuatro herramientas están marcadas. Pulsa **OK**.

**Resultado esperado:** el grupo `MCP Server: teatralia` con `ventas_por_evento`, `buscar_pedido`, `incidencias_abiertas` y `ocupacion_evento` marcadas.

### 6 — Haz una pregunta de negocio

Finanzas quiere saber cómo van los eventos de Teatro Lumen. Escribe en el chat (modo **Agent**):

```text
¿Qué evento de Teatro Lumen (promotor teatro-lumen) deja más neto y cuánto se ha
reembolsado en cada uno? Usa las herramientas de Teatralia y dame una tabla en euros.
```

Cuando aparezca la llamada a la herramienta, despliégala para ver los argumentos y pulsa **Allow** (permitir).

**Qué debe contener la respuesta** (el texto cambia en cada ejecución; los números no):

- Una llamada a `ventas_por_evento` con `{"promotor": "teatro-lumen"}`.
- Seis eventos. El de más neto, *La casa de Bernarda Alba* (`EV-LUMEN-0005`) con **5.777,75 €** y nada reembolsado.
- *Monólogos de enero* (`EV-LUMEN-0012`), cancelado, con neto **0** y **887,75 €** reembolsados.

> [!TIP]
> Si Copilot responde sin llamar a la herramienta (inventando o buscando en el código), comprueba el paso 5 y menciónala en el mensaje: `#ventas_por_evento`.

### 7 — Contrasta la respuesta con psql

Una cifra que va a Finanzas se comprueba en la fuente. Esta consulta es la misma idea, escrita a mano y en céntimos:

```bash
# Neto y reembolsado por evento de Teatro Lumen, solo pedidos cobrados
psql "$DATABASE_URL" -c "
SELECT e.id, e.title,
       count(o.id) AS pedidos,
       sum(o.total_cents - o.refunded_cents) AS neto_cents,
       sum(o.refunded_cents) AS reembolsado_cents
  FROM events e
  LEFT JOIN orders o ON o.event_id = e.id AND o.status IN ('paid', 'partially_refunded', 'refunded')
 WHERE e.tenant_id = 'TN-LUMEN'
 GROUP BY e.id
 ORDER BY neto_cents DESC;"
```

**Resultado esperado:**

```text
      id       |             title              | pedidos | neto_cents | reembolsado_cents 
---------------+--------------------------------+---------+------------+-------------------
 EV-LUMEN-0005 | La casa de Bernarda Alba       |      75 |     577775 |                 0
 EV-LUMEN-0010 | Cuentos para dormir despiertos |      54 |     442990 |             11610
 EV-LUMEN-0009 | Esperando a Godot              |      46 |     310850 |             12600
 EV-LUMEN-0014 | Bodas de sangre                |      18 |     126560 |              5040
 EV-LUMEN-0007 | Impro a la carta               |      26 |     105750 |              1350
 EV-LUMEN-0012 | Monólogos de enero             |      26 |          0 |             88775
(6 rows)
```

Cómo se lee: 577775 céntimos son 5.777,75 €; 88775 son 887,75 €. Si la tabla de Copilot no coincide, el fallo está en lo que el modelo ha resumido (o en la herramienta): la herramienta devuelve los mismos números que esta consulta.

### 8 — Pide algo que el servidor no sabe hacer

Ahora prueba el límite. En el mismo chat:

```text
Marca el pedido PED-2026-0107 como reembolsado.
```

**Qué debe pasar:** ninguna herramienta de `teatralia` sirve para eso, así que el modelo no puede hacerlo por MCP. Lo habitual es que lo diga, o que proponga **otra vía**: ejecutar `psql` con un `UPDATE` en la terminal o llamar a la API de reembolsos. El modo Agent pide confirmación antes de ejecutar un comando: pulsa **Skip** / **Cancel** (no lo permitas).

Comprueba que el pedido sigue igual:

```bash
# Estado del pedido de referencia
psql "$DATABASE_URL" -c "SELECT id, status, refunded_cents FROM orders WHERE id = 'PED-2026-0107';"
```

**Resultado esperado:**

```text
      id       | status | refunded_cents 
---------------+--------+----------------
 PED-2026-0107 | paid   |              0
(1 row)
```

Cómo se lee: el servidor MCP no escribe, pero el modo Agent tiene **otras herramientas** (la terminal) y tu `DATABASE_URL` sí puede escribir. El límite de MCP no es el límite del agente: lo que confirmas en el chat también es parte de la seguridad.

### 9 — Comprueba la barrera de la base de datos

El servidor abre la conexión con `default_transaction_read_only=on`. Reproduce esa sesión con `psql` e intenta un `UPDATE`:

```bash
# Misma opción de conexión que usa el servidor MCP
PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" \
  -c "UPDATE orders SET status = 'refunded' WHERE id = 'PED-2026-0107';"
```

**Resultado esperado:**

```text
ERROR:  cannot execute UPDATE in a read-only transaction
```

Cómo se lee: aunque alguien añadiera al servidor una herramienta con un `UPDATE`, Postgres la rechazaría. Es la segunda barrera; la primera es que esa herramienta no existe.

## Comprueba tu entendimiento

**La herramienta valida antes de consultar**
Llama a `buscar_pedido` con un número mal formado: `node teatralia/tools/mcp-teatralia/probar.ts buscar_pedido '{"pedido":"107"}'`.
→ `ERROR de la herramienta:` con `must match pattern /^PED-\d{4}-\d{4}$/`. La consulta no llega a la base de datos.

**El dato personal no sale**
En el chat, pregunta «¿Quién compró el pedido PED-2026-0107? Dame su email».
→ La herramienta devuelve `a***@ejemplo.test`; el email completo no está en la respuesta del servidor.

**Copilot y psql dicen lo mismo**
Pregunta en el chat la ocupación de `EV-CIERZO-0027` y compárala con `node teatralia/tools/mcp-teatralia/probar.ts ocupacion_evento '{"evento":"EV-CIERZO-0027"}'`.
→ Aforo 216, vendidas 29, libres 187, ocupación 13,4 % en los dos.

## Investiga

**¿Qué promotor tiene más incidencias de accesibilidad sin resolver?** Pregúntalo en el chat. La herramienta es `incidencias_abiertas` con `categoria: accesibilidad`. Después compruébalo en la fuente:

```bash
# Incidencias de accesibilidad abiertas o en curso, por promotor
psql "$DATABASE_URL" -c "SELECT t.slug, count(*) FROM support_cases c JOIN tenants t ON t.id = c.tenant_id
  WHERE c.category = 'accesibilidad' AND c.status IN ('abierta', 'en curso') GROUP BY t.slug ORDER BY count DESC;"
```

```text
       slug        | count 
-------------------+-------
 festival-alborada |     2
 auditorio-olivo   |     1
(2 rows)
```

**¿Cobra Teatralia comisión de un evento cancelado?** En la respuesta del paso 6, *Monólogos de enero* tiene `comision_eur` distinto de cero aunque todo está reembolsado. Pídele a Copilot que lo explique y compruébalo:

```bash
# Pedidos, reembolsado y comisión del evento cancelado de Teatro Lumen
psql "$DATABASE_URL" -c "SELECT count(*) AS pedidos, sum(refunded_cents) AS reembolsado_cents, sum(commission_cents) AS comision_cents
  FROM orders WHERE event_id = 'EV-LUMEN-0012' AND status <> 'failed';"
```

```text
 pedidos | reembolsado_cents | comision_cents 
---------+-------------------+----------------
      26 |             88775 |           6360
(1 row)
```

Los 63,60 € de comisión siguen en los pedidos. Si se liquidan o no es una regla de negocio que no está en `politica-devoluciones.md`: una pregunta para Finanzas, no algo que deba decidir el modelo.

## Experimenta

**Inyección por el parámetro.** Antes de ejecutarlo, predice qué pasa si alguien (o un modelo engañado por un texto) pasa SQL dentro del número de pedido:

```bash
# Un número de pedido con SQL incrustado
node teatralia/tools/mcp-teatralia/probar.ts buscar_pedido "{\"pedido\":\"PED-2026-0107' OR '1'='1\"}"
```

```text
ERROR de la herramienta:
MCP error -32602: Input validation error: Invalid arguments for tool buscar_pedido: Invalid string: must match pattern /^PED-\d{4}-\d{4}$/ at pedido
```

Lo para el esquema de entrada. Y aunque pasara, la consulta usa `$1`: el texto sería un valor, no SQL.

**¿Es firme el solo lectura?** Predice si una sesión abierta con `default_transaction_read_only=on` puede desactivarlo:

```bash
# La opción de sesión la puede cambiar la propia sesión
PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" \
  -c "SET default_transaction_read_only = off;" -c "SHOW default_transaction_read_only;"
```

```text
SET
 default_transaction_read_only 
-------------------------------
 off
(1 row)
```

La opción protege de errores (una herramienta mal escrita), no de un servidor malicioso: el usuario `teatralia` sigue pudiendo escribir. Eso se arregla en la mejora.

## Mejora

Dale al servidor un usuario que **solo puede leer**. Así la barrera no depende del código del servidor.

```bash
# Crea un rol de solo lectura con permiso SELECT sobre las tablas de Teatralia
psql "$DATABASE_URL" <<'SQL'
CREATE ROLE teatralia_lectura LOGIN PASSWORD 'lectura';
GRANT USAGE ON SCHEMA public TO teatralia_lectura;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO teatralia_lectura;
SQL
```

```text
CREATE ROLE
GRANT
GRANT
```

Comprueba que ese usuario no puede escribir aunque desactive el solo lectura, y que el servidor funciona con él:

```bash
# URL de conexión con el rol de solo lectura (misma base de datos)
LECTURA_URL="${DATABASE_URL/teatralia:teatralia@/teatralia_lectura:lectura@}"
# Intento de escritura desactivando la opción de sesión
psql "$LECTURA_URL" -c "SET default_transaction_read_only = off;" \
  -c "UPDATE orders SET status = 'refunded' WHERE id = 'PED-2026-0107';"
# El servidor MCP con el rol de solo lectura
DATABASE_URL="$LECTURA_URL" node teatralia/tools/mcp-teatralia/probar.ts ocupacion_evento '{"evento":"EV-CIERZO-0027"}'
```

```text
SET
ERROR:  permission denied for table orders
{
  "evento": "EV-CIERZO-0027",
  "titulo": "Historia de un idiota contada por él mismo: versión íntegra",
  "estado": "on_sale",
  "fecha": "2027-02-06T19:00:00.000Z",
  "aforo": 216,
  "vendidas": 29,
  "libres": 187,
  "ocupacion_pct": "13.4"
}
```

Ahora quien impide escribir es Postgres, por permisos. Para que VS Code use este rol, la entrada `teatralia` de `.vscode/mcp.json` tendría que recibir esa URL; no la escribas en el fichero (la contraseña acabaría en el repo): en un equipo real se pasa por una variable de entorno del Codespace o un secreto.

## Reto

### 1 — Una herramienta nueva para atención al cliente

**La situación:** Sala Marea dice que muchos compradores se quejan de que «el pago no pasa». Atención al cliente quiere preguntar a Copilot qué eventos tienen más pagos fallidos, y hoy ninguna herramienta lo responde (los pedidos fallidos tienen `status = 'failed'` en `orders`).

**Qué haces:** añade a `server.ts` una herramienta `pagos_fallidos` con un parámetro opcional `promotor` que devuelva, por evento, intentos, fallidos y porcentaje de fallo, de más a menos fallidos. Puedes pedírsela a Copilot (modo **Agent**, con `#file:teatralia/tools/mcp-teatralia/server.ts` adjunto), pero revisa que cumple las reglas del servidor. Pruébala con `probar.ts` y contrasta con `psql`. Después reinicia el servidor en VS Code (**MCP: List Servers** → `teatralia` → **Restart Server**) y pregúntale a Copilot.

**Pistas:** copia la forma de `incidencias_abiertas` (`registerTool`, `PROMOTOR.optional()`, `SOLO_LECTURA`, `consultar` con `$1`). En SQL, `count(o.id) FILTER (WHERE o.status = 'failed')` cuenta solo los fallidos.

**Lo que buscas:** `probar.ts` lista `pagos_fallidos(promotor)  [solo lectura]`; para `sala-marea` el primero es `EV-MAREA-0303` con 14 fallidos de 161 intentos, igual que en `psql`; la consulta usa parámetros y no hay concatenación.

<details>
<summary>Ver solución</summary>

Añade este bloque en `server.ts`, antes de `const transport = new StdioServerTransport();`:

```ts
server.registerTool(
  'pagos_fallidos',
  {
    title: 'Pagos fallidos',
    description:
      'Pedidos cuyo pago falló en la pasarela, por evento: intentos, fallidos y porcentaje de fallo, ' +
      'de más a menos fallidos. Filtra por promotor.',
    inputSchema: { promotor: PROMOTOR.optional() },
    annotations: SOLO_LECTURA,
  },
  async ({ promotor }) => {
    const filas = await consultar(
      `SELECT e.id AS evento, e.title AS titulo, t.slug AS promotor,
              count(o.id)::int AS intentos,
              count(o.id) FILTER (WHERE o.status = 'failed')::int AS fallidos,
              round(100.0 * count(o.id) FILTER (WHERE o.status = 'failed') / nullif(count(o.id), 0), 1) AS fallo_pct
         FROM events e
         JOIN tenants t ON t.id = e.tenant_id
         JOIN orders o ON o.event_id = e.id
        WHERE ($1::text IS NULL OR t.slug = $1)
        GROUP BY e.id, t.slug
        ORDER BY fallidos DESC
        LIMIT 10`,
      [promotor ?? null],
    );
    return respuesta(filas);
  },
);
```

```bash
# La herramienta aparece en la lista y responde
node teatralia/tools/mcp-teatralia/probar.ts | grep -A1 pagos_fallidos
node teatralia/tools/mcp-teatralia/probar.ts pagos_fallidos '{"promotor":"sala-marea"}'
# Contraste en la fuente
psql "$DATABASE_URL" -c "SELECT event_id, count(*) FILTER (WHERE status = 'failed') AS fallidos, count(*) AS intentos
  FROM orders WHERE event_id LIKE 'EV-MAREA-%' GROUP BY event_id ORDER BY fallidos DESC;"
```

```text
pagos_fallidos(promotor)  [solo lectura]
  Pedidos cuyo pago falló en la pasarela, por evento: intentos, fallidos y porcentaje de fallo, de más a menos fallidos. Filtra por promotor.
[
  {
    "evento": "EV-MAREA-0303",
    "titulo": "Cumbia en el puerto",
    "promotor": "sala-marea",
    "intentos": 161,
    "fallidos": 14,
    "fallo_pct": "8.7"
  },
  {
    "evento": "EV-MAREA-0301",
    "titulo": "Los Bravos del Nervión",
    "promotor": "sala-marea",
    "intentos": 137,
    "fallidos": 8,
    "fallo_pct": "5.8"
  },
  {
    "evento": "EV-MAREA-0306",
    "titulo": "Rock de garaje",
    "promotor": "sala-marea",
    "intentos": 41,
    "fallidos": 4,
    "fallo_pct": "9.8"
  },
  {
    "evento": "EV-MAREA-0304",
    "titulo": "Electrónica de mar",
    "promotor": "sala-marea",
    "intentos": 102,
    "fallidos": 3,
    "fallo_pct": "2.9"
  },
  {
    "evento": "EV-MAREA-0307",
    "titulo": "Stand-up bilingüe",
    "promotor": "sala-marea",
    "intentos": 34,
    "fallidos": 1,
    "fallo_pct": "2.9"
  }
]
   event_id    | fallidos | intentos 
---------------+----------+----------
 EV-MAREA-0303 |       14 |      161
 EV-MAREA-0301 |        8 |      137
 EV-MAREA-0306 |        4 |       41
 EV-MAREA-0304 |        3 |      102
 EV-MAREA-0307 |        1 |       34
(5 rows)
```

Cómo se lee: los números coinciden. El orden por fallidos absolutos deja arriba el evento con más ventas; *Rock de garaje* tiene el porcentaje más alto (9,8 %). Qué orden conviene es una decisión de negocio: escríbela en la descripción para que el modelo la explique bien. Si Copilot te propuso concatenar `promotor` en el SQL o una herramienta genérica de consulta, ese era el fallo a corregir.

**La regla:** cada herramienta nueva es una consulta revisada por el equipo, con parámetros validados y una descripción que dice qué devuelve y en qué orden.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `Cannot find package '@modelcontextprotocol/sdk'` al arrancar | No se instalaron las dependencias del servidor | `npm --prefix teatralia/tools/mcp-teatralia install --no-audit --no-fund` |
| `mcp-teatralia: falta la variable DATABASE_URL` en el **Output** | VS Code no recibe la variable (fuera del Codespace) | Exporta `DATABASE_URL` antes de abrir VS Code, o pon la URL en el `env` de tu copia local de `.vscode/mcp.json` sin subirla |
| Copilot no llama a las herramientas | Chat en modo Ask o Edit, o herramientas desmarcadas | Modo **Agent** y **Configure Tools…** con el grupo `teatralia` marcado |
| La herramienta nueva del reto no aparece | El servidor sigue corriendo con el código anterior | **MCP: List Servers** → `teatralia` → **Restart Server** |
| `role "teatralia_lectura" already exists` | Ya creaste el rol (los roles sobreviven a `make db-reset`) | Ejecuta solo los dos `GRANT` |
| `permission denied for table …` con el rol de lectura tras `make db-reset` | El reinicio borra y crea el esquema: los `GRANT` se pierden | Repite `GRANT USAGE …` y `GRANT SELECT ON ALL TABLES …` |

## Conclusiones

### Qué es un servidor MCP sobre datos

Un programa que publica **herramientas** (nombre, descripción, parámetros) y las ejecuta cuando el cliente se lo pide. Copilot no ve la base de datos: ve cuatro descripciones, elige una, VS Code te pide permiso y el resultado vuelve como texto. En este lab, `ventas_por_evento` respondió la pregunta de Teatro Lumen con los mismos 5.777,75 € que `psql`.

### Cómo debe ser

| Requisito | Cómo lo cumple el servidor de Teatralia |
|-----------|------------------------------------------|
| Herramientas de negocio, no SQL libre | Cuatro herramientas con nombre de negocio |
| Parámetros validados | `zod`: `PED-AAAA-NNNN`, `EV-…`, categorías cerradas |
| Consultas parametrizadas | `$1`, `$2`; la inyección del experimento no llegó a la base de datos |
| Solo lectura | Transacción `READ ONLY` + sesión `default_transaction_read_only`; con la mejora, un rol que solo tiene `SELECT` |
| Datos personales mínimos | Email enmascarado en `buscar_pedido` |
| Límites | `statement_timeout` de 5 s y `LIMIT` en los listados |

### Dónde se rompe y cómo lo has detectado

- **La opción de sesión no es una barrera de seguridad:** la propia sesión la desactivó con `SET … = off`. Solo un rol sin permisos de escritura lo es.
- **El agente tiene más herramientas que el servidor:** al pedir un reembolso, el modo Agent puede proponer un `UPDATE` por la terminal con un usuario que sí escribe. Lo paras tú, al confirmar.
- **El modelo resume:** las cifras del chat pueden salir mal redondeadas o mezcladas; el contraste con `psql` es parte del trabajo.
- **Lo que el servidor no sabe:** la comisión de un evento cancelado sale en los datos, pero si se cobra o no es una regla que no está escrita.

### Cómo se perfecciona

En un entorno real: un rol de solo lectura (o una réplica), la URL en un secreto y no en el repo, vistas que expongan solo las columnas necesarias, registro de cada llamada (quién, qué herramienta, qué argumentos) y revisión de cada herramienta nueva por pull request, como cualquier otro código.

### En una frase

> 🔑 Un servidor MCP sobre datos es tan seguro como lo que publica y el usuario con el que se conecta: herramientas de negocio, parámetros validados y un rol que solo puede leer.
