# Laboratorio: revisar un diff con Copilot

[← Página anterior](06-lab-commit-y-pull-request.md) · [Siguiente página →](08-lab-trazabilidad.md)

Finanzas liquida con cada promotor a partir de una hoja: pedido, fecha, entradas, total, comisión y reembolsado (issue
**TEA-111**). Un compañero de Plataforma ha subido la rama `revision/tea-111` con la exportación a CSV: compila, sus
tests pasan y te pide revisión. En este laboratorio revisas ese diff con Copilot en el chat de VS Code, compruebas cada
hallazgo contra Teatralia y descubres qué encuentra Copilot y qué se le escapa.

### Objetivo

Comprender qué aporta y dónde se queda corta la revisión de código asistida: cómo se pide una revisión útil, cómo debe
contrastarse cada hallazgo, cómo se detectan los fallos que el revisor (humano o IA) no ve y cómo se mejora con una
lista de comprobación propia del sistema.

### Punto de partida

- Codespace del fork, terminal en la raíz del repositorio, en la rama principal (`main`) y sin cambios.
- Estado limpio, la rama del compañero creada y la plataforma arrancada (la última orden en otra terminal, que
  dejas abierta):

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
# Crea la rama revision/tea-111 con el commit del compañero y se cambia a ella
scripts/m03-rama-revision.sh
# API en 3000 con el código de la rama
make up
```

**Resultado esperado** del script (el hash del commit cambia en cada ejecución):

```text
Rama revision/tea-111 creada desde main con 1 commit:
365dcd8 TEA-111: exportar las ventas de un evento a CSV
 teatralia/services/api/src/reports/sales-csv.ts | 16 ++++++++++++++++
 teatralia/services/api/src/routes/admin.ts      | 16 ++++++++++++++++
 teatralia/services/api/test/sales-csv.test.ts   | 16 ++++++++++++++++
 3 files changed, 48 insertions(+)

Ahora estás en revision/tea-111. Para ver el cambio completo: git diff main...revision/tea-111
```

<details>
<summary>Qué hace por dentro (<code>scripts/m03-rama-revision.sh</code>)</summary>

```bash
rama=revision/tea-111
base=$(git rev-parse --abbrev-ref HEAD)          # la rama en la que estás (main)
# No pisa tu trabajo: sale si hay cambios en teatralia/ o si la rama ya existe
[ -n "$(git status --porcelain -- teatralia)" ] && exit 1
git show-ref --verify --quiet "refs/heads/$rama" && exit 1
git switch -q -c "$rama"
git apply --index <<'PATCH'                      # el trabajo del compañero, incluido en el script
…
PATCH
git -c user.name="Compañero de Plataforma" … commit -q -m "TEA-111: exportar las ventas de un evento a CSV" …
git diff --stat "$base...$rama"
```

No mires el parche dentro del script antes de revisar: es la solución.

</details>

- Copilot Chat: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>.

### Qué está pasando

La revisión de código es la última barrera antes de producción. Copilot revisa deprisa y encuentra patrones conocidos
(SQL concatenado, un `await` olvidado). Lo que no puede saber solo son las **reglas de Teatralia**: que cada consulta
del backoffice filtra por el promotor del token, que los importes viajan en céntimos, que Finanzas trabaja en hora de
Madrid. Y unos tests en verde no dicen nada si prueban lo que el código hace en vez de lo que debería hacer.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| La PR de un compañero | La rama `revision/tea-111` (1 commit, 3 ficheros) |
| El revisor automático | Copilot Chat sobre `git diff main...revision/tea-111` |
| Copilot code review en github.com | Alternativa si tu plan lo incluye (nota del paso 4) |
| Lo que decide si un hallazgo es real | `curl` contra la API y `psql` |

### 1 — Mira el cambio y su commit

```bash
# El commit del compañero y el diff completo
git log --oneline -1
git diff main...revision/tea-111
```

**Resultado esperado:** el commit `TEA-111: exportar las ventas de un evento a CSV` y un diff de tres ficheros: un
módulo nuevo `reports/sales-csv.ts` (cabecera y `toCsvRow`), una ruta `GET /api/admin/events/:id/sales.csv` en
`routes/admin.ts` y un test. Léelo entero una vez, sin herramientas, y quédate con tu primera impresión.

### 2 — Comprueba que los tests pasan

El compañero dice «tests incluidos». Compruébalo:

```bash
# Todos los tests de Teatralia, con los de la rama
make test
```

**Resultado esperado:**

```text
 Test Files  7 passed (7)
      Tests  23 passed (23)
