# Demo: Copilot más allá del editor

[← Página anterior](README.md) · [Siguiente página →](01-lab-mcp-base-de-datos.md)

Atención al cliente de Sala Marea pregunta a Plataforma: «La tienda dice que *Cumbia en el puerto* está agotado, pero hay gente que dice que ha conseguido entrada esta semana. ¿Está agotado o no?». La respuesta no está en el código: está en la base de datos. Esta demostración enseña cómo Copilot llega a ese dato con un **servidor MCP** de Teatralia, qué viaja entre las piezas y cómo se comprueba la respuesta.

## Punto de partida

- Codespace del repositorio del curso con los servicios de datos en marcha (Postgres arranca con el Codespace) y los datos de ejemplo cargados:

```bash
# Mismo estado de partida que cualquier página del curso
CONFIRM=1 make reset
```

- Dependencias del servidor MCP de Teatralia instaladas:

```bash
# Instala el SDK de MCP y el cliente de Postgres del servidor (paquete aparte, no es un workspace de teatralia/)
npm --prefix teatralia/tools/mcp-teatralia install --no-audit --no-fund
```

- `.vscode/mcp.json` en la raíz del repo declara dos servidores: `teatralia` (este) y `github`.
- Copilot Chat abierto (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>) en modo **Agent**. Las herramientas MCP solo se ofrecen en modo Agent.

## Recorrido

### 1 — Las tres piezas

| Pieza | Qué es aquí | Dónde está |
|-------|-------------|------------|
| Cliente MCP | Copilot Chat en modo Agent | VS Code |
| Servidor MCP | Programa Node que publica cuatro herramientas de solo lectura | [`teatralia/tools/mcp-teatralia/server.ts`](../../teatralia/tools/mcp-teatralia/server.ts) |
| Configuración | Cómo arranca VS Code el servidor y con qué variables | [`.vscode/mcp.json`](../../.vscode/mcp.json) |

La entrada `teatralia` de `.vscode/mcp.json` dice que VS Code lanza `node …/server.ts` como proceso hijo y le pasa `DATABASE_URL`. El transporte es **stdio**: cliente y servidor se hablan por la entrada y la salida estándar, con mensajes JSON-RPC, uno por línea.

```jsonc
"teatralia": {
  "type": "stdio",
  "command": "node",
  "args": ["${workspaceFolder}/teatralia/tools/mcp-teatralia/server.ts"],
  "env": { "DATABASE_URL": "${env:DATABASE_URL}" }
}
```

### 2 — El protocolo en crudo

Antes de dejar que Copilot lo use, se puede hablar con el servidor a mano: tres mensajes por la entrada estándar. El primero presenta al cliente (`initialize`), el segundo confirma (`notifications/initialized`) y el tercero pide una herramienta (`tools/call`) con sus argumentos.

```bash
# Tres mensajes JSON-RPC al servidor por stdin; responde por stdout, una línea por respuesta
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"terminal","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ocupacion_evento","arguments":{"evento":"EV-MAREA-0303"}}}' \
  | node teatralia/tools/mcp-teatralia/server.ts
```

Resultado:

```text
mcp-teatralia: listo (stdio, solo lectura)
{"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"teatralia","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
{"result":{"content":[{"type":"text","text":"{\n  \"evento\": \"EV-MAREA-0303\",\n  \"titulo\": \"Cumbia en el puerto\",\n  \"estado\": \"sold_out\",\n  \"fecha\": \"2026-12-04T21:00:00.000Z\",\n  \"aforo\": 400,\n  \"vendidas\": 349,\n  \"libres\": 51,\n  \"ocupacion_pct\": \"87.3\"\n}"}]},"jsonrpc":"2.0","id":2}
```

Cómo se lee:

| Línea | Qué es |
|-------|--------|
| `mcp-teatralia: listo…` | Aviso del servidor por **stderr**; no forma parte del protocolo |
| `"id":1` | Respuesta a `initialize`: versión del protocolo y que el servidor ofrece herramientas (`tools`) |
| `"id":2` | Respuesta a `tools/call`: un bloque de texto con el JSON que leerá el modelo |

Eso es todo lo que Copilot hace por debajo: el mismo `tools/call`, con los argumentos que el modelo decide.

### 3 — Lo que el modelo ve: nombres y descripciones

