# Demo: coding agent y gobierno

[← Página anterior](04-lab-elegir-modelo.md) · [Siguiente página →](06-lab-flujo-del-equipo.md)

Hasta ahora Copilot ha trabajado dentro del editor, con alguien delante aceptando cada cambio. El **coding agent** trabaja en GitHub: se le asigna un issue y, sin que nadie tenga VS Code abierto, prepara un entorno, cambia el código, ejecuta los tests y abre una pull request. Esta demostración recorre ese ciclo con un issue de Teatralia y, después, las **políticas de organización** de Copilot Business que deciden si eso puede pasar, con qué modelos, con qué servidores MCP y qué ficheros no debe ver.

> [!NOTE]
> El coding agent necesita Copilot Pro, Pro+, Business o Enterprise; con Copilot Free no está disponible. Por eso esta parte es una demostración. Las pantallas de GitHub cambian a menudo: los nombres de menús son los vigentes cuando se escribió y pueden variar.

## Punto de partida

- Un fork del repositorio del curso con **Issues** activados y el backlog creado:

```bash
# Crea los issues TEA-101…112 en el fork (no repite los que existan)
make backlog
```

- Una cuenta con Copilot Pro o Business y el coding agent habilitado (en Business, por la política de la organización; se ve al final).
- El issue elegido: **TEA-108 · La búsqueda de pedidos falla con algunos apellidos** (etiquetas `bug`, `backoffice`). Pequeño, con un síntoma reproducible (`O'Connor` da «error interno») y un sitio claro en el código (`GET /api/admin/orders`, parámetro `q`).

## Recorrido

### 1 — El issue tiene que poder resolverse sin preguntar

El coding agent no puede preguntarle nada a Finanzas ni a soporte: trabaja con lo que diga el issue y el repo. TEA-108 tal como está en el backlog:

```text
---
titulo: "La búsqueda de pedidos falla con algunos apellidos"
etiquetas: [bug, backoffice]
---
Al buscar «O'Connor» en Pedidos el backoffice muestra «error interno».
```

Antes de asignarlo se completa el issue con criterios de aceptación comprobables. Por ejemplo, como comentario del issue:

```markdown
Criterios de aceptación
- `GET /api/admin/orders?q=O'Connor` responde 200 (lista vacía si no hay coincidencias).
- La consulta usa parámetros ($n); `q` no se concatena en el SQL.
- Test en `services/api` que busca un apellido con apóstrofo.
- `make test` en verde.
```

Sin esto, el agente decide solo qué es «arreglado».

### 2 — El entorno del agente

El coding agent trabaja en una máquina efímera de **GitHub Actions**, no en el Codespace. Para Teatralia necesita Node 22, las dependencias y una base de datos con los datos de ejemplo. Eso se le prepara con un workflow de nombre fijo, `.github/workflows/copilot-setup-steps.yml`, cuyo único job se llama `copilot-setup-steps`:

```yaml
# Pasos que se ejecutan antes de que el coding agent empiece a trabajar
name: Copilot Setup Steps
on:
  workflow_dispatch:                       # para probarlo a mano desde la pestaña Actions
  pull_request:
    paths: [.github/workflows/copilot-setup-steps.yml]
jobs:
  copilot-setup-steps:                     # el nombre del job es obligatorio
    runs-on: ubuntu-latest
    permissions:
      contents: read
    services:
      postgres:                            # la misma versión que infra/compose.yaml
        image: postgres:17
        env:
          POSTGRES_USER: teatralia
          POSTGRES_PASSWORD: teatralia
          POSTGRES_DB: teatralia
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U teatralia" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgres://teatralia:teatralia@localhost:5432/teatralia
      TEATRALIA_DEVCONTAINER: "1"          # make no intenta levantar Docker Compose: Postgres ya es un servicio
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: make setup                    # npm install en teatralia/
      - run: make db-reset                 # esquema y datos de ejemplo
