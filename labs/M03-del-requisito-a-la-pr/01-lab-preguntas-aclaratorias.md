# Laboratorio: preguntas aclaratorias

[← Página anterior](00-de-la-peticion-al-merge.md) · [Siguiente página →](02-lab-especificacion-desde-un-issue.md)

El Auditorio El Olivo ha mandado un correo: cuando un concierto se agota, la gente les escribe para que les avisen si
queda algo, y quieren una lista de espera. Es el issue **TEA-103** del backlog, tal cual. En este laboratorio no
escribes código: usas Copilot para sacar los huecos de la petición, compruebas cada hueco contra Teatralia y terminas
con una lista de preguntas para el promotor separada de lo que ya responde el sistema.

### Objetivo

Comprender qué es detectar ambigüedades antes de programar: cómo se buscan en una petición de negocio, cómo debe ser
una buena pregunta aclaratoria, cómo se detecta que Copilot ha dado por buena una suposición y cómo se mejora
contrastando con el código y los datos.

### Punto de partida

- Codespace del fork, terminal en la raíz del repositorio.
- Estado limpio y plataforma arrancada (la segunda orden en otra terminal, que dejas abierta):

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
# API en 3000, tienda en 5173, backoffice en 5174
make up
```

- Copilot Chat: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>, modo **Ask**.
- Opcional, para el último paso: los issues del backlog en tu fork (`make backlog`, una sola vez).

### Qué está pasando

Quien escribe una petición de negocio piensa en su caso («el Concierto de Navidad está agotado y nos escriben»), no en
los casos límite. «Agotado», «se apunten», «se libera» y «se la ofrecemos» parecen claros, pero cada palabra
esconde una decisión: quién decide que un evento está agotado, cuántas entradas pide cada persona, qué pasa si
nadie contesta a la oferta. Si el equipo no pregunta, decide el programador sin saberlo, o decide Copilot, que
rellena cada hueco con lo más habitual en otros sistemas.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| El correo del promotor | `teatralia/docs/backlog/TEA-103-lista-de-espera.md` |
| La reunión de refinamiento | El chat de Copilot en modo Ask con `#codebase` |
| «Eso ya lo sabemos por el sistema» | `grep` sobre el código y `psql` sobre los datos |
| Las preguntas que se mandan al promotor | Un comentario en el issue de tu fork |

### 1 — Lee la petición tal como llega

Empieza por la fuente: el issue completo, sin resumir.

```bash
# El issue de la lista de espera
cat teatralia/docs/backlog/TEA-103-lista-de-espera.md
```

**Resultado esperado:**

```text
---
titulo: "Lista de espera para eventos agotados"
etiquetas: [petición de negocio]
---
Correo del Auditorio El Olivo: «Cuando un concierto se agota, la gente nos escribe para que les avisemos si queda algo.
Queremos una lista de espera. Que se apunten y, si se libera una entrada, se la ofrecemos.»
```

**Cómo se lee:** tres verbos con decisión escondida: *se agota* (¿quién lo decide?), *se apunten* (¿con qué datos,
cuántas entradas?), *se libera… se la ofrecemos* (¿cuándo se libera una entrada en Teatralia?, ¿cuánto dura la
oferta?). La etiqueta es `petición de negocio`, no `mejora` ni `bug`: nadie ha refinado todavía.

### 2 — Pide a Copilot los huecos, separados por quién puede contestarlos

Abre un chat nuevo (**+**), comprueba que el modo es **Ask** y pega el prompt. `#codebase` deja a Copilot buscar en
el repositorio; sin eso, solo podría opinar en general.

```text
#file:teatralia/docs/backlog/TEA-103-lista-de-espera.md #codebase
Antes de implementar esta petición quiero las preguntas aclaratorias. Haz dos listas:
A) Preguntas que el código o los datos de Teatralia ya contestan: para cada una, la respuesta
   y el fichero y la línea donde lo has visto.
B) Preguntas que solo puede contestar el promotor (negocio), cada una con dos respuestas
   posibles y qué cambiaría en la implementación según cuál elija.
No propongas código ni esquema.
```

**Qué debe contener la respuesta** (varía en cada ejecución; lo que importa son los hechos):

