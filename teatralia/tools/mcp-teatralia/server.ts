// Servidor MCP de Teatralia: preguntas de negocio sobre la base de datos, en SOLO LECTURA.
//
// Arranque (transporte stdio; lo lanza el cliente MCP, p. ej. VS Code con .vscode/mcp.json):
//   DATABASE_URL=postgres://... node teatralia/tools/mcp-teatralia/server.ts
//
// Reglas de diseño:
//   - Herramientas pequeñas y con nombre de negocio. No hay una herramienta «ejecuta este SQL».
//   - Consultas parametrizadas ($1, $2…): lo que escribe el modelo nunca se concatena en el SQL.
//   - Cada consulta va en una transacción READ ONLY y la conexión se abre con
//     default_transaction_read_only=on y un statement_timeout: aunque alguien añada un UPDATE, falla.
//   - Los emails de compradores salen enmascarados (a***@dominio): son datos personales.
//   - Nada se escribe en stdout salvo el protocolo MCP; los avisos van a stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pg from 'pg';
import { z } from 'zod';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('mcp-teatralia: falta la variable DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 2,
  // Segunda barrera: la sesión entera es de solo lectura y ninguna consulta pasa de 5 s
  options: '-c default_transaction_read_only=on -c statement_timeout=5000',
  application_name: 'mcp-teatralia',
});

// Ejecuta una consulta parametrizada dentro de una transacción de solo lectura
let enCurso = 0; // consultas sin terminar: al cerrar, se espera a que acaben
async function consultar(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  enCurso++;
  const client = await pool.connect().catch((err) => {
    enCurso--;
    throw err;
  });
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const res = await client.query(sql, params);
    await client.query('COMMIT');
    return res.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    enCurso--;
  }
}

// Respuesta MCP: texto JSON que el modelo lee y resume
function respuesta(datos: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(datos, null, 2) }] };
}

function error(mensaje: string) {
  return { isError: true, content: [{ type: 'text' as const, text: mensaje }] };
}

const SOLO_LECTURA = { readOnlyHint: true, openWorldHint: false };
const EVENTO = z.string().regex(/^EV-[A-Z0-9-]+$/).describe('Id del evento, p. ej. EV-FARO-0042');
const PROMOTOR = z.string().describe('Slug del promotor, p. ej. sala-faro, teatro-lumen, teatro-cierzo');

const server = new McpServer({ name: 'teatralia', version: '1.0.0' });

server.registerTool(
  'ventas_por_evento',
  {
    title: 'Ventas por evento',
    description:
      'Ventas de cada evento: pedidos cobrados, entradas válidas, importe cobrado, reembolsado, neto y comisión de ' +
      'Teatralia, en euros. Filtra por evento o por promotor; sin filtros devuelve todos, de más a menos neto.',
    inputSchema: { evento: EVENTO.optional(), promotor: PROMOTOR.optional() },
    annotations: SOLO_LECTURA,
  },
  async ({ evento, promotor }) => {
    const filas = await consultar(
      `SELECT e.id AS evento, e.title AS titulo, t.slug AS promotor, e.city AS ciudad, e.status AS estado,
              count(o.id)::int AS pedidos_cobrados,
              (SELECT count(*)::int FROM tickets k WHERE k.event_id = e.id AND k.status = 'valid') AS entradas_validas,
              round(coalesce(sum(o.total_cents), 0) / 100.0, 2) AS cobrado_eur,
              round(coalesce(sum(o.refunded_cents), 0) / 100.0, 2) AS reembolsado_eur,
              round(coalesce(sum(o.total_cents - o.refunded_cents), 0) / 100.0, 2) AS neto_eur,
              round(coalesce(sum(o.commission_cents), 0) / 100.0, 2) AS comision_eur
         FROM events e
         JOIN tenants t ON t.id = e.tenant_id
         LEFT JOIN orders o ON o.event_id = e.id AND o.status IN ('paid', 'partially_refunded', 'refunded')
        WHERE ($1::text IS NULL OR e.id = $1) AND ($2::text IS NULL OR t.slug = $2)
        GROUP BY e.id, t.slug
        ORDER BY neto_eur DESC`,
      [evento ?? null, promotor ?? null],
    );
    if (filas.length === 0) return error('No hay eventos con ese filtro.');
    return respuesta(filas);
  },
);

