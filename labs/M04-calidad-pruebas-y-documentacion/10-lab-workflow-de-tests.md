# Laboratorio: workflow de tests en GitHub Actions

[← Página anterior](09-lab-notas-de-version.md) · [Siguiente página →](../M05-copilot-intermedio/README.md)

Los tests de Teatralia solo protegen si alguien los ejecuta. Hoy dependen de que cada persona se acuerde de lanzar `npm test` antes de abrir una pull request, y con código generado por Copilot eso es demasiado confiar. En este lab pides a Copilot un workflow de GitHub Actions que ejecute lint, tipos y tests en cada pull request de tu fork (con una base de datos PostgreSQL para los tests que la necesiten), compruebas sus comandos en local, lo ves pasar en verde, lo rompes con un test de la política de devoluciones y lo ves fallar.

### Objetivo

Comprender qué es la integración continua asistida: cómo se genera un workflow con Copilot, cómo debe ser para este repositorio (subcarpeta `teatralia/`, Node 22, caché de npm, Postgres como servicio), cómo se detecta un workflow que no comprueba lo que crees y cómo se ve en una pull request que un cambio rompe la suite.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio.
- Teatralia en su estado inicial:

```bash
# Descarta tus cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- Tu fork en GitHub (`https://github.com/TU_USUARIO/github-copilot-teatralia-201`), con permiso para crear ramas y pull requests. Cambia `TU_USUARIO` por tu usuario en todo el lab.
- Vista **Chat** de Copilot (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>).

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Cada cambio llega por pull request | Una rama de tu fork y una pull request contra el `main` de tu fork |
| Una máquina limpia instala y prueba el proyecto | Un *runner* `ubuntu-latest` de GitHub Actions |
| El proyecto no está en la raíz del repositorio | `working-directory: teatralia` |
| Algunos tests necesitan base de datos | Un contenedor `postgres:17-alpine` como servicio del job y `npm run db:reset` |
| La pull request muestra si se puede fusionar | La comprobación **Tests de Teatralia** en verde o en rojo |

### 1 — Ejecuta en local lo que hará el workflow

Antes de escribir YAML, comprueba que los comandos funcionan en una instalación limpia, en el mismo orden en que los ejecutará el runner. `npm ci` instala exactamente lo que dice `package-lock.json`.

```bash
cd teatralia
# Instalación limpia desde el lockfile
npm ci --no-audit --no-fund
# Base de datos con los datos de ejemplo, lint, tipos y tests
npm run db:reset
npm run lint
npm run typecheck
npm test
```

**Resultado esperado** (líneas clave; el número de paquetes y los tiempos pueden variar):

```text
added 350 packages in 3s
base de datos reiniciada con los datos de ejemplo
> eslint .
> tsc -p tsconfig.json
 Test Files  6 passed (6)
      Tests  21 passed (21)
```

Los cinco comandos terminan bien. Si alguno falla aquí, fallará también en GitHub: arréglalo antes de escribir el workflow. `db:reset` imprime además `(la pasarela no está arrancada; se vaciará al arrancar sin datos)`; es un aviso, no un error.

### 2 — Pide el workflow a Copilot

Conversación nueva en modo **Agent**:

```text
#file:teatralia/package.json
#file:infra/compose.yaml

Crea .github/workflows/teatralia-tests.yml (en la raíz del repositorio, no dentro de teatralia/)
con un job que se ejecute en cada pull_request y en cada push a main:
- ubuntu-latest; todos los comandos con working-directory: teatralia
- servicio postgres:17-alpine con usuario, contraseña y base de datos «teatralia», puerto 5432 y
  healthcheck con pg_isready; DATABASE_URL apuntando a localhost
- actions/setup-node con Node 22 y caché de npm usando teatralia/package-lock.json
- pasos con nombre: npm ci, npm run db:reset, npm run lint, npm run typecheck, npm test
No añadas despliegues ni secretos.
```

**Qué debe contener la respuesta** (el YAML varía en cada ejecución):

