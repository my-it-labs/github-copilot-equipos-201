# Laboratorio: el flujo de trabajo del equipo

[← Página anterior](05-demo-coding-agent.md)

Cada persona del equipo de Plataforma ha ido encontrando su forma de trabajar con Copilot: unas instrucciones en su máquina, un prompt guardado en una nota, un agente que solo tiene uno. Así el equipo no trabaja igual, nadie revisa esas reglas y quien llega nuevo empieza de cero. En este laboratorio empaquetas en el repo de Teatralia el **kit de Copilot del equipo**: instrucciones, instrucciones por ruta, un prompt file de revisión, el agente revisor de reembolsos, la configuración MCP, la plantilla de pull request y un **documento de adopción** que dice qué se usa, para qué y con qué límites. Un script del curso comprueba que el kit está completo y sin secretos.

### Objetivo

Comprender cómo se diseña la adopción de Copilot en un equipo: de qué piezas se compone, cómo debe ser cada una, cómo se detectan sus debilidades y cómo se mejora con el tiempo.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repo. Estado limpio de `teatralia/`:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo (no toca .github/ ni docs/ de la raíz)
CONFIRM=1 make reset
```

- [`.vscode/mcp.json`](../../.vscode/mcp.json) ya existe en el repo (servidores `teatralia` y `github`).
- Script de comprobación: [`scripts/revisar-kit-copilot.sh`](../../scripts/revisar-kit-copilot.sh).
- Si en otros laboratorios creaste ficheros en `.github/`, no pasa nada: este lab te dice qué debe tener cada uno; compáralos y quédate con lo mejor.

### Qué está pasando

| Pieza del kit | Fichero | Qué resuelve en el equipo |
|---------------|---------|---------------------------|
| Instrucciones del repo | `.github/copilot-instructions.md` | Las reglas que todo el mundo repetía en cada prompt (céntimos, SQL parametrizado, tests) |
| Instrucciones por ruta | `.github/instructions/reembolsos.instructions.md` | Reglas que solo aplican al tocar pedidos y reembolsos |
| Prompt file | `.github/prompts/revisar-pr.prompt.md` | La revisión asistida, igual para todos: `/revisar-pr` |
| Agente | `.github/agents/revisor-reembolsos.agent.md` | Un rol con herramientas acotadas |
| MCP | `.vscode/mcp.json` | Qué servidores existen y cómo arrancan |
| Plantilla de PR | `.github/pull_request_template.md` | Quien abre el PR declara cómo ha revisado lo generado |
| Documento de adopción | `docs/equipo/adopcion-copilot.md` | El acuerdo: qué se usa, para qué, qué no, y cómo se cambia |

Todo va en el repo y se cambia con pull requests: el kit se revisa como el código.

### 1 — Mira qué hay

Antes de escribir nada, comprueba el estado del kit:

```bash
# Revisa las piezas del kit de Copilot en el repo
scripts/revisar-kit-copilot.sh
```

**Resultado esperado** (si no tienes ninguna pieza de otros labs):

```text
Instrucciones
  ✘ .github/copilot-instructions.md no existe o está vacío
  ✘ ningún fichero en .github/instructions/
Prompt files
  ✘ ningún fichero en .github/prompts/
Agentes personalizados
  ✘ ningún agente en .github/agents/
Revisión
  ✘ .github/pull_request_template.md no existe
MCP
  ✔ .vscode/mcp.json → servidores: teatralia, github
Adopción
  ✘ docs/equipo/adopcion-copilot.md no existe
Secretos
  ✔ ningún token ni contraseña en .github, .vscode ni docs/equipo

Kit incompleto: 6 problema(s).
```

<details>
<summary>Qué hace por dentro (<code>scripts/revisar-kit-copilot.sh</code>)</summary>

```bash
# Lee un campo de la cabecera YAML (entre las dos primeras líneas ---)
campo() { awk -v c="$2" 'NR==1 && $0!="---"{exit} /^---$/{n++; next} n==1 && $0 ~ "^"c":" {sub("^"c":[ ]*",""); print; exit}' "$1"; }

