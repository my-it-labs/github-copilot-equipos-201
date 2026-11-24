# M05 — Copilot intermedio: MCP, agentes y gobierno

[← Página anterior](../M04-calidad-pruebas-y-documentacion/10-lab-workflow-de-tests.md) · [Siguiente página →](00-copilot-mas-alla-del-editor.md)

Hasta aquí Copilot ha trabajado con lo que hay en el editor: ficheros, selección, `#codebase` e instrucciones del repo. En este tramo sale del editor. Con **MCP** consulta la base de datos de Teatralia y los issues de GitHub; con un **agente personalizado** trabaja con un rol y unas herramientas que decide el equipo; con el **selector de modelo** se elige cuánto cuesta cada petición; con el **coding agent** recibe un issue y devuelve una pull request. Y todo eso se gobierna: qué puede usar cada persona en la organización y qué queda versionado en el repo para que el equipo trabaje igual.

## Qué aprenderás

- Conectar Copilot a la base de datos de Teatralia con un servidor MCP de solo lectura y contrastar sus respuestas con `psql`.
- Consultar y crear issues del backlog desde el chat con el servidor MCP de GitHub, sabiendo qué acciones escriben y cuáles solo leen.
- Crear un agente «revisor de reembolsos» que lee la política y los pedidos, pero no puede cambiar código.
- Comparar dos modelos en la misma tarea por el resultado comprobado y por las peticiones premium que gasta.
- Entender qué hace el coding agent con un issue y qué políticas de la organización lo controlan.
- Empaquetar en el repo el kit de Copilot del equipo (instrucciones, prompts, agente, MCP, plantilla de PR) con su documento de adopción.

## Teoría

### Cliente, servidor y herramientas

**MCP** (Model Context Protocol) es un protocolo abierto para que un asistente use herramientas externas. Tiene tres piezas:

| Pieza | Qué es | En Teatralia |
|-------|--------|--------------|
| **Cliente MCP** | La aplicación que habla con el modelo y lanza las herramientas | Copilot Chat en VS Code, en modo **Agent** |
| **Servidor MCP** | Un programa que publica herramientas con nombre, descripción y parámetros | `teatralia/tools/mcp-teatralia/server.ts` (local, stdio) y el servidor de GitHub (remoto, HTTP) |
| **Herramienta** | Una acción concreta que el modelo puede pedir | `ventas_por_evento`, `buscar_pedido`, `incidencias_abiertas`, `ocupacion_evento` |

El modelo no se conecta a la base de datos: **lee la descripción de las herramientas, decide cuál pedir y con qué argumentos**, VS Code te pide permiso, el servidor ejecuta y el resultado vuelve al chat como texto. Lo que el servidor no publica, el modelo no lo puede hacer por esa vía.

> [!NOTE]
> MCP no es «darle la base de datos a la IA». Un buen servidor publica pocas herramientas, con nombre de negocio, parámetros validados y permisos mínimos. Uno que publica `ejecutar_sql(texto)` le da al modelo todo lo que pueda hacer ese usuario de base de datos.

### Dónde vive cada personalización

| Pieza | Fichero | Quién la usa |
|-------|---------|--------------|
| Instrucciones del repo | `.github/copilot-instructions.md` | Todas las peticiones de chat del repo |
| Instrucciones por ruta | `.github/instructions/*.instructions.md` (`applyTo`) | Peticiones que tocan esas rutas |
| Prompt files | `.github/prompts/*.prompt.md` | Quien escribe `/nombre` en el chat |
| Agentes personalizados | `.github/agents/*.agent.md` (antes `.github/chatmodes/*.chatmode.md`) | Quien lo elige en el selector de agente |
| Servidores MCP | `.vscode/mcp.json` | El modo Agent y los agentes que los incluyan en `tools` |

### Agente en el editor frente a coding agent

