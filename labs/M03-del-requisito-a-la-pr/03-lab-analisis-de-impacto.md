# Laboratorio: análisis de impacto

[← Página anterior](02-lab-especificacion-desde-un-issue.md) · [Siguiente página →](04-lab-plan-antes-de-ejecutar.md)

El Teatro Lumen quiere vender un **abono de temporada** (issue **TEA-105**): una butaca fija para todas las funciones
de teatro de la temporada con un 20 % de descuento. Antes de estimar o planificar, el equipo necesita saber **qué
piezas de Teatralia toca**: tablas, rutas, pantallas y datos existentes. En este laboratorio pides a Copilot ese
análisis de impacto y verificas cada pieza con `grep` y `psql`, porque una lista de impacto con un fichero que no
existe, o sin el que sí importa, es peor que no tener lista.

### Objetivo

Comprender qué es un análisis de impacto sobre un sistema existente: cómo se hace, cómo debe ser (cada pieza con su
fuente y su motivo), cómo se detectan las piezas inventadas u olvidadas y cómo se mejora con consultas a los datos.

### Punto de partida

- Codespace del fork, terminal en la raíz del repositorio.
- Estado limpio (la base de datos ya está levantada en el Codespace):

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- Copilot Chat: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>, modo **Ask**.

### Qué está pasando

Teatralia se pensó para vender entradas de **un** evento por pedido. El abono de temporada cruza eventos: una persona,
una butaca, varias funciones, un solo pago. Cuanto más se aleja una petición del modelo existente, más piezas toca y
más fácil es olvidar una (el correo de confirmación, el reembolso de una función cancelada, el límite de 10 entradas).

| En la realidad | En este laboratorio |
|----------------|---------------------|
| La petición del Teatro Lumen | `teatralia/docs/backlog/TEA-105-abono-de-temporada.md` |
| «¿Qué toca esto?» en el refinamiento | Copilot en modo Ask con `#codebase` |
| Comprobar que la pieza existe y por qué se toca | `grep -rn` sobre `teatralia/` |
| Saber a qué datos reales afecta | `psql` sobre eventos, butacas y entradas del Teatro Lumen |

### 1 — Lee la petición

```bash
# El issue del abono
cat teatralia/docs/backlog/TEA-105-abono-de-temporada.md
```

**Resultado esperado:**

```text
---
titulo: "Abono de temporada"
etiquetas: [petición de negocio]
---
El Teatro Lumen quiere vender un abono de temporada: una butaca fija para todas las funciones de teatro de la temporada,
con un 20 % de descuento sobre el precio de las entradas sueltas.
```

**Cómo se lee:** cuatro conceptos que hay que buscar en el sistema: *butaca fija*, *funciones de teatro*, *temporada*
y *20 % sobre las entradas sueltas*. Para cada uno, la pregunta del impacto es: ¿existe ya? ¿dónde? ¿qué cambia?

### 2 — Pide el análisis de impacto

Chat nuevo, modo **Ask**:

```text
#file:teatralia/docs/backlog/TEA-105-abono-de-temporada.md #codebase
Haz el análisis de impacto de esta petición sobre Teatralia, sin proponer la solución. Tabla con columnas:
pieza (tabla, ruta de API, pantalla, job, test o dato), fichero y línea, qué hay hoy, por qué la toca el abono.
Incluye solo piezas que hayas visto en el código. Después, lista los conceptos de la petición que no existen
en Teatralia.
```

**Qué debe contener la respuesta** (varía en cada ejecución):

- Tablas: `events`, `seats`, `orders`, `tickets` (migraciones `001_init.sql` y `002_teatralia.sql`), probablemente
  `pass_types`.
- Código: `calcOrderAmounts` en `orders/pricing.ts`, `createOrder` en `orders/service.ts`, `calcRefund` en
  `orders/refunds.ts`, las rutas de `routes/public.ts` y `routes/admin.ts`.
- Conceptos que no existen: temporada, abono que cruce eventos.

Guarda la tabla. Cada fila se verifica en los pasos siguientes; marca las que no tengan fichero y línea.

### 3 — Busca si «abono» ya existe

Antes de crear un concepto, busca si el sistema ya usa la palabra:

```bash
# La palabra «abono» en código, SQL y datos
grep -rn "abono" teatralia --include=*.ts --include=*.tsx --include=*.sql --exclude-dir=node_modules
```

**Resultado esperado:**