server.registerTool(
  'buscar_pedido',
  {
    title: 'Buscar pedido',
    description:
      'Detalle de un pedido por su número (PED-AAAA-NNNN): evento, estado, importes, entradas y reembolsos. ' +
      'El email del comprador sale enmascarado.',
    inputSchema: { pedido: z.string().regex(/^PED-\d{4}-\d{4}$/).describe('Número de pedido, p. ej. PED-2026-0107') },
    annotations: SOLO_LECTURA,
  },
  async ({ pedido }) => {
    const [cabecera] = await consultar(
      `SELECT o.id AS pedido, o.status AS estado, e.id AS evento, e.title AS titulo, e.starts_at AS fecha_evento,
              regexp_replace(o.buyer_email, '^(.).*(@.*)$', '\\1***\\2') AS comprador,
              round(o.subtotal_cents / 100.0, 2) AS entradas_eur, round(o.fee_cents / 100.0, 2) AS gastos_eur,
              round(o.total_cents / 100.0, 2) AS total_eur, round(o.refunded_cents / 100.0, 2) AS reembolsado_eur,
              o.created_at AS creado
         FROM orders o JOIN events e ON e.id = o.event_id
        WHERE o.id = $1`,
      [pedido],
    );
    if (!cabecera) return error(`No existe el pedido ${pedido}.`);
    const entradas = await consultar(
      `SELECT k.id AS entrada, k.kind AS tipo, coalesce(k.seat_id, p.name) AS butaca_o_pase,
              round(k.price_cents / 100.0, 2) AS precio_eur, k.status AS estado
         FROM tickets k LEFT JOIN pass_types p ON p.id = k.pass_type_id
        WHERE k.order_id = $1 ORDER BY k.id`,
      [pedido],
    );
    const reembolsos = await consultar(
      `SELECT id AS reembolso, reason AS motivo, round(amount_cents / 100.0, 2) AS importe_eur, ticket_ids AS entradas, created_at AS fecha
         FROM refunds WHERE order_id = $1 ORDER BY created_at`,
      [pedido],
    );
    return respuesta({ ...cabecera, entradas, reembolsos });
  },
);

server.registerTool(
  'incidencias_abiertas',
  {
    title: 'Incidencias abiertas',
    description:
      'Incidencias de clientes sin resolver (estado «abierta» o «en curso»), las más antiguas primero. ' +
      'Filtra por promotor y por categoría (devolución, cambio de titular, acceso, cobro, accesibilidad, correo).',
    inputSchema: {
      promotor: PROMOTOR.optional(),
      categoria: z
        .enum(['devolución', 'cambio de titular', 'acceso', 'cobro', 'accesibilidad', 'correo'])
        .optional()
        .describe('Categoría de la incidencia'),
    },
    annotations: SOLO_LECTURA,
  },
  async ({ promotor, categoria }) => {
    const filas = await consultar(
      `SELECT c.id AS incidencia, t.slug AS promotor, c.order_id AS pedido, c.category AS categoria,
              c.status AS estado, c.subject AS asunto, to_char(c.created_at, 'YYYY-MM-DD') AS abierta_el
         FROM support_cases c JOIN tenants t ON t.id = c.tenant_id
        WHERE c.status IN ('abierta', 'en curso')
          AND ($1::text IS NULL OR t.slug = $1) AND ($2::text IS NULL OR c.category = $2)
        ORDER BY c.created_at
        LIMIT 50`,
      [promotor ?? null, categoria ?? null],
    );
    return respuesta({ total: filas.length, incidencias: filas });
  },
);

server.registerTool(
  'ocupacion_evento',
  {
    title: 'Ocupación de un evento',
    description:
      'Aforo de un evento (butacas numeradas + plazas de pases), entradas válidas vendidas, plazas libres y ' +
      'porcentaje de ocupación.',
    inputSchema: { evento: EVENTO },
    annotations: SOLO_LECTURA,
  },
  async ({ evento }) => {
    const [fila] = await consultar(
      `SELECT e.id AS evento, e.title AS titulo, e.status AS estado, e.starts_at AS fecha,
              a.aforo, v.vendidas, a.aforo - v.vendidas AS libres,
              round(100.0 * v.vendidas / nullif(a.aforo, 0), 1) AS ocupacion_pct
         FROM events e
         CROSS JOIN LATERAL (
           SELECT (SELECT count(*) FROM seats s WHERE s.event_id = e.id)::int
                + (SELECT coalesce(sum(capacity), 0) FROM pass_types p WHERE p.event_id = e.id)::int AS aforo
         ) a
         CROSS JOIN LATERAL (
           SELECT count(*)::int AS vendidas FROM tickets k WHERE k.event_id = e.id AND k.status = 'valid'
         ) v
        WHERE e.id = $1`,
      [evento],
    );
    if (!fila) return error(`No existe el evento ${evento}.`);
    return respuesta(fila);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('mcp-teatralia: listo (stdio, solo lectura)');

// Al cerrar el cliente (fin de stdin), se terminan las consultas en curso y se cierra la base de datos
process.stdin.on('close', () => {
  const cerrar = () => (enCurso > 0 ? setTimeout(cerrar, 50) : pool.end().finally(() => process.exit(0)));
  setTimeout(cerrar, 50);
});
