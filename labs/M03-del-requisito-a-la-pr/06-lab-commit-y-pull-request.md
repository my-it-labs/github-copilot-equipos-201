# Laboratorio: commit y pull request

[← Página anterior](05-lab-cambio-en-varios-ficheros.md) · [Siguiente página →](07-lab-revisar-un-diff.md)

Un promotor ha pedido ver la categoría y la ciudad en la tabla **Eventos** del backoffice. El cambio está hecho, sin
confirmar, como al final de una tarde de trabajo… y con algo más que se coló mientras probabas. En este laboratorio
generas el mensaje de commit y la descripción de la pull request con Copilot y los corriges contra el `git diff`
real: lo que el mensaje dice tiene que estar en el diff, y lo que está en el diff tiene que estar en el mensaje o
fuera del commit.

### Objetivo

Comprender qué hace fiel un mensaje de commit y una descripción de PR: cómo los genera Copilot a partir del diff, cómo
deben ser (qué cambia, por qué, cómo probarlo, nada más), cómo se detectan las afirmaciones que no están en el diff y
los cambios que el mensaje no cuenta, y cómo se corrigen.

### Punto de partida

- Codespace del fork, terminal en la raíz del repositorio, en la rama principal (`main`).
- Estado limpio y el cambio pendiente preparado por el script del módulo:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
# Deja cambios sin confirmar en teatralia/ (no hace commit)
scripts/m03-cambio-pendiente.sh
```

**Resultado esperado:**

```text
Cambios sin confirmar en teatralia/ (no hay commit todavía):
 M teatralia/apps/backoffice/src/sections.tsx
 M teatralia/services/api/src/config.ts
```

<details>
<summary>Qué hace por dentro (<code>scripts/m03-cambio-pendiente.sh</code>)</summary>

```bash
# Se niega a trabajar si ya tienes cambios en teatralia/ (no los pisa)
if [ -n "$(git status --porcelain -- teatralia)" ]; then
  echo "Tienes cambios sin guardar en teatralia/. …" >&2
  exit 1
fi
# Aplica un parche (incluido en el propio script) sin hacer commit:
# columnas Categoría y ciudad en la tabla Eventos (sections.tsx) y holdMinutes 10 → 15 (config.ts)
git apply <<'PATCH'
…
PATCH
git status --short -- teatralia
```

</details>

- `make up` en otra terminal si quieres ver la tabla en el backoffice (puerto 5174, token `lumen-dev-token`).
- `gh` con sesión (en Codespaces ya la tiene) para abrir la PR en tu fork.

### Qué está pasando

El historial de Git es la memoria del equipo: dentro de seis meses, alguien hará `git log` o `git blame` sobre
`config.ts` para saber por qué las butacas se bloquean 15 minutos. Si el commit se llama «Mejoras en el backoffice»,
esa respuesta se ha perdido. Copilot genera mensajes a partir del diff preparado: describe bien lo que ve, no sabe
**por qué** se hizo y no distingue lo que querías cambiar de lo que se coló.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| El trabajo de una tarde | Los cambios que deja `scripts/m03-cambio-pendiente.sh` |
| El botón de Copilot en el mensaje de commit | ✨ en la caja de mensaje de **Source Control** |
| La descripción de la PR | Generada en el chat a partir de `git diff main...HEAD` |
| La comprobación | `git diff`, `git diff --stat`, `curl` |

### 1 — Mira el diff antes de que nadie lo resuma

```bash
# Qué ficheros y cuántas líneas
git diff --stat
# El cambio pequeño, entero
git diff -- teatralia/services/api/src/config.ts
```

**Resultado esperado:**

```text
 teatralia/apps/backoffice/src/sections.tsx | 9 ++++++---
 teatralia/services/api/src/config.ts       | 2 +-
 2 files changed, 7 insertions(+), 4 deletions(-)
diff --git a/teatralia/services/api/src/config.ts b/teatralia/services/api/src/config.ts
index d0bb83f..e95462a 100644
--- a/teatralia/services/api/src/config.ts
+++ b/teatralia/services/api/src/config.ts
@@ -4,5 +4,5 @@ export const config = {
   redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
   paymentsUrl: process.env.PAYMENTS_URL ?? 'http://localhost:3001',
   ticketsSecret: process.env.TICKETS_SECRET ?? 'teatralia-dev-solo-para-el-curso',
-  holdMinutes: 10,
+  holdMinutes: 15,
 };
