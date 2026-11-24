# Laboratorio: la documentación como fuente de verdad

[← Página anterior](05-lab-con-y-sin-contexto.md) · [Siguiente página →](07-lab-biblioteca-de-prompts.md)

La incidencia `INC-0003` de Sala Faro dice: «El evento se ha aplazado y la nueva fecha no me viene bien. Pido la
devolución completa, gastos incluidos». ¿Tiene razón el cliente? Teatralia tiene dos respuestas: la política de
devoluciones (`teatralia/docs/politica-devoluciones.md`), aprobada por Operaciones y Finanzas, y el código que la
implementa (`refunds.ts`). En este laboratorio usas la política como contexto para que Copilot compare las dos,
compruebas con datos reales dónde no coinciden, decides cuál manda y corriges el código con un test que lo demuestra.

### Objetivo

Comprender cómo se usa la documentación funcional con Copilot: como contexto para generar y como contraste para
revisar, cómo se detecta una divergencia con datos, quién manda cuando el código y el documento no coinciden y cómo
se deja corregido y protegido.

### Punto de partida

- Terminal en la raíz del repositorio y Teatralia en su estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- En otra terminal, la plataforma en marcha (la API se recarga sola al guardar):

```bash
# Arranca api, pagos, correo, tienda y backoffice; deja esta terminal abierta
make up
```

- Token de **Sala Faro**: `faro-dev-token`. Su evento aplazado es *Fado y saudade* (`EV-FARO-0049`); el pedido
  `PED-2026-1468` tiene dos entradas de ese evento.

### Qué está pasando

| En Teatralia | Dónde está |
|--------------|------------|
| Lo que se ha decidido que se devuelve en cada caso | `teatralia/docs/politica-devoluciones.md` (versión 3) |
| Lo que el sistema devuelve de verdad | `calcRefund` en `teatralia/services/api/src/orders/refunds.ts` |
| Lo que ya se ha devuelto | Tabla `refunds` |
| La queja del cliente | `INC-0003` |

Cuando el documento y el código no coinciden, alguien tiene que decidir quién tiene razón. Copilot puede encontrar la
divergencia, pero no puede decidir: eso lo dice el propio documento, o negocio.

### 1 — Lee la política en crudo

La parte de la política que afecta a la incidencia:

```bash
# Apartados 1 y 2 de la política: cancelación y aplazamiento
sed -n '/## 1\./,/## 3\./p' teatralia/docs/politica-devoluciones.md
```

**Resultado esperado:**

```text
## 1. Evento cancelado

- Se devuelve **todo**: el precio de las entradas y los gastos de gestión.
- La devolución es automática: el comprador no tiene que pedirla.

## 2. Evento aplazado

- Las entradas siguen siendo válidas para la nueva fecha.
- Si el comprador no puede ir, puede pedir la devolución hasta 48 h antes de la nueva fecha.
- Se devuelve el **precio de las entradas**. Los **gastos de gestión no se devuelven**: el servicio de venta ya se prestó.

## 3. Petición del cliente (evento que se celebra)
```

**Cómo se lee:** en un aplazamiento, el cliente recupera el precio pero no los gastos. Y la cabecera del documento
dice quién manda: «Si el sistema no hace lo que dice este documento, el error está en el sistema».

```bash
# La frase que decide quién manda
grep -n "fuente de verdad\|el error está" teatralia/docs/politica-devoluciones.md
```

```text
5:Esta política es la **fuente de verdad** para atención al cliente y para el equipo de desarrollo.
6:Si el sistema no hace lo que dice este documento, el error está en el sistema.
```

### 2 — Pide a Copilot que compare política y código

Adjuntas los dos ficheros y pides una comparación regla a regla.

1. Vista **Chat** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>), conversación nueva con **+**, modo **Ask**.
2. Envía:

```text
#file:teatralia/docs/politica-devoluciones.md #file:teatralia/services/api/src/orders/refunds.ts
Compara la política con calcRefund y refundOrder. Para cada apartado de la política, dime si el
código lo cumple, con la línea que lo demuestra. No propongas cambios todavía.
```

**Qué debe contener la respuesta** (varía en cada ejecución):

- **§2 Aplazamiento: no se cumple.** `calcRefund` trata `'cancelación'` y `'aplazamiento'` en la misma rama
  (`if (reason === 'cancelación' || reason === 'aplazamiento')`) y suma `price_cents + fee_cents`: devuelve los gastos.
- §1 Cancelación: se cumple (precio y gastos).
- §3 Petición del cliente: el plazo de 48 h se comprueba; sobre la penalización puede señalar que redondea por entrada
  con `Math.floor` en lugar de sobre el total.
