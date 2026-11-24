import { config } from '../config.js';

export interface ChargeResult {
  id: string;
  status: 'approved' | 'declined';
  reason?: string;
}

// Cliente de la pasarela. En el curso es services/payments (emulada).
export async function charge(amountCents: number, card: string, reference: string): Promise<ChargeResult> {
  const res = await fetch(`${config.paymentsUrl}/charges`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amount_cents: amountCents, card, reference }),
  });
  if (!res.ok && res.status !== 402) {
    throw new Error(`pasarela: HTTP ${res.status}`);
  }
  return (await res.json()) as ChargeResult;
}

export interface RefundResult {
  id: string;
  amount_cents: number;
}

// Devuelve parte o todo un cargo. Los pedidos importados de la v1 (charge_id ch_seed_…) se cobraron con la
// pasarela antigua, que ya no existe: su reembolso se registra en Teatralia y finanzas lo hace a mano.
export async function refund(chargeId: string, amountCents: number): Promise<RefundResult> {
  if (chargeId.startsWith('ch_seed_')) return { id: `manual_${chargeId}`, amount_cents: amountCents };
  const res = await fetch(`${config.paymentsUrl}/refunds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ charge_id: chargeId, amount_cents: amountCents }),
  });
  if (!res.ok) throw new Error(`pasarela: HTTP ${res.status}`);
  return (await res.json()) as RefundResult;
}
