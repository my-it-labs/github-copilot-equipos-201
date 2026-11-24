// Reembolsos de pedidos. La política de negocio está en docs/politica-devoluciones.md.
import { pool, withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { refund as gatewayRefund } from './payments-client.js';

export const REFUND_REASONS = ['cancelación', 'aplazamiento', 'petición del cliente', 'doble cobro'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export interface RefundableTicket {
  id: string;
  price_cents: number;
  fee_cents: number;
}

// Importe que se devuelve por un conjunto de entradas de un pedido.
export function calcRefund(tickets: RefundableTicket[], reason: RefundReason): number {
  let total = 0;
  for (const t of tickets) {
    if (reason === 'cancelación' || reason === 'aplazamiento') {
      total += t.price_cents + t.fee_cents;
    } else if (reason === 'petición del cliente') {
      // penalización del 10 %
      total += Math.floor(t.price_cents * 0.9);
    } else {
      total += t.price_cents + t.fee_cents;
    }
  }
  return total;
}

// Horas antes del evento a partir de las cuales el cliente ya no puede pedir la devolución
export const CUSTOMER_REFUND_DEADLINE_HOURS = 48;

export async function refundOrder(tenantId: string, orderId: string, reason: RefundReason, ticketIds?: string[]) {
  if (!REFUND_REASONS.includes(reason)) throw new HttpError(400, 'motivo de reembolso no válido');
  const o = await pool.query(
    `SELECT o.id, o.status, o.charge_id, o.total_cents, o.refunded_cents, e.starts_at
       FROM orders o JOIN events e ON e.id = o.event_id
      WHERE o.id = $1 AND o.tenant_id = $2`,
    [orderId, tenantId],
  );
  const order = o.rows[0];
  if (!order) throw new HttpError(404, 'pedido no encontrado');
  if (order.status !== 'paid' && order.status !== 'partially_refunded') {
    throw new HttpError(409, `no se puede reembolsar un pedido ${order.status}`);
  }
  if (reason === 'petición del cliente') {
    const hours = (new Date(order.starts_at).getTime() - Date.now()) / 3_600_000;
    if (hours < CUSTOMER_REFUND_DEADLINE_HOURS) throw new HttpError(409, 'fuera de plazo de devolución');
  }

  const t = await pool.query<RefundableTicket>(
    `SELECT id, price_cents, fee_cents FROM tickets WHERE order_id = $1 AND status = 'valid' ORDER BY id`,
    [orderId],
  );
  const selected = ticketIds?.length ? t.rows.filter((x) => ticketIds.includes(x.id)) : t.rows;
  if (selected.length === 0) throw new HttpError(400, 'no hay entradas válidas que reembolsar');

  const amount = calcRefund(selected, reason);
  const result = await gatewayRefund(order.charge_id, amount);
  const all = selected.length === t.rows.length;

  return withTransaction(async (db) => {
    const n = await db.query(`SELECT count(*)::int AS n FROM refunds WHERE order_id = $1`, [orderId]);
    const refundId = `RE-${orderId}-${n.rows[0].n + 1}`;
    await db.query(
      `INSERT INTO refunds (id, order_id, amount_cents, reason, ticket_ids) VALUES ($1, $2, $3, $4, $5)`,
      [refundId, orderId, amount, reason, selected.map((x) => x.id)],
    );
    await db.query(`UPDATE tickets SET status = 'refunded' WHERE id = ANY($1)`, [selected.map((x) => x.id)]);
    await db.query(
      `UPDATE orders SET refunded_cents = refunded_cents + $2, status = $3 WHERE id = $1`,
      [orderId, amount, all ? 'refunded' : 'partially_refunded'],
    );
    return { id: refundId, order_id: orderId, amount_cents: amount, reason, gateway_id: result.id, tickets: selected.map((x) => x.id) };
  });
}
