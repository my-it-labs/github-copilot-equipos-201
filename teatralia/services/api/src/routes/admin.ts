import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { enqueueEmail } from '../queue.js';
import { refundOrder, type RefundReason } from '../orders/refunds.js';
import { resolveAdminTenant } from '../tenants/resolve.js';

export const EMAIL_PROVIDERS = ['smtp', 'sendgrid', 'mailgun', 'ses', 'postmark'] as const;

async function adminOf(req: FastifyRequest) {
  const tenant = await resolveAdminTenant(req);
  if (!tenant) throw new HttpError(401, 'token de promotor no válido');
  return tenant;
}

const HOST_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

export async function adminRoutes(app: FastifyInstance) {
  // Alta de un promotor nuevo. Devuelve el token con el que entra al backoffice.
  app.post<{ Body: { name: string; slug: string; email_from: string } }>('/api/admin/signup', async (req, reply) => {
    const { name, slug, email_from } = req.body ?? ({} as never);
    if (!name || !slug || !email_from) throw new HttpError(400, 'nombre, slug y email de envío son obligatorios');
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) throw new HttpError(400, 'el slug solo admite minúsculas, números y guiones');
    const id = 'TN-' + slug.replace(/-/g, '').slice(0, 8).toUpperCase();
    const token = randomBytes(16).toString('hex');
    try {
      await pool.query(
        `INSERT INTO tenants (id, slug, name, admin_token, email_from, email_config)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, slug, name, token, email_from, {}],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'ese slug ya existe');
      throw err;
    }
    return reply.code(201).send({ id, slug, name, token });
  });

  app.get('/api/admin/me', async (req) => {
    const t = await adminOf(req);
    return { id: t.id, slug: t.slug, name: t.name };
  });

  app.get('/api/admin/domains', async (req) => {
    const t = await adminOf(req);
    return (await pool.query('SELECT host, created_at FROM domains WHERE tenant_id = $1 ORDER BY host', [t.id])).rows;
  });

  app.post<{ Body: { host: string } }>('/api/admin/domains', async (req, reply) => {
    const t = await adminOf(req);
    const host = String(req.body?.host ?? '').trim().toLowerCase();
    if (!HOST_RE.test(host)) throw new HttpError(400, 'dominio no válido');
    try {
      await pool.query('INSERT INTO domains (host, tenant_id) VALUES ($1, $2)', [host, t.id]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'ese dominio ya está en uso');
      throw err;
    }
    return reply.code(201).send({ host });
  });

  app.delete<{ Params: { host: string } }>('/api/admin/domains/:host', async (req, reply) => {
    const t = await adminOf(req);
    await pool.query('DELETE FROM domains WHERE host = $1 AND tenant_id = $2', [req.params.host, t.id]);
    return reply.code(204).send();
  });

  app.get('/api/admin/events', async (req) => {
    const t = await adminOf(req);
    const r = await pool.query(
      `SELECT e.id, e.title, e.venue, e.city, e.category, e.status, e.starts_at, e.published,
              (SELECT count(*) FROM tickets k WHERE k.event_id = e.id AND k.status = 'valid')::int AS sold
         FROM events e WHERE e.tenant_id = $1 ORDER BY e.starts_at`,
      [t.id],
    );
    return r.rows;
  });

  app.get<{ Params: { id: string } }>('/api/admin/events/:id', async (req) => {
    const t = await adminOf(req);
    const r = await pool.query(
      `SELECT id, title, venue, starts_at, fee_cents, commission_bps, page_tsx, published
         FROM events WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, t.id],
    );
    if (!r.rows[0]) throw new HttpError(404, 'evento no encontrado');
    return r.rows[0];
  });

  app.put<{ Params: { id: string }; Body: { page_tsx: string } }>('/api/admin/events/:id/page', async (req) => {
    const t = await adminOf(req);
    const source = String(req.body?.page_tsx ?? '');
    if (source.length > 100_000) throw new HttpError(413, 'la página no puede pasar de 100 KB');
    const r = await pool.query(
      'UPDATE events SET page_tsx = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id',
      [source, req.params.id, t.id],
    );
    if (!r.rows[0]) throw new HttpError(404, 'evento no encontrado');
    return { id: req.params.id, saved: true };
  });

  app.get('/api/admin/email', async (req) => {
    const t = await adminOf(req);
    return { provider: t.email_provider, from: t.email_from, config: t.email_config, providers: EMAIL_PROVIDERS };
  });

  app.put<{ Body: { provider: string; from: string; config: Record<string, unknown> } }>(
    '/api/admin/email',
    async (req) => {
      const t = await adminOf(req);
      const { provider, from, config } = req.body ?? ({} as never);
      if (!EMAIL_PROVIDERS.includes(provider as never)) throw new HttpError(400, 'proveedor de email no soportado');
      await pool.query('UPDATE tenants SET email_provider = $1, email_from = $2, email_config = $3 WHERE id = $4', [
        provider,
        from || t.email_from,
        config ?? {},
        t.id,
      ]);
      return { provider, saved: true };
    },
  );

  app.post<{ Body: { to: string } }>('/api/admin/email/test', async (req) => {
    const t = await adminOf(req);
    const to = String(req.body?.to ?? '');
    if (!to.includes('@')) throw new HttpError(400, 'indica a qué dirección enviar la prueba');
    const jobId = await enqueueEmail({ type: 'test-email', tenantId: t.id, to });
    return { queued: true, job_id: jobId };
  });

  app.get('/api/admin/emails', async (req) => {
    const t = await adminOf(req);
    const r = await pool.query(
      `SELECT id, provider, to_address, subject, job_id, sent_at FROM email_log
        WHERE tenant_id = $1 ORDER BY id DESC LIMIT 50`,
      [t.id],
    );
    return r.rows;
  });

  // Listado de pedidos con filtros: ?status=paid&event=EV-FARO-0042&q=ana
  app.get<{ Querystring: { status?: string; event?: string; q?: string } }>('/api/admin/orders', async (req) => {
    const t = await adminOf(req);
    const params: unknown[] = [t.id];
    let where = 'o.tenant_id = $1';
    if (req.query.status) {
      params.push(req.query.status);
      where += ` AND o.status = $${params.length}`;
    }
    if (req.query.event) {
      params.push(req.query.event);
      where += ` AND o.event_id = $${params.length}`;
    }
    if (req.query.q) {
      // búsqueda rápida por email o número de pedido
      where += ` AND (o.buyer_email ILIKE '%${req.query.q}%' OR o.id ILIKE '%${req.query.q}%')`;
    }
    const r = await pool.query(
      `SELECT o.id, o.event_id, o.buyer_email, o.status, o.total_cents, o.refunded_cents, o.created_at, o.paid_at,
              (SELECT count(*) FROM tickets k WHERE k.order_id = o.id)::int AS tickets
         FROM orders o WHERE ${where} ORDER BY o.created_at DESC LIMIT 100`,
      params,
    );
    return r.rows;
  });

  app.get<{ Params: { id: string } }>('/api/admin/orders/:id', async (req) => {
    const t = await adminOf(req);
    const o = await pool.query(
      `SELECT o.*, e.title AS event_title, e.starts_at FROM orders o JOIN events e ON e.id = o.event_id
        WHERE o.id = $1 AND o.tenant_id = $2`,
      [req.params.id, t.id],
    );
    if (!o.rows[0]) throw new HttpError(404, 'pedido no encontrado');
    const tickets = await pool.query(
      `SELECT id, kind, seat_id, pass_type_id, price_cents, fee_cents, status, checked_in_at
         FROM tickets WHERE order_id = $1 ORDER BY id`,
      [req.params.id],
    );
    const refunds = await pool.query(
      `SELECT id, amount_cents, reason, ticket_ids, created_at FROM refunds WHERE order_id = $1 ORDER BY created_at`,
      [req.params.id],
    );
    return { ...o.rows[0], tickets: tickets.rows, refunds: refunds.rows };
  });

  app.post<{ Params: { id: string }; Body: { reason: RefundReason; ticket_ids?: string[] } }>(
    '/api/admin/orders/:id/refunds',
    async (req, reply) => {
      const t = await adminOf(req);
      const r = await refundOrder(t.id, req.params.id, req.body?.reason, req.body?.ticket_ids);
      return reply.code(201).send(r);
    },
  );

  // Panel: ventas por evento
  app.get('/api/admin/stats', async (req) => {
    const t = await adminOf(req);
    const r = await pool.query(
      `SELECT e.id, e.title, e.city, e.category, e.status, e.starts_at, v.name AS venue, v.capacity,
              (SELECT count(*) FROM tickets k WHERE k.event_id = e.id AND k.status = 'valid')::int AS sold,
              (SELECT coalesce(sum(o.total_cents), 0) FROM orders o
                WHERE o.event_id = e.id AND o.status IN ('paid', 'partially_refunded', 'refunded'))::int AS gross_cents,
              (SELECT coalesce(sum(o.refunded_cents), 0) FROM orders o WHERE o.event_id = e.id)::int AS refunded_cents
         FROM events e LEFT JOIN venues v ON v.id = e.venue_id
        WHERE e.tenant_id = $1 ORDER BY e.starts_at`,
      [t.id],
    );
    return r.rows;
  });

  app.get('/api/admin/venues', async (req) => {
    const t = await adminOf(req);
    return (await pool.query('SELECT * FROM venues WHERE tenant_id = $1 ORDER BY name', [t.id])).rows;
  });

  app.get<{ Querystring: { status?: string } }>('/api/admin/cases', async (req) => {
    const t = await adminOf(req);
    const r = await pool.query(
      `SELECT id, order_id, buyer_email, category, status, subject, body, created_at FROM support_cases
        WHERE tenant_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY created_at DESC`,
      [t.id, req.query.status ?? null],
    );
    return r.rows;
  });
}
