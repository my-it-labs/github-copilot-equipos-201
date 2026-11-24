# Laboratorio: biblioteca de prompts del equipo

[← Página anterior](06-lab-documentacion-fuente-de-verdad.md) · [Siguiente página →](08-lab-diagrama-del-flujo-de-compra.md)

Un prompt que funciona bien en el chat de una persona se pierde al cerrar la conversación. Si se guarda en
`.github/prompts/`, lo usa todo el equipo, pero entonces es **código compartido**: tiene que estar probado, revisado y
versionado como cualquier otro. En este laboratorio montas la biblioteca de prompts del equipo de Plataforma con tres
tareas que se repiten en Teatralia (situarse en una carpeta, generar tests de importes, revisar un fichero contra las
convenciones), pruebas cada uno con un caso real, corriges uno tras una revisión y dejas el historial en git.

### Objetivo

Comprender qué hace que un prompt compartido sea fiable: cómo se escribe para que su resultado se pueda comprobar,
cómo se prueba, cómo se detecta que hay que cambiarlo y cómo se versiona para que el equipo sepa qué cambió y por qué.

### Punto de partida

- Terminal en la raíz del repositorio y Teatralia en su estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- En otra terminal, la plataforma en marcha (la usa el tercer prompt):

```bash
# Arranca api, pagos, correo, tienda y backoffice; deja esta terminal abierta
make up
```

- El tercer prompt revisa contra `.github/copilot-instructions.md`. Si no lo tienes, crea una versión mínima:

```bash
# Solo si no existe: convenciones mínimas de Teatralia
mkdir -p .github
[ -f .github/copilot-instructions.md ] || cat > .github/copilot-instructions.md <<'EOF'
# Teatralia: instrucciones para Copilot

- Importes: enteros en céntimos (`price_cents`, `total_cents`). Nunca euros con decimales.
- SQL siempre parametrizado (`$1`, `$2`…). Nunca valores concatenados en el SQL.
- Backoffice: el promotor sale de `adminOf(req)` y toda consulta filtra por su `tenant_id`.
- Errores de la API: `throw new HttpError(status, 'mensaje')`, mensajes en español y en minúscula.
EOF
```

- Tu fork del curso como `origin` (los commits de este laboratorio se guardan ahí).

### Qué está pasando

| En el equipo | En este laboratorio |
|--------------|---------------------|
| «Explícame esta carpeta» a cada persona nueva | `/explicar-carpeta`, probado con `teatralia/services/payments` |
| Tests de importes que cada uno pide a su manera | `/test-de-importes`, probado con `formatEuros` |
| Revisiones que dependen de quién revisa | `/revisar-convenciones`, probado con `routes/tickets.ts` |
| Cambios en los prompts sin rastro | Un commit por prompt y otro por cada corrección |

### 1 — Crea `/explicar-carpeta` y pruébalo

El primer prompt sirve para situarse en una carpeta desconocida. Lo importante es que obliga a citar `fichero:línea`
y a decir «no aparece en el código» en lugar de deducir: así su resultado se puede comprobar.

```bash
# Desde la raíz del repositorio
mkdir -p .github/prompts
cat > .github/prompts/explicar-carpeta.prompt.md <<'EOF'
---
description: Explica una carpeta de Teatralia a alguien que llega nuevo, citando ficheros y líneas
agent: ask
argument-hint: carpeta=teatralia/services/...
---
Explica la carpeta `${input:carpeta:teatralia/services/...}` de Teatralia a alguien del equipo que no la ha abierto nunca.

Usa #codebase y responde con estas secciones, en español:

1. **Para qué sirve**, en dos frases, en el lenguaje del negocio (promotores, pedidos, entradas).
2. **Ficheros clave**: tabla fichero | qué hace | función o ruta principal.
3. **Cómo se arranca y cómo se prueba**: comandos exactos que existan en el repositorio.
4. **Datos o valores que hay que conocer** (puertos, tarjetas de prueba, ids de ejemplo).

Cita `fichero:línea` en cada afirmación. Si algo no está en el código, escribe «no aparece en el código»: no lo deduzcas.
EOF
```