- En A, alguna de estas: que el estado del evento (`on_sale`, `sold_out`…) es una columna de `events`
  (`002_teatralia.sql`); que las butacas pendientes de pago se anulan a los 10 minutos (`holdMinutes` en
  `services/api/src/config.ts`, `releaseExpiredHolds` en `orders/service.ts`); que un reembolso deja la entrada en
  `refunded` (`orders/refunds.ts`); que ya existe una cola de correos (`queue.ts`).
- En B, preguntas como: qué significa «agotado», cuántas entradas puede pedir cada persona, por orden de llegada o no,
  cuánto tiempo tiene para pagar la entrada ofrecida, si la oferta es para una butaca concreta o cualquiera, qué pasa
  si el evento se cancela.

Si Copilot pone en A algo sin fichero ni línea, o contesta él mismo una pregunta de B («lo normal es 24 h»), eso es
una suposición: márcala para comprobarla en los pasos siguientes.

### 3 — Comprueba qué es «agotado» en el código

Copilot suele dar por hecho que «agotado» se calcula. Búscalo en el código, sin dependencias:

```bash
# Dónde aparece el estado «agotado» en el código de Teatralia
grep -rn "sold_out" teatralia --include=*.ts --include=*.tsx --exclude-dir=node_modules
```

**Resultado esperado:**

```text
teatralia/services/api/src/seed-data.ts:89:export type EventStatus = 'on_sale' | 'sold_out' | 'cancelled' | 'postponed';
teatralia/services/api/src/seed-data.ts:112:  { id: 'EV-FARO-0045', venueId: 'VN-FARO', title: 'Cuarteto Atlántico', category: 'música', startsAt: '2026-12-19T20:30:00+01:00', status: 'sold_out', feeCents: 90, seated: true, passes: [], demand: 1 },
teatralia/services/api/src/seed-data.ts:127:  { id: 'EV-OLIVO-0104', venueId: 'VN-OLIVO', title: 'Concierto de Navidad', category: 'música', startsAt: '2026-12-22T19:00:00+01:00', status: 'sold_out', feeCents: 100, seated: true, passes: [], demand: 1 },
teatralia/services/api/src/seed-data.ts:145:  { id: 'EV-MAREA-0303', venueId: 'VN-MAREA', title: 'Cumbia en el puerto', category: 'música', startsAt: '2026-12-04T22:00:00+01:00', status: 'sold_out', feeCents: 120, seated: false, passes: [GENERAL(1800, 400)], demand: 1 },
teatralia/apps/backoffice/src/operations.tsx:6:  on_sale: 'a la venta', sold_out: 'agotado', cancelled: 'cancelado', postponed: 'aplazado',
```

**Cómo se lee:** `sold_out` solo está en los datos de ejemplo y en la etiqueta del backoffice. Ninguna línea de la API
lo calcula ni lo usa para dejar de vender: es un valor que alguien pone a mano. La pregunta «¿qué es agotado?»
pasa de la lista A a la B.

### 4 — Mira cuántas entradas libres tienen los eventos «agotados»

Si «agotado» es una etiqueta, puede no coincidir con la realidad. La base de datos lo dice:

```bash
# Aforo y entradas válidas de los eventos marcados como agotados
psql "$DATABASE_URL" -c "
SELECT e.id, e.title, e.status,
       (SELECT count(*) FROM seats s WHERE s.event_id = e.id) + (SELECT coalesce(sum(capacity), 0) FROM pass_types p WHERE p.event_id = e.id) AS aforo,
       (SELECT count(*) FROM tickets k WHERE k.event_id = e.id AND k.status = 'valid') AS vendidas
  FROM events e WHERE e.status = 'sold_out' ORDER BY e.id;"
```

**Resultado esperado:**

```text
      id       |        title         |  status  | aforo | vendidas 
---------------+----------------------+----------+-------+----------
 EV-FARO-0045  | Cuarteto Atlántico   | sold_out |   300 |      268
 EV-MAREA-0303 | Cumbia en el puerto  | sold_out |   400 |      349
 EV-OLIVO-0104 | Concierto de Navidad | sold_out |   492 |      451
(3 rows)
```

**Cómo se lee:** el Concierto de Navidad del Olivo está «agotado» con 451 de 492 entradas vendidas. Antes de diseñar
una lista de espera hay que preguntar al promotor si cierra la venta a propósito (reserva para compromisos,
invitaciones) o si la etiqueta está mal puesta.

### 5 — Comprueba si la tienda sigue vendiendo ese concierto

