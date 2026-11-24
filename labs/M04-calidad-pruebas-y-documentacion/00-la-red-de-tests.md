# Demo: la red de tests

[← Página anterior](README.md) · [Siguiente página →](01-lab-tests-de-la-comision.md)

Copilot propone cambios que compilan, se leen bien y pasan los tests. La pregunta que importa al aceptarlos no es «¿está en verde?», sino «¿qué habría atrapado la red de tests si el cambio estuviera mal?». Esta demostración toma `calcOrderAmounts`, el cálculo de importes de cada pedido de Teatralia, le aplica dos cambios con aspecto de refactor y mira cuál atrapan los tests que ya tiene el repositorio. Después compara dos tests nuevos del mismo pedido: uno escrito leyendo el código y otro escrito desde la regla de negocio.

## Punto de partida

- Codespace del fork con la terminal en la raíz del repositorio y Teatralia en su estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- Fichero que se mira: `teatralia/services/api/src/orders/pricing.ts` (la función `calcOrderAmounts`).
- Tests que ya existen: `teatralia/services/api/test/pricing.test.ts`, cinco casos.
- Pedido de referencia: `PED-2026-0107` de Ana en *Jazz en el Faro*: butacas F-12 y F-13 a 35,50 € y un pase VIP de 60,00 €, gastos de 0,90 € por entrada y comisión de Teatralia del 7,5 % (`commission_bps: 750`).
- La regla de la comisión, en el propio código: «bps sobre el precio, redondeo por entrada (lo pide liquidaciones)». La comisión del pedido es la suma de la de sus entradas.

No hace falta `make up`: todo lo que se ejecuta son tests y una consulta a la base de datos.

## Recorrido

### 1 — La red de partida, en verde

Los cinco tests de `pricing.test.ts` comprueban sumas de precios y gastos, una comisión de 60,00 €, las invitaciones, el máximo de 10 entradas y el pedido vacío.

```bash
cd teatralia
# Solo los tests del cálculo de importes, con el nombre de cada caso
npx vitest run services/api/test/pricing.test.ts --reporter=verbose
```

