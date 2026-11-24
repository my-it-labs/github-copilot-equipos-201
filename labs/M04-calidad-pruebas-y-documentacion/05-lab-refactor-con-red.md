# Laboratorio: refactorizar con red de tests

[← Página anterior](04-lab-debugging-correo-duplicado.md) · [Siguiente página →](06-lab-regresion-con-bisect.md)

`calcOrderAmounts` es el corazón del checkout de Teatralia: cada pedido pasa por ella antes de cobrarse. Es código de la v1, con `==`, variables de una letra y la validación del máximo de entradas al final del bucle. El equipo quiere dejarla legible sin que cambie **nada** de lo que calcula. Copilot hace ese refactor en segundos; lo difícil es saber si ha cambiado algo. En este lab construyes primero el juez (un test de caracterización que congela lo que la función hace hoy con 300 carritos), después pides el refactor y dejas que el juez decida.

### Objetivo

Comprender qué es un refactor seguro con red de pruebas: cómo se construye un juez que compara el comportamiento antes y después, cómo debe ser un refactor que lo pasa (mismo resultado en todos los casos, también en los errores), cómo se detecta un cambio de comportamiento escondido en un código que «parece igual» y cómo se decide cuándo un cambio es intencionado.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio.
- Teatralia en su estado inicial:

```bash
# Descarta tus cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- Función que se refactoriza: `calcOrderAmounts` en `teatralia/services/api/src/orders/pricing.ts`.
- Vista **Chat** de Copilot (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>). No hace falta `make up`.

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Un refactor no debe cambiar ni un céntimo ni un mensaje de error de ningún pedido | La salida de `calcOrderAmounts` para 300 carritos, guardada como *snapshot* |
| Los tests de negocio dicen qué debe hacer la función | `pricing.test.ts`, cinco casos |
| El test de caracterización dice qué hace hoy, con todos sus detalles | `pricing-caracterizacion.test.ts`, el juez |
| Si el juez se pone en rojo, alguien decide: ¿error del refactor o cambio querido? | Tú, con el diff del snapshot delante |

Los tests de negocio protegen lo importante, pero son pocos. Un **test de caracterización** (también llamado *golden master*) no juzga si el comportamiento es correcto: lo fotografía con muchas entradas variadas para que cualquier diferencia salte. Es justo lo que hace falta para refactorizar código heredado.

### 1 — Mira la función y su red actual

```bash
cd teatralia
# La función que vas a refactorizar
sed -n '/^export function calcOrderAmounts/,$p' services/api/src/orders/pricing.ts
```

**Resultado esperado:**

```text
export function calcOrderAmounts(items: PricedItem[], ev: EventPricing): OrderAmounts {
  let sub = 0;
  let fees = 0;
  let com = 0;
  const lines: TicketAmounts[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const p = it.price_cents;
    if (p < 0) throw new Error('precio negativo en ' + it.ref);
    // gastos: por entrada, salvo invitaciones (precio 0) que no pagan gastos
    let f = 0;
    if (p > 0) {
      f = ev.fee_cents;
    }
    // comisión de plataforma: bps sobre el precio, redondeo por entrada (lo pide liquidaciones)
    let c = (p * ev.commission_bps) / 10000;
    c = Math.round(c);
    if (p == 0) c = 0;
    sub = sub + p;
    fees = fees + f;
    com = com + c;
    lines.push({ price_cents: p, fee_cents: f, commission_cents: c });
  }
  // máximo 10 entradas por pedido (antirreventa)
  if (lines.length > 10) {
    throw new Error('máximo 10 entradas por pedido');
  }
  if (lines.length == 0) {
    throw new Error('pedido vacío');
  }
  const total = sub + fees;
  return { subtotal_cents: sub, fee_cents: fees, total_cents: total, commission_cents: com, lines: lines };
}
```

Fíjate en el orden: primero se recorre cada entrada (y un precio negativo lanza un error en ese momento), y **después** se comprueba el máximo de 10. Un carrito de 11 entradas con un precio negativo da «precio negativo», no «máximo 10». Es el tipo de detalle que un refactor cambia sin querer.

### 2 — Construye el juez: un test de caracterización

Crea `services/api/test/pricing-caracterizacion.test.ts`. Genera 300 carritos con una semilla fija (siempre los mismos), con todo lo que puede pasar: vacíos, más de 10 entradas, invitaciones, precios de los datos de ejemplo, algún precio negativo y distintos gastos y comisiones. Guarda el resultado o el mensaje de error de cada uno con `toMatchSnapshot()`.

```ts
import { expect, it } from 'vitest';
import { calcOrderAmounts, type PricedItem } from '../src/orders/pricing.js';