```

**Cómo se lee:** dos cambios que no tienen nada que ver. `sections.tsx` es lo pedido (tabla Eventos). `config.ts` sube
de 10 a 15 minutos el tiempo que una butaca queda bloqueada mientras el comprador paga: afecta a todos los promotores
y a la tienda, y nadie lo ha pedido. Abre también `git diff -- teatralia/apps/backoffice/src/sections.tsx` y localiza
la columna **Categoría** y la ciudad junto al recinto.

### 2 — Genera el mensaje con Copilot con todo preparado

Haz lo que se hace con prisa: prepararlo todo y pedir el mensaje.

```bash
# Rama del cambio y todo preparado
git switch -c eventos-categoria-ciudad
git add -A teatralia
```

En VS Code:

1. Abre **Source Control** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>). En **Staged Changes** están los dos ficheros.
2. En la caja **Message**, pulsa el icono de destellos ✨ (*Generate Commit Message with Copilot*).
3. **No** pulses **Commit** todavía.

**Qué debe contener la propuesta** (cambia en cada ejecución): una línea de resumen sobre la tabla de Eventos
(categoría y ciudad). Fíjate en el `holdMinutes`: unas veces aparece como una línea más («update hold minutes to 15»),
otras no aparece. Las dos son un problema: si no aparece, el commit esconde un cambio de comportamiento; si aparece,
el mensaje da por bueno un cambio que nadie pidió, sin el porqué.

> [!NOTE]
> El nombre y el icono del botón pueden variar con la versión de VS Code y de Copilot Chat. Si no lo ves, pasa el
> ratón por la caja del mensaje o búscalo en la paleta de comandos (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>,
> «Generate Commit Message»).

### 3 — Saca del commit lo que no se pidió

El mensaje no se arregla con palabras: se arregla el contenido del commit. El cambio de `config.ts` se descarta:

```bash
# Quita config.ts del área de preparación y deshaz su cambio
git restore --staged teatralia/services/api/src/config.ts
git restore teatralia/services/api/src/config.ts
git status --short
```

**Resultado esperado:**

```text
M  teatralia/apps/backoffice/src/sections.tsx
```

**Cómo se lee:** la `M` en la primera columna es «preparado»; solo queda la tabla de Eventos. Pulsa otra vez ✨ en
**Source Control**: la propuesta ya no puede mencionar los 15 minutos.

### 4 — Corrige el mensaje y confirma

Edita la propuesta hasta que cumpla tres reglas: una línea de resumen en imperativo o descriptiva y corta, un cuerpo
que diga lo que no se ve en el diff (por qué y qué no cambia) y nada que no esté en el diff. Una versión que cumple:

```text
Backoffice: categoría y ciudad en la tabla de Eventos

La tabla de Eventos muestra la categoría en su propia columna y la ciudad
junto al recinto. GET /api/admin/events ya devolvía los dos campos: no
cambia la API.
```

Pulsa **Commit** y comprueba qué ha quedado:

```bash
# Último commit: mensaje y ficheros
git log --stat -1 --format=%s
```

**Resultado esperado:**

```text
Backoffice: categoría y ciudad en la tabla de Eventos

 teatralia/apps/backoffice/src/sections.tsx | 9 ++++++---
 1 file changed, 6 insertions(+), 3 deletions(-)
