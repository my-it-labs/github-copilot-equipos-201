# Laboratorio: instrucciones por ruta

[← Página anterior](01-lab-instrucciones-del-repositorio.md) · [Siguiente página →](03-lab-prompt-files.md)

Teatralia es un monorepo: la API, la tienda, el backoffice y el notifier tienen convenciones distintas. Que el
backoffice llame a la API con `admin()` y muestre los importes con `formatEuros` no le importa a la API, y meter esas
reglas en las instrucciones de todo el repositorio es ruido en cada petición. En este laboratorio escribes un fichero
de instrucciones **solo para `apps/backoffice`** con `applyTo`, pides con él una pantalla nueva (**Recintos**, el aforo
y las plazas de movilidad reducida de cada recinto) y compruebas cuándo se aplica y cuándo no.

### Objetivo

Comprender qué son las instrucciones condicionadas a la ruta: cómo decide VS Code cuándo añadirlas, cómo se ve en
la respuesta que se han usado, qué pasa cuando el patrón es demasiado amplio y cómo se ajusta.

### Punto de partida

- Terminal en la raíz del repositorio y Teatralia en su estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- En otra terminal, la plataforma en marcha (el backoffice se recarga solo al guardar):

```bash
# Arranca api, tienda, backoffice…; deja esta terminal abierta
make up
```

- Backoffice en el puerto **5174** (pestaña **Ports** del Codespace, o `http://localhost:5174` en local). Token de
  **Auditorio El Olivo**: `olivo-dev-token`.
- No hace falta `.github/copilot-instructions.md`. Si existe de otro laboratorio, puede quedarse: no interfiere.

### Qué está pasando

En un equipo de Plataforma conviven personas que tocan la API y personas que tocan el panel del promotor. Cada parte
tiene sus costumbres, y las del backoffice están en su código:

| En el backoffice | Dónde está |
|------------------|------------|
| Las llamadas a la API pasan por `admin<T>(ruta)`, que pone el token del promotor | `apps/backoffice/src/api.ts` |
| Cada pantalla carga sus datos con el hook `useAdmin<T>(ruta)` | `operations.tsx` y `sections.tsx` |
| Importes con `formatEuros(cents)` y fechas con `formatDate(iso)` | `@teatralia/ui` |
| Errores en `<p role="alert">` | Todas las pantallas |

Un fichero `.github/instructions/*.instructions.md` lleva en su cabecera un patrón `applyTo`. VS Code lo añade a la
petición **solo cuando hay en el contexto ficheros que casan con ese patrón**: el fichero activo en el editor, los que
adjuntas o los que el agente va a modificar.

### 1 — Mira las costumbres del backoffice en el código

Antes de escribir las reglas, compruebas que el backoffice de verdad trabaja así.

```bash
# Desde teatralia/: quién llama a fetch, quién usa useAdmin y de dónde salen los formatos
cd teatralia
grep -n "fetch(" apps/backoffice/src/*.ts apps/backoffice/src/*.tsx
grep -c "useAdmin<" apps/backoffice/src/operations.tsx apps/backoffice/src/sections.tsx
grep -n "from '@teatralia/ui'" apps/backoffice/src/*.tsx
```

**Resultado esperado:**

```text
apps/backoffice/src/api.ts:10:  const res = await fetch(`/api/admin${path}`, {
apps/backoffice/src/operations.tsx:5
apps/backoffice/src/sections.tsx:6
apps/backoffice/src/EventEditor.tsx:2:import { createApi, TeatraliaProvider, type EventInfo } from '@teatralia/ui';
apps/backoffice/src/operations.tsx:1:import { formatDate, formatEuros } from '@teatralia/ui';
apps/backoffice/src/sections.tsx:1:import { formatDate, formatEuros } from '@teatralia/ui';
```

**Cómo se lee:** solo `api.ts` llama a `fetch`; las pantallas de `operations.tsx` y `sections.tsx` usan `useAdmin`
(cada fichero tiene su propia copia del hook, de ahí la línea de más) y los formatos de `@teatralia/ui`.
Una pantalla nueva con un `fetch` directo funcionaría a medias: sin la cabecera `authorization`, la API responde 401.

### 2 — Escribe las instrucciones del backoffice

Creas el fichero en `.github/instructions/` de la raíz del repositorio. La cabecera (entre las dos líneas `---`)
dice a qué ficheros aplica; el cuerpo, las reglas. El patrón empieza por `teatralia/` porque se evalúa desde la raíz
del workspace.

