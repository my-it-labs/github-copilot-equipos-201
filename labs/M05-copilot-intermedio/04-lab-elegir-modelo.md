# Laboratorio: elegir modelo

[← Página anterior](03-lab-agente-personalizado.md) · [Siguiente página →](05-demo-coding-agent.md)

Finanzas necesita la consulta de TEA-111: las ventas de un evento, pedido a pedido, para liquidar con el promotor. Es una tarea corta con una trampa clásica (un pedido tiene varias entradas). En este laboratorio la pides **igual a dos modelos** distintos desde el selector de modelo de Copilot, compruebas cada consulta contra la base de datos y comparas lo que te ha costado cada una en peticiones. El criterio no es qué respuesta suena mejor, sino cuál **da el número correcto** y a qué precio.

### Objetivo

Comprender cómo se elige modelo por tarea y coste: cómo funciona el consumo de peticiones, cómo debe hacerse la comparación, cómo se detectan sus debilidades y cómo se mejora.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repo. Estado limpio:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- La tarea: [`teatralia/docs/backlog/TEA-111-exportar-ventas.md`](../../teatralia/docs/backlog/TEA-111-exportar-ventas.md), para el evento **`EV-FARO-0042`** (*Jazz en el Faro*).
- El esquema: [`001_init.sql`](../../teatralia/services/api/migrations/001_init.sql) y [`002_teatralia.sql`](../../teatralia/services/api/migrations/002_teatralia.sql).
- Copilot Chat (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>). El laboratorio usa dos mensajes, más los que gastes en el reto.

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Cada mensaje al chat consume peticiones del plan | Dos mensajes iguales con dos modelos |
| Los modelos más capaces cuestan más (multiplicador) | El selector de modelo muestra el multiplicador junto a cada nombre |
| Finanzas solo acepta la hoja si cuadra | La consulta se comprueba contra `psql`: 91 pedidos y 7.138,80 € |

**Cómo se cuentan las peticiones.** En los planes de pago (Pro, Pro+, Business, Enterprise) hay **modelos incluidos**, que no gastan peticiones premium, y **modelos premium**, que gastan por cada mensaje lo que diga su **multiplicador**: 1 gasta una petición; 0,33, un tercio; 10, diez. Cada plan trae un cupo mensual de peticiones premium (cuando se escribió este lab, 300 en Pro y 300 por usuario en Business), y la organización decide si se puede pasar de él pagando. En **Copilot Free** el límite es de mensajes de chat al mes, con un conjunto reducido de modelos.

> [!IMPORTANT]
> Cupos, multiplicadores y modelos disponibles cambian a menudo. La fuente es la documentación de GitHub Copilot («Supported AI models» y «Requests in GitHub Copilot») y el propio selector de modelo de tu VS Code, que muestra el multiplicador vigente. No uses las cifras de esta página para presupuestar.

### 1 — Mira la tarea y el esquema

Lee lo que pide Finanzas y de dónde salen los datos:

```bash
# La petición de Finanzas
cat teatralia/docs/backlog/TEA-111-exportar-ventas.md
```

```text
---
titulo: "Exportar las ventas de un evento a CSV"
etiquetas: [mejora, backoffice]
---
Finanzas liquida con cada promotor a partir de una hoja: pedido, fecha, entradas, total, comisión y reembolsado.
```

En `001_init.sql` fíjate en `orders` (una fila por pedido, con `total_cents`, `commission_cents`, `status`) y en `tickets` (una fila por entrada, con `order_id`). La trampa: si unes `orders` con `tickets` y sumas el total, cada pedido cuenta tantas veces como entradas tiene.

### 2 — Mira tu consumo antes de empezar

1. En la barra de estado de VS Code, pulsa el icono de Copilot.
2. Mira el uso que muestra: con Copilot Free, el porcentaje de mensajes de chat del mes; con un plan de pago, el de peticiones premium.
3. Abre el **selector de modelo** bajo la caja de texto del chat y mira qué modelos tienes y el multiplicador que aparece junto a cada uno.

**Resultado esperado:** un porcentaje de uso (el tuyo) y una lista de modelos. Elige dos para comparar:

| Tu plan | Modelo A | Modelo B |
|---------|----------|----------|
| Pro o Business | Uno **incluido** (sin coste premium) | Uno **premium** con multiplicador 1 |
| Free | El modelo por defecto | Otro de la lista |

### 3 — Pide la consulta al modelo A

1. Chat nuevo (**+**), modo **Ask** (no hace falta que toque ficheros).
2. En el selector de modelo, elige el **modelo A**.
3. Adjunta el esquema con **Add Context…** o escribiéndolo en el mensaje, y envía:

```text
#file:teatralia/services/api/migrations/001_init.sql #file:teatralia/services/api/migrations/002_teatralia.sql
Escribe una consulta SQL de PostgreSQL para TEA-111: las ventas del evento EV-FARO-0042,
una fila por pedido cobrado, con estas columnas y nombres exactos:
pedido, fecha, entradas, total_eur, comision_eur, reembolsado_eur.
Importes en euros con dos decimales. Solo la consulta, sin explicación.
```

Copia la consulta de la respuesta en un fichero `/tmp/modelo-a.sql` (botón de copiar del bloque de código; en la terminal, `code /tmp/modelo-a.sql`, pega y guarda).

**Qué debe contener la respuesta:** un `SELECT` sobre `orders` (y probablemente `tickets` para contar entradas), filtrado por `event_id = 'EV-FARO-0042'` y por estado. Qué estados considera «cobrado» y cómo cuenta las entradas varía según el modelo: es lo que vas a comprobar.

### 4 — Comprueba la consulta del modelo A

Primero, que se ejecuta y qué pinta tiene:

```bash
# Ejecuta la consulta del modelo y muestra las primeras filas
psql "$DATABASE_URL" -f /tmp/modelo-a.sql | head -8
```

Una consulta correcta empieza así:

```text
    pedido     |      fecha       | entradas | total_eur | comision_eur | reembolsado_eur 
---------------+------------------+----------+-----------+--------------+-----------------
 PED-2026-0790 | 2026-09-29 15:29 |        3 |     74.20 |         5.36 |            0.00
 PED-2026-0806 | 2026-09-30 10:59 |        4 |    105.10 |         7.61 |            0.00
 PED-2026-0808 | 2026-09-30 12:54 |        1 |     24.90 |         1.80 |           21.60
 PED-2026-0812 | 2026-09-30 16:02 |        2 |     72.80 |         5.32 |            0.00
 PED-2026-0814 | 2026-09-30 17:37 |        4 |    105.10 |         7.61 |            0.00
 PED-2026-0816 | 2026-09-30 18:06 |        3 |     74.20 |         5.36 |            0.00
```

Después, lo que importa a Finanzas: que cuadre. Este comando envuelve la consulta del modelo y suma sus columnas:

```bash
# Suma las filas de la consulta del modelo (quita comentarios y el ; final para anidarla)
psql "$DATABASE_URL" -c "SELECT count(*) AS filas, count(DISTINCT pedido) AS pedidos,
  sum(total_eur) AS total_eur, sum(comision_eur) AS comision_eur, sum(reembolsado_eur) AS reembolsado_eur
  FROM ($(sed '/^--/d; s/;[[:space:]]*$//' /tmp/modelo-a.sql)) AS q;"
```

**Resultado esperado** con una consulta correcta:

```text
 filas | pedidos | total_eur | comision_eur | reembolsado_eur 
-------+---------+-----------+--------------+-----------------
    91 |      91 |   7138.80 |       518.82 |          149.85
(1 row)
```

Cómo se lee: 91 filas y 91 pedidos distintos (uno por fila) y 7.138,80 € cobrados, que es lo que da la herramienta `ventas_por_evento` del servidor MCP de Teatralia para `EV-FARO-0042`. Una consulta que une con `tickets` sin agrupar por pedido da otra cosa:

```text
 filas | pedidos |       total_eur        |     comision_eur      |     reembolsado_eur      
-------+---------+------------------------+-----------------------+--------------------------
   242 |      91 | 22356.9000000000000000 | 1624.9500000000000000 | 502.20000000000000000000
(1 row)
```

242 filas (una por entrada) y el total multiplicado por tres. Y si incluye los pedidos fallidos, el total sube a 7.581,70 €.

### 5 — Pide la misma consulta al modelo B

Repite el paso 3 en un **chat nuevo** (para que no vea la respuesta anterior), con el **modelo B** y **exactamente el mismo mensaje**. Guarda la consulta en `/tmp/modelo-b.sql`.

### 6 — Comprueba la consulta del modelo B

```bash
# Primeras filas y totales de la consulta del modelo B
psql "$DATABASE_URL" -f /tmp/modelo-b.sql | head -8
psql "$DATABASE_URL" -c "SELECT count(*) AS filas, count(DISTINCT pedido) AS pedidos,
  sum(total_eur) AS total_eur, sum(comision_eur) AS comision_eur, sum(reembolsado_eur) AS reembolsado_eur
  FROM ($(sed '/^--/d; s/;[[:space:]]*$//' /tmp/modelo-b.sql)) AS q;"
```

