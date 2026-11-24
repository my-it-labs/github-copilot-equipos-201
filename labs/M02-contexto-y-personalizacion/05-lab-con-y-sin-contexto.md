# Laboratorio: con y sin contexto

[← Página anterior](04-lab-codebase-frente-a-file.md) · [Siguiente página →](06-lab-documentacion-fuente-de-verdad.md)

«Con contexto sale mejor» es fácil de decir y difícil de demostrar: a ojo, dos funciones generadas parecen igual de
razonables. En este laboratorio lo **mides**. Los promotores han pedido códigos de descuento (issue `TEA-104`), y la
primera pieza es calcular el total de un pedido con un descuento aplicado. Escribes primero los criterios como tests,
pides la función a Copilot en un chat limpio, la pides otra vez con el issue y el cálculo de precios como contexto, y
cuentas cuántos criterios cumple cada versión.

### Objetivo

Comprender cómo se mide el efecto del contexto: qué cambia en el resultado cuando Copilot tiene las reglas, cómo se
convierte esa diferencia en un número, dónde no llega el contexto y cómo se completa.

### Punto de partida

- Terminal en la raíz del repositorio y Teatralia en su estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- **Sin** instrucciones del repositorio, para que el primer intento sea de verdad sin contexto. Si tienes
  `.github/copilot-instructions.md` de otro laboratorio, apártalo:

```bash
# Sin salida: no hay instrucciones. Si aparece la ruta, muévela fuera con el segundo comando
ls .github/copilot-instructions.md 2>/dev/null
mkdir -p ~/aparte && mv .github/copilot-instructions.md ~/aparte/ 2>/dev/null; true
```

- No hace falta `make up`: todo se comprueba con tests.

### Qué está pasando

| En el equipo | En este laboratorio |
|--------------|---------------------|
| La petición de negocio | `teatralia/docs/backlog/TEA-104-codigos-de-descuento.md` |
| Lo que ya hace el sistema con los importes | `services/api/src/orders/pricing.ts` (gastos por entrada, céntimos) |
| Los criterios de aceptación | `services/api/test/descuento.test.ts`, cinco tests |
| «¿Ha servido el contexto?» | Tests en verde sin contexto frente a tests en verde con contexto |

### 1 — Lee la petición en crudo

Lo primero es lo que el promotor ha pedido, tal cual:

```bash
# El issue de códigos de descuento
cat teatralia/docs/backlog/TEA-104-codigos-de-descuento.md
```

**Resultado esperado:**

```text
---
titulo: "Códigos de descuento por promotor"
etiquetas: [petición de negocio, api, backoffice]
---
Los promotores quieren crear códigos de descuento (porcentaje o importe fijo) desde el backoffice, con fecha de caducidad
y número máximo de usos. El comprador lo introduce al pagar.
- Un código es de un promotor y puede limitarse a un evento.
- No se acumulan dos códigos en el mismo pedido.
- El descuento no se aplica a los gastos de gestión.
```

**Cómo se lee:** la regla que afecta al cálculo es la última: **los gastos de gestión no se descuentan**. El issue no
dice cómo se redondea un porcentaje ni qué pasa si el descuento es mayor que el precio; eso lo ha decidido el equipo
y está en los tests del paso siguiente.

### 2 — Escribe los criterios como tests

Los criterios son la vara de medir: la misma para las dos versiones. Creas el test con los datos de Teatralia (las
butacas de platea de *Jazz en el Faro* cuestan 35,50 € con 0,90 € de gastos).

```bash
# Desde la raíz: test con los cinco criterios del total con descuento
cat > teatralia/services/api/test/descuento.test.ts <<'EOF'
// Criterios del total con descuento (TEA-104). Los importes, en céntimos.
import { describe, expect, it } from 'vitest';
import { totalConDescuento } from '../src/orders/descuento.js';

// Dos butacas de platea de Jazz en el Faro (35,50 € + 0,90 € de gastos cada una)
const dosPlatea = [
  { price_cents: 3550, fee_cents: 90 },
  { price_cents: 3550, fee_cents: 90 },
];
// Tres entradas de 18,25 € con 0,90 € de gastos
const tresEntradas = [1, 2, 3].map(() => ({ price_cents: 1825, fee_cents: 90 }));

describe('totalConDescuento', () => {
  it('el porcentaje no se aplica a los gastos de gestión', () => {
    expect(totalConDescuento(dosPlatea, { tipo: 'porcentaje', valor: 10 })).toBe(6570);
  });
  it('un importe fijo se resta del precio de las entradas', () => {
    expect(totalConDescuento(dosPlatea, { tipo: 'importe', valor: 500 })).toBe(6780);
  });
  it('el descuento no deja las entradas por debajo de 0, los gastos se pagan', () => {
    expect(totalConDescuento(dosPlatea, { tipo: 'importe', valor: 10000 })).toBe(180);
  });
  it('el descuento se redondea al céntimo', () => {
    expect(totalConDescuento(tresEntradas, { tipo: 'porcentaje', valor: 15 })).toBe(4924);
  });
  it('el total es un número entero de céntimos', () => {
    expect(Number.isInteger(totalConDescuento(tresEntradas, { tipo: 'porcentaje', valor: 15 }))).toBe(true);
  });
});
EOF
grep -c "it('" teatralia/services/api/test/descuento.test.ts
```

