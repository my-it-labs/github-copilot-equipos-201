# GitHub Copilot para equipos de desarrollo

[Siguiente página →](labs/M01-copilot-primeros-pasos/00-del-autocompletado-al-agente.md)

## Objetivo general

Al finalizar el curso, el alumno usa GitHub Copilot en su trabajo diario (sugerencias, chat, agente, instrucciones, prompts y MCP) para llevar un cambio de un sistema que no ha escrito desde la petición de negocio hasta una pull request revisada y probada, comprobando cada resultado contra el código y el sistema en marcha.

## Enfoque

Todo el curso ocurre en **Teatralia**, una plataforma de venta de entradas heredada: un monorepo TypeScript con tienda, backoffice, API, pagos y correo, y datos de seis promotores con miles de pedidos, reembolsos e incidencias de clientes. Es el tipo de código en el que Copilot más ayuda y más se equivoca: grande, ajeno, con documentación desfasada y reglas de negocio a medio escribir.

Cada laboratorio toma una pieza distinta de Teatralia (un issue del backlog, un fallo real, una consulta de negocio) y practica **una sola técnica** de Copilot. El recorrido va de menos a más autonomía: primero sugerencias y preguntas (M01), después el contexto que hace que Copilot acierte (M02), el ciclo completo de un cambio hasta la pull request (M03), la calidad que permite aceptar código generado (M04) y, al final, Copilot conectado a datos y a GitHub con MCP, agentes propios y las políticas del equipo (M05).

La regla que atraviesa todos los módulos: **lo que dice Copilot se comprueba** con un comando, una consulta o un test, y esa comprobación es la salida de cada paso.

## Dirigido a

Desarrolladores de nivel intermedio que empiezan a trabajar con asistentes de IA y quieren integrarlos en su forma de trabajar en equipo: entender código heredado, implementar peticiones, escribir pruebas y documentación, y decidir qué partes delegar a un agente y cuáles revisar a mano.

## Conocimientos previos

- Se da por sabido: programar en algún lenguaje, Git básico (rama, commit, pull request) y leer código de una API web.
- Basta con haber usado: TypeScript o JavaScript, SQL sencillo y la terminal.
- Se estudia en el curso: todo lo relativo a GitHub Copilot, sin experiencia previa con IA.
- Entorno: GitHub Codespaces desde el navegador, con una **cuenta personal de GitHub** y **Copilot Free** (o el plan de tu empresa). No hay que instalar nada.

## Objetivos específicos

- Usar sugerencias en línea, sugerencias de siguiente edición y los modos Ask, Edit y Agent, reconociendo alucinaciones y riesgos de confidencialidad.
- Dar contexto a Copilot con instrucciones del repositorio y por ruta, prompt files y referencias, y medir cómo cambia el resultado.
- Llevar un issue desde la petición ambigua hasta una pull request revisada, con especificación, análisis de impacto, plan y trazabilidad.
- Generar pruebas, depurar fallos, refactorizar, revisar seguridad, documentar y automatizar la verificación con GitHub Actions.
- Conectar Copilot a datos y a GitHub con MCP, crear agentes personalizados, elegir modelo por coste y diseñar el flujo de trabajo del equipo.

## Temario

<!-- gen:temario -->
- **[M01 — IA en el desarrollo y primeros pasos con GitHub Copilot](labs/M01-copilot-primeros-pasos/README.md)**
  - [De los asistentes de código a la IA agéntica](labs/M01-copilot-primeros-pasos/00-del-autocompletado-al-agente.md)
  - [Puesta en marcha de GitHub Copilot en VS Code](labs/M01-copilot-primeros-pasos/01-lab-entorno-y-primer-chat.md)
  - [Sugerencias en línea y sugerencias de siguiente edición](labs/M01-copilot-primeros-pasos/02-lab-sugerencias-en-linea.md)
  - [Copilot Chat: modos Ask, Edit y Agent](labs/M01-copilot-primeros-pasos/08-lab-edit-frente-a-agent.md)
  - [Técnicas de prompting](labs/M01-copilot-primeros-pasos/05-lab-tres-formas-de-pedir.md)
  - [Capacidades y limitaciones de los asistentes IA](labs/M01-copilot-primeros-pasos/04-lab-preguntar-al-codigo.md)
  - [Riesgos: alucinaciones, sobreconfianza y fuga de información](labs/M01-copilot-primeros-pasos/06-lab-alucinaciones.md)
  - [Seguridad, confidencialidad y propiedad intelectual](labs/M01-copilot-primeros-pasos/07-lab-confidencialidad-y-exclusiones.md)
- **[M02 — Ingeniería de contexto y personalización de Copilot](labs/M02-contexto-y-personalizacion/README.md)**
  - [Introducción a Context Engineering](labs/M02-contexto-y-personalizacion/00-el-contexto-cambia-el-diff.md)
  - [Instrucciones del repositorio y por ruta](labs/M02-contexto-y-personalizacion/01-lab-instrucciones-del-repositorio.md)
  - [Prompt files y bibliotecas de prompts reutilizables](labs/M02-contexto-y-personalizacion/03-lab-prompt-files.md)
  - [Variables de contexto: ficheros, selección y codebase](labs/M02-contexto-y-personalizacion/04-lab-codebase-frente-a-file.md)
  - [Comparación de resultados con y sin contexto](labs/M02-contexto-y-personalizacion/05-lab-con-y-sin-contexto.md)
  - [Uso de documentación funcional y técnica como fuente de verdad](labs/M02-contexto-y-personalizacion/06-lab-documentacion-fuente-de-verdad.md)
  - [Comprensión de desarrollos existentes](labs/M02-contexto-y-personalizacion/08-lab-diagrama-del-flujo-de-compra.md)