```bash
# Vuelve a la raíz y crea las instrucciones del backoffice
cd ..
mkdir -p .github/instructions
cat > .github/instructions/backoffice.instructions.md <<'EOF'
---
applyTo: "teatralia/apps/backoffice/**"
description: Convenciones del backoffice de Teatralia (React)
---
# Backoffice de Teatralia

- Llama a la API solo con `admin<T>(ruta)` de `apps/backoffice/src/api.ts`. Nunca `fetch` directo: `admin` pone el token del promotor.
- Carga los datos de una pantalla con el hook `useAdmin<T>(ruta)` del mismo fichero.
- Importes con `formatEuros(cents)` y fechas con `formatDate(iso)` de `@teatralia/ui`. Nunca formatees a mano.
- Cada pantalla es un `<section className="card">` con su `<h2>`; los errores, en `<p role="alert">`.
- Una pantalla nueva se registra en `NAV` y en el enrutado por hash de `main.tsx`.
- Sin librerías nuevas de UI ni de estado: React y estilos en línea, como el resto.
EOF
head -4 .github/instructions/backoffice.instructions.md
```

**Resultado esperado:**

```text
---
applyTo: "teatralia/apps/backoffice/**"
description: Convenciones del backoffice de Teatralia (React)
---
```

### 3 — Pide la pantalla con un fichero del backoffice abierto

Abres `sections.tsx` para que el fichero activo case con el patrón y pides la pantalla sin repetir ninguna regla.

1. Abre `teatralia/apps/backoffice/src/sections.tsx` (<kbd>Ctrl</kbd>+<kbd>P</kbd> y escribe `sections.tsx`).
2. Vista **Chat** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>), conversación nueva con **+**, modo **Agent**.
3. Pega este prompt y envíalo:

```text
Añade al backoffice una pantalla "Recintos" que liste los recintos del promotor con su ciudad,
aforo y plazas de movilidad reducida (GET /api/admin/venues ya existe), con su entrada en el menú.
```

4. Revisa el diff (lo normal: `sections.tsx` y `main.tsx`) y pulsa **Keep**.

**Qué debe contener la respuesta** (varía en cada ejecución):

- Un componente nuevo (por ejemplo `Venues`) que usa `useAdmin<…>('/venues')`, no `fetch`.
- `<section className="card">`, `<h2>Recintos</h2>` y el error en `<p role="alert">`.
- Una entrada `['#/recintos', 'Recintos']` en `NAV` y su rama en el enrutado de `main.tsx`.
- En la lista de referencias de la respuesta (**Used n references**), `.github/instructions/backoffice.instructions.md`.

### 4 — Comprueba el código contra las reglas

Buscas en el código generado lo que las reglas prohíben y compilas el backoffice.

```bash
# Desde teatralia/: sigue habiendo un único fetch, la pantalla usa useAdmin y compila
cd teatralia
grep -n "fetch(" apps/backoffice/src/*.ts apps/backoffice/src/*.tsx
grep -n "useAdmin<Venue" apps/backoffice/src/sections.tsx
npm run typecheck -w @teatralia/backoffice
```

**Resultado esperado** (solución de referencia; el número de línea y el nombre del tipo pueden cambiar):

```text
apps/backoffice/src/api.ts:10:  const res = await fetch(`/api/admin${path}`, {
210:  const { data, error } = useAdmin<Venue[]>('/venues');

> typecheck
> tsc -p tsconfig.json

```

**Cómo se lee:** el único `fetch` sigue siendo el de `api.ts`; la pantalla nueva carga con `useAdmin`; `tsc` termina
sin errores. Si aparece un segundo `fetch`, la regla no se ha aplicado o Copilot la ha ignorado: pídele que use
`admin`/`useAdmin` y vuelve a comprobar.

### 5 — Compruébalo en el backoffice

Lo último es ver la pantalla con datos reales de otro promotor, para que no te valga una pantalla que solo funcione
con Sala Faro.

1. Abre el backoffice (puerto 5174) y entra con el token `olivo-dev-token`.
2. Pulsa **Recintos** en el menú.

**Resultado esperado:** una fila, **Auditorio El Olivo**, Sevilla, aforo 492 y 12 plazas de movilidad reducida. Son
los datos que devuelve la API:

```bash
# Lo que recibe la pantalla
curl -s localhost:3000/api/admin/venues -H 'authorization: Bearer olivo-dev-token'
```

```text
[{"id":"VN-OLIVO","tenant_id":"TN-OLIVO","name":"Auditorio El Olivo","city":"Sevilla","capacity":492,"accessible_seats":12}]
```

<details>
<summary>Solución de referencia (<code>sections.tsx</code> y <code>main.tsx</code>)</summary>

Al final de `apps/backoffice/src/sections.tsx`:

```tsx
interface Venue {
  id: string; name: string; city: string; capacity: number; accessible_seats: number;
}

// Recintos del promotor: aforo y plazas para movilidad reducida
export function Venues() {
  const { data, error } = useAdmin<Venue[]>('/venues');
  return (
    <section className="card">
      <h2>Recintos</h2>
      {error && <p role="alert">{error}</p>}
      {data?.length === 0 && <p>Este promotor no tiene recintos.</p>}
      <table>
        <thead><tr><th>Recinto</th><th>Ciudad</th><th>Aforo</th><th>Plazas de movilidad reducida</th></tr></thead>
        <tbody>
          {data?.map((v) => (
            <tr key={v.id}>
              <td><strong>{v.name}</strong><br /><small>{v.id}</small></td>
              <td>{v.city}</td>
              <td>{v.capacity.toLocaleString('es-ES')}</td>
              <td>{v.accessible_seats}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

En `apps/backoffice/src/main.tsx`: `Venues` en el `import` de `./sections.js`, la entrada `['#/recintos', 'Recintos']`
después de `['#/eventos', 'Eventos']` en `NAV` y, antes de la rama de `#/eventos`:

```tsx
        ) : hash.startsWith('#/recintos') ? (
          <Venues />
```

</details>

### 6 — Contraprueba: con un fichero de la API no se aplica

Unas instrucciones por ruta sirven si **no** aparecen donde no tocan. Haces una pregunta sobre la API, con un
fichero de la API en el contexto.

1. Cierra las pestañas del backoffice en el editor y abre `teatralia/services/api/src/routes/admin.ts`.
2. Conversación nueva con **+**, modo **Ask**.
3. Envía:

```text
#file:teatralia/services/api/src/routes/admin.ts ¿Qué columnas devuelve GET /api/admin/venues?
```

**Qué debe contener la respuesta:** que hace `SELECT *` sobre `venues` filtrado por `tenant_id`, con las columnas
`id`, `tenant_id`, `name`, `city`, `capacity` y `accessible_seats`. En la lista de referencias aparece `admin.ts`,
y **no** aparece `backoffice.instructions.md`.

**La comprobación:** las columnas de la tabla, en la base de datos:

```bash
# Columnas reales de venues
psql "$DATABASE_URL" -c '\d venues' | sed -n '2,9p'
```

```text
      Column      |  Type   | Collation | Nullable | Default 
------------------+---------+-----------+----------+---------
 id               | text    |           | not null | 
 tenant_id        | text    |           | not null | 
 name             | text    |           | not null | 
 city             | text    |           | not null | 
 capacity         | integer |           | not null | 
 accessible_seats | integer |           | not null | 0
```

> [!NOTE]
> Qué ficheros cuentan para `applyTo` (el activo, los adjuntos, los que el agente edita) puede variar entre versiones
> de VS Code. La forma fiable de saberlo es la que usas aquí: mirar la lista de referencias de cada respuesta.

## Comprueba tu entendimiento

**El patrón decide**
Con `teatralia/apps/backoffice/src/operations.tsx` como fichero activo, pregunta en modo **Ask**: «¿Cómo se carga la lista de incidencias?».
→ La respuesta habla de `useAdmin('/cases')` y en sus referencias aparece `backoffice.instructions.md`.

**Fuera del patrón no está**
Con `teatralia/services/notifier/src/jobs.ts` como fichero activo, pregunta: «¿Cuántas veces se reintenta un correo?».
→ La referencia de instrucciones del backoffice no aparece.

## Experimenta

Predice: si cambias el patrón a `"**/*.tsx"`, ¿qué pasa al preguntar por la tienda (`apps/storefront`)?

1. En `.github/instructions/backoffice.instructions.md`, cambia la línea `applyTo` por `applyTo: "**/*.tsx"` y guarda.
2. Abre `teatralia/apps/storefront/src/pages.tsx` y, en una conversación nueva en modo **Ask**, pregunta: «¿Cómo carga esta página los datos del evento?».
3. Mira las referencias.

Ahora las reglas del backoffice aparecen también en la tienda, donde `admin()` y `useAdmin` no existen:

```bash
# En la tienda no hay ni admin() ni useAdmin
grep -c "useAdmin\|admin<" teatralia/apps/storefront/src/*.tsx
```

```text
teatralia/apps/storefront/src/main.tsx:0
teatralia/apps/storefront/src/pages.tsx:0
```

Un patrón demasiado amplio no solo gasta contexto: empuja a Copilot hacia funciones que en esa parte del monorepo
no existen. Vuelve a dejar `applyTo: "teatralia/apps/backoffice/**"`.

## Reto

### 1 — Una regla que evita duplicar el diccionario de estados

**La situación:** la pantalla **Eventos** del backoffice no enseña el estado del evento (a la venta, agotado,
aplazado…). El diccionario que traduce `on_sale` → «a la venta» ya existe en `operations.tsx` (`STATUS_LABEL` y la
función `label`), pero no está exportado. Lo habitual es que Copilot copie el diccionario en `sections.tsx`, y en
seis meses los dos se habrán separado.