```text
 RUN  v5.0.5 /workspaces/github-copilot-equipos-201/teatralia

 ✓ |api| test/pricing.test.ts > calcOrderAmounts > suma precio y gastos de gestión por entrada 2ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > calcula la comisión de plataforma 0ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > las invitaciones no pagan gastos ni comisión 0ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > rechaza más de 10 entradas 1ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > rechaza un pedido vacío 0ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Cinco casos en verde. Es la red sobre la que se va a aceptar código generado.

### 2 — Un cambio que la red atrapa

Primer cambio, del tipo que sale al pedir «simplifica la condición de los gastos»: la condición `p > 0` pasa a `p >= 0`. Parece inocente; en Teatralia significa que una invitación (precio 0) pasa a pagar 0,90 € de gastos.

```diff
-    if (p > 0) {
+    if (p >= 0) {
```

```text
     × las invitaciones no pagan gastos ni comisión 4ms
AssertionError: expected 90 to be +0 // Object.is equality
      Tests  1 failed | 4 passed (5)
```

La red lo atrapa porque alguien escribió en su día un test con la regla de las invitaciones. El cambio no llegaría a una pull request en verde.

### 3 — Un refactor que la red deja pasar

Segundo cambio: la función reescrita con `map` y `reduce`, más corta y legible, como la que propone Copilot al pedir «refactoriza `calcOrderAmounts` para que sea más legible». Las líneas del pedido siguen calculando la comisión por entrada, pero la del pedido se calcula de una vez sobre el subtotal:

```ts
  const subtotal_cents = sum(lines.map((l) => l.price_cents));
  const fee_cents = sum(lines.map((l) => l.fee_cents));
  return {
    subtotal_cents,
    fee_cents,
    total_cents: subtotal_cents + fee_cents,
    commission_cents: Math.round((subtotal_cents * ev.commission_bps) / 10000),
    lines,
  };
```

Con ese refactor aplicado, la misma red de partida:

```text
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > suma precio y gastos de gestión por entrada 2ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > calcula la comisión de plataforma 0ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > las invitaciones no pagan gastos ni comisión 0ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > rechaza más de 10 entradas 1ms
 ✓ |api| test/pricing.test.ts > calcOrderAmounts > rechaza un pedido vacío 0ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Todo en verde. El único test de comisión usa una entrada de 60,00 €, cuyo 7,5 % es exacto (450): con una sola entrada y un importe redondo, redondear por entrada o sobre el total da lo mismo.

### 4 — Lo que dice el dato real

Con el pedido de Ana se ve la diferencia. Este bloque llama a la función del repositorio con las tres entradas de `PED-2026-0107` e imprime la comisión de cada línea y la del pedido:

```bash
# Comisión de las líneas y del pedido de Ana, con el código que haya en pricing.ts
npx tsx -e "
import { calcOrderAmounts } from './services/api/src/orders/pricing.ts';
const r = calcOrderAmounts([
  { kind: 'seat', ref: 'F-12', price_cents: 3550 },
  { kind: 'seat', ref: 'F-13', price_cents: 3550 },
  { kind: 'pass', ref: 'EV-FARO-0042-VIP', price_cents: 6000 },
], { fee_cents: 90, commission_bps: 750 });
console.log(r.lines.map((l) => l.commission_cents), r.commission_cents);"
```

Con el código original y con el refactor:

```text
[ 266, 266, 450 ] 982
```

```text
[ 266, 266, 450 ] 983
```

Y lo que la plataforma guardó al cobrar el pedido:

```bash
psql "$DATABASE_URL" -c "SELECT id, total_cents, commission_cents FROM orders WHERE id = 'PED-2026-0107'"
```

```text
      id       | total_cents | commission_cents 
---------------+-------------+------------------
 PED-2026-0107 |       13370 |              982
(1 row)
```

| Cálculo | Comisión | De dónde sale |
|---------|----------|---------------|
| Por entrada (regla) | 266 + 266 + 450 = **982** | 3550 × 7,5 % = 266,25 → 266, dos veces, más 450 |
| Sobre el total (refactor) | **983** | 13100 × 7,5 % = 982,5 → 983 |

Un céntimo de diferencia por pedido, y las líneas del propio pedido ya no suman la cabecera. Liquidaciones cuadra la comisión de cada promotor sumando líneas: el refactor descuadra miles de pedidos al mes y ningún test se pone en rojo.

### 5 — Dos tests del mismo pedido

Para cerrar el agujero se añaden dos tests en `services/api/test/pedido-0107.test.ts`. El **A** está escrito leyendo el código refactorizado, como sale cuando se pide a un asistente «genera tests para esta función» sin más contexto: calcula el valor esperado con la misma fórmula que el código. El **B** está escrito desde la regla de negocio: la comisión del pedido es la suma de la de sus líneas.

```ts
// A) escrito leyendo el código: 13100 × 7,5 % = 982,5 → 983
it('A · comisión del pedido según el código', () => {
  expect(ped0107.commission_cents).toBe(983);
});

// B) escrito desde la regla: la comisión del pedido es la suma de la de sus entradas
it('B · comisión del pedido = suma de las líneas', () => {
  const lineas = ped0107.lines.reduce((s, l) => s + l.commission_cents, 0);
  expect(ped0107.commission_cents).toBe(lineas);
});
```

Con el refactor aplicado:

```text
 ✓ |api| test/pedido-0107.test.ts > A · comisión del pedido según el código 2ms
 × |api| test/pedido-0107.test.ts > B · comisión del pedido = suma de las líneas 7ms
   → expected 983 to be 982 // Object.is equality
```

Y con el código original:

```text
   × A · comisión del pedido según el código 8ms
AssertionError: expected 982 to be 983 // Object.is equality
      Tests  1 failed | 1 passed (2)
```

| Test | Con el refactor | Con el código correcto | Qué protege |
|------|-----------------|------------------------|-------------|
| A (desde el código) | ✓ | ✗ | Lo que el código hace hoy, incluido su fallo |
| B (desde la regla) | ✗ | ✓ | Lo que el negocio necesita |

El test A no es una red: es una foto del código. Aprueba el fallo y suspende el arreglo. El test B es la red: suspende el fallo y aprueba el arreglo.

## Qué queda visto

- Una suite en verde solo dice que el código hace lo que los tests comprueban. El refactor de la comisión pasó los cinco tests de partida porque ninguno tenía dos entradas con decimales en la comisión.
- Un test generado mirando el código hereda los errores del código. El valor esperado tiene que salir de otra fuente: la regla, la política o el dato guardado (982 en `orders`).
- Antes de aceptar código generado, la pregunta útil es qué cambio malo atraparía la red, y probarlo rompiendo el código a propósito.

La pregunta que queda abierta: ¿cómo se pide a Copilot una batería de tests para `calcOrderAmounts` que se parezca al test B y no al A? Se practica en [Laboratorio: tests unitarios de la comisión](01-lab-tests-de-la-comision.md), que se puede hacer sin haber seguido esta demostración.
