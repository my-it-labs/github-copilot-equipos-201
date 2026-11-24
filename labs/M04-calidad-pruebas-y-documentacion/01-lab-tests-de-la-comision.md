# Laboratorio: tests unitarios de la comisión

[← Página anterior](00-la-red-de-tests.md) · [Siguiente página →](02-lab-datos-de-prueba.md)

Teatralia cobra a cada promotor una comisión por entrada vendida. La calcula `calcOrderAmounts` (`teatralia/services/api/src/orders/pricing.ts`), código heredado que «funciona y nadie ha tocado desde la v1», con cinco tests que no prueban la parte delicada: el redondeo por entrada. En este lab pides a Copilot una batería de tests de la comisión y la revisas valor a valor contra la regla de negocio, no contra el código. Después rompes el código a propósito para saber si tus tests sirven de algo.

### Objetivo

Comprender qué es un test unitario que comprueba la regla de negocio y no el código: cómo se genera con Copilot, cómo debe ser su valor esperado, cómo se detecta un test que solo copia la implementación y cómo se mejora la batería rompiendo el código a propósito.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio.
- Teatralia en su estado inicial:

```bash
# Descarta tus cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- Vista **Chat** de Copilot abierta (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>). El selector de **modo** está bajo la caja de texto.
- No hace falta `make up`: solo ejecutas tests.

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Liquidaciones paga cada mes a los promotores lo vendido menos la comisión de Teatralia, sumando la comisión **de cada entrada** | `commission_cents` de cada línea de `calcOrderAmounts` y su suma en el pedido |
| El contrato fija la comisión en puntos básicos: 750 = 7,5 % | `commission_bps` del evento |
| Las invitaciones (precio 0) no pagan gastos ni comisión | La rama `p == 0` del código |
| El comprador no paga la comisión: la paga el promotor | `total_cents` = precio + gastos |

La regla está repartida entre el `README.md` de Teatralia («`commission_bps`: 750 = 7,5 %») y un comentario del código («redondeo por entrada, lo pide liquidaciones»). Si pides «genera tests para esta función» sin decir la regla, Copilot calcula el valor esperado leyendo el código, y un test así aprueba también los fallos del código.

### 1 — Lee la regla en su fuente

Antes de pedir nada, localiza dónde está escrita la regla que vas a probar. Es lo que le darás a Copilot y lo que usarás para revisar su respuesta.

```bash
cd teatralia
# Lo que dice el README sobre importes y comisión
grep -n -A3 "## Importes" README.md
# Los comentarios de la regla en el código
grep -n "//" services/api/src/orders/pricing.ts
```

**Resultado esperado:**

```text
49:## Importes
50-
51-Todos los importes son enteros en **céntimos** (`price_cents`, `total_cents`…). La comisión de la plataforma
52-se expresa en puntos básicos (`commission_bps`: 750 = 7,5 %).
1:// Cálculo de importes de un pedido.
2:// Heredado del primer equipo de Teatralia. Funciona; nadie lo ha tocado desde la v1.
6:  ref: string; // id de butaca o de tipo de pase
38:    // gastos: por entrada, salvo invitaciones (precio 0) que no pagan gastos
43:    // comisión de plataforma: bps sobre el precio, redondeo por entrada (lo pide liquidaciones)
52:  // máximo 10 entradas por pedido (antirreventa)
```

Tres frases de negocio: importes en céntimos, comisión en puntos básicos y redondeo por entrada; invitaciones sin gastos ni comisión; máximo 10 entradas. Con dos entradas de 35,50 €, la regla da 266 + 266 = 532 céntimos (3550 × 7,5 % = 266,25 → 266 por entrada). Calculada sobre el total serían 533.

### 2 — Mira qué cubren los tests que ya hay

Los tests actuales están en `services/api/test/pricing.test.ts`. Ejecútalos con el nombre de cada caso.

```bash
# Los cinco tests de partida del cálculo de importes
npx vitest run services/api/test/pricing.test.ts --reporter=verbose
```

**Resultado esperado:**

```text
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > suma precio y gastos de gestión por entrada 2ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > calcula la comisión de plataforma 0ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > las invitaciones no pagan gastos ni comisión 0ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > rechaza más de 10 entradas 1ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > rechaza un pedido vacío 0ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Solo un test mira la comisión, con una entrada de 60,00 € (7,5 % = 450, exacto). Nada comprueba qué pasa cuando el 7,5 % tiene decimales ni con varias entradas.