# Instrucciones por ruta: cada una necesita applyTo para saber cuándo se aplica
a=$(campo "$f" applyTo)
# Agentes: description y tools obligatorios; avisa si tools incluye editar o ejecutar
grep -Eq "'(edit|editFiles|execute|runCommands|terminal)[/']" <<<"$t"
# .vscode/mcp.json: quita los comentarios // y comprueba que es JSON con servidores
node -e '… JSON.parse(t).servers …'
# Secretos: claves de SendGrid/Mailgun, tokens de GitHub y URLs de Postgres con contraseña
grep -rEn '(SG\.[A-Za-z0-9_-]{10,}|key-[0-9a-f]{20,}|ghp_…|github_pat_…|postgres://[^:"$]+:[^@"$]+@)' .github .vscode docs/equipo
```

No juzga si el texto es bueno: comprueba que cada pieza existe, que Copilot puede leerla y que no lleva secretos.

</details>

### 2 — Las instrucciones del repo

Son las reglas que Copilot recibe en cada petición de chat del repo. Pocas y comprobables: cada línea tiene que poder verse cumplida o incumplida en un diff. Crea `.github/copilot-instructions.md` en la raíz del repo:

```markdown
# Teatralia: cómo trabajamos con Copilot

- Monorepo npm en `teatralia/`: API Fastify (`services/api`), pagos, notificador, tienda y backoffice (React).
- Importes siempre en céntimos (`*_cents`, enteros). Se formatean a euros solo al mostrarlos.
- La política de devoluciones está en `teatralia/docs/politica-devoluciones.md`: si el código no coincide, manda la política.
- SQL siempre parametrizado (`$1`, `$2`…), nunca concatenado.
- Cada cambio de lógica de negocio llega con su test (vitest) y se ejecuta `make test` antes de proponer el PR.
- No copies datos de clientes (emails) ni claves de `seed-data.ts` en código, tests ni issues.
```

**Resultado esperado:** el fichero guardado. Si ya tenías uno de otro laboratorio, comprueba que tiene estas reglas o equivalentes.

### 3 — Las reglas de pedidos y reembolsos

Lo que solo importa al tocar `orders/` no debe cargar todas las peticiones. Crea `.github/instructions/reembolsos.instructions.md`:

```markdown
---
applyTo: "teatralia/services/api/src/orders/**"
---
# Pedidos y reembolsos

