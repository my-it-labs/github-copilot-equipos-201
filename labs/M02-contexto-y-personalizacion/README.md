# M02 — Ingeniería de contexto y personalización de Copilot

[← Página anterior](../M01-copilot-primeros-pasos/08-lab-edit-frente-a-agent.md) · [Siguiente página →](00-el-contexto-cambia-el-diff.md)

Copilot no conoce Teatralia: no sabe que los importes van en céntimos, que cada consulta del backoffice filtra por
promotor ni que la política de devoluciones manda sobre el código. Lo que no le das, lo rellena con lo más habitual,
y lo habitual casi nunca coincide con las reglas de un negocio concreto. Este módulo trata de **qué contexto le das,
cómo se lo das y cómo mides si ha servido**: instrucciones del repositorio y por ruta, prompt files que el equipo
comparte, referencias (`#file`, selección, `#codebase`), documentación funcional como fuente de verdad y la lectura
de código heredado con un diagrama verificado.

## Qué aprenderás

- Escribir las convenciones de Teatralia en `.github/copilot-instructions.md` y comprobar en la respuesta que se han aplicado.
- Limitar reglas a una parte del monorepo (el backoffice) con `applyTo` y detectar cuándo un patrón es demasiado amplio.
- Convertir una tarea repetida (crear un endpoint, generar tests, revisar un fichero) en un prompt file con variables, probarlo y versionarlo.
- Elegir entre adjuntar un fichero, una selección o buscar en todo el repositorio según la pregunta.
- Medir con tests el efecto del contexto, en lugar de juzgar a ojo si «ha quedado mejor».
- Usar `docs/politica-devoluciones.md` como contraste del código y decidir qué manda cuando no coinciden.
- Explicar un flujo heredado (la compra) con un diagrama y verificar cada flecha contra el código y una compra real.

## Teoría

### Ingeniería de contexto

Un modelo responde con lo que hay en su **ventana de contexto**: tu mensaje, lo que adjuntas, lo que la herramienta
añade sola (instrucciones, fichero activo, resultados de búsqueda) y la conversación previa. La ingeniería de contexto
es decidir **qué entra ahí** para que la respuesta salga bien a la primera, sin escribir prompts cada vez más largos.

| Pieza | Dónde vive | Cuándo entra en la conversación | Para qué en Teatralia |
|-------|------------|----------------------------------|-----------------------|
| Instrucciones del repositorio | `.github/copilot-instructions.md` | En cada petición de chat del workspace | Céntimos, ids `PED-`/`EV-`/`TN-`, SQL parametrizado, `HttpError`, mensajes en español |
| Instrucciones por ruta | `.github/instructions/*.instructions.md` con `applyTo` | Cuando en el contexto hay ficheros que casan con el patrón | Reglas solo del backoffice: `admin()`, `useAdmin`, `formatEuros` |
| Prompt files | `.github/prompts/*.prompt.md` | Cuando escribes `/nombre` en el chat | Tareas repetidas: `/nuevo-endpoint`, `/test-de-importes` |
| Referencias | `#file:…`, selección, `#codebase` | En la petición donde las pones | Señalar dónde mirar: `refunds.ts`, la política, todo el repo |
| Documentación funcional | `teatralia/docs/` | Cuando la adjuntas o la citan las instrucciones | La política de devoluciones como fuente de verdad |

> [!NOTE]
> Las instrucciones **no son órdenes que el modelo cumpla siempre**: son texto que se añade al contexto. Aumentan la
> probabilidad de que la respuesta las respete, pero cada resultado se comprueba igual (curl, tests, `grep`).
> Por eso todos los laboratorios terminan contra el sistema, no contra lo que dice Copilot.

### Referencias de contexto: cuál elegir

| Referencia | Qué ve Copilot | Cuándo elegirla | Riesgo |
|------------|----------------|-----------------|--------|
| Selección | Solo las líneas seleccionadas | Preguntas sobre un cálculo concreto | No ve quién llama a ese código |
| `#file:ruta` | Ese fichero entero | Sabes dónde está la respuesta | Si eliges mal el fichero, responde sobre el que no es |
| `#codebase` | Fragmentos que encuentra buscando en el repo | No sabes dónde está o cruza varios ficheros | Más lento; puede traer fragmentos que no tocan |