// Test de caracterización: congela lo que calcOrderAmounts hace HOY con 300 carritos variados
// (también los que dan error). Sirve de juez para refactorizar: el refactor no debe cambiar nada.
function rng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

it('300 carritos dan exactamente el mismo resultado', () => {
  const r = rng(2026);
  const precios = [0, 1, 1825, 2275, 2900, 3550, 6000];
  const salida = Array.from({ length: 300 }, (_, i) => {
    const n = Math.floor(r() * 13); // de 0 a 12 entradas: también vacíos y más de 10
    const items: PricedItem[] = Array.from({ length: n }, (_, j) => ({
      kind: r() < 0.5 ? 'seat' : 'pass',
      ref: `R-${i}-${j}`,
      price_cents: r() < 0.02 ? -100 : precios[Math.floor(r() * precios.length)]!, // a veces, un precio negativo
    }));
    const ev = { fee_cents: [0, 80, 90, 150][Math.floor(r() * 4)]!, commission_bps: [0, 500, 750][Math.floor(r() * 3)]! };
    try {
      return calcOrderAmounts(items, ev);
    } catch (err) {
      return { error: (err as Error).message };
    }
  });
  expect(salida).toMatchSnapshot();
});
```

> [!TIP]
> Si prefieres que lo escriba Copilot, pídeselo en modo **Agent** con estas condiciones: semilla fija, carritos de 0 a 12 entradas, errores capturados como `{ error: mensaje }` y `toMatchSnapshot()`. Compara su versión con esta antes del paso 3: sin semilla fija, cada ejecución genera carritos distintos y el juez no sirve.

```bash
# Primera ejecución: vitest guarda la foto del comportamiento actual
npx vitest run services/api/test/pricing-caracterizacion.test.ts
```

**Resultado esperado:**

```text
  Snapshots  1 written
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### 3 — Mira qué ha congelado el juez

El snapshot es un fichero de texto en `services/api/test/__snapshots__/`. Ábrelo en el editor y recorre los primeros carritos; después cuenta qué contiene.

```bash
F=services/api/test/__snapshots__/pricing-caracterizacion.test.ts.snap
# Carritos que calculan un importe
grep -c '"subtotal_cents"' $F
# Carritos que dan error, agrupados por mensaje
grep '"error"' $F | sed 's/R-[0-9-]*/R-…/' | sort | uniq -c
```

**Resultado esperado:**

```text
204
     33     "error": "máximo 10 entradas por pedido",
     23     "error": "pedido vacío",
     40     "error": "precio negativo en R-…",
```

204 carritos con importes y 96 con error (300 en total). Cada céntimo de cada línea y cada mensaje de error forma parte de la foto. El juez es tan bueno como la variedad de sus carritos: si no hubiera ninguno con más de 10 entradas y un precio negativo a la vez, el detalle del paso 1 no estaría protegido.

### 4 — Pide el refactor a Copilot

Conversación nueva en modo **Edit** (cambia ficheros, sin ejecutar comandos). Pega:

```text
#file:teatralia/services/api/src/orders/pricing.ts

Refactoriza calcOrderAmounts para que sea legible: extrae el cálculo de una entrada a una función
ticketAmounts, usa === en vez de ==, nombres claros y una constante MAX_TICKETS = 10.
No cambies la firma, los tipos exportados, los mensajes de error ni ningún resultado.
```

**Qué debe contener la respuesta** (el código varía en cada ejecución):

- una función `ticketAmounts` (o parecida) con el precio negativo, las invitaciones y la comisión redondeada por entrada;
- `calcOrderAmounts` con `map` y sumas;
- las comprobaciones de 10 entradas y de pedido vacío. **Mira dónde están**: es habitual que Copilot las suba al principio de la función («validar primero»), lo que cambia el orden respecto al paso 1.

