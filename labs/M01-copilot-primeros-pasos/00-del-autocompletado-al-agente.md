# Demo: del autocompletado al agente

[← Página anterior](README.md) · [Siguiente página →](01-lab-entorno-y-primer-chat.md)

El panel del backoffice de Teatralia enseña a cada promotor cuántas entradas ha vendido de cada evento. Esta demostración hace la misma tarea, entender y ampliar ese recuento, con las tres formas de trabajar de Copilot: la sugerencia en línea, el chat en modo **Ask** y el chat en modo **Agent**. Lo que cambia de una a otra no es el modelo, es **cuánto contexto ve** y **cuántas acciones hace sin preguntar**.

## Punto de partida

- Codespace del repositorio del curso con Teatralia en marcha: `make up` en una terminal.
- Base de datos con los datos de ejemplo: `CONFIRM=1 make reset` si se ha cambiado algo.
- Backoffice en el puerto 5174 (pestaña **Ports** → **Backoffice (5174)**), token `faro-dev-token`.
- Vista **Chat** de Copilot abierta (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>).

## Recorrido

### 1 — El dato de partida, visto en el sistema

Antes de preguntar nada a Copilot, la demo mira el dato en la fuente. El panel del backoffice de la Sala Faro muestra «Jazz en el Faro» con sus entradas vendidas, y la API que lo alimenta devuelve lo mismo:

```bash
# Ventas por evento de la Sala Faro, tal como las recibe el panel del backoffice
curl -s localhost:3000/api/admin/stats -H 'authorization: Bearer faro-dev-token' \
  | python3 -c "import json,sys; [print(s['id'], s['status'], s['sold'], s['capacity']) for s in json.load(sys.stdin)]"
```

```text
EV-FARO-0038 on_sale 225 450
EV-FARO-0042 on_sale 236 450
EV-FARO-0045 sold_out 268 450
EV-FARO-0047 on_sale 105 450
EV-FARO-0049 postponed 54 450
```

**Cómo se lee:** cada línea es un evento, su estado, las entradas válidas y el aforo del recinto. Este es el dato contra el que se comprueba todo lo que diga Copilot. Llama la atención que «Cuarteto Atlántico» (`EV-FARO-0045`) está **agotado** con 268 de 450: la pregunta queda abierta para el lab.

### 2 — Sugerencia en línea: Copilot ve el fichero

En un fichero nuevo, `teatralia/services/api/src/reports/occupancy.ts`, se escribe solo un comentario y la firma:

```ts
// Porcentaje de ocupación de un evento, entero de 0 a 100.
// sold: entradas válidas; capacity: aforo del recinto. Si capacity es 0, devuelve 0.
export function occupancyPct(sold: number, capacity: number): number {
```

Copilot propone el cuerpo en gris. Con <kbd>Tab</kbd> se acepta; con <kbd>Alt</kbd>+<kbd>]</kbd> se ven alternativas. Lo que propone sale del comentario, de la firma y de los ficheros abiertos: **no sabe** de dónde vienen `sold` y `capacity` en Teatralia ni que el panel redondea con `Math.round`.

**Qué señalar en pantalla:** el texto gris aparece tras una pausa al escribir, y desaparece si se sigue tecleando algo distinto.

### 3 — Chat en modo Ask: Copilot busca en el repositorio

En la vista **Chat**, con el modo **Ask** seleccionado bajo la caja de texto:

```text
¿De dónde saca el panel del backoffice las entradas vendidas de cada evento?
Dime el fichero y la consulta SQL exacta. No cambies nada.
```

La respuesta cita ficheros (aparecen como referencias bajo el mensaje). Lo que debe contener: el endpoint `GET /api/admin/stats` en `services/api/src/routes/admin.ts`, que cuenta entradas con `status = 'valid'`, y el componente `Dashboard` de `apps/backoffice/src/operations.tsx` que lo pinta. El texto exacto varía en cada ejecución; se comprueba así:

```bash
# Dónde se cuentan las entradas vendidas para el panel
grep -n "status = 'valid'" teatralia/services/api/src/routes/admin.ts
```

```text
73:              (SELECT count(*) FROM tickets k WHERE k.event_id = e.id AND k.status = 'valid')::int AS sold
202:              (SELECT count(*) FROM tickets k WHERE k.event_id = e.id AND k.status = 'valid')::int AS sold,
```

**Cómo se lee:** hay **dos** sitios que cuentan vendidas: el listado de eventos (línea 73) y el panel (línea 202). Si Copilot solo cita uno, la respuesta es correcta pero incompleta. Es lo normal en Ask: busca lo suficiente para responder, no todo.

### 4 — Chat en modo Agent: Copilot actúa

Con el modo **Agent**:

```text
Añade al listado de eventos del backoffice una columna «Ocupación» con el porcentaje
de entradas válidas sobre el aforo del recinto. Usa occupancyPct de
services/api/src/reports/occupancy.ts. Ejecuta el typecheck al terminar.
```

El agente enseña cada paso: lee `admin.ts` y `sections.tsx`, propone cambios en varios ficheros, pide permiso para ejecutar `npm run typecheck` y, si falla, vuelve a editar. Los ficheros cambiados aparecen en la lista **Changed files** con **Keep** y **Undo** por fichero.

Se comprueba con el diff, no con el mensaje final del agente:

```bash
# Qué ha tocado de verdad el agente
git diff --stat
```

**Qué señalar en pantalla:** el número de ficheros tocados. Una petición de «una columna» suele acabar en tres o cuatro ficheros (consulta SQL, tipo, componente, a veces un test). Ese es el coste de revisión del modo Agent.

### 5 — Las tres, comparadas

| | Sugerencia en línea | Ask | Agent |
|---|---|---|---|
| Qué ve | Fichero abierto y vecinos | Lo que busca para responder | Todo el repo y la terminal |
| Qué hace | Propone texto | Responde y cita | Edita, ejecuta, repite |
| Qué revisas | Una línea o una función | Que las citas existan | Cada fichero del diff y cada comando |
| Cuándo | Sabes qué escribir | Quieres entender | Tarea con varios pasos |

## Qué queda visto

La misma tarea, con tres niveles de autonomía y de contexto. Queda una pregunta para los laboratorios: si Copilot dice «el panel cuenta las entradas válidas», ¿cómo se sabe que **todas** las cifras que da son ciertas? En [Laboratorio: Teatralia en un Codespace y primer chat](01-lab-entorno-y-primer-chat.md) se pone en marcha el entorno y se comprueba la primera respuesta; los labs se pueden hacer sin haber seguido esta demostración.