### 3 — Pide los tests a Copilot dándole la regla

Abre una conversación nueva (**+** en la vista Chat), elige el modo **Agent** y adjunta el fichero con **Add Context…** o escribiendo `#file:` en la caja. Pega este prompt:

```text
#file:teatralia/services/api/src/orders/pricing.ts

Crea teatralia/services/api/test/comision.test.ts con tests de vitest para la comisión
de calcOrderAmounts. Los valores esperados tienen que salir de esta regla de negocio,
calculados a mano y escritos como números en el test, NO de repetir la fórmula del código:

- comisión = commission_bps sobre el precio de CADA entrada, redondeada al céntimo por entrada
  (medio céntimo hacia arriba); la comisión del pedido es la suma de las de sus líneas
- las invitaciones (precio 0) no pagan gastos ni comisión, aunque vayan con otras entradas
- la comisión la paga el promotor: no cambia total_cents
- usa commission_bps del evento, no un 7,5 % fijo
- máximo 10 entradas por pedido; un precio negativo es un error

Incluye el caso de dos butacas de 3550 con commission_bps 750 y precios cuyo 7,5 %
acabe en ,25 ,5 y ,75 céntimos. Pon junto a cada valor esperado un comentario con la cuenta.
No modifiques pricing.ts. Ejecuta los tests al terminar.
```

**Qué debe contener la respuesta** (el texto y el número de tests varían en cada ejecución):

- un fichero nuevo `services/api/test/comision.test.ts` y ningún cambio en `src/`;
- un caso de dos butacas de 3550 que espera **532** en `commission_cents` (y 266 en cada línea);
- valores esperados escritos como números (`137`, `450`…), con su cuenta en un comentario;
- una petición de permiso para ejecutar `npx vitest run …` en la terminal: acéptala con **Continue**.

Cuando termine, comprueba qué ha tocado:

```bash
# Ficheros cambiados o nuevos en teatralia/: solo debe aparecer el test
git status --short .
```

**Resultado esperado:**

```text
?? services/api/test/comision.test.ts
```

Si aparece `M services/api/src/orders/pricing.ts`, pulsa **Undo** en el chat: el código no se toca en este lab.

### 4 — Revisa cada valor esperado contra la regla

Abre `comision.test.ts` y, para cada `expect`, haz la cuenta tú con la regla. Lo que buscas son valores esperados que salgan del código y no de la regla.

```bash
# Valores esperados del test, uno por línea
grep -n "toBe\|toEqual\|\[1[0-9]\{3\}" services/api/test/comision.test.ts
```

**Resultado esperado** (con la solución de referencia de abajo; con la de Copilot cambian líneas y casos):

```text
15:    expect(r.lines.map((l) => l.commission_cents)).toEqual([266, 266]);
16:    expect(r.commission_cents).toBe(532); // sobre el total (7100) saldrían 533
20:    [1820, 137], // 136,5 → medio céntimo: sube
21:    [1830, 137], // 137,25 → baja
22:    [1810, 136], // 135,75 → sube
25:    expect(calcOrderAmounts([butaca('A-1', precio)], faro).commission_cents).toBe(esperada);
30:    expect(r.total_cents).toBe(3550 + 90);
35:    expect(r.lines[1]).toEqual({ price_cents: 0, fee_cents: 0, commission_cents: 0 });
36:    expect(r.fee_cents).toBe(90);
37:    expect(r.commission_cents).toBe(266);
42:    expect(r.commission_cents).toBe(100);
```