Pulsa **Keep** para aplicar el cambio y no lo juzgues todavía a ojo: el juez es el paso siguiente.

### 5 — Deja que el juez decida

```bash
# Los tests de negocio y el de caracterización
npx vitest run services/api/test/
```

Si el refactor ha subido las validaciones al principio, el **resultado esperado** es este (líneas clave):

```text
 ❯ |api| test/pricing-caracterizacion.test.ts (1 test | 1 failed) 30ms
   × 300 carritos dan exactamente el mismo resultado 29ms
Error: Snapshot `300 carritos dan exactamente el mismo resultado 1` mismatched

@@ -466,11 +466,11 @@
    },
    {
      "error": "pedido vacío",
    },
    {
-     "error": "precio negativo en R-21-3",
+     "error": "máximo 10 entradas por pedido",
    },

  Snapshots  1 failed
 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 8 passed (9)
```

| Qué dice | Cómo se lee |
|----------|-------------|
| `Tests  1 failed | 8 passed (9)` | Los cinco tests de negocio (y los tres de QR) siguen en verde: no ven el cambio |
| `- "precio negativo en R-21-3"` / `+ "máximo 10 entradas por pedido"` | Un carrito de 11 entradas con un precio negativo cambia de mensaje de error |
| Ningún bloque con importes distintos | Los cálculos de dinero son iguales |

En total cambian 11 carritos, todos del mismo tipo. El refactor no es neutro: el comprador que mande 11 entradas con un precio corrupto verá otro mensaje. Probablemente nadie lo note, pero «no cambies ningún resultado» era la condición, y el juez lo ha visto en un caso que nadie habría probado a mano.

Si tu refactor pasa en verde a la primera, Copilot ha mantenido el orden: sigue en el paso 6 y prueba el cambio de orden en el reto.

### 6 — Corrige el refactor hasta que el juez esté en verde

Pide la corrección en el mismo chat, citando la evidencia:

```text
El test de caracterización falla: con 11 entradas y un precio negativo, antes salía
«precio negativo en …» y ahora «máximo 10 entradas por pedido». Mantén el orden original:
primero se calcula cada entrada (y salta el precio negativo), después se comprueba el máximo
y el pedido vacío. No toques el test ni el snapshot.
```

<details>
<summary>Solución de referencia (<code>pricing.ts</code>, desde la constante hasta el final)</summary>

```ts
const MAX_TICKETS = 10; // antirreventa

// Importes de una entrada. Las invitaciones (precio 0) no pagan gastos ni comisión.
// La comisión se redondea por entrada (lo pide liquidaciones).
function ticketAmounts(item: PricedItem, ev: EventPricing): TicketAmounts {
  if (item.price_cents < 0) throw new Error('precio negativo en ' + item.ref);
  if (item.price_cents === 0) return { price_cents: 0, fee_cents: 0, commission_cents: 0 };
  return {
    price_cents: item.price_cents,
    fee_cents: ev.fee_cents,
    commission_cents: Math.round((item.price_cents * ev.commission_bps) / 10000),
  };
}

const sum = (lines: TicketAmounts[], key: keyof TicketAmounts) => lines.reduce((s, l) => s + l[key], 0);

export function calcOrderAmounts(items: PricedItem[], ev: EventPricing): OrderAmounts {
  // mismo orden de validación que la v1: primero cada precio, después el número de entradas
  const lines = items.map((it) => ticketAmounts(it, ev));
  if (lines.length > MAX_TICKETS) throw new Error('máximo 10 entradas por pedido');
  if (lines.length === 0) throw new Error('pedido vacío');
  const subtotal_cents = sum(lines, 'price_cents');
  const fee_cents = sum(lines, 'fee_cents');
  return {
    subtotal_cents,
    fee_cents,
    total_cents: subtotal_cents + fee_cents,
    commission_cents: sum(lines, 'commission_cents'),
    lines,
  };
}
```

</details>

```bash
# El juez, los tests de negocio, los tipos y el lint
npx vitest run services/api/test/ --reporter=verbose
npm run typecheck -w @teatralia/api
npx eslint services/api/src/orders/pricing.ts && echo "lint sin avisos"
git diff --stat
```

**Resultado esperado:**

