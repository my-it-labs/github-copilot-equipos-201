# Laboratorio: especificación desde un issue

[← Página anterior](01-lab-preguntas-aclaratorias.md) · [Siguiente página →](03-lab-analisis-de-impacto.md)

Los promotores de Teatralia quieren **códigos de descuento** (issue **TEA-104**): porcentaje o importe fijo, con
caducidad y máximo de usos, que el comprador introduce al pagar. El issue cabe en seis líneas; quien lo implemente
tendrá que decidir una docena de cosas que no dice. En este laboratorio conviertes el issue, con Copilot, en una
**especificación**: reglas numeradas y criterios de aceptación Dado / Cuando / Entonces con importes reales de un
pedido de Teatralia, y compruebas cada número contra la base de datos.

### Objetivo

Comprender cómo se pasa de un requisito de negocio a una especificación verificable: cómo funciona (reglas +
ejemplos), cómo debe ser un criterio de aceptación, cómo se detecta un criterio que no se puede comprobar o que
contradice el sistema y cómo se mejora con datos reales.

### Punto de partida

- Codespace del fork, terminal en la raíz del repositorio.
- Estado limpio (la plataforma no hace falta arrancada; solo la base de datos, que el Codespace ya levanta):

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- Copilot Chat: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>, modo **Ask**.

### Qué está pasando

Una especificación separa dos cosas que el issue mezcla: las **reglas** (lo que siempre se cumple: «el descuento no
se aplica a los gastos de gestión») y los **criterios de aceptación** (ejemplos concretos que prueban una regla:
«con un 10 % sobre PED-2026-0107 el total es 12060 céntimos»). El criterio usa el formato Dado / Cuando / Entonces
(*Given / When / Then*) para que cualquiera, incluido un test, pueda ejecutarlo.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| El issue que llega del negocio | `teatralia/docs/backlog/TEA-104-codigos-de-descuento.md` |
| El ejemplo que todos entienden | El pedido de Ana, `PED-2026-0107`: dos butacas de 35,50 €, un VIP de 60 €, 133,70 € |
| La especificación que se aprueba | `teatralia/docs/specs/TEA-104-codigos-de-descuento.md` (la creas tú) |
| La comprobación de cada número | Consultas `psql` sobre ese pedido |

### 1 — Lee el issue

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

**Cómo se lee:** hay cinco reglas explícitas (tipo, caducidad, usos, promotor/evento, no acumular, no a gastos) y
ningún ejemplo. Faltan, entre otras: cómo se redondea un porcentaje, qué pasa si el descuento fijo supera el precio,
si la comisión de plataforma cambia y qué se devuelve si el pedido se reembolsa.

### 2 — Mira el pedido que vas a usar de ejemplo

Los criterios necesitan números de verdad. El pedido de referencia de Teatralia es `PED-2026-0107`. Míralo en crudo:
en el backoffice (**Pedidos**, busca `PED-2026-0107` con el token `faro-dev-token`) si tienes `make up` en marcha, o
en la base de datos:

```bash
# Cabecera y entradas del pedido de Ana
psql "$DATABASE_URL" -c "SELECT id, subtotal_cents, fee_cents, total_cents, commission_cents FROM orders WHERE id = 'PED-2026-0107';"
psql "$DATABASE_URL" -c "SELECT id, kind, coalesce(seat_id, pass_type_id) AS que, price_cents, fee_cents, commission_cents FROM tickets WHERE order_id = 'PED-2026-0107' ORDER BY id;"
```

**Resultado esperado:**

```text
      id       | subtotal_cents | fee_cents | total_cents | commission_cents 
---------------+----------------+-----------+-------------+------------------
 PED-2026-0107 |          13100 |       270 |       13370 |              982
(1 row)

       id        | kind |       que        | price_cents | fee_cents | commission_cents 
-----------------+------+------------------+-------------+-----------+------------------
 PED-2026-0107-1 | seat | F-12             |        3550 |        90 |              266
 PED-2026-0107-2 | seat | F-13             |        3550 |        90 |              266
 PED-2026-0107-3 | pass | EV-FARO-0042-VIP |        6000 |        90 |              450
(3 rows)
```