```

**Cómo se lee:** 23 tests en verde (21 de partida + 2 nuevos). Guárdalo: al final del laboratorio verás que un test
en verde puede estar fijando un fallo.

### 3 — Pide una revisión sin contexto

Chat nuevo, modo **Ask**. Primero, la petición que haría cualquiera:

```text
Revisa este cambio como revisor de la pull request: #file:teatralia/services/api/src/routes/admin.ts
#file:teatralia/services/api/src/reports/sales-csv.ts #file:teatralia/services/api/test/sales-csv.test.ts
La ruta nueva es GET /api/admin/events/:id/sales.csv. Lista los problemas por gravedad
(bloqueante, mejora, estilo), con fichero y línea. No cambies nada.
```

**Qué debe contener la respuesta** (varía en cada ejecución): casi siempre, como bloqueante, la **inyección SQL** de
`WHERE o.event_id = '${req.params.id}'`. A menudo, cosas de estilo (separador `;`, falta de escape de comillas en el
CSV, nombre del fichero). Fíjate en lo que **no** suele aparecer o aparece como «mejora»: que la consulta no filtra
por el promotor, y que los importes salen en euros con decimales.

### 4 — Pide la revisión con las reglas del sistema

Ahora dale a Copilot la lista que usa el equipo de Teatralia:

```text
Repite la revisión con esta lista de comprobación de Teatralia y di, para cada punto, CUMPLE o NO CUMPLE
con la línea:
1. Toda consulta del backoffice filtra por el promotor del token (adminOf → t.id).
2. SQL siempre parametrizado ($1, $2…), nunca valores en el texto.
3. Importes en céntimos enteros en la API y en los ficheros que se exportan; nunca euros con decimales.
4. Los tests comprueban la regla de negocio, no copian la salida del código.
```

**Qué debe contener la respuesta:** el punto 1 como NO CUMPLE (`await adminOf(req)` sin usar el resultado; el `WHERE`
solo filtra por `event_id`), el 2 como NO CUMPLE (inyección), el 3 como NO CUMPLE (`r.total_cents / 100`) y, con
suerte, el 4 (el test espera `133.7`).

> [!NOTE]
> Si tu cuenta tiene un plan de Copilot con **code review**, puedes subir la rama (`git push -u origin
> revision/tea-111`), abrir la PR en tu fork y añadir **Copilot** en **Reviewers**. Sus comentarios aparecen en
> **Files changed**. Se contrastan igual que los del chat: cada uno con un `curl`.

### 5 — Confirma el fallo de céntimos

Un hallazgo no es real hasta que el sistema lo muestra. La API ya está sirviendo la rama (con `make up`). Pide el CSV
de *Jazz en el Faro* y busca el pedido de referencia:

```bash
# Las primeras líneas del CSV de Sala Faro
curl -s localhost:3000/api/admin/events/EV-FARO-0042/sales.csv -H "authorization: Bearer faro-dev-token" | head -4
# El pedido de Ana (133,70 €)
curl -s localhost:3000/api/admin/events/EV-FARO-0042/sales.csv -H "authorization: Bearer faro-dev-token" | grep PED-2026-0107
```

**Resultado esperado:**

```text
pedido;fecha;entradas;total;comision;reembolsado
PED-2026-0790;2026-09-29;3;74.2;5.36;0
PED-2026-0806;2026-09-30;4;105.1;7.61;0
PED-2026-0808;2026-09-30;1;24.9;1.8;21.6
PED-2026-0107;2026-10-02;3;133.7;9.82;0
```

**Cómo se lee:** `133.7` en lugar de `13370`. Una hoja de cálculo en español lee `133.7` como texto o como 1337, y
`1.8` pierde el cero. Contra la convención de Teatralia (céntimos enteros) y fácil de pasar por alto porque «parece
un importe».

### 6 — Confirma la fuga entre promotores

El endpoint comprueba el token, pero ¿filtra por su promotor? Pide el CSV de un evento de Sala Faro con el token del
**Teatro Lumen** y cuenta las líneas:

```bash
# Teatro Lumen pide las ventas de un evento de Sala Faro
curl -s localhost:3000/api/admin/events/EV-FARO-0042/sales.csv -H "authorization: Bearer lumen-dev-token" | wc -l
```

**Resultado esperado:**

```text
92
```

**Cómo se lee:** 92 líneas: la cabecera y los 91 pedidos cobrados de Sala Faro, entregados a otro promotor. El token
es válido, así que `adminOf` no falla; nadie usa el promotor que devuelve. Es el fallo más grave del diff y el que
menos llama la atención al leerlo: lo que falta no se ve en un diff.

### 7 — Confirma la inyección

El id del evento entra en el SQL tal cual. Con el token del Teatro Lumen, un id que siempre es verdadero:

```bash
# El id del evento es: x' OR '1'='1  (codificado en la URL)
curl -s "localhost:3000/api/admin/events/x'%20OR%20'1'='1/sales.csv" -H 'authorization: Bearer lumen-dev-token' | wc -l
# Cuántos pedidos cobrados hay en toda la plataforma
psql "$DATABASE_URL" -Atc "SELECT count(*) FROM orders WHERE status IN ('paid','partially_refunded','refunded');"
```

**Resultado esperado:**

```text
2304
2303
```

**Cómo se lee:** 2303 pedidos + la cabecera: las ventas de **los seis promotores** en un fichero, pedidas por uno de
ellos. Inyección y falta de filtro se suman.

### 8 — Clasifica lo que encontró Copilot

Con los pasos 3 a 7, compara:

| Fallo | Comprobado con | ¿Lo vio la revisión sin contexto (paso 3)? | ¿Y con la lista (paso 4)? |
|-------|----------------|--------------------------------------------|---------------------------|
| SQL concatenado (inyección) | Paso 7: 2304 líneas | Casi siempre | Sí |
| Sin filtro por promotor | Paso 6: 92 líneas con otro token | A veces, como «mejora» | Sí, punto 1 |
| Importes en euros con decimales | Paso 5: `133.7` | Rara vez | Sí, punto 3 |
| Test que fija el fallo (`133.7`) | `make test` en verde | Casi nunca | A veces, punto 4 |

**Cómo se lee:** lo que Copilot encuentra solo es lo que es un fallo en cualquier sistema. Lo que es un fallo **en
Teatralia** lo encuentra cuando le das las reglas. Y nada de eso es un hallazgo hasta que `curl` lo confirma.

## Comprueba tu entendimiento

**Un token, sus datos**
Pide el CSV de `EV-FARO-0042` con `faro-dev-token` y cuenta las líneas con `wc -l`.
→ 92, igual que con el token del Lumen: la ruta devuelve lo mismo a cualquier promotor, que es el fallo.

**El test que miente**
Abre `teatralia/services/api/test/sales-csv.test.ts` y busca el valor esperado de PED-2026-0107.
→ `'PED-2026-0107;2026-11-02;3;133.7;9.82;0'`: el test copia la salida del código, así que pasa con el fallo de céntimos.

## Mejora

Corrige los tres fallos en la rama (a mano o pidiéndoselo a Copilot en modo **Edit** con la lista del paso 4) y repite
las comprobaciones de los pasos 5 a 7.

<details>
<summary>Ver corrección</summary>

```diff
--- a/teatralia/services/api/src/reports/sales-csv.ts
+++ b/teatralia/services/api/src/reports/sales-csv.ts
@@ -12,5 +12,5 @@ export const CSV_HEADER = 'pedido;fecha;entradas;total;comision;reembolsado';
 
 export function toCsvRow(r: SaleRow): string {
   const fecha = r.paid_at ? r.paid_at.toISOString().slice(0, 10) : '';
-  return [r.id, fecha, r.tickets, r.total_cents / 100, r.commission_cents / 100, r.refunded_cents / 100].join(';');
+  return [r.id, fecha, r.tickets, r.total_cents, r.commission_cents, r.refunded_cents].join(';');
 }
