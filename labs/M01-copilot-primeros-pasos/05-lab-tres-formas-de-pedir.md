# Laboratorio: el mismo cambio pedido de tres formas

[← Página anterior](04-lab-preguntar-al-codigo.md) · [Siguiente página →](06-lab-alucinaciones.md)

La portada de Teatralia lista promotores, pero el público busca planes por ciudad: «¿qué hay este mes en Sevilla?». El issue `TEA-101` del backlog pide poder filtrar eventos por ciudad. En este lab pides ese mismo cambio a Copilot de tres formas distintas y comparas lo que entrega cada una.

### Objetivo

Comprender qué hace que un prompt produzca un cambio revisable: cómo influyen el objetivo, el contexto y los criterios de aceptación, cómo se detecta un cambio que «funciona» pero no es el que se pedía y cómo se mejora el prompt.

### Punto de partida

- Codespace del curso con Copilot activo y Teatralia en marcha:

```bash
# Estado inicial y plataforma arrancada (deja esta terminal abierta)
CONFIRM=1 make reset
make up
```

- El issue en `teatralia/docs/backlog/TEA-101-filtro-por-ciudad.md`.

### Qué está pasando

Cada evento de Teatralia tiene su ciudad (`events.city`). La API pública tiene `GET /api/public/site`, que devuelve los eventos **de un promotor** (el del dominio o la cabecera `x-teatralia-tenant-slug`). No hay forma de pedir los eventos de todos los promotores de una ciudad.

Un prompt vago deja a Copilot decidir dónde va el filtro, cómo se llama el parámetro y qué pasa con mayúsculas o ciudades sin eventos. Un prompt con criterios de aceptación lo decide antes y te deja comprobar el resultado.

| Forma de pedir | Qué incluye |
|----------------|-------------|
| **A — Una línea** | Solo el objetivo |
| **B — Con contexto** | Objetivo + ficheros y convenciones del proyecto |
| **C — Con criterios** | Objetivo + contexto + criterios de aceptación comprobables |

### 1 — Mira la fuente: qué datos hay

Sabes qué debería devolver el filtro antes de pedirlo.

```bash
# Eventos por ciudad en la base de datos
psql "$DATABASE_URL" -c "SELECT city, count(*) FROM events WHERE published GROUP BY city ORDER BY city;"
```

**Resultado esperado:**

```text
   city   | count 
----------+-------
 A Coruña |     5
 Bilbao   |     5
 Madrid   |     6
 Sevilla  |     5
 Valencia |     3
 Zaragoza |     5
(6 rows)
```

**Cómo se lee:** un filtro por `Sevilla` debe devolver 5 eventos, todos del Auditorio El Olivo. Este número es tu criterio para dar el cambio por bueno.

### 2 — Forma A: una línea

En la vista **Chat**, **+**, modo **Edit**. Adjunta `teatralia/services/api/src/routes/public.ts` con **Add Context…** y escribe:

```text
Añade un filtro por ciudad a los eventos.
```

Mira la propuesta sin aceptarla todavía y guarda lo que ha tocado:

```bash
# Qué ficheros y cuántas líneas ha cambiado la forma A
git diff --stat
```

**Qué suele salir:** un `?city=` añadido a `GET /api/public/site` (que sigue limitado a **un** promotor), comparación exacta (`Sevilla` sí, `sevilla` no) y ningún criterio para una ciudad sin eventos. Funciona, pero no resuelve `TEA-101`. Pulsa **Undo** para descartarlo todo.

### 3 — Forma B: con contexto

Chat nuevo (**+**), modo **Edit**, mismo fichero adjunto:

```text
Issue TEA-101 (teatralia/docs/backlog/TEA-101-filtro-por-ciudad.md): el público quiere ver
los eventos de una ciudad de todos los promotores, no solo los de uno.
La API es Fastify con SQL parametrizado (pool.query con $1). Los eventos tienen la columna city.
Añade el filtro en services/api/src/routes/public.ts.
```

**Qué suele salir:** una ruta nueva para todos los promotores con SQL parametrizado. Las decisiones de detalle (nombre de la ruta, mayúsculas, qué devuelve sin ciudad) siguen siendo de Copilot y cambian entre ejecuciones. Pulsa **Undo**.

### 4 — Forma C: con criterios de aceptación

Chat nuevo (**+**), modo **Edit**, mismo fichero adjunto:

```text
Issue TEA-101: filtrar eventos por ciudad para todos los promotores.

Implementa en services/api/src/routes/public.ts:
- GET /api/public/events?city=<ciudad>, sin cabecera de promotor.
- Devuelve id, title, city, category, status, starts_at y tenant_slug de los eventos publicados,
  ordenados por fecha.
- city no distingue mayúsculas: "sevilla" y "Sevilla" dan lo mismo.
- Sin city, devuelve todos los eventos publicados. Una ciudad sin eventos devuelve [].
- SQL parametrizado ($1), nunca concatenado.
No toques otros ficheros.
```

Revisa el diff fichero a fichero y pulsa **Keep** si cumple. La API se recarga sola (la terminal de `make up` muestra `[api]` reiniciando).

### 5 — Comprueba los criterios con la API

Cada criterio del prompt es una comprobación.

```bash
# Criterio 1: Sevilla devuelve los 5 eventos del Auditorio El Olivo
curl -s "localhost:3000/api/public/events?city=Sevilla" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d)); [print(e['id'], e['title'], e['status']) for e in d]"
# Criterio 2: no distingue mayúsculas
curl -s "localhost:3000/api/public/events?city=sevilla" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
# Criterio 3: ciudad sin eventos
curl -s "localhost:3000/api/public/events?city=Lima"; echo
# Criterio 4: sin ciudad, todos
curl -s "localhost:3000/api/public/events" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
```