**Cómo se lee:** todo en céntimos. Subtotal 13100 (las entradas) + gastos 270 (0,90 € por entrada) = total 13370. La
comisión de plataforma (982) se calcula por entrada sobre el precio y no forma parte del total que paga el comprador.
Cada importe de la especificación tiene que salir de estas columnas.

### 3 — Pide la especificación a Copilot

Chat nuevo, modo **Ask**. Adjunta el issue y el cálculo de importes para que Copilot sepa qué es subtotal, gastos y
comisión en Teatralia:

```text
#file:teatralia/docs/backlog/TEA-104-codigos-de-descuento.md #file:teatralia/services/api/src/orders/pricing.ts
Convierte este issue en una especificación en Markdown con tres secciones:
1. Reglas numeradas (R1, R2…), una frase cada una, sin ambigüedad.
2. Criterios de aceptación CA-01, CA-02… en formato Dado / Cuando / Entonces, cada uno con la regla que prueba.
   Usa el pedido PED-2026-0107: butacas F-12 y F-13 a 3550 céntimos, VIP a 6000, gastos 90 por entrada,
   subtotal 13100, total 13370. Todos los importes en céntimos.
3. Preguntas abiertas: lo que el issue no decide y no debes inventar.
Incluye criterios para: porcentaje, importe fijo, gastos intactos, redondeo, caducado, sin usos,
otro evento, otro promotor, no acumular y alta en el backoffice.
```

**Qué debe contener la respuesta** (cambia en cada ejecución):

- Reglas para: promotor y evento, tipo porcentaje/fijo, caducidad y usos, un código por pedido, descuento sobre el
  subtotal y no sobre los gastos.
- Un criterio de porcentaje con PED-2026-0107. Con un 10 %, el número correcto es **descuento 1310, total 12060**.
- Preguntas abiertas que no se decidan solas: comisión sobre precio con o sin descuento, devolución de un pedido con
  descuento.

Copia la respuesta a un fichero nuevo, `teatralia/docs/specs/TEA-104-codigos-de-descuento.md` (crea la carpeta
`specs` en el explorador o con `mkdir -p teatralia/docs/specs`). Los pasos siguientes la corrigen.

### 4 — Comprueba los importes de los criterios con la base de datos

Cada número de un criterio es una afirmación. Calcúlalos sobre el pedido real, incluido el error típico de aplicar el
porcentaje al total (con gastos):

```bash
# Descuento del 10 %, de 5 € y el 10 % aplicado por error también a los gastos
psql "$DATABASE_URL" -c "
SELECT subtotal_cents, fee_cents,
       round(subtotal_cents * 0.10) AS dto_10,
       total_cents - round(subtotal_cents * 0.10) AS total_con_10,
       total_cents - 500 AS total_con_5_eur,
       total_cents - round(total_cents * 0.10) AS total_si_incluye_gastos
  FROM orders WHERE id = 'PED-2026-0107';"
```

**Resultado esperado:**

```text
 subtotal_cents | fee_cents | dto_10 | total_con_10 | total_con_5_eur | total_si_incluye_gastos 
----------------+-----------+--------+--------------+-----------------+-------------------------
          13100 |       270 |   1310 |        12060 |           12870 |                   12033
(1 row)
```

**Cómo se lee:**

| Criterio | Valor correcto | Si sale otro número |
|----------|----------------|---------------------|
| 10 % sobre PED-2026-0107 | total 12060 | 12033 → el descuento se aplica a los gastos (contra la regla del issue) |
| 5 € fijos | total 12870 | 12870 − 270 u otro → se han restado los gastos o se ha mezclado euros y céntimos |