```

Las variables y secretos que el agente necesite mientras trabaja se configuran en el entorno `copilot` del repositorio (**Settings** → **Environments** → **copilot**). Su acceso a internet pasa por un cortafuegos con una lista de dominios permitidos (**Settings** → **Copilot** → **Coding agent**).

### 3 — Asignar el issue

En github.com, en el issue TEA-108:

1. En la barra lateral, **Assignees** → **Copilot**.
2. Aparece un cuadro para añadir instrucciones (rama base, indicaciones extra) y, según el plan, el modelo. Se confirma.

Unos segundos después, Copilot reacciona al issue (👀) y aparece enlazada una **pull request en borrador** abierta por Copilot, con un título del tipo «[WIP] Fix order search with apostrophes» y una lista de tareas que va marcando. El trabajo se ve en directo con **View session**: qué ficheros lee, qué comandos ejecuta (`make test`), qué decide.

Lo mismo se puede lanzar desde VS Code («delegar» una tarea del chat al coding agent) o desde el panel de agentes de github.com; el resultado es igual: una rama `copilot/…` y una PR.

### 4 — Lo que entrega

Cuando termina, la PR deja de ser borrador y pide revisión a quien asignó el issue. Lo que hay que mirar, como en cualquier PR:

| Qué | Dónde | En TEA-108 |
|-----|-------|------------|
| Alcance | **Files changed** | `services/api/src/routes/admin.ts` y un test; nada en `apps/` ni en migraciones |
| El arreglo | Diff de `admin.ts` | `q` pasa a ser un parámetro (`ILIKE $n`), no texto concatenado |
| La prueba | El test nuevo | Busca `O'Connor` y espera 200 |
| Los checks | Pestaña **Checks** | Los workflows de la PR **no se ejecutan solos**: alguien con permisos pulsa **Approve and run workflows** |
| La sesión | **View session** | Qué comandos ejecutó y si los tests pasaron de verdad |

Las correcciones se piden comentando en la PR y mencionando a `@copilot`: el agente vuelve a trabajar sobre la misma rama. El agente no puede aprobar ni fusionar su propia PR; la fusión la hace una persona, con las reglas de protección de rama del repo.

### 5 — Las políticas de la organización (Copilot Business)

En una organización con Copilot Business, lo anterior solo ocurre si la organización lo permite. Se gestiona en **Settings de la organización** → **Copilot**:

| Política | Dónde | Qué decide | Para Plataforma de Cegid |
|----------|-------|------------|--------------------------|
| **Modelos** | **Copilot** → **Models** | Qué modelos premium se pueden elegir en el selector | Incluidos siempre; premium solo los aprobados |
| **Peticiones premium** | **Billing** / presupuestos de Copilot | Si se puede pasar del cupo pagando y con qué presupuesto | Presupuesto mensual por equipo |
| **Coding agent** | **Copilot** → **Policies** / **Coding agent** | Si está activo y en qué repositorios | Solo en repos con `copilot-setup-steps.yml` y protección de rama |
| **Servidores MCP** | **Copilot** → **Policies** («MCP servers in Copilot») | Si los clientes de Copilot pueden usar servidores MCP | Activo, con los servidores revisados por el equipo |
| **Código público** | **Copilot** → **Policies** («Suggestions matching public code») | Bloquear sugerencias que coinciden con código público | Bloqueado |
| **Exclusión de contenido** | **Copilot** → **Content exclusion** (y en cada repo, **Settings** → **Copilot**) | Rutas que Copilot no lee ni usa como contexto | Ficheros con secretos y datos personales |
| **Auditoría** | **Settings** → **Audit log**, filtro `action:copilot` | Quién cambió políticas, licencias y accesos | Revisión periódica |

Un ejemplo de exclusión de contenido para el repositorio de Teatralia (formato de la configuración de repositorio: rutas desde la raíz):

```yaml
- "/teatralia/services/api/src/seed-data.ts"   # claves de proveedores de correo y emails de compradores
- "/infra/.env"
- "**/*.pem"
```

> [!WARNING]
> La exclusión de contenido no cubre todas las funciones de Copilot por igual: la documentación de GitHub lista en qué superficies no se aplica (según la versión, por ejemplo en algunos modos de agente). Lo excluido sigue estando en el repo: un agente con terminal puede leerlo con `cat`. La exclusión reduce exposición; no sustituye a sacar los secretos del repositorio.

### 6 — Qué queda en el registro

Cada acción del coding agent queda en GitHub como la de un compañero: el issue asignado, la rama `copilot/…`, los commits (con quien lo pidió como coautor), la PR, la sesión y los workflows ejecutados. El audit log de la organización registra los cambios de políticas y licencias. Esa trazabilidad es lo que permite a una organización dejar trabajar a un agente sin que nadie mire en directo.

## Qué queda visto

- El coding agent convierte un issue en una PR, trabajando en GitHub Actions con el entorno que le prepara `copilot-setup-steps.yml`.
- La calidad del resultado depende del issue: criterios de aceptación comprobables y un alcance pequeño.
- La PR se revisa como la de cualquier compañero; sus workflows necesitan aprobación y la fusión la hace una persona.
- En Copilot Business, la organización decide modelos, coding agent, MCP, exclusiones y auditoría.

El laboratorio [06 — El flujo de trabajo del equipo](06-lab-flujo-del-equipo.md) recoge la otra mitad del gobierno, la que vive en el repo: instrucciones, prompts, agentes, MCP y reglas de revisión que el equipo adopta. Queda abierta la pregunta: **¿qué tendría que estar escrito en el repo para que un issue asignado a Copilot salga bien sin que nadie lo vigile?** Se puede hacer sin haber seguido esta demostración.