Cómo se lee cada caso:

| Señal en el test | Qué significa | Qué haces |
|------------------|---------------|-----------|
| `toBe(532)` con un comentario de la cuenta | Valor de la regla | Lo das por bueno si tu cuenta coincide |
| `toBe(Math.round(7100 * 750 / 10000))` | El test repite la fórmula del código | Lo cambias por el número de la regla |
| `toBe(533)` en el caso de dos butacas | El test copia el redondeo sobre el total | Es un error del test: la regla dice 532 |
| Ningún caso con decimales en la comisión | La batería no prueba el redondeo | Pides los casos que faltan |

<details>
<summary>Solución de referencia: <code>services/api/test/comision.test.ts</code></summary>

```ts
import { describe, expect, it } from 'vitest';
import { calcOrderAmounts, type PricedItem } from '../src/orders/pricing.js';

// Regla de negocio (README de Teatralia y liquidaciones):
// - comisión = commission_bps sobre el precio de CADA entrada, redondeada al céntimo por entrada;
//   la del pedido es la suma de las de sus líneas
// - gastos de gestión por entrada; las invitaciones (precio 0) no pagan gastos ni comisión
// - la comisión la paga el promotor: no cambia lo que paga el comprador
const faro = { fee_cents: 90, commission_bps: 750 };
const butaca = (ref: string, price_cents: number): PricedItem => ({ kind: 'seat', ref, price_cents });

describe('comisión de plataforma', () => {
  it('redondea por entrada y suma las líneas (2 × 35,50 € → 266 + 266)', () => {
    const r = calcOrderAmounts([butaca('F-12', 3550), butaca('F-13', 3550)], faro);
    expect(r.lines.map((l) => l.commission_cents)).toEqual([266, 266]);
    expect(r.commission_cents).toBe(532); // sobre el total (7100) saldrían 533
  });

  it.each([
    [1820, 137], // 136,5 → medio céntimo: sube
    [1830, 137], // 137,25 → baja
    [1810, 136], // 135,75 → sube
    [6000, 450], // exacto
  ])('una entrada de %i céntimos lleva %i de comisión', (precio, esperada) => {
    expect(calcOrderAmounts([butaca('A-1', precio)], faro).commission_cents).toBe(esperada);
  });

  it('la comisión no se suma a lo que paga el comprador', () => {
    const r = calcOrderAmounts([butaca('F-12', 3550)], faro);
    expect(r.total_cents).toBe(3550 + 90);
  });

  it('una invitación dentro de un pedido no paga gastos ni comisión', () => {
    const r = calcOrderAmounts([butaca('F-12', 3550), butaca('F-14', 0)], faro);
    expect(r.lines[1]).toEqual({ price_cents: 0, fee_cents: 0, commission_cents: 0 });
    expect(r.fee_cents).toBe(90);
    expect(r.commission_cents).toBe(266);
  });

  it('usa la comisión del evento, no un 7,5 % fijo', () => {
    const r = calcOrderAmounts([butaca('A-1', 2000)], { fee_cents: 0, commission_bps: 500 });
    expect(r.commission_cents).toBe(100);
  });

  it('acepta exactamente 10 entradas', () => {
    const diez = Array.from({ length: 10 }, (_, i) => butaca(`A-${i + 1}`, 2500));
    expect(calcOrderAmounts(diez, faro).lines).toHaveLength(10);
  });

  it('rechaza un precio negativo', () => {
    expect(() => calcOrderAmounts([butaca('A-1', -100)], faro)).toThrow('precio negativo');
  });
});
```

</details>

### 5 — Ejecuta la batería

Con los valores revisados, ejecuta el fichero.

```bash
# Tus tests de la comisión, con el nombre de cada caso
npx vitest run services/api/test/comision.test.ts --reporter=verbose
```

