# Laboratorio: notas de versión

[← Página anterior](08-lab-readme-y-openapi.md) · [Siguiente página →](10-lab-workflow-de-tests.md)

Teatralia 1.5.0 está publicada y el equipo de cuentas necesita contárselo a los seis promotores: qué pueden hacer ahora, qué se ha corregido y qué deben saber sus equipos de atención al cliente. El material de partida son los mensajes de commit, escritos por y para desarrolladores (`refactor(precios)`, `chore(deps)`, `varchar`…). Copilot traduce eso a lenguaje de negocio muy bien, y también exagera, mezcla o inventa con la misma soltura. En este lab generas las notas de versión desde el historial y compruebas cada afirmación contra los commits y contra el código de la versión.

### Objetivo

Comprender cómo se hace un entregable para negocio a partir del historial técnico: cómo se genera con Copilot desde los commits, cómo deben ser unas notas para promotores (cada punto trazable a un commit y comprobable en el código), cómo se detecta lo inventado o lo omitido y cómo se mejora el proceso para la siguiente versión.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio, con las dependencias de Teatralia instaladas (`make setup` si no lo están).
- El historial de la versión se genera con un script del curso en `/tmp/teatralia-historial`: 12 commits con las etiquetas `v1.3.0`, `v1.4.0` y `v1.5.0`. No toca `teatralia/` ni tu repositorio.

```bash
# Crea (o rehace igual) el historial de Teatralia del lab
scripts/m04-regresion.sh > /dev/null && echo "historial listo"
```

```text
historial listo
```

- Vista **Chat** de Copilot (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>).

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| La versión publicada y la anterior | Etiquetas `v1.5.0` (27 de octubre) y `v1.4.0` |
| Lo que entra en la versión | Los commits de `v1.4.0..v1.5.0` |
| Las peticiones de los promotores | Las referencias `TEA-1xx` de los mensajes |
| Las notas para los promotores | `teatralia/docs/notas-v1.5.0.md`, que escribes con Copilot |

Unas notas de versión para negocio no son el registro de cambios: se escriben para quien usa el producto, dicen qué cambia **para él** y dejan fuera lo que no le afecta (dependencias, refactors). Pero cada frase tiene que poder señalar su commit.

### 1 — Mira lo que entra en la versión

```bash
# Commits de la 1.5.0 que no estaban en la 1.4.0, del más antiguo al más reciente
git -C /tmp/teatralia-historial log --format='- %s' --reverse v1.4.0..v1.5.0
```

**Resultado esperado:**

```text
- feat(correo): el asunto de la confirmación lleva el número de pedido
- fix(correo): recortar el asunto a 80 caracteres para que no se repita el envío (TEA-107)
- feat(backoffice): exportar las ventas de un evento a CSV (TEA-111)
- refactor(precios): extraer el cálculo de cada línea del pedido
- fix(devoluciones): la penalización del 10 % se calcula sobre el total y se redondea al céntimo (TEA-106)
- feat(tienda): filtrar los eventos por ciudad (TEA-101)
- chore(deps): actualizar vitest a 5.0.5
- docs(api): especificación OpenAPI de la API pública de pedidos (TEA-112)
```

| Tipo | Commits | ¿Para promotores? |
|------|---------|-------------------|
| `feat` | Asunto con número de pedido, exportar CSV, filtro por ciudad | Sí: novedades |
| `fix` | Correo repetido (TEA-107), céntimo de las devoluciones (TEA-106) | Sí: correcciones |
| `docs(api)` | OpenAPI (TEA-112) | Solo para quien integra |
| `refactor`, `chore` | Cálculo de líneas, vitest | No, en principio |

### 2 — Mira qué ficheros cambian

El mensaje de un commit dice lo que su autor creía que hacía; el diff, lo que hace. Mira qué partes del producto toca la versión:

```bash
git -C /tmp/teatralia-historial diff --stat v1.4.0 v1.5.0
```

**Resultado esperado:**

