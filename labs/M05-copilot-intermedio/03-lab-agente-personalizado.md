# Laboratorio: un agente personalizado

[← Página anterior](02-lab-mcp-github.md) · [Siguiente página →](04-lab-elegir-modelo.md)

Operaciones revisa a mano los reembolsos que atención al cliente pone en duda: abre la política de devoluciones, busca el pedido, suma entradas y gastos y compara. Es siempre el mismo rol, con las mismas fuentes y sin tocar código. En este laboratorio lo conviertes en un **agente personalizado** de Copilot, «revisor de reembolsos»: unas instrucciones fijas y una lista corta de herramientas (leer el repo y consultar pedidos por MCP), sin poder editar ficheros ni ejecutar comandos. Lo pruebas con un reembolso real por aplazamiento.

### Objetivo

Comprender qué es un agente personalizado con rol y herramientas acotadas: cómo funciona, cómo debe ser, cómo se detectan sus debilidades y cómo se mejora.

### Punto de partida

- Codespace de tu fork, terminal en la raíz del repo. Estado limpio:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- Servidor MCP `teatralia` listo para arrancar (dependencias instaladas):

```bash
# Dependencias del servidor MCP de Teatralia (si ya estaban, dice «up to date»)
npm --prefix teatralia/tools/mcp-teatralia install --no-audit --no-fund
```

- Fuentes que usará el agente: [`teatralia/docs/politica-devoluciones.md`](../../teatralia/docs/politica-devoluciones.md) y [`teatralia/services/api/src/orders/refunds.ts`](../../teatralia/services/api/src/orders/refunds.ts).
- Caso de prueba: pedido **`PED-2026-0833`** de *Comedia del arte* (`EV-CIERZO-0024`, Teatro Cierzo, evento aplazado), reembolsado por aplazamiento.

### Qué está pasando

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Una persona de Operaciones con un rol claro: revisar, no arreglar | Un agente con instrucciones fijas en `.github/agents/revisor-reembolsos.agent.md` |
| Consulta la política y el pedido en el backoffice | Herramientas `read` y `search` del repo y `buscar_pedido` del servidor MCP |
| No tiene permiso para cambiar el código ni los datos | Su lista `tools` no incluye editar ficheros ni ejecutar comandos |
| Entrega un veredicto y, si hay fallo, describe el issue | El formato de respuesta va en las instrucciones del agente |

El modo **Agent** genérico tiene todas las herramientas marcadas y ninguna instrucción de rol. Un agente personalizado fija las dos cosas para todo el equipo, en un fichero versionado.

### 1 — Mira el reembolso en crudo

Antes de crear el agente, mira lo que tendrá que revisar. La política, apartado 2 (evento aplazado):

```bash
# Lo que dice la política para un evento aplazado
sed -n '/## 2. Evento aplazado/,/## 3/p' teatralia/docs/politica-devoluciones.md
```

```text
## 2. Evento aplazado

- Las entradas siguen siendo válidas para la nueva fecha.
- Si el comprador no puede ir, puede pedir la devolución hasta 48 h antes de la nueva fecha.
- Se devuelve el **precio de las entradas**. Los **gastos de gestión no se devuelven**: el servicio de venta ya se prestó.

## 3. Petición del cliente (evento que se celebra)
```

Y el reembolso registrado, con el precio y los gastos de sus entradas:

```bash
# Reembolso de PED-2026-0833: importe devuelto frente a precio y gastos de las entradas
psql "$DATABASE_URL" -c "
SELECT r.id, r.reason, r.amount_cents,
       sum(t.price_cents) AS precio_cents,
       sum(t.fee_cents)   AS gastos_cents
  FROM refunds r
  JOIN tickets t ON t.id = ANY (r.ticket_ids)
 WHERE r.order_id = 'PED-2026-0833'
 GROUP BY r.id;"
```

```text
         id         |    reason    | amount_cents | precio_cents | gastos_cents 
--------------------+--------------+--------------+--------------+--------------
 RE-PED-2026-0833-1 | aplazamiento |         8695 |         8375 |          320
(1 row)
```

Cómo se lee: se devolvieron 86,95 €; la política manda devolver solo el precio, 83,75 €. Sobran los 3,20 € de gastos. Esto es lo que el agente tiene que encontrar solo.

### 2 — Crea el fichero del agente

Un agente personalizado es un fichero Markdown con una cabecera YAML (`description`, `tools`) y, debajo, sus instrucciones. Créalo:

1. En el chat, abre el selector de agente (el desplegable de modo, bajo la caja de texto) y elige **Configure Custom Agents…** → **Create new custom agent** → **`.github/agents`**, con el nombre `revisor-reembolsos`. O crea a mano el fichero `.github/agents/revisor-reembolsos.agent.md` en la raíz del repo.
2. Sustituye su contenido por este y guarda:

```markdown
---
description: Revisa reembolsos de Teatralia contra la política de devoluciones. Solo lee; no cambia código ni datos.
tools: ['read', 'search', 'teatralia/buscar_pedido', 'teatralia/incidencias_abiertas']
---
Eres el revisor de reembolsos de Teatralia. Tu trabajo es decir si un reembolso cumple la política.

Fuente de verdad: `teatralia/docs/politica-devoluciones.md`. Código que la implementa:
`teatralia/services/api/src/orders/refunds.ts` (`calcRefund`).

Para cada pedido que te pidan revisar:
1. Consulta el pedido con la herramienta `buscar_pedido` (entradas, gastos, reembolsos registrados).
2. Calcula en céntimos lo que manda la política para su motivo, citando el apartado.
3. Compara con lo registrado y con lo que calcularía `calcRefund`, citando la línea.
4. Termina con un veredicto: CORRECTO o INCORRECTO, y la diferencia en euros.

No propongas cambios de código ni ejecutes nada: si hay un fallo, describe el issue que habría que abrir.
```

**Resultado esperado:** al abrir el selector de agente aparece **revisor-reembolsos**, con su descripción.

> [!NOTE]
> Hasta 2025, VS Code llamaba a esto **modos de chat personalizados** y los guardaba en `.github/chatmodes/*.chatmode.md`, con la misma cabecera. Las versiones actuales usan **agentes personalizados** en `.github/agents/*.agent.md` y siguen leyendo los ficheros antiguos. Los nombres de las herramientas de la lista `tools` también han cambiado entre versiones: si el editor subraya alguno, pulsa **Configure Tools…** encima de la cabecera del fichero y elige las herramientas de la lista; VS Code escribe los nombres correctos.

### 3 — Arranca el servidor MCP que necesita

El agente usa `buscar_pedido`, que publica el servidor `teatralia` de [`.vscode/mcp.json`](../../.vscode/mcp.json).

1. Paleta de comandos (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) → **MCP: List Servers** → `teatralia` → **Start Server**.
2. En el chat, elige el agente **revisor-reembolsos** en el selector y pulsa **Configure Tools…**.

**Resultado esperado:** solo están marcadas las herramientas de la cabecera: lectura y búsqueda del repo, y `buscar_pedido` e `incidencias_abiertas` de `teatralia`. Las de editar ficheros y ejecutar en la terminal no.

### 4 — Pide la revisión

Conversación nueva (**+**), agente **revisor-reembolsos**:

```text
Revisa el reembolso del pedido PED-2026-0833.
```

Pulsa **Allow** cuando pida `buscar_pedido`.

**Qué debe contener la respuesta** (el texto varía; los hechos no):

- Una llamada a `buscar_pedido` con `PED-2026-0833` y la lectura de `politica-devoluciones.md` y `refunds.ts`.
- Motivo **aplazamiento**, apartado **2** de la política: se devuelve el precio de las entradas, **83,75 €**, sin los gastos.
- Registrado: **86,95 €**. Diferencia: **3,20 €** de más (los gastos de gestión de cuatro entradas).
- La causa en el código: en `calcRefund`, la rama `reason === 'cancelación' || reason === 'aplazamiento'` suma `t.price_cents + t.fee_cents`.
- Veredicto **INCORRECTO** y la descripción de un issue, sin proponer el parche aplicado.

### 5 — Comprueba el veredicto contra el código

El agente dice que `calcRefund` devuelve los gastos en un aplazamiento. Compruébalo ejecutando la función con las cuatro entradas del pedido (precio y gastos de la consulta del paso 1):

```bash
# calcRefund con las entradas reales de PED-2026-0833 y motivo aplazamiento
cd teatralia && npx tsx -e "
import { calcRefund } from './services/api/src/orders/refunds.ts';
const entradas = [
  { id: 'PED-2026-0833-1', price_cents: 2275, fee_cents: 80 },
  { id: 'PED-2026-0833-2', price_cents: 1550, fee_cents: 80 },
  { id: 'PED-2026-0833-3', price_cents: 2275, fee_cents: 80 },
  { id: 'PED-2026-0833-4', price_cents: 2275, fee_cents: 80 },
];
console.log('aplazamiento →', calcRefund(entradas, 'aplazamiento'));
"; cd ..
```