```

### 5 — Comprueba la frase del mensaje que no está en el diff

«GET /api/admin/events ya devolvía los dos campos» es una afirmación sobre código que el commit **no** toca. Si es
falsa, la tabla saldría vacía. Compruébala contra la API (con `make up` en marcha):

```bash
# La API del backoffice devuelve city y category de cada evento
curl -s localhost:3000/api/admin/events -H 'authorization: Bearer lumen-dev-token' | jq -c '.[0:3][] | {id, city, category}'
```

**Resultado esperado:**

```text
{"id":"EV-LUMEN-0005","city":"Madrid","category":"teatro"}
{"id":"EV-LUMEN-0007","city":"Madrid","category":"humor"}
{"id":"EV-LUMEN-0009","city":"Madrid","category":"teatro"}
```

**Cómo se lee:** la frase es cierta, comprobada. En el backoffice, **Eventos** muestra la columna *Categoría* y la
ciudad bajo el título.

### 6 — Pide la descripción de la PR

La descripción de la PR la lee quien revisa, antes que el código. Pídela en el chat, modo **Agent** (necesita ejecutar
`git` en la terminal):

```text
Escribe la descripción de una pull request a partir de `git diff --stat main...HEAD` y
`git diff main...HEAD`. Secciones: Qué cambia, Por qué, Cómo probarlo (comandos exactos),
Fuera de alcance. Solo lo que esté en el diff; si algo no lo sabes, escribe [PENDIENTE].
Guárdala en /tmp/pr-eventos.md.
```

**Qué debe contener la respuesta:** el agente ejecuta los dos `git diff` (acepta el permiso) y escribe el fichero.
Ábrelo con `code /tmp/pr-eventos.md` y comprueba cada frase:

| Afirmación habitual | Cómo comprobarla | Qué haces |
|---------------------|------------------|-----------|
| «Añade los campos a la API» | `git diff --stat main...HEAD`: solo `sections.tsx` | Quítala; la API no cambia (paso 5) |
| «Añade tests» | El diff no tiene ficheros de test | Quítala |
| «Por qué: lo pide el promotor X» | No está en el diff | Escríbelo tú o deja `[PENDIENTE]` |
| «Cómo probarlo: abre Eventos» | Hazlo en el backoffice | Déjala, con el token |

### 7 — Abre la PR en tu fork

```bash
# Sube la rama a tu fork
git push -u origin eventos-categoria-ciudad
# Abre la PR contra la rama principal de tu fork, con el título del commit y tu descripción corregida
gh pr create --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" --base main \
  --title "Backoffice: categoría y ciudad en la tabla de Eventos" --body-file /tmp/pr-eventos.md
```

**Resultado esperado:** `gh` imprime la URL de la PR
(`https://github.com/<tu-usuario>/github-copilot-equipos-201/pull/<n>`). En la pestaña **Files changed** hay un
solo fichero, `sections.tsx`.

> [!NOTE]
> En github.com, al editar la descripción de una PR aparece un botón de Copilot para generar un resumen de los
> cambios, y en **Reviewers** se puede pedir a Copilot que revise. Ambas funciones dependen del plan de Copilot de tu
> cuenta. Si las tienes, el resumen generado se corrige igual que en el paso 6: cada frase contra el diff.

## Comprueba tu entendimiento

**El diff del commit y el de la PR coinciden**
Ejecuta `git diff --stat main...HEAD`.
→ Un fichero, `teatralia/apps/backoffice/src/sections.tsx`, 9 líneas: lo mismo que el paso 4 y que **Files changed**.

**Nada sin respaldo**
Elige una frase de tu descripción de PR y señala la línea del diff o el comando que la respalda.
→ Si no encuentras ninguna, la frase sobra o es un `[PENDIENTE]` para quien sepa la respuesta.

## Experimenta

**Predice antes:** si preparas solo `config.ts` (sin `sections.tsx`) y pulsas ✨, ¿dirá el mensaje **por qué** se
cambian los minutos?

Pruébalo desde la rama principal:

```bash
# Vuelve a main, recupera los cambios pendientes y prepara solo config.ts
git switch main
scripts/m03-cambio-pendiente.sh
git add teatralia/services/api/src/config.ts
```

Pulsa ✨ en **Source Control**. Lo habitual es «Increase hold time to 15 minutes» o similar: describe el qué, que ya
se ve en el diff, y nunca el porqué, que no está en ningún sitio. Descarta después:

```bash
# Deja teatralia/ como al principio
git restore --staged teatralia
CONFIRM=1 make reset
```

## Reto

### 1 — Dos cambios, dos commits

**La situación:** un compañero te dice que los 15 minutos sí se pidieron: Sala Marea tiene incidencias de cobro en
conciertos de pie y quería más margen de pago. Quiere que los dos cambios vayan en la misma rama, pero sin mezclar.

**Qué haces:** desde la rama principal y con `scripts/m03-cambio-pendiente.sh` recién aplicado, crea una rama y haz
**dos** commits, uno por cambio, cada uno con su mensaje y su porqué.

**Pistas:** `git add <fichero>` prepara solo ese fichero; `git commit -m "resumen" -m "cuerpo"` añade un cuerpo; el
✨ genera el mensaje de lo que esté preparado en cada momento.

