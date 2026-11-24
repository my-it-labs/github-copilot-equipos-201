# M01 — IA en el desarrollo y primeros pasos con GitHub Copilot

[← Página anterior](../../README.md) · [Siguiente página →](00-del-autocompletado-al-agente.md)

Teatralia es una plataforma de venta de entradas que tu equipo hereda: un monorepo con tienda, backoffice, API, pagos y correo, y datos de seis promotores con miles de pedidos. En este módulo pones en marcha GitHub Copilot sobre ese código y aprendes sus tres formas de trabajar (sugerencia en línea, chat y agente). La costumbre que se queda para el resto del curso: **cada respuesta de Copilot se comprueba contra el código o contra el sistema en marcha**.

## Qué aprenderás

- Arrancar Teatralia en un Codespace y hacer a Copilot preguntas que se pueden comprobar.
- Guiar una sugerencia en línea con un comentario-contrato y aceptar, rechazar o pedir alternativas.
- Dejar que las sugerencias de siguiente edición propaguen un cambio y revisar cada salto.
- Usar el modo **Ask** para entender un cálculo y verificarlo con una consulta a la base de datos.
- Escribir un prompt con objetivo, contexto y criterios de aceptación, y ver cómo cambia el diff.
- Reconocer cuándo Copilot inventa, qué no debe ver y cuándo usar **Edit** o **Agent**.

## Teoría

### Tres formas de trabajar con Copilot

| Forma | Dónde aparece | Qué contexto ve | Para qué sirve |
|-------|---------------|-----------------|----------------|
| **Sugerencia en línea** | Texto gris mientras escribes | El fichero abierto y algunos ficheros vecinos | Completar lo que ya sabes que quieres escribir |
| **Sugerencia de siguiente edición** | Flecha en el margen tras un cambio | El cambio que acabas de hacer y el fichero | Propagar un cambio (renombrar, ajustar llamadas) |
| **Chat: modo Ask** | Vista **Chat**, modo **Ask** | Lo que adjuntas y lo que busca en el repo | Entender código, preguntar, planificar. No toca ficheros |
| **Chat: modo Edit** | Vista **Chat**, modo **Edit** | Los ficheros que tú adjuntas | Cambios acotados a ficheros concretos, que revisas con **Keep** / **Undo** |
| **Chat: modo Agent** | Vista **Chat**, modo **Agent** | Todo el repositorio y la terminal | Tareas con varios pasos: busca, edita, ejecuta, corrige |

> [!NOTE]
> Cuanto más autónomo es el modo, más trabajo de revisión te deja. La sugerencia en línea la ves entera antes de aceptarla; un agente puede tocar diez ficheros y ejecutar comandos.

### De asistente a agente

Un **asistente de código** propone texto y tú decides. Un **agente** recibe un objetivo, decide qué leer, qué cambiar y qué ejecutar, y repite hasta que cree que ha terminado. El modelo de lenguaje es el mismo; cambia cuánto contexto recoge solo y cuántas acciones encadena sin preguntarte.

### Lo que Copilot no sabe

- **No ve el sistema en marcha**: ni la base de datos, ni la terminal donde corre `make up`, ni el navegador. Solo lo sabe si se lo pegas o si lo ejecuta él en modo Agent.
- **Mezcla fuentes**: el código, la documentación (que puede estar desfasada) y lo que «suele ser» en proyectos parecidos. Lo dice todo con la misma seguridad.
- **No conoce las reglas de negocio que no están escritas**. Si la regla no está en el repositorio, la inventa.

> [!WARNING]
> Todo lo que Copilot lee se envía al servicio para generar la respuesta. Lo que no deba salir de tu equipo (claves, datos de clientes) no debe estar en los ficheros que abres ni en lo que pegas en el chat.

### Copilot Free, Pro y Business

El curso funciona con **Copilot Free** en tu cuenta personal de GitHub. Free tiene un cupo mensual de sugerencias y de peticiones de chat, y unos modelos incluidos. Business (el de tu empresa) añade políticas de organización, exclusión de contenido y el agente que trabaja en GitHub. Lo que solo existe en los planes de pago se indica en cada página.

## Páginas

<!-- gen:paginas -->
| # | Página | Qué hay |
|---|--------|---------|
| 00 | [Demo: del autocompletado al agente](00-del-autocompletado-al-agente.md) | La misma tarea sobre Teatralia con sugerencia en línea, chat y agente, y qué contexto ve cada uno |
| 01 | [Laboratorio: Teatralia en un Codespace y primer chat](01-lab-entorno-y-primer-chat.md) | Fork, Codespace, Teatralia en marcha con sus datos y la primera respuesta de Copilot comprobada contra el sistema |
| 02 | [Laboratorio: sugerencias en línea desde un comentario](02-lab-sugerencias-en-linea.md) | Un comentario-contrato para formatear importes en céntimos y qué cambia la sugerencia según lo que diga |
| 03 | [Laboratorio: sugerencias de siguiente edición](03-lab-siguiente-edicion.md) | Renombrar un campo del pedido y dejar que Copilot proponga las ediciones que siguen |
| 04 | [Laboratorio: preguntar al código en modo Ask](04-lab-preguntar-al-codigo.md) | Cómo se calcula la comisión de un pedido real del seed, comprobado con una consulta a la base de datos |
| 05 | [Laboratorio: el mismo cambio pedido de tres formas](05-lab-tres-formas-de-pedir.md) | Filtro de eventos por ciudad pedido en una línea, con contexto y con criterios de aceptación; diffs comparados |
| 06 | [Laboratorio: alucinaciones y sobreconfianza](06-lab-alucinaciones.md) | Preguntar por un endpoint y una regla que no existen, detectar la invención y pedir que cite el código |
| 07 | [Laboratorio: confidencialidad y exclusiones de contenido](07-lab-confidencialidad-y-exclusiones.md) | Secretos y datos personales en el repo de Teatralia, qué ve Copilot y cómo se excluyen |
| 08 | [Laboratorio: modo Edit frente a modo Agent](08-lab-edit-frente-a-agent.md) | Añadir el aforo restante a la ficha de evento con Edit y con Agent, comparando alcance, pasos y diff |

→ Empieza por **[00 — Demo: del autocompletado al agente](00-del-autocompletado-al-agente.md)**.
<!-- /gen:paginas -->

## Conclusiones del módulo

| Idea | Dónde la has visto |
|------|--------------------|
| La respuesta de Copilot se comprueba contra el código o el sistema | Puerto de la API (01), comisión de PED-2026-0107 (04) |
| El comentario y la firma guían la sugerencia en línea | `centsToCsv` (02) |
| Un prompt con criterios de aceptación da un diff revisable | Filtro por ciudad (05) |
| Copilot inventa con la misma seguridad con la que acierta | Endpoint de cancelación y límite mensual (06) |
| Lo que el asistente lee sale de tu máquina | Claves de correo en el seed y en la API (07) |
| Edit para alcance acotado, Agent para tareas con pasos | Aforo restante (08) |

> 🔑 Copilot acelera lo que tú sabes comprobar: úsalo donde puedas verificar el resultado en segundos.
