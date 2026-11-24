# Laboratorio: preguntar al código en modo Ask

[← Página anterior](03-lab-siguiente-edicion.md) · [Siguiente página →](05-lab-tres-formas-de-pedir.md)

Liquidaciones pregunta por qué la comisión de Teatralia del pedido `PED-2026-0107` es 9,82 € si el 7,5 % de 131,00 € es 9,825 €. En este lab usas el modo **Ask** de Copilot para entender el cálculo sin cambiar nada, y compruebas su explicación con los datos reales de la base de datos.

### Objetivo

Comprender cómo se usa Ask para entender código ajeno: qué le das, qué devuelve, cómo se verifica su explicación con datos y dónde se queda corta.

### Punto de partida

- Codespace del curso con Copilot activo.
- Teatralia con los datos de ejemplo:

```bash
# Descarta cambios en teatralia/ y recarga los datos de ejemplo
CONFIRM=1 make reset
```

- No hace falta `make up`: usas el chat y `psql`.

### Qué está pasando

Teatralia cobra a cada promotor una comisión de plataforma. El pedido de referencia del curso es el de Ana en *Jazz en el Faro*: dos butacas de platea (F-12 y F-13, 35,50 € cada una) y un pase VIP (60,00 €). La comisión está en la base de datos, pero la regla que la produce está en el código, y nadie del equipo actual la escribió.

El modo **Ask** responde preguntas sobre el código sin tocar ficheros. Es el modo para entender antes de cambiar. Lo que no puede es ver la base de datos: la explicación la da Copilot; los números, `psql`.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Liquidaciones reclama una diferencia de céntimos | 9,82 € frente a 9,825 € en `PED-2026-0107` |
| Leer el código heredado | Ask sobre `services/api/src/orders/pricing.ts` |
| Comprobar en los datos | Consultas a `orders` y `tickets` |

### 1 — Mira el dato en la base de datos

Primero la fuente: qué comisión tiene guardada el pedido.

```bash
# Importes y comisión del pedido de Ana
psql "$DATABASE_URL" -c "SELECT id, subtotal_cents, commission_cents, round(subtotal_cents * 0.075) AS sobre_el_total FROM orders WHERE id = 'PED-2026-0107';"
```

**Resultado esperado:**

```text
      id       | subtotal_cents | commission_cents | sobre_el_total 
---------------+----------------+------------------+----------------
 PED-2026-0107 |          13100 |              982 |            983
(1 row)
```

**Cómo se lee:** la comisión guardada es 982 céntimos. Si se calculara sobre el subtotal y se redondeara, serían 983. Hay un céntimo de diferencia y no sabes todavía por qué.

### 2 — Pregunta a Copilot en modo Ask

Le das el fichero y una pregunta concreta con los números reales.

1. En la vista **Chat**, pulsa **+** y elige el modo **Ask**.
2. Escribe esta pregunta (`#file:` adjunta el fichero; al escribir `#file` te ofrece la lista):

```text
#file:teatralia/services/api/src/orders/pricing.ts
Un pedido tiene dos entradas de 3550 céntimos y una de 6000, con commission_bps 750.
¿Qué comisión calcula calcOrderAmounts y por qué no es el 7,5 % del subtotal redondeado?
Cita las líneas del código que lo explican.
```

**Qué debe contener la respuesta** (el texto varía): que la comisión se calcula **por entrada** (`(p * ev.commission_bps) / 10000`) y se redondea **en cada entrada** con `Math.round` antes de sumar; que 3550 × 750 / 10000 = 266,25 → 266 dos veces, y 6000 → 450; total 982. Debe citar el comentario «redondeo por entrada (lo pide liquidaciones)».

### 3 — Comprueba la explicación entrada a entrada

La explicación de Copilot dice algo comprobable: el redondeo ocurre en cada entrada. Lo miras en los datos.

