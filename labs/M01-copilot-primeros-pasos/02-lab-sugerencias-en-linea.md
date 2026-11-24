# Laboratorio: sugerencias en línea desde un comentario

[← Página anterior](01-lab-entorno-y-primer-chat.md) · [Siguiente página →](03-lab-siguiente-edicion.md)

Finanzas liquida con cada promotor a partir de una hoja de cálculo, y necesita los importes de Teatralia como texto: `133,70`, sin símbolo de euro ni separador de miles. En este lab escribes esa función de formato con la **sugerencia en línea** de Copilot, guiándola solo con un comentario y la firma, y ves cómo cambia lo que propone según lo que digas en el comentario.

### Objetivo

Comprender cómo el comentario y la firma guían la sugerencia en línea: qué lee Copilot para proponer, cómo se acepta o se rechaza, cómo se detecta una sugerencia que no cumple y cómo se mejora el comentario para que acierte.

### Punto de partida

- Codespace del curso con Copilot activo (icono de la barra de estado sin tachar).
- Teatralia en el estado inicial:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- No hace falta `make up`: este lab solo usa el editor y los tests.

### Qué está pasando

En Teatralia todos los importes son enteros en **céntimos** (`total_cents: 13370`). Para la tienda ya existe `formatEuros` en `teatralia/packages/ui/src/format.ts`, que devuelve `133,70 €` con símbolo y separador de miles. Finanzas necesita otra cosa: texto plano para CSV. Si alguien usa `formatEuros` para exportar, la hoja recibe `10.422,50 €` y no puede sumar.

La sugerencia en línea no sabe nada de esto. Solo ve el fichero abierto y lo que tienes escrito encima del cursor. **El comentario que escribes antes de la firma es el contrato**: lo que no diga, Copilot lo rellena con lo más habitual.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Exportar importes para una hoja de cálculo | Función `centsToCsv` en `format.ts` |
| La especificación de la función | El comentario encima de la firma |
| Revisar lo que entrega un compañero | Aceptar, rechazar o pedir otra sugerencia |

### 1 — Mira la función que ya existe

Antes de escribir nada, ves en crudo lo que hay y por qué no sirve para CSV.

1. Pulsa <kbd>Ctrl</kbd>+<kbd>P</kbd>, escribe `ui/src/format.ts` y pulsa <kbd>Enter</kbd>.
2. Lee `formatEuros`.

```bash
# Lo que devuelve formatEuros para un importe de más de mil euros
node -e "console.log((1042250/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'}))"
```

**Resultado esperado:**

```text
10.422,50 €
```

**Cómo se lee:** punto de miles y símbolo. Correcto para la tienda, inútil para una columna numérica de una hoja.

### 2 — Escribe solo la firma, sin comentario

Así ves qué propone Copilot cuando no le das contrato.

1. Al final de `format.ts`, deja una línea en blanco.
2. Escribe esta línea y pulsa <kbd>Enter</kbd>:

```ts
export function centsToCsv(cents: number): string {
```

3. Espera a que aparezca el texto gris. **No lo aceptes**: pulsa <kbd>Alt</kbd>+<kbd>]</kbd> para ver otras alternativas.

**Qué debe aparecer** (varía en cada ejecución): casi siempre una línea con `(cents / 100).toFixed(2)`, a veces con `.replace('.', ',')`. Ninguna alternativa sabe si quieres signo, separador de miles o coma decimal: lo deduce del nombre `Csv` y de `formatEuros`, que está justo encima.

4. Pulsa <kbd>Esc</kbd> para descartar y borra la línea.

### 3 — Escribe el comentario-contrato y la firma

Ahora el comentario dice todo lo que importa, con ejemplos concretos.

```ts
// Convierte céntimos a texto con dos decimales y coma decimal, sin símbolo ni separador de miles,
// para exportar a CSV. Negativos con signo menos. Ej.: 13370 → "133,70"; -5 → "-0,05"; 0 → "0,00"
export function centsToCsv(cents: number): string {
```

