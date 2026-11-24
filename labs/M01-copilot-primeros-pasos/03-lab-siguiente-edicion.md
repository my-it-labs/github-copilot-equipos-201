# Laboratorio: sugerencias de siguiente edición

[← Página anterior](02-lab-sugerencias-en-linea.md) · [Siguiente página →](04-lab-preguntar-al-codigo.md)

El cálculo de importes de Teatralia (`calcOrderAmounts`) lo escribió el primer equipo con nombres de una letra o abreviados: `sub`, `fees`, `com`, `p`, `f`, `c`. En este lab empiezas a ponerle nombres legibles y dejas que las **sugerencias de siguiente edición** de Copilot propongan los cambios que siguen al primero. Después lo comparas con la herramienta de renombrado del editor, que no es IA.

### Objetivo

Comprender qué son las sugerencias de siguiente edición: cómo deducen el siguiente cambio a partir del que acabas de hacer, cuándo aciertan, cómo se detecta un salto que no toca y en qué se diferencian de un renombrado del editor.

### Punto de partida

- Codespace del curso con Copilot activo.
- Teatralia en el estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- No hace falta `make up`.

### Qué está pasando

`teatralia/services/api/src/orders/pricing.ts` calcula subtotal, gastos de gestión, total y comisión de cada pedido. Funciona y tiene tests, pero se lee mal. Un cambio de nombre en una variable obliga a cambiar todas sus apariciones; un cambio de forma (un parámetro nuevo, otra unidad) obliga a cambiar código parecido que no es idéntico.

Las **sugerencias de siguiente edición** (*next edit suggestions*) observan el cambio que acabas de hacer y proponen el siguiente, en otra línea del fichero. Aparecen como una flecha en el margen y un texto resaltado; <kbd>Tab</kbd> salta hasta ella y otra vez <kbd>Tab</kbd> la acepta.

| Herramienta | Cómo decide qué cambiar | Cuándo encaja |
|-------------|-------------------------|---------------|
| **Rename Symbol** (<kbd>F2</kbd>) | Análisis del lenguaje: todas las referencias exactas del símbolo | Renombrar, sin excepciones |
| **Sugerencia de siguiente edición** | Modelo de lenguaje: el patrón de tu último cambio | Cambios parecidos que no son idénticos |

### 1 — Comprueba que las sugerencias de siguiente edición están activas

Es un ajuste de VS Code que puede venir desactivado.

1. <kbd>Ctrl</kbd>+<kbd>,</kbd> para abrir **Settings**.
2. Busca `nextEditSuggestions`.
3. Marca **GitHub › Copilot › Next Edit Suggestions: Enabled**.

**Resultado esperado:** la casilla marcada. No hace falta recargar.

> [!NOTE]
> El nombre exacto del ajuste puede variar con la versión de la extensión. Si no aparece con esa búsqueda, prueba `next edit`.

### 2 — Mira el fichero y su red de tests

Antes de tocar nada, sabes qué protege el cálculo.

```bash
# Tests de la API, entre ellos los de calcOrderAmounts
cd teatralia && npx vitest run services/api; cd ..
```

**Resultado esperado** (última parte):

```text
      Tests  8 passed (8)
```

Abre `teatralia/services/api/src/orders/pricing.ts` (<kbd>Ctrl</kbd>+<kbd>P</kbd> → `orders/pricing.ts`) y busca dónde aparece `sub`:

```bash
# Las cuatro apariciones de la variable sub
grep -n "\bsub\b" teatralia/services/api/src/orders/pricing.ts
```

```text
30:  let sub = 0;
47:    sub = sub + p;
59:  const total = sub + fees;
60:  return { subtotal_cents: sub, fee_cents: fees, total_cents: total, commission_cents: com, lines: lines };
```

### 3 — Cambia el primer nombre a mano

Haces tú el primer cambio; Copilot propone los siguientes.

1. En la línea 30, cambia `let sub = 0;` por `let subtotalCents = 0;` escribiéndolo (no uses <kbd>F2</kbd>).
2. Espera sin mover el cursor.

