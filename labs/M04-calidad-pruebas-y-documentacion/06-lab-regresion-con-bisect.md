# Laboratorio: encontrar una regresión con git bisect

[← Página anterior](05-lab-refactor-con-red.md) · [Siguiente página →](07-lab-inyeccion-sql.md)

Sala Faro escribe a soporte: desde la versión 1.5.0 de Teatralia, su código de descuento `OTONO10` ya no descuenta nada. En la 1.4.0 funcionaba. Entre una versión y otra hay ocho commits de cuatro personas, la suite de tests está en verde en todos y nadie recuerda haber tocado los descuentos. En este lab conviertes la queja en un test, dejas que `git bisect` encuentre solo el commit que rompió el descuento y le pides a Copilot que explique el cambio, comprobando su explicación contra el diff.

### Objetivo

Comprender cómo se localiza una regresión en el historial: qué hace `git bisect` (búsqueda binaria entre un commit bueno y uno malo), cómo debe ser el criterio que decide si un commit es bueno (un test que reproduce exactamente la queja), cómo se detecta un criterio que señala al culpable equivocado y cómo se usa Copilot para entender el commit encontrado.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio.
- Dependencias de Teatralia instaladas (las instala el Codespace al crearse; si no, `make setup`).
- El historial de Teatralia de este lab se genera con un script del curso en una carpeta aparte, `/tmp/teatralia-historial`. No toca `teatralia/` ni tu repositorio, y se puede regenerar siempre igual.
- Vista **Chat** de Copilot (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>).

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| El repositorio de Teatralia con sus versiones publicadas | `/tmp/teatralia-historial`: 12 commits y las etiquetas `v1.3.0`, `v1.4.0` y `v1.5.0` |
| El promotor crea un código de descuento del 10 % | `calcOrderAmounts(items, ev, { code: 'OTONO10', percent: 10 })` |
| «En la 1.4.0 funcionaba, en la 1.5.0 no» | `v1.4.0` es el commit bueno; `v1.5.0`, el malo |
| La suite del equipo, en verde en cada commit | `npm test` (no cubre los descuentos) |

`git bisect` hace una búsqueda binaria: prueba el commit del medio, y según salga bueno o malo descarta la mitad del historial. Con 8 commits sospechosos bastan 3 pruebas; con 1.000, 10. Lo que no hace es saber qué es «bueno»: eso se lo das tú con un comando que termina en 0 (bueno) o en otro código (malo).

### 1 — Genera el historial

```bash
# Crea /tmp/teatralia-historial con 12 commits y tres versiones (lo borra y lo rehace si ya existe)
scripts/m04-regresion.sh
```

**Resultado esperado** (los identificadores son siempre los mismos):

```text
Historial de Teatralia creado en /tmp/teatralia-historial
bd85025 (HEAD -> main, tag: v1.5.0) docs(api): especificación OpenAPI de la API pública de pedidos (TEA-112)
4c0fdaa chore(deps): actualizar vitest a 5.0.5
1ba12d0 feat(tienda): filtrar los eventos por ciudad (TEA-101)
8a3e3cc fix(devoluciones): la penalización del 10 % se calcula sobre el total y se redondea al céntimo (TEA-106)
a07a585 refactor(precios): extraer el cálculo de cada línea del pedido
c43eaa7 feat(backoffice): exportar las ventas de un evento a CSV (TEA-111)
97ee0e1 fix(correo): recortar el asunto a 80 caracteres para que no se repita el envío (TEA-107)
231814b feat(correo): el asunto de la confirmación lleva el número de pedido
ca0bd44 (tag: v1.4.0) docs: cómo se aplican los códigos de descuento
ee3f5db feat(descuentos): códigos de descuento por porcentaje en el pedido (TEA-104)
d27e921 (tag: v1.3.0) feat(precios): importes del pedido con gastos de gestión y comisión
bc5bfd5 chore: estructura del servicio de pedidos
```

