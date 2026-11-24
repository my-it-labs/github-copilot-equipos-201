# Laboratorio: confidencialidad y exclusiones de contenido

[← Página anterior](06-lab-alucinaciones.md) · [Siguiente página →](08-lab-edit-frente-a-agent.md)

Teatralia guarda la configuración de correo de cada promotor, y dos de ellos usan proveedores con clave de API (SendGrid y Mailgun). En este lab buscas qué secretos y datos personales hay en el repositorio y en la API, ves qué de eso puede llegar a Copilot, y aplicas las dos defensas que tienes a mano: que los secretos no salgan de donde están y, en los planes de empresa, la exclusión de contenido.

### Objetivo

Comprender qué información sale de tu entorno cuando usas Copilot: qué lee, cómo se detecta un secreto expuesto, qué controles existen para excluir ficheros y cómo se corrige la exposición en el propio código.

### Punto de partida

- Codespace del curso con Copilot activo y Teatralia en marcha:

```bash
# Estado inicial y plataforma arrancada (deja esta terminal abierta)
CONFIRM=1 make reset
make up
```

### Qué está pasando

Para responder, Copilot envía al servicio el contexto de la petición: el fichero abierto, los que adjuntas, los que busca en modo Agent y lo que pegas en el chat. Si en ese contexto hay una clave de API o el email de un cliente, esa clave o ese email han salido de tu máquina. GitHub no usa el contenido de Copilot Business para entrenar modelos, pero la clave ya está en un sitio donde no debería estar.

| En la realidad | En este laboratorio |
|----------------|---------------------|
| Una clave de un proveedor en el código | `apiKey` de SendGrid y de Mailgun en `seed-data.ts` (no son reales) |
| Una API que devuelve secretos al navegador | `GET /api/admin/email` devuelve la clave completa |
| Datos personales de clientes | Emails de compradores en la base de datos |
| Política de la empresa sobre IA | Exclusión de contenido de Copilot Business |

> [!WARNING]
> Las claves de este repositorio son de ejemplo y no funcionan en ningún proveedor. En tu proyecto real no pegues una clave en el chat para «probar» lo que hace este lab.

### 1 — Busca secretos en el repositorio

Primero la fuente en crudo: qué hay escrito en los ficheros.

```bash
# Claves, tokens y secretos escritos en el código de Teatralia
grep -rnE "apiKey: '|SECRET \?\? '" teatralia/services teatralia/apps --include=*.ts --include=*.tsx | grep -v "/test/"
```

**Resultado esperado:**

```text
teatralia/services/api/src/config.ts:6:  ticketsSecret: process.env.TICKETS_SECRET ?? 'teatralia-dev-solo-para-el-curso',
teatralia/services/api/src/seed-data.ts:17:  { id: 'TN-LUMEN', slug: 'teatro-lumen', name: 'Teatro Lumen', host: 'entradas.teatrolumen.localhost', emailProvider: 'sendgrid', emailFrom: 'taquilla@teatrolumen.test', emailConfig: { apiKey: 'SG.ejemplo-no-real.0000000000' }, color: '#5b1035' },
teatralia/services/api/src/seed-data.ts:19:  { id: 'TN-CIERZO', slug: 'teatro-cierzo', name: 'Teatro Cierzo', host: 'entradas.teatrocierzo.localhost', emailProvider: 'mailgun', emailFrom: 'hola@teatrocierzo.test', emailConfig: { domain: 'mg.teatrocierzo.test', apiKey: 'key-ejemplo-no-real-1111' }, color: '#3b3b58' },
```

**Cómo se lee:** tres secretos. El de `config.ts` es el valor por defecto con el que se firman los QR de las entradas: si alguien lo conoce, puede fabricar entradas válidas. Los de `seed-data.ts` son claves de proveedores. Todos están en ficheros que Copilot lee cuando trabajas en la API.

### 2 — Pregunta a Copilot qué ve

Compruebas que lo que hay en un fichero abierto forma parte del contexto.

1. Abre `teatralia/services/api/src/seed-data.ts`.
2. En la vista **Chat**, **+**, modo **Ask**:

```text
#file:teatralia/services/api/src/seed-data.ts
¿Hay en este fichero claves, tokens o datos que no deberían estar en un repositorio? Lístalos con su línea.
```

**Qué debe contener la respuesta:** las dos `apiKey` (líneas 17 y 19) y, si es buena, los dominios de correo de los promotores. Copilot las encuentra porque **las ha leído**: para responder, el fichero entero ha ido al servicio.

### 3 — Busca el secreto en la API

Un secreto no solo se expone en el código: también en lo que la aplicación devuelve.

```bash
# Lo que recibe el navegador del backoffice al abrir la sección Email del Teatro Lumen
curl -s localhost:3000/api/admin/email -H 'authorization: Bearer lumen-dev-token'; echo
```