```text
 docs/openapi-pedidos.yaml             | 14 +++++++++++
 package.json                          |  2 +-
 services/api/src/events/filters.ts    | 13 ++++++++++
 services/api/src/orders/pricing.ts    | 47 ++++++++++++++++++-----------------
 services/api/src/orders/refunds.ts    | 17 ++++++-------
 services/api/src/reports/sales-csv.ts | 13 ++++++++++
 services/api/test/refunds.test.ts     | 10 ++++++++
 services/notifier/src/templates.ts    |  9 +++++++
 8 files changed, 91 insertions(+), 34 deletions(-)
```

`pricing.ts` (el cálculo de lo que paga el comprador) es el fichero con más cambios de la versión, y solo lo toca un commit de tipo `refactor`. Retenlo para el paso 6.

### 3 — Pide las notas a Copilot

Ejecuta este comando para tener en la terminal los mensajes completos con fecha y autor:

```bash
git -C /tmp/teatralia-historial log --format='%h %ad %an%n    %s' --date=short v1.4.0..v1.5.0
```

Conversación nueva en modo **Agent** y pega:

```text
#terminalLastCommand

Escribe teatralia/docs/notas-v1.5.0.md: las notas de la versión 1.5.0 de Teatralia (publicada el
27 de octubre de 2026) para los PROMOTORES que venden entradas con nosotros. Secciones: Novedades,
Correcciones y Para equipos técnicos. Reglas:
- solo lo que aparece en estos commits; nada más;
- en lenguaje del promotor (qué puede hacer, qué le pasaba a sus compradores), sin jerga
  (nada de refactor, chore, varchar, dependencias, nombres de funciones);
- deja fuera lo que no cambia nada para el promotor;
- termina cada punto con su referencia TEA entre paréntesis si el commit la tiene.
```

**Qué debe contener la respuesta** (la redacción varía en cada ejecución):

- un fichero nuevo `teatralia/docs/notas-v1.5.0.md`;
- novedades: exportar ventas a CSV (TEA-111), filtro por ciudad (TEA-101) y número de pedido en el asunto;
- correcciones: devoluciones con un céntimo de menos (TEA-106) y correos de confirmación repetidos (TEA-107);
- OpenAPI (TEA-112) aparte, para equipos técnicos;
- nada sobre el refactor ni sobre vitest.

<details>
<summary>Solución de referencia: <code>teatralia/docs/notas-v1.5.0.md</code></summary>

```markdown
# Teatralia 1.5.0 — novedades para promotores

Publicada el 27 de octubre de 2026.

## Novedades

- **Exporta las ventas de un evento a CSV** desde el backoffice: número de pedido, email del comprador,
  entradas y total en euros, listo para abrir en una hoja de cálculo. (TEA-111)
- **Tus compradores pueden filtrar los eventos por ciudad** en la tienda, sin importar mayúsculas ni tildes. (TEA-101)
- El correo de confirmación de compra lleva el **número de pedido en el asunto**.

## Correcciones

- **Devoluciones por petición del cliente**: la penalización del 10 % se calcula sobre el total de las
  entradas devueltas y se redondea al céntimo, como dice la política (dos entradas de 18,25 € → 32,85 €).
  Antes se devolvía un céntimo de menos en algunos pedidos. (TEA-106)
- **Correos de confirmación repetidos**: con títulos de evento muy largos, el comprador podía recibir la
  confirmación hasta tres veces. Ahora el asunto se recorta y el correo sale una sola vez. (TEA-107)

## Para equipos técnicos

- Documentación OpenAPI de la API pública de pedidos para integraciones. (TEA-112)
```

</details>

### 4 — Comprueba que no falta ni sobra nada

Tres comprobaciones mecánicas: que están todas las referencias TEA de la versión, que no se ha colado jerga interna y qué commits no tienen referencia (para decidir a mano si van o no).

```bash
NOTAS=teatralia/docs/notas-v1.5.0.md
H=/tmp/teatralia-historial
echo "== tickets de la versión que faltan en las notas:"
for t in $(git -C $H log --format=%s v1.4.0..v1.5.0 | grep -o 'TEA-[0-9]*' | sort -u); do grep -q "$t" $NOTAS || echo "  falta $t"; done
echo "== palabras internas:"
grep -niE 'refactor|chore|vitest|deps|varchar|Math\.' $NOTAS || echo "  ninguna"
echo "== commits sin ticket (revísalos a mano):"
git -C $H log --format='%h %s' v1.4.0..v1.5.0 | grep -v 'TEA-'
```

