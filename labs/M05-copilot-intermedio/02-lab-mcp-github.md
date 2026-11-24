# Laboratorio: el servidor MCP de GitHub

[← Página anterior](01-lab-mcp-base-de-datos.md) · [Siguiente página →](03-lab-agente-personalizado.md)

El backlog de Teatralia vive en GitHub Issues: peticiones de negocio, mejoras y fallos con etiquetas (`bug`, `backoffice`, `tienda`…). En este laboratorio conectas Copilot a GitHub con el **servidor MCP oficial de GitHub**: consultas el backlog de tu fork desde el chat, creas un issue nuevo y compruebas con `gh` qué ha pasado de verdad. Por el camino ves la diferencia entre una herramienta que lee y una que escribe en nombre tuyo.

### Objetivo

Comprender qué es un servidor MCP sobre la plataforma del equipo: cómo funciona, cómo debe ser, cómo se detectan sus debilidades y cómo se mejora.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repo. Estado limpio:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- **Issues activados en tu fork.** GitHub los desactiva al hacer un fork: en tu fork en github.com, **Settings** → **General** → **Features** → marca **Issues**.
- `gh` con sesión iniciada (en el Codespace ya lo está):

```bash
# Debe decir «Logged in to github.com account <tu-usuario>»
gh auth status
```

- [`.vscode/mcp.json`](../../.vscode/mcp.json) declara el servidor `github` (remoto, `https://api.githubcopilot.com/mcp/`).
- Copilot Chat (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>) en modo **Agent**. El laboratorio usa cuatro o cinco mensajes.

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| El equipo consulta y da de alta trabajo en GitHub Issues | Tu fork, con los 12 issues `TEA-101…112` del backlog de Teatralia |
| Alguien abre la web, filtra por etiqueta y copia el texto al chat | Copilot pide la lista con una herramienta del servidor MCP de GitHub |
| Lo que se crea en GitHub queda a nombre de quien lo crea | El servidor actúa **con tu identidad** (inicias sesión con OAuth): el issue que cree Copilot es tuyo |

El servidor de GitHub publica muchas herramientas (issues, pull requests, ramas, ficheros, Actions…). Unas solo leen; otras escriben. VS Code pide confirmación antes de cada llamada.

### 1 — Crea el backlog en tu fork

Los issues del backlog están como ficheros en `teatralia/docs/backlog/`. Este comando del curso crea uno por fichero en tu fork, con sus etiquetas.

```bash
# Crea los issues TEA-101…112 en tu fork (no repite los que ya existan)
make backlog
```

**Resultado esperado** (la primera vez):

```text
creado: TEA-101 · La tienda debería filtrar eventos por ciudad
creado: TEA-102 · Mostrar el aforo restante en la ficha del evento
creado: TEA-103 · Lista de espera para eventos agotados
creado: TEA-104 · Códigos de descuento por promotor
creado: TEA-105 · Abono de temporada
creado: TEA-106 · Devoluciones con un céntimo de menos
creado: TEA-107 · Algunos compradores reciben dos correos de confirmación
creado: TEA-108 · La búsqueda de pedidos falla con algunos apellidos
creado: TEA-109 · Cambio de titular de una entrada
creado: TEA-110 · Reservar plaza de movilidad reducida con acompañante
creado: TEA-111 · Exportar las ventas de un evento a CSV
creado: TEA-112 · Documentar la API de pedidos
```

Si ya los habías creado, cada línea dice `ya existe: TEA-1NN`.

<details>
<summary>Qué hace por dentro (<code>scripts/crear-backlog.sh</code>)</summary>

```bash
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)            # tu fork
existentes=$(gh issue list -R "$repo" --state all --limit 200 --json title -q '.[].title')
for f in teatralia/docs/backlog/TEA-*.md; do
  id=$(basename "$f" .md | cut -d- -f1-2)                               # TEA-108
  titulo=$(sed -n 's/^titulo: "\(.*\)"$/\1/p' "$f")                    # de la cabecera del fichero
  etiquetas=$(sed -n 's/^etiquetas: \[\(.*\)\]$/\1/p' "$f")
  cuerpo=$(awk 'BEGIN{n=0} /^---$/{n++; next} n>=2' "$f")               # lo que hay tras la cabecera
  if grep -Fxq "$id · $titulo" <<<"$existentes"; then echo "ya existe: $id"; continue; fi
  gh issue create -R "$repo" --title "$id · $titulo" --body "$cuerpo" --label "$etiquetas" >/dev/null
  echo "creado: $id · $titulo"
done
```