### Personalización compartida, no personal

Los ficheros de `.github/` viajan con el repositorio: quien clona tiene el mismo contexto. Se revisan en pull request
como cualquier código, porque una regla falsa genera cientos de cambios que no encajan.

> [!WARNING]
> `make reset` restaura `teatralia/` y la base de datos, pero **no toca `.github/`** (está en la raíz del repositorio).
> Lo que crees en estos laboratorios se queda hasta que lo borres o lo guardes con un commit en tu fork.

## Páginas

<!-- gen:paginas -->
| # | Página | Qué hay |
|---|--------|---------|
| 00 | [Demo: el contexto cambia el diff](00-el-contexto-cambia-el-diff.md) | La misma petición antes y después de dar a Copilot la regla de importes en céntimos |
| 01 | [Laboratorio: instrucciones del repositorio](01-lab-instrucciones-del-repositorio.md) | Un copilot-instructions.md con las convenciones de Teatralia y su efecto en un endpoint nuevo |
| 02 | [Laboratorio: instrucciones por ruta](02-lab-instrucciones-por-ruta.md) | Reglas solo para el backoffice con applyTo y cómo comprobar cuándo se aplican |
| 03 | [Laboratorio: un prompt file reutilizable](03-lab-prompt-files.md) | /nuevo-endpoint con variables, probado con dos endpoints distintos |
| 04 | [Laboratorio: #codebase frente a #file](04-lab-codebase-frente-a-file.md) | Localizar dónde se calcula un reembolso parcial con búsqueda en el repo y con ficheros adjuntos |
| 05 | [Laboratorio: con y sin contexto](05-lab-con-y-sin-contexto.md) | El cálculo del total de un pedido con descuento pedido en chat limpio y con contexto; diferencias medidas |
| 06 | [Laboratorio: la documentación como fuente de verdad](06-lab-documentacion-fuente-de-verdad.md) | La política de devoluciones de Teatralia contra el código que la implementa, y quién manda cuando no coinciden |
| 07 | [Laboratorio: biblioteca de prompts del equipo](07-lab-biblioteca-de-prompts.md) | Tres prompt files para tareas del equipo, revisados y versionados como código |
| 08 | [Laboratorio: entender código heredado con un diagrama](08-lab-diagrama-del-flujo-de-compra.md) | El flujo de compra en un diagrama Mermaid generado por Copilot y verificado paso a paso contra el código |

→ Empieza por **[00 — Demo: el contexto cambia el diff](00-el-contexto-cambia-el-diff.md)**.
<!-- /gen:paginas -->

## Conclusiones del módulo

### Qué es el contexto para Copilot

Todo lo que acompaña a tu petición: instrucciones que se añaden solas, prompt files que invocas, ficheros y
búsquedas que adjuntas y la documentación que señalas. El mismo prompt produce otro código cuando cambia el contexto.

### Cómo debe ser

| Requisito | Dónde se ha visto |
|-----------|-------------------|
| Reglas cortas, comprobables y escritas en el lenguaje del código (`*_cents`, `HttpError`, `$1`) | 00, 01 |
| Cada regla limitada a donde aplica (`applyTo`) | 02 |
| Tareas repetidas en prompt files con variables, probados con más de un caso | 03, 07 |
| La referencia más estrecha que contiene la respuesta | 04 |
| Efecto medido con tests, no a ojo | 05 |
| La documentación funcional manda sobre el código cuando lo dice ella misma | 06 |
| Toda explicación de código heredado, verificada línea a línea | 08 |

### Dónde se rompe

- Una instrucción no garantiza nada: el código generado se comprueba con curl, tests y `grep` igual que el escrito a mano.
- Un `applyTo` demasiado amplio lleva reglas del backoffice a la tienda, donde no existen esas funciones.
- El contexto solo transmite lo que está escrito: una regla que nadie ha decidido (cómo se redondea un descuento) no aparece por adjuntar más ficheros.
- La documentación y el código divergen: el aplazamiento devuelve gastos de gestión que la política dice que no.

### En una frase

> 🔑 Copilot escribe con lo que le das: escribe las reglas del equipo una vez en el repositorio, adjunta lo justo y
> mide el resultado contra el sistema.