```bash
# Comisión exacta y comisión guardada de cada entrada del pedido
psql "$DATABASE_URL" -c "SELECT id, price_cents, round(price_cents * 750 / 10000.0, 2) AS exacta, commission_cents FROM tickets WHERE order_id = 'PED-2026-0107' ORDER BY id;"
```

**Resultado esperado:**

```text
       id        | price_cents | exacta | commission_cents 
-----------------+-------------+--------+------------------
 PED-2026-0107-1 |        3550 | 266.25 |              266
 PED-2026-0107-2 |        3550 | 266.25 |              266
 PED-2026-0107-3 |        6000 | 450.00 |              450
(3 rows)
```

**Cómo se lee:** cada butaca pierde 0,25 céntimos al redondear; dos butacas, medio céntimo; y el total redondeado de una vez habría subido a 983. La explicación de Copilot es correcta y ahora lo sabes por los datos, no porque lo haya dicho.

### 4 — Pregunta lo que el código no dice

Ask explica lo que está escrito. Lo que no está escrito, lo inventa o lo reconoce.

```text
¿Por qué Liquidaciones pidió redondear por entrada y no sobre el total?
```

**Qué debe contener la respuesta:** una buena respuesta dice que el código solo deja el comentario «lo pide liquidaciones» y que el motivo no está en el repositorio. Una respuesta que da un motivo concreto («porque las facturas se emiten por entrada…») está **suponiendo**: pregúntale «¿en qué fichero lo has visto?».

## Comprueba tu entendimiento

**Ask no toca ficheros**
Tras la conversación, ejecuta `git status --short teatralia`.
→ No aparece nada: Ask no ha cambiado ningún fichero.

**Lo que Ask no ve**
Pregunta en el mismo chat: `¿Cuántos pedidos pagados tiene la Sala Faro?`
→ Copilot no puede saberlo (no ve la base de datos). Una buena respuesta te da la consulta SQL para averiguarlo; una mala, un número.

## Investiga

¿Cuánto supone el redondeo por entrada en toda la plataforma? Primero pide a Copilot (Ask) la consulta, y después ejecútala tú. Una consulta que lo responde:

```bash
# Comisión por entrada (la que se guarda) frente a la calculada sobre el total, por promotor
psql "$DATABASE_URL" -c "SELECT e.tenant_id, sum(o.commission_cents) AS por_entrada, sum(round(o.subtotal_cents*0.075))::int AS sobre_total, sum(round(o.subtotal_cents*0.075))::int - sum(o.commission_cents) AS diferencia FROM orders o JOIN events e ON e.id=o.event_id WHERE o.status IN ('paid','partially_refunded') GROUP BY 1 ORDER BY 4 DESC;"
```

```text
  tenant_id  | por_entrada | sobre_total | diferencia 
-------------+-------------+-------------+------------
 TN-FARO     |      208352 |      208510 |        158
 TN-OLIVO    |      256119 |      256119 |          0
 TN-LUMEN    |      115769 |      115736 |        -33
 TN-CIERZO   |       68370 |       68318 |        -52
 TN-MAREA    |      182860 |      182734 |       -126
 TN-ALBORADA |      760678 |      759860 |       -818
(6 rows)
```

¿Por qué en la Sala Faro el redondeo por entrada cobra **menos** y en el Festival Alborada **más**? Pista: mira los precios de cada uno (`seed-data.ts`) y piensa en qué queda la parte decimal de `precio × 0,075`.

## Experimenta

Predice antes de preguntar: si en vez de adjuntar `pricing.ts` haces la misma pregunta del paso 2 **sin** `#file:`, ¿encontrará Copilot el fichero?

Abre un chat nuevo (**+**), modo **Ask**, y pega la pregunta del paso 2 sin la primera línea. Mira las referencias que cita debajo de la respuesta. Lo habitual es que busque en el repositorio y lo encuentre, pero tarda más y a veces explica la comisión de memoria («normalmente se calcula sobre el total…») sin citar `pricing.ts`. Cuando sabes qué fichero es, adjúntalo.