**Resultado esperado** (con la solución de referencia):

```text
== tickets de la versión que faltan en las notas:
== palabras internas:
  ninguna
== commits sin ticket (revísalos a mano):
4c0fdaa chore(deps): actualizar vitest a 5.0.5
a07a585 refactor(precios): extraer el cálculo de cada línea del pedido
231814b feat(correo): el asunto de la confirmación lleva el número de pedido
```

No falta ninguna referencia ni hay jerga. De los tres commits sin ticket, el del asunto está en Novedades y los otros dos se han dejado fuera a propósito.

### 5 — Comprueba cada afirmación contra el código de la versión

Las notas prometen cosas concretas: un ejemplo de 32,85 €, un CSV con ciertas columnas, un filtro que ignora tildes. Comprueba cada una ejecutando el código de la `v1.5.0` (el historial está en esa versión).

```bash
cd /tmp/teatralia-historial
# El ejemplo de las devoluciones: el test que entró con el arreglo
npx vitest run services/api/test/refunds.test.ts --reporter=verbose
# El CSV y el filtro por ciudad, con datos de ejemplo
npx tsx -e "
import { salesCsv } from './services/api/src/reports/sales-csv.ts';
import { byCity } from './services/api/src/events/filters.ts';
process.stdout.write(salesCsv([{ order_id: 'PED-2026-0107', buyer_email: 'ana.compradora@ejemplo.test', tickets: 3, total_cents: 13370 }]));
console.log(byCity([{ id: 'EV-OLIVO-0101', title: 'Beethoven 9', city: 'Sevilla' }, { id: 'EV-FARO-0042', title: 'Jazz en el Faro', city: 'A Coruña' }], 'a coruna').map((e) => e.id));"
# El asunto del evento con el título más largo
npx tsx -e "import { confirmationSubject } from './services/notifier/src/templates.ts'; const s = confirmationSubject('Historia de un idiota contada por él mismo: versión íntegra', 'PED-2026-2468'); console.log(s, s.length);"
cd - > /dev/null
```

**Resultado esperado:**

```text
 ✓ services/api/test/refunds.test.ts > petición del cliente: dos entradas de 18,25 € → 32,85 € 1ms
      Tests  1 passed (1)
pedido;email;entradas;total_eur
PED-2026-0107;ana.compradora@ejemplo.test;3;133,70
[ 'EV-FARO-0042' ]
Tus entradas para Historia de un idiota contada por él mismo: v… — PED-2026-2468 80
```

| Afirmación de las notas | Comprobación |
|-------------------------|--------------|
| 2 × 18,25 € → 32,85 € | El test pasa |
| CSV con pedido, email, entradas y total en euros | Cabecera `pedido;email;entradas;total_eur`, `133,70` |
| Filtro sin mayúsculas ni tildes | `a coruna` encuentra `A Coruña` |
| El asunto se recorta | 80 caracteres con `…`, el número de pedido intacto |

Si Copilot hubiera escrito «exporta a Excel» o «filtra por ciudad y fecha», esta tabla lo habría desmentido.

### 6 — Pregunta qué riesgo esconde lo que se dejó fuera

Dejar fuera el refactor es correcto para el texto, pero el paso 2 mostró que toca el cálculo de lo que paga el comprador. Pide a Copilot (modo **Ask**) una lectura de riesgo antes de enviar las notas:

```bash
# El diff del refactor, en la terminal
git -C /tmp/teatralia-historial show a07a585 -- services/api/src/orders/pricing.ts
```

Selecciona la salida y pega en el chat:

```text
#terminalSelection

Este commit se ha dejado fuera de las notas de la versión porque es un refactor. ¿Puede cambiar lo
que paga un comprador en algún caso? Responde solo con lo que se ve en el diff, citando la línea.
```

**Qué debe contener la respuesta:** que la línea del total pasa de `total_cents: sub - desc + fees` a `total_cents: subtotal + fees`, es decir, que el descuento se calcula pero **ya no se resta**: los pedidos con código de descuento cuestan más desde la 1.5.0.