- `on:` con `pull_request` y `push` a `main`;
- `defaults.run.working-directory: teatralia` (o el mismo valor en cada paso);
- `services.postgres` con la imagen 17, las tres variables `POSTGRES_*` y un `--health-cmd`;
- `cache-dependency-path: teatralia/package-lock.json`: sin él, `setup-node` busca el lockfile en la raíz y falla;
- los cinco pasos del paso 1, en ese orden.

<details>
<summary>Solución de referencia: <code>.github/workflows/teatralia-tests.yml</code></summary>

```yaml
# Tests de Teatralia en cada pull request (y en cada push a main)
name: Tests de Teatralia

on:
  pull_request:
  push:
    branches: [main]

jobs:
  tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: teatralia   # el proyecto vive en una subcarpeta del repositorio

    # Postgres para los tests que usan la base de datos (con los datos de ejemplo)
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: teatralia
          POSTGRES_PASSWORD: teatralia
          POSTGRES_DB: teatralia
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U teatralia"
          --health-interval 2s
          --health-retries 30

    env:
      DATABASE_URL: postgres://teatralia:teatralia@localhost:5432/teatralia
      LOG_LEVEL: warn

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: teatralia/package-lock.json

      - name: Instalar dependencias
        run: npm ci --no-audit --no-fund

      - name: Base de datos con los datos de ejemplo
        run: npm run db:reset

      - name: Lint
        run: npm run lint

      - name: Tipos
        run: npm run typecheck

      - name: Tests
        run: npm test
```

</details>

### 3 — Revisa el workflow antes de subirlo

Un workflow mal escrito puede pasar en verde sin probar nada. Ábrelo y comprueba estas cuatro cosas; si falta alguna, pídela en el mismo chat:

| Comprueba | Si falta |
|-----------|----------|
| `working-directory: teatralia` | `npm ci` falla: no hay `package.json` en la raíz |
| `cache-dependency-path: teatralia/package-lock.json` | `setup-node` falla al buscar el lockfile |
| `npm test` es un paso propio, no `npm test || true` ni con `continue-on-error: true` | Los tests fallan y el job sale en verde |
| `DATABASE_URL` con `localhost:5432` | `db:reset` intenta conectar con el `postgres` del Codespace y no lo encuentra |

```bash
cd ..
# Lo que el workflow va a ejecutar, en orden
grep -nE "working-directory|cache-dependency-path|run:|continue-on-error" .github/workflows/teatralia-tests.yml
```

**Resultado esperado** (con la solución de referencia):

```text
13:      run:
14:        working-directory: teatralia   # el proyecto vive en una subcarpeta del repositorio
42:          cache-dependency-path: teatralia/package-lock.json
45:        run: npm ci --no-audit --no-fund
48:        run: npm run db:reset
51:        run: npm run lint
54:        run: npm run typecheck
57:        run: npm test
```

Ningún `continue-on-error`. La línea 13 es la cabecera de `defaults.run`; los cinco `run:` siguientes son los comandos del paso 1.

### 4 — Activa Actions en tu fork

GitHub no ejecuta workflows en un fork hasta que su dueño lo permite.

1. Abre tu fork en el navegador y entra en la pestaña **Actions**.
2. Si aparece el aviso *Workflows aren't being run on this forked repository*, pulsa **I understand my workflows, go ahead and enable them**.

**Resultado esperado:** la pestaña **Actions** muestra la lista de workflows (vacía todavía) en lugar del aviso.

### 5 — Sube el workflow en una rama y abre la pull request

```bash
# Rama nueva con el workflow
git switch -c ci/tests-teatralia
git add .github/workflows/teatralia-tests.yml
git commit -m "ci: tests de Teatralia en cada pull request"
git push -u origin ci/tests-teatralia
```

**Resultado esperado** (el identificador del commit cambia; con la solución de referencia, 57 líneas):

```text
Switched to a new branch 'ci/tests-teatralia'
[ci/tests-teatralia 284ec55] ci: tests de Teatralia en cada pull request
 1 file changed, 57 insertions(+)
 create mode 100644 .github/workflows/teatralia-tests.yml
 * [new branch]      ci/tests-teatralia -> ci/tests-teatralia
branch 'ci/tests-teatralia' set up to track 'origin/ci/tests-teatralia'.
```