```text
 ✓ |api| test/qr.test.ts > QR de entrada > devuelve el id de la entrada si la firma es buena 2ms
 ✓ |api| test/qr.test.ts > QR de entrada > rechaza un token manipulado 0ms
 ✓ |api| test/qr.test.ts > QR de entrada > rechaza un token firmado con otro secreto 0ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > suma precio y gastos de gestión por entrada 2ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > calcula la comisión de plataforma 0ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > las invitaciones no pagan gastos ni comisión 0ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > rechaza más de 10 entradas 1ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > rechaza un pedido vacío 0ms
 ✓ |api| test/pricing-caracterizacion.test.ts > 300 carritos dan exactamente el mismo resultado 18ms
 Test Files  3 passed (3)
      Tests  9 passed (9)
> tsc -p tsconfig.json

lint sin avisos
 services/api/src/orders/pricing.ts | 60 ++++++++++++++++++--------------------
 1 file changed, 29 insertions(+), 31 deletions(-)
```

Un refactor de 60 líneas aceptado con una prueba: los 300 carritos dan exactamente lo mismo que antes.

## Comprueba tu entendimiento

**El juez no opina sobre la regla**
Explica por qué el test de caracterización habría pasado en verde si la v1 tuviera un error de cálculo y el refactor lo conservase.
→ Porque compara con lo que la función hacía, no con lo que debería hacer. Protege el refactor, no la regla; para la regla están los tests de negocio.

**Qué carrito ha cambiado**
En la salida del paso 5, localiza `R-21-3` y explica con el código del paso 1 por qué cambia el mensaje.
→ Es el carrito 21, con más de 10 entradas y la entrada 3 con precio negativo: la v1 lanza el error del precio dentro del bucle, antes de contar; el refactor cuenta primero.

## Experimenta

**Predice** qué pasará con los tests de negocio y con el juez si, en tu refactor en verde, la comisión del pedido se calcula sobre el subtotal en vez de sumar las líneas (otro cambio que «parece igual»).

```bash
# La comisión del pedido pasa a calcularse sobre el subtotal
sed -i "s/    commission_cents: sum(lines, 'commission_cents'),/    commission_cents: Math.round((subtotal_cents * ev.commission_bps) \/ 10000),/" services/api/src/orders/pricing.ts
npx vitest run services/api/test/
```

**Resultado esperado** (líneas clave):

```text
-     "commission_cents": 1897,
+     "commission_cents": 1896,
  Snapshots  1 failed
      Tests  1 failed | 8 passed (9)
```

Los cinco tests de negocio siguen en verde; el juez marca 49 carritos con un céntimo de diferencia en la comisión. Deshaz el cambio pidiendo **Undo** en el chat o volviendo a pegar la solución del paso 6.

## Reto

### 1 — Un cambio de comportamiento que sí se quiere

**La situación:** producto decide que, si un comprador manda más de 10 entradas, el primer error que vea sea siempre «máximo 10 entradas por pedido», aunque alguna tenga un precio corrupto: es el mensaje que la tienda sabe explicar. Es exactamente el cambio que el juez rechazó en el paso 5, pero ahora es intencionado.

**Qué haces:** sube las dos comprobaciones al principio de `calcOrderAmounts`, ejecuta el juez para ver qué cambia, actualiza el snapshot **solo** si los cambios son los esperados y añade a `pricing.test.ts` un test de negocio que deje escrita la decisión.

**Pistas:** `npx vitest run <fichero> -u` reescribe el snapshot. Antes de usarlo, el diff del juez tiene que mostrar solo cambios de mensaje de error en carritos de más de 10 entradas. Para comparar el snapshot antes y después, `git diff --stat` no sirve si el fichero es nuevo: guarda una copia antes con `cp`.

**Lo que buscas:** el snapshot actualizado con 11 cambios, todos `precio negativo → máximo 10`, y un test de negocio nuevo en verde que falle si alguien devuelve el orden antiguo.

<details>
<summary>Ver solución</summary>

```bash
F=services/api/test/__snapshots__/pricing-caracterizacion.test.ts.snap
cp $F /tmp/snapshot-antes.snap
# (con las dos comprobaciones ya subidas al principio de calcOrderAmounts)
npx vitest run services/api/test/pricing-caracterizacion.test.ts -u
# Cuántas líneas del snapshot han cambiado y cómo
diff /tmp/snapshot-antes.snap $F | grep -c '^>'
diff /tmp/snapshot-antes.snap $F | head -8
```