**Resultado esperado:**

```text
5
```

**Cómo se lee:** cinco criterios. Las cuentas: 7100 − 10 % = 6390, más 180 de gastos = 6570; 5475 × 15 % = 821,25 →
821, y 5475 − 821 + 270 = 4924.

### 3 — Primer intento: chat limpio, sin contexto

Pides la función dando solo la firma, que es lo mínimo para que el test la pueda llamar.

1. Vista **Chat** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>), conversación nueva con **+**, modo **Edit**.
2. Cierra las pestañas abiertas del editor, para que no entren como contexto.
3. Envía:

```text
Crea teatralia/services/api/src/orders/descuento.ts con una función exportada
totalConDescuento(lineas, descuento) que devuelva el total de un pedido de entradas con un código
de descuento aplicado. lineas es un array de { price_cents: number; fee_cents: number } y
descuento es { tipo: 'porcentaje' | 'importe'; valor: number } (el importe, en céntimos).
```

4. Pulsa **Keep** y guarda una copia de esta versión para compararla después:

```bash
# Copia del primer intento, fuera de teatralia/ para que make reset no la borre
cp teatralia/services/api/src/orders/descuento.ts ~/descuento-sin-contexto.ts
```

**Qué debe contener la respuesta** (varía en cada ejecución): una función que suma lo que recibe y aplica el
descuento. Sin contexto no hay nada que le diga que los gastos se excluyen, así que es habitual que sume
`price_cents + fee_cents` y descuente sobre ese total, y que el porcentaje no se redondee.

### 4 — Mide el primer intento

```bash
# Desde teatralia/: los cinco criterios contra el primer intento
cd teatralia
npx vitest run services/api/test/descuento.test.ts --reporter=verbose 2>&1 | grep -E "✓|×|AssertionError|Tests "
```

**Resultado esperado** (depende de lo que haya generado Copilot). Esta es la salida real con una versión que aplica
el descuento sobre el total con gastos, el error más habitual:

```text
 × |api| test/descuento.test.ts > totalConDescuento > el porcentaje no se aplica a los gastos de gestión 6ms
 ✓ |api| test/descuento.test.ts > totalConDescuento > un importe fijo se resta del precio de las entradas 1ms
 × |api| test/descuento.test.ts > totalConDescuento > el descuento no deja las entradas por debajo de 0, los gastos se pagan 1ms
 × |api| test/descuento.test.ts > totalConDescuento > el descuento se redondea al céntimo 1ms
 × |api| test/descuento.test.ts > totalConDescuento > el total es un número entero de céntimos 1ms
AssertionError: expected 6552 to be 6570 // Object.is equality
AssertionError: expected +0 to be 180 // Object.is equality
AssertionError: expected 4883.25 to be 4924 // Object.is equality
AssertionError: expected false to be true // Object.is equality
      Tests  4 failed | 1 passed (5)
```

**Cómo se lee:**

| Valor recibido | Qué ha hecho la función | Qué cuesta en Teatralia |
|----------------|-------------------------|-------------------------|
| 6552 en vez de 6570 | Descontar también los 1,80 € de gastos | El promotor regala sus gastos de gestión |
| 0 en vez de 180 | Un vale grande deja el pedido gratis, gastos incluidos | Pedidos de 0 € que sí tienen coste |
| 4883.25 | Porcentaje sin redondear, con decimales | La pasarela rechaza un importe que no es entero |

<details>
<summary>La versión que produce esa salida</summary>

```typescript
// Aplica el descuento sobre el total (con gastos). NO es la regla de Teatralia.
export interface Linea { price_cents: number; fee_cents: number }
export type Descuento = { tipo: 'porcentaje' | 'importe'; valor: number };

export function totalConDescuento(lineas: Linea[], descuento: Descuento): number {
  const total = lineas.reduce((s, l) => s + l.price_cents + l.fee_cents, 0);
  if (descuento.tipo === 'porcentaje') return total * (1 - descuento.valor / 100);
  return Math.max(0, total - descuento.valor);
}
```

</details>

### 5 — Segundo intento: el mismo prompt con contexto

Repites la petición, palabra por palabra, añadiendo el issue y el cálculo de precios que ya existe.

1. Conversación nueva con **+**, modo **Edit**.
2. Envía:

```text
#file:teatralia/docs/backlog/TEA-104-codigos-de-descuento.md #file:teatralia/services/api/src/orders/pricing.ts
Crea teatralia/services/api/src/orders/descuento.ts con una función exportada
totalConDescuento(lineas, descuento) que devuelva el total de un pedido de entradas con un código
de descuento aplicado. lineas es un array de { price_cents: number; fee_cents: number } y
descuento es { tipo: 'porcentaje' | 'importe'; valor: number } (el importe, en céntimos).
```

3. Pulsa **Keep** (sustituye al primer intento) y mide:

```bash
# Mismos criterios, segundo intento
npx vitest run services/api/test/descuento.test.ts --reporter=verbose 2>&1 | grep -E "✓|×|AssertionError|Tests "
```

**Qué debe contener la respuesta:** la suma de precios separada de la de gastos y el descuento aplicado solo a los
precios (lo dice `TEA-104`), en céntimos enteros (lo hace `pricing.ts` con `Math.round`). Lo habitual es que pasen los
criterios de gastos; el de redondeo y el del descuento mayor que el precio dependen de lo que el modelo decida, porque
**ninguno de los dos ficheros lo dice**.

**Resultado esperado con la solución de referencia** (tu número puede ser menor; ese número es el dato del lab):

```text
 ✓ |api| test/descuento.test.ts > totalConDescuento > el porcentaje no se aplica a los gastos de gestión 1ms
 ✓ |api| test/descuento.test.ts > totalConDescuento > un importe fijo se resta del precio de las entradas 0ms
 ✓ |api| test/descuento.test.ts > totalConDescuento > el descuento no deja las entradas por debajo de 0, los gastos se pagan 0ms
 ✓ |api| test/descuento.test.ts > totalConDescuento > el descuento se redondea al céntimo 0ms
 ✓ |api| test/descuento.test.ts > totalConDescuento > el total es un número entero de céntimos 0ms
      Tests  5 passed (5)
```

<details>
<summary>Solución de referencia (<code>services/api/src/orders/descuento.ts</code>)</summary>

```typescript
// Total de un pedido con un código de descuento (TEA-104). Importes en céntimos.
export interface Linea {
  price_cents: number;
  fee_cents: number;
}

export type Descuento = { tipo: 'porcentaje' | 'importe'; valor: number };

export function totalConDescuento(lineas: Linea[], descuento: Descuento): number {
  const subtotal = lineas.reduce((s, l) => s + l.price_cents, 0);
  const gastos = lineas.reduce((s, l) => s + l.fee_cents, 0);
  // el descuento solo se aplica al precio de las entradas, nunca a los gastos de gestión
  let rebaja =
    descuento.tipo === 'porcentaje'
      ? Math.round((subtotal * descuento.valor) / 100) // redondeo al céntimo sobre el total, no por entrada
      : descuento.valor;
  rebaja = Math.min(Math.max(rebaja, 0), subtotal); // ni negativo ni mayor que el precio de las entradas
  return subtotal - rebaja + gastos;
}
```

</details>

### 6 — Compara las dos versiones

El último paso es ver **dónde** está la diferencia en el código, no solo en el contador de tests.

```bash
# Primer intento frente a segundo intento
git diff --no-index ~/descuento-sin-contexto.ts services/api/src/orders/descuento.ts
```

**Qué mirar en el diff:** la línea que suma (`price_cents + fee_cents` frente a dos sumas separadas), la operación
del porcentaje (con o sin `Math.round`) y si hay un límite (`Math.min`, `Math.max`) para el importe fijo. Cada una de
esas líneas corresponde a uno de los tests que cambiaron de rojo a verde.

## Comprueba tu entendimiento

**La medida es la misma para los dos**
Vuelve a poner el primer intento y ejecuta el test.
`cp ~/descuento-sin-contexto.ts services/api/src/orders/descuento.ts && npx vitest run services/api/test/descuento.test.ts 2>&1 | grep "Tests "`
→ El mismo número de fallos que en el paso 4: el test no ha cambiado, solo la función.

**El contexto no inventa reglas**
Pregunta en modo **Ask**, con `#file:teatralia/docs/backlog/TEA-104-codigos-de-descuento.md`: «¿Cómo se redondea un descuento del 15 %?».
→ Una buena respuesta dice que el issue no lo especifica.

## Investiga

¿Qué otra regla de `TEA-104` afecta al total y no está en los tests? Lee el issue otra vez: «No se acumulan dos códigos
en el mismo pedido». Pregunta a Copilot, con el issue adjunto, cómo cambiaría la firma de `totalConDescuento` para
garantizarlo, y decide si es un criterio de esta función o de quien la llama.

## Experimenta

Predice: si el contexto incluye la regla de redondeo, ¿pasará el test de redondeo también sin adjuntar `pricing.ts`?