- Posiblemente, que el plazo de 48 h antes de la **nueva** fecha de un aplazamiento no se comprueba.

> [!NOTE]
> Si la respuesta dice que todo se cumple, pídele que revise el apartado 2 línea a línea. Si sigue sin verlo, no
> pasa nada: la divergencia se comprueba en los pasos siguientes con datos, que es lo que vale.

### 3 — Comprueba la divergencia con la función

Ejecutas `calcRefund` con las dos entradas de `PED-2026-1468` y los dos motivos que el código trata igual.

```bash
# Desde teatralia/: lo que devuelve el código por cancelación y por aplazamiento
cd teatralia
npx tsx -e "
import { calcRefund } from './services/api/src/orders/refunds.ts';
// Las dos entradas de PED-2026-1468 (Fado y saudade, aplazado)
const entradas = [
  { id: 'PED-2026-1468-1', price_cents: 2400, fee_cents: 90 },
  { id: 'PED-2026-1468-2', price_cents: 3550, fee_cents: 90 },
];
console.log('cancelación ', calcRefund(entradas, 'cancelación'));
console.log('aplazamiento', calcRefund(entradas, 'aplazamiento'));
"
```

**Resultado esperado:**

```text
cancelación  6130
aplazamiento 6130
```

**Cómo se lee:** el mismo importe en los dos casos. Según la política, el aplazamiento debería devolver 2400 + 3550 =
**5950**: hay 1,80 € de gastos que no corresponden.

### 4 — Mide lo que ya se ha devuelto de más

Una divergencia en el código suele tener ya consecuencias en los datos. Sumas los gastos incluidos en los reembolsos
por aplazamiento que ya están registrados.

```bash
# Reembolsos por aplazamiento: cuántos, cuánto se devolvió y cuánto de eso eran gastos
psql "$DATABASE_URL" -c "SELECT count(*) AS devoluciones, sum(amount_cents) AS devuelto_cents, sum((SELECT sum(fee_cents) FROM tickets t WHERE t.id = ANY(r.ticket_ids))) AS gastos_devueltos_cents FROM refunds r WHERE reason = 'aplazamiento'"
```

**Resultado esperado:**

```text
 devoluciones | devuelto_cents | gastos_devueltos_cents 
--------------+----------------+------------------------
           14 |          79990 |                   2540
(1 row)
```

**Cómo se lee:** 14 devoluciones por aplazamiento, 799,90 € en total, de los que 25,40 € son gastos de gestión que
la política dice que no se devuelven. No es mucho dinero, pero es dinero de los promotores, y crece con cada aplazamiento.

### 5 — Reprodúcelo por la API

Ahora lo haces como lo haría el backoffice, con un pedido real del evento aplazado.

```bash
# Reembolso por aplazamiento de PED-2026-1468, con el token de Sala Faro
curl -s -X POST localhost:3000/api/admin/orders/PED-2026-1468/refunds \
  -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' \
  -d '{"reason":"aplazamiento"}'; echo
```

**Resultado esperado:**

```text
{"id":"RE-PED-2026-1468-1","order_id":"PED-2026-1468","amount_cents":6130,"reason":"aplazamiento","gateway_id":"manual_ch_seed_1468","tickets":["PED-2026-1468-1","PED-2026-1468-2"]}
```

**Cómo se lee:** 61,30 € devueltos donde la política dice 59,50 €. La respuesta a `INC-0003` es que **no**: los gastos
no se devuelven en un aplazamiento, y el sistema se los está devolviendo a todos por error.

## Comprueba tu entendimiento

**La política es contexto, no solo contraste**
En una conversación nueva, modo **Ask**, con `#file:teatralia/docs/politica-devoluciones.md`, pregunta: «Un cliente devuelve dos entradas de 18,25 € por petición propia. ¿Cuánto se le devuelve?».
→ 32,85 € (el ejemplo del apartado 3), sin gastos.

**El documento dice quién manda**
`grep -c "el error está en el sistema" teatralia/docs/politica-devoluciones.md`
→ `1`: la política se declara fuente de verdad; si no lo dijera, la divergencia habría que llevarla a negocio antes de tocar el código.

## Mejora

### Corrige el código y protégelo con un test

Escribes primero el test con la regla de la política y lo ves fallar; después corriges `calcRefund` y lo ves pasar.