El modelo elige herramienta por su **nombre** y su **descripción**. El paquete trae un cliente mínimo, `probar.ts`, que hace lo mismo que Copilot: arranca el servidor, pide la lista de herramientas (`tools/list`) y la imprime.

```bash
# Cliente MCP mínimo del SDK: lista las herramientas que publica el servidor
node teatralia/tools/mcp-teatralia/probar.ts
```

Resultado:

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

Cuatro herramientas con nombre de negocio, no una herramienta «ejecuta SQL». `[solo lectura]` es la anotación `readOnlyHint` que el servidor declara: VS Code la usa para pedir confirmación de otra manera, pero quien la garantiza es la base de datos (se ve en el laboratorio).

### 4 — El servidor en VS Code

En VS Code el servidor no se arranca a mano:

1. Paleta de comandos (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) → **MCP: List Servers** → `teatralia` → **Start Server**. La primera vez VS Code pregunta si se confía en el servidor.
2. En el chat, en modo **Agent**, el botón de herramientas (icono de llave y destornillador, **Configure Tools…**) muestra el grupo `teatralia` con sus cuatro herramientas marcadas.

> [!NOTE]
> Los nombres de comandos y botones de MCP en VS Code han cambiado entre versiones. Si no aparecen igual, el fichero `.vscode/mcp.json` abierto en el editor muestra encima de cada servidor un enlace **Start** / **Running** que hace lo mismo.

### 5 — La pregunta de negocio

En el chat, modo **Agent**, conversación nueva (**+**):

```text
Atención al cliente dice que "Cumbia en el puerto" (EV-MAREA-0303) aparece como agotado,
pero hay gente que compra. ¿Está realmente lleno? Usa las herramientas de Teatralia y
dime aforo, vendidas y libres.
```

Qué debe contener la respuesta (el texto varía en cada ejecución):

- Una llamada a `ocupacion_evento` con `{"evento": "EV-MAREA-0303"}`, que VS Code muestra plegada en el chat y que pide **Allow** (permitir) antes de ejecutarse.
- Aforo **400**, vendidas **349**, libres **51**, ocupación **87,3 %**, y estado `sold_out`.
- La conclusión de que el evento figura como agotado con 51 plazas libres.

### 6 — La comprobación contra la base de datos

La respuesta de Copilot no se publica sin contrastarla. El dato en crudo está en `tickets`: cuántas entradas hay de ese evento en cada estado.

```bash
# Entradas de los tres eventos marcados como agotados, por estado
psql "$DATABASE_URL" -c "SELECT event_id, status, count(*) FROM tickets
  WHERE event_id IN ('EV-MAREA-0303','EV-FARO-0045','EV-OLIVO-0104') GROUP BY 1,2 ORDER BY 1,2;"
```

Resultado:

```text
   event_id    |  status  | count 
---------------+----------+-------
 EV-FARO-0045  | refunded |     5
 EV-FARO-0045  | valid    |   268
 EV-FARO-0045  | void     |    27
 EV-MAREA-0303 | refunded |    13
 EV-MAREA-0303 | valid    |   349
 EV-MAREA-0303 | void     |    38
 EV-OLIVO-0104 | refunded |    17
 EV-OLIVO-0104 | valid    |   451
 EV-OLIVO-0104 | void     |    24
(9 rows)
```

Cómo se lee: en *Cumbia en el puerto* 349 + 13 + 38 = 400. El evento se agotó, pero 13 entradas se reembolsaron y 38 quedaron anuladas (pagos fallidos); la política dice que una entrada devuelta vuelve a la venta, y el estado del evento sigue en `sold_out`. Los otros dos eventos agotados tienen el mismo patrón. La pregunta de atención al cliente tenía una respuesta de negocio (y probablemente un issue).

## Qué queda visto

- MCP separa tres piezas: el cliente (Copilot), el servidor (un programa del equipo) y las herramientas que publica.
- Entre ellas viajan mensajes JSON-RPC; el modelo solo decide qué herramienta pedir y con qué argumentos.
- La respuesta con datos se contrasta con la fuente antes de usarla.

El laboratorio [01 — Un servidor MCP sobre la base de datos](01-lab-mcp-base-de-datos.md) pone el servidor en marcha en tu VS Code y lleva la pregunta abierta de esta demo más allá: **¿qué impide que ese servidor cambie un pedido si alguien se lo pide?** Se puede hacer sin haber seguido esta demostración.