```text
teatralia/services/api/src/seed-data.ts:138:  // Festival Alborada (Valencia): solo pases, abonos de varios días
teatralia/services/api/src/seed-data.ts:141:  { id: 'EV-ALBORADA-2027', venueId: 'VN-ALBORADA', title: 'Alborada 2027: abono tres días', category: 'festival', startsAt: '2027-06-18T17:00:00+02:00', status: 'on_sale', feeCents: 150, seated: false, passes: [{ code: 'ABO', name: 'Abono 3 días', description: 'Acceso viernes, sábado y domingo', priceCents: 11900, capacity: 1800 }, VIP(24900, 150)], demand: 0.12 },
```

**Cómo se lee:** «abono» ya existe, pero significa otra cosa: un **pase** (`pass_types`) de **un único evento** del
Festival Alborada que da acceso a tres días. El abono de temporada del Lumen es una butaca en **varios eventos**.
Si Copilot o el equipo reutilizan `pass_types` porque «ya hay abonos», el modelo no sirve. El impacto incluye el
vocabulario: hay que llamar distinto a las dos cosas (por ejemplo, *abono de temporada* frente a *pase de varios días*).

### 4 — Comprueba qué tablas atan una venta a un solo evento

El abono cruza eventos. Busca qué tablas exigen un evento:

```bash
# Columnas event_id obligatorias en el esquema inicial
grep -n "event_id  *text NOT NULL" teatralia/services/api/migrations/001_init.sql
```

**Resultado esperado:**

```text
34:  event_id    text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
42:  event_id    text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
56:  event_id         text NOT NULL REFERENCES events(id),
71:  event_id         text NOT NULL REFERENCES events(id),
```

**Cómo se lee:** abre `001_init.sql` en esas líneas: son `pass_types` (34), `seats` (42), `orders` (56) y `tickets`
(71). Un **pedido** tiene exactamente un evento. Un abono de dos funciones son dos pedidos (dos cobros, dos correos) o
un cambio en `orders`, el corazón de la compra. Esa es la decisión de diseño más cara del issue, y sale de una línea
del esquema.

### 5 — Mira los datos del Teatro Lumen

«Todas las funciones de teatro de la temporada». ¿Cuáles son hoy?

```bash
# Eventos del Teatro Lumen: categoría, fecha, butacas y entradas vendidas
psql "$DATABASE_URL" -c "
SELECT e.id, e.title, e.category, e.status, e.starts_at::date AS fecha,
       (SELECT count(*) FROM seats s WHERE s.event_id = e.id) AS butacas,
       (SELECT count(*) FROM tickets k WHERE k.event_id = e.id AND k.status = 'valid') AS vendidas
  FROM events e JOIN tenants t ON t.id = e.tenant_id
 WHERE t.slug = 'teatro-lumen' ORDER BY e.starts_at;"
```

**Resultado esperado:**

```text
      id       |             title              | category |  status   |   fecha    | butacas | vendidas 
---------------+--------------------------------+----------+-----------+------------+---------+----------
 EV-LUMEN-0005 | La casa de Bernarda Alba       | teatro   | on_sale   | 2026-10-24 |     224 |      185
 EV-LUMEN-0007 | Impro a la carta               | humor    | on_sale   | 2026-12-05 |       0 |       67
 EV-LUMEN-0009 | Esperando a Godot              | teatro   | on_sale   | 2026-12-17 |     224 |      101
 EV-LUMEN-0010 | Cuentos para dormir despiertos | familiar | on_sale   | 2026-12-27 |     224 |      140
 EV-LUMEN-0012 | Monólogos de enero             | humor    | cancelled | 2027-01-16 |       0 |        0
 EV-LUMEN-0014 | Bodas de sangre                | teatro   | on_sale   | 2027-03-06 |     224 |       42
(6 rows)
```

**Cómo se lee:**

| Dato | Impacto |
|------|---------|
| Tres eventos `teatro`, uno ya celebrado (24 de octubre) | ¿La temporada ya ha empezado? ¿El abono baja de precio? |
| *Cuentos para dormir despiertos* es `familiar` | ¿Cuenta como «función de teatro»? Pregunta al promotor |
| No hay campo de temporada en `events` | «Temporada» no existe: se define por fechas, por lista o con una tabla nueva |
| 185, 101 y 42 entradas ya vendidas | Las butacas fijas compiten con entradas sueltas que ya existen |

### 6 — Comprueba que una butaca es «la misma» en todas las funciones

«Butaca fija» supone que la F-12 de *Esperando a Godot* es la F-12 de *Bodas de sangre*. En Teatralia cada evento
tiene sus propias filas en `seats`:

```bash
# La misma butaca en las tres funciones de teatro: zona y precio por función
psql "$DATABASE_URL" -c "
SELECT s.id, s.zone, string_agg(s.event_id || ':' || s.price_cents, '  ' ORDER BY s.event_id) AS precio_por_funcion
  FROM seats s JOIN events e ON e.id = s.event_id
 WHERE e.tenant_id = 'TN-LUMEN' AND e.category = 'teatro' AND s.id IN ('F-12', 'P1-1')
 GROUP BY s.id, s.zone;"
```

**Resultado esperado:**

```text
  id  |  zone  |                     precio_por_funcion                     
------+--------+------------------------------------------------------------
 F-12 | platea | EV-LUMEN-0005:2800  EV-LUMEN-0009:2800  EV-LUMEN-0014:2800
 P1-1 | palco  | EV-LUMEN-0005:4500  EV-LUMEN-0009:4500  EV-LUMEN-0014:4500
(2 rows)
```

**Cómo se lee:** el identificador coincide (`F-12`) y hoy el precio también, pero nada en el esquema lo garantiza:
son filas distintas por evento. Si el promotor cambia el plano o el precio de una función, «butaca fija» deja de
tener sentido. Es una restricción que el abono añade a los datos existentes.

### 7 — Mide cuántas butacas se pueden ofrecer hoy en abono

Una butaca fija tiene que estar libre en **todas** las funciones que quedan. Cuéntalo:

```bash
# Butacas libres a la vez en las dos funciones de teatro que quedan
psql "$DATABASE_URL" -c "
SELECT count(*) AS libres_en_las_dos
  FROM seats s
 WHERE s.event_id = 'EV-LUMEN-0009'
   AND NOT EXISTS (SELECT 1 FROM tickets t
                    WHERE t.seat_id = s.id AND t.status IN ('pending', 'valid')
                      AND t.event_id IN ('EV-LUMEN-0009', 'EV-LUMEN-0014'));"
```

**Resultado esperado:**

```text
 libres_en_las_dos 
-------------------
               105
(1 row)
```

**Cómo se lee:** de 224 butacas, 105 están libres en las dos funciones. Las demás ya tienen entradas sueltas en alguna.
El impacto en datos existentes es real: o el abono se limita a esas 105, o se decide qué pasa con los compradores
sueltos. Dato para el promotor, no para el código.

### 8 — Comprueba las reglas de la compra que el abono rompe

El abono pasa por el mismo cálculo de importes. Mira sus límites:

```bash
# Reglas del cálculo de importes
grep -n "10" teatralia/services/api/src/orders/pricing.ts
```

**Resultado esperado:**

```text
44:    let c = (p * ev.commission_bps) / 10000;
52:  // máximo 10 entradas por pedido (antirreventa)
53:  if (lines.length > 10) {
54:    throw new Error('máximo 10 entradas por pedido');
```

**Cómo se lee:** un pedido admite como mucho 10 entradas (regla antirreventa) y la comisión se calcula por entrada
sobre su precio. Una temporada con más de 10 funciones no cabe en un pedido; con el 20 % de descuento, hay que decidir
si la comisión del 7,5 % se calcula sobre el precio suelto o sobre el rebajado. Dos filas más para la tabla.

### 9 — Rehaz la tabla de impacto con lo verificado

Vuelve al chat del paso 2 y pide la tabla corregida con lo que has comprobado:

```text
Corrige la tabla de impacto con estos hechos verificados: "abono" ya existe como pass_type de un
solo evento (Festival Alborada, seed-data.ts:141); orders, tickets, seats y pass_types tienen
event_id NOT NULL (001_init.sql:34,42,56,71); no existe el concepto de temporada; las butacas son
filas por evento; 105 butacas libres en las dos funciones de teatro que quedan; máximo 10 entradas
por pedido (pricing.ts:53). Quita las filas que no tengan fichero y línea. Añade una columna
"riesgo" (alto, medio, bajo).
```

**Qué debe contener la respuesta:** la tabla sin filas inventadas, con `orders` como riesgo alto. Compárala con la
de referencia.

<details>
<summary>Tabla de impacto de referencia</summary>