Corrige en tu fichero cada número que no coincida. Si Copilot escribió `120,60 €` en vez de `12060`, pásalo a
céntimos: es la convención de Teatralia y lo que un test comparará.

### 5 — Comprueba que cada pregunta abierta no tiene ya respuesta en el código

Dos preguntas que suelen salir: ¿la comisión se calcula sobre el precio con descuento? ¿cuánto se devuelve de un
pedido con descuento? Mira qué hace hoy el código con la comisión y con los reembolsos:

```bash
# La comisión, por entrada y sobre el precio
grep -n "commission_bps" teatralia/services/api/src/orders/pricing.ts
# Lo que suma un reembolso por entrada
grep -n "total +=" teatralia/services/api/src/orders/refunds.ts
```

**Resultado esperado:**

```text
12:  commission_bps: number;
44:    let c = (p * ev.commission_bps) / 10000;
20:      total += t.price_cents + t.fee_cents;
23:      total += Math.floor(t.price_cents * 0.9);
25:      total += t.price_cents + t.fee_cents;
```

**Cómo se lee:** la comisión sale de `price_cents` de cada entrada; un reembolso suma `price_cents` (y gastos) de cada
entrada. Ninguno de los dos sabe que exista un descuento. Si nadie lo decide, un pedido con un 10 % se devolverá
entero, más de lo cobrado. Son preguntas abiertas de verdad: van a la sección 3 de la especificación, dirigidas a
Finanzas, y no se resuelven en el código por intuición.

### 6 — Revisa la especificación entera con una lista de comprobación

Último pase con Copilot, en el mismo chat, adjuntando tu fichero ya corregido:

```text
#file:teatralia/docs/specs/TEA-104-codigos-de-descuento.md
Revisa esta especificación como QA. Para cada criterio, dime: a) qué regla prueba;
b) si se puede ejecutar contra la API o un test sin interpretar nada; c) si falta un dato.
Dime también qué regla no tiene ningún criterio. No reescribas el documento.
```

**Qué debe contener la respuesta:** una tabla o lista criterio → regla → «ejecutable sí/no». Suele señalar criterios
sin datos («un código caducado» sin fecha) y reglas sin ejemplo. Completa lo que falte y compara con la solución.

<details>
<summary>Especificación de referencia</summary>

```markdown
# TEA-104 · Códigos de descuento por promotor — especificación

Origen: issue TEA-104. Importes en céntimos; ejemplos con el carrito de PED-2026-0107
(Sala Faro, *Jazz en el Faro*: butacas F-12 y F-13 a 35,50 € y un VIP a 60 €; gastos 0,90 € por entrada).

## Reglas

- R1. Un código pertenece a un promotor y solo vale en sus eventos.
- R2. Un código es de porcentaje (1 a 100) o de importe fijo (céntimos).
- R3. Un código puede limitarse a un evento; sin evento, vale para todos los del promotor.
- R4. Un código tiene fecha de caducidad y número máximo de usos.
- R5. Un pedido lleva como mucho un código.
- R6. El descuento se aplica al subtotal de las entradas, nunca a los gastos de gestión.
- R7. El descuento nunca deja el subtotal por debajo de cero.
- R8. El porcentaje se redondea al céntimo más cercano sobre el subtotal del pedido.
- R9. El código no distingue mayúsculas ni espacios al principio o al final.

## Criterios de aceptación

- CA-01 (R2, R6) **Porcentaje.** Dado el código `NAVIDAD10` (10 %) de Sala Faro, cuando el comprador paga el carrito
  de PED-2026-0107 con ese código, entonces el descuento es 1310 y el total 12060 (13100 − 1310 + 270).
- CA-02 (R2) **Importe fijo.** Dado `FARO5` (500 céntimos), con el mismo carrito, el descuento es 500 y el total 12870.
- CA-03 (R6, R7) **Gastos intactos.** Dado `FARO30` (3000 céntimos) y un pase «De pie» de 1800, el descuento es 1800 y
  el total 90: se pagan los gastos.
- CA-04 (R8) **Redondeo.** Con un 15 % sobre un subtotal de 3650, el descuento es 548.
- CA-05 (R4) **Caducado.** Dado un código caducado, el pedido se rechaza con «el código de descuento ha caducado» y no se crea.
- CA-06 (R4) **Sin usos.** Dado un código con 2 usos máximos ya consumidos, el tercer pedido se rechaza con
  «el código de descuento ya no tiene usos».
- CA-07 (R3) **Otro evento.** Dado un código limitado a EV-FARO-0042, un pedido de EV-FARO-0047 se rechaza.
- CA-08 (R1) **Otro promotor.** El código de Sala Faro en un pedido del Teatro Lumen se rechaza con «código de descuento no válido».
- CA-09 (R5) **Sin acumular.** Un pedido no admite dos códigos.
- CA-10 (R9) **Mayúsculas.** `navidad10` y ` NAVIDAD10 ` aplican el mismo código.
- CA-11 (R1–R4) **Alta en el backoffice.** El promotor crea un código en **Descuentos** y lo ve en la lista con sus usos (0 / N).

## Preguntas abiertas (no implementadas)

- P1. ¿La comisión de plataforma (7,5 %) se calcula sobre el precio con descuento o sin él? Finanzas.
- P2. ¿Cuánto se devuelve de un pedido con descuento? La política de devoluciones no lo dice.
- P3. ¿Un pedido que no llega a pagarse consume un uso del código?
```