```bash
# Desde teatralia/: test con los apartados 1 y 2 de la política
cat > services/api/test/politica-devoluciones.test.ts <<'EOF'
// Reglas de docs/politica-devoluciones.md que cumple calcRefund
import { describe, expect, it } from 'vitest';
import { calcRefund } from '../src/orders/refunds.js';

// Las dos entradas de PED-2026-1468 (Fado y saudade, evento aplazado)
const ped1468 = [
  { id: 'PED-2026-1468-1', price_cents: 2400, fee_cents: 90 },
  { id: 'PED-2026-1468-2', price_cents: 3550, fee_cents: 90 },
];

describe('política de devoluciones', () => {
  it('§1 cancelación: se devuelven precio y gastos', () => {
    expect(calcRefund(ped1468, 'cancelación')).toBe(6130);
  });
  it('§2 aplazamiento: se devuelve el precio, los gastos no', () => {
    expect(calcRefund(ped1468, 'aplazamiento')).toBe(5950);
  });
});
EOF
npx vitest run services/api/test/politica-devoluciones.test.ts --reporter=verbose 2>&1 | grep -E "✓|×|AssertionError|Tests "
```

**Resultado esperado** (antes de corregir):

```text
 ✓ |api| test/politica-devoluciones.test.ts > política de devoluciones > §1 cancelación: se devuelven precio y gastos 1ms
 × |api| test/politica-devoluciones.test.ts > política de devoluciones > §2 aplazamiento: se devuelve el precio, los gastos no 4ms
AssertionError: expected 6130 to be 5950 // Object.is equality
      Tests  1 failed | 1 passed (2)
```

Ahora pides la corrección con la política como contexto, en modo **Edit**:

```text
#file:teatralia/docs/politica-devoluciones.md #file:teatralia/services/api/src/orders/refunds.ts
Corrige calcRefund para que cumpla el apartado 2 de la política (aplazamiento). No cambies
ningún otro motivo de reembolso.
```

Pulsa **Keep** y repite el test, y después el reembolso por la API con otro pedido del mismo evento:

```bash
# El test, otra vez
npx vitest run services/api/test/politica-devoluciones.test.ts --reporter=verbose 2>&1 | grep -E "✓|×|Tests "
# Otro pedido de Fado y saudade (dos entradas de 35,50 € con 0,90 € de gastos)
curl -s -X POST localhost:3000/api/admin/orders/PED-2026-1553/refunds \
  -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' \
  -d '{"reason":"aplazamiento"}'; echo
```

**Resultado esperado:**

```text
 ✓ |api| test/politica-devoluciones.test.ts > política de devoluciones > §1 cancelación: se devuelven precio y gastos 1ms
 ✓ |api| test/politica-devoluciones.test.ts > política de devoluciones > §2 aplazamiento: se devuelve el precio, los gastos no 0ms
      Tests  2 passed (2)
{"id":"RE-PED-2026-1553-1","order_id":"PED-2026-1553","amount_cents":7100,"reason":"aplazamiento","gateway_id":"manual_ch_seed_1553","tickets":["PED-2026-1553-1","PED-2026-1553-2"]}
```

**Cómo se lee:** 7100 = 2 × 3550, sin gastos. Comprueba también con `git diff` que Copilot no ha tocado la rama de
«petición del cliente»: tu prompt pedía cambiar solo el aplazamiento.

<details>
<summary>Solución de referencia (<code>calcRefund</code>)</summary>

```diff
-    if (reason === 'cancelación' || reason === 'aplazamiento') {
+    if (reason === 'cancelación') {
       total += t.price_cents + t.fee_cents;
+    } else if (reason === 'aplazamiento') {
+      // política §2: en un aplazamiento los gastos de gestión no se devuelven
+      total += t.price_cents;
     } else if (reason === 'petición del cliente') {
```

</details>

> [!TIP]
> Para que no vuelva a pasar, añade a `.github/copilot-instructions.md` una línea como «Devoluciones: la fuente de
> verdad es `teatralia/docs/politica-devoluciones.md`; cualquier cambio en `refunds.ts` se contrasta con ella». Así la
> política entra en el razonamiento aunque nadie la adjunte.

## Reto

### 1 — El doble cobro de un pedido ya reembolsado en parte

**La situación:** `PED-2026-1463` (Sala Faro) ya tuvo un reembolso parcial de dos entradas. Ahora Finanzas detecta que
la pasarela cobró ese pedido dos veces y alguien del equipo propone lanzar desde el backoffice un reembolso con motivo
«doble cobro». La política (§4) dice que se devuelve el **cargo duplicado completo**.

**Qué haces:** antes de lanzarlo, pregunta a Copilot, con la política y `refunds.ts` adjuntos, qué importe devolverá
`refundOrder` y qué pasará con la entrada que sigue válida. Después lánzalo y compruébalo:

```bash
# Estado previo, reembolso por doble cobro y estado final
psql "$DATABASE_URL" -c "SELECT id, status, total_cents, refunded_cents FROM orders WHERE id = 'PED-2026-1463'"
curl -s -X POST localhost:3000/api/admin/orders/PED-2026-1463/refunds \
  -H 'authorization: Bearer faro-dev-token' -H 'content-type: application/json' \
  -d '{"reason":"doble cobro"}'; echo
psql "$DATABASE_URL" -c "SELECT t.id, t.status FROM tickets t WHERE t.order_id = 'PED-2026-1463' ORDER BY t.id"
```

**Pistas:** mira qué entradas usa `refundOrder` para calcular el importe (las válidas) y qué hace con ellas después.
Un doble cobro es un problema del cargo, no de las entradas.

**Lo que buscas:** el importe que se devuelve frente al que dice la política, y si el cliente conserva su entrada.

<details>
<summary>Ver solución</summary>

Salida real:

```text
      id       |       status       | total_cents | refunded_cents 
---------------+--------------------+-------------+----------------
 PED-2026-1463 | partially_refunded |       11720 |           7110
(1 row)

{"id":"RE-PED-2026-1463-2","order_id":"PED-2026-1463","amount_cents":3640,"reason":"doble cobro","gateway_id":"manual_ch_seed_1463","tickets":["PED-2026-1463-3"]}
       id        |  status  
-----------------+----------
 PED-2026-1463-1 | refunded
 PED-2026-1463-2 | refunded
 PED-2026-1463-3 | refunded
(3 rows)
```

Dos divergencias con la política. El cargo duplicado era de 117,20 € (`total_cents`) y se devuelven 36,40 €: el código
calcula sobre las entradas válidas que quedan, no sobre el cargo. Y la entrada `PED-2026-1463-3`, que el cliente había
pagado y no quería devolver, queda anulada (§6: «una entrada devuelta deja de ser válida»). Aquí la política manda, pero
el arreglo no es trivial (un doble cobro no debería pasar por las entradas): es una decisión de diseño que se lleva al
equipo con estos datos, no un cambio que se acepta con **Keep**. **La regla:** la documentación funcional sirve a
Copilot para encontrar divergencias; decidir cómo se resuelven sigue siendo del equipo, con los datos delante.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| El reembolso responde 409 «no se puede reembolsar un pedido refunded» | Ya lo reembolsaste en un intento anterior | `CONFIRM=1 make reset` y repite |
| El test sigue en rojo después de **Keep** | Copilot cambió otra rama o no guardó | `git diff teatralia/services/api/src/orders/refunds.ts` y revisa la rama de `'aplazamiento'` |
| El reembolso por API sigue devolviendo 6130 tras el arreglo | La API no se ha recargado | Mira la terminal de `make up`; si hay un error de compilación, corrígelo y guarda |
| Copilot propone cambiar la política | El prompt no decía cuál es la fuente de verdad | Cita la línea 6 de la política en el prompt |

## Conclusiones

### Qué es la documentación como fuente de verdad

Un documento funcional (aquí, la política de devoluciones) que el equipo acuerda que manda sobre el código. Con
Copilot sirve dos veces: como **contexto** para generar código que la cumpla y como **contraste** para revisar el que
ya existe.

```text
política ─┬─ contexto ─► Copilot genera o corrige ─► test con el ejemplo de la política
          └─ contraste ─► Copilot compara ─► datos (calcRefund, refunds, API) confirman o descartan
```

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| El documento dice que manda | Líneas 5 y 6 de la política |
| Reglas con ejemplos numéricos | «36,50 € − 10 % = 32,85 €» |
| Cada divergencia, confirmada con datos | `calcRefund` 6130/6130, 14 devoluciones con 25,40 € de gastos |
| La corrección, protegida con un test | `politica-devoluciones.test.ts` en rojo y luego en verde |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Código que no sigue la política | Aplazamiento: 6130 en lugar de 5950 | 25,40 € de gastos devueltos de más |
| Divergencia que no es un cambio de una línea | Reto: el doble cobro anula una entrada válida | Un «arreglo» rápido rompería otra regla |
| Copilot no encuentra la divergencia | Puede pasar en el paso 2 | Por eso se confirma con `calcRefund` y la base de datos |

### Cómo se perfecciona

Los ejemplos numéricos de la política se convierten en tests (uno por apartado) y la política se cita en las
instrucciones del repositorio. Cuando el documento cambia de versión, los tests que fallan dicen qué código revisar.

### En una frase

> 🔑 La documentación funcional da a Copilot las reglas y a ti la vara de medir; cuando no coincide con el código,
> manda quien el equipo haya decidido, y los datos dicen cuánto ha costado la diferencia.
