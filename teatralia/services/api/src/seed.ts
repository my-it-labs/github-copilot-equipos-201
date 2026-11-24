import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { config } from './config.js';
import { pool, withTransaction } from './db.js';
import { calcRefund, type RefundReason } from './orders/refunds.js';
import { calcOrderAmounts, type PricedItem } from './orders/pricing.js';
import {
  CASE_TEMPLATES, EMAIL_DOMAINS, EVENTS, FIRST_NAMES, LAST_NAMES, TENANTS, VENUES,
  type EventDef, type TenantDef, type VenueDef,
} from './seed-data.js';
import { createQrToken } from './tickets/qr.js';

// Datos de ejemplo del curso. Se cargan solo si la base de datos está vacía.
// Son deterministas: el generador usa una semilla fija, así que cada reinicio deja exactamente los mismos datos.
// Los tokens de backoffice ({slug}-dev-token) son de desarrollo: identifican al promotor en local.

// «Hoy» para los datos de ejemplo: los pedidos se crean antes de esta fecha
const SEED_NOW = new Date('2026-11-23T20:00:00+01:00');
const DAY = 86_400_000;

const seedFile = (name: string) => readFile(new URL(`../seed/${name}`, import.meta.url), 'utf8');

// Generador pseudoaleatorio con semilla (mulberry32)
function rng(seed: number) {
  let a = seed;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
    shuffle: <T>(xs: T[]) => {
      for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [xs[i], xs[j]] = [xs[j]!, xs[i]!];
      }
      return xs;
    },
  };
}

interface SeatRow { id: string; zone: string; row: string; number: number; price: number }

function seatsOf(venue: VenueDef): SeatRow[] {
  const out: SeatRow[] = [];
  for (const z of venue.zones) {
    for (const row of z.rows) {
      for (let n = 1; n <= z.seatsPerRow; n++) out.push({ id: `${row}-${n}`, zone: z.zone, row, number: n, price: z.priceCents });
    }
  }
  return out;
}

// Página por defecto de un evento (el promotor la puede editar en el backoffice)
function defaultPage(ev: EventDef, tenant: TenantDef): string {
  const name = ev.id.replace(/[^A-Za-z0-9]/g, '');
  const seats = ev.seated ? '\n          <h2>Elige tu butaca</h2>\n          <SeatPicker />' : '';
  const imports = ev.seated ? 'Cart, Checkout, PassSelector, SeatPicker, formatDate, useEvent' : 'Cart, Checkout, PassSelector, formatDate, useEvent';
  return `import { ${imports} } from '@teatralia/ui';

export default function Evento${name}() {
  const event = useEvent();
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <header style={{ background: '${tenant.color}', color: '#fff', padding: '40px 24px' }}>
        <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: 3 }}>${tenant.name}</p>
        <h1 style={{ margin: '8px 0' }}>{event.title}</h1>
        <p style={{ margin: 0 }}>{formatDate(event.starts_at)} · {event.venue}</p>
      </header>
      <section style={{ maxWidth: 1040, margin: '0 auto', padding: 24, display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}>
        <div>${seats}
          <PassSelector />
        </div>
        <aside>
          <Cart />
          <Checkout />
        </aside>
      </section>
    </main>
  );
}
`;
}

async function insertMany(db: pg.PoolClient, table: string, columns: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const params: unknown[] = [];
    const values = chunk.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(', ')})`);
    await db.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}`, params);
  }
}

interface GenTicket { kind: 'seat' | 'pass'; seat?: SeatRow; passId?: string; price: number }
interface GenOrder { tenantId: string; ev: EventDef; email: string; createdAt: Date; items: GenTicket[] }

