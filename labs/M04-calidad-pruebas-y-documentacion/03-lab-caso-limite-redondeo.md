# Laboratorio: el caso límite del redondeo

[← Página anterior](02-lab-datos-de-prueba.md) · [Siguiente página →](04-lab-debugging-correo-duplicado.md)

Atención al cliente ha abierto la incidencia TEA-106: a algunos compradores que devuelven entradas por petición propia se les devuelve un céntimo menos de lo que dice la política. Los ejemplos son `PED-2026-1250` (una entrada de 18,25 €: se devolvieron 16,42 €, la política dice 16,43 €) y `PED-2026-1779` (18,25 + 32,00 €: 45,22 € en vez de 45,23 €). En este lab reproduces el céntimo con un test, compruebas que el primer arreglo que se le ocurre a cualquiera (también a Copilot) no basta, y corriges `calcRefund` hasta que el test, la política y la API dicen lo mismo.

### Objetivo

Comprender qué es un caso límite numérico: cómo se reproduce con un test antes de tocar el código, cómo debe ser el cálculo para cumplir la regla (redondear el total y no cada línea), cómo se detecta un arreglo que pasa unos casos y falla otros, y cómo se comprueba contra el sistema en marcha.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repositorio.
- Teatralia en su estado inicial y la plataforma en marcha en una **segunda terminal** (el paso 7 llama a la API):

```bash
# Terminal 1: descarta tus cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

```bash
# Terminal 2: arranca la plataforma y déjala abierta
make up
```

- Fuente de verdad: `teatralia/docs/politica-devoluciones.md`, apartado 3.
- Código: `calcRefund` en `teatralia/services/api/src/orders/refunds.ts`.
- Token del backoffice de Auditorio El Olivo: `olivo-dev-token`.

### Qué está pasando

La política dice: «La penalización se calcula sobre el **importe total** de las entradas devueltas y se **redondea al céntimo** (por ejemplo, dos entradas de 18,25 €: 36,50 € − 10 % = 32,85 €)». El código hace otra cosa: recorre las entradas y a cada una le aplica `Math.floor(precio × 0,9)`. Con precios cuyo 90 % es exacto (32,00 € → 28,80 €) no se nota; con 18,25 € (90 % = 16,425 €, es decir, 1642,5 céntimos) se pierde medio céntimo por entrada y el truncado lo convierte en un céntimo entero.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| La compradora pide la devolución desde atención al cliente | `POST /api/admin/orders/:id/refunds` con motivo `petición del cliente` |
| Finanzas cuadra lo devuelto con la política | El test compara `calcRefund` con el importe de la política |
| Un céntimo por devolución, miles de devoluciones al año | 13 devoluciones de los datos de ejemplo ya tienen el céntimo de menos |

### 1 — Lee la incidencia y la regla

```bash
cd teatralia
# La incidencia del backlog
cat docs/backlog/TEA-106-centimo-en-devoluciones.md
# El apartado 3 de la política
sed -n '/## 3/,/## 4/p' docs/politica-devoluciones.md
```

**Resultado esperado:**

```text
---
titulo: "Devoluciones con un céntimo de menos"
etiquetas: [bug, pagos]
---
Atención al cliente: varios compradores dicen que se les devolvió un céntimo menos de lo que marca la política
en devoluciones por petición del cliente. Ejemplos: PED-2026-1250 y PED-2026-1779.
## 3. Petición del cliente (evento que se celebra)

- Solo hasta **48 h antes** del comienzo del evento.
- Se puede devolver el pedido entero o solo algunas entradas.
- Se devuelve el precio de las entradas con una **penalización del 10 %**. Los gastos de gestión no se devuelven.
- La penalización se calcula sobre el **importe total** de las entradas devueltas y se **redondea al céntimo**
  (por ejemplo, dos entradas de 18,25 €: 36,50 € − 10 % = 32,85 €).

## 4. Doble cobro
```

Dos palabras deciden el caso: «importe total» (no entrada a entrada) y «redondea» (no trunca).

### 2 — Mira las devoluciones reportadas en la base de datos

Antes de leer el código, confirma el síntoma con los datos: qué se devolvió y por qué entradas.

```bash
# Las dos devoluciones de la incidencia con los precios de sus entradas
psql "$DATABASE_URL" -c "SELECT r.order_id, r.reason, r.amount_cents, array_agg(t.price_cents ORDER BY t.id) AS precios FROM refunds r JOIN tickets t ON t.id = ANY(r.ticket_ids) WHERE r.order_id IN ('PED-2026-1250', 'PED-2026-1779') GROUP BY r.id ORDER BY r.order_id;"
```

**Resultado esperado:**

```text
   order_id    |        reason        | amount_cents |   precios   