</details>

### 2 — Mira la fuente en crudo

Antes de preguntar a Copilot, mira qué hay. Cada issue sale de un fichero con título y etiquetas en la cabecera:

```bash
# Un issue del backlog tal como está en el repo
cat teatralia/docs/backlog/TEA-108-busqueda-de-pedidos.md
```

```text
---
titulo: "La búsqueda de pedidos falla con algunos apellidos"
etiquetas: [bug, backoffice]
---
Al buscar «O'Connor» en Pedidos el backoffice muestra «error interno».
```

Y en GitHub: abre tu fork en github.com → pestaña **Issues** → filtra por la etiqueta **bug**. Salen tres issues.

### 3 — Arranca el servidor de GitHub

1. Paleta de comandos (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) → **MCP: List Servers** → `github` → **Start Server**.
2. VS Code avisa de que el servidor quiere autenticarse con GitHub. Pulsa **Allow** y elige tu cuenta personal (la del fork).

**Resultado esperado:** `github` aparece como **Running** en **MCP: List Servers**. En su **Show Output** se ve que ha descubierto sus herramientas.

> [!NOTE]
> El servidor remoto de GitHub usa la sesión de GitHub de VS Code (OAuth); no necesitas un token. Si tu organización no permite servidores MCP o el remoto, `.vscode/mcp.json` trae comentada la alternativa local con Docker y un token personal.

### 4 — Elige qué herramientas usa el chat

El servidor de GitHub publica decenas de herramientas. Cuantas más marcadas, más texto de descripciones recibe el modelo en cada petición y más fácil que elija una que no querías.

1. En el chat, modo **Agent**, pulsa **Configure Tools…** (llave y destornillador).
2. Despliega el grupo `github` y recorre la lista: unas leen (listar, buscar, ver un issue) y otras escriben (crear o actualizar issues, comentar, crear ramas o pull requests).
3. Para este laboratorio deja marcadas solo las de **issues** y desmarca el resto del grupo. Pulsa **OK**.

**Resultado esperado:** el grupo `github` con unas pocas herramientas de issues marcadas (los nombres exactos dependen de la versión del servidor; por ejemplo `list_issues`, `search_issues`, `get_issue` y una de escritura como `create_issue` o `issue_write`).

### 5 — Consulta el backlog desde el chat

Escribe en el chat (cambia `<tu-usuario>` por tu cuenta de GitHub):

```text
Lista los issues abiertos de <tu-usuario>/github-copilot-equipos-201 con la etiqueta bug.
Para cada uno: número, título y en qué parte de Teatralia crees que está el fallo.
```

Pulsa **Allow** en la llamada a la herramienta.

**Qué debe contener la respuesta** (el texto varía):

- Una llamada a una herramienta de listar o buscar issues del servidor `github`, con tu repositorio y la etiqueta `bug`.
- Tres issues: **TEA-106** (céntimo en devoluciones), **TEA-107** (correo duplicado), **TEA-108** (búsqueda de pedidos).
- La parte de «dónde está el fallo» es una **suposición del modelo**: el servidor de GitHub no ve el código del Codespace salvo que lo pida por la API.

Contrasta con la fuente: los ficheros del backlog con la etiqueta `bug` y, en tu fork, la misma consulta con `gh`.

```bash
# Ficheros del backlog con la etiqueta bug
grep -l '^etiquetas: \[.*bug' teatralia/docs/backlog/TEA-*.md
# Lo mismo, en los issues de tu fork
gh issue list --label bug --state open
```

**Resultado esperado** del primer comando:

```text
teatralia/docs/backlog/TEA-106-centimo-en-devoluciones.md
teatralia/docs/backlog/TEA-107-correo-duplicado.md
teatralia/docs/backlog/TEA-108-busqueda-de-pedidos.md
```

`gh issue list` muestra esos mismos tres títulos, con el número que GitHub dio a cada issue en tu fork.

### 6 — Crea un issue desde el chat

Atención al cliente ha detectado que eventos marcados como agotados tienen plazas libres tras los reembolsos. Pide a Copilot que lo dé de alta:

```text
Crea un issue en <tu-usuario>/github-copilot-equipos-201 con:
- Título: TEA-113 · Un evento sigue «agotado» cuando se liberan plazas
- Cuerpo: Cuando se reembolsa o se anula una entrada de un evento en estado sold_out, la
  plaza vuelve a la venta pero el evento sigue mostrándose como agotado (por ejemplo
  EV-MAREA-0303). El estado debería volver a on_sale si quedan plazas.
- Etiquetas: bug, tienda
No crees nada más.
```

Antes de pulsar **Allow**, despliega la llamada: comprueba título, cuerpo, etiquetas y repositorio. Es una herramienta que **escribe**.

**Qué debe pasar:** una sola llamada de creación; Copilot responde con el número y el enlace del issue nuevo.

Comprueba en GitHub qué se ha creado y a nombre de quién:

```bash
# El issue nuevo: título, etiquetas y autor
gh issue list --search "TEA-113 in:title" --state all --json number,title,labels,author \
  --jq '.[] | "\(.number) \(.title) [\(.labels | map(.name) | join(", "))] autor: \(.author.login)"'
```

**Resultado esperado:** una línea con el número, el título `TEA-113 · Un evento sigue «agotado» cuando se liberan plazas`, las etiquetas `bug, tienda` y **tu usuario** como autor.

Cómo se lee: para GitHub no lo ha creado «Copilot»: lo has creado tú. El servidor MCP actúa con tus permisos; cualquier cosa que puedas hacer en GitHub, el modelo puede pedirla.

## Comprueba tu entendimiento

**Leer frente a escribir**
En **Configure Tools…**, grupo `github`, señala qué herramientas marcadas escriben.
→ La de crear o actualizar issues (y cualquier otra que cree, cierre o comente). Las de listar, buscar y ver solo leen.

**El autor es tu cuenta**
Abre el issue TEA-113 en github.com.
→ Lo abrió tu usuario, en el momento en que pulsaste **Allow**.

**El modelo supone; GitHub no**
Repasa la respuesta del paso 5.
→ Los tres títulos salen de GitHub; «dónde está el fallo» es una deducción del modelo que tendrías que comprobar en el código.

## Experimenta

**Servidor solo lectura.** El servidor remoto de GitHub admite una variante de solo lectura en otra URL. Antes de probarla, predice qué pasará con la petición del paso 6.

1. En `.vscode/mcp.json`, cambia la URL de `github` por `https://api.githubcopilot.com/mcp/readonly`.
2. **MCP: List Servers** → `github` → **Restart Server**, y abre **Configure Tools…**.
3. Pide en el chat crear un issue `TEA-114 · Prueba` sin etiquetas.

**Qué debe pasar:** las herramientas de escritura desaparecen de la lista; Copilot responde que no puede crear issues con las herramientas disponibles (o propone hacerlo con `gh` en la terminal, que tendrías que rechazar). Vuelve a dejar la URL original.

> [!NOTE]
> Las variantes de URL del servidor remoto (`/readonly`, y `/x/<conjunto>` para cargar solo un conjunto de herramientas, como `/x/issues`) son las de la documentación del servidor MCP de GitHub y pueden cambiar. Si una no funciona, consulta su README en `github/github-mcp-server`.

## Mejora

Deja el servidor de GitHub con lo mínimo que el equipo necesita para trabajar con el backlog: solo el conjunto de **issues**.

1. En `.vscode/mcp.json`, cambia la URL de `github` por `https://api.githubcopilot.com/mcp/x/issues`.
2. Reinicia el servidor y abre **Configure Tools…**.

**Resultado esperado:** el grupo `github` solo tiene herramientas de issues. El modelo recibe menos descripciones en cada petición y no puede, por ejemplo, crear ramas o pull requests desde este servidor. Si te quedas con esta configuración, es una decisión del equipo: va en un commit con el motivo.

## Reto

### 1 — Que el chat no duplique issues

**La situación:** un compañero ha pedido a Copilot «crea el issue del evento agotado» dos veces en conversaciones distintas, y ahora hay dos TEA-113. `make backlog` no tiene ese problema: antes de crear, mira qué existe. Tú quieres que el chat haga lo mismo.

**Qué haces:** escribe un prompt que obligue a Copilot a **buscar primero** un issue con ese título (abierto o cerrado) y a crearlo **solo si no existe**. Lánzalo dos veces, en dos conversaciones nuevas, y cuenta los issues.

**Pistas:** el servidor de GitHub tiene una herramienta de búsqueda de issues; la sintaxis de búsqueda de GitHub admite `repo:`, `in:title` e `is:issue`. Pide que te diga qué encontró antes de crear.