**Lo que buscas:** que `git log --stat main..HEAD` muestre dos commits de un fichero cada uno, y que el de `config.ts`
diga para quién y por qué.

<details>
<summary>Ver solución</summary>

```bash
git switch -c eventos-y-bloqueo
git add teatralia/apps/backoffice/src/sections.tsx
git commit -m "Backoffice: categoría y ciudad en la tabla de Eventos"
git add teatralia/services/api/src/config.ts
git commit -m "Pedidos: bloqueo de butacas sin pagar de 10 a 15 minutos" \
  -m "Lo pide Sala Marea: en sus conciertos de pie el pago tarda más (incidencias de cobro)."
git log --stat --format="%s" main..HEAD
```

```text
Pedidos: bloqueo de butacas sin pagar de 10 a 15 minutos

 teatralia/services/api/src/config.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
Backoffice: categoría y ciudad en la tabla de Eventos

 teatralia/apps/backoffice/src/sections.tsx | 9 ++++++---
 1 file changed, 6 insertions(+), 3 deletions(-)
```

Ahora cada cambio se puede revisar, revertir (`git revert`) o buscar con `git log -S holdMinutes` por separado. En un
equipo real, el de `config.ts` probablemente iría en su propia PR: afecta a todos los promotores, no solo a la tabla
de Eventos. **La regla:** un commit, un motivo; Copilot redacta bien el qué de lo que está preparado, así que el
trabajo es preparar solo lo que va junto y escribir el porqué.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `scripts/m03-cambio-pendiente.sh` dice «Tienes cambios sin guardar» | Quedan cambios de otro laboratorio | `CONFIRM=1 make reset` y vuelve a lanzarlo |
| `error: patch failed` al lanzar el script | Estás en una rama donde `sections.tsx` o `config.ts` ya cambiaron | `git switch main` y `CONFIRM=1 make reset` |
| El ✨ no aparece | Copilot Chat sin sesión o versión distinta | Comprueba la sesión de Copilot (icono en la barra de estado) o usa la paleta: «Generate Commit Message» |
| El mensaje generado habla de ficheros que no has cambiado | Había más cambios preparados | `git status --short` y deja preparado solo lo del commit |
| `gh pr create` propone el repositorio del curso | `gh` toma el repositorio padre del fork | Usa `--repo` como en el paso 7 |
| La tabla de Eventos no muestra la ciudad | El backoffice no se ha recargado | Recarga la página (<kbd>F5</kbd>) con `make up` en marcha |

## Conclusiones

### Qué es un mensaje fiel al cambio

Es un mensaje de commit o una descripción de PR en la que **todo lo que se afirma está en el diff** (o se ha
comprobado, como la API en el paso 5) y **todo lo que está en el diff se cuenta** o se ha sacado del commit. Copilot
escribe el qué a partir del diff; el porqué y la decisión de qué entra son tuyos.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Un motivo por commit | Tabla de Eventos sin el `holdMinutes` |
| Resumen corto y concreto | «Backoffice: categoría y ciudad en la tabla de Eventos» |
| Cuerpo con lo que no se ve en el diff | «La API ya devolvía los dos campos» |
| Afirmaciones comprobadas | `curl` a `/api/admin/events` |
| PR con cómo probarlo y fuera de alcance | Secciones del paso 6, corregidas |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Un cambio no pedido dentro del commit | `git diff --stat`: `config.ts` | Comportamiento nuevo para todos los promotores sin revisión |
| Mensaje que omite parte del diff | Propuesta de ✨ sin `holdMinutes` | Historial que esconde cambios |
| Afirmaciones sin respaldo en la PR | «Añade tests», «cambia la API» | Quien revisa confía en algo que no existe |
| El porqué no está en ningún sitio | Experimenta: solo el qué | `git blame` no explica la decisión |

### Cómo se perfecciona

El equipo fija el formato en las instrucciones del repositorio (resumen con prefijo de área, cuerpo con el porqué,
referencia al issue) y una plantilla de PR en `.github/pull_request_template.md` con Qué / Por qué / Cómo probarlo /
Fuera de alcance. Copilot rellena el borrador con esas reglas; tú lo contrastas con el diff.

### En una frase

> 🔑 Copilot resume el diff que le das: el commit es fiel cuando preparas solo lo que va junto, compruebas cada frase contra el diff y escribes tú el porqué.