- Antes de cambiar `calcRefund` o `refundOrder`, cita el apartado de `politica-devoluciones.md` que aplicas.
- La penalización del 10 % se calcula sobre el total de las entradas devueltas y se redondea al céntimo.
- En aplazamiento y petición del cliente los gastos de gestión no se devuelven.
- Todo cambio aquí lleva un test con un pedido real del seed (número `PED-…`) y el importe esperado en céntimos.
```

**Resultado esperado:** el fichero guardado. `applyTo` dice cuándo se aplica: al trabajar con ficheros bajo `orders/`.

### 4 — La revisión asistida, igual para todos

Crea `.github/prompts/revisar-pr.prompt.md`:

```markdown
---
description: Revisa el diff de la rama actual con las reglas del equipo de Teatralia
agent: ask
---
Revisa los cambios de la rama actual frente a `main` (#changes) como revisor del equipo de Teatralia.

Usa como lista de comprobación [las instrucciones del repositorio](../copilot-instructions.md) y,
si el diff toca `teatralia/services/api/src/orders/`, la política de devoluciones.

Para cada hallazgo: fichero y línea, regla que incumple y gravedad (bloqueante / mejora / gusto).
No propongas cambios de estilo si no rompen una regla escrita. No cambies ningún fichero.
```

**Resultado esperado:** al escribir `/` en el chat aparece **revisar-pr** con su descripción.

> [!NOTE]
> `#changes` adjunta los cambios del control de versiones. En versiones anteriores de VS Code el campo `agent:` se llamaba `mode:`; si el editor lo subraya, usa el otro.

### 5 — El agente revisor de reembolsos

Crea `.github/agents/revisor-reembolsos.agent.md` (si lo hiciste en el laboratorio del agente personalizado, ya lo tienes):

```markdown
---
description: Revisa reembolsos de Teatralia contra la política de devoluciones. Solo lee; no cambia código ni datos.
tools: ['read', 'search', 'teatralia/buscar_pedido', 'teatralia/incidencias_abiertas']
---
Eres el revisor de reembolsos de Teatralia. Tu trabajo es decir si un reembolso cumple la política.

Fuente de verdad: `teatralia/docs/politica-devoluciones.md`. Código que la implementa:
`teatralia/services/api/src/orders/refunds.ts` (`calcRefund`).

Para cada pedido que te pidan revisar:
1. Consulta el pedido con la herramienta `buscar_pedido` (entradas, gastos, reembolsos registrados).
2. Calcula en céntimos lo que manda la política para su motivo, citando el apartado.
3. Compara con lo registrado y con lo que calcularía `calcRefund`, citando la línea.
4. Termina con un veredicto: CORRECTO o INCORRECTO, y la diferencia en euros.

No propongas cambios de código ni ejecutes nada: si hay un fallo, describe el issue que habría que abrir.
```

**Resultado esperado:** **revisor-reembolsos** en el selector de agente del chat.

### 6 — La plantilla de pull request

Quien abre el PR declara cómo ha revisado lo que generó Copilot. Crea `.github/pull_request_template.md`:

```markdown
## Qué cambia

## Por qué (issue)

## Cómo probarlo

## Uso de Copilot
- [ ] He revisado línea a línea el código generado por Copilot.
- [ ] Los tests nuevos los he visto fallar antes del cambio.
- [ ] No hay datos de clientes ni claves en el diff.
```

**Resultado esperado:** el fichero guardado. GitHub lo pone como cuerpo de cada PR nuevo del repo.

### 7 — El documento de adopción

Es el acuerdo del equipo, escrito para quien llega nuevo y para quien decide en la organización. Crea `docs/equipo/adopcion-copilot.md` en la raíz del repo. Puedes pedirle un borrador a Copilot (modo **Ask**, adjuntando con **Add Context…** los ficheros de los pasos 2 a 6 y `.vscode/mcp.json`), pero el contenido lo decide el equipo. Esta es una versión de referencia:

```markdown
# Adopción de Copilot en el equipo de Plataforma

Acuerdo del equipo sobre cómo usamos GitHub Copilot en Teatralia. Se cambia con un pull request, como el código.

## Qué usamos y para qué

| Situación | Modo | Por qué |
|-----------|------|---------|
| Entender código heredado | Ask con `#codebase` | No cambia nada; cita ficheros |
| Cambio acotado en uno o dos ficheros | Edit | El diff se revisa entero antes de **Keep** |
| Tarea de varios ficheros con tests | Agent, con plan aprobado antes | Ejecuta comandos: pedimos el plan primero |
| Preguntas de negocio sobre datos | Agent + servidor MCP `teatralia` | Solo lectura; contrastamos con `psql` lo que se publique |
| Revisar reembolsos | Agente `revisor-reembolsos` | Solo lee; veredicto citando la política |

## Qué hay en el repositorio

- `.github/copilot-instructions.md`: reglas de todo el repo.
- `.github/instructions/*.instructions.md`: reglas por ruta (`applyTo`).
- `.github/prompts/*.prompt.md`: tareas repetidas (`/revisar-pr`).
- `.github/agents/*.agent.md`: agentes con rol y herramientas acotadas.
- `.vscode/mcp.json`: servidores MCP (`teatralia`, `github`).
- `.github/pull_request_template.md`: el PR declara el uso de Copilot.

## Reglas que no se negocian

- Lo que Copilot genera lo firma quien abre el PR: se revisa línea a línea.
- Nada de datos de clientes ni claves en prompts, issues o código generado.
- Los servidores MCP sobre datos son de solo lectura y con herramientas de negocio, no SQL libre.

## Cómo revisamos lo que genera Copilot

- Lógica de negocio: test que falla antes y pasa después.
- Importes: comprobados contra un pedido real del seed (`PED-…`).
- Revisión asistida con `/revisar-pr`; los hallazgos los filtra una persona.

## Modelos y consumo

- Por defecto, un modelo incluido en el plan (sin coste de peticiones premium).
- Modelo premium solo para tareas de varios ficheros o análisis largos, y cuando el incluido haya fallado.
- Cada persona mira su consumo en el indicador de Copilot de VS Code a mitad de mes.

## Qué no hacemos con Copilot

- Dar al agente acceso de escritura a la base de datos.
- Aceptar un cambio de política de negocio que no esté en `docs/`.
- Asignar al coding agent issues sin criterios de aceptación.

## Cómo proponemos cambios a este kit

- Pull request que toque solo el kit, con el motivo (un error que se repite, una regla que falta).
- `scripts/revisar-kit-copilot.sh` en verde antes de pedir revisión.
```

**Resultado esperado:** el documento guardado, con sus siete secciones.

### 8 — Comprueba el kit

```bash
# Revisa de nuevo las piezas del kit
scripts/revisar-kit-copilot.sh
```

**Resultado esperado:**

```text
Instrucciones
  ✔ .github/copilot-instructions.md (8 líneas)
  ✔ .github/instructions/reembolsos.instructions.md → applyTo: "teatralia/services/api/src/orders/**"
Prompt files
  ✔ /revisar-pr → Revisa el diff de la rama actual con las reglas del equipo de Teatralia
Agentes personalizados
  ✔ revisor-reembolsos.agent.md → tools: ['read', 'search', 'teatralia/buscar_pedido', 'teatralia/incidencias_abiertas']
Revisión
  ✔ .github/pull_request_template.md (pregunta por el uso de IA)
MCP
  ✔ .vscode/mcp.json → servidores: teatralia, github
Adopción
  ✔ docs/equipo/adopcion-copilot.md (7 secciones)
Secretos
  ✔ ningún token ni contraseña en .github, .vscode ni docs/equipo

Kit completo.
```

Cómo se lee: cada pieza existe y tiene lo que Copilot necesita para usarla (`applyTo`, `description`, `tools`); el agente no puede editar ni ejecutar; no hay secretos.

### 9 — Comprueba que Copilot usa el kit

El script dice que los ficheros están bien formados; falta ver que Copilot los aplica. Abre `teatralia/services/api/src/orders/refunds.ts` en el editor y, en un chat nuevo en modo **Ask**:

```text
#file:teatralia/services/api/src/orders/refunds.ts
Quiero cambiar calcRefund. ¿Qué reglas del equipo tengo que cumplir?
```

**Qué debe contener la respuesta:** las reglas de `reembolsos.instructions.md` (citar el apartado de la política, redondeo al céntimo, gastos en aplazamiento, test con un `PED-…`) y las generales (céntimos, test, `make test`). Despliega **References** (o **Used n references**) bajo la respuesta: aparecen `copilot-instructions.md` y `reembolsos.instructions.md`.

### 10 — Prepara el kit para un pull request

El kit entra en el repo como cualquier cambio: una rama y un PR que el equipo revisa.

```bash
# Ficheros nuevos del kit (los de .vscode ya estaban versionados)
git status --short -uall .github docs
```

**Resultado esperado:**

```text
?? .github/agents/revisor-reembolsos.agent.md
?? .github/copilot-instructions.md
?? .github/instructions/reembolsos.instructions.md
?? .github/prompts/revisar-pr.prompt.md
?? .github/pull_request_template.md
?? docs/equipo/adopcion-copilot.md
```

Si quieres llevarlo a tu fork:

```bash
# Rama, commit y push del kit (en tu fork)
git switch -c equipo/kit-copilot
git add .github docs/equipo
git commit -m "Kit de Copilot del equipo: instrucciones, prompts, agente, plantilla de PR y adopción"
git push -u origin equipo/kit-copilot
```

## Comprueba tu entendimiento

**Instrucciones por ruta**
Repite el paso 9 adjuntando `teatralia/apps/backoffice/src/operations.tsx` en lugar de `refunds.ts`.
→ En **References** ya no aparece `reembolsos.instructions.md`: `applyTo` no casa con esa ruta.

**El prompt file es de todos**
Escribe `/revisar-pr` en el chat.
→ Se ejecuta en modo Ask con el texto del fichero: cualquiera del equipo obtiene la misma revisión.

**El kit se comprueba solo**
Borra la línea `applyTo` de `reembolsos.instructions.md` y ejecuta `scripts/revisar-kit-copilot.sh`.
→ `✘ .github/instructions/reembolsos.instructions.md sin applyTo en la cabecera`. Vuelve a ponerla.

## Experimenta

**Un agente con demasiado poder.** Predice qué dirá el script si un compañero añade `'edit'` a la lista `tools` del revisor «para que también arregle». Hazlo y ejecútalo:

```bash
# Solo la parte de agentes del informe
scripts/revisar-kit-copilot.sh | sed -n '/Agentes/,/Revisión/p'
```

```text
Agentes personalizados
  ✔ revisor-reembolsos.agent.md → tools: ['read', 'search', 'edit', 'teatralia/buscar_pedido', 'teatralia/incidencias_abiertas'] (puede cambiar ficheros o ejecutar: ¿es lo que quieres?)
Revisión
```

No es un error (hay agentes que deben editar), pero el aviso obliga a decidirlo en la revisión del PR. Quita `'edit'`.

## Mejora

**Un secreto colado.** Alguien añade a las instrucciones una línea «práctica» para probar el envío de correo. Pruébalo:

```bash
# Añade una línea con una clave de SendGrid inventada y revisa
echo '- Para probar el envío con SendGrid usa la clave SG.prueba1234567890abcdef' >> .github/copilot-instructions.md
scripts/revisar-kit-copilot.sh | sed -n '/Secretos/,$p'
```

```text
Secretos
  ✘ posibles secretos:
      .github/copilot-instructions.md:9:- Para probar el envío con SendGrid usa la clave SG.prueba1234567890abcdef

Kit incompleto: 1 problema(s).
```

Las instrucciones se envían al modelo en cada petición: un secreto ahí sale del repo en cada mensaje. Quita la línea (`sed -i '$d' .github/copilot-instructions.md`) y, para que esto no dependa de acordarse, el paso natural es ejecutar el script en un workflow de los pull requests que toquen `.github/` o `.vscode/`.

## Reto

### 1 — El servidor MCP con un usuario de solo lectura, sin contraseña en el repo

**La situación:** el equipo ha acordado que el servidor MCP `teatralia` se conecte con el rol `teatralia_lectura` (contraseña `lectura`), no con el usuario de la API. Un compañero lo resuelve escribiendo la URL completa en `.vscode/mcp.json`:

```jsonc
"DATABASE_URL": "postgres://teatralia_lectura:lectura@postgres:5432/teatralia"
```

**Qué haces:** aplica su cambio, ejecuta el script y comprueba qué dice. Después cambia la configuración para que la URL **no** esté en el repo y el script vuelva a dar «Kit completo».

**Pistas:** las entradas `stdio` de `.vscode/mcp.json` admiten `envFile` (un fichero de variables que VS Code carga al arrancar el servidor). Ese fichero tiene que estar en `.gitignore`. `git check-ignore -v <fichero>` dice si git lo ignora y por qué regla.

**Lo que buscas:** el script marca la URL con contraseña como secreto; con tu cambio da «Kit completo» y `git check-ignore` confirma que el fichero de variables no se subirá.

<details>
<summary>Ver solución</summary>

Con la URL escrita en `.vscode/mcp.json`:

```bash
scripts/revisar-kit-copilot.sh | sed -n '/MCP/,$p'
```

```text
MCP
  ✔ .vscode/mcp.json → servidores: teatralia, github
Adopción
  ✔ docs/equipo/adopcion-copilot.md (7 secciones)
Secretos
  ✘ posibles secretos:
      .vscode/mcp.json:14:        "DATABASE_URL": "postgres://teatralia_lectura:lectura@postgres:5432/teatralia"

Kit incompleto: 1 problema(s).
```

La solución: la entrada `teatralia` lee las variables de un fichero local y ese fichero se ignora.

```jsonc
"teatralia": {
  "type": "stdio",
  "command": "node",
  "args": ["${workspaceFolder}/teatralia/tools/mcp-teatralia/server.ts"],
  // La URL de solo lectura vive en un fichero local ignorado por git, no en el repo
  "envFile": "${workspaceFolder}/.env.mcp"
}
```

```bash
# El fichero local con la URL, fuera de git
echo "DATABASE_URL=postgres://teatralia_lectura:lectura@postgres:5432/teatralia" > .env.mcp
echo ".env.mcp" >> .gitignore
git check-ignore -v .env.mcp
scripts/revisar-kit-copilot.sh | sed -n '/MCP/,$p'
```

```text
.gitignore:1:.env.mcp	.env.mcp
MCP
  ✔ .vscode/mcp.json → servidores: teatralia, github
Adopción
  ✔ docs/equipo/adopcion-copilot.md (7 secciones)
Secretos
  ✔ ningún token ni contraseña en .github, .vscode ni docs/equipo

Kit completo.
```

En tu repo, `git check-ignore` muestra el número de línea donde quedó `.env.mcp` en `.gitignore`. El rol `teatralia_lectura` tiene que existir en tu base de datos (se crea en el laboratorio del servidor MCP sobre la base de datos, sección **Mejora**). Cómo se lee: el kit dice **cómo** se conecta el servidor; **con qué credencial**, lo pone cada entorno (un fichero local, un secreto del Codespace o de la organización). **La regla:** el kit del equipo se versiona entero; las credenciales, nunca.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `Permission denied` al ejecutar el script | El fichero perdió el permiso de ejecución | `chmod +x scripts/revisar-kit-copilot.sh` o `bash scripts/revisar-kit-copilot.sh` |
| `sin applyTo en la cabecera` con `applyTo` escrito | La cabecera no empieza en la primera línea o falta un `---` | El fichero empieza con `---`, sigue `applyTo: "…"` y cierra con `---` |
| `/revisar-pr` no aparece | Fichero fuera de `.github/prompts/` o sin `.prompt.md` | Ruta y extensión exactas; recarga la ventana (**Developer: Reload Window**) |
| En **References** no sale `copilot-instructions.md` | El uso de ficheros de instrucciones está desactivado en la configuración | Busca `instructions` en **Settings** y activa el uso de `.github/copilot-instructions.md` |
| `make reset` no borra el kit | Es lo esperado: solo reinicia `teatralia/` | Si quieres empezar de cero: `rm -r .github/instructions .github/prompts .github/agents docs/equipo` |

## Conclusiones

### Qué es el flujo de trabajo del equipo con Copilot

Un conjunto de ficheros versionados que hacen que Copilot trabaje igual para todos (instrucciones, instrucciones por ruta, prompt files, agentes, MCP) y un acuerdo escrito (plantilla de PR y documento de adopción) que dice qué se usa, para qué y cómo se revisa. En este lab, siete piezas y un script que las comprueba.

### Cómo debe ser

| Requisito | Cómo lo cumple el kit |
|-----------|------------------------|
| Reglas comprobables | Cada línea de instrucciones se ve cumplida o no en un diff |
| Contexto donde toca | `applyTo` para pedidos y reembolsos |
| Roles con herramientas mínimas | El revisor sin edición ni terminal |
| Responsabilidad visible | La plantilla de PR pregunta por el uso de Copilot |
| Sin secretos | El script rechaza claves y URLs con contraseña |
| Cambiable | El documento de adopción dice cómo se propone un cambio |

### Dónde se rompe y cómo lo has detectado

- **Ficheros que Copilot ignora en silencio:** sin `applyTo` o fuera de su carpeta no fallan, simplemente no se aplican; el script y **References** lo destapan.
- **Permisos que crecen:** un `'edit'` añadido «para ayudar» cambia el rol del agente; el aviso del script obliga a decidirlo.
- **Secretos en el contexto:** una clave en las instrucciones viaja al modelo en cada petición.
- **Credenciales en la configuración:** la URL con contraseña en `mcp.json`; la configuración se versiona, la credencial no.

### Cómo se perfecciona

En un equipo real: el script en un workflow de pull requests, el kit revisado por la persona responsable de cada pieza, el documento de adopción repasado cada cierto tiempo con lo aprendido (errores que se repiten, nuevas reglas), y las políticas de la organización (modelos, MCP, coding agent, exclusiones) alineadas con lo que el kit dice.

### En una frase

> 🔑 Adoptar Copilot en un equipo es convertir las costumbres de cada persona en ficheros del repo que se revisan, se comprueban y se cambian con pull requests.