## Reto

### 1 — El pedido donde más se nota

**La situación:** Liquidaciones quiere un ejemplo de pedido real en el que el redondeo por entrada se aleje más del cálculo sobre el total, para explicárselo a un promotor.

**Qué haces:** pide a Copilot (Ask) una consulta SQL que devuelva los cinco pedidos pagados con mayor diferencia absoluta entre `commission_cents` y `round(subtotal_cents * 0.075)`, y ejecútala con `psql "$DATABASE_URL"`.

**Pistas:** `abs(...)`, `ORDER BY ... DESC`, `LIMIT 5`. Las tablas y columnas están en `teatralia/services/api/migrations/001_init.sql`: adjúntalo para que no invente columnas.

**Lo que buscas:** una consulta que se ejecute sin error y cinco pedidos con su diferencia.

<details>
<summary>Ver solución</summary>

```bash
psql "$DATABASE_URL" -c "SELECT id, subtotal_cents, commission_cents, round(subtotal_cents * 0.075)::int AS sobre_total, abs(commission_cents - round(subtotal_cents * 0.075)::int) AS diferencia FROM orders WHERE status = 'paid' ORDER BY diferencia DESC, id LIMIT 5;"
```

```text
      id       | subtotal_cents | commission_cents | sobre_total | diferencia 
---------------+----------------+------------------+-------------+------------
 PED-2026-0004 |          23400 |             1758 |        1755 |          3
 PED-2026-0020 |          23400 |             1758 |        1755 |          3
 PED-2026-0021 |          23400 |             1758 |        1755 |          3
 PED-2026-0025 |          23400 |             1758 |        1755 |          3
 PED-2026-0034 |          23400 |             1758 |        1755 |          3
(5 rows)
```

La diferencia máxima es de 3 céntimos, en pedidos de 234,00 € del Festival Alborada (seis entradas de 39,00 €: cada una tiene una comisión exacta de 292,5 céntimos que se redondea hacia arriba). Cada entrada aporta su propio redondeo, por eso se nota más en pedidos con muchas entradas. Si Copilot usó una columna que no existe (`commission` o `amount`), la consulta falla con `column ... does not exist`: le faltaba el esquema.

**La regla:** para que Ask escriba SQL correcto, adjunta el esquema; para saber el resultado, ejecútalo tú.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `psql: command not found` | Estás en tu máquina, fuera del Codespace | Ejecuta el comando en la terminal del Codespace |
| `relation "orders" does not exist` | La base de datos está vacía | `make db-reset` |
| Copilot responde sin citar ficheros | La pregunta no pedía citas | Añade «cita las líneas del código» |
| La respuesta habla de otro proyecto | Copilot respondió de memoria | Adjunta el fichero con `#file:` |

## Conclusiones

### Qué es preguntar al código en modo Ask

Usar el chat para entender un fragmento ajeno sin cambiarlo: Copilot lee el código y explica; tú verificas con los datos.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| La pregunta lleva los números reales | 3550, 3550, 6000 y 750 bps |
| Se adjunta el fichero que se pregunta | `#file:…/pricing.ts` |
| Se piden las líneas que lo explican | «Cita las líneas del código» |
| Los números se comprueban fuera del chat | `psql` sobre `orders` y `tickets` |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Explicar un motivo que no está escrito | Pregunta «¿por qué lo pidió Liquidaciones?» | Una decisión de negocio inventada |
| Responder sobre datos que no ve | «¿Cuántos pedidos tiene la Sala Faro?» | Un número sin fuente |

### Cómo se perfecciona

Dando a Copilot acceso de solo lectura a los datos (un servidor MCP sobre la base de datos, en el último módulo) y dejando por escrito las reglas de negocio que hoy solo están en un comentario.

### En una frase

> 🔑 Ask explica el código que le das; los números los confirma la base de datos.