1. Escribe las tres líneas al final de `format.ts` y pulsa <kbd>Enter</kbd> tras la firma.
2. Mira la sugerencia gris completa antes de aceptar. Si te parece correcta, pulsa <kbd>Tab</kbd>.

**Qué debe contener una sugerencia correcta:** tratar el signo aparte, trabajar con enteros (`Math.abs`, división entera y resto entre 100) y rellenar con un cero los céntimos menores de 10. Una sugerencia con `(cents / 100).toFixed(2).replace('.', ',')` parece correcta y lo es para casi todo, pero conviene comprobarla con los ejemplos del contrato.

### 4 — Comprueba la sugerencia con un test

La sugerencia no se da por buena hasta que pasan los ejemplos del contrato.

1. Crea el fichero `teatralia/packages/ui/test/format.test.ts` con este contenido:

```ts
import { describe, expect, it } from 'vitest';
import { centsToCsv } from '../src/format.js';

describe('centsToCsv', () => {
  it('convierte los ejemplos del contrato', () => {
    expect(centsToCsv(13370)).toBe('133,70');
    expect(centsToCsv(-5)).toBe('-0,05');
    expect(centsToCsv(0)).toBe('0,00');
  });
  it('no pone separador de miles', () => {
    expect(centsToCsv(1042250)).toBe('10422,50');
  });
});
```

2. Ejecuta el test:

```bash
# Solo el test de formato
cd teatralia && npx vitest run packages/ui/test/format.test.ts; cd ..
```

**Resultado esperado** con una implementación correcta (última parte):

```text
      Tests  2 passed (2)
```

Con una sugerencia incorrecta verás qué ejemplo no cumple. Por ejemplo, la versión que divide con `Math.floor` y el resto `%` sin tratar el signo da:

```text
AssertionError: expected '-1,-5' to be '-0,05' // Object.is equality
      Tests  1 failed | 1 passed (2)
```

**Cómo se lee:** si falla `-0,05`, la sugerencia trató mal el signo (en JavaScript, `Math.floor(-0.05)` es `-1` y `-5 % 100` es `-5`); si falla `10422,50`, usó `toLocaleString`. En los dos casos el comentario lo decía y Copilot no lo cumplió: por eso el test va escrito a partir del contrato, no de la sugerencia.

<details>
<summary>Implementación de referencia</summary>

```ts
// Convierte céntimos a texto con dos decimales y coma decimal, sin símbolo ni separador de miles,
// para exportar a CSV. Negativos con signo menos. Ej.: 13370 → "133,70"; -5 → "-0,05"; 0 → "0,00"
export function centsToCsv(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
```

</details>

## Comprueba tu entendimiento

**Aceptar a medias**
Escribe de nuevo la firma de una función parecida y, cuando aparezca la sugerencia, pulsa <kbd>Ctrl</kbd>+<kbd>→</kbd> varias veces.
→ Se acepta palabra a palabra, no la sugerencia entera. Sirve para quedarte con el principio y escribir tú el final.

**Copilot lee lo que está cerca**
Con el cursor dentro de `centsToCsv`, abre el chat en línea con <kbd>Ctrl</kbd>+<kbd>I</kbd> y escribe `¿qué ficheros has tenido en cuenta?`.
→ La respuesta menciona `format.ts` y como mucho ficheros abiertos en otras pestañas. No ha leído el resto del repositorio.

## Experimenta

Predice antes de probar: si quitas del comentario la parte «Negativos con signo menos. Ej.: … -5 → "-0,05"», ¿la sugerencia seguirá tratando bien los negativos?

1. Borra el cuerpo de `centsToCsv` y esa parte del comentario.
2. Pulsa <kbd>Enter</kbd> tras la firma y acepta la sugerencia.
3. Ejecuta el test del paso 4.

Si la sugerencia es la versión simple con `Math.floor` y `%`, el caso `-5` falla con `expected '-1,-5' to be '-0,05'`: sin el ejemplo en el comentario, nada le pide tratar el signo aparte. Si pasa, prueba otras alternativas con <kbd>Alt</kbd>+<kbd>]</kbd> y mira cuántas lo tratan. Vuelve a poner el comentario completo.

