#!/usr/bin/env bash
# Crea un repositorio git aparte con un historial de Teatralia: 12 commits y tres versiones
# (v1.3.0, v1.4.0 y v1.5.0). Lo usan los laboratorios de M04 «regresión con git bisect» y
# «notas de versión». No toca teatralia/ ni el repositorio del curso.
#
#   scripts/m04-regresion.sh                 → crea /tmp/teatralia-historial
#   scripts/m04-regresion.sh /otra/carpeta   → lo crea en otra carpeta
#
# Cada ejecución borra la carpeta y la vuelve a crear igual: mismos ficheros, fechas, autores
# y, por tanto, los mismos identificadores de commit.
set -euo pipefail

DEST=${1:-/tmp/teatralia-historial}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
MODULOS="$RAIZ/teatralia/node_modules"

if [ ! -d "$MODULOS" ]; then
  echo "Falta $MODULOS. Instala las dependencias de Teatralia con: make setup" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cd "$DEST"
git init -q -b main
git config user.name "Equipo Plataforma"
git config user.email "plataforma@teatralia.test"
git config commit.gpgsign false
git config tag.gpgsign false
printf 'node_modules\n' > .gitignore
# Las dependencias (vitest, tsx) son las de Teatralia: no hace falta instalar nada
ln -s "$MODULOS" node_modules

# commit FECHA "AUTOR <correo>" "mensaje"  → añade todo y hace el commit con fecha y autor fijos
commit() {
  git add -A
  GIT_AUTHOR_DATE="$1T10:00:00+0200" GIT_COMMITTER_DATE="$1T10:00:00+0200" \
    git commit -q --author="$2" -m "$3"
}

# etiqueta VERSIÓN FECHA → etiqueta anotada de la versión publicada ese día
etiqueta() {
  GIT_COMMITTER_DATE="$2T18:00:00+0200" git tag -a "$1" -m "Teatralia ${1#v}"
}

MARTA="Marta Ruiz <marta.ruiz@teatralia.test>"
IKER="Iker Etxeberria <iker.etxeberria@teatralia.test>"
PAULA="Paula Gómez <paula.gomez@teatralia.test>"
DIEGO="Diego Santos <diego.santos@teatralia.test>"

mkdir -p services/api/src/orders services/api/src/events services/api/src/reports services/api/test \
  services/notifier/src docs

# ── 1 ───────────────────────────────────────────────────────────────────────────────────────
cat > package.json <<'EOF'
{
  "name": "teatralia-historial",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^5.0.4" }
}
EOF
cat > README.md <<'EOF'
# Teatralia · servicio de pedidos

Cálculo de importes, devoluciones y correos de los pedidos de Teatralia.
Importes en céntimos. Tests: `npm test`.
EOF
commit 2026-09-01 "$MARTA" "chore: estructura del servicio de pedidos"

# ── 2 ───────────────────────────────────────────────────────────────────────────────────────
cat > services/api/src/orders/pricing.ts <<'EOF'
// Cálculo de importes de un pedido.

export interface PricedItem {
  kind: 'seat' | 'pass';
  ref: string;
  price_cents: number;
}

export interface EventPricing {
  fee_cents: number;
  commission_bps: number;
}

export interface TicketAmounts {
  price_cents: number;
  fee_cents: number;
  commission_cents: number;
}

export interface OrderAmounts {
  subtotal_cents: number;
  fee_cents: number;
  total_cents: number;
  commission_cents: number;
  lines: TicketAmounts[];
}

export function calcOrderAmounts(items: PricedItem[], ev: EventPricing): OrderAmounts {
  let sub = 0;
  let fees = 0;
  let com = 0;
  const lines: TicketAmounts[] = [];
  for (const it of items) {
    const p = it.price_cents;
    if (p < 0) throw new Error('precio negativo en ' + it.ref);
    // gastos por entrada, salvo invitaciones (precio 0)
    const f = p > 0 ? ev.fee_cents : 0;
    // comisión de plataforma: bps sobre el precio, redondeo por entrada
    const c = p > 0 ? Math.round((p * ev.commission_bps) / 10000) : 0;
    sub += p;
    fees += f;
    com += c;
    lines.push({ price_cents: p, fee_cents: f, commission_cents: c });
  }
  if (lines.length > 10) throw new Error('máximo 10 entradas por pedido');
  if (lines.length === 0) throw new Error('pedido vacío');
  return { subtotal_cents: sub, fee_cents: fees, total_cents: sub + fees, commission_cents: com, lines };
}
EOF
cat > services/api/src/orders/refunds.ts <<'EOF'
// Importe que se devuelve por un conjunto de entradas de un pedido.
export type RefundReason = 'cancelación' | 'aplazamiento' | 'petición del cliente' | 'doble cobro';

