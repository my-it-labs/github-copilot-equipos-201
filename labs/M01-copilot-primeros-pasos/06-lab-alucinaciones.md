# Laboratorio: alucinaciones y sobreconfianza

[← Página anterior](05-lab-tres-formas-de-pedir.md) · [Siguiente página →](07-lab-confidencialidad-y-exclusiones.md)

Atención al cliente de Teatralia recibe dos preguntas cada semana: «¿cómo cancelo mi pedido desde la tienda?» y «¿cuántas entradas puedo comprar al mes?». Nadie del equipo lo sabe de memoria y alguien propone preguntárselo a Copilot. En este lab haces esas preguntas, detectas cuándo la respuesta está inventada y obligas a Copilot a responder solo con lo que puede citar.

### Objetivo

Comprender qué es una alucinación y qué es la sobreconfianza: por qué un asistente afirma cosas que no están en el código, cómo se detectan con una comprobación rápida y cómo se reduce el riesgo con la forma de preguntar.

### Punto de partida

- Codespace del curso con Copilot activo y Teatralia en marcha:

```bash
# Estado inicial y plataforma arrancada (deja esta terminal abierta)
CONFIRM=1 make reset
make up
```

### Qué está pasando

Copilot genera la respuesta más probable para tu pregunta. Si la pregunta da por hecho algo («¿cómo cancelo…?»), lo más probable es una respuesta que lo confirme, aunque el código no lo tenga: un endpoint con nombre razonable, una regla con un número redondo. Es una **alucinación**. La **sobreconfianza** es el otro lado: la respuesta inventada suena exactamente igual de segura que la correcta.

En Teatralia, la API pública tiene estas rutas y ninguna más:

```bash
# Rutas de la API pública, directamente del código
grep -n "'/api/public" teatralia/services/api/src/routes/public.ts
```

```text
15:  app.get('/api/public/tenants', async () => {
24:  app.get('/api/public/site', async (req) => {
34:  app.get<{ Params: { id: string } }>('/api/public/events/:id', async (req) => {
57:  app.get<{ Params: { id: string } }>('/api/public/events/:id/seats', async (req) => {
75:    '/api/public/orders',
90:  app.post<{ Params: { id: string }; Body: { card: string } }>('/api/public/orders/:id/pay', async (req) => {
95:  app.get<{ Params: { id: string }; Querystring: { email?: string } }>('/api/public/orders/:id', async (req) => {
```

**Cómo se lee:** siete rutas. Ninguna cancela un pedido. Esa es la fuente contra la que vas a comprobar.

### 1 — Haz la pregunta que da algo por hecho

En la vista **Chat**, **+**, modo **Ask**, sin adjuntar nada:

```text
¿Cómo cancela un comprador su pedido desde la tienda de Teatralia? Dame el endpoint y el cuerpo de la petición.
```

**Qué vigilar en la respuesta:** si propone algo como `POST /api/public/orders/:id/cancel` o `DELETE /api/public/orders/:id`, mira las referencias bajo la respuesta: ¿cita una línea de `public.ts` donde exista? Lo habitual es que, sin contexto adjunto, proponga un endpoint plausible sin cita, o con una cita a un fichero que no lo contiene.

### 2 — Comprueba el endpoint contra la API

Una comprobación de segundos que no depende de lo que diga nadie.

```bash
# Llamada al endpoint que suele proponer Copilot
curl -s -X POST localhost:3000/api/public/orders/PED-2026-0107/cancel \
  -H 'x-teatralia-tenant-slug: sala-faro'; echo
```

**Resultado esperado:**

```text
{"message":"Route POST:/api/public/orders/PED-2026-0107/cancel not found","error":"Not Found","statusCode":404}
```

**Cómo se lee:** la ruta no existe. En Teatralia el comprador no cancela: un reembolso lo hace el promotor desde el backoffice (`teatralia/services/api/src/orders/refunds.ts`). Si Copilot dio un endpoint, era una alucinación.