Lo que decide si alguien puede comprar no es la etiqueta, es la API. Pregunta por las butacas libres del concierto:

```bash
# Estado del evento y butacas libres que ve la tienda
curl -s localhost:3000/api/public/events/EV-OLIVO-0104 -H 'x-teatralia-tenant-slug: auditorio-olivo' | jq '{id, title, status}'
curl -s localhost:3000/api/public/events/EV-OLIVO-0104/seats -H 'x-teatralia-tenant-slug: auditorio-olivo' | jq '[.[] | select(.status == "free")] | length'
```

**Resultado esperado:**

```text
{
  "id": "EV-OLIVO-0104",
  "title": "Concierto de Navidad",
  "status": "sold_out"
}
41
```

**Cómo se lee:** la API dice `sold_out` y a la vez ofrece 41 butacas libres; `createOrder` no mira el estado del
evento. Con la petición tal como está, una persona podría estar en la lista de espera de un concierto que todavía
vende. Es la pregunta más importante para el promotor y ninguna lectura del correo la habría sacado.

### 6 — Comprueba cuándo «se libera» una entrada

«Si se libera una entrada» supone que Teatralia sabe cuándo pasa. Busca en el código dónde una entrada deja de ocupar
su butaca:

```bash
# Dónde una entrada pasa a anulada o reembolsada, y cuánto dura el bloqueo de pago
grep -rn "SET status = 'void'\|SET status = 'refunded'" teatralia/services --include=*.ts --exclude-dir=node_modules
grep -n "holdMinutes" teatralia/services/api/src/config.ts
```

**Resultado esperado:**

```text
teatralia/services/api/src/orders/service.ts:25:     UPDATE tickets SET status = 'void' WHERE order_id IN (SELECT id FROM expired)`,
teatralia/services/api/src/orders/service.ts:126:      await db.query(`UPDATE tickets SET status = 'void' WHERE order_id = $1`, [orderId]);
teatralia/services/api/src/orders/refunds.ts:70:    await db.query(`UPDATE tickets SET status = 'refunded' WHERE id = ANY($1)`, [selected.map((x) => x.id)]);
7:  holdMinutes: 10,
```

**Cómo se lee:** hay tres momentos en que una butaca vuelve a estar libre: un pedido sin pagar caduca (10 minutos), un
pago rechazado y un reembolso. Ninguno avisa a nadie: son un `UPDATE` sin evento ni cola. Esto lo contesta el
código (lista A) y abre dos preguntas de negocio (lista B): ¿cuentan los 10 minutos de bloqueo como «liberar»? ¿Se
ofrece la butaca exacta que se liberó o cualquiera?

### 7 — Escribe las preguntas para el promotor

Con lo comprobado, rehace la lista. Pide a Copilot que la reescriba con los hechos de los pasos 3 a 6 (en el mismo chat):

```text
Reescribe solo la lista B con lo que hemos comprobado: "sold_out" es una etiqueta manual que
la API no usa para dejar de vender; el Concierto de Navidad (EV-OLIVO-0104) está sold_out con
41 butacas libres; una butaca se libera por caducidad del pedido (10 min), pago rechazado o
reembolso. Máximo 8 preguntas, cada una cerrada (con opciones) y en lenguaje del promotor,
sin términos técnicos.
```

**Qué debe contener la respuesta:** preguntas sin `sold_out`, `UPDATE` ni nombres de tablas, cada una con opciones.
Revisa que ninguna pregunta tenga ya respuesta en los pasos 3 a 6 y que la del Concierto de Navidad esté la primera.

Después, publícala en el issue de tu fork. Guarda el texto corregido en `/tmp/tea-103-preguntas.md` y:

```bash
# Número del issue TEA-103 en tu fork
gh issue list --search "TEA-103 in:title" --json number,title
# Comenta el issue con tus preguntas (cambia 3 por el número que te haya salido)
gh issue comment 3 --body-file /tmp/tea-103-preguntas.md
```

**Resultado esperado:** `gh issue comment` imprime la URL del comentario
(`https://github.com/<tu-usuario>/github-copilot-teatralia-201/issues/3#issuecomment-…`). En la pestaña **Issues**
del fork, TEA-103 muestra tu comentario.

<details>
<summary>Una lista de referencia</summary>