| Pieza | Fichero | Hoy | Por qué la toca el abono | Riesgo |
|-------|---------|-----|--------------------------|--------|
| `orders.event_id NOT NULL` | `001_init.sql:56` | Un pedido = un evento | Un abono cubre varias funciones con un pago | Alto |
| `tickets` | `001_init.sql:71` | Una entrada por butaca y evento | Una entrada por función, todas del mismo abono | Alto |
| `seats` por evento | `001_init.sql:42` | La F-12 de cada función es una fila distinta | «Butaca fija» exige que coincida en todas | Medio |
| `pass_types` («Abono 3 días») | `seed-data.ts:141` | Pase de un evento | Mismo nombre, otro concepto: no reutilizar | Medio |
| Concepto «temporada» | — (no existe) | Eventos sueltos con `category` | Hay que definir qué funciones entran | Alto |
| `calcOrderAmounts` | `orders/pricing.ts:53` | Máximo 10 entradas; comisión por entrada | Temporadas de más de 10 funciones; comisión con 20 % | Medio |
| `createOrder` | `orders/service.ts` | Bloquea butacas de un evento | Bloquear la misma butaca en todas las funciones | Alto |
| `calcRefund` | `orders/refunds.ts` | Devuelve por entrada | Una función cancelada dentro de un abono | Medio |
| Correo de confirmación | `notifier/src/jobs.ts` | Uno por pedido | Uno por abono con todas las funciones | Bajo |
| Datos: 185 / 101 / 42 vendidas | `psql` | Entradas sueltas ya vendidas | Solo 105 butacas libres en las dos funciones | Medio |

Preguntas que salen del análisis: ¿*familiar* es teatro?, ¿la temporada ha empezado ya (función del 24 de octubre)?,
¿qué pasa si se cancela una función?, ¿comisión sobre precio suelto o rebajado?

</details>

## Comprueba tu entendimiento

**Una fila, una fuente**
Elige una fila de la tabla de Copilot y abre el fichero en la línea que cita.
→ La línea dice lo que la fila afirma; si no, la fila se corrige o se quita.

**Concepto que no existe**
Busca «temporada» en el código:

```bash
# «temporada» o «season» en código y SQL
grep -rni "temporada\|season" teatralia --include=*.ts --include=*.sql --exclude-dir=node_modules
```

→ Sin resultados: es un concepto nuevo y su definición es una pregunta al negocio, no una tabla que Copilot pueda deducir.

## Investiga

¿Afecta el abono a la validación en puerta? Mira primero la fuente: `teatralia/services/api/src/routes/tickets.ts`,
la ruta `POST /api/tickets/validate`. Fíjate en la línea que compara `req.body.event_id` con `ticket.event_id`. Después
busca quién más lee `event_id` en el código:

```bash
# Ficheros que leen o escriben event_id
grep -rln "event_id" teatralia/services teatralia/apps teatralia/packages --include=*.ts --include=*.tsx --exclude-dir=node_modules
```

```text
teatralia/services/notifier/src/jobs.ts
teatralia/services/api/src/routes/admin.ts
teatralia/services/api/src/seed.ts
teatralia/services/api/src/routes/public.ts
teatralia/services/api/src/routes/tickets.ts
teatralia/services/api/src/orders/service.ts
teatralia/services/api/src/orders/refunds.ts
teatralia/apps/backoffice/src/sections.tsx
teatralia/apps/backoffice/src/operations.tsx
teatralia/packages/ui/src/api.ts
```

Diez ficheros. Compáralos con la tabla de Copilot: ¿cuántos de los diez aparecían? Si el abono genera una entrada por
función, `tickets.ts` no cambia (cada QR sigue siendo de un evento); si genera un solo QR para toda la temporada, la
validación en puerta se rompe.

## Experimenta

**Predice antes:** si en el prompt del paso 2 quitas `#codebase` y dejas solo el issue, ¿cuántas filas de la tabla
tendrán un fichero real de Teatralia?

Hazlo en un chat nuevo. Lo habitual es una tabla plausible y genérica (`SeasonPass`, `subscriptions`, `/api/seasons`)
con nombres que no existen en el repositorio. Comprueba cada nombre con `grep -rn` y cuenta los que dan cero
resultados. La regla: un análisis de impacto sin el código delante describe un sistema imaginario.

## Reto

### 1 — El precio del abono con datos reales

**La situación:** el Teatro Lumen pregunta «¿cuánto costaría el abono de palco?». Un compañero responde de memoria:
«tres funciones a 45 €, menos el 20 %: 108 €». Tú quieres el precio que saldría hoy de los datos, para butacas que
de verdad se pueden vender en abono.

**Qué haces:** escribe una consulta que, para las funciones de teatro del Lumen que **todavía no se han celebrado**,
liste las butacas libres en todas ellas con el número de funciones, la suma de precios sueltos y el precio con el 20 %.