--- a/teatralia/services/api/src/routes/admin.ts
+++ b/teatralia/services/api/src/routes/admin.ts
@@ -213,13 +213,14 @@ export async function adminRoutes(app: FastifyInstance) {
 
   // TEA-111: ventas de un evento en CSV para la liquidación con Finanzas
   app.get<{ Params: { id: string } }>('/api/admin/events/:id/sales.csv', async (req, reply) => {
-    await adminOf(req);
+    const t = await adminOf(req);
     const r = await pool.query(
       `SELECT o.id, o.paid_at, o.total_cents, o.commission_cents, o.refunded_cents,
               (SELECT count(*) FROM tickets k WHERE k.order_id = o.id)::int AS tickets
          FROM orders o
-        WHERE o.event_id = '${req.params.id}' AND o.status IN ('paid', 'partially_refunded', 'refunded')
+        WHERE o.event_id = $1 AND o.tenant_id = $2 AND o.status IN ('paid', 'partially_refunded', 'refunded')
         ORDER BY o.paid_at`,
+      [req.params.id, t.id],
     );
--- a/teatralia/services/api/test/sales-csv.test.ts
+++ b/teatralia/services/api/test/sales-csv.test.ts
@@ -11,6 +11,6 @@ describe('exportación de ventas (TEA-111)', () => {
       id: 'PED-2026-0107', paid_at: new Date('2026-11-02T10:00:00Z'), tickets: 3,
       total_cents: 13370, commission_cents: 982, refunded_cents: 0,
     });
-    expect(row).toBe('PED-2026-0107;2026-11-02;3;133.7;9.82;0');
+    expect(row).toBe('PED-2026-0107;2026-11-02;3;13370;982;0');
   });
 });