```text
Preguntas sobre la lista de espera (TEA-103)

1. El Concierto de Navidad aparece como agotado, pero el sistema todavía tiene 41 butacas a la venta.
   ¿Lo cerráis a propósito (reservas, invitaciones) o la lista de espera debe abrirse solo cuando
   no queda ninguna butaca? a) cierre manual  b) cuando no quede ninguna
2. ¿Cuántas entradas puede pedir cada persona en la lista? a) 1  b) hasta 4  c) hasta 10 (el máximo de un pedido)
3. Cuando se libera una entrada, ¿se ofrece a la primera persona de la lista o a varias a la vez?
   a) a la primera, por orden  b) a todas, la primera que pague
4. ¿Cuánto tiempo tiene la persona para pagar la entrada ofrecida? a) 2 horas  b) 24 horas  c) hasta el día antes
5. ¿Se ofrece la butaca exacta que se ha liberado o cualquier butaca libre del mismo precio?
6. Un pedido sin pagar libera sus butacas a los 10 minutos. ¿También eso debe avisar a la lista?
7. Si el evento se cancela o se aplaza, ¿avisamos a la lista? a) sí, con el mismo correo  b) no
8. ¿La lista es solo para conciertos del Olivo o para todos los eventos del promotor?
```

</details>

## Comprueba tu entendimiento

**Agotado, según el sistema**
Ejecuta la consulta del paso 4 cambiando `e.status = 'sold_out'` por `e.id = 'EV-OLIVO-0101'`.
→ *Orquesta Bética: Beethoven 9* sale con 492 de aforo y 354 vendidas, en `on_sale`: el estado no depende de lo vendido.

**Respuesta con fuente o suposición**
Toma una respuesta de la lista A del paso 2 y abre el fichero y la línea que cita.
→ La línea existe y dice lo mismo; si no hay fichero o no coincide, era una suposición y va a la lista B.

## Investiga

El promotor contestará antes si cada pregunta viene con un dato. Usa los datos para responder tú mismo: ¿cuántas
devoluciones ha tenido el Concierto de Navidad? Primero mira la fuente en crudo, el detalle de un pedido reembolsado
en el backoffice (**Pedidos**, estado *reembolsado*, con el token `olivo-dev-token`). Después cuéntalo:

```bash
# Entradas válidas y devueltas del Concierto de Navidad
psql "$DATABASE_URL" -c "SELECT status, count(*) FROM tickets WHERE event_id = 'EV-OLIVO-0104' GROUP BY status ORDER BY status;"
```

```text
  status  | count 
----------+-------
 refunded |    17
 valid    |   451
 void     |    24
(3 rows)
```

Las 17 `refunded` y las 24 `void` (pedidos que caducaron o no se pagaron) son las veces que una lista de espera habría
tenido algo que ofrecer: 41, justo las butacas libres del paso 5. Lleva el dato a la pregunta 3: con 41 liberaciones
en un concierto, ¿compensa avisar a todos a la vez o de uno en uno?

## Experimenta

**Predice antes:** si repites el prompt del paso 2 **sin** `#codebase` (solo con el issue adjunto), ¿aparecerá en la
lista A el dato de los 10 minutos o la columna `status`?

Abre un chat nuevo, pega el mismo prompt quitando `#codebase` y compara. Lo habitual es que la lista A quede vacía o
llena de respuestas genéricas sin fichero («normalmente se libera al cancelar»): Copilot solo ve el texto del issue.
La regla: una pregunta solo se da por contestada cuando la respuesta trae su fuente.

## Reto

### 1 — ¿Hay algún evento agotado de verdad?

**La situación:** en la reunión, un compañero propone: «no preguntemos al Olivo; que la lista de espera se abra
cuando el evento esté en `sold_out` y listo». Antes de aceptarlo, quieres saber si `sold_out` coincide alguna vez con
«no quedan entradas».

**Qué haces:** escribe una consulta que calcule, para cada evento `on_sale` o `sold_out`, las entradas libres reales
(butacas sin entrada activa más pases sin vender) y ordénalos de menos a más libres.

**Pistas:** una butaca está ocupada si existe una entrada con su `seat_id` en estado `pending` o `valid`
(`NOT EXISTS`); los pases libres son `capacity` menos las entradas de ese `pass_type_id` en esos estados;
`coalesce(sum(…), 0)` para los eventos sin pases.

**Lo que buscas:** saber si algún evento tiene 0 entradas libres y si los `sold_out` son los que menos tienen.

<details>
<summary>Ver solución</summary>

