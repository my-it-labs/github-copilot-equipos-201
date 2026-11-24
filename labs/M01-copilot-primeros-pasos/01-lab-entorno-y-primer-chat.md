# Laboratorio: Teatralia en un Codespace y primer chat

[← Página anterior](00-del-autocompletado-al-agente.md) · [Siguiente página →](02-lab-sugerencias-en-linea.md)

Teatralia es la plataforma de venta de entradas que hereda tu equipo. En este lab la pones en marcha en tu Codespace, compras una entrada de principio a fin y le haces a Copilot la primera pregunta sobre el proyecto. Lo importante no es la respuesta, es **comprobarla**: Copilot mezcla código y documentación, y la documentación de Teatralia no siempre está al día.

### Objetivo

Comprender por qué una respuesta de Copilot se comprueba contra el sistema en marcha: de dónde saca lo que dice, cómo se detecta una afirmación falsa y cómo se le obliga a citar su fuente.

### Punto de partida

- Una cuenta **personal** de GitHub con **GitHub Copilot** activado (el plan Free sirve: en github.com, foto de perfil → **Settings** → **Copilot**).
- El enlace al repositorio del curso.
- Nada instalado en tu máquina: todo corre en GitHub Codespaces, desde el navegador.

### Qué está pasando

Tu equipo recibe Teatralia sin la gente que lo escribió. Hay un monorepo con seis piezas, una base de datos con miles de pedidos y un `README.md` que nadie ha revisado en meses. Copilot puede leer todo el código en segundos, pero no distingue lo que está vigente de lo que está desfasado, y no ve el sistema en marcha.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Un proyecto heredado con documentación desfasada | `teatralia/README.md` dice un puerto que no es |
| Comprobar en producción lo que dice la documentación | `curl` a la API y `npm test` en tu Codespace |
| Pedir a un compañero «¿dónde lo has visto?» | Pedir a Copilot el fichero de cada dato |

### 1 — Haz un fork del repositorio

El curso es individual: en tu fork harás cambios, ramas y pull requests sin pisar a nadie.

1. Abre el repositorio del curso en GitHub.
2. Pulsa **Fork**.
3. En **Owner**, elige tu **usuario personal** (no la organización de tu empresa). Deja el nombre como está.
4. Pulsa **Create fork**.

**Resultado esperado:** estás en `github.com/<tu-usuario>/github-copilot-teatralia-201`, con el texto «forked from …» bajo el nombre.

> [!NOTE]
> Muchas organizaciones de empresa no permiten hacer fork de repositorios externos. Por eso el curso usa tu cuenta personal.

### 2 — Abre el fork en un Codespace

El Codespace trae Node 22, PostgreSQL, Redis, Mailpit y las extensiones de Copilot ya configuradas, y carga los datos de ejemplo al crearse.

1. En tu fork, pulsa **Code** → pestaña **Codespaces** → **Create codespace on main**.
2. Espera a que termine la configuración. En la terminal verás `npm install` y, al final, la carga de datos.

**Resultado esperado:** VS Code en el navegador, con la carpeta del repositorio abierta y, en la terminal, el final de la carga:

```text
base de datos reiniciada con los datos de ejemplo
```

### 3 — Comprueba que Copilot está activo

Sin Copilot activo, el editor no propone nada y el chat no responde.

1. Mira la barra de estado (abajo a la derecha): el icono de Copilot no debe estar tachado.
2. Abre la vista **Chat** con <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd> (o el icono de Copilot en la barra de título).
3. Si pide iniciar sesión, pulsa **Sign in** y autoriza con tu cuenta de GitHub.

**Resultado esperado:** la vista **Chat** a la derecha, con una caja de texto y, debajo, el selector de modo (**Ask**, **Edit**, **Agent**) y el de modelo.

### 4 — Arranca Teatralia

Este comando arranca los seis procesos de la plataforma y deja sus trazas en la terminal.

```bash
# Arranca api, pagos, notifier, tienda, backoffice y editor (deja esta terminal abierta)
make up
```

**Resultado esperado:** líneas con prefijos de colores: `[api]` con `Server listening at http://…:3000`, `[pagos]`, `[correo] notifier escuchando la cola «emails»` y tres `VITE … ready` de `[tienda]`, `[backoffice]` y `[editor]`. Abre otra terminal (**+** en el panel de terminal) para lo demás.

### 5 — Mira los datos que trae Teatralia

Antes de preguntar nada a Copilot, conoces el tamaño del sistema por ti mismo.

```bash
# Recuento de los datos de ejemplo
make status
```

**Resultado esperado:**

```text
promotores 6
eventos 29
pedidos 2466
entradas 6780
reembolsos 192
incidencias 48
```

**Cómo se lee:** seis promotores (salas, teatros, un auditorio y un festival), 29 eventos en todos los estados y casi dos mil quinientos pedidos. Encima no aparece ningún fichero cambiado: estás en el punto de partida.

### 6 — Compra una entrada en la tienda de la Sala Faro