**Resultado esperado:**

```text
aplazamiento → 8695
```

Cómo se lee: el código calcula 8695 céntimos, lo mismo que se registró; la política pide 8375. El veredicto del agente es correcto y el fallo está en el código, no en el dato.

### 6 — Comprueba que no ha tocado nada

El rol era revisar. Pídele lo que no debe hacer:

```text
Pues arréglalo: cambia calcRefund para que cumpla la política.
```

**Qué debe pasar:** el agente no tiene herramienta de edición; responde que no puede cambiar ficheros y, como mucho, describe el cambio o el issue. Compruébalo:

```bash
# Cambios en el código de Teatralia: no debe salir nada
git status --short teatralia
```

**Resultado esperado:** ninguna línea.

## Comprueba tu entendimiento

**Las herramientas las fija el fichero**
Abre **Configure Tools…** con el agente **revisor-reembolsos** y con el modo **Agent**.
→ El agente tiene cuatro herramientas; el modo Agent, todas las que tengas instaladas.

**Las instrucciones viajan con el repo**
Ejecuta `git status --short -uall .github/agents`.
→ Sale `?? .github/agents/revisor-reembolsos.agent.md`: un fichero nuevo que se puede versionar y revisar en un PR.

**El veredicto se comprueba**
Repite el paso 5 con el motivo `cancelación`.
→ También 8695: en una cancelación la política sí devuelve los gastos, así que ahí el código cumple.

## Experimenta

**Quita el MCP.** Antes de probarlo, predice qué hará el agente si no puede consultar el pedido. Borra `'teatralia/buscar_pedido'` de la lista `tools`, guarda y pide de nuevo la revisión de `PED-2026-0833` en una conversación nueva.

**Qué debe pasar:** sin datos del pedido, el agente solo puede razonar sobre la política y el código. Lo correcto es que diga que no puede comprobar el importe; si da cifras del pedido, se las está inventando. Vuelve a dejar la herramienta.

**Añade la edición.** Predice qué cambia si añades `'edit'` a `tools` y repites el paso 6. El agente ya puede cambiar `refunds.ts`, y el rol de revisor deja de existir: el que revisa y el que arregla son el mismo. Vuelve a quitarla y descarta cualquier cambio con `git checkout -- teatralia`.

## Mejora

Haz que el agente diga de dónde saca cada cifra. Añade al final de sus instrucciones:

```markdown
Cada importe que des lleva su fuente entre paréntesis: (buscar_pedido), (política §N) o
(refunds.ts, línea N). Si no tienes fuente para un importe, no lo des.
```

Repite el paso 4 en una conversación nueva. **Resultado esperado:** 83,75 € con «(política §2)», 86,95 € con «(buscar_pedido)» y la línea de `calcRefund` citada. Si alguna cifra queda sin fuente, la regla está mal escrita o el modelo la ignora: las dos cosas se ven al leerlo.

## Reto

### 1 — Todos los reembolsos por aplazamiento

**La situación:** Finanzas quiere saber cuánto se ha devuelto de más por aplazamientos en total. Hay 14 reembolsos con ese motivo. El revisor solo sabe consultar un pedido cada vez y no puede ejecutar comandos.

**Qué haces:** obtén con `psql` la lista de pedidos reembolsados por aplazamiento, pásasela al agente **revisor-reembolsos** y pídele un veredicto por pedido y la suma de lo devuelto de más. Después contrasta su total con una consulta.

```bash
# Pedidos con un reembolso por aplazamiento, en una línea
psql "$DATABASE_URL" -At -c "SELECT string_agg(order_id, ' ' ORDER BY order_id) FROM refunds WHERE reason = 'aplazamiento';"
```

**Pistas:** pide la respuesta en tabla (pedido, devuelto, según política, diferencia) y el total al final. Para contrastar, la diferencia de cada reembolso es `amount_cents` menos el precio de sus entradas (`tickets.id = ANY (r.ticket_ids)`).

**Lo que buscas:** 14 pedidos INCORRECTO y un total de **25,40 €** devueltos de más, igual en el chat y en `psql`.

<details>
<summary>Ver solución</summary>

La lista de pedidos:

```text
PED-2026-0833 PED-2026-0896 PED-2026-1022 PED-2026-1335 PED-2026-1439 PED-2026-1628 PED-2026-1770 PED-2026-1815 PED-2026-2161 PED-2026-2171 PED-2026-2204 PED-2026-2212 PED-2026-2277 PED-2026-2387
```

El prompt al agente:

```text
Revisa los reembolsos de estos pedidos: <pega la lista>.
Devuélveme una tabla: pedido, devuelto (€), según la política (€), diferencia (€), veredicto.
Al final, la suma de las diferencias.
```

El agente hace 14 llamadas a `buscar_pedido` (14 **Allow**, o **Allow in this Session** en la primera). La comprobación:

```bash
# Devuelto de más por aplazamiento: importe menos precio de las entradas devueltas
psql "$DATABASE_URL" -c "SELECT count(*) AS reembolsos, sum(r.amount_cents - p.precio) AS de_mas_cents
  FROM refunds r CROSS JOIN LATERAL (SELECT sum(price_cents) AS precio FROM tickets WHERE id = ANY (r.ticket_ids)) p
 WHERE r.reason = 'aplazamiento';"
```

```text
 reembolsos | de_mas_cents 
------------+--------------
         14 |         2540
(1 row)
```

Cómo se lee: 2540 céntimos, 25,40 €. Si la suma del chat no coincide, lo habitual es un error de suma del modelo en una tabla larga, no del dato: por eso la comprobación es una consulta. En un caso real, el issue del fallo llevaría este total y la lista. **La regla:** un agente acotado es bueno revisando caso a caso; los agregados se calculan con una herramienta determinista y el agente los explica.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| El agente no aparece en el selector | Fichero fuera de `.github/agents/` o sin la extensión `.agent.md` | Ruta exacta: `.github/agents/revisor-reembolsos.agent.md` en la raíz del repo |
| Un nombre de `tools` subrayado o ignorado | Los nombres de herramientas cambian entre versiones de VS Code | **Configure Tools…** encima de la cabecera del fichero y elige de la lista |
| `buscar_pedido` no está disponible | El servidor `teatralia` no está arrancado | **MCP: List Servers** → `teatralia` → **Start Server** |
| El agente da importes sin llamar a `buscar_pedido` | Ha respondido de memoria o ha leído el seed | Pide «usa buscar_pedido» y aplica la mejora de citar fuentes |
| `Cannot find module './services/api/src/orders/refunds.ts'` en el paso 5 | El comando se lanzó fuera de `teatralia/` | Ejecuta el bloque tal cual: empieza con `cd teatralia` |

## Conclusiones

### Qué es un agente personalizado

Un fichero del repo que fija **para qué** sirve una conversación (instrucciones) y **con qué** puede trabajar (herramientas). En este lab, el revisor leyó la política y el pedido, encontró los 3,20 € devueltos de más en `PED-2026-0833` y no pudo tocar `refunds.ts`.

### Cómo debe ser

| Requisito | En el revisor de reembolsos |
|-----------|-----------------------------|
| Un rol, no un asistente general | «Decir si un reembolso cumple la política» |
| Fuentes nombradas | `politica-devoluciones.md`, `refunds.ts`, `buscar_pedido` |
| Herramientas mínimas | Leer, buscar y dos herramientas MCP; sin editar ni terminal |
| Salida comprobable | Veredicto, importes en céntimos y su fuente |
| Versionado | `.github/agents/`, revisado en un PR como el código |

### Dónde se rompe y cómo lo has detectado

- **Sin datos, inventa:** al quitar `buscar_pedido`, el agente se queda sin el importe real; cualquier cifra del pedido sería inventada.
- **Con edición, deja de revisar:** añadir `edit` convierte al revisor en quien arregla.
- **Agregados largos:** sumar 14 diferencias en una tabla es donde más falla; la consulta da 25,40 € sin discusión.
- **Nombres de herramientas inestables:** la lista `tools` depende de la versión de VS Code; un nombre mal escrito se ignora sin avisar mucho.

### Cómo se perfecciona

En un equipo: un agente por rol (revisor, redactor de issues, planificador), cada uno con su lista de herramientas; las reglas de citar fuentes en las instrucciones; y los agregados en herramientas MCP (como `reembolsos_por_motivo`) en lugar de pedirle al modelo que sume.

### En una frase

> 🔑 Un agente personalizado es un rol escrito: instrucciones que dicen qué decidir y una lista de herramientas que dice qué no puede hacer.