1. Crea `.github/copilot-instructions.md` con una sola línea:

```bash
# Desde la raíz: una regla de importes para todo el repositorio
mkdir -p .github
echo "- Descuentos: se aplican solo al precio de las entradas (nunca a los gastos), se redondean al céntimo sobre el total con Math.round y nunca superan el precio de las entradas." > .github/copilot-instructions.md
```

2. Repite el prompt del paso 3 (sin `#file`) en una conversación nueva, **Keep** y ejecuta el test.

Con la regla escrita en las instrucciones, los cinco criterios dejan de depender de que el modelo acierte. Al terminar,
borra la línea o el fichero si no lo quieres para otros laboratorios.

## Reto

### 1 — Medir un descuento por entrada

**La situación:** liquidaciones propone que el porcentaje se redondee **por entrada** (como la comisión de
`pricing.ts`) y no sobre el total, para que cada entrada tenga su precio final exacto. Con tres entradas de 18,25 €
y un 15 %, ¿cambia el total?

**Qué haces:** añade un test con la regla de liquidaciones y cambia la función para cumplirla. Usa a Copilot (con el
test y `pricing.ts` como contexto) o escríbelo a mano, y ejecuta el fichero de tests completo.

**Pistas:** 1825 × 15 % = 273,75; con `Math.round` por entrada son 274 por entrada. Compara 3 × 274 con
`Math.round(5475 × 15 %)`.

**Lo que buscas:** el número de céntimos de diferencia entre las dos reglas y qué test anterior se pone en rojo.

<details>
<summary>Ver solución</summary>

Las dos cuentas:

```bash
# Redondeo sobre el total frente a redondeo por entrada (3 × 1825, 15 %)
node -e 'console.log("total:", Math.round(5475 * 15 / 100), "por entrada:", 3 * Math.round(1825 * 15 / 100))'
```

```text
total: 821 por entrada: 822
```

Con la regla por entrada, el total de `tresEntradas` es 5475 − 822 + 270 = **4923**, un céntimo menos que 4924: el test
«el descuento se redondea al céntimo» se pone en rojo y hay que cambiar su valor esperado. Las dos reglas son
defendibles; lo que no es aceptable es que cada versión generada aplique una distinta sin que nadie lo haya decidido.
**La regla:** cuando el contexto no dice algo, Copilot lo decide por ti; un test con el número exacto convierte esa
decisión en visible y medible.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `Error: Cannot find module '../src/orders/descuento.js'` | La función aún no existe o se creó en otra ruta | Comprueba que el fichero es `teatralia/services/api/src/orders/descuento.ts` |
| `totalConDescuento is not a function` | Copilot exportó la función con otro nombre o por defecto | Pide `export function totalConDescuento` o ajusta el `import` del test |
| El primer intento ya pasa los cinco tests | Había contexto: instrucciones de otro lab o pestañas abiertas | Aparta `.github/copilot-instructions.md`, cierra pestañas y repite en una conversación nueva |
| `git diff --no-index` no muestra nada | Copiaste la versión después de sustituirla | Repite el paso 3 y haz la copia antes del paso 5 |

## Conclusiones

### Qué es medir el efecto del contexto

Comparar dos resultados del mismo prompt, con y sin contexto, contra una vara fija: los criterios escritos como tests.
El resultado es un número (tests en verde) y un diff que explica cada diferencia.

```text
mismo prompt ─┬─ sin contexto ─► descuento.ts ─► 5 tests ─► 1 de 5 (en la versión del paso 4)
              └─ con TEA-104 + pricing.ts ─► descuento.ts ─► 5 tests ─► 5 de 5 (referencia)
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Criterios escritos antes de pedir el código | `descuento.test.ts` en el paso 2 |
| El mismo prompt en los dos intentos | Solo cambian los `#file` |
| Conversación limpia en cada intento | **+** antes de cada petición |
| Medida automática, no opinión | `vitest` con `--reporter=verbose` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Sin contexto, reglas de negocio ignoradas | 6552 en lugar de 6570: gastos descontados | El promotor pierde sus gastos |
| El contexto no cubre todo | `TEA-104` no dice cómo redondear | El modelo decide en silencio |
| Dos reglas razonables distintas | Reto: 821 frente a 822 céntimos | Totales que no cuadran con liquidaciones |

### Cómo se perfecciona

Los criterios ambiguos se deciden con negocio y se escriben en dos sitios: como test (vara de medir) y como contexto
(instrucciones o el propio issue). Así el siguiente intento no depende de la suerte del modelo.

### En una frase

> 🔑 El efecto del contexto se mide con los mismos tests sobre el mismo prompt; lo que el contexto no dice, Copilot lo
> decide, y solo un test con el número exacto lo hace visible.