**Resultado esperado:**

```text
5
EV-OLIVO-0101 Orquesta Bética: Beethoven 9 on_sale
EV-OLIVO-0103 Flamenco de cámara on_sale
EV-OLIVO-0104 Concierto de Navidad sold_out
EV-OLIVO-0106 El lago de los cisnes on_sale
EV-OLIVO-0108 Tango sinfónico cancelled
5
[]
29
```

**Cómo se lee:** los cuatro criterios se cumplen. Con la forma A no podías hacer esta comprobación, porque no habías dicho qué esperabas.

<details>
<summary>Implementación de referencia</summary>

```ts
  // Eventos de todos los promotores, opcionalmente de una ciudad: GET /api/public/events?city=Sevilla
  app.get<{ Querystring: { city?: string } }>('/api/public/events', async (req) => {
    const city = String(req.query.city ?? '').trim();
    const r = await pool.query(
      `SELECT e.id, e.title, e.city, e.category, e.status, e.starts_at, t.slug AS tenant_slug
         FROM events e JOIN tenants t ON t.id = e.tenant_id
        WHERE e.published AND ($1 = '' OR lower(e.city) = lower($1))
        ORDER BY e.starts_at`,
      [city],
    );
    return r.rows;
  });
```

</details>

## Comprueba tu entendimiento

**El tamaño del diff**
Ejecuta `git diff --stat` tras aceptar la forma C.
→ Un solo fichero, `teatralia/services/api/src/routes/public.ts`, porque el prompt decía «No toques otros ficheros».

**Los tests siguen en verde**
Ejecuta `make test`.
→ `Tests  21 passed (21)`: el cambio no ha roto nada (aunque tampoco tiene test propio).

## Experimenta

Predice antes de probar: si en la forma C quitas la línea «SQL parametrizado ($1), nunca concatenado», ¿lo seguirá parametrizando Copilot?

Deshaz el cambio (`git checkout -- teatralia`), repite la forma C sin esa línea y busca en el diff `${` dentro del SQL. Lo habitual es que lo parametrice igualmente, porque el resto de `public.ts` lo hace así y Copilot imita el fichero. Prueba ahora sin adjuntar `public.ts`: el riesgo de concatenar sube cuando no ve el estilo del proyecto.

## Mejora

Añade a la forma C el criterio «Incluye un test de la ruta en services/api/test/» y repítela en modo Edit adjuntando también `teatralia/services/api/test/pricing.test.ts` como ejemplo de estilo. Ejecuta `make test`: debe haber un test más que antes.

## Reto

### 1 — El criterio que faltaba

**La situación:** Producto revisa tu cambio y dice: «los eventos cancelados no deberían salir en la búsqueda del público». Ningún prompt lo decía.

**Qué haces:** escribe solo el criterio nuevo en un chat de modo **Edit** con `public.ts` adjunto y comprueba con `curl` el resultado para Sevilla.

**Pistas:** el estado está en `events.status` (`on_sale`, `sold_out`, `cancelled`, `postponed`).

**Lo que buscas:** Sevilla devuelve 4 eventos y ninguno `cancelled`.

<details>
<summary>Ver solución</summary>

Prompt:

```text
En GET /api/public/events, excluye los eventos con status 'cancelled'. No cambies nada más.
```

El cambio es añadir `AND e.status <> 'cancelled'` al `WHERE`.

```bash
curl -s "localhost:3000/api/public/events?city=Sevilla" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d)); [print(e['id'], e['status']) for e in d]"
```

```text
4
EV-OLIVO-0101 on_sale
EV-OLIVO-0103 on_sale
EV-OLIVO-0104 sold_out
EV-OLIVO-0106 on_sale
```

**La regla:** lo que no está en los criterios lo decide Copilot. Los criterios que faltan aparecen al revisar con negocio: escríbelos en el issue antes de pedir el código.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `curl` devuelve `{"error":"no hay ningún promotor en este dominio"}` | La ruta quedó dentro de las que exigen promotor, o se llama `/api/public/site` | Revisa en el diff la ruta y que no llame a `tenantOf` |
| `Route GET:/api/public/events not found` | No pulsaste **Keep** o la API no se ha recargado | Pulsa **Keep** y mira que `[api]` reinicia en la terminal de `make up` |
| `sevilla` devuelve 0 | Comparación exacta | Pide «no distingue mayúsculas» y comprueba `lower(...)` en el SQL |
| La forma B toca varios ficheros | No se le limitó el alcance | Añade «No toques otros ficheros» |

## Conclusiones

### Qué es un buen prompt para un cambio

Un objetivo, el contexto que Copilot no puede deducir y criterios de aceptación que tú puedes comprobar.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Objetivo de negocio, no solo técnico | «para todos los promotores» (TEA-101) |
| Contexto del proyecto | Fastify, SQL parametrizado, columna `city` |
| Criterios comprobables | Mayúsculas, ciudad sin eventos, sin ciudad |
| Alcance limitado | «No toques otros ficheros» |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| El objetivo se queda corto | Forma A filtra dentro de un solo promotor | Un cambio que funciona y no resuelve el issue |
| Criterios que nadie escribió | Los cancelados salen en la búsqueda | Una revisión con negocio que obliga a rehacer |

### Cómo se perfecciona

Escribiendo los criterios en el propio issue (así el prompt es «implementa TEA-101») y dejando las convenciones del proyecto en las instrucciones del repositorio, que se ven en el módulo siguiente.

### En una frase

> 🔑 Lo que no escribes en el prompt lo decide Copilot: escribe los criterios que luego vas a comprobar.