- **[M03 — Del requisito de negocio a la pull request](labs/M03-del-requisito-a-la-pr/README.md)**
  - [Identificación de ambigüedades y preguntas aclaratorias](labs/M03-del-requisito-a-la-pr/01-lab-preguntas-aclaratorias.md)
  - [Transformación de requisitos en especificaciones funcionales](labs/M03-del-requisito-a-la-pr/02-lab-especificacion-desde-un-issue.md)
  - [Análisis de impacto](labs/M03-del-requisito-a-la-pr/03-lab-analisis-de-impacto.md)
  - [Planificación antes de implementar](labs/M03-del-requisito-a-la-pr/04-lab-plan-antes-de-ejecutar.md)
  - [Implementación asistida en varios ficheros](labs/M03-del-requisito-a-la-pr/05-lab-cambio-en-varios-ficheros.md)
  - [Commits y pull requests asistidos](labs/M03-del-requisito-a-la-pr/06-lab-commit-y-pull-request.md)
  - [Revisión de código con Copilot](labs/M03-del-requisito-a-la-pr/07-lab-revisar-un-diff.md)
  - [Trazabilidad entre requisitos, desarrollo y pruebas](labs/M03-del-requisito-a-la-pr/08-lab-trazabilidad.md)
- **[M04 — Calidad, pruebas y documentación asistidas por IA](labs/M04-calidad-pruebas-y-documentacion/README.md)**
  - [Generación de pruebas unitarias](labs/M04-calidad-pruebas-y-documentacion/01-lab-tests-de-la-comision.md)
  - [Creación de escenarios y datos de prueba](labs/M04-calidad-pruebas-y-documentacion/02-lab-datos-de-prueba.md)
  - [Detección de errores y debugging asistido](labs/M04-calidad-pruebas-y-documentacion/04-lab-debugging-correo-duplicado.md)
  - [Refactorización con red de pruebas](labs/M04-calidad-pruebas-y-documentacion/05-lab-refactor-con-red.md)
  - [Identificación de regresiones](labs/M04-calidad-pruebas-y-documentacion/06-lab-regresion-con-bisect.md)
  - [Revisión de seguridad](labs/M04-calidad-pruebas-y-documentacion/07-lab-inyeccion-sql.md)
  - [Generación de documentación técnica](labs/M04-calidad-pruebas-y-documentacion/08-lab-readme-y-openapi.md)
  - [Notas de versión y entregables](labs/M04-calidad-pruebas-y-documentacion/09-lab-notas-de-version.md)
  - [Integración continua con GitHub Actions](labs/M04-calidad-pruebas-y-documentacion/10-lab-workflow-de-tests.md)
- **[M05 — Copilot intermedio: MCP, agentes y gobierno](labs/M05-copilot-intermedio/README.md)**
  - [Introducción a MCP (Model Context Protocol)](labs/M05-copilot-intermedio/00-copilot-mas-alla-del-editor.md)
  - [Servidores MCP en Copilot: datos y GitHub](labs/M05-copilot-intermedio/01-lab-mcp-base-de-datos.md)
  - [Agentes y modos de chat personalizados](labs/M05-copilot-intermedio/03-lab-agente-personalizado.md)
  - [Elección de modelo y consumo de peticiones premium](labs/M05-copilot-intermedio/04-lab-elegir-modelo.md)
  - [Copilot coding agent](labs/M05-copilot-intermedio/05-demo-coding-agent.md)
  - [Gobierno, seguridad y privacidad en la organización](labs/M05-copilot-intermedio/05-demo-coding-agent.md)
  - [Diseño de un flujo de trabajo asistido por IA para el equipo](labs/M05-copilot-intermedio/06-lab-flujo-del-equipo.md)
<!-- /gen:temario -->

## Antes de empezar

| Requisito | Dónde |
|-----------|--------|
| Cuenta personal de GitHub con Copilot activado (Free sirve) | github.com → **Settings** → **Copilot** |
| Fork del repositorio y Codespace | [Laboratorio: Teatralia en un Codespace y primer chat](labs/M01-copilot-primeros-pasos/01-lab-entorno-y-primer-chat.md) |
| Comandos del curso (`make up`, `make reset`, `make test`…) | `make help` en la terminal del Codespace |

## Guardar tu trabajo

Trabajas en **tu fork**. Cada laboratorio parte del mismo estado (`CONFIRM=1 make reset` descarta tus cambios en `teatralia/`). Si quieres conservar lo que hagas en un lab, guárdalo antes en una rama:

```bash
# Guarda el trabajo del lab en una rama de tu fork y vuelve a main
git switch -c lab/m01-05
git add teatralia && git commit -m "M01-05: filtro por ciudad"
git push -u origin lab/m01-05
git switch main
```

Para recibir correcciones del curso: en tu fork, **Sync fork** → **Update branch**.

## Empieza aquí

<!-- gen:empieza -->
→ **[M01 — Demo: del autocompletado al agente](labs/M01-copilot-primeros-pasos/00-del-autocompletado-al-agente.md)**
<!-- /gen:empieza -->