## Mejora

Finanzas pide además separar con punto y coma en lugar de coma en las hojas españolas. Añade al final de `format.ts` una segunda función `csvRow(values: (string | number)[]): string` solo con un comentario-contrato que lo diga (separador `;`, números con `centsToCsv`, textos entre comillas dobles si contienen `;`) y deja que Copilot proponga el cuerpo. Escribe antes los tres `expect` del contrato en `format.test.ts` y ejecuta el test.

## Reto

### 1 — El comentario que hace fallar a Copilot

**La situación:** un compañero dice que «con un buen nombre de función no hace falta comentario». Propone `formatAmountForExportSpanishSpreadsheet` como nombre y nada más.

**Qué haces:** borra `centsToCsv` y su comentario, escribe solo `export function formatAmountForExportSpanishSpreadsheet(cents: number): string {` y acepta la sugerencia. Cambia el import del test a ese nombre y ejecútalo.

**Pistas:** mira si la sugerencia usa `toLocaleString`. Un nombre largo da intención, no casos límite.

**Lo que buscas:** saber qué ejemplos del contrato cumple la sugerencia sin comentario.

<details>
<summary>Ver solución</summary>

Lo habitual es que el nombre lleve a Copilot a usar `toLocaleString('es-ES', …)`, porque «Spanish» se asocia a formato local. El test falla en el caso sin separador de miles:

```bash
cd teatralia && npx vitest run packages/ui/test/format.test.ts; cd ..
```

```text
AssertionError: expected '10.422,50' to be '10422,50' // Object.is equality
      Tests  1 failed | 1 passed (2)
```

(La línea exacta depende de la sugerencia que hayas aceptado; si pasó, prueba otra alternativa con <kbd>Alt</kbd>+<kbd>]</kbd>.)

**La regla:** el nombre dice la intención; los **ejemplos del comentario** dicen los casos límite. La sugerencia en línea cumple los ejemplos que le das y adivina el resto.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| No aparece texto gris | Copilot inactivo o cupo agotado | Mira el icono de Copilot de la barra de estado; pulsa sobre él para ver el estado |
| La sugerencia completa solo una línea | Pulsaste <kbd>Enter</kbd> en mitad del comentario | Pon el cursor al final de la firma y pulsa <kbd>Enter</kbd> |
| `Cannot find module '../src/format.js'` | El test no está en `packages/ui/test/` | Mueve el fichero a esa carpeta |
| El test pasa pero la tienda muestra importes raros | Cambiaste `formatEuros` en vez de añadir una función | `git diff teatralia/packages/ui/src/format.ts` y deshaz el cambio en `formatEuros` |

## Conclusiones

### Qué es guiar la sugerencia en línea

Darle a Copilot, encima del cursor, la especificación de lo que quieres: el comentario y la firma son todo lo que tiene en cuenta.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| El comentario dice formato, casos límite y ejemplos | `13370 → "133,70"; -5 → "-0,05"; 0 → "0,00"` |
| La firma fija tipos | `(cents: number): string` |
| La sugerencia se acepta tras verla entera | <kbd>Tab</kbd> solo después de leerla |
| Un test sale del contrato, no de la sugerencia | `format.test.ts` con los ejemplos del comentario |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Sin comentario, Copilot elige el formato | Alternativas con `toFixed` y `toLocaleString` | Importes que la hoja no puede sumar |
| Caso límite no escrito | El negativo falla al quitar el ejemplo | Un `-1,-5` en la liquidación |

### Cómo se perfecciona

Con convenciones del proyecto escritas una vez para todos (instrucciones del repositorio: «importes en céntimos, formato CSV con coma decimal») y con el test escrito antes de aceptar la sugerencia.

### En una frase

> 🔑 La sugerencia en línea cumple lo que dice el comentario: escribe en él los ejemplos de los casos límite.