**Resultado esperado:** el mismo criterio que en el paso 4: 91 / 91 / 7138.80 / 518.82 / 149.85 si es correcta.

### 7 — Compara resultado y coste

Vuelve al icono de Copilot de la barra de estado y mira cuánto ha subido el uso.

Compara las dos consultas con estas preguntas:

| Pregunta | Modelo A | Modelo B |
|----------|----------|----------|
| ¿Se ejecuta sin errores? | | |
| ¿91 filas y 7.138,80 €? | | |
| ¿Qué estados cuenta como cobrado? | | |
| ¿«entradas» cuenta todas o solo las válidas? | | |
| ¿Cuánto ha consumido (multiplicador × 1 mensaje)? | | |

Cómo se lee: si los dos aciertan, el incluido gana: mismo resultado, sin coste premium. Si solo acierta el premium, la pregunta es cuántos intentos con el incluido (y cuánto tiempo tuyo revisando) equivalen a un mensaje premium. Fíjate también en «entradas»: TEA-111 no dice si cuentan las reembolsadas. Si un modelo lo decidió sin preguntar, esa decisión es tuya, no suya.

## Comprueba tu entendimiento

**El multiplicador está en el selector**
Abre el selector de modelo.
→ Junto a cada modelo, su multiplicador (o la marca de incluido). Es el coste por mensaje con tu plan.

**Cuadrar no depende del modelo**
Ejecuta el paso 4 sobre la consulta que hayas dado por buena.
→ 91 filas, 91 pedidos, 7138.80: el criterio es la base de datos, no la respuesta más convincente.

**La trampa del JOIN**
Mira en tu consulta si hay `GROUP BY o.id` o una subconsulta para contar entradas.
→ Sin una de las dos, `total_eur` sale repetido por cada entrada.

## Experimenta

**Un prompt mejor frente a un modelo mejor.** Antes de probarlo, predice si el modelo A acierta a la primera si el prompt incluye el criterio de comprobación. En un chat nuevo, con el **modelo A**, añade al mensaje del paso 3:

```text
Ojo: un pedido tiene varias entradas en tickets; el total del pedido no puede repetirse.
"Cobrado" son los estados paid, partially_refunded y refunded. Debe dar 91 filas.
```

Comprueba con el comando del paso 4. Lo habitual es que con el criterio explícito el modelo incluido acierte: el contexto suele valer más que el multiplicador en tareas cortas y bien definidas.

## Mejora

Fija el modelo de una tarea repetida en un **prompt file**, para que el equipo no gaste premium por costumbre. Crea `.github/prompts/exportar-ventas.prompt.md` en la raíz del repo:

```markdown
---
description: Consulta SQL de ventas de un evento para la liquidación (TEA-111)
agent: ask
model: <nombre exacto de tu modelo A, tal como sale en el selector>
---
#file:teatralia/services/api/migrations/001_init.sql
#file:teatralia/services/api/migrations/002_teatralia.sql
Escribe una consulta PostgreSQL con las ventas del evento ${input:evento:EV-FARO-0042}, una fila por pedido
cobrado (paid, partially_refunded, refunded), columnas pedido, fecha, entradas, total_eur, comision_eur,
reembolsado_eur, euros con dos decimales. Un pedido tiene varias entradas: el total no puede repetirse.
Solo la consulta.
```

Escribe `/exportar-ventas` en el chat. **Resultado esperado:** el chat usa el modelo del fichero sin tocar el selector, y la consulta pasa la comprobación del paso 4.

> [!NOTE]
> En versiones anteriores de VS Code el campo `agent:` del prompt file se llamaba `mode:`. Si el editor lo subraya, usa el otro.

## Reto

### 1 — ¿Premium para todo el SQL?

**La situación:** un compañero propone en la reunión de equipo «para SQL usamos siempre el modelo premium, que falla menos». Antes de aceptarlo, quieres un dato: para la consulta de TEA-111, ¿el modelo incluido con un buen prompt da el mismo resultado que el premium con el prompt corto?

**Qué haces:** con el prompt del **Experimenta** y el modelo A, genera la consulta para otro evento, `EV-OLIVO-0103`, en un chat nuevo. Con el prompt corto del paso 3 y el modelo B, la misma. Comprueba las dos con el comando del paso 4 y calcula el coste de cada una con el multiplicador del selector.

**Pistas:** cambia `EV-FARO-0042` por `EV-OLIVO-0103` en el prompt. El valor correcto lo puedes obtener tú con la consulta de referencia de la solución.