Pruébalo en una conversación nueva (vista **Chat**, **+**):

```text
/explicar-carpeta carpeta=teatralia/services/payments
```

**Qué debe contener la respuesta** (varía en cada ejecución): que es la pasarela de pagos emulada; `gateway.ts` con
`/charges`, `/refunds` y `/_reset`; el puerto 3001 (`PAYMENTS_PORT`); los datos en `.data/gateway.json`; y las tres
tarjetas de prueba con su comportamiento. Comprueba cada dato:

```bash
# Desde teatralia/: tarjetas, puerto y fichero de datos de la pasarela
cd teatralia
grep -n "4242\|4000\|PAYMENTS_PORT\|gateway.json" services/payments/src/*.ts
```

**Resultado esperado:**

```text
services/payments/src/gateway.ts:7://   4242 4242 4242 4242  aprueba
services/payments/src/gateway.ts:8://   4000 0000 0000 0002  rechaza (fondos insuficientes)
services/payments/src/gateway.ts:9://   4000 0000 0000 9995  aprueba tras 3 s (pasarela lenta)
services/payments/src/gateway.ts:86:    if (digits === '4000000000009995') {
services/payments/src/gateway.ts:88:    } else if (digits === '4000000000000002') {
services/payments/src/gateway.ts:91:    } else if (digits !== '4242424242424242') {
services/payments/src/index.ts:3:const app = buildGateway({ dataFile: new URL('../.data/gateway.json', import.meta.url).pathname });
services/payments/src/index.ts:4:await app.listen({ port: Number(process.env.PAYMENTS_PORT ?? 3001), host: '0.0.0.0' });
```

**Cómo se lee:** si la respuesta cita estas líneas, el prompt cumple su función. Si menciona una tarjeta o un comando
que no está aquí, es una invención y el prompt necesita apretar más la regla de citar.

### 2 — Crea `/test-de-importes` y pruébalo

El segundo prompt genera tests para funciones de dinero. Lo pruebas con `formatEuros`, que convierte céntimos en el
texto que ve el comprador.

```bash
# Desde la raíz del repositorio
cd ..
cat > .github/prompts/test-de-importes.prompt.md <<'EOF'
---
description: Tests vitest para una función que calcula o muestra importes en céntimos
agent: agent
argument-hint: funcion=nombreDeLaFuncion (con su fichero abierto)
---
Escribe tests con vitest para la función `${input:funcion}` del fichero ${file}.

Reglas:
- Pon el test en la carpeta `test/` del mismo paquete, con el nombre del fichero (`<fichero>.test.ts`).
- Los importes de entrada son enteros en céntimos. Usa datos reales de Teatralia cuando existan
  (pedido de referencia PED-2026-0107: 133,70 € = 13370 céntimos).
- Cubre como mínimo: un caso normal, 0, un importe de un céntimo, un importe grande y un negativo (reembolso).
- Cada `expect` compara con un valor exacto que hayas calculado tú, no con lo que devuelva la función.
- Ejecuta solo ese test con `npx vitest run <ruta del test>` desde `teatralia/` y enséñame la salida.
- Si un test falla, no cambies la función: dime si el fallo está en el test o en la función y por qué.
EOF
```

1. Abre `teatralia/packages/ui/src/format.ts` (es el `${file}` del prompt).
2. Conversación nueva, envía `/test-de-importes funcion=formatEuros` y acepta con **Keep** cuando el agente cree el test.

**Qué debe contener la respuesta:** un fichero `teatralia/packages/ui/test/format.test.ts` y la salida de vitest. Es muy
habitual que algún test falle con un mensaje desconcertante como este (salida real de un test escrito con un espacio
normal antes del `€`):

```text
AssertionError: expected '133,70 €' to be '133,70 €' // Object.is equality
Expected: "133,70 €"
Received: "133,70 €"
      Tests  1 failed (1)
```

