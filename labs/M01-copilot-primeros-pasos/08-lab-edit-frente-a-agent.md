# Laboratorio: modo Edit frente a modo Agent

[← Página anterior](07-lab-confidencialidad-y-exclusiones.md) · [Siguiente página →](../M02-contexto-y-personalizacion/README.md)

El público de Teatralia pregunta cuántas entradas quedan, y el issue `TEA-102` pide mostrar «Quedan N entradas» en la ficha del evento cuando queden menos de 50. En este lab haces ese cambio dos veces: una con el modo **Edit** (tú eliges los ficheros) y otra con el modo **Agent** (Copilot decide qué tocar y ejecuta comandos). Después comparas alcance, pasos y diff.

### Objetivo

Comprender cuándo conviene cada modo del chat: qué controla cada uno, cómo se revisa lo que hacen, dónde se queda corto Edit y qué riesgo añade Agent.

### Punto de partida

- Codespace del curso con Copilot activo y Teatralia en marcha:

```bash
# Estado inicial y plataforma arrancada (deja esta terminal abierta)
CONFIRM=1 make reset
make up
```

- El issue en `teatralia/docs/backlog/TEA-102-aforo-restante.md`.

### Qué está pasando

El aforo restante es un dato que hoy no calcula nadie: la ficha del evento (`GET /api/public/events/:id`) devuelve los pases con sus disponibles y las zonas con su número de butacas, pero no cuántas butacas quedan libres. Mostrar el aviso pide tres cosas: calcularlo en la API, añadirlo al tipo que usa la tienda y pintarlo en la página.

| Modo | Qué ficheros toca | Quién decide | Ejecuta comandos |
|------|-------------------|--------------|------------------|
| **Edit** | Los que tú adjuntas | Tú, el alcance | No |
| **Agent** | Los que encuentre necesarios | Copilot, a partir del objetivo | Sí, con tu permiso |

### 1 — Mira el dato de partida

Primero la fuente: qué devuelve hoy la ficha del evento.

```bash
# Campos que devuelve hoy la ficha de Jazz en el Faro
curl -s localhost:3000/api/public/events/EV-FARO-0042 -H 'x-teatralia-tenant-slug: sala-faro' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(sorted(d.keys()))"
```

**Resultado esperado:**

```text
['category', 'city', 'fee_cents', 'id', 'page_tsx', 'passes', 'starts_at', 'status', 'title', 'venue', 'zones']
```

**Cómo se lee:** no hay ningún campo de aforo restante. `passes` trae `available` por pase; las butacas libres no aparecen.

### 2 — Modo Edit: el cambio en la API

En la vista **Chat**, **+**, modo **Edit**. Con **Add Context…** adjunta solo `teatralia/services/api/src/routes/public.ts` y escribe:

```text
Issue TEA-102. En GET /api/public/events/:id añade el campo remaining: butacas libres
(sin entrada pending o valid) más los pases disponibles. SQL parametrizado.
```

Revisa el diff en el editor y pulsa **Keep**.

```bash
# Qué ha cambiado y el dato nuevo para cinco eventos
git diff --stat
for e in EV-FARO-0042:sala-faro EV-FARO-0045:sala-faro EV-LUMEN-0007:teatro-lumen EV-OLIVO-0104:auditorio-olivo EV-MAREA-0303:sala-marea; do
  curl -s localhost:3000/api/public/events/${e%%:*} -H "x-teatralia-tenant-slug: ${e##*:}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['id'], d['status'], d['remaining'])"
done
```

**Resultado esperado** (el número de líneas del diff depende de cómo lo escriba Copilot):

```text
 teatralia/services/api/src/routes/public.ts | 11 ++++++++++-
 1 file changed, 10 insertions(+), 1 deletion(-)
EV-FARO-0042 on_sale 234
EV-FARO-0045 sold_out 32
EV-LUMEN-0007 on_sale 53
EV-OLIVO-0104 sold_out 41
EV-MAREA-0303 sold_out 51
```

**Cómo se lee:** un fichero, el que adjuntaste. La API ya da el dato, pero la tienda no lo muestra: Edit hizo exactamente lo que le pediste y nada más. Llama la atención que tres eventos **agotados** tienen entradas libres; lo verás en **Investiga**.

<details>
<summary>Cambio de referencia en la API</summary>

```ts
    // Aforo restante: butacas libres + pases disponibles
    const free = await pool.query(
      `SELECT count(*)::int AS n FROM seats s
        WHERE s.event_id = $1
          AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.event_id = s.event_id AND t.seat_id = s.id
                            AND t.status IN ('pending', 'valid'))`,
      [req.params.id],
    );
    const remaining = free.rows[0].n + passes.rows.reduce((n, p) => n + Math.max(0, p.available), 0);
    return { ...ev.rows[0], passes: passes.rows, zones: zones.rows, remaining };
```