export interface RefundableTicket {
  id: string;
  price_cents: number;
  fee_cents: number;
}

export function calcRefund(tickets: RefundableTicket[], reason: RefundReason): number {
  let total = 0;
  for (const t of tickets) {
    if (reason === 'petición del cliente') {
      // penalización del 10 %
      total += Math.floor(t.price_cents * 0.9);
    } else {
      total += t.price_cents + t.fee_cents;
    }
  }
  return total;
}
EOF
cat > services/api/test/pricing.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { calcOrderAmounts } from '../src/orders/pricing.js';

const faro = { fee_cents: 90, commission_bps: 750 };

describe('calcOrderAmounts', () => {
  it('suma precio y gastos de gestión por entrada', () => {
    const r = calcOrderAmounts(
      [
        { kind: 'seat', ref: 'F-12', price_cents: 3550 },
        { kind: 'seat', ref: 'F-13', price_cents: 3550 },
        { kind: 'pass', ref: 'EV-FARO-0042-VIP', price_cents: 6000 },
      ],
      faro,
    );
    expect(r.subtotal_cents).toBe(13100);
    expect(r.fee_cents).toBe(270);
    expect(r.total_cents).toBe(13370);
  });

  it('calcula la comisión de plataforma', () => {
    const r = calcOrderAmounts([{ kind: 'pass', ref: 'VIP', price_cents: 6000 }], faro);
    expect(r.commission_cents).toBe(450);
  });

  it('las invitaciones no pagan gastos ni comisión', () => {
    const r = calcOrderAmounts([{ kind: 'seat', ref: 'A-1', price_cents: 0 }], faro);
    expect(r.total_cents).toBe(0);
    expect(r.commission_cents).toBe(0);
  });

  it('rechaza más de 10 entradas', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ kind: 'seat' as const, ref: `A-${i + 1}`, price_cents: 2500 }));
    expect(() => calcOrderAmounts(items, faro)).toThrow('máximo 10');
  });
});
EOF
commit 2026-09-03 "$MARTA" "feat(precios): importes del pedido con gastos de gestión y comisión"
etiqueta v1.3.0 2026-09-03

# ── 3 ───────────────────────────────────────────────────────────────────────────────────────
cat > services/api/src/orders/pricing.ts <<'EOF'
// Cálculo de importes de un pedido.

export interface PricedItem {
  kind: 'seat' | 'pass';
  ref: string;
  price_cents: number;
}

export interface EventPricing {
  fee_cents: number;
  commission_bps: number;
}

export interface TicketAmounts {
  price_cents: number;
  fee_cents: number;
  commission_cents: number;
}

// Código de descuento del promotor (TEA-104): un porcentaje sobre el precio de las entradas
export interface Discount {
  code: string;
  percent: number;
}

export interface OrderAmounts {
  subtotal_cents: number;
  discount_cents: number;
  fee_cents: number;
  total_cents: number;
  commission_cents: number;
  lines: TicketAmounts[];
}

export function calcOrderAmounts(items: PricedItem[], ev: EventPricing, discount?: Discount): OrderAmounts {
  let sub = 0;
  let fees = 0;
  let com = 0;
  const lines: TicketAmounts[] = [];
  for (const it of items) {
    const p = it.price_cents;
    if (p < 0) throw new Error('precio negativo en ' + it.ref);
    // gastos por entrada, salvo invitaciones (precio 0)
    const f = p > 0 ? ev.fee_cents : 0;
    // comisión de plataforma: bps sobre el precio, redondeo por entrada
    const c = p > 0 ? Math.round((p * ev.commission_bps) / 10000) : 0;
    sub += p;
    fees += f;
    com += c;
    lines.push({ price_cents: p, fee_cents: f, commission_cents: c });
  }
  if (lines.length > 10) throw new Error('máximo 10 entradas por pedido');
  if (lines.length === 0) throw new Error('pedido vacío');
  // el descuento se aplica al precio de las entradas; los gastos de gestión no se descuentan
  const desc = discount ? Math.round((sub * discount.percent) / 100) : 0;
  return {
    subtotal_cents: sub,
    discount_cents: desc,
    fee_cents: fees,
    total_cents: sub - desc + fees,
    commission_cents: com,
    lines,
  };
}
EOF
commit 2026-09-15 "$IKER" "feat(descuentos): códigos de descuento por porcentaje en el pedido (TEA-104)"