### 3 — Haz la segunda pregunta: una regla con número

Chat nuevo (**+**), modo **Ask**:

```text
¿Cuál es el máximo de entradas que puede comprar una misma persona al mes en Teatralia?
```

Y compruébalo:

```bash
# Dónde aparece un máximo de entradas en el código
grep -rn "máximo" teatralia/services/api/src/orders teatralia/packages/ui/src
grep -n "MAX_TICKETS =" teatralia/packages/ui/src/context.tsx
```

**Resultado esperado:**

```text
teatralia/services/api/src/orders/pricing.ts:52:  // máximo 10 entradas por pedido (antirreventa)
teatralia/services/api/src/orders/pricing.ts:54:    throw new Error('máximo 10 entradas por pedido');
teatralia/packages/ui/src/context.tsx:27:export const MAX_TICKETS = 10;
```

**Cómo se lee:** hay un límite de 10 entradas **por pedido**, no por persona ni por mes. Una respuesta del tipo «10 entradas al mes» mezcla un dato real con una regla que no existe; es la alucinación más difícil de ver, porque el número es correcto.

### 4 — Pregunta exigiendo evidencia

La misma pregunta del paso 1, en un chat nuevo, modo **Ask**, con una instrucción que cambia las reglas:

```text
#file:teatralia/services/api/src/routes/public.ts
Responde solo con lo que esté en el código. ¿Puede un comprador cancelar su pedido desde la tienda?
Si existe, cita el fichero y la línea. Si no existe, dilo y dime qué hay que se parezca.
```

**Qué debe contener la respuesta:** que no hay ruta de cancelación en `public.ts`; como mucho, que existe el pago (`/api/public/orders/:id/pay`) y la consulta (`/api/public/orders/:id`). Si menciona los reembolsos del backoffice, mejor: es lo que «se parece».

**Cómo se lee:** con el fichero adjunto y permiso explícito para decir «no existe», la respuesta se ciñe al código. No elimina la alucinación, pero la hace detectable: cada afirmación trae su línea.

### 5 — Una pregunta que sí tiene respuesta, comprobada igual

No se trata de desconfiar de todo, sino de comprobar todo. Chat nuevo, modo **Ask**:

```text
#file:teatralia/services/api/src/orders/service.ts
¿Qué pasa si se intenta pagar dos veces el mismo pedido? Cita la línea.
```

**Qué debe contener la respuesta:** que `payOrder` comprueba que el pedido esté `pending` y, si no, responde 409 con el estado. Compruébalo:

```bash
# Pagar de nuevo el pedido de Ana, que ya está pagado
curl -s localhost:3000/api/public/orders/PED-2026-0107/pay -H 'x-teatralia-tenant-slug: sala-faro' \
  -H 'content-type: application/json' -d '{"card":"4242424242424242"}'; echo
```

```text
{"error":"el pedido está paid"}
```

**Cómo se lee:** esta vez la respuesta era cierta. La comprobación cuesta lo mismo y te da la misma seguridad en los dos casos.

## Comprueba tu entendimiento

**La cita que no existe**
Si alguna respuesta citó un fichero, ábrelo con <kbd>Ctrl</kbd>+<kbd>P</kbd> y busca lo citado con <kbd>Ctrl</kbd>+<kbd>F</kbd>.
→ Si no está, la cita era parte de la alucinación. Una referencia en la respuesta no garantiza que el contenido esté ahí.

**El número correcto con la regla equivocada**
Pregunta a Copilot: `¿Y por pedido?`
→ Ahora debe dar 10 por pedido y citar `pricing.ts`. La diferencia entre las dos respuestas es la palabra que tú cambiaste.

## Investiga