**Resultado esperado** (con la solución de referencia):

```text
 ✓ |api| test/comision.test.ts > comisión de plataforma > redondea por entrada y suma las líneas (2 × 35,50 € → 266 + 266) 2ms
 ✓ |api| test/comision.test.ts > comisión de plataforma > una entrada de 1820 céntimos lleva 137 de comisión 0ms
 ✓ |api| test/comision.test.ts > comisión de plataforma > una entrada de 1830 céntimos lleva 137 de comisión 0ms
 ✓ |api| test/comision.test.ts > comisión de plataforma > una entrada de 1810 céntimos lleva 136 de comisión 0ms
 ✓ |api| test/comision.test.ts > comisión de plataforma > una entrada de 6000 céntimos lleva 450 de comisión 0ms
 ✓ |api| test/comision.test.ts > comisión de plataforma > la comisión no se suma a lo que paga el comprador 0ms
 ✓ |api| test/comision.test.ts > comisión de plataforma > una invitación dentro de un pedido no paga gastos ni comisión 0ms
 ✓ |api| test/comision.test.ts > comisión de plataforma > usa la comisión del evento, no un 7,5 % fijo 0ms
 ✓ |api| test/comision.test.ts > comisión de plataforma > acepta exactamente 10 entradas 1ms
 ✓ |api| test/comision.test.ts > comisión de plataforma > rechaza un precio negativo 1ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

Todo en verde con el código de partida, que en esto cumple la regla. Un verde así todavía no demuestra nada: el paso siguiente comprueba si estos tests se pondrían en rojo con un código equivocado.

### 6 — Rompe el código a propósito: comisión sobre el total

Simula el refactor que más se repite en esta función: calcular la comisión del pedido de una vez sobre el subtotal. Añade una línea justo antes del `return` de `calcOrderAmounts` y ejecuta los tests de partida y los tuyos.

```bash
# Inserta la comisión sobre el total delante de «const total = sub + fees;»
sed -i 's|^  const total = sub + fees;|  const total = sub + fees;\n  com = Math.round((sub * ev.commission_bps) / 10000);|' services/api/src/orders/pricing.ts
git diff --stat
# Los tests de partida y los tuyos
npx vitest run services/api/test/pricing.test.ts services/api/test/comision.test.ts
```

**Resultado esperado** (líneas clave):

```text
 services/api/src/orders/pricing.ts | 1 +
 1 file changed, 1 insertion(+)
     × redondea por entrada y suma las líneas (2 × 35,50 € → 266 + 266) 6ms
 FAIL  |api| test/comision.test.ts > comisión de plataforma > redondea por entrada y suma las líneas (2 × 35,50 € → 266 + 266)
AssertionError: expected 533 to be 532 // Object.is equality
      Tests  1 failed | 14 passed (15)
```

Los cinco tests de partida siguen en verde; el tuyo de dos butacas se pone en rojo con el número exacto de la regla. Esa es la diferencia entre tener tests y tener red.

### 7 — Rómpelo de otra forma: truncar en vez de redondear

Deshaz el cambio anterior y prueba otro error típico: `Math.floor` en lugar de `Math.round` (truncar el medio céntimo).

```bash
# Vuelve pricing.ts a su estado de partida
git checkout services/api/src/orders/pricing.ts
# Trunca la comisión de cada entrada
sed -i 's/    c = Math.round(c);/    c = Math.floor(c);/' services/api/src/orders/pricing.ts
npx vitest run services/api/test/comision.test.ts
```

**Resultado esperado** (líneas clave):

```text
     × una entrada de 1820 céntimos lleva 137 de comisión 4ms
     × una entrada de 1810 céntimos lleva 136 de comisión 0ms
AssertionError: expected 136 to be 137 // Object.is equality
AssertionError: expected 135 to be 136 // Object.is equality
      Tests  2 failed | 8 passed (10)