| | Modo Agent / agente personalizado | Coding agent |
|---|---|---|
| Dónde trabaja | En tu VS Code, en tu rama | En GitHub, en un entorno de GitHub Actions |
| Cómo se le pide | Un mensaje en el chat | Asignar un issue a Copilot (o delegarlo desde el chat) |
| Qué entrega | Cambios en tu árbol de trabajo (**Keep** / **Undo**) | Una pull request en borrador que revisas como la de un compañero |
| Plan necesario | Copilot Free basta | Copilot Pro, Pro+, Business o Enterprise |

### Peticiones premium

Cada mensaje de chat consume **peticiones**. En los planes de pago, los modelos incluidos no gastan peticiones premium y el resto multiplica: un modelo con multiplicador 1 gasta una por mensaje, uno con 0,33 gasta un tercio y uno con 10 gasta diez. Copilot Free tiene un cupo mensual pequeño de mensajes de chat. Los cupos y multiplicadores cambian: la fuente es la página de modelos y peticiones de la documentación de GitHub Copilot.

> [!IMPORTANT]
> Elegir modelo es elegir coste. La pregunta no es «¿cuál es el mejor?», sino «¿cuál resuelve esta tarea, comprobada, con menos peticiones?».

### Gobierno

En Copilot Business la organización decide qué modelos se pueden usar, si se permiten servidores MCP, si el coding agent está activo, qué ficheros se excluyen del contexto y deja registro en el audit log. El repo pone el resto: lo que el equipo ha acordado, versionado y revisado en pull requests como cualquier otro código.

## Páginas

<!-- gen:paginas -->
| # | Página | Qué hay |
|---|--------|---------|
| 00 | [Demo: Copilot más allá del editor](00-copilot-mas-alla-del-editor.md) | Qué es MCP y una pregunta de negocio respondida con un servidor MCP sobre Teatralia |
| 01 | [Laboratorio: un servidor MCP sobre la base de datos](01-lab-mcp-base-de-datos.md) | El servidor MCP de solo lectura de Teatralia en VS Code y preguntas de negocio sobre ventas |
| 02 | [Laboratorio: el servidor MCP de GitHub](02-lab-mcp-github.md) | Consultar y crear issues del backlog desde el chat con el servidor MCP de GitHub |
| 03 | [Laboratorio: un agente personalizado](03-lab-agente-personalizado.md) | Un modo «revisor de reembolsos» con sus instrucciones y herramientas limitadas |
| 04 | [Laboratorio: elegir modelo](04-lab-elegir-modelo.md) | La misma tarea con dos modelos, comparando resultado y consumo de peticiones premium |
| 05 | [Demo: coding agent y gobierno](05-demo-coding-agent.md) | Un issue asignado a Copilot que abre su pull request, y las políticas de organización que lo controlan |
| 06 | [Laboratorio: el flujo de trabajo del equipo](06-lab-flujo-del-equipo.md) | Instrucciones, prompts, agentes y reglas de revisión que el equipo adopta, empaquetados en el repo |

→ Empieza por **[00 — Demo: Copilot más allá del editor](00-copilot-mas-alla-del-editor.md)**.
<!-- /gen:paginas -->

## Conclusiones del módulo

- **Contexto vivo.** MCP lleva a Copilot datos que no están en el código (ventas, incidencias, issues). Cada respuesta con datos se contrasta con la fuente (`psql`, `gh`) antes de publicarla.
- **Permisos mínimos.** Servidor de solo lectura, herramientas con nombre de negocio, agente sin herramienta de edición, URL de GitHub limitada cuando basta leer: el riesgo lo fija lo que publicas, no lo que pides en el prompt.
- **Coste consciente.** El modelo se elige por tarea; el incluido primero y el premium cuando el resultado comprobado lo justifica.
- **Del individuo al equipo.** Lo que funciona se versiona en el repo y se revisa con pull requests; lo que la organización permite se decide en sus políticas.

> 🔑 Copilot intermedio es darle a Copilot más alcance (datos, GitHub, agentes) y, a la vez, poner por escrito los límites de ese alcance.