**Lo que buscas:** las dos consultas con el mismo número de filas y el mismo total que la referencia, y el coste de cada una. Con eso, una frase para el equipo: cuándo compensa el premium.

<details>
<summary>Ver solución</summary>

La consulta de referencia (guárdala como `/tmp/referencia.sql`, cambiando el evento cuando haga falta):

```sql
-- TEA-111: ventas de un evento para la liquidación con el promotor
SELECT o.id AS pedido,
       to_char(o.paid_at AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD HH24:MI') AS fecha,
       count(t.id) AS entradas,
       round(o.total_cents / 100.0, 2) AS total_eur,
       round(o.commission_cents / 100.0, 2) AS comision_eur,
       round(o.refunded_cents / 100.0, 2) AS reembolsado_eur
  FROM orders o
  JOIN tickets t ON t.order_id = o.id
 WHERE o.event_id = 'EV-FARO-0042'
   AND o.status IN ('paid', 'partially_refunded', 'refunded')
 GROUP BY o.id
 ORDER BY o.paid_at;
```

Con `EV-FARO-0042`, el comando del paso 4 sobre esta consulta da:

```text
 filas | pedidos | total_eur | comision_eur | reembolsado_eur 
-------+---------+-----------+--------------+-----------------
    91 |      91 |   7138.80 |       518.82 |          149.85
(1 row)
```

Con el evento cambiado a `EV-OLIVO-0103`, la referencia para las dos consultas del reto es:

```text
 filas | pedidos | total_eur | comision_eur | reembolsado_eur 
-------+---------+-----------+--------------+-----------------
    74 |      74 |   6072.00 |       440.52 |          144.00
(1 row)
```

Cómo se lee: si el incluido con buen prompt cuadra, la propuesta del compañero gasta premium sin ganar nada en esta tarea. Donde el premium suele compensar es en lo que no se puede comprobar con una consulta: cambios de varios ficheros, razonamiento largo, código heredado poco claro. **La regla:** el modelo se elige por tarea, con un criterio de comprobación escrito antes; el premium se justifica cuando el incluido falla en ese criterio, no por costumbre.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `syntax error at or near ")"` en el comando de suma | La consulta del modelo tiene texto o comentarios al final, o varias sentencias | Deja en el fichero solo el `SELECT`, con el `;` al final |
| `column "total_eur" does not exist` | El modelo cambió los nombres de columna | Renómbralas en la consulta (`AS total_eur`) o vuelve a pedirlas con los nombres exactos |
| El selector no muestra modelos premium | Copilot Free o la organización no los permite | Compara dos modelos de los que tengas; en Business, lo decide la política de modelos |
| Mensaje de cupo agotado | Has llegado al límite mensual de tu plan | Vuelve al modelo incluido (planes de pago) o espera al mes siguiente (Free) |
| Las dos respuestas son idénticas | Mismo chat: el segundo modelo ha visto la primera respuesta | Chat nuevo (**+**) para cada modelo |

## Conclusiones

### Qué es elegir modelo

Decidir, por tarea, qué modelo responde y cuánto cuesta. Cada mensaje consume según el multiplicador del modelo y el plan; el selector lo muestra antes de enviar. En este lab, la misma tarea con dos modelos se juzgó por un número: 91 pedidos y 7.138,80 €.

### Cómo debe ser

| Requisito | Cómo se ha hecho |
|-----------|------------------|
| Criterio de éxito antes de comparar | Totales de `psql` y `ventas_por_evento` |
| Misma entrada para los dos | Mismo prompt, chat nuevo |
| Coste medido | Uso del icono de Copilot y multiplicador del selector |
| Decisión documentada | Prompt file con `model:` para la tarea repetida |

### Dónde se rompe y cómo lo has detectado

- **El JOIN que multiplica:** 22.356,90 € en vez de 7.138,80 €; solo se ve sumando, no leyendo el SQL por encima.
- **Decisiones silenciosas:** qué es «cobrado» o qué entradas cuentan; el modelo elige si no se lo dices.
- **Cifras que caducan:** cupos y multiplicadores cambian; la decisión se revisa con el selector, no con una tabla copiada.

### Cómo se perfecciona

En un equipo: modelo incluido por defecto, premium para tareas largas o donde el incluido haya fallado el criterio; prompt files con el modelo fijado para tareas repetidas; en Business, política de modelos permitidos y presupuesto de peticiones premium; y revisión del consumo a mitad de mes.

### En una frase

> 🔑 El mejor modelo para una tarea es el más barato que pasa su comprobación: primero el criterio, luego la comparación, y el coste a la vista en el selector.