R7 y R8 no están en el issue: son decisiones del equipo que se proponen al promotor junto con la especificación.

</details>

## Comprueba tu entendimiento

**Un criterio, un número comprobable**
Elige CA-02 de tu especificación y calcula su total con `psql` sobre PED-2026-0107.
→ 12870; si tu criterio dice otra cosa o no da número, no es un criterio todavía.

**Regla sin criterio**
Busca en tu fichero una regla cuyo número (R1…R9) no aparezca en ningún criterio.
→ Si la hay, falta un ejemplo; en la de referencia todas las reglas aparecen al menos una vez.

## Experimenta

**Predice antes:** con un 15 % sobre dos entradas de 18,25 € (subtotal 3650), ¿el descuento es 547 o 548 céntimos?

```bash
# El cálculo exacto y los dos redondeos posibles
node -e "const s=3650, p=15; console.log('exacto', s*p/100, 'round', Math.round(s*p/100), 'floor', Math.floor(s*p/100))"
```

```text
exacto 547.5 round 548 floor 547
```

Las dos respuestas son defendibles y el issue no elige. Teatralia ya tiene un fallo de un céntimo por usar
`Math.floor` en los reembolsos (TEA-106): dejar el redondeo escrito en una regla (R8) y en un criterio (CA-04) es lo
que evita repetirlo. Prueba a quitar «redondeo» de la lista del prompt del paso 3 en un chat nuevo: lo habitual es que
la especificación ya no lo mencione.

## Reto

### 1 — El criterio que delata la implementación equivocada

**La situación:** un compañero ha implementado los descuentos aplicando el porcentaje al `total_cents` del pedido,
«que es lo que paga el cliente». Dice que tus criterios no lo pillan porque «con descuentos pequeños apenas cambia».

**Qué haces:** escribe un criterio Dado / Cuando / Entonces sobre un pedido real de Teatralia en el que la diferencia
entre las dos implementaciones sea lo más grande posible, y calcula con `psql` el total correcto y el del compañero.

**Pistas:** la diferencia es `round(total × p) − round(subtotal × p)`, es decir, el porcentaje de los gastos; crece con
los gastos y con el porcentaje. Busca en `orders` el pedido con más `fee_cents` (`ORDER BY fee_cents DESC LIMIT 1`) y
usa un 100 %.