<details>
<summary>Qué hace por dentro (<code>scripts/m04-regresion.sh</code>)</summary>

```bash
DEST=${1:-/tmp/teatralia-historial}          # carpeta destino (argumento opcional)
rm -rf "$DEST"; mkdir -p "$DEST"; cd "$DEST"
git init -q -b main                          # repositorio nuevo, independiente del curso
ln -s "$MODULOS" node_modules                # usa vitest y tsx de teatralia/node_modules

# commit FECHA AUTOR MENSAJE: fecha y autor fijos → mismos identificadores en cada ejecución
commit() {
  git add -A
  GIT_AUTHOR_DATE="$1T10:00:00+0200" GIT_COMMITTER_DATE="$1T10:00:00+0200" \
    git commit -q --author="$2" -m "$3"
}

# Cada bloque escribe versiones reducidas de ficheros reales de Teatralia
# (pricing.ts, refunds.ts, templates.ts…) y hace un commit; tres etiquetas marcan las versiones.
cat > services/api/src/orders/pricing.ts <<'EOF'
…
EOF
commit 2026-09-15 "$IKER" "feat(descuentos): códigos de descuento por porcentaje en el pedido (TEA-104)"
```

</details>

### 2 — Mira el historial y la suite

Entra en la carpeta y mira qué cambió entre las dos versiones y qué dice la suite del equipo en la versión mala.

```bash
cd /tmp/teatralia-historial
# Los commits de la 1.5.0 que no estaban en la 1.4.0
git log --oneline v1.4.0..v1.5.0
# La suite del equipo en la 1.5.0
npm test
```

**Resultado esperado** (las dos líneas finales de `npm test`):

```text
bd85025 (HEAD -> main, tag: v1.5.0) docs(api): especificación OpenAPI de la API pública de pedidos (TEA-112)
4c0fdaa chore(deps): actualizar vitest a 5.0.5
1ba12d0 feat(tienda): filtrar los eventos por ciudad (TEA-101)
8a3e3cc fix(devoluciones): la penalización del 10 % se calcula sobre el total y se redondea al céntimo (TEA-106)
a07a585 refactor(precios): extraer el cálculo de cada línea del pedido
c43eaa7 feat(backoffice): exportar las ventas de un evento a CSV (TEA-111)
97ee0e1 fix(correo): recortar el asunto a 80 caracteres para que no se repita el envío (TEA-107)
231814b feat(correo): el asunto de la confirmación lleva el número de pedido
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

Ocho sospechosos y la suite en verde: ningún test del equipo comprueba los descuentos. Ningún mensaje de commit habla de descuentos tampoco. A ojo, el sospechoso podría ser cualquiera que toque precios; `bisect` lo decide con un criterio objetivo.

### 3 — Convierte la queja en un test

El criterio de `bisect` tiene que reproducir exactamente lo que dice Sala Faro: dos butacas de 20,00 € con `OTONO10` deben costar 40,00 − 4,00 + 1,80 de gastos = 37,80 €. Crea el test en la raíz del historial, **sin añadirlo a git**: así sigue ahí cuando `bisect` cambie de commit.

```bash
# Test de la queja, como fichero no versionado
cat > descuento.test.ts <<'EOF'
import { expect, it } from 'vitest';
import { calcOrderAmounts } from './services/api/src/orders/pricing.js';

// Dos butacas de 20,00 € en Sala Faro (gastos 0,90 €) con el código OTONO10 (10 %)
it('OTONO10 descuenta el 10 % del precio de las entradas', () => {
  const r = calcOrderAmounts(
    [
      { kind: 'seat', ref: 'A-1', price_cents: 2000 },
      { kind: 'seat', ref: 'A-2', price_cents: 2000 },
    ],
    { fee_cents: 90, commission_bps: 750 },
    { code: 'OTONO10', percent: 10 },
  );
  expect(r.total_cents).toBe(4000 - 400 + 180);
});
EOF
git status --short
```

**Resultado esperado:**

```text
?? descuento.test.ts
```

> [!TIP]
> La carpeta `/tmp/teatralia-historial` está fuera del repositorio abierto en VS Code, así que `#codebase` no la ve. Si quieres que Copilot escriba el test, pégale el contenido de `services/api/src/orders/pricing.ts` (`cat` en la terminal y `#terminalSelection`) y describe la queja con sus números.