**Cómo se lee:** los dos textos parecen iguales y no lo son. `Intl` separa la cifra y el símbolo con un **espacio de no
separación** (U+00A0), no con un espacio normal:

```bash
# Los caracteres del importe formateado, en hexadecimal: a0 es el espacio de no separación
node -e 'const s=(135.5).toLocaleString("es-ES",{style:"currency",currency:"EUR"}); console.log([...s].map(c=>c.charCodeAt(0).toString(16)).join(" "), s === "135,50 €")'
```

```text
31 33 35 2c 35 30 a0 20ac false
```

El fallo está en el test, no en la función. El prompt hizo bien en prohibir que se cambie la función; le faltaba
avisar de esto. Es exactamente lo que encuentra una revisión: lo corriges en el paso 5.

<details>
<summary>Test de referencia (<code>packages/ui/test/format.test.ts</code>)</summary>

```typescript
// formatEuros: céntimos → texto en euros como lo ve el comprador (es-ES)
import { describe, expect, it } from 'vitest';
import { formatEuros } from '../src/format.js';

// Intl separa la cifra y el símbolo con un espacio de no separación (U+00A0)
const NBSP = ' ';

describe('formatEuros', () => {
  it('formatea el pedido de referencia PED-2026-0107', () => {
    expect(formatEuros(13370)).toBe(`133,70${NBSP}€`);
  });
  it('mantiene los dos decimales en importes pequeños', () => {
    expect(formatEuros(5)).toBe(`0,05${NBSP}€`);
    expect(formatEuros(0)).toBe(`0,00${NBSP}€`);
  });
  it('no agrupa miles con cuatro cifras y sí con cinco (regla de es-ES)', () => {
    expect(formatEuros(100000)).toBe(`1000,00${NBSP}€`);
    expect(formatEuros(1000000)).toBe(`10.000,00${NBSP}€`);
  });
  it('muestra el signo en importes negativos (un reembolso)', () => {
    expect(formatEuros(-2160)).toBe(`-21,60${NBSP}€`);
  });
});
```

```bash
# Desde teatralia/
npx vitest run packages/ui/test/format.test.ts --reporter=verbose 2>&1 | grep -E "✓|×|Tests "
```

```text
 ✓ |ui| test/format.test.ts > formatEuros > formatea el pedido de referencia PED-2026-0107 11ms
 ✓ |ui| test/format.test.ts > formatEuros > mantiene los dos decimales en importes pequeños 0ms
 ✓ |ui| test/format.test.ts > formatEuros > no agrupa miles con cuatro cifras y sí con cinco (regla de es-ES) 0ms
 ✓ |ui| test/format.test.ts > formatEuros > muestra el signo en importes negativos (un reembolso) 0ms
      Tests  4 passed (4)
```

Fíjate en el tercer test: en español, 1000 € se escribe sin punto de miles y 10.000 €, con él. Es otro valor que solo
se acierta calculándolo de verdad.

</details>

### 3 — Crea `/revisar-convenciones` y pruébalo

El tercer prompt revisa un fichero contra las instrucciones del repositorio sin tocarlo. Enlaza las instrucciones con
un enlace Markdown relativo, que es como un prompt file incluye otro fichero del repositorio.

```bash
# Desde la raíz del repositorio
cat > .github/prompts/revisar-convenciones.prompt.md <<'EOF'
---
description: Revisa un fichero de la API contra las convenciones del equipo sin cambiarlo
agent: ask
---
Revisa ${file} contra las convenciones de [copilot-instructions.md](../copilot-instructions.md).

Devuelve una tabla: convención | cumple (sí / no / no aplica) | `línea` | por qué.
Después, una lista corta con lo que cambiarías, de más a menos grave.

No propongas cambios de estilo que no estén en las convenciones. Si un incumplimiento parece deliberado
(por ejemplo, porque otro sistema espera esa respuesta), dilo en lugar de darlo por error.
No edites ningún fichero.
EOF
```