**Qué debe aparecer:** una flecha en el margen y, resaltada, la línea 47 con `subtotalCents = subtotalCents + p;`. Si no aparece, escribe un carácter y bórralo: la sugerencia se recalcula tras cada edición.

### 4 — Recorre y acepta las sugerencias una a una

Cada salto es un cambio que revisas antes de aceptar.

1. Pulsa <kbd>Tab</kbd>: el cursor salta a la sugerencia.
2. Lee el cambio. Si es correcto, pulsa <kbd>Tab</kbd> otra vez para aceptarlo; si no, <kbd>Esc</kbd>.
3. Repite hasta que no aparezcan más sugerencias.

**Resultado esperado:** las líneas 47, 59 y 60 cambiadas. Compruébalo:

```bash
# Ya no queda ningún sub suelto y los tests siguen en verde
grep -n "\bsub\b" teatralia/services/api/src/orders/pricing.ts
grep -n "subtotalCents" teatralia/services/api/src/orders/pricing.ts
cd teatralia && npx vitest run services/api; cd ..
```

```text
30:  let subtotalCents = 0;
47:    subtotalCents = subtotalCents + p;
59:  const total = subtotalCents + fees;
60:  return { subtotal_cents: subtotalCents, fee_cents: fees, total_cents: total, commission_cents: com, lines: lines };
      Tests  8 passed (8)
```

**Cómo se lee:** el primer `grep` no devuelve nada (no queda `sub`), el segundo encuentra las cuatro líneas y los tests siguen pasando. Fíjate en la línea 60: `subtotal_cents` (la clave del objeto) **no** debe cambiar; si Copilot la propuso, era un salto que no tocaba.

### 5 — Compáralo con el renombrado del editor

El mismo cambio en `fees` con la herramienta que no adivina.

1. Pon el cursor sobre `fees` en la línea 31.
2. Pulsa <kbd>F2</kbd>, escribe `feesCents` y <kbd>Enter</kbd>.

```bash
# Cuántas líneas ha cambiado cada técnica
git diff --stat teatralia/services/api/src/orders/pricing.ts
```

**Resultado esperado:**

```text
 teatralia/services/api/src/orders/pricing.ts | 12 ++++++------
 1 file changed, 6 insertions(+), 6 deletions(-)
```

**Cómo se lee:** <kbd>F2</kbd> cambió todas las referencias de `fees` de golpe y sin proponer nada, porque sabe qué es una referencia en TypeScript. Para renombrar, gana <kbd>F2</kbd>. Las sugerencias de siguiente edición sirven para lo que <kbd>F2</kbd> no sabe hacer: cambios que siguen un patrón pero no son el mismo símbolo.

## Comprueba tu entendimiento

**La sugerencia que no toca**
Deshaz los cambios (`git checkout -- teatralia`), cambia a mano `let com = 0;` por `let commissionCents = 0;` y recorre las sugerencias.
→ Copilot propone cambiar `com = com + c;` y `commission_cents: com`. Si propone tocar la clave `commission_cents`, recházala con <kbd>Esc</kbd>.

**El test es el juez**
Tras aceptar todas las sugerencias, ejecuta `cd teatralia && npx vitest run services/api; cd ..`.
→ `Tests  8 passed (8)`. Si algo falla, alguna sugerencia aceptada cambió más de lo debido.

## Experimenta

Predice antes de probar: si cambias la **forma** de un cálculo en un sitio, ¿te propondrá Copilot el mismo cambio en los sitios parecidos?

1. En `pricing.ts`, cambia `if (p == 0) c = 0;` por `if (p === 0) c = 0;`.
2. Espera la sugerencia.

Lo habitual es que Copilot proponga el mismo cambio en `if (lines.length == 0)` (otro `==` del fichero). No es el mismo símbolo: es el mismo **patrón**. Ese es el caso que <kbd>F2</kbd> no cubre.