**Resultado esperado:**

```text
{"provider":"sendgrid","from":"taquilla@teatrolumen.test","config":{"apiKey":"SG.ejemplo-no-real.0000000000"},"providers":["smtp","sendgrid","mailgun","ses","postmark"]}
```

**Cómo se lee:** la clave completa viaja al navegador de cualquiera que entre en el backoffice del promotor. Si alguien hace una captura de pantalla de la sección **Email** y la pega en el chat para preguntar «¿por qué no se envían los correos?», la clave también acaba en Copilot.

### 4 — Mira los datos personales

Los datos de clientes son el otro tipo de información que no debe salir.

```bash
# Emails de compradores de un evento: datos personales
psql "$DATABASE_URL" -c "SELECT buyer_email, count(*) FROM orders WHERE event_id = 'EV-FARO-0042' GROUP BY 1 ORDER BY 2 DESC LIMIT 3;"
```

**Resultado esperado:**

```text
          buyer_email          | count 
-------------------------------+-------
 paula.alvarez@mail.test       |     1
 santiago.sanchez@ejemplo.test |     1
 ximena.navarro@mail.test      |     1
(3 rows)
```

En estos datos todas las direcciones son de dominios `.test`, inventadas.

**Cómo se lee:** pegar el resultado de una consulta así en el chat («¿por qué este cliente tiene tantos pedidos?») envía datos personales de clientes reales a un servicio externo. Pregunta por la **forma** del dato (la consulta, las columnas), no pegues el dato.

### 5 — Corrige la exposición en la API

La defensa que no depende de ninguna configuración de Copilot: que el secreto no salga de donde está. Pides el cambio en modo **Edit** con `teatralia/services/api/src/routes/admin.ts` adjunto:

```text
En GET /api/admin/email, no devuelvas las claves completas. Enmascara los valores de apiKey,
secretAccessKey y password dejando solo los 4 últimos caracteres con «••••» delante.
No cambies otras rutas.
```

Revisa el diff y pulsa **Keep**. Comprueba:

```bash
# La misma petición del paso 3, después del cambio
curl -s localhost:3000/api/admin/email -H 'authorization: Bearer lumen-dev-token'; echo
curl -s localhost:3000/api/admin/email -H 'authorization: Bearer cierzo-dev-token'; echo
```

**Resultado esperado:**

```text
{"provider":"sendgrid","from":"taquilla@teatrolumen.test","config":{"apiKey":"••••0000"},"providers":["smtp","sendgrid","mailgun","ses","postmark"]}
{"provider":"mailgun","from":"hola@teatrocierzo.test","config":{"apiKey":"••••1111","domain":"mg.teatrocierzo.test"},"providers":["smtp","sendgrid","mailgun","ses","postmark"]}
```

<details>
<summary>Implementación de referencia</summary>

```ts
// Las claves de los proveedores de correo nunca salen completas de la API: solo los 4 últimos caracteres
const SECRET_KEYS = ['apiKey', 'secretAccessKey', 'password'];
export function maskSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config ?? {})) {
    out[k] = SECRET_KEYS.includes(k) && typeof v === 'string' ? `••••${v.slice(-4)}` : v;
  }
  return out;
}
```

Y en la ruta: `config: maskSecrets(t.email_config)`.

</details>

### 6 — Conoce la exclusión de contenido (planes de empresa)

En **Copilot Business** y **Enterprise**, la organización puede impedir que Copilot use ciertos ficheros como contexto. Se configura en GitHub, no en el editor: en el repositorio, **Settings** → **Copilot** → **Content exclusion** (o a nivel de organización), con una lista de rutas como esta:

```yaml
# Rutas del repositorio que Copilot no debe usar como contexto
- "/teatralia/services/api/src/seed-data.ts"
- "/teatralia/services/api/src/config.ts"
- "**/.env"
```

Con la exclusión activa, Copilot no ofrece sugerencias en esos ficheros ni los usa para responder. En tu cuenta personal con Copilot Free esta opción no existe: en este curso la defensa es la del paso 5.

> [!NOTE]
> La exclusión de contenido la gestiona quien administra Copilot en la organización. Pregunta en tu empresa qué rutas están excluidas en vuestros repositorios.

## Comprueba tu entendimiento

**Qué ha salido en el chat**
Pregunta en el chat del paso 2: `¿Cuál es la apiKey del Teatro Cierzo?`
→ Te la dice. Esa clave formaba parte del contexto que se envió.

**El secreto ya no viaja al navegador**
Abre el backoffice (**Ports** → **Backoffice (5174)**), entra con `lumen-dev-token` y abre **Email**.
→ El campo de la clave muestra `••••0000`.

## Investiga