```

Solo fallan los precios cuyo 7,5 % acaba en ,5 o ,75: con ,25 truncar y redondear coinciden (137,25 → 137 de las dos formas). Por eso pedías precios con los tres finales. Al terminar, deja el código como estaba:

```bash
# pricing.ts vuelve a su estado de partida; tu test se queda
git checkout services/api/src/orders/pricing.ts
```

## Comprueba tu entendimiento

**El test que aprueba un fallo**
Cambia en tu test el `532` del caso de dos butacas por `533` y ejecuta `npx vitest run services/api/test/comision.test.ts`.
→ `AssertionError: expected 532 to be 533` y `Tests  1 failed | 9 passed (10)`: ese caso falla con el código correcto. Un valor esperado copiado del redondeo sobre el total convierte el test en un detector del código bueno. Vuelve a poner `532`.

**El origen de cada número**
Elige tres `expect` de tu fichero y rehaz la cuenta a mano con la regla del paso 1.
→ Cada número coincide con tu cuenta y ninguno se calcula con `Math.round(...)` dentro del test.

## Experimenta

Antes de ejecutar, **predice** cuántos tests de tu fichero fallarán si cambias en `pricing.ts` la condición de los gastos `if (p > 0)` por `if (p >= 0)` (las invitaciones pagarían 0,90 €).

```bash
# Las invitaciones pasan a pagar gastos
sed -i 's/^    if (p > 0) {/    if (p >= 0) {/' services/api/src/orders/pricing.ts
npx vitest run services/api/test/comision.test.ts
git checkout services/api/src/orders/pricing.ts
```

Con la solución de referencia falla uno:

```text
     × una invitación dentro de un pedido no paga gastos ni comisión 5ms
AssertionError: expected { Object (price_cents, fee_cents, ...) } to deeply equal { Object (price_cents, fee_cents, ...) }
      Tests  1 failed | 9 passed (10)
```

Es el único caso con una entrada de precio 0. Si tu batería no tiene ese caso, ninguno falla: ese hueco es lo que estás buscando.

## Mejora

La regla «máximo 10 entradas» tiene dos lados: 10 se acepta y 11 se rechaza. Comprueba si tu batería tiene los dos bordes y, si falta alguno, pídeselo a Copilot en el mismo chat:

```text
Añade a comision.test.ts el borde del máximo de entradas: un pedido de 10 se acepta y uno
de 11 lanza «máximo 10 entradas por pedido». No toques pricing.ts.
```

Después pruébalo rompiendo el borde:

```bash
# El límite pasa a 9 entradas: el caso de 10 debe ponerse en rojo
sed -i 's/if (lines.length > 10)/if (lines.length > 9)/' services/api/src/orders/pricing.ts
npx vitest run services/api/test/comision.test.ts
git checkout services/api/src/orders/pricing.ts
```

Con la solución de referencia:

```text
     × acepta exactamente 10 entradas 3ms
Error: máximo 10 entradas por pedido
      Tests  1 failed | 9 passed (10)
```

El test del borde atrapa un límite que se mueve un solo número.

## Reto

### 1 — El cambio que ningún test atrapa

**La situación:** en la revisión de una pull request, un compañero quita de `calcOrderAmounts` la línea `if (p == 0) c = 0;` («sobra, ya se calcula la comisión»). Toda la suite sigue en verde y pide aprobar.

**Qué haces:** aplica ese cambio, ejecuta tus tests y los de partida, y decide si el verde es un hueco de la red o si el cambio no altera el comportamiento. Pídele a Copilot (modo **Ask**, con `#file:` de `pricing.ts`) que lo razone y compruébalo tú con un caso.

```bash
# Quita la línea de la comisión de las invitaciones
sed -i '/    if (p == 0) c = 0;/d' services/api/src/orders/pricing.ts
npx vitest run services/api/test/comision.test.ts services/api/test/pricing.test.ts
```

**Pistas:** mira qué vale `Math.round((0 * ev.commission_bps) / 10000)`. Un cambio que no altera ningún resultado posible no se puede atrapar con un test, y no hace falta.