```bash
psql "$DATABASE_URL" -c "
SELECT e.id, e.status,
       (SELECT count(*) FROM seats s WHERE s.event_id = e.id
          AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.event_id = s.event_id AND t.seat_id = s.id
                           AND t.status IN ('pending', 'valid')))
     + (SELECT coalesce(sum(p.capacity - (SELECT count(*) FROM tickets t WHERE t.pass_type_id = p.id
                                           AND t.status IN ('pending', 'valid'))), 0)
          FROM pass_types p WHERE p.event_id = e.id) AS libres
  FROM events e
 WHERE e.status IN ('on_sale', 'sold_out')
 ORDER BY libres, e.id
 LIMIT 6;"
```

```text
       id       |  status  | libres 
----------------+----------+--------
 EV-FARO-0045   | sold_out |     32
 EV-LUMEN-0005  | on_sale  |     39
 EV-OLIVO-0104  | sold_out |     41
 EV-CIERZO-0021 | on_sale  |     47
 EV-MAREA-0303  | sold_out |     51
 EV-LUMEN-0007  | on_sale  |     53
(6 rows)
```

Ningún evento tiene 0 libres, y hay eventos `on_sale` con menos entradas libres que uno `sold_out` (*La casa de
Bernarda Alba*, 39, frente a *Cumbia en el puerto*, 51). La propuesta del compañero abriría listas de espera en eventos
con entradas y no en los que están a punto de agotarse. En producción, eso son correos de «te avisaremos» a gente que
podría comprar ya. **La regla:** antes de usar un dato del sistema como regla de negocio, comprueba que significa lo
que su nombre dice; un nombre (`sold_out`) no es una definición.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| Copilot responde con código o un esquema de tabla | El prompt no lo prohíbe o el modo es Agent | Modo **Ask** y la línea «No propongas código ni esquema» |
| La lista A no cita ficheros | Falta `#codebase` o Copilot no ha encontrado nada | Añade `#codebase` o adjunta `#file:` concretos (`config.ts`, `orders/service.ts`) |
| `curl: (7) Failed to connect to localhost port 3000` | `make up` no está en marcha | Arráncalo en otra terminal: `make up` |
| `psql: error: connection to server … failed` | Fuera del Codespace o sin la base de datos levantada | Dentro del Codespace, `echo $DATABASE_URL` debe mostrar la URL; si no, `make db-reset` |
| `gh issue comment` dice `no issues match` o `could not resolve` | Los issues del backlog no están creados en tu fork | `make backlog` y repite `gh issue list` |

## Conclusiones

### Qué es una pregunta aclaratoria

Es una pregunta que el equipo hace **antes** de programar para convertir una palabra del negocio («agotado», «se
libera») en una decisión. Las buenas preguntas separan lo que el sistema ya contesta (y se comprueba) de lo que solo
el negocio puede decidir (y se pregunta).

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Clasificada: sistema o negocio | Lista A con fichero y línea, lista B con opciones |
| Apoyada en un dato real | 41 butacas libres en un evento «agotado» |
| Cerrada, con opciones | «a) cierre manual b) cuando no quede ninguna» |
| En el lenguaje del promotor | Sin `sold_out`, `UPDATE` ni nombres de tablas |
| Guardada donde vive el trabajo | Comentario en el issue TEA-103 de tu fork |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Copilot contesta una pregunta de negocio con «lo habitual» | Respuesta sin fichero ni línea en el paso 2 | El código decide algo que nadie ha pedido |
| Dar por hecho que «agotado» se calcula | `grep sold_out` solo en datos y etiquetas | Lista de espera en eventos que venden |
| Sin `#codebase`, la lista A se vacía | Experimenta | Preguntas al promotor que el código ya contestaba |
| Un estado que no significa lo que dice | Reto: `on_sale` con menos libres que `sold_out` | Reglas montadas sobre un dato mal interpretado |

### Cómo se perfecciona

En un equipo real, la lista A y la B se adjuntan al issue antes del refinamiento, y el issue no pasa a «listo» hasta
que la lista B tiene respuesta. Un prompt file del equipo (`/preguntas-aclaratorias`) puede fijar el formato A/B
para que todas las peticiones se analicen igual.

### En una frase

> 🔑 Antes de programar una petición, Copilot ayuda a encontrar sus huecos, pero solo el sistema dice cuáles ya tienen respuesta y solo el negocio decide el resto.