1. Abre `teatralia/services/api/src/routes/tickets.ts` (la validación del QR en la puerta).
2. Conversación nueva, envía `/revisar-convenciones`.

**Qué debe contener la respuesta:** SQL parametrizado (`$1`), sí; `HttpError`, **no**: los errores se devuelven como
`{ ok: false, reason }` con estado 200; `tenant_id`, no aplica o no se filtra (el QR va firmado y el lector no es un
promotor del backoffice). Un buen resultado marca lo de `HttpError` como **probablemente deliberado**: el lector de la
puerta espera siempre un 200 con `ok`. Compruébalo:

```bash
# Un QR que no es válido: la API responde 200 con ok=false, no un error HTTP
curl -s -i -X POST localhost:3000/api/tickets/validate -H 'content-type: application/json' -d '{"token":"no-es-un-qr"}' | sed -n '1p;$p'
# Dónde usa parámetros y si aparece HttpError o tenant_id
grep -n 'HttpError\|tenant_id\|\$1' teatralia/services/api/src/routes/tickets.ts
```

**Resultado esperado:**

```text
HTTP/1.1 200 OK
{"ok":false,"reason":"QR no válido"}
13:         FROM tickets t LEFT JOIN pass_types pt ON pt.id = t.pass_type_id WHERE t.id = $1`,
21:    await pool.query('UPDATE tickets SET checked_in_at = now() WHERE id = $1', [ticketId]);
```

**Cómo se lee:** dos consultas parametrizadas y ningún `HttpError`. Si la revisión propone «cambiar a `HttpError(400)`»
sin más, el prompt no ha servido: ese cambio rompería el lector de la puerta.

### 4 — Índice de la biblioteca y comprobación mínima

Un índice dice al equipo qué hay y con qué se probó cada prompt. Y una comprobación de una línea avisa si alguien sube
un prompt sin descripción (no aparecería explicado al escribir `/`).

```bash
# Índice de la biblioteca
cat > .github/prompts/README.md <<'EOF'
# Prompts del equipo

| Prompt | Para qué | Modo | Probado con |
|--------|----------|------|-------------|
| `/explicar-carpeta` | Situarse en una carpeta que no conoces | Ask | `carpeta=teatralia/services/payments` |
| `/test-de-importes` | Tests de una función de importes en céntimos | Agent | `formatEuros` en `packages/ui/src/format.ts` |
| `/revisar-convenciones` | Revisar un fichero contra `copilot-instructions.md` | Ask | `services/api/src/routes/tickets.ts` |