Compruébalo:

```bash
git -C /tmp/teatralia-historial show a07a585 -- services/api/src/orders/pricing.ts | grep -E "^[-+] +(sub)?total_cents"
```

**Resultado esperado:**

```text
-    subtotal_cents: sub,
+    subtotal_cents: subtotal,
-    total_cents: sub - desc + fees,
+    total_cents: subtotal + fees,
```

El subtotal solo cambia de nombre; el total pierde el `- desc`.

Las notas no deben inventar, pero tampoco pueden callar un cambio que afecta al dinero de los compradores. Lo que hay que hacer con esto no es escribirlo en las notas tal cual, sino avisar al equipo antes de enviarlas: es una regresión (se busca y se corrige en [Laboratorio: encontrar una regresión con git bisect](06-lab-regresion-con-bisect.md)).

## Comprueba tu entendimiento

**Un punto inventado**
Añade a tus notas la línea `- Nuevo informe de asistencia por evento. (TEA-115)` y repite las comprobaciones del paso 4.
→ Ninguna lo detecta: el bucle solo busca que estén las TEA de la versión, no que sobren. Comprueba a la inversa con `grep -o 'TEA-[0-9]*' teatralia/docs/notas-v1.5.0.md | sort -u` y compáralo con la lista del historial: `TEA-115` no está en ningún commit. Quítala.

**Por qué va aparte la OpenAPI**
Explica a quién le sirve el punto de TEA-112 y por qué no va en Novedades.
→ A los equipos técnicos que integran con la API; a un promotor que vende desde la tienda de Teatralia no le cambia nada.

## Experimenta

**Predice** qué cambia en las notas si pides el mismo texto para otro público: el equipo de **atención al cliente** del promotor, que habla con los compradores. Pide en el mismo chat:

```text
Con los mismos commits, escribe 5 líneas como máximo para el equipo de atención al cliente de un
promotor: qué pueden notar los compradores desde la 1.5.0 y qué responder si preguntan.
Sin novedades del backoffice.
```

Lo esperable: desaparecen el CSV y la OpenAPI (no afectan a compradores); quedan el céntimo de las devoluciones, el correo repetido, el número de pedido en el asunto y el filtro por ciudad. Compruébalo con el paso 4 adaptado: las referencias TEA que quedan tienen que ser un subconjunto de las del historial. El mismo historial da entregables distintos según quién los lee; la trazabilidad a los commits es lo que no cambia.

## Reto

### 1 — Notas que se generan solas en la próxima versión

**La situación:** el equipo de cuentas pide que, en la 1.6.0, el borrador de notas no dependa de copiar el `git log` a mano. Un compañero propone un prompt file del repositorio que lo haga siempre igual.

**Qué haces:** crea `.github/prompts/notas-de-version.prompt.md` en la raíz de tu fork con el prompt del paso 3, generalizado (versiones como entrada) e incluyendo las reglas y las comprobaciones del paso 4 como instrucciones para el agente. Úsalo desde el chat con `/notas-de-version` para la 1.5.0 y compara el resultado con tu fichero.

**Pistas:** un prompt file es Markdown con una cabecera YAML (`mode: agent` y `description`; en versiones recientes de VS Code la clave del modo puede llamarse `agent`); dentro puedes pedir al agente que ejecute comandos de terminal (`git log`, el bucle de TEA) antes de escribir. Las variables de entrada se escriben como `${input:nombre}`.

**Lo que buscas:** un borrador equivalente al del paso 3 que se pide con una sola línea y que incluye en su respuesta el resultado de las comprobaciones.

<details>
<summary>Ver solución</summary>