export async function seedIfEmpty(): Promise<boolean> {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM tenants');
  if (rows[0].n > 0) return false;

  const r = rng(20261124);
  const venueById = new Map(VENUES.map((v) => [v.id, v]));
  const tenantById = new Map(TENANTS.map((t) => [t.id, t]));

  await withTransaction(async (db) => {
    // Promotores, dominios y recintos
    await insertMany(db, 'tenants', ['id', 'slug', 'name', 'admin_token', 'email_provider', 'email_from', 'email_config'],
      TENANTS.map((t) => [t.id, t.slug, t.name, `${t.slug.split('-')[1]}-dev-token`, t.emailProvider, t.emailFrom, JSON.stringify(t.emailConfig)]));
    await insertMany(db, 'domains', ['host', 'tenant_id'], TENANTS.map((t) => [t.host, t.id]));
    await insertMany(db, 'venues', ['id', 'tenant_id', 'name', 'city', 'capacity', 'accessible_seats'],
      VENUES.map((v) => [v.id, v.tenantId, v.name, v.city, seatsOf(v).length + v.standingCapacity, v.accessibleSeats]));

    // Eventos, tipos de pase y butacas
    const orders: GenOrder[] = [];
    for (const ev of EVENTS) {
      const venue = venueById.get(ev.venueId)!;
      const tenant = tenantById.get(venue.tenantId)!;
      const page = ev.page ? await seedFile(ev.page) : defaultPage(ev, tenant);
      await db.query(
        `INSERT INTO events (id, tenant_id, title, venue, venue_id, city, category, status, starts_at, page_tsx, fee_cents, commission_bps)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 750)`,
        [ev.id, tenant.id, ev.title, `${venue.name}, ${venue.city}`, venue.id, venue.city, ev.category, ev.status, ev.startsAt, page, ev.feeCents],
      );
      if (ev.passes.length) {
        await insertMany(db, 'pass_types', ['id', 'event_id', 'name', 'description', 'price_cents', 'capacity'],
          ev.passes.map((p) => [`${ev.id}-${p.code}`, ev.id, p.name, p.description, p.priceCents, p.capacity]));
      }
      const seats = ev.seated ? seatsOf(venue) : [];
      if (seats.length) {
        await insertMany(db, 'seats', ['event_id', 'id', 'zone', 'row_label', 'number', 'price_cents'],
          seats.map((s) => [ev.id, s.id, s.zone, s.row, s.number, s.price]));
      }

      // Qué se vende: una parte del aforo según la demanda del evento
      const reserved = ev.id === 'EV-FARO-0042' ? new Set(['F-12', 'F-13']) : new Set<string>();
      const tickets: GenTicket[] = [];
      const sellSeats = r.shuffle(seats.filter((s) => !reserved.has(s.id))).slice(0, Math.floor((seats.length - reserved.size) * ev.demand));
      for (const s of sellSeats) tickets.push({ kind: 'seat', seat: s, price: s.price });
      for (const p of ev.passes) {
        const sold = Math.floor(p.capacity * ev.demand) - (ev.id === 'EV-FARO-0042' && p.code === 'VIP' ? 1 : 0);
        for (let i = 0; i < sold; i++) tickets.push({ kind: 'pass', passId: `${ev.id}-${p.code}`, price: p.priceCents });
      }

      // Se agrupan en pedidos de 1 a 4 entradas (hasta 6 en el festival)
      const onSale = new Date(Math.min(new Date(ev.startsAt).getTime() - 75 * DAY, SEED_NOW.getTime() - 30 * DAY));
      const until = Math.min(new Date(ev.startsAt).getTime() - 3_600_000, SEED_NOW.getTime());
      const max = ev.category === 'festival' ? 6 : 4;
      r.shuffle(tickets);
      for (let i = 0; i < tickets.length;) {
        const n = Math.min(r.int(1, max), 10);
        const items = tickets.slice(i, i + n);
        i += n;
        const email = `${r.pick(FIRST_NAMES)}.${r.pick(LAST_NAMES)}${r.chance(0.3) ? r.int(1, 99) : ''}@${r.pick(EMAIL_DOMAINS)}`;
        const createdAt = new Date(onSale.getTime() + r.next() * (until - onSale.getTime()));
        orders.push({ tenantId: tenant.id, ev, email, createdAt, items });
      }
    }

    // El pedido que recorre el curso: dos butacas de platea y un pase VIP de Jazz en el Faro, ya pagado
    const jazz = EVENTS.find((e) => e.id === 'EV-FARO-0042')!;
    const canonical: GenOrder = {
      tenantId: 'TN-FARO', ev: jazz, email: 'ana.compradora@ejemplo.test', createdAt: new Date('2026-10-02T18:41:00+02:00'),
      items: [
        { kind: 'seat', seat: { id: 'F-12', zone: 'platea', row: 'F', number: 12, price: 3550 }, price: 3550 },
        { kind: 'seat', seat: { id: 'F-13', zone: 'platea', row: 'F', number: 13, price: 3550 }, price: 3550 },
        { kind: 'pass', passId: 'EV-FARO-0042-VIP', price: 6000 },
      ],
    };

    orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const orderRows: unknown[][] = [];
    const ticketRows: unknown[][] = [];
    const refundRows: unknown[][] = [];
    const emailRows: unknown[][] = [];
    const paidOrders: { id: string; tenantId: string; email: string }[] = [];
    let seq = 0;

    const addOrder = (o: GenOrder, id: string, forceStatus?: 'paid') => {
      const priced: PricedItem[] = o.items.map((t) => ({ kind: t.kind, ref: t.seat?.id ?? t.passId!, price_cents: t.price }));
      const a = calcOrderAmounts(priced, { fee_cents: o.ev.feeCents, commission_bps: 750 });
      const failed = !forceStatus && r.chance(0.06);
      const started = new Date(o.ev.startsAt) < SEED_NOW;
      const tenant = tenantById.get(o.tenantId)!;
      const lines = o.items.map((t, i) => ({ id: `${id}-${i + 1}`, t, line: a.lines[i]! }));

      // Reembolsos: todo en eventos cancelados; parte en aplazados; alguna petición del cliente en eventos futuros
      let reason: RefundReason | null = null;
      let refunded = lines;
      if (!failed && !forceStatus) {
        if (o.ev.status === 'cancelled') reason = 'cancelación';
        else if (o.ev.status === 'postponed' && r.chance(0.3)) reason = 'aplazamiento';
        else if (!started && r.chance(0.06)) {
          reason = 'petición del cliente';
          if (lines.length > 1) refunded = lines.slice(0, r.int(1, lines.length - 1));
        }
      }
      const refundedIds = new Set(refunded.map((l) => l.id));
      const refundAmount = reason ? calcRefund(refunded.map((l) => ({ id: l.id, price_cents: l.line.price_cents, fee_cents: l.line.fee_cents })), reason) : 0;
      const status = failed ? 'failed' : !reason ? 'paid' : refunded.length === lines.length ? 'refunded' : 'partially_refunded';
      const paidAt = failed ? null : new Date(o.createdAt.getTime() + r.int(40, 400) * 1000);

      orderRows.push([id, o.tenantId, o.ev.id, o.email, status, a.subtotal_cents, a.fee_cents, a.total_cents, a.commission_cents,
        failed ? null : `ch_seed_${id.slice(-4)}`, o.createdAt, paidAt, refundAmount]);
      for (const { id: tid, t, line } of lines) {
        const tStatus = failed ? 'void' : reason && refundedIds.has(tid) ? 'refunded' : 'valid';
        const checkedIn = tStatus === 'valid' && started && r.chance(0.85)
          ? new Date(new Date(o.ev.startsAt).getTime() - r.int(5, 90) * 60_000) : null;
        ticketRows.push([tid, id, o.ev.id, t.kind, t.seat?.id ?? null, t.passId ?? null, line.price_cents, line.fee_cents,
          line.commission_cents, tStatus, tStatus === 'valid' ? createQrToken(tid, config.ticketsSecret) : null, checkedIn]);
      }
      if (reason) {
        const at = new Date(Math.min(SEED_NOW.getTime() - DAY, paidAt!.getTime() + r.int(1, 20) * DAY));
        refundRows.push([`RE-${id}-1`, id, refundAmount, reason, [...refundedIds], at]);
      }
      if (paidAt) {
        // Mismo asunto que el notifier. Si no cabe en email_log.subject, el registro falla (y el correo se reenvía)
        const subject = `Tus entradas para ${o.ev.title} — ${id}`;
        if (subject.length <= 80) emailRows.push([o.tenantId, tenant.emailProvider, o.email, subject, `seed-${id}`, paidAt]);
        if (status === 'paid') paidOrders.push({ id, tenantId: o.tenantId, email: o.email });
      }
    };

    let canonicalDone = false;
    for (const o of orders) {
      if (!canonicalDone && o.createdAt > canonical.createdAt) {
        addOrder(canonical, 'PED-2026-0107', 'paid');
        canonicalDone = true;
        seq = Math.max(seq, 107);
      }
      seq += 1;
      if (seq === 107) seq += 1;
      addOrder(o, `PED-2026-${String(seq).padStart(4, '0')}`);
    }

    await insertMany(db, 'orders', ['id', 'tenant_id', 'event_id', 'buyer_email', 'status', 'subtotal_cents', 'fee_cents',
      'total_cents', 'commission_cents', 'charge_id', 'created_at', 'paid_at', 'refunded_cents'], orderRows);
    await insertMany(db, 'tickets', ['id', 'order_id', 'event_id', 'kind', 'seat_id', 'pass_type_id', 'price_cents', 'fee_cents',
      'commission_cents', 'status', 'qr_token', 'checked_in_at'], ticketRows);
    await insertMany(db, 'refunds', ['id', 'order_id', 'amount_cents', 'reason', 'ticket_ids', 'created_at'], refundRows);
    await insertMany(db, 'email_log', ['tenant_id', 'provider', 'to_address', 'subject', 'job_id', 'sent_at'], emailRows);
    await db.query(`SELECT setval('order_number_seq', $1)`, [seq + 1]);

    // Incidencias de clientes
    const cases: unknown[][] = [];
    for (let i = 1; i <= 48; i++) {
      const tpl = CASE_TEMPLATES[(i * 7) % CASE_TEMPLATES.length]!;
      const o = r.pick(paidOrders);
      const status = r.pick(['abierta', 'abierta', 'en curso', 'resuelta', 'resuelta']);
      const at = new Date(SEED_NOW.getTime() - r.int(1, 45) * DAY);
      cases.push([`INC-${String(i).padStart(4, '0')}`, o.tenantId, o.id, o.email, tpl.category, status, tpl.subject, tpl.body, at]);
    }
    await insertMany(db, 'support_cases', ['id', 'tenant_id', 'order_id', 'buyer_email', 'category', 'status', 'subject', 'body', 'created_at'], cases);
  });
  return true;
}