**Lo que buscas:** distinguir un hueco de la red (un cambio de comportamiento que ningún test ve) de un cambio equivalente (mismo resultado para todas las entradas).

<details>
<summary>Ver solución</summary>

```text
      Tests  15 passed (15)
```

Todo en verde, y está bien: con precio 0, `0 × 750 / 10000 = 0` y `Math.round(0) = 0`. La línea quitada no cambia ningún resultado; es un cambio **equivalente**, no un hueco. Compáralo con el `if (p > 0)` de los gastos: quitarlo sí cambia el resultado (0,90 € a una invitación) y tu test lo atrapa. En una revisión real, el verde de este cambio se acepta; el de los gastos, no. Deja el código como estaba con `git checkout services/api/src/orders/pricing.ts`.

**La regla:** cuando un cambio deja la suite en verde, pregunta si cambia algún resultado posible. Si lo cambia, falta un test; si no, el verde es legítimo.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| Copilot modifica `pricing.ts` además de crear el test | El modo Agent «arregla» lo que cree mal | Pulsa **Undo** en ese fichero y repite el prompt con «No modifiques pricing.ts» |
| El test espera `533` en dos butacas de 3550 | Copilot calculó el esperado con la fórmula sobre el total | Corrige a `532` y pide que escriba la cuenta en un comentario |
| `Cannot find module '../src/orders/pricing.js'` | El test se creó en otra carpeta | El fichero va en `teatralia/services/api/test/` |
| `No test files found` | Ejecutas `npx vitest` fuera de `teatralia/` | `cd teatralia` antes de lanzar los tests |
| Después del paso 7 fallan tests que antes pasaban | `pricing.ts` sigue con el cambio a propósito | `git checkout services/api/src/orders/pricing.ts` |

## Conclusiones

### Qué es un test de la regla

Un test unitario aísla una función (`calcOrderAmounts`) y compara lo que devuelve con un **valor esperado**. Lo que lo convierte en red es el origen de ese valor: si sale de la regla de negocio (266 + 266 = 532), el test distingue el código bueno del malo; si sale de leer el código (`Math.round(7100 × 0,075) = 533`), el test solo confirma lo que el código ya hace.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| El valor esperado es un número calculado con la regla | `532`, `137`, `450`, con la cuenta en un comentario |
| Cubre los casos donde la regla se nota | Dos entradas con decimales; finales ,25, ,5 y ,75 |
| Cubre los bordes | 10 entradas se aceptan; precio negativo da error |
| Cubre las excepciones del negocio | Invitación dentro de un pedido |
| No toca el código que prueba | `git status` solo muestra `comision.test.ts` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Test que copia la fórmula del código | Un `Math.round(...)` o un `533` en el fichero | Aprueba el fallo y suspende el arreglo |
| Batería sin decimales | Con la red de partida, el refactor del total pasa en verde | Un céntimo por pedido en liquidaciones |
| Casos que no separan truncar de redondear | Con 1830 (,25) `Math.floor` y `Math.round` coinciden | El error de truncado pasa desapercibido |
| Verde por un cambio equivalente | El reto: quitar `if (p == 0) c = 0` no cambia nada | Ninguno; hay que saber distinguirlo |

### Cómo se perfecciona

- Dar a Copilot la regla escrita en el prompt (o en las instrucciones del repositorio) y pedir valores numéricos con su cuenta.
- Romper el código a propósito antes de aceptar la batería: cada test tiene que poder fallar por algo concreto. Las herramientas de pruebas de mutación (Stryker, por ejemplo) automatizan esa comprobación.
- Escribir la regla en un sitio estable (`docs/`), para que el test cite la misma fuente que la usuaria de liquidaciones.

### En una frase

> 🔑 Un test vale lo que vale su valor esperado: si sale de la regla, protege; si sale del código, solo lo fotografía.