**Qué haces:** añade una regla a `backoffice.instructions.md` sobre cómo mostrar estados y pide, con `sections.tsx`
abierto y en modo **Agent**: «Añade la columna Estado a la pantalla Eventos». Después:

```bash
# Desde teatralia/: el diccionario tiene que seguir existiendo una sola vez, y compilar
grep -l "on_sale: 'a la venta'" apps/backoffice/src/*.tsx
grep -n "label(e.status)\|import { label }" apps/backoffice/src/sections.tsx
npm run typecheck -w @teatralia/backoffice
```

**Pistas:** la regla tiene que decir dónde está el diccionario y qué hacer con él (exportarlo y reutilizarlo). La API
ya devuelve `status` en `GET /api/admin/events`.

**Lo que buscas:** `grep -l` lista **solo** `operations.tsx`, `sections.tsx` importa `label` y `tsc` no da errores.

<details>
<summary>Ver solución</summary>

La regla añadida:

```markdown
- Los estados (`on_sale`, `paid`, `refunded`…) se muestran con `label()` de `operations.tsx`. Si hace falta en otro fichero, exporta `label` e impórtalo: nunca copies `STATUS_LABEL`.
```

El cambio de referencia: `export const label = …` en `operations.tsx`; en `sections.tsx`,
`import { label } from './operations.js';`, `status: string` en el tipo de `useAdmin` de `Events`, una cabecera
`<th>Estado</th>` y la celda `<td>{label(e.status)}</td>`. Salida real:

```text
apps/backoffice/src/operations.tsx
4:import { label } from './operations.js';
31:              <td>{label(e.status)}</td>

> typecheck
> tsc -p tsconfig.json

```

En la pantalla **Eventos** de Sala Faro, *Fado y saudade* aparece como «aplazado» y *Cuarteto Atlántico* como
«agotado». Sin la regla, la pantalla también funcionaría, pero con dos diccionarios. **La regla:** las instrucciones
por ruta son el sitio para las decisiones locales de diseño («esto existe aquí, reutilízalo») que el modelo no
puede deducir de un solo fichero.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `backoffice.instructions.md` nunca aparece en las referencias | El patrón no incluye `teatralia/` o el fichero no acaba en `.instructions.md` | `applyTo: "teatralia/apps/backoffice/**"` y nombre `*.instructions.md` |
| Aparece en preguntas sobre la API | Hay una pestaña del backoffice como fichero activo o adjunta | Cierra esas pestañas y pregunta en una conversación nueva |
| La pantalla **Recintos** sale vacía con un error 401 | El código generado usa `fetch` directo, sin token | Pide que use `useAdmin('/venues')` |
| `npm run typecheck` falla en `main.tsx` | Falta `Venues` en el `import` de `./sections.js` | Añádelo y vuelve a compilar |
| La cabecera se muestra como texto en la respuesta | Faltan las líneas `---` o hay espacios antes | La primera línea del fichero tiene que ser `---` |

## Conclusiones

### Qué son las instrucciones por ruta

Ficheros `.github/instructions/*.instructions.md` con un patrón `applyTo`. VS Code los añade a la petición cuando
en el contexto hay ficheros que casan con el patrón; las instrucciones del repositorio, en cambio, van siempre.

```text
fichero activo / adjuntos / editados  ──casa con applyTo?──►  sí: se añaden las reglas del backoffice
                                                         └─►  no: la petición va sin ellas
```

### Cómo deben ser

| Requisito | En el lab |
|-----------|-----------|
| Patrón desde la raíz del workspace | `teatralia/apps/backoffice/**` |
| Reglas que solo valen en esa ruta | `admin()`, `useAdmin`, `formatEuros`, `NAV` |
| Comprobables con `grep` o el compilador | Un único `fetch`; `tsc` sin errores |
| Visibles en la respuesta | `backoffice.instructions.md` en las referencias |

### Dónde se rompen y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Patrón demasiado amplio | Experimenta: `**/*.tsx` llega a la tienda | Código con funciones que allí no existen |
| Patrón que no casa | Las referencias no lo listan | Las reglas no llegan y nadie se entera |
| Decisión local no escrita | Reto: el diccionario de estados se duplica | Dos fuentes que se separan con el tiempo |

### Cómo se perfecciona

Un fichero por zona del monorepo con reglas propias (backoffice, tienda, notifier, tests), cada uno corto y con su
patrón probado con la contraprueba del paso 6. Lo común a todo el repositorio sigue en `copilot-instructions.md`.

### En una frase

> 🔑 Las instrucciones por ruta llevan cada regla solo a donde aplica; se comprueban mirando en qué respuestas
> aparecen y, sobre todo, en cuáles no.