</details>

### 3 — Vuelve al punto de partida

Para comparar en igualdad, el modo Agent empieza desde el mismo estado.

```bash
# Descarta el cambio del modo Edit (la plataforma sigue arrancada)
git checkout -- teatralia
```

### 4 — Modo Agent: el issue entero

Chat nuevo (**+**), modo **Agent**, sin adjuntar ficheros:

```text
Implementa el issue teatralia/docs/backlog/TEA-102-aforo-restante.md:
- La API devuelve remaining (butacas libres + pases disponibles) en la ficha del evento.
- La tienda muestra «Quedan N entradas» encima de la página del evento cuando 0 < N < 50.
Al terminar, ejecuta npm run typecheck y npm test dentro de teatralia/ y corrige lo que falle.
```

Mira cómo trabaja: qué ficheros abre (aparecen en la conversación), qué comandos pide ejecutar (pulsa **Continue** o **Allow** tras leer cada uno) y qué hace cuando un comando falla.

**Qué suele pasar:** el agente encuentra `public.ts`, el tipo `EventInfo` de `teatralia/packages/ui/src/api.ts` y la página `EventPage` de `teatralia/apps/storefront/src/pages.tsx`. Al ejecutar el typecheck, falla un test que construye un `EventInfo` sin el campo nuevo, y el agente lo corrige. Ese fallo es real:

```text
test/cart.test.tsx(6,7): error TS2741: Property 'remaining' is missing in type '{ id: string; title: string; venue: string; starts_at: string; fee_cents: number; page_tsx: string; zones: never[]; passes: { id: string; name: string; description: string; price_cents: number; available: number; }[]; }' but required in type 'EventInfo'.
```

### 5 — Revisa el diff del agente

Lo que cuenta es el diff, no el resumen final del agente.

```bash
# Qué ha tocado el agente
git diff --stat
# Y que todo sigue en verde
cd teatralia && npm run typecheck >/dev/null && echo "typecheck OK"; npx vitest run 2>&1 | grep "Tests "; cd ..
```

**Resultado esperado** con un cambio equivalente al de referencia:

```text
 teatralia/apps/storefront/src/pages.tsx     |  5 +++++
 teatralia/packages/ui/src/api.ts            |  1 +
 teatralia/packages/ui/test/cart.test.tsx    |  1 +
 teatralia/services/api/src/routes/public.ts | 11 ++++++++++-
 4 files changed, 17 insertions(+), 1 deletion(-)
typecheck OK
      Tests  21 passed (21)
```

**Cómo se lee:** cuatro ficheros en tres paquetes, uno de ellos un test que tú no habrías mirado. Revisa en especial el cambio del test: el agente ha cambiado un test para que pase. Aquí es legítimo (el tipo tiene un campo nuevo), pero es exactamente el tipo de cambio que hay que leer.

<details>
<summary>Cambios de referencia en la tienda</summary>

En `teatralia/packages/ui/src/api.ts`, dentro de `EventInfo`:

```ts
  remaining: number; // butacas libres + pases disponibles
```

En `teatralia/apps/storefront/src/pages.tsx`, dentro de `EventPage`:

```tsx
    <TeatraliaProvider api={api} event={data} basePath={basePath}>
      {data.remaining > 0 && data.remaining < 50 && (
        <p role="status" style={{ margin: 0, padding: '8px 24px', background: '#f2b544', color: '#1d1d1f', textAlign: 'center' }}>
          Quedan {data.remaining} entradas
        </p>
      )}
      <PageRenderer source={data.page_tsx} />
```

En `teatralia/packages/ui/test/cart.test.tsx`, en el evento de prueba: `remaining: 2,`.

</details>

### 6 — Compruébalo en la tienda

1. **Ports** → globo de **Tienda (5173)**, añade `/t/sala-faro` y abre **Cuarteto Atlántico**.
2. Vuelve a la portada y abre **Jazz en el Faro**.

**Resultado esperado:** en *Cuarteto Atlántico* aparece la franja «Quedan 32 entradas»; en *Jazz en el Faro* (234 restantes) no aparece.

## Comprueba tu entendimiento

**Edit respeta el alcance**
Repite el paso 2 en un chat nuevo pidiendo el issue entero (API y tienda) pero adjuntando solo `public.ts`.
→ Edit cambia `public.ts` y, como mucho, te dice qué más habría que cambiar. No abre ficheros que no le has dado.