```

Las comprobaciones, repetidas (Sala Faro con su pedido, Lumen pidiendo Faro, la inyección y Sala Faro completo):

```text
pedido;fecha;entradas;total;comision;reembolsado
PED-2026-0107;2026-10-02;3;13370;982;0
1
1
92
```

Con el token del Lumen y con la inyección solo llega la cabecera (1 línea); Sala Faro sigue recibiendo sus 92. Los
tests siguen en verde (`Tests  23 passed (23)`), ahora con el valor que dicta la regla y no el que daba el código.

</details>

## Reto

### 1 — El fallo que nadie sembró

**La situación:** con los tres fallos corregidos, Finanzas prueba la hoja y dice que algunos pedidos «caen en el día
anterior»: cuadran el día 16 de octubre con su pasarela y la hoja los pone el 15. Nadie (ni tú ni Copilot) lo marcó
en la revisión.

**Qué haces:** busca pedidos de `EV-FARO-0042` cuya fecha de pago sea distinta en UTC y en hora de Madrid, comprueba
qué fecha les pone el CSV, corrige `toCsvRow` y añade un test con uno de esos pedidos.

**Pistas:** `paid_at AT TIME ZONE 'Europe/Madrid'` en `psql`; `toISOString()` siempre da la fecha en UTC;
`toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })` da `AAAA-MM-DD` en hora de Madrid.

**Lo que buscas:** que el CSV ponga la fecha de Madrid a los pedidos pagados entre las 22:00 y las 00:00 UTC, con un
test que falle con el código anterior.

<details>
<summary>Ver solución</summary>

```bash
# Pedidos cuya fecha cambia entre UTC y Madrid
psql "$DATABASE_URL" -c "SELECT id, paid_at, paid_at AT TIME ZONE 'Europe/Madrid' AS madrid FROM orders WHERE event_id='EV-FARO-0042' AND status IN ('paid','partially_refunded','refunded') AND (paid_at AT TIME ZONE 'Europe/Madrid')::date <> (paid_at AT TIME ZONE 'UTC')::date ORDER BY paid_at LIMIT 3;"
# Lo que dice el CSV de dos de ellos
curl -s localhost:3000/api/admin/events/EV-FARO-0042/sales.csv -H 'authorization: Bearer faro-dev-token' | grep -E "PED-2026-1087|PED-2026-1148"
```

```text
      id       |          paid_at           |         madrid          
---------------+----------------------------+-------------------------
 PED-2026-1087 | 2026-10-15 23:21:01.387+00 | 2026-10-16 01:21:01.387
 PED-2026-1148 | 2026-10-18 22:51:56.074+00 | 2026-10-19 00:51:56.074
 PED-2026-1168 | 2026-10-19 23:18:28.06+00  | 2026-10-20 01:18:28.06