## Mejora

Deja `pricing.ts` legible del todo: renombra `p`, `f` y `c` dentro del bucle a `priceCents`, `feeCents` y `commissionCents`, usando <kbd>F2</kbd> donde sea un renombrado puro y las sugerencias de siguiente edición donde sea un patrón. Al terminar, `npx vitest run services/api` debe seguir en `8 passed`.

## Reto

### 1 — Un parámetro nuevo que hay que propagar

**La situación:** Liquidaciones quiere poder calcular la comisión con otro redondeo. Alguien propone añadir a `calcOrderAmounts` un tercer parámetro opcional `round = Math.round` y usarlo donde hoy se llama a `Math.round`.

**Qué haces:** cambia la firma a `export function calcOrderAmounts(items: PricedItem[], ev: EventPricing, round: (n: number) => number = Math.round): OrderAmounts {` y deja que las sugerencias de siguiente edición propongan el resto.

**Pistas:** solo hay una llamada a `Math.round` en el fichero. Mira también si Copilot propone cambiar las llamadas a `calcOrderAmounts` en otros ficheros (no debería: las sugerencias trabajan en el fichero abierto).

**Lo que buscas:** `c = round(c);` en lugar de `c = Math.round(c);` y los tests en verde.

<details>
<summary>Ver solución</summary>

La sugerencia esperada es una sola: la línea `c = Math.round(c);` pasa a `c = round(c);`.

```bash
grep -n "round" teatralia/services/api/src/orders/pricing.ts
cd teatralia && npx vitest run services/api; cd ..
```

```text
29:export function calcOrderAmounts(items: PricedItem[], ev: EventPricing, round: (n: number) => number = Math.round): OrderAmounts {
45:    c = round(c);
      Tests  8 passed (8)
```

Las llamadas desde `services/api/src/orders/service.ts` y `seed.ts` no cambian porque el parámetro es opcional. **La regla:** las sugerencias de siguiente edición propagan un cambio dentro del fichero; para propagarlo por el repositorio hace falta el chat (modo Edit o Agent) o <kbd>F2</kbd>.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| No aparece ninguna flecha en el margen | Ajuste desactivado | Paso 1: activa **Next Edit Suggestions** |
| <kbd>Tab</kbd> inserta un tabulador | No había sugerencia activa | Haz una edición pequeña y espera a ver la flecha |
| Los tests fallan tras aceptar | Se aceptó un cambio en una clave del objeto (`subtotal_cents`) | `git diff` y deshaz esa línea |
| <kbd>F2</kbd> no hace nada | El cursor no está sobre un símbolo | Haz clic dentro del nombre de la variable |

## Conclusiones

### Qué son las sugerencias de siguiente edición

Propuestas de Copilot para el **siguiente** cambio del fichero, deducidas del cambio que acabas de hacer.

### Cómo deben usarse

| Requisito | En el lab |
|-----------|-----------|
| Cada salto se lee antes de aceptarlo | <kbd>Tab</kbd> para ir, <kbd>Tab</kbd> para aceptar, <kbd>Esc</kbd> para rechazar |
| Para renombrados puros, la herramienta del lenguaje | <kbd>F2</kbd> en `fees` |
| Los tests confirman que no ha cambiado el comportamiento | `8 passed` antes y después |

### Dónde se rompen y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Propagar a algo que se parece pero no es | La clave `subtotal_cents` junto a la variable | La API devuelve un campo con otro nombre |
| No salir del fichero | El parámetro nuevo no se propaga a `service.ts` | Cambios a medias si el parámetro fuera obligatorio |

### Cómo se perfecciona

Combinando herramientas: <kbd>F2</kbd> para símbolos, sugerencias de siguiente edición para patrones dentro del fichero y el chat para cambios que cruzan ficheros. Y con tests antes de empezar.

### En una frase

> 🔑 Las sugerencias de siguiente edición repiten tu patrón: úsalas para lo parecido y deja lo idéntico a <kbd>F2</kbd>.