### 4 — Comprueba el criterio en los dos extremos

Un criterio sirve si da **malo** en el commit malo y **bueno** en el bueno. Pruébalo antes de lanzar `bisect`.

```bash
# En la 1.5.0 (HEAD)
npx vitest run descuento.test.ts
# En la 1.4.0, y vuelta a main
git checkout -q v1.4.0 && npx vitest run descuento.test.ts; git checkout -q main
```

**Resultado esperado** (líneas clave):

```text
   × OTONO10 descuenta el 10 % del precio de las entradas 6ms
AssertionError: expected 4180 to be 3780 // Object.is equality
      Tests  1 failed (1)
      Tests  1 passed (1)
```

En la 1.5.0 el pedido cuesta 41,80 €: el descuento se calcula pero no se resta. En la 1.4.0, 37,80 €. El criterio separa bien los dos extremos.

### 5 — Deja que bisect encuentre el commit

`git bisect start MALO BUENO` marca los extremos; `git bisect run COMANDO` ejecuta el comando en cada commit que elige y lo marca según su código de salida.

```bash
# Extremos: la 1.5.0 es mala, la 1.4.0 es buena
git bisect start v1.5.0 v1.4.0
# El test decide en cada commit (vitest sale con 1 si falla)
git bisect run npx vitest run descuento.test.ts
```

**Resultado esperado** (sin las líneas de detalle de vitest):

```text
Bisecting: 3 revisions left to test after this (roughly 2 steps)
[a07a585c2e2857a965ae7508ff2a2bee218c9d09] refactor(precios): extraer el cálculo de cada línea del pedido
running 'npx' 'vitest' 'run' 'descuento.test.ts'
   × OTONO10 descuenta el 10 % del precio de las entradas 5ms
AssertionError: expected 4180 to be 3780 // Object.is equality
      Tests  1 failed (1)
Bisecting: 1 revision left to test after this (roughly 1 step)
[97ee0e13187db1a3a5642c33001c7920dbc26c30] fix(correo): recortar el asunto a 80 caracteres para que no se repita el envío (TEA-107)
running 'npx' 'vitest' 'run' 'descuento.test.ts'
      Tests  1 passed (1)
Bisecting: 0 revisions left to test after this (roughly 0 steps)
[c43eaa76bf0fdc1f679b79272e7016e3b91978de] feat(backoffice): exportar las ventas de un evento a CSV (TEA-111)
running 'npx' 'vitest' 'run' 'descuento.test.ts'
      Tests  1 passed (1)
a07a585c2e2857a965ae7508ff2a2bee218c9d09 is the first bad commit
commit a07a585c2e2857a965ae7508ff2a2bee218c9d09
Author: Marta Ruiz <marta.ruiz@teatralia.test>
Date:   Thu Oct 8 10:00:00 2026 +0200

    refactor(precios): extraer el cálculo de cada línea del pedido

 services/api/src/orders/pricing.ts | 47 +++++++++++++++++++-------------------
 1 file changed, 24 insertions(+), 23 deletions(-)
bisect found first bad commit
```

| Prueba | Commit | Resultado | Qué descarta |
|--------|--------|-----------|--------------|
| 1 | `a07a585` (refactor de precios) | malo | Todo lo posterior: el fallo está en él o antes |
| 2 | `97ee0e1` (asunto del correo) | bueno | Él y lo anterior |
| 3 | `c43eaa7` (exportar CSV) | bueno | Solo queda `a07a585` |

Tres pruebas para ocho commits. El culpable es un **refactor**: un commit que, por su mensaje, no debería cambiar nada.