Busca en el backlog (`teatralia/docs/backlog/`) una petición que **todavía no** esté implementada y pregunta a Copilot, en modo **Ask** y sin adjuntar el issue, cómo funciona esa función en Teatralia. Por ejemplo, la lista de espera (`TEA-103`) o el cambio de titular (`TEA-109`). Comprueba si existe algo:

```bash
# ¿Hay algo de lista de espera en el código?
grep -rni "waitlist\|lista de espera" teatralia/services teatralia/apps --include=*.ts --include=*.tsx
```

No devuelve nada: la lista de espera solo está en el backlog. Una función que se pide en el backlog es de las más fáciles de alucinar: el nombre suena a algo que «debería» estar.

## Reto

### 1 — Un prompt que no se deja engañar

**La situación:** un compañero va a usar Copilot para responder a atención al cliente. Quiere un prompt base que reduzca las invenciones.

**Qué haces:** escribe ese prompt base y pruébalo con las dos preguntas del lab (cancelar pedido y máximo al mes) en chats nuevos de modo **Ask**.

**Pistas:** qué fuente debe usar, qué hacer si no encuentra la respuesta, qué formato de cita.

**Lo que buscas:** que para las dos preguntas la respuesta diga que no existe y cite lo que sí hay.

<details>
<summary>Ver solución</summary>

```text
Eres soporte técnico de Teatralia. Responde solo con lo que encuentres en el repositorio
(#codebase). Para cada afirmación, cita fichero y línea. Si no encuentras algo, responde
«No está en el código» y di qué hay de más parecido. No completes con lo habitual en otros
sistemas de venta de entradas.
```

Comprobación de lo que debe decir para cada pregunta:

```bash
curl -s -X POST localhost:3000/api/public/orders/PED-2026-0107/cancel -H 'x-teatralia-tenant-slug: sala-faro'; echo
grep -n "MAX_TICKETS =" teatralia/packages/ui/src/context.tsx
```

```text
{"message":"Route POST:/api/public/orders/PED-2026-0107/cancel not found","error":"Not Found","statusCode":404}
27:export const MAX_TICKETS = 10;
```

**La regla:** dar permiso explícito para «no lo sé» y exigir cita convierte una alucinación silenciosa en una respuesta comprobable. No la elimina: la comprobación sigue siendo tuya.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `curl: (7) Failed to connect` | La API no está arrancada | `make up` en otra terminal |
| La respuesta cambia al repetir la pregunta | Es normal: la respuesta no es determinista | Compara las afirmaciones, no el texto |
| Copilot dice «no puedo ver el repositorio» | Pregunta sin contexto en un chat sin acceso al workspace | Añade `#codebase` o adjunta el fichero |
| La respuesta cita `refunds.ts` como cancelación del comprador | Mezcla reembolso del promotor con cancelación | Pregunta quién llama a esa función: es el backoffice |

## Conclusiones

### Qué son la alucinación y la sobreconfianza

Alucinación: una afirmación que no está en ninguna fuente y que el modelo genera porque es plausible. Sobreconfianza: que la diga con la misma seguridad que una cierta.

### Cómo debe ser una pregunta que las reduce

| Requisito | En el lab |
|-----------|-----------|
| No da por hecho lo que pregunta | «¿Puede…?» en vez de «¿Cómo…?» |
| Lleva la fuente adjunta | `#file:…/public.ts` |
| Permite decir «no existe» | «Si no existe, dilo» |
| Exige cita comprobable | «Cita el fichero y la línea» |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Endpoint inventado | `curl` devuelve 404 | Atención al cliente da instrucciones que no funcionan |
| Dato real con regla inventada | «10» existe, «al mes» no | Una política comercial que nadie aprobó |

### Cómo se perfecciona

Instrucciones del repositorio que digan cómo responder (citar, admitir lo que no está) y documentación de negocio en el repositorio, para que la respuesta correcta esté al alcance.

### En una frase

> 🔑 Copilot inventa con la misma voz con la que acierta: pídele la línea y compruébala.