Abre la pull request **contra tu fork**, no contra el repositorio del curso:

1. En GitHub, en tu fork, pulsa **Compare & pull request** en el aviso de la rama recién subida.
2. En **base repository**, elige `TU_USUARIO/github-copilot-teatralia-201` y rama `main`.
3. Pulsa **Create pull request**.

> [!WARNING]
> En un fork, GitHub propone por defecto como destino el repositorio original. Cambia **base repository** a tu fork: tu pull request es para ti.

**Resultado esperado:** en la pull request, bajo **Checks**, aparece **Tests de Teatralia / tests** en ejecución (círculo amarillo) y al terminar en verde (✓). En **Details** ves los pasos con nombre: *Instalar dependencias*, *Base de datos con los datos de ejemplo*, *Lint*, *Tipos* y *Tests*; el último termina con las mismas líneas que en local: `Test Files  6 passed (6)` y `Tests  21 passed (21)`.

### 6 — Rompe la suite a propósito y mira la pull request

Un workflow que nunca has visto fallar no sabes si funciona. Añade a la rama un test de la política de devoluciones que el código actual no cumple (el céntimo de TEA-106).

```bash
# Test de la política §3 que falla con el código actual
cat > teatralia/services/api/test/reembolso-redondeo.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { calcRefund } from '../src/orders/refunds.js';

// docs/politica-devoluciones.md §3: penalización del 10 % sobre el IMPORTE TOTAL de las entradas
// devueltas, redondeada al céntimo. Los gastos de gestión no se devuelven.
const entrada = (id: string, price_cents: number) => ({ id, price_cents, fee_cents: 100 });

describe('devolución por petición del cliente', () => {
  it('PED-2026-1250: una entrada de 18,25 € → 16,43 €', () => {
    expect(calcRefund([entrada('PED-2026-1250-1', 1825)], 'petición del cliente')).toBe(1643);
  });

  it('PED-2026-1779: 18,25 € + 32,00 € → 45,23 €', () => {
    const t = [entrada('PED-2026-1779-1', 1825), entrada('PED-2026-1779-2', 3200)];
    expect(calcRefund(t, 'petición del cliente')).toBe(4523);
  });

  it('ejemplo de la política: dos entradas de 18,25 € → 32,85 €', () => {
    const t = [entrada('A-1', 1825), entrada('A-2', 1825)];
    expect(calcRefund(t, 'petición del cliente')).toBe(3285);
  });
});
EOF
# Lo que verá el runner, primero en local
(cd teatralia && npm test; echo "código de salida de npm test: $?")
```

**Resultado esperado** (líneas clave):

```text
     × PED-2026-1250: una entrada de 18,25 € → 16,43 € 7ms
     × PED-2026-1779: 18,25 € + 32,00 € → 45,23 € 1ms
     × ejemplo de la política: dos entradas de 18,25 € → 32,85 € 1ms
 Test Files  1 failed | 6 passed (7)
      Tests  3 failed | 21 passed (24)
código de salida de npm test: 1
```

El código de salida 1 es lo que hace fallar el paso en GitHub. Súbelo:

```bash
git add teatralia/services/api/test/reembolso-redondeo.test.ts
git commit -m "test: política de devoluciones §3 (TEA-106)"
git push
```

**Resultado esperado** en la pull request: una nueva ejecución de **Tests de Teatralia / tests**, que termina en rojo (✗). En **Details**, los pasos hasta *Tipos* en verde y *Tests* en rojo, con los mismos `AssertionError` que en local (`expected 1642 to be 1643`…). La pull request muestra *Some checks were not successful*.

### 7 — Arregla y vuelve a verde

Aplica el arreglo de `calcRefund` (penalización sobre el total, redondeada una vez) y súbelo a la misma rama.

<details>
<summary>El arreglo (<code>calcRefund</code> en <code>teatralia/services/api/src/orders/refunds.ts</code>)</summary>