Cambios: por pull request, con el caso con el que se ha probado en la descripción.
EOF
# Prompts sin descripción (sin salida = todos la tienen) y modo de cada uno
grep -L "^description:" .github/prompts/*.prompt.md
grep -H "^agent:" .github/prompts/*.prompt.md
```

**Resultado esperado:**

```text
.github/prompts/explicar-carpeta.prompt.md:agent: ask
.github/prompts/revisar-convenciones.prompt.md:agent: ask
.github/prompts/test-de-importes.prompt.md:agent: agent
```

**Cómo se lee:** el primer `grep` no imprime nada (todos tienen descripción); el segundo muestra que solo el prompt que
crea ficheros usa el modo agente.

### 5 — Versiona la biblioteca y la corrección

Haces un commit por prompt y después uno con la corrección que encontró la prueba del paso 2. Así el historial dice
qué cambió y por qué.

```bash
# Un commit por prompt
git add .github/prompts/explicar-carpeta.prompt.md && git commit -m "Prompt /explicar-carpeta"
git add .github/prompts/test-de-importes.prompt.md && git commit -m "Prompt /test-de-importes"
git add .github/prompts && git commit -m "Prompt /revisar-convenciones e índice de prompts"
```

Ahora la corrección. Abre `.github/prompts/test-de-importes.prompt.md` y, debajo de la línea «Cada `expect` compara…»,
añade:

```markdown
- Si el resultado es un texto con formato de moneda, `Intl` separa la cifra y el `€` con un espacio de no
  separación (U+00A0): escríbelo como ` `, no como un espacio normal.
```

```bash
# Commit de la corrección y el historial de la biblioteca
git commit -am "test-de-importes: espacio de no separación en importes formateados"
git log --oneline -- .github/prompts
git show --stat HEAD
```

**Resultado esperado** (los identificadores de commit y la fecha cambian):

```text
a7dea77 test-de-importes: espacio de no separación en importes formateados
dcb07b3 Prompt /revisar-convenciones e índice de prompts
c4ada6f Prompt /test-de-importes
af2bc27 Prompt /explicar-carpeta
commit a7dea7717c07eb834a5a28ca17882472c2104e6f
Author: Alumno <alumno@ejemplo.test>
Date:   (fecha)

    test-de-importes: espacio de no separación en importes formateados

 .github/prompts/test-de-importes.prompt.md | 2 ++
 1 file changed, 2 insertions(+)
```

**Cómo se lee:** el último commit toca solo el prompt y dice por qué. Si dentro de un mes los tests de importes vuelven
a fallar por el espacio, `git log` lleva directamente a este cambio. Sube los commits a tu fork con `git push`.

> [!WARNING]
> `git commit -am` incluye cualquier otro cambio de ficheros ya versionados. Antes, mira `git status` y, si tienes
> cambios en `teatralia/` de este laboratorio (el test de `formatEuros`), decide si van en este commit o no.

## Comprueba tu entendimiento

**La biblioteca es del repositorio**
En una conversación nueva escribe `/` en el chat.
→ Aparecen `explicar-carpeta`, `test-de-importes` y `revisar-convenciones` con sus descripciones.

**El historial explica el cambio**
`git log --oneline -1 -- .github/prompts/test-de-importes.prompt.md`
→ El commit de la corrección del espacio de no separación.

## Experimenta

Predice: si invocas `/test-de-importes funcion=formatEuros` otra vez, ahora con la corrección, en una conversación
nueva y tras borrar el test anterior, ¿pasará a la primera?

```bash
# Desde la raíz: borra el test generado en el paso 2
rm -f teatralia/packages/ui/test/format.test.ts
```

Lo esperable es que use ` ` y los tests pasen, pero el caso de 1000 € (sin punto de miles) sigue siendo un riesgo
que el prompt no menciona. Si falla ahí, ya sabes cómo se arregla: otra línea en el prompt y otro commit.

## Reto

### 1 — Un cuarto prompt, con su prueba y su revisión

**La situación:** atención al cliente pide a menudo al equipo «explicad este pedido»: qué compró el cliente, qué se le
cobró, qué se le devolvió y por qué. Un compañero propone un prompt `/explicar-pedido` que lo haga con Copilot.

**Qué haces:** escribe `.github/prompts/explicar-pedido.prompt.md` con una variable `pedido`, en modo **Agent** (para que
pueda consultar la base de datos con `psql` en la terminal), pruébalo con `PED-2026-1463` y añádelo al índice y al
historial con su propio commit.

**Pistas:** el prompt tiene que decir qué tablas mirar (`orders`, `tickets`, `refunds`), que los importes están en
céntimos, que no modifique datos y qué fuente de verdad usar para explicar un reembolso.

**Lo que buscas:** una explicación de `PED-2026-1463` con estos números, que compruebas con una consulta: total 117,20 €,
reembolso `RE-PED-2026-1463-1` de 71,10 € por petición del cliente de dos entradas, y una entrada todavía válida.

<details>
<summary>Ver solución</summary>

```markdown
---
description: Explica un pedido a atención al cliente: qué se compró, qué se cobró y qué se devolvió
agent: agent
argument-hint: pedido=PED-AAAA-NNNN
---
Explica el pedido `${input:pedido:PED-2026-0107}` de Teatralia para atención al cliente.

1. Consulta con `psql "$DATABASE_URL"` (solo SELECT, nunca modifiques datos) las tablas `orders`, `tickets` y `refunds` de ese pedido.
2. Los importes están en céntimos: muéstralos en euros con dos decimales.
3. Para explicar cada reembolso, aplica [la política de devoluciones](../../teatralia/docs/politica-devoluciones.md) y di si el importe coincide con ella.
4. Termina con una frase que atención al cliente pueda copiar al cliente.
```

La comprobación, con los datos del punto de partida (tras `make reset`):

```bash
psql "$DATABASE_URL" -c "SELECT id, status, total_cents, refunded_cents FROM orders WHERE id = 'PED-2026-1463'" -c "SELECT id, reason, amount_cents, ticket_ids FROM refunds WHERE order_id = 'PED-2026-1463'"
```

```text
      id       |       status       | total_cents | refunded_cents 
---------------+--------------------+-------------+----------------
 PED-2026-1463 | partially_refunded |       11720 |           7110
(1 row)

         id         |        reason        | amount_cents |            ticket_ids             
--------------------+----------------------+--------------+-----------------------------------
 RE-PED-2026-1463-1 | petición del cliente |         7110 | {PED-2026-1463-1,PED-2026-1463-2}
(1 row)
```

Si la explicación aplica bien la política, dirá que 71,10 € coincide con el 10 % de penalización sobre 79,00 € y que los
gastos no se devolvieron. **La regla:** un prompt compartido entra en la biblioteca con un caso de prueba cuyos números
se pueden comprobar, y cada cambio posterior, con su commit.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `${file}` llega vacío o con otro fichero | No había fichero activo, o el activo era otro | Abre el fichero que quieres y haz clic en el editor antes de invocar |
| `/revisar-convenciones` no tiene en cuenta las instrucciones | No existe `.github/copilot-instructions.md` | Créalo con el bloque del punto de partida |
| `git commit` falla con «Please tell me who you are» | Git sin nombre ni correo en el Codespace | `git config --global user.name "Tu nombre"` y `git config --global user.email tu@correo` |
| El test de `formatEuros` falla con textos «iguales» | Espacio normal en vez de U+00A0 | Usa ` ` en el valor esperado |
| `git push` rechazado | Estás empujando al repositorio del curso, no a tu fork | `git remote -v`: `origin` tiene que ser tu fork |

## Conclusiones

### Qué es una biblioteca de prompts

El conjunto de prompt files del equipo en `.github/prompts/`, con un índice que dice para qué sirve cada uno y con qué
se probó, versionado y revisado como código.

```text
prompt nuevo → caso de prueba con números comprobables → commit → uso real → fallo → corrección → commit
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Resultado comprobable | `/explicar-carpeta` cita `fichero:línea`; se contrasta con `grep` |
| Límites explícitos | «No cambies la función», «no edites ningún fichero» |
| Modo mínimo | Ask para explicar y revisar; Agent solo para crear tests |
| Índice con el caso de prueba | `.github/prompts/README.md` |
| Un commit por cambio, con el porqué | «espacio de no separación en importes formateados» |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Un detalle que el prompt no anticipa | El espacio U+00A0 en `formatEuros` | Tests en rojo con textos que parecen iguales |
| Revisión que aplica la regla sin criterio | `tickets.ts` devuelve 200 a propósito | Un «arreglo» que rompe el lector de la puerta |
| Prompt sin descripción | `grep -L "^description:"` | Nadie sabe para qué sirve al escribir `/` |

### Cómo se perfecciona

Los prompts entran por pull request con su caso de prueba en la descripción, alguien del equipo lo repite antes de
aprobar, y la comprobación de la cabecera se convierte en un paso de CI. Los que dejan de usarse se borran: una
biblioteca pequeña y probada sirve más que una grande.

### En una frase

> 🔑 Un prompt compartido es código del equipo: se escribe para que su resultado se pueda comprobar, se prueba con un
> caso real y cada corrección queda en git con su porqué.