### 6 — Pide a Copilot que explique el cambio

Saca el diff del commit en la terminal y dáselo a Copilot. Conversación nueva en modo **Ask**:

```bash
# El cambio del commit culpable en el cálculo de precios
git show a07a585 -- services/api/src/orders/pricing.ts
```

Selecciona la salida en la terminal y pega en el chat:

```text
#terminalSelection

Este commit es un refactor que no debía cambiar el comportamiento. Desde él, un pedido de dos
entradas de 2000 céntimos con un descuento del 10 % y 90 de gastos por entrada cuesta 4180 en
vez de 3780. Señala la línea exacta del diff que lo provoca y explica qué hacía antes y qué hace
ahora. Responde solo con lo que se ve en el diff.
```

**Qué debe contener la respuesta** (la redacción varía en cada ejecución):

- que el descuento se sigue calculando (`discount_cents`) y se devuelve en el resultado;
- que la línea del total pasó de `total_cents: sub - desc + fees` a `total_cents: subtotal + fees`: ya no resta el descuento;
- la cuenta: 4000 + 180 = 4180 en lugar de 4000 − 400 + 180 = 3780.

Comprueba la explicación contra el diff, sin fiarte de ella:

```bash
# Líneas del diff que mencionan el total o el descuento
git show a07a585 -- services/api/src/orders/pricing.ts | grep -nE "^[-+].*(total|desc)"
```

**Resultado esperado:**

```text
51:-  // el descuento se aplica al precio de las entradas; los gastos de gestión no se descuentan
52:-  const desc = discount ? Math.round((sub * discount.percent) / 100) : 0;
53:+  const subtotal = sum(lines, 'price_cents');
55:+  const discount_cents = discount ? Math.round((subtotal * discount.percent) / 100) : 0;
57:-    subtotal_cents: sub,
58:-    discount_cents: desc,
59:+    subtotal_cents: subtotal,
62:-    total_cents: sub - desc + fees,
64:+    total_cents: subtotal + fees,
```

Las líneas 62 y 64 confirman la explicación. Fíjate también en la 51: el refactor borró el comentario que explicaba la regla del descuento.

### 7 — Cierra bisect y arregla la regresión

`bisect` deja el repositorio en un commit antiguo: vuelve a `main` antes de tocar nada. Después aplica el arreglo de una línea y ejecuta la suite y tu test.

```bash
# Vuelve a la rama main
git bisect reset
# El total vuelve a restar el descuento
sed -i 's/    total_cents: subtotal + fees,/    total_cents: subtotal - discount_cents + fees,/' services/api/src/orders/pricing.ts
git diff --stat
# Suite del equipo y test de la queja (npx vitest run sin fichero ejecuta todos)
npx vitest run
```

**Resultado esperado** (líneas clave):

```text
 services/api/src/orders/pricing.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
 Test Files  3 passed (3)
      Tests  6 passed (6)
```

Tres ficheros de test: los dos del equipo y el tuyo. En un repositorio real, el siguiente paso sería versionar `descuento.test.ts` junto al arreglo, para que la suite cubra los descuentos y esta regresión no vuelva.

## Comprueba tu entendimiento

**Cuántas pruebas hacen falta**
Cuenta en la salida del paso 5 las líneas `running` y relaciónalas con los 8 commits sospechosos.
→ Tres: cada prueba parte el rango por la mitad (8 → 4 → 2 → 1). Con 1.000 commits serían unas 10.

**Dónde quedas tras bisect**
Antes de `git bisect reset`, ejecuta `git status`.
→ Dice que estás en un HEAD separado (`HEAD detached at c43eaa7` o similar), no en `main`: por eso se cierra `bisect` antes de arreglar.

## Experimenta

**Predice** qué commit señalará `bisect` si el criterio es la suite del equipo (`npm test`) en lugar de tu test. Aparta antes tu test, porque `npm test` ejecuta todos los `*.test.ts` de la carpeta, también los no versionados.