¿Hay más sitios por donde salga un secreto o un dato personal? Pide a Copilot, en modo **Ask** con `#codebase`, que liste las rutas de la API que devuelven emails de compradores o configuraciones de proveedores. Después compruébalo con `grep -n "buyer_email\|email_config" teatralia/services/api/src/routes/*.ts`. ¿Cuáles devuelven datos de un promotor a quien no es ese promotor?

## Reto

### 1 — El enmascarado que rompe el guardado

**La situación:** tras el paso 5, el Teatro Lumen entra en **Email**, cambia solo el remitente y pulsa **Guardar**. Al día siguiente no sale ningún correo.

**Qué haces:** reprodúcelo con la API, guardando la configuración tal como la recibe el navegador, y mira qué queda en la base de datos. Después pide a Copilot el arreglo en modo **Edit** con `admin.ts` adjunto.

```bash
# Guardar lo que devolvió el GET enmascarado (lo que hace el formulario)
curl -s -X PUT localhost:3000/api/admin/email -H 'authorization: Bearer lumen-dev-token' \
  -H 'content-type: application/json' \
  -d '{"provider":"sendgrid","from":"taquilla@teatrolumen.test","config":{"apiKey":"••••0000"}}'; echo
psql "$DATABASE_URL" -tAc "SELECT email_config FROM tenants WHERE id = 'TN-LUMEN';"
```

**Pistas:** en el `PUT`, un valor que empieza por `••••` significa «no lo he cambiado».

**Lo que buscas:** tras el mismo `PUT`, la base de datos conserva `SG.ejemplo-no-real.0000000000`.

<details>
<summary>Ver solución</summary>

Antes del arreglo, la base de datos se queda con la máscara:

```text
{"provider":"sendgrid","saved":true}
{"apiKey": "••••0000"}
```

Arreglo en `PUT /api/admin/email`, antes de guardar:

```ts
      // Un valor enmascarado (••••1234) significa «no lo he cambiado»: se conserva el guardado
      const merged: Record<string, unknown> = { ...(config ?? {}) };
      for (const [k, v] of Object.entries(merged)) {
        if (typeof v === 'string' && v.startsWith('••••')) merged[k] = (t.email_config as Record<string, unknown>)[k];
      }
```

y guardar `merged` en lugar de `config`. Restaura la clave que se perdió y repite el mismo `PUT`:

```bash
# Devuelve la clave original al Teatro Lumen
psql "$DATABASE_URL" -c "UPDATE tenants SET email_config = '{\"apiKey\": \"SG.ejemplo-no-real.0000000000\"}' WHERE id = 'TN-LUMEN';"
```

Ahora el `PUT` deja:

```text
{"provider":"sendgrid","saved":true}
{"apiKey": "SG.ejemplo-no-real.0000000000"}
```

**La regla:** proteger un secreto cambia el contrato de la API; revisa también quién **escribe** lo que antes leía en claro.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| `{"error":"token de promotor no válido"}` | Token mal escrito | `lumen-dev-token`, `cierzo-dev-token`… (ver `teatralia/README.md`) |
| El `curl` del paso 5 sigue mostrando la clave | No pulsaste **Keep** o la API no se ha recargado | Pulsa **Keep** y mira que `[api]` reinicia en la terminal de `make up` |
| No encuentras **Content exclusion** en Settings | Repositorio personal sin Copilot Business | Es normal: solo existe en organizaciones con Business o Enterprise |
| El backoffice ya no envía correos del Lumen | Guardaste la máscara (el reto) | `CONFIRM=1 make reset` |

## Conclusiones

### Qué es la confidencialidad al usar Copilot

Saber qué información forma parte del contexto que se envía al servicio y evitar que incluya secretos o datos personales.

### Cómo debe ser

| Requisito | En el lab |
|-----------|-----------|
| Los secretos no están en el código | Las `apiKey` de `seed-data.ts` deberían venir de variables de entorno |
| La API no devuelve secretos completos | `maskSecrets` en `GET /api/admin/email` |
| Al chat va la forma del dato, no el dato | La consulta, no la lista de emails |
| La empresa excluye lo sensible | Content exclusion en Copilot Business |

### Dónde se rompe y cómo lo has detectado

| Fallo | Cómo lo has visto | Qué provoca |
|-------|-------------------|-------------|
| Secreto en un fichero que Copilot lee | Copilot repite la `apiKey` del Cierzo | La clave sale de tu entorno |
| Secreto en la respuesta de la API | `curl` a `/api/admin/email` | Cualquiera con acceso al backoffice la ve y la puede pegar |
| Protección que rompe el guardado | El `PUT` deja `••••0000` en la base de datos | El promotor deja de enviar correos |

### Cómo se perfecciona

Secretos en variables de entorno o en un gestor de secretos, nunca en el repositorio; exclusión de contenido configurada por la organización; instrucciones del repositorio que recuerden no pegar datos de clientes en el chat.

### En una frase

> 🔑 Lo que Copilot lee sale de tu máquina: que los secretos no estén donde él lee.