```markdown
---
mode: agent
description: Notas de versión de Teatralia para promotores a partir de los commits
---
Genera las notas de la versión ${input:nueva} de Teatralia para los PROMOTORES, a partir de los commits
de `git -C ${input:repo} log --format='%h %ad %an%n    %s' --date=short ${input:anterior}..${input:nueva}`.

Escríbelas en `teatralia/docs/notas-${input:nueva}.md` con las secciones Novedades, Correcciones y
Para equipos técnicos. Reglas:
- solo lo que aparece en los commits; cada punto termina con su referencia TEA si la tiene;
- lenguaje del promotor, sin jerga (refactor, chore, dependencias, nombres de funciones);
- deja fuera lo que no cambia nada para el promotor, pero lista aparte, para el equipo, los commits
  sin TEA que tocan `pricing.ts` o `refunds.ts` (dinero de los compradores).

Al terminar, ejecuta y muestra:
1. las TEA de los commits que no están en las notas;
2. `grep -niE 'refactor|chore|vitest|deps|varchar' teatralia/docs/notas-${input:nueva}.md`;
3. las TEA de las notas que no están en los commits.
```

Al invocarlo con `/notas-de-version`, Copilot pide `repo` (`/tmp/teatralia-historial`), `anterior` (`v1.4.0`) y `nueva` (`v1.5.0`). El texto varía en cada ejecución, pero las comprobaciones del final se ejecutan siempre y sus salidas deben ser las del paso 4. Además, la lista para el equipo debe sacar `a07a585` por tocar `pricing.ts`: el aviso del paso 6, convertido en regla. Si no lo saca, el agente no ha seguido la instrucción y lo ves sin leer el texto. **La regla:** un entregable que se repite en cada versión se convierte en un prompt file con sus comprobaciones dentro, para que la verificación no dependa de acordarse.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `fatal: cannot change to '/tmp/teatralia-historial'` | No has generado el historial o el Codespace se reinició (`/tmp` se vacía) | `scripts/m04-regresion.sh` |
| `fatal: ambiguous argument 'v1.4.0..v1.5.0'` | Ejecutas `git log` en tu repositorio, no en el historial | Usa `git -C /tmp/teatralia-historial …` |
| `#terminalLastCommand` adjunta otro comando | Has ejecutado algo después del `git log` | Repite el `git log` justo antes de escribir el prompt |
| Las notas hablan de «mejoras de rendimiento» | Copilot convirtió el refactor en una novedad | Quítalo: no hay ningún commit que lo diga |
| Copilot escribe las notas en el chat y no en el fichero | Modo Ask o Edit sin fichero adjunto | Usa modo Agent o crea el fichero y pega el texto |

## Conclusiones

### Qué es un entregable para negocio desde el historial

Un texto para quien usa el producto (aquí, los promotores) construido a partir de los commits de una versión: qué pueden hacer, qué se ha corregido y qué deben saber. Copilot hace la traducción de lenguaje técnico a lenguaje de negocio; la trazabilidad y la comprobación las pones tú.

```text
v1.4.0..v1.5.0 (8 commits) → clasificar (feat / fix / docs / interno) → borrador con Copilot
   → ¿están todas las TEA?, ¿hay jerga?, ¿sobra algo? → cada afirmación contra el código → riesgos de lo omitido
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Solo lo que está en los commits | Las 5 TEA de la versión, ninguna más |
| En el idioma del lector | Sin refactor, chore ni vitest |
| Cada afirmación comprobable | 32,85 €, columnas del CSV, `a coruna`, 80 caracteres |
| Lo que se omite se revisa | `a07a585` toca `pricing.ts` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Punto inventado | Una TEA que no está en ningún commit | Promotores esperando algo que no existe |
| Afirmación exagerada | La comprobación contra el código del paso 5 | Soporte respondiendo cosas falsas |
| Omisión peligrosa | El diff del refactor: el descuento ya no se resta | Un cambio de precio sin avisar |
| Jerga interna | El `grep` de palabras internas | Notas que el promotor no entiende |

### Cómo se perfecciona

- Mensajes de commit con tipo y referencia (`fix(devoluciones): … (TEA-106)`): son la materia prima.
- Un prompt file con las reglas y las comprobaciones, para que el borrador salga siempre igual.
- Revisar siempre los commits sin referencia que tocan dinero, datos de clientes o correos.

### En una frase

> 🔑 Copilot traduce los commits al idioma del promotor; tú garantizas que cada frase tiene su commit y que ningún commit importante se queda sin frase.