```bash
# Tu test fuera de la carpeta mientras dura el experimento
mv descuento.test.ts /tmp/
git checkout -q main && git stash -q   # aparta también tu arreglo del paso 7
git bisect start v1.5.0 v1.4.0
git bisect run npm test
git bisect reset
git stash pop -q && mv /tmp/descuento.test.ts .
```

**Resultado esperado** (líneas clave):

```text
running 'npm' 'test'
      Tests  4 passed (4)
[1ba12d0fdc885d8a960e2bf37e20dc2362922ba4] feat(tienda): filtrar los eventos por ciudad (TEA-101)
running 'npm' 'test'
      Tests  5 passed (5)
[4c0fdaa73814c59ba0e1fcddbb075fbdc7e90ed4] chore(deps): actualizar vitest a 5.0.5
running 'npm' 'test'
      Tests  5 passed (5)
bd850250b474bc35d2fe5bc8e3916e3ab740775d is the first bad commit
bisect found first bad commit
```

Como la suite pasa en todos los commits, `bisect` los marca todos como buenos y acusa al único que tú declaraste malo: el commit de documentación de la 1.5.0. Un culpable falso, señalado con total seguridad. `bisect` es exactamente tan bueno como su criterio.

## Reto

### 1 — Cuándo se arregló el céntimo de las devoluciones

**La situación:** finanzas quiere saber desde qué commit las devoluciones por petición del cliente cumplen la política (dos entradas de 18,25 € → 32,85 €), para calcular qué devoluciones anteriores compensar. Ahora no buscas cuándo se rompió algo, sino cuándo se **arregló**.

**Qué haces:** escribe un test no versionado `devolucion.test.ts` con ese caso y usa `bisect` entre `v1.3.0` (aún sin arreglar) y `v1.5.0` (ya arreglado) para encontrar el primer commit en el que pasa.

**Pistas:** `git bisect start --term-old=roto --term-new=arreglado` cambia las palabras «good» y «bad». `git bisect run` marca como **old** (`roto`) los commits en los que el comando sale con 0; como quieres lo contrario, invierte el resultado del test con `sh -c '! npx vitest run devolucion.test.ts'`. La función es `calcRefund(entradas, 'petición del cliente')` de `services/api/src/orders/refunds.ts`.

**Lo que buscas:** `bisect` señala un commit cuyo mensaje habla de devoluciones.

<details>
<summary>Ver solución</summary>

```bash
cat > devolucion.test.ts <<'EOF'
import { expect, it } from 'vitest';
import { calcRefund } from './services/api/src/orders/refunds.js';

// Política §3: dos entradas de 18,25 € devueltas por el cliente → 32,85 €
it('la devolución por petición del cliente cumple la política', () => {
  const t = [
    { id: 'A-1', price_cents: 1825, fee_cents: 100 },
    { id: 'A-2', price_cents: 1825, fee_cents: 100 },
  ];
  expect(calcRefund(t, 'petición del cliente')).toBe(3285);
});
EOF
git bisect start --term-old=roto --term-new=arreglado
git bisect arreglado v1.5.0
git bisect roto v1.3.0
git bisect run sh -c '! npx vitest run devolucion.test.ts'
git bisect reset
```

```text
Bisecting: 4 revisions left to test after this (roughly 2 steps)
[c43eaa76bf0fdc1f679b79272e7016e3b91978de] feat(backoffice): exportar las ventas de un evento a CSV (TEA-111)
running 'sh' '-c' ''\!' npx vitest run devolucion.test.ts'
      Tests  1 failed (1)
Bisecting: 2 revisions left to test after this (roughly 1 step)
[8a3e3ccffd3b55c4a42eb584c892227759cc4f7e] fix(devoluciones): la penalización del 10 % se calcula sobre el total y se redondea al céntimo (TEA-106)
running 'sh' '-c' ''\!' npx vitest run devolucion.test.ts'
      Tests  1 passed (1)
Bisecting: 0 revisions left to test after this (roughly 0 steps)
[a07a585c2e2857a965ae7508ff2a2bee218c9d09] refactor(precios): extraer el cálculo de cada línea del pedido
running 'sh' '-c' ''\!' npx vitest run devolucion.test.ts'
      Tests  1 failed (1)
8a3e3ccffd3b55c4a42eb584c892227759cc4f7e is the first arreglado commit
```