(3 rows)

PED-2026-1087;2026-10-15;1;3640;266;0
PED-2026-1148;2026-10-18;2;4380;315;0
```

La corrección en `sales-csv.ts` y el test nuevo en `sales-csv.test.ts`:

```ts
  // fecha de pago en hora de España (Finanzas liquida por día natural en Madrid), formato AAAA-MM-DD
  const fecha = r.paid_at ? r.paid_at.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }) : '';
```

```ts
  it('la fecha es el día de pago en Madrid, no en UTC', () => {
    const row = toCsvRow({
      id: 'PED-2026-1087', paid_at: new Date('2026-10-15T23:21:01Z'), tickets: 2,
      total_cents: 0, commission_cents: 0, refunded_cents: 0,
    });
    expect(row.split(';')[1]).toBe('2026-10-16');
  });
```

```text
      Tests  3 passed (3)
PED-2026-1087;2026-10-16;1;3640;266;0
PED-2026-1148;2026-10-19;2;4380;315;0
```

Seis pedidos de *Jazz en el Faro* cambian de día. En una liquidación diaria, el total de dos días no cuadra con la
pasarela. **La regla:** una revisión, humana o asistida, solo encuentra lo que alguien sabe buscar; las reglas que el
equipo aprende en producción (zona horaria de Finanzas) se añaden a la lista de comprobación para la siguiente.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| El script dice «Tienes cambios sin guardar en teatralia/» | Quedan cambios de otro laboratorio | `CONFIRM=1 make reset` y vuelve a lanzarlo |
| El script dice «La rama revision/tea-111 ya existe» | Lo ejecutaste antes | `git switch main && git branch -D revision/tea-111` y repite |
| `curl` devuelve `{"message":"Route GET:/api/admin/events/…/sales.csv not found"…}` | La API sirve el código de `main` | `git branch --show-current` debe decir `revision/tea-111`; reinicia `make up` |
| `make reset` no quita el CSV | `make reset` restaura los ficheros de la rama en la que estás | `git switch main` y después `CONFIRM=1 make reset` |
| La revisión de Copilot no menciona el promotor | Revisión sin las reglas de Teatralia | Paso 4: lista de comprobación explícita |

Al terminar, vuelve a la rama principal para el resto de laboratorios:

```bash
# Deja la rama de revisión y vuelve al punto de partida
git switch main
CONFIRM=1 make reset
```

## Conclusiones

### Qué es la revisión asistida

Es pedir a Copilot que lea un diff como revisor y proponga hallazgos. Acelera la lectura y encuentra patrones de fallo
generales; no sustituye a quien conoce las reglas del sistema ni a la comprobación contra el sistema.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Diff completo y ficheros adjuntos | `git diff main...revision/tea-111`, `#file:` de los tres |
| Lista de comprobación del sistema | Promotor, SQL parametrizado, céntimos, tests con la regla |
| Cada hallazgo confirmado con el sistema | `curl` (92 líneas, 2304 líneas, `133.7`) |
| Tests leídos, no solo ejecutados | `133.7` fijado en el test |
| Corrección verificada con las mismas pruebas | 1 / 1 / 92 líneas y `13370;982;0` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Lo que falta no se ve en un diff | Filtro por promotor ausente, paso 6 | Fuga de ventas entre promotores |
| Reglas del negocio fuera del alcance de Copilot | Céntimos solo con la lista (paso 4) | Hojas de Finanzas mal leídas |
| Tests en verde que copian la salida | `make test` con `133.7` | Falsa confianza en la PR |
| Fallos que nadie sabe buscar | Reto: fechas en UTC | Liquidaciones diarias que no cuadran |

### Cómo se perfecciona

La lista del paso 4 vive en el repositorio: en `.github/copilot-instructions.md` (para que Copilot la aplique al
revisar y al escribir) y en la plantilla de PR (para el revisor humano). Cada fallo que se escapa a producción añade
una línea a la lista. Con un plan que lo incluya, Copilot code review en github.com aplica esas mismas instrucciones
en cada PR.

### En una frase

> 🔑 Copilot encuentra los fallos que son fallos en cualquier sistema; los de Teatralia los encuentra cuando le das sus reglas, y ninguno es un hallazgo hasta que el sistema lo confirma.
