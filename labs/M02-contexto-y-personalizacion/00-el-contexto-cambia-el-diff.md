# Demo: el contexto cambia el diff

[← Página anterior](README.md) · [Siguiente página →](01-lab-instrucciones-del-repositorio.md)

Cuando Copilot genera código que no encaja, lo primero que se suele hacer es reescribir el prompt. Esta demostración
enseña que muchas veces el prompt está bien y lo que falta es una regla del negocio que Copilot no puede adivinar.
En Teatralia todos los importes son **enteros en céntimos** (`total_cents`, `price_cents`), y eso no lo dice ningún
prompt. Se pide dos veces lo mismo, una función de **pago dividido** (varios amigos pagan a partes iguales un pedido),
y entre una petición y otra solo cambia una cosa: el repositorio pasa a tener un fichero de instrucciones con esa regla.

## Punto de partida

- Codespace del curso con la terminal en la raíz del repositorio y Teatralia en su estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- Sin ficheros de instrucciones para Copilot. Lo comprueba este comando:

```bash
# ¿Existe ya un fichero de instrucciones del repositorio?
ls .github/copilot-instructions.md
```

```text
ls: no se puede acceder a '.github/copilot-instructions.md': No existe el archivo o directorio
```

- Vista **Chat** de Copilot abierta (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd>), modo **Edit** en el selector de modo bajo la caja de texto.
- El pedido de referencia `PED-2026-0107` (Ana, dos butacas y un pase VIP de *Jazz en el Faro*) cuesta 13370 céntimos:

```bash
# Total del pedido de referencia, tal como está guardado
psql "$DATABASE_URL" -c "SELECT id, total_cents FROM orders WHERE id = 'PED-2026-0107'"
```

```text
      id       | total_cents 
---------------+-------------
 PED-2026-0107 |       13370
(1 row)
```

La petición, idéntica en los dos intentos:

```text
Crea teatralia/services/api/src/orders/reparto.ts con una función exportada repartirPedido
que reparta el total de un pedido a partes iguales entre varias personas (pago dividido).
Devuelve lo que paga cada una.
```

> [!NOTE]
> Lo que genera Copilot cambia con el modelo y con cada ejecución. Lo que se compara aquí no es el texto exacto, sino
> **qué unidad usa para el dinero y si las partes suman el total**. Eso se comprueba con una cuenta, no a ojo.

## Recorrido

### 1 — Sin contexto, Copilot usa euros con decimales

En una conversación nueva (botón **+** de la vista Chat), modo **Edit**, se pega la petición y se envía. Copilot
propone el fichero `reparto.ts` en un diff que se puede aceptar con **Keep** o descartar con **Undo**.

**Qué suele contener la respuesta:** una función con un parámetro `total: number` en euros, una división
`total / personas` y un redondeo a dos decimales (`toFixed(2)` o `Math.round(x * 100) / 100`). Nada en la petición
dice que el dinero va en céntimos, así que Copilot hace lo más común en ejemplos de JavaScript. Algunas veces
añade una validación de `personas > 0`; casi nunca reparte el céntimo que sobra.

**La comprobación:** con 133,70 € entre tres personas, ese patrón da 44,57 € a cada una. Esta es la cuenta que hace:

```bash
# El patrón «euros con dos decimales» aplicado a PED-2026-0107 entre tres
node -e 'const parte = Number((133.70 / 3).toFixed(2)); console.log(parte, "x 3 =", parte * 3)'
```

```text
44.57 x 3 = 133.71
```

**Cómo se lee:** entre los tres pagan 133,71 €, un céntimo más que el pedido. La pasarela cobraría de más o, si se
cuadra en el último pago, alguien paga una cantidad distinta sin que nadie lo haya decidido. El código no tiene un
fallo de programación: le falta una regla de Teatralia que no estaba en ningún sitio.

El diff se descarta con **Undo** y la conversación se cierra, para que el segundo intento no herede nada de esta.

### 2 — La regla, escrita en el repositorio

Se crea el fichero de instrucciones del repositorio con una sola regla, la de los importes. Copilot lo añade a
cada petición de chat de este workspace sin que nadie lo adjunte:

```bash
# Carpeta y fichero que Copilot lee en cada petición de chat del repositorio
mkdir -p .github
cat > .github/copilot-instructions.md <<'EOF'
# Teatralia

- Todos los importes son enteros en céntimos (`price_cents`, `total_cents`). Nunca euros con decimales ni `toFixed` para calcular.
- Al repartir o redondear un importe, la suma de las partes tiene que ser exactamente el total.
EOF
cat .github/copilot-instructions.md
```

```text
# Teatralia

- Todos los importes son enteros en céntimos (`price_cents`, `total_cents`). Nunca euros con decimales ni `toFixed` para calcular.
- Al repartir o redondear un importe, la suma de las partes tiene que ser exactamente el total.
```

Son dos líneas, en el lenguaje del código (`*_cents`), y se pueden comprobar: cualquiera que lea un diff sabe si
las cumple o no.

### 3 — El mismo prompt, otro diff

En una conversación **nueva**, modo **Edit**, se pega exactamente la misma petición.

**Qué suele contener la respuesta:** un parámetro en céntimos (`totalCents`), una división entera
(`Math.floor(totalCents / personas)`), el resto (`totalCents % personas`) repartido de céntimo en céntimo entre las
primeras partes y, a veces, una validación de que el total es un entero. Bajo la respuesta, la lista de
referencias usadas (**Used n references**, desplegable) incluye `.github/copilot-instructions.md`.

**La comprobación:** la implementación de referencia de este curso, con la misma idea, da esto para el pedido de Ana:

```bash
# Desde teatralia/: ejecuta la función generada con el total de PED-2026-0107
cd teatralia
npx tsx -e "
import { repartirPedido } from './services/api/src/orders/reparto.ts';
const partes = repartirPedido(13370, 3);
console.log(partes, 'suman', partes.reduce((a, b) => a + b, 0));
"
```

```text
[ 4457, 4457, 4456 ] suman 13370
```

**Cómo se lee:** dos personas pagan 44,57 € y una 44,56 €; la suma es el total exacto. Si la función generada se
llama de otra forma o devuelve otra estructura, el comando se adapta a ella: lo que importa es que las partes sean
enteros y sumen 13370.

<details>
<summary>Implementación de referencia (<code>services/api/src/orders/reparto.ts</code>)</summary>

```typescript
// Pago dividido: reparte el total de un pedido (en céntimos) entre varias personas.
// Las partes son enteras y suman exactamente el total: los céntimos que sobran van a las primeras.
export function repartirPedido(totalCents: number, personas: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error('el total debe ser un entero de céntimos');
  if (!Number.isInteger(personas) || personas < 1) throw new Error('hace falta al menos una persona');
  const base = Math.floor(totalCents / personas);
  const resto = totalCents % personas;
  return Array.from({ length: personas }, (_, i) => base + (i < resto ? 1 : 0));
}
```

</details>

### 4 — Dejar el repositorio como estaba

El fichero generado y el de instrucciones se retiran para que la demostración se pueda repetir desde cero:

```bash
# Desde la raíz del repositorio: quita reparto.ts (y cualquier cambio en teatralia/) y el fichero de instrucciones
cd ..
CONFIRM=1 make reset
rm .github/copilot-instructions.md
```

## Qué queda visto

| | Sin instrucciones | Con `.github/copilot-instructions.md` |
|---|---|---|
| Unidad del dinero | Euros con decimales | Céntimos enteros |
| 133,70 € entre tres | 44,57 × 3 = 133,71 | 4457 + 4457 + 4456 = 13370 |
| Referencias de la respuesta | Solo la petición | Incluyen `copilot-instructions.md` |
| Prompt | El mismo | El mismo |

El prompt no ha cambiado ni una palabra. Lo que ha cambiado es el repositorio: la regla viaja con él y llega a
cualquier conversación de cualquier persona del equipo. Y aun así, el resultado se ha comprobado con una cuenta,
porque una instrucción aumenta la probabilidad de acertar, no la garantiza.

Queda abierta la pregunta que trabaja el laboratorio: además de los céntimos, **¿qué otras reglas de Teatralia
tendría que saber Copilot siempre, y cómo se comprueba en un endpoint nuevo que las ha seguido?** Está en
[01 — Instrucciones del repositorio](01-lab-instrucciones-del-repositorio.md), que se puede hacer sin haber seguido
esta demostración.