El arreglo entró en `8a3e3cc` (14 de octubre, TEA-106). Las devoluciones anteriores a su despliegue son las que finanzas tiene que revisar. Sin invertir el test, `bisect` habría buscado al revés y señalado un commit sin relación. **La regla:** `bisect` encuentra cualquier transición entre dos estados; tú decides qué estado es cuál y lo traduces a un código de salida.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `Falta …/teatralia/node_modules` al ejecutar el script | Dependencias sin instalar | `make setup` en la raíz del repositorio |
| `bisect` acusa a un commit que no toca nada relacionado | El criterio no reproduce la queja (pasa siempre o falla siempre) | Comprueba el criterio en los dos extremos (paso 4) |
| `descuento.test.ts` desaparece al cambiar de commit | Lo añadiste a git con `git add` | Déjalo sin versionar; si ya está en el índice, `git rm --cached descuento.test.ts` |
| `npm test` falla en commits antiguos con tu test | `npm test` ejecuta también tus ficheros no versionados | Usa `npx vitest run fichero.test.ts` como criterio, o aparta tus tests |
| `You need to start by "git bisect start"` o cambios que no se pueden aplicar | Sesión de `bisect` sin cerrar o arreglo hecho en HEAD separado | `git bisect reset` y repite desde `main` |

## Conclusiones

### Qué es localizar una regresión con bisect

Una regresión es algo que funcionaba y deja de funcionar. `git bisect` la localiza con una búsqueda binaria entre un commit bueno y uno malo, usando un criterio que tú das: un comando que sale con 0 si el commit es bueno.

```text
v1.4.0 ✓ ── 231814b ── 97ee0e1 ✓ ── c43eaa7 ✓ ── a07a585 ✗ ── 8a3e3cc ── 1ba12d0 ── 4c0fdaa ── v1.5.0 ✗
                                                    ↑ primer commit malo (3 pruebas)
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| El criterio reproduce la queja con sus números | 2 × 20,00 € con `OTONO10` → 37,80 € |
| Se comprueba en los dos extremos antes de empezar | 4180 en `v1.5.0`, verde en `v1.4.0` |
| Vive fuera de git mientras dura `bisect` | `descuento.test.ts` sin versionar |
| La explicación del commit se contrasta con el diff | Líneas 62 y 64 de `git show a07a585` |
| Tras el arreglo, el test pasa a la suite | `Tests  6 passed (6)` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Criterio que no cubre el fallo | Con `npm test`, `bisect` acusa al commit de documentación | Culpable falso con apariencia de certeza |
| Refactor que cambia comportamiento | `a07a585` dejó de restar el descuento | Promotores cobrando de más a sus clientes |
| Suite sin el caso | Verde en los 12 commits | La regresión llega a una versión publicada |
| Términos invertidos al buscar un arreglo | El reto: hay que invertir el test | `bisect` busca la transición contraria |

### Cómo se perfecciona

- Convertir cada queja de cliente en un test antes de buscar la causa; ese test es el criterio de `bisect` y, después, parte de la suite.
- Usar Copilot para **explicar** el commit encontrado, no para adivinarlo, y comprobar su explicación con `git show`.
- Commits pequeños y con un solo propósito: `bisect` señala un commit, y cuanto más pequeño sea, más rápido se entiende.

### En una frase

> 🔑 `git bisect` encuentra el commit con la misma fiabilidad que el test que le das: un criterio que reproduce la queja da un culpable; uno que no la ve da un falso culpable.