```ts
// Importe que se devuelve por un conjunto de entradas de un pedido.
export function calcRefund(tickets: RefundableTicket[], reason: RefundReason): number {
  const price = tickets.reduce((s, t) => s + t.price_cents, 0);
  const fees = tickets.reduce((s, t) => s + t.fee_cents, 0);
  if (reason === 'petición del cliente') {
    // penalización del 10 % sobre el total de las entradas devueltas, redondeada al céntimo (política §3)
    return Math.round((price * 9) / 10);
  }
  // cancelación, aplazamiento y doble cobro: precio y gastos
  return price + fees;
}
```

</details>

```bash
(cd teatralia && npx vitest run services/api/test/reembolso-redondeo.test.ts)
git add teatralia/services/api/src/orders/refunds.ts
git commit -m "fix(devoluciones): penalización del 10 % sobre el total (TEA-106)"
git push
```

**Resultado esperado:** en local, `Tests  3 passed (3)`; en la pull request, una tercera ejecución en verde. El historial de la pull request cuenta la historia completa: workflow (✓), test que reproduce el fallo (✗), arreglo (✓).

## Comprueba tu entendimiento

**Un workflow que nunca falla**
Cambia en tu workflow el paso de tests por `run: npm test || true` y explica qué habría pasado en el paso 6.
→ El job habría salido en verde con tres tests en rojo: `|| true` convierte el código de salida 1 en 0. Vuelve a `run: npm test`.

**Dónde se ejecuta cada cosa**
Explica por qué el `DATABASE_URL` del workflow usa `localhost` y el del Codespace usa `postgres`.
→ En el Codespace, Postgres es otro contenedor del compose y se llega por su nombre de servicio; en el runner, el servicio del job publica el puerto 5432 en la máquina del runner.

## Experimenta

**Predice** qué paso falla y con qué mensaje si quitas `cache-dependency-path` del workflow. Pruébalo en la rama, mira **Details** de la ejecución y vuelve a ponerlo. Lo esperable: falla el paso de `actions/setup-node`, antes de instalar nada, porque busca el lockfile en la raíz del repositorio y Teatralia lo tiene en `teatralia/`. Un fallo de configuración del workflow se distingue de un fallo del código por el paso en el que ocurre.

## Reto

### 1 — Un test que necesita la base de datos

**La situación:** el equipo quiere tests de integración que llamen a la API de verdad (con `app.inject`) contra los datos de ejemplo. Un compañero duda de que hagan falta el servicio de Postgres y el paso `db:reset` en el workflow: «los tests ya pasan sin ellos».

**Qué haces:** añade un test de integración que busque el pedido de Ana desde el backoffice de Sala Faro. Ejecútalo en local con la base de datos y sin ella (apuntando `DATABASE_URL` a un puerto donde no hay nada). Después, súbelo a la rama y comprueba que el workflow lo pasa.

```ts
// teatralia/services/api/test/pedido-ana.test.ts
// Test de integración: usa la base de datos con los datos de ejemplo (make db-reset)
import { afterAll, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { buildServer } from '../src/server.js';

const app = buildServer();
afterAll(async () => {
  await app.close();
  await pool.end();
});

it('el backoffice de Sala Faro encuentra el pedido de Ana', async () => {
  const r = await app.inject({
    method: 'GET',
    url: '/api/admin/orders?q=0107',
    headers: { authorization: 'Bearer faro-dev-token' },
  });
  expect(r.statusCode).toBe(200);
  expect(r.json()[0]).toMatchObject({ id: 'PED-2026-0107', total_cents: 13370 });
});
```

**Pistas:** `DATABASE_URL=postgres://teatralia:teatralia@localhost:1/teatralia` delante del comando simula «no hay Postgres». `LOG_LEVEL=silent` evita el registro de cada petición.

**Lo que buscas:** el test en rojo sin base de datos, en verde con ella y en verde en la pull request.

<details>
<summary>Ver solución</summary>