**Lo que buscas:** un criterio en el que las dos implementaciones den totales distintos y el correcto deje
exactamente los gastos.

<details>
<summary>Ver solución</summary>

```bash
psql "$DATABASE_URL" -c "
SELECT id, subtotal_cents, fee_cents, total_cents,
       total_cents - subtotal_cents AS total_correcto_100,
       total_cents - total_cents    AS total_companero_100
  FROM orders ORDER BY fee_cents DESC, id LIMIT 1;"
```

```text
      id       | subtotal_cents | fee_cents | total_cents | total_correcto_100 | total_companero_100 
---------------+----------------+-----------+-------------+--------------------+---------------------
 PED-2026-0004 |          23400 |       900 |       24300 |                900 |                   0
(1 row)
```

Criterio: *Dado un código de 100 % del Festival Alborada, cuando el comprador paga el carrito de PED-2026-0004 (seis
pases de *Alborada 2026*, gastos 900), entonces el descuento es 23400 y el total 900.* Con la implementación del compañero el total
es 0: Teatralia regala los gastos de gestión, que son ingresos de la plataforma. **La regla:** un buen criterio de
aceptación elige el ejemplo donde las implementaciones equivocadas dan resultados distintos; un ejemplo «normal» suele
aprobar también el código mal hecho.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| Los criterios dan importes en euros con decimales (`120,60 €`) | El prompt no fija la unidad o Copilot sigue el formato de la tienda | Pásalos a céntimos; añade «Todos los importes en céntimos» al prompt |
| El total con 10 % sale 12033 | El descuento se aplica al total, gastos incluidos | Recalcula sobre `subtotal_cents` (paso 4) |
| Copilot «resuelve» la comisión o la devolución | Le has pedido criterios para todo sin pedir preguntas abiertas | Sección 3 del prompt: «lo que no debes inventar» |
| `ERROR: relation "orders" does not exist` | La base de datos está vacía | `make db-reset` |
| `teatralia/docs/specs/` desaparece | `make reset` borra lo que no está en el repositorio | Guarda la especificación con un commit en una rama antes de resetear |

## Conclusiones

### Qué es una especificación verificable

Es el issue reescrito como **reglas** (lo que siempre se cumple) y **criterios de aceptación** (ejemplos que lo
demuestran) con datos reales del sistema. Copilot la redacta deprisa; el valor está en que cada número se ha
comprobado y cada hueco está escrito como pregunta.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Reglas numeradas, una idea cada una | R1…R9 |
| Cada criterio prueba una regla y la nombra | `CA-01 (R2, R6)` |
| Importes en la unidad del sistema | 13100, 1310, 12060 céntimos |
| Ejemplo real, reproducible | PED-2026-0107 consultado con `psql` |
| Lo no decidido, escrito como pregunta | P1 comisión, P2 devolución, P3 uso en pedidos sin pagar |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Descuento aplicado a los gastos | 12033 frente a 12060 en el paso 4 | Contra la regla explícita del issue |
| Redondeo no decidido | 547,5 → 547 o 548 (Experimenta) | Otro fallo de un céntimo como TEA-106 |
| Comisión y reembolso sin decidir | `grep` en `pricing.ts` y `refunds.ts` | Devolver más de lo cobrado |
| Criterio que aprueba el código malo | Reto: el 100 % separa las dos implementaciones | Tests en verde con la regla rota |

### Cómo se perfecciona

La especificación se versiona junto al código (`docs/specs/`), se enlaza desde el issue y se revisa en la PR igual que
el código. Cada criterio se convierte después en un test o en una comprobación con `curl`, y la matriz de
trazabilidad (laboratorio [08](08-lab-trazabilidad.md)) demuestra cuáles lo están.

### En una frase

> 🔑 Un requisito se vuelve especificación cuando cada regla tiene un ejemplo con números reales del sistema y cada decisión que falta está escrita como pregunta, no inventada.