**Pistas:** filtra `e.starts_at > now()` y `e.category = 'teatro'`; agrupa por `s.id` y quédate con las que aparecen
en todas las funciones (`HAVING count(*) = …`); la butaca libre es la de la consulta del paso 7 (`NOT EXISTS`).

**Lo que buscas:** el precio de abono de una butaca de palco libre en todas las funciones que quedan y la diferencia
con la cifra del compañero.

<details>
<summary>Ver solución</summary>

```bash
psql "$DATABASE_URL" -c "
SELECT s.id AS butaca, s.zone,
       count(*) AS funciones,
       sum(s.price_cents) AS sueltas,
       round(sum(s.price_cents) * 0.8) AS abono_20
  FROM seats s JOIN events e ON e.id = s.event_id
 WHERE e.tenant_id = 'TN-LUMEN' AND e.category = 'teatro' AND e.starts_at > now()
   AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.event_id = s.event_id AND t.seat_id = s.id
                    AND t.status IN ('pending', 'valid'))
 GROUP BY s.id, s.zone
HAVING count(*) = 2
 ORDER BY s.zone, s.id
 LIMIT 3;"
```

```text
 butaca | zone  | funciones | sueltas | abono_20 
--------+-------+-----------+---------+----------
 P1-2   | palco |         2 |    9000 |     7200
 P1-3   | palco |         2 |    9000 |     7200
 P2-3   | palco |         2 |    9000 |     7200
(3 rows)
```

Quedan **dos** funciones de teatro, no tres: el abono de palco sale a 72,00 € (7200 céntimos), no a 108 €. La P1-1, la
primera que viene a la cabeza, no aparece porque ya está vendida en alguna función. El resultado depende de la fecha en
que ejecutes la consulta (`now()`): cuando pase *Esperando a Godot* quedará una sola función. **La regla:** el impacto
de una petición sobre los datos existentes se mide con una consulta, no se estima de memoria; y el resultado cambia con
el tiempo, así que la fecha de la medida forma parte del análisis.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| La tabla de Copilot cita `seasons.ts` o `SeasonPass` | Sin `#codebase`, Copilot inventa un sistema típico | Añade `#codebase` y exige fichero y línea en cada fila |
| Copilot propone reutilizar `pass_types` para el abono | Ha visto «Abono 3 días» y ha supuesto que es lo mismo | Paso 3: es un pase de un evento; el abono cruza eventos |
| La consulta del reto devuelve 0 filas | Ya se han celebrado funciones y `HAVING count(*) = 2` no casa | Cuenta antes las funciones que quedan y ajusta el `HAVING` |
| `grep` muestra resultados de `node_modules` | Falta `--exclude-dir=node_modules` | Añádelo a la orden |
| `psql` responde `relation "events" does not exist` | Base de datos vacía | `make db-reset` |

## Conclusiones

### Qué es un análisis de impacto

Es la lista de piezas existentes (tablas, rutas, pantallas, jobs, tests y **datos**) que una petición obliga a
cambiar o a tener en cuenta, cada una con su fuente y su motivo. Se hace antes de planificar, porque decide el tamaño y
el riesgo del cambio.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Cada pieza con fichero y línea | `001_init.sql:56`, `pricing.ts:53` |
| Incluye los datos, no solo el código | 105 butacas libres, 185/101/42 vendidas |
| Señala lo que no existe | Temporada: sin tabla ni campo |
| Detecta colisiones de vocabulario | «Abono» = pase de un evento en Alborada |
| Prioriza por riesgo | `orders.event_id` alto, correo bajo |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Piezas inventadas | Experimenta: nombres sin resultados en `grep` | Estimaciones sobre un sistema que no existe |
| Reutilizar un concepto con el mismo nombre | `grep abono` en el paso 3 | Un modelo que no puede cruzar eventos |
| Olvidar los datos existentes | Pasos 5 a 7 | Abonos sobre butacas ya vendidas |
| Precio calculado de memoria | Reto: 72 € frente a 108 € | Una oferta comercial falsa al promotor |

### Cómo se perfecciona

Se fija un formato de tabla para todo el equipo (prompt file `/impacto` con las columnas de este lab) y se exige que
cada fila tenga fuente. Las consultas de datos se guardan junto al análisis para repetirlas cuando cambie la fecha o el
promotor. El análisis se adjunta al issue antes de planificar.

### En una frase

> 🔑 Copilot encuentra rápido las piezas candidatas; el análisis de impacto es fiable cuando cada pieza tiene fichero y línea, y los datos afectados salen de una consulta y no de la memoria.