```bash
cd teatralia
# Sin Postgres
DATABASE_URL=postgres://teatralia:teatralia@localhost:1/teatralia LOG_LEVEL=silent npx vitest run services/api/test/pedido-ana.test.ts
# Con el Postgres del Codespace
LOG_LEVEL=silent npx vitest run services/api/test/pedido-ana.test.ts
```

```text
   × el backoffice de Sala Faro encuentra el pedido de Ana 33ms
AssertionError: expected 500 to be 200 // Object.is equality
      Tests  1 failed (1)
```

```text
      Tests  1 passed (1)
```

Sin base de datos, la API responde 500 y el test falla; con ella, pasa. En el workflow pasa porque el job levanta `postgres:17-alpine` y `db:reset` carga los mismos datos de ejemplo que tu Codespace: `PED-2026-0107` existe con 133,70 €. Si el compañero quitara el servicio, este test pondría la pull request en rojo. **La regla:** el workflow tiene que reproducir el entorno que los tests suponen; si un test necesita datos, el job los crea.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| No aparece ninguna ejecución tras el push | Actions no está activado en el fork | Paso 4 |
| La pull request se abre contra el repositorio del curso | **base repository** por defecto en un fork | Ciérrala y ábrela con tu fork como base |
| `npm ci` falla: `ENOENT … package.json` | Falta `working-directory: teatralia` | Añade `defaults.run.working-directory` |
| `Dependencies lock file is not found` en *setup-node* | Falta `cache-dependency-path` | `cache-dependency-path: teatralia/package-lock.json` |
| `db:reset` falla con `ECONNREFUSED` | `DATABASE_URL` no apunta a `localhost:5432` o falta el servicio | Revisa `services.postgres` y `env.DATABASE_URL` |
| `refusing to allow … to create or update workflow` al hacer `git push` | El token no tiene permiso para modificar workflows | Crea el fichero desde la web de GitHub (**Add file**) o usa un token con el permiso `workflow` |
| El job sale en verde con tests en rojo | `|| true` o `continue-on-error: true` en el paso de tests | Quítalo: el paso tiene que fallar si fallan los tests |

## Conclusiones

### Qué es la integración continua asistida

Un workflow que, en cada pull request, instala el proyecto en una máquina limpia y ejecuta las mismas comprobaciones que harías tú a mano, y marca la pull request en verde o en rojo. Copilot escribe el YAML; tú decides qué tiene que comprobar y verificas que falla cuando debe.

```text
push a la rama → runner limpio + postgres → npm ci → db:reset → lint → tipos → tests → ✓ / ✗ en la pull request
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Los comandos funcionan en local, en limpio | Paso 1: `npm ci`, `db:reset`, lint, tipos, 21 tests |
| Respeta la estructura del repositorio | `working-directory` y `cache-dependency-path` con `teatralia/` |
| Levanta lo que los tests necesitan | `postgres:17-alpine` y `db:reset` |
| Falla cuando fallan los tests | Paso 6: código de salida 1 → ✗ en la pull request |
| Se ha visto fallar y pasar | ✓ → ✗ → ✓ en la misma pull request |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Rutas pensadas para un proyecto en la raíz | Paso 3, `working-directory` y `cache-dependency-path` | El job falla antes de probar nada |
| Workflow que no puede fallar | `npm test || true` | Verde con tests en rojo |
| Tests que suponen una base de datos | El reto: 500 sin Postgres | Rojo en CI que en local no pasa |
| Actions desactivado en el fork | Paso 4 | Pull requests sin comprobación |

### Cómo se perfecciona

- Exigir la comprobación en las reglas de la rama `main` (*branch protection*: *Require status checks to pass*), para que no se pueda fusionar en rojo.
- Añadir al workflow las herramientas del módulo: el comprobador de la especificación OpenAPI, CodeQL para la inyección SQL.
- Mantener los comandos del workflow iguales que los del `Makefile` o `package.json`, para que local y CI no diverjan.

### En una frase

> 🔑 Un workflow de tests solo es una red cuando lo has visto ponerse en rojo por un fallo real y volver a verde con el arreglo.