**Agent pide permiso para ejecutar**
En el paso 4, rechaza (**Skip** o **Cancel**) la ejecución de `npm test`.
→ El agente sigue sin ese paso o te pregunta. Tú decides qué comandos se ejecutan.

## Investiga

*Cuarteto Atlántico* está **agotado** y la API dice que quedan 32. ¿Quién tiene razón? Busca la fuente en crudo:

```bash
# Butacas de Cuarteto Atlántico según el estado de su entrada (si la tiene)
psql "$DATABASE_URL" -c "SELECT coalesce(t.status, 'sin entrada') AS estado, count(*) FROM seats s LEFT JOIN tickets t ON t.event_id = s.event_id AND t.seat_id = s.id WHERE s.event_id = 'EV-FARO-0045' GROUP BY 1 ORDER BY 1;"
```

Mira cuántas butacas tienen una entrada `void` (pedidos cuyo pago falló). El estado `sold_out` lo puso el promotor en su momento; los pagos fallidos devolvieron butacas a la venta después. ¿Debe la tienda mostrar «Quedan 32 entradas» en un evento marcado como agotado? Esa es una pregunta para negocio, no para Copilot.

## Reto

### 1 — El criterio que cambia de sitio

**La situación:** negocio decide que en los eventos con estado `sold_out` no se muestra el aviso, aunque queden entradas, hasta que el promotor reabra la venta.

**Qué haces:** elige el modo que encaja (piensa cuántos ficheros toca) y haz el cambio. Comprueba en la tienda *Cuarteto Atlántico* y *Jazz en el Faro*.

**Pistas:** la ficha del evento ya trae `status`. ¿Hace falta tocar la API o basta con la tienda? ¿Hace falta añadir `status` al tipo `EventInfo`?

**Lo que buscas:** *Cuarteto Atlántico* sin franja; ningún otro cambio de comportamiento.

<details>
<summary>Ver solución</summary>

Basta un fichero de la tienda y el tipo: es un cambio para **Edit** con `pages.tsx` y `api.ts` adjuntos.

```text
En EventPage, no muestres «Quedan N entradas» si data.status es 'sold_out'.
Añade status: string a EventInfo si no existe.
```

```bash
git diff --stat
cd teatralia && npm run typecheck >/dev/null && echo "typecheck OK"; cd ..
```

El diff toca `teatralia/apps/storefront/src/pages.tsx` y `teatralia/packages/ui/src/api.ts`; el typecheck sigue en verde. En la tienda, *Cuarteto Atlántico* ya no muestra la franja.

**La regla:** si sabes qué ficheros hay que tocar, Edit; si no lo sabes o hay que ejecutar y corregir, Agent. Cuantos más ficheros toque un modo, más tiempo de revisión te pide.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `KeyError: 'remaining'` en el `curl` | El cambio no se aceptó o la API no se recargó | Pulsa **Keep** y mira que `[api]` reinicia en la terminal de `make up` |
| `error TS2741: Property 'remaining' is missing` | Se añadió el campo al tipo sin actualizar el test | Añade `remaining` al evento de `cart.test.tsx` (o deja que el agente lo corrija) |
| La franja no aparece en ningún evento | La tienda no se ha recargado | Recarga la página del navegador |
| El agente se queda esperando | Pidió permiso para ejecutar un comando | Lee el comando y pulsa **Continue** o **Allow** |

## Conclusiones

### Qué son los modos Edit y Agent

Edit aplica un cambio a los ficheros que tú eliges. Agent recibe un objetivo, decide qué leer y qué cambiar, ejecuta comandos y corrige hasta terminar.

### Cómo debe ser su uso

| Requisito | En el lab |
|-----------|-----------|
| Edit cuando sabes qué ficheros tocar | Solo `public.ts` para el dato de la API |
| Agent cuando hay que descubrir y verificar | API, tipo, página y test, con typecheck |
| El diff se revisa fichero a fichero | `git diff --stat` y el cambio en `cart.test.tsx` |
| Los comandos del agente se leen antes de permitirlos | **Continue** tras leer `npm test` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Edit no ve lo que no le das | La API da el dato y la tienda no lo pinta | Un issue a medias que parece terminado |
| Agent cambia tests para que pasen | `cart.test.tsx` en el diff | Un test que deja de proteger si el cambio no era legítimo |
| Ninguno decide negocio | Agotado con 32 libres | Un aviso que contradice el estado del evento |

### Cómo se perfecciona

Con instrucciones del repositorio que digan qué comandos validar siempre y que prohíban cambiar tests sin explicarlo, y con issues que digan el comportamiento en los casos raros (agotado, cancelado).

### En una frase

> 🔑 Edit hace lo que eliges; Agent elige por ti: cuanto más decide Copilot, más diff tienes que leer.