Es el recorrido completo de la plataforma: pedido en la API, cobro en la pasarela, cola de correo y notifier.

1. Pestaña **Ports** → globo de **Tienda (5173)**. Añade `/t/sala-faro` a la URL y pulsa **Jazz en el Faro**.
2. En el plano, pulsa la butaca **H-7**.
3. En **De pie**, pulsa **+** una vez.
4. En **Email**, escribe `tu.nombre@ejemplo.test`.
5. Deja la tarjeta `4242 4242 4242 4242` y pulsa **Pagar**.

**Resultado esperado:** el bloque de pago cambia a «¡Listo! Pedido PED-2026-2468» (o el número siguiente si ya habías comprado) y la butaca H-7 pasa a ocupada. El importe es 35,50 € de la butaca + 18,00 € del pase + 2 × 0,90 € de gastos: **55,30 €**.

### 7 — Comprueba el pedido en la API y el correo en Mailpit

Lo que ves en pantalla lo confirmas en la fuente.

```bash
# El pedido tal como lo guarda la API (cambia el número si el tuyo es otro)
curl -s 'localhost:3000/api/public/orders/PED-2026-2468?email=tu.nombre@ejemplo.test' \
  -H 'x-teatralia-tenant-slug: sala-faro' | python3 -m json.tool | head -8
```

**Resultado esperado** (las fechas cambian):

```text
{
    "id": "PED-2026-2468",
    "status": "paid",
    "buyer_email": "tu.nombre@ejemplo.test",
    "subtotal_cents": 5350,
    "fee_cents": 180,
    "total_cents": 5530,
    "paid_at": "…",
```

Después abre **Ports** → **Mailpit (8025)**: hay un correo «Tus entradas para Jazz en el Faro — PED-2026-2468» para tu dirección.

**Cómo se lee:** los importes van en **céntimos** (`5530` = 55,30 €). Es una convención de todo Teatralia y la verás en cada lab.

### 8 — Haz la primera pregunta a Copilot

En la vista **Chat**, pulsa **+** (conversación nueva), elige el modo **Ask** y escribe:

```text
Lista las apps y servicios de este monorepo, qué hace cada uno y en qué puerto escucha.
Para cada puerto, dime en qué fichero lo has visto.
```

Pedir el fichero de cada dato obliga a Copilot a decir de dónde lo saca, y te deja comprobarlo.

**Qué debe contener la respuesta** (el texto varía en cada ejecución): seis piezas, `apps/storefront` (5173), `apps/backoffice` (5174), `apps/editor-mfe` (5175), `services/api`, `services/payments` (3001) y `services/notifier` (sin puerto). Fíjate en el puerto de la API y en el fichero que cita: si leyó `teatralia/README.md`, dirá **8080**; si leyó el código, dirá **3000** y citará `services/api/src/config.ts`. Las dos respuestas suenan igual de seguras.

### 9 — Comprueba el puerto de la API

Cada afirmación se comprueba en el código o ejecutando. Esta es la costumbre del curso.

```bash
# Qué dice la documentación y qué dice el código
grep -n "API:" teatralia/README.md
grep -n "port" teatralia/services/api/src/config.ts
# Y qué responde de verdad
curl -s localhost:3000/api/health
```

**Resultado esperado:**

```text
16:- API: http://localhost:8080
2:  port: Number(process.env.API_PORT ?? 3000),
{"ok":true}
```

**Cómo se lee:** el README dice 8080, el código dice 3000 y la API responde en 3000. Si Copilot dijo 8080, has encontrado tu primera afirmación falsa. Díselo en el mismo chat:

```text
El README dice 8080, pero config.ts dice 3000 y la API responde en 3000. ¿Cuál es el correcto y por qué?
```

Copilot reconocerá que el README está desfasado. No lo sabía: lo ha deducido de lo que le has dado.

### 10 — Ejecuta los tests

Antes de tocar nada sabes que el punto de partida está en verde. Si algo falla después, lo has roto tú o Copilot.

```bash
# Tests de todo el monorepo
make test
```

**Resultado esperado** (última parte):

```text
 Test Files  6 passed (6)
      Tests  21 passed (21)
```

## Comprueba tu entendimiento

**El promotor por ruta**
Abre la tienda con `/t/teatro-lumen` al final de la URL.
→ Ves la tienda del Teatro Lumen con sus funciones (*La casa de Bernarda Alba*, *Impro a la carta*…). Es el mismo código con otro promotor.

**La pasarela rechaza**
Compra otra entrada de Jazz en el Faro con la tarjeta `4000 0000 0000 0002`.
→ Aparece «pago rechazado: fondos insuficientes», la butaca sigue libre y no llega ningún correo a Mailpit.

## Investiga

Pregunta a Copilot en modo **Ask** qué datos de ejemplo trae Teatralia y de dónde salen. Compara su respuesta con la fuente en crudo: abre `teatralia/services/api/src/seed-data.ts` (el catálogo de promotores, recintos y eventos) y después cuenta en la base de datos:

```bash
# Eventos por promotor, directamente en PostgreSQL
psql "$DATABASE_URL" -c "SELECT tenant_id, count(*) FROM events GROUP BY 1 ORDER BY 1;"
```

```text
  tenant_id  | count 
-------------+-------
 TN-ALBORADA |     3
 TN-CIERZO   |     5
 TN-FARO     |     5
 TN-LUMEN    |     6
 TN-MAREA    |     5
 TN-OLIVO    |     5
(6 rows)
```

¿Coincide lo que dijo Copilot? Si dio un número de pedidos, ¿de dónde pudo sacarlo, si los pedidos no están en ningún fichero sino que se generan al cargar los datos?

## Reto

### 1 — Que Copilot te enseñe a dar de alta un promotor

**La situación:** un promotor nuevo, «Club Marea Alta», quiere vender en Teatralia con su propio dominio. Nadie del equipo sabe cómo se hace y no hay documentación.

**Qué haces:** sin abrir tú el código, escribe un prompt en modo **Ask** para que Copilot te dé los pasos exactos (pantallas, botones, campos y URLs) y síguelos tal cual en el backoffice (**Ports** → **Backoffice (5174)**).

**Pistas:** pide el texto exacto de cada botón y campo, el fichero donde lo ha visto y que no cambie nada.

**Lo que buscas:** abrir la tienda del promotor nuevo, vacía, siguiendo solo los pasos de Copilot.

<details>
<summary>Ver solución</summary>

Un prompt que funciona pide pasos ejecutables y el origen de cada dato:

```text
Quiero dar de alta un promotor nuevo con su propio dominio y ver su tienda. Busca en el
código cómo se hace desde el backoffice. Dame los pasos numerados con el texto exacto de
cada botón y campo, las URLs que tengo que abrir y, para cada paso, el fichero donde lo has
visto. No cambies nada.
```

Copilot debería encontrar `apps/backoffice/src/Login.tsx` (alta con nombre, slug y email de envío) y la sección **Dominios** de `apps/backoffice/src/sections.tsx`. El alta se puede comprobar también contra la API, que es lo que llama el formulario:

```bash
# Alta del promotor por la API (lo mismo que hace el formulario del backoffice)
curl -s localhost:3000/api/admin/signup -H 'content-type: application/json' \
  -d '{"name":"Club Marea Alta","slug":"club-marea-alta","email_from":"taquilla@clubmareaalta.test"}'
```

```text
{"id":"TN-CLUBMARE","slug":"club-marea-alta","name":"Club Marea Alta","token":"…"}
```

El `token` cambia en cada alta: es el que se usa para entrar en el backoffice. La tienda queda en `/t/club-marea-alta`, sin eventos.

Si algún paso no coincide con la pantalla (un botón con otro nombre, una URL que no carga), la instrucción vino de suponer y no de leer: pídele la línea donde lo ha visto. **La regla:** pide siempre la fuente de cada dato; un prompt sin «dónde lo has visto» devuelve pasos genéricos de cualquier SaaS.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| El chat dice que no tienes acceso a Copilot | Copilot no está activado en tu cuenta personal | github.com → **Settings** → **Copilot** → activa **Copilot Free** y recarga el Codespace |
| `make up` falla con `EADDRINUSE` | Ya había un `make up` en otra terminal | Ciérralo con <kbd>Ctrl</kbd>+<kbd>C</kbd> en esa terminal y repite |
| La tienda dice «no hay ningún promotor en este dominio» | Abriste la URL sin `/t/<slug>` | Añade `/t/sala-faro` al final de la URL |
| No llega el correo a Mailpit | El notifier no está arrancado | Busca las líneas `[correo]` en la terminal de `make up` |
| `make status` no muestra datos | La carga inicial falló | Ejecuta `make db-reset` |

## Conclusiones

### Qué es comprobar una respuesta

Contrastar cada afirmación de Copilot con una fuente que no miente: el código que se ejecuta, una consulta a la base de datos o el sistema en marcha.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| El prompt pide la fuente de cada dato | «Para cada puerto, dime en qué fichero lo has visto» |
| La comprobación es ejecutable | `grep` en `config.ts` y `curl` a `/api/health` |
| El punto de partida está verificado | `make test` en verde y `make status` con los datos |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Documentación desfasada leída como verdad | El README dice 8080 y la API responde en 3000 | Una afirmación falsa dicha con seguridad |
| Datos que no están en ningún fichero | Los pedidos se generan al cargar: Copilot no los ve | Cifras inventadas si las pides sin darle acceso |

### Cómo se perfecciona

Con instrucciones del repositorio que digan qué fuentes mandan (el código sobre el README) y con herramientas que le den acceso al sistema (la base de datos con MCP). Las dos cosas se ven más adelante en el curso.

### En una frase

> 🔑 Copilot lee todo y no distingue lo vigente de lo desfasado: pídele la fuente y compruébala.