```text
  Snapshots  1 updated 
      Tests  1 passed (1)
11
474c474
<     "error": "precio negativo en R-21-3",
---
>     "error": "máximo 10 entradas por pedido",
832c832
<     "error": "precio negativo en R-37-5",
---
>     "error": "máximo 10 entradas por pedido",
```

Once líneas, todas del mismo tipo: es el cambio decidido y nada más. El test de negocio que lo documenta, en `pricing.test.ts`:

```ts
  it('con más de 10 entradas, el error de máximo va antes que el de precio', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ kind: 'seat' as const, ref: `A-${i + 1}`, price_cents: i === 3 ? -100 : 2500 }));
    expect(() => calcOrderAmounts(items, faro)).toThrow('máximo 10');
  });
```

El snapshot dice «esto cambió»; el test de negocio dice «y lo quisimos». En una pull request, el diff del snapshot es la prueba de que el cambio es solo ese. **La regla:** un snapshot se actualiza con `-u` solo después de leer su diff y poder explicar cada línea; si no, se está borrando la red.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| El juez falla siempre, incluso sin tocar el código | Los carritos cambian en cada ejecución (sin semilla fija, `Math.random`) | Usa el generador con semilla del paso 2 |
| `Snapshots 1 written` después del refactor | El snapshot se creó con el código ya refactorizado | Bórralo, vuelve al código original (`git checkout services/api/src/orders/pricing.ts`), ejecuta el juez y refactoriza después |
| El juez pasa en verde tras un cambio que sabes que altera algo | Ningún carrito cubre ese caso | Amplía los carritos (más precios, más tamaños) y regenera la foto con el código original |
| Copilot actualiza el snapshot o edita el test para que pase | Interpretó el rojo como test desactualizado | Pulsa **Undo** y repite el prompt con «No toques el test ni el snapshot» |
| `typecheck` falla en `sum` | `keyof TicketAmounts` mal escrito o tipos exportados cambiados | Revisa que la firma y los tipos exportados son los del paso 1 |

## Conclusiones

### Qué es un refactor seguro con pruebas

Cambiar la forma del código sin cambiar su comportamiento, con una prueba que lo demuestre. El juez es un test de caracterización: la salida de la función para muchas entradas, guardada antes del cambio y comparada después.

```text
código v1 ──► 300 carritos ──► snapshot (la foto)
                                    │
refactor  ──► 300 carritos ──► ¿igual? ── sí ─► aceptar
                                    └── no ─► leer el diff: ¿error del refactor o cambio querido?
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| El juez se crea **antes** del refactor | `Snapshots 1 written` con el código v1 |
| Entradas variadas y reproducibles | 300 carritos con semilla fija: 204 con importes, 96 con error |
| Compara también los errores | Los mensajes forman parte del snapshot |
| Tests de negocio aparte | `pricing.test.ts` sigue diciendo qué debe hacer la función |
| El refactor pasa juez, tipos y lint | 9 tests en verde, `tsc` y `eslint` sin avisos |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Validar primero cambia el orden de los errores | 11 carritos `precio negativo → máximo 10` | Otro mensaje al comprador |
| Comisión sobre el subtotal | 49 carritos con un céntimo de diferencia | Descuadre en liquidaciones |
| Tests de negocio insuficientes | Siguen en verde en los dos casos | Un refactor que parece seguro sin serlo |
| Actualizar el snapshot sin leerlo | El reto: `-u` reescribe la foto | Se pierde la red en silencio |

### Cómo se perfecciona

- Crear el juez antes de pedir el refactor y dárselo a Copilot como criterio («no toques el test ni el snapshot»).
- Elegir entradas que cubran combinaciones raras, no solo valores sueltos.
- Cuando el cambio de comportamiento es querido, actualizar el snapshot leyendo su diff y añadir un test de negocio que lo documente.

### En una frase

> 🔑 Antes de refactorizar, fotografía el comportamiento: el juez no sabe qué está bien, pero sabe exactamente qué ha cambiado.