# ── 4 ───────────────────────────────────────────────────────────────────────────────────────
cat >> README.md <<'EOF'

## Códigos de descuento

El promotor crea códigos (por ejemplo `OTONO10`, un 10 %). El descuento se aplica al precio
de las entradas; los gastos de gestión se cobran enteros.
EOF
commit 2026-09-16 "$IKER" "docs: cómo se aplican los códigos de descuento"
etiqueta v1.4.0 2026-09-16

# ── 5 ───────────────────────────────────────────────────────────────────────────────────────
cat > services/notifier/src/templates.ts <<'EOF'
// Asunto del correo de confirmación de compra
export function confirmationSubject(eventTitle: string, orderId: string): string {
  return `Tus entradas para ${eventTitle} — ${orderId}`;
}
EOF
commit 2026-09-22 "$PAULA" "feat(correo): el asunto de la confirmación lleva el número de pedido"

# ── 6 ───────────────────────────────────────────────────────────────────────────────────────
cat > services/notifier/src/templates.ts <<'EOF'
// Asunto del correo de confirmación de compra.
// email_log.subject es varchar(80): se recorta el título, nunca el número de pedido.
export const SUBJECT_MAX = 80;

export function confirmationSubject(eventTitle: string, orderId: string): string {
  const room = SUBJECT_MAX - `Tus entradas para  — ${orderId}`.length;
  const title = eventTitle.length > room ? eventTitle.slice(0, room - 1).trimEnd() + '…' : eventTitle;
  return `Tus entradas para ${title} — ${orderId}`;
}
EOF
commit 2026-09-29 "$PAULA" "fix(correo): recortar el asunto a 80 caracteres para que no se repita el envío (TEA-107)"

# ── 7 ───────────────────────────────────────────────────────────────────────────────────────
cat > services/api/src/reports/sales-csv.ts <<'EOF'
// Exportación de ventas por evento para el backoffice del promotor (TEA-111)
export interface SaleRow {
  order_id: string;
  buyer_email: string;
  tickets: number;
  total_cents: number;
}

export function salesCsv(rows: SaleRow[]): string {
  const head = 'pedido;email;entradas;total_eur';
  const body = rows.map((r) => [r.order_id, r.buyer_email, r.tickets, (r.total_cents / 100).toFixed(2).replace('.', ',')].join(';'));
  return [head, ...body].join('\n') + '\n';
}
EOF
commit 2026-10-06 "$DIEGO" "feat(backoffice): exportar las ventas de un evento a CSV (TEA-111)"

# ── 8 ───────────────────────────────────────────────────────────────────────────────────────
cat > services/api/src/orders/pricing.ts <<'EOF'
// Cálculo de importes de un pedido.

export interface PricedItem {
  kind: 'seat' | 'pass';
  ref: string;
  price_cents: number;
}

export interface EventPricing {
  fee_cents: number;
  commission_bps: number;
}

export interface TicketAmounts {
  price_cents: number;
  fee_cents: number;
  commission_cents: number;
}

// Código de descuento del promotor (TEA-104): un porcentaje sobre el precio de las entradas
export interface Discount {
  code: string;
  percent: number;
}

export interface OrderAmounts {
  subtotal_cents: number;
  discount_cents: number;
  fee_cents: number;
  total_cents: number;
  commission_cents: number;
  lines: TicketAmounts[];
}

const MAX_TICKETS = 10; // antirreventa

// Importes de una entrada: las invitaciones (precio 0) no pagan gastos ni comisión
function lineAmounts(it: PricedItem, ev: EventPricing): TicketAmounts {
  if (it.price_cents < 0) throw new Error('precio negativo en ' + it.ref);
  if (it.price_cents === 0) return { price_cents: 0, fee_cents: 0, commission_cents: 0 };
  return {
    price_cents: it.price_cents,
    fee_cents: ev.fee_cents,
    commission_cents: Math.round((it.price_cents * ev.commission_bps) / 10000),
  };
}