---------------+----------------------+--------------+-------------
 PED-2026-1250 | petición del cliente |         1642 | {1825}
 PED-2026-1779 | petición del cliente |         4522 | {1825,3200}
(2 rows)
```

| Pedido | Cuenta de la política | Política | Devuelto |
|--------|-----------------------|----------|----------|
| `PED-2026-1250` | 1825 × 0,9 = 1642,5 → | **1643** | 1642 |
| `PED-2026-1779` | (1825 + 3200) × 0,9 = 4522,5 → | **4523** | 4522 |

### 3 — Pregunta a Copilot por la causa

Abre una conversación nueva en modo **Ask** (no cambia ficheros) y pega:

```text
#file:teatralia/services/api/src/orders/refunds.ts
#file:teatralia/docs/politica-devoluciones.md

PED-2026-1250 devolvió por «petición del cliente» una entrada de 1825 céntimos y se
devolvieron 1642; la política dice 1643. PED-2026-1779 devolvió 1825 + 3200 y se
devolvieron 4522; la política dice 4523. ¿Qué línea de calcRefund lo provoca y qué
dice exactamente la política que hay que hacer? No propongas código todavía.
```

**Qué debe contener la respuesta** (la redacción varía en cada ejecución):

- la línea `total += Math.floor(t.price_cents * 0.9);` dentro del bucle de `calcRefund`;
- dos diferencias con la política: `Math.floor` **trunca** en vez de redondear, y se aplica **por entrada** en vez de al total;
- la cuenta de 1825: 1642,5 truncado a 1642.

Compruébalo en el código:

```bash
# La rama de petición del cliente dentro de calcRefund
grep -n -A3 "} else if (reason === 'petición del cliente')" services/api/src/orders/refunds.ts
```

**Resultado esperado:**

```text
21:    } else if (reason === 'petición del cliente') {
22-      // penalización del 10 %
23-      total += Math.floor(t.price_cents * 0.9);
24-    } else {
```

### 4 — Escribe el test que reproduce el céntimo

El test va antes del arreglo: fija lo que dice la política con los dos pedidos reales y con el ejemplo de la propia política. Créalo a mano o pídeselo a Copilot en modo **Agent** («crea `services/api/test/reembolso-redondeo.test.ts` con estos tres casos y no toques `refunds.ts`»). El fichero de referencia:

```ts
import { describe, expect, it } from 'vitest';
import { calcRefund } from '../src/orders/refunds.js';

// docs/politica-devoluciones.md §3: penalización del 10 % sobre el IMPORTE TOTAL de las entradas
// devueltas, redondeada al céntimo. Los gastos de gestión no se devuelven.
const entrada = (id: string, price_cents: number) => ({ id, price_cents, fee_cents: 100 });

describe('devolución por petición del cliente', () => {
  it('PED-2026-1250: una entrada de 18,25 € → 16,43 €', () => {
    expect(calcRefund([entrada('PED-2026-1250-1', 1825)], 'petición del cliente')).toBe(1643);
  });

  it('PED-2026-1779: 18,25 € + 32,00 € → 45,23 €', () => {
    const t = [entrada('PED-2026-1779-1', 1825), entrada('PED-2026-1779-2', 3200)];
    expect(calcRefund(t, 'petición del cliente')).toBe(4523);
  });

  it('ejemplo de la política: dos entradas de 18,25 € → 32,85 €', () => {
    const t = [entrada('A-1', 1825), entrada('A-2', 1825)];
    expect(calcRefund(t, 'petición del cliente')).toBe(3285);
  });
});
```

```bash
# El test nuevo, contra el código sin arreglar
npx vitest run services/api/test/reembolso-redondeo.test.ts
```

**Resultado esperado** (líneas clave):

```text
 ❯ |api| test/reembolso-redondeo.test.ts (3 tests | 3 failed) 7ms
   ❯ devolución por petición del cliente (3)
     × PED-2026-1250: una entrada de 18,25 € → 16,43 € 5ms
     × PED-2026-1779: 18,25 € + 32,00 € → 45,23 € 1ms
     × ejemplo de la política: dos entradas de 18,25 € → 32,85 € 0ms
AssertionError: expected 1642 to be 1643 // Object.is equality
AssertionError: expected 4522 to be 4523 // Object.is equality
AssertionError: expected 3284 to be 3285 // Object.is equality
 Test Files  1 failed (1)
      Tests  3 failed (3)
```

Tres rojos con el céntimo exacto de la incidencia. El tercero es el ejemplo literal de la política: 1642 + 1642 = 3284.

### 5 — Prueba el arreglo obvio y míralo fallar

El arreglo que sale primero (de una persona o de Copilot, si se le pide «arregla el redondeo») es cambiar `Math.floor` por `Math.round` y dejar el bucle. Pruébalo:

```bash
# Arreglo obvio: redondear cada entrada en lugar de truncarla
sed -i 's/total += Math.floor(t.price_cents \* 0.9);/total += Math.round(t.price_cents * 0.9);/' services/api/src/orders/refunds.ts
git diff services/api/src/orders/refunds.ts | grep '^[-+] '
npx vitest run services/api/test/reembolso-redondeo.test.ts
```

**Resultado esperado** (líneas clave):

```text
-      total += Math.floor(t.price_cents * 0.9);
+      total += Math.round(t.price_cents * 0.9);
     × ejemplo de la política: dos entradas de 18,25 € → 32,85 € 4ms
AssertionError: expected 3286 to be 3285 // Object.is equality
      Tests  1 failed | 2 passed (3)
```

Los dos pedidos de la incidencia pasan, pero el ejemplo de la política ahora devuelve un céntimo **de más**: 1643 + 1643 = 3286. Redondear cada entrada acumula los medios céntimos. Si solo hubieras probado los dos pedidos de la incidencia, este arreglo habría parecido correcto. Deshazlo:

```bash
git checkout services/api/src/orders/refunds.ts
```

### 6 — Pide el arreglo que cumple la regla

Pide a Copilot el arreglo en modo **Edit** (o **Agent**), con el test como criterio. Pega:

```text
#file:teatralia/services/api/src/orders/refunds.ts
#file:teatralia/services/api/test/reembolso-redondeo.test.ts
#file:teatralia/docs/politica-devoluciones.md

Corrige calcRefund para «petición del cliente» según la política §3: suma el precio de todas las
entradas devueltas y aplica la penalización del 10 % una sola vez sobre ese total, redondeando al
céntimo. Usa aritmética entera (precio × 9 / 10) para no depender de decimales de coma flotante.
No cambies el resto de motivos ni el test. Diff mínimo.
```

**Qué debe contener la respuesta:** un diff solo en `refunds.ts` en el que la suma de precios se hace antes de calcular la penalización y aparece un único `Math.round`. Revisa el diff y pulsa **Keep**. Si toca el test, pulsa **Undo** en ese fichero.

<details>
<summary>Solución de referencia (<code>calcRefund</code> en <code>refunds.ts</code>)</summary>

```ts
// Importe que se devuelve por un conjunto de entradas de un pedido.
export function calcRefund(tickets: RefundableTicket[], reason: RefundReason): number {
  const price = tickets.reduce((s, t) => s + t.price_cents, 0);
  const fees = tickets.reduce((s, t) => s + t.fee_cents, 0);
  if (reason === 'petición del cliente') {
    // penalización del 10 % sobre el total de las entradas devueltas, redondeada al céntimo (política §3)
    return Math.round((price * 9) / 10);
  }
  // cancelación, aplazamiento y doble cobro: precio y gastos
  return price + fees;
}
```

`1825 × 9 = 16425`, entre 10 = 1642,5, `Math.round` → 1643. Con decimales (`1825 * 0.9`) también da 1642,5 en este caso, pero la versión entera no depende de cómo represente el ordenador 0,9.

</details>

```bash
# Todos los tests de la API
npx vitest run services/api/test/ --reporter=verbose
```

**Resultado esperado** (las líneas del test nuevo y el resumen):

```text
 ✓ |api| test/reembolso-redondeo.test.ts > devolución por petición del cliente > PED-2026-1250: una entrada de 18,25 € → 16,43 € 1ms
 ✓ |api| test/reembolso-redondeo.test.ts > devolución por petición del cliente > PED-2026-1779: 18,25 € + 32,00 € → 45,23 € 0ms
 ✓ |api| test/reembolso-redondeo.test.ts > devolución por petición del cliente > ejemplo de la política: dos entradas de 18,25 € → 32,85 € 0ms

 Test Files  3 passed (3)
      Tests  11 passed (11)
```

Los tres casos en verde y los ocho tests que ya había (precios y QR), también.

### 7 — Compruébalo contra la API

El test prueba la función; falta ver que la API usa la función arreglada con datos reales. `PED-2026-2449` es otro pedido pagado de Auditorio El Olivo con dos entradas de 18,25 €: el ejemplo exacto de la política. Devuelve esas dos entradas desde la API del backoffice (`make up` recarga la API sola al guardar `refunds.ts`).

```bash
# Devolución por petición del cliente de las dos entradas de 18,25 €
curl -s -X POST localhost:3000/api/admin/orders/PED-2026-2449/refunds \
  -H 'authorization: Bearer olivo-dev-token' -H 'content-type: application/json' \
  -d '{"reason":"petición del cliente","ticket_ids":["PED-2026-2449-1","PED-2026-2449-2"]}'
```

**Resultado esperado:**

```text
{"id":"RE-PED-2026-2449-1","order_id":"PED-2026-2449","amount_cents":3285,"reason":"petición del cliente","gateway_id":"manual_ch_seed_2449","tickets":["PED-2026-2449-1","PED-2026-2449-2"]}
```

32,85 €, lo que dice la política. Con el código sin arreglar, la misma llamada devuelve `"amount_cents":3284`. La devolución queda registrada: para repetirla, `CONFIRM=1 make reset` (que también deshace tu arreglo).

## Comprueba tu entendimiento

**Cuántas devoluciones están afectadas**
Ejecuta esta consulta, que compara cada devolución por petición del cliente con el 90 % redondeado del total de sus entradas:

```bash
psql "$DATABASE_URL" -c "SELECT count(*) AS devoluciones, sum(CASE WHEN r.amount_cents <> round(p.precio * 0.9) THEN 1 ELSE 0 END) AS con_centimo_de_menos FROM refunds r JOIN LATERAL (SELECT sum(price_cents) AS precio FROM tickets WHERE id = ANY(r.ticket_ids)) p ON true WHERE r.reason = 'petición del cliente';"
```

→ Con los datos recién cargados:

```text
 devoluciones | con_centimo_de_menos 
--------------+----------------------
           83 |                   13
(1 row)
```

13 de 83 devoluciones tienen el céntimo de menos. Arreglar el código no corrige las ya hechas: eso es una decisión de negocio (abonar la diferencia) que el test no toma por ti.

**Por qué no basta con los casos de la incidencia**
Explica con el paso 5 qué arreglo pasaría los dos pedidos de la incidencia y seguiría incumpliendo la política.
→ Redondear cada entrada: 1643 y 4523 cuadran, pero dos entradas de 18,25 € dan 3286.

## Experimenta

Antes de ejecutar, **predice** cuánto devuelve `calcRefund` con el arreglo para tres entradas de 18,25 € (5475 céntimos) y cuánto devolvían el código original y el «arreglo obvio» del paso 5. Añade el caso al test y ejecútalo.

| Cálculo | Cuenta | Resultado |
|---------|--------|-----------|
| Política (total, redondeo) | 5475 × 0,9 = 4927,5 → | 4928 |
| Original (por entrada, trunca) | 1642 × 3 | 4926 |
| Arreglo obvio (por entrada, redondea) | 1643 × 3 | 4929 |

Con el arreglo, el caso de tres entradas da `4928`. Con tres entradas, el original pierde dos céntimos y el arreglo obvio regala uno: el error crece con el número de entradas, y solo el cálculo sobre el total no depende de él.

## Reto

### 1 — Las devoluciones por aplazamiento

**La situación:** en la incidencia `INC-0003`, un comprador del pedido `PED-2026-1559` cuyo evento se ha aplazado pide «la devolución completa, gastos incluidos». La política §2 dice que en un aplazamiento se devuelve el precio y **no** los gastos de gestión. Un compañero cree que el código ya lo hace bien porque «el motivo existe».

**Qué haces:** escribe un test con la primera entrada real de ese pedido (24,00 € con 0,90 € de gastos) devuelta por `aplazamiento`; ejecútalo; si falla, corrige `calcRefund` para ese motivo.

```bash
# La entrada real del pedido
psql "$DATABASE_URL" -c "SELECT id, price_cents, fee_cents, status FROM tickets WHERE order_id = 'PED-2026-1559' ORDER BY id LIMIT 1;"
```

**Pistas:** el valor esperado sale de la política §2: solo `price_cents`. En el código, mira qué rama recibe `'aplazamiento'`.

**Lo que buscas:** un test en rojo con el código de partida, en verde tras el arreglo, y los tres casos del redondeo todavía en verde.

<details>
<summary>Ver solución</summary>

`services/api/test/reembolso-aplazamiento.test.ts`:

```ts
import { expect, it } from 'vitest';
import { calcRefund } from '../src/orders/refunds.js';

// política §2: evento aplazado → se devuelve el precio; los gastos de gestión no
it('aplazamiento: devuelve el precio y no los gastos', () => {
  const t = [{ id: 'PED-2026-1559-1', price_cents: 2400, fee_cents: 90 }];
  expect(calcRefund(t, 'aplazamiento')).toBe(2400);
});
```

Con el código de partida (y con el del paso 6, que mantiene el aplazamiento junto a la cancelación):

```text
   × aplazamiento: devuelve el precio y no los gastos 9ms
AssertionError: expected 2490 to be 2400 // Object.is equality
```

El arreglo, en `calcRefund`, antes del `return` final:

```ts
  if (reason === 'aplazamiento') {
    // los gastos de gestión no se devuelven: el servicio de venta ya se prestó (política §2)
    return price;
  }
  // cancelación y doble cobro: precio y gastos
  return price + fees;
```

```text
 ✓ |api| test/reembolso-aplazamiento.test.ts > aplazamiento: devuelve el precio y no los gastos 2ms
 ✓ |api| test/reembolso-redondeo.test.ts > devolución por petición del cliente > PED-2026-1250: una entrada de 18,25 € → 16,43 € 2ms
 ✓ |api| test/reembolso-redondeo.test.ts > devolución por petición del cliente > PED-2026-1779: 18,25 € + 32,00 € → 45,23 € 0ms
 ✓ |api| test/reembolso-redondeo.test.ts > devolución por petición del cliente > ejemplo de la política: dos entradas de 18,25 € → 32,85 € 0ms
```

El comprador de `INC-0003` tiene derecho a 24,00 €, no a 24,90 €. En los datos de ejemplo hay 14 devoluciones por aplazamiento que devolvieron 25,40 € de gastos que la política no contempla. **La regla:** cada motivo de la política es un caso límite propio; que el código tenga el motivo no significa que lo calcule bien.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| El test pasa en verde antes de arreglar nada | El esperado se calculó con el código (`1642`) | El esperado sale de la política: 1643, 4523, 3285 |
| Pasan los casos de la incidencia y falla el de 32,85 € | Redondeo por entrada (paso 5) | Redondea una vez sobre el total |
| La API sigue devolviendo 3284 | La API no se ha recargado | Mira en la terminal de `make up` que `[api]` se reinició; guarda `refunds.ts` otra vez |
| `409 fuera de plazo de devolución` | Faltan menos de 48 h para el evento de `PED-2026-2449` (10 de diciembre) | Usa otro pedido con dos entradas de 18,25 € de un evento posterior |
| `{"error":"no hay entradas válidas que reembolsar"}` | Ya devolviste esas entradas | `CONFIRM=1 make reset` |

## Conclusiones

### Qué es un caso límite numérico

Un valor en el que dos formas de calcular que suelen coincidir dejan de hacerlo. En dinero aparece con los medios céntimos: 1825 × 0,9 = 1642,5. Truncar o redondear, por entrada o sobre el total, da 1642, 1643, 3284, 3285 o 3286 según el camino.

```text
Política:          (1825 + 1825) × 0,9 = 3285   → redondear UNA vez el total
Código original:   ⌊1642,5⌋ + ⌊1642,5⌋ = 3284   → truncar cada entrada
Arreglo obvio:     ⌈1642,5⌉ + ⌈1642,5⌉ = 3286   → redondear cada entrada
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| El test se escribe antes del arreglo y falla por el motivo exacto | `expected 1642 to be 1643` |
| Incluye los casos reales y el ejemplo de la regla | `PED-2026-1250`, `PED-2026-1779` y 2 × 18,25 € |
| La operación se hace donde dice la regla | `Math.round(total × 9 / 10)` una sola vez |
| Se comprueba contra el sistema | `amount_cents: 3285` en la API |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Truncar en vez de redondear | 1642 frente a 1643 en el test | Un céntimo de menos al comprador |
| Redondear por entrada | 3286 en el ejemplo de la política | Un céntimo de más; crece con las entradas |
| Probar solo los casos de la incidencia | El arreglo obvio los pasa | Un arreglo falso que se da por bueno |
| Arreglar el código y olvidar los datos | 13 devoluciones ya hechas con el céntimo de menos | Clientes sin compensar |

### Cómo se perfecciona

- Buscar a propósito los valores con medio céntimo y los pedidos con varias entradas.
- Trabajar en céntimos enteros y redondear en un único punto, con la regla escrita junto al código.
- Comprobar el arreglo en tres niveles: test unitario, API y datos ya registrados.

### En una frase

> 🔑 En un caso límite, el test con el ejemplo de la propia regla es el que separa el arreglo correcto del que solo parece correcto.
