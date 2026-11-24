import { formatDate, formatEuros } from '@teatralia/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { admin } from './api.js';

const STATUS_LABEL: Record<string, string> = {
  on_sale: 'a la venta', sold_out: 'agotado', cancelled: 'cancelado', postponed: 'aplazado',
  paid: 'pagado', failed: 'fallido', pending: 'pendiente', refunded: 'reembolsado', partially_refunded: 'reembolso parcial',
  valid: 'válida', void: 'anulada',
};
const label = (s: string) => STATUS_LABEL[s] ?? s;

function useAdmin<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => admin<T>(path).then(setData, (e: Error) => setError(e.message));
  useEffect(() => {
    void reload();
  }, [path]);
  return { data, error, reload };
}

interface Stat {
  id: string; title: string; city: string; category: string; status: string; starts_at: string;
  venue: string | null; capacity: number | null; sold: number; gross_cents: number; refunded_cents: number;
}

export function Dashboard() {
  const { data, error } = useAdmin<Stat[]>('/stats');
  const totals = (data ?? []).reduce(
    (a, s) => ({ sold: a.sold + s.sold, gross: a.gross + s.gross_cents, refunded: a.refunded + s.refunded_cents }),
    { sold: 0, gross: 0, refunded: 0 },
  );
  return (
    <section className="card">
      <h2>Panel de ventas</h2>
      {error && <p role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 24, margin: '12px 0 20px' }}>
        <Tile title="Entradas válidas" value={String(totals.sold)} />
        <Tile title="Ventas brutas" value={formatEuros(totals.gross)} />
        <Tile title="Reembolsado" value={formatEuros(totals.refunded)} />
        <Tile title="Neto" value={formatEuros(totals.gross - totals.refunded)} />
      </div>
      <table>
        <thead><tr><th>Evento</th><th>Fecha</th><th>Estado</th><th>Ocupación</th><th>Bruto</th><th>Reembolsado</th></tr></thead>
        <tbody>
          {data?.map((s) => {
            const pct = s.capacity ? Math.round((s.sold / s.capacity) * 100) : 0;
            return (
              <tr key={s.id}>
                <td><strong>{s.title}</strong><br /><small>{s.id} · {s.venue} · {s.category}</small></td>
                <td>{formatDate(s.starts_at)}</td>
                <td>{label(s.status)}</td>
                <td>
                  <div style={{ background: '#eee', width: 120, height: 8, borderRadius: 4 }}>
                    <div style={{ background: '#1d1d1f', width: `${Math.min(pct, 100)}%`, height: 8, borderRadius: 4 }} />
                  </div>
                  <small>{s.sold} / {s.capacity ?? '—'} ({pct} %)</small>
                </td>
                <td>{formatEuros(s.gross_cents)}</td>
                <td>{formatEuros(s.refunded_cents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Tile({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '12px 16px', minWidth: 150 }}>
      <small>{title}</small>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

interface OrderRow {
  id: string; event_id: string; buyer_email: string; status: string; total_cents: number;
  refunded_cents: number; created_at: string; tickets: number;
}

export function OrderSearch() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (query) params.set('q', query);
  const { data, error } = useAdmin<OrderRow[]>(`/orders?${params}`);
  const search = (e: FormEvent) => {
    e.preventDefault();
    setQuery(q);
  };
  return (
    <section className="card">
      <h2>Pedidos</h2>
      <form onSubmit={search} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input placeholder="Email o número de pedido" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {['paid', 'partially_refunded', 'refunded', 'failed'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <button>Buscar</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead><tr><th>Pedido</th><th>Comprador</th><th>Estado</th><th>Entradas</th><th>Total</th><th>Reembolsado</th><th>Fecha</th></tr></thead>
        <tbody>
          {data?.map((o) => (
            <tr key={o.id}>
              <td><a href={`#/pedidos/${o.id}`}>{o.id}</a><br /><small>{o.event_id}</small></td>
              <td>{o.buyer_email}</td>
              <td>{label(o.status)}</td>
              <td>{o.tickets}</td>
              <td>{formatEuros(o.total_cents)}</td>
              <td>{o.refunded_cents ? formatEuros(o.refunded_cents) : '—'}</td>
              <td>{new Date(o.created_at).toLocaleString('es-ES')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface OrderDetail extends Omit<OrderRow, 'tickets'> {
  event_title: string; starts_at: string; subtotal_cents: number; fee_cents: number;
  tickets: DetailTicket[];
  refunds: { id: string; amount_cents: number; reason: string; ticket_ids: string[]; created_at: string }[];
}
interface DetailTicket { id: string; kind: string; seat_id: string | null; pass_type_id: string | null; price_cents: number; fee_cents: number; status: string }

export function OrderView({ orderId }: { orderId: string }) {
  const { data, error, reload } = useAdmin<OrderDetail>(`/orders/${orderId}`);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('petición del cliente');
  const [msg, setMsg] = useState<string | null>(null);
  const doRefund = async () => {
    setMsg(null);
    try {
      const r = await admin<{ id: string; amount_cents: number }>(`/orders/${orderId}/refunds`, {
        method: 'POST',
        body: JSON.stringify({ reason, ticket_ids: selected }),
      });
      setMsg(`Reembolso ${r.id}: ${formatEuros(r.amount_cents)}`);
      setSelected([]);
      void reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  if (error) return <p role="alert">{error}</p>;
  if (!data) return null;
  return (
    <section className="card">
      <p><a href="#/pedidos">← Pedidos</a></p>
      <h2>{data.id} · {label(data.status)}</h2>
      <p>{data.event_title} · {formatDate(data.starts_at)} · {data.buyer_email}</p>
      <p>Subtotal {formatEuros(data.subtotal_cents)} · gastos {formatEuros(data.fee_cents)} · <strong>total {formatEuros(data.total_cents)}</strong> · reembolsado {formatEuros(data.refunded_cents)}</p>
      <table>
        <thead><tr><th></th><th>Entrada</th><th>Butaca o pase</th><th>Precio</th><th>Gastos</th><th>Estado</th></tr></thead>
        <tbody>
          {data.tickets.map((t) => (
            <tr key={t.id}>
              <td>
                <input type="checkbox" disabled={t.status !== 'valid'} checked={selected.includes(t.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, t.id] : selected.filter((x) => x !== t.id))} />
              </td>
              <td>{t.id}</td>
              <td>{t.seat_id ?? t.pass_type_id}</td>
              <td>{formatEuros(t.price_cents)}</td>
              <td>{formatEuros(t.fee_cents)}</td>
              <td>{label(t.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {['petición del cliente', 'aplazamiento', 'cancelación', 'doble cobro'].map((r) => <option key={r}>{r}</option>)}
        </select>
        <button onClick={doRefund}>Reembolsar {selected.length ? `${selected.length} entradas` : 'todo el pedido'}</button>
      </div>
      {msg && <p role="status">{msg}</p>}
      {data.refunds.length > 0 && (
        <>
          <h3>Reembolsos</h3>
          <ul>
            {data.refunds.map((r) => (
              <li key={r.id}>{r.id} · {r.reason} · {formatEuros(r.amount_cents)} · {r.ticket_ids.join(', ')}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface Case { id: string; order_id: string | null; buyer_email: string; category: string; status: string; subject: string; body: string; created_at: string }

export function Cases() {
  const [status, setStatus] = useState('');
  const { data, error } = useAdmin<Case[]>(`/cases${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  return (
    <section className="card">
      <h2>Incidencias de clientes</h2>
      <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ marginBottom: 12 }}>
        <option value="">Todas</option>
        {['abierta', 'en curso', 'resuelta'].map((s) => <option key={s}>{s}</option>)}
      </select>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead><tr><th>Incidencia</th><th>Categoría</th><th>Estado</th><th>Asunto</th><th>Pedido</th><th>Fecha</th></tr></thead>
        <tbody>
          {data?.map((c) => (
            <tr key={c.id}>
              <td>{c.id}<br /><small>{c.buyer_email}</small></td>
              <td>{c.category}</td>
              <td>{c.status}</td>
              <td title={c.body}>{c.subject}</td>
              <td>{c.order_id ? <a href={`#/pedidos/${c.order_id}`}>{c.order_id}</a> : '—'}</td>
              <td>{new Date(c.created_at).toLocaleDateString('es-ES')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