const sum = (lines: TicketAmounts[], key: keyof TicketAmounts) => lines.reduce((s, l) => s + l[key], 0);

export function calcOrderAmounts(items: PricedItem[], ev: EventPricing, discount?: Discount): OrderAmounts {
  const lines = items.map((it) => lineAmounts(it, ev));
  if (lines.length > MAX_TICKETS) throw new Error('máximo 10 entradas por pedido');
  if (lines.length === 0) throw new Error('pedido vacío');
  const subtotal = sum(lines, 'price_cents');
  const fees = sum(lines, 'fee_cents');
  const discount_cents = discount ? Math.round((subtotal * discount.percent) / 100) : 0;
  return {
    subtotal_cents: subtotal,
    discount_cents,
    fee_cents: fees,
    total_cents: subtotal + fees,
    commission_cents: sum(lines, 'commission_cents'),
    lines,
  };
}
EOF
commit 2026-10-08 "$MARTA" "refactor(precios): extraer el cálculo de cada línea del pedido"

# ── 9 ───────────────────────────────────────────────────────────────────────────────────────
cat > services/api/src/orders/refunds.ts <<'EOF'
// Importe que se devuelve por un conjunto de entradas de un pedido (docs/politica-devoluciones.md)
export type RefundReason = 'cancelación' | 'aplazamiento' | 'petición del cliente' | 'doble cobro';

export interface RefundableTicket {
  id: string;
  price_cents: number;
  fee_cents: number;
}

export function calcRefund(tickets: RefundableTicket[], reason: RefundReason): number {
  const price = tickets.reduce((s, t) => s + t.price_cents, 0);
  const fees = tickets.reduce((s, t) => s + t.fee_cents, 0);
  if (reason === 'petición del cliente') {
    // penalización del 10 % sobre el total de las entradas devueltas, redondeada al céntimo
    return Math.round((price * 9) / 10);
  }
  return price + fees;
}
EOF
cat > services/api/test/refunds.test.ts <<'EOF'
import { expect, it } from 'vitest';
import { calcRefund } from '../src/orders/refunds.js';

it('petición del cliente: dos entradas de 18,25 € → 32,85 €', () => {
  const t = [
    { id: 'A-1', price_cents: 1825, fee_cents: 100 },
    { id: 'A-2', price_cents: 1825, fee_cents: 100 },
  ];
  expect(calcRefund(t, 'petición del cliente')).toBe(3285);
});
EOF
commit 2026-10-14 "$IKER" "fix(devoluciones): la penalización del 10 % se calcula sobre el total y se redondea al céntimo (TEA-106)"

# ── 10 ──────────────────────────────────────────────────────────────────────────────────────
cat > services/api/src/events/filters.ts <<'EOF'
// Filtro de eventos de la tienda por ciudad (TEA-101). Sin distinguir mayúsculas ni tildes.
export interface PublicEvent {
  id: string;
  title: string;
  city: string;
}

const normal = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function byCity(events: PublicEvent[], city?: string): PublicEvent[] {
  if (!city) return events;
  return events.filter((e) => normal(e.city) === normal(city));
}
EOF
commit 2026-10-20 "$DIEGO" "feat(tienda): filtrar los eventos por ciudad (TEA-101)"

# ── 11 ──────────────────────────────────────────────────────────────────────────────────────
sed -i 's/"vitest": "\^5.0.4"/"vitest": "^5.0.5"/' package.json
commit 2026-10-22 "$MARTA" "chore(deps): actualizar vitest a 5.0.5"

# ── 12 ──────────────────────────────────────────────────────────────────────────────────────
cat > docs/openapi-pedidos.yaml <<'EOF'
openapi: 3.1.0
info:
  title: Teatralia · API pública de pedidos
  version: 1.5.0
paths:
  /api/public/orders:
    post:
      summary: Crear un pedido (bloquea las butacas unos minutos)
  /api/public/orders/{id}/pay:
    post:
      summary: Pagar un pedido pendiente
  /api/public/orders/{id}:
    get:
      summary: Consultar un pedido con el email del comprador
EOF
commit 2026-10-27 "$PAULA" "docs(api): especificación OpenAPI de la API pública de pedidos (TEA-112)"
etiqueta v1.5.0 2026-10-27

echo "Historial de Teatralia creado en $DEST"
git log --oneline --decorate