**Lo que buscas:** tras las dos ejecuciones, un solo TEA-113 en tu fork; en la segunda, una llamada de búsqueda y ninguna de creación.

<details>
<summary>Ver solución</summary>

Un prompt que funciona:

```text
Antes de crear nada, busca en <tu-usuario>/github-copilot-equipos-201 issues (abiertos o
cerrados) cuyo título contenga "TEA-113". Dime qué has encontrado.
- Si existe alguno, NO crees nada y dame su número.
- Si no existe, crea el issue con título "TEA-113 · Un evento sigue «agotado» cuando se liberan
  plazas", etiquetas bug y tienda, y el cuerpo que ya conoces.
```

La comprobación:

```bash
# Cuántos issues hay con TEA-113 en el título (abiertos o cerrados): debe salir 1
gh issue list --search "TEA-113 in:title" --state all --json number --jq length
```

El script del curso hace esa comprobación con código; ejecutarlo dos veces no duplica nada:

```bash
make backlog
```

```text
ya existe: TEA-101
ya existe: TEA-102
ya existe: TEA-103
ya existe: TEA-104
ya existe: TEA-105
ya existe: TEA-106
ya existe: TEA-107
ya existe: TEA-108
ya existe: TEA-109
ya existe: TEA-110
ya existe: TEA-111
ya existe: TEA-112
```

Cómo se lee: el script es determinista; el chat solo lo es si se lo pides y lo compruebas. Si ya tienes dos TEA-113, cierra uno con `gh issue close <número> --reason "not planned"`. **La regla:** una acción que escribe en la plataforma, pedida en lenguaje natural, necesita la misma comprobación previa que pondrías en un script.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `make backlog` falla con `has disabled issues` | Los forks nacen con Issues desactivados | En tu fork: **Settings** → **General** → **Features** → **Issues** |
| Copilot lista issues del repositorio del curso, no de tu fork | No le diste el repositorio y eligió el original | Escribe siempre `<tu-usuario>/github-copilot-equipos-201` en el prompt |
| `github` no arranca o pide sesión en bucle | La cuenta elegida al autenticar no es la del fork, o la organización bloquea MCP | **Accounts** (icono de persona, abajo a la izquierda) → cierra la sesión de GitHub y vuelve a **Start Server** con tu cuenta personal |
| Copilot no usa las herramientas de GitHub | Modo Ask/Edit, o el grupo `github` desmarcado | Modo **Agent** y **Configure Tools…** |
| `gh issue list` devuelve otros issues | `gh` apunta al repositorio original | Añade `-R <tu-usuario>/github-copilot-equipos-201` |

## Conclusiones

### Qué es el servidor MCP de GitHub

Un servidor remoto, mantenido por GitHub, que publica la API de GitHub como herramientas: listar y crear issues, ver pull requests, ramas, Actions… Copilot lo usa con **tu sesión**: en el paso 6, el issue TEA-113 salió a tu nombre.

### Cómo debe ser

| Requisito | Cómo lo has aplicado |
|-----------|----------------------|
| Solo las herramientas necesarias | **Configure Tools…** con las de issues; o la URL `/x/issues` |
| Escritura con revisión | Desplegar la llamada y revisar argumentos antes de **Allow** |
| Repositorio explícito | `<tu-usuario>/github-copilot-equipos-201` en cada prompt |
| Comprobación en la fuente | `gh issue list` y la web de GitHub, no el resumen del chat |

### Dónde se rompe y cómo lo has detectado

- **Actúa como tú:** no hay un usuario «Copilot» con menos permisos; lo que puedas hacer, el modelo puede pedirlo.
- **Mezcla hechos y suposiciones:** los títulos venían de GitHub; «dónde está el fallo», del modelo.
- **No es idempotente:** pedir dos veces lo mismo puede crear dos issues; el script `make backlog`, no.

### Cómo se perfecciona

En un equipo: la URL limitada al conjunto de herramientas necesario (o la de solo lectura para quien solo consulta), la política de MCP de la organización activada a propósito, y los prompts de alta de issues convertidos en prompt files que buscan antes de crear.

### En una frase

> 🔑 El servidor MCP de GitHub convierte el chat en un cliente de GitHub con tus permisos: limita sus herramientas y revisa cada escritura como si la hicieras tú, porque la haces tú.
