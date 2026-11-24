-- Teatralia v2: recintos, categorías, estado del evento, reembolsos e incidencias de clientes

CREATE TABLE venues (
  id              text PRIMARY KEY,               -- VN-FARO
  tenant_id       text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  city            text NOT NULL,
  capacity        integer NOT NULL,
  accessible_seats integer NOT NULL DEFAULT 0     -- plazas para movilidad reducida
);

ALTER TABLE events
  ADD COLUMN venue_id text REFERENCES venues(id),
  ADD COLUMN city     text NOT NULL DEFAULT '',
  ADD COLUMN category text NOT NULL DEFAULT 'música', -- música | teatro | danza | humor | familiar | festival
  ADD COLUMN status   text NOT NULL DEFAULT 'on_sale'; -- on_sale | sold_out | cancelled | postponed

-- pending | paid | failed | refunded | partially_refunded
ALTER TABLE orders
  ADD COLUMN refunded_cents integer NOT NULL DEFAULT 0;

CREATE TABLE refunds (
  id           text PRIMARY KEY,                  -- RE-PED-2026-0107-1
  order_id     text NOT NULL REFERENCES orders(id),
  amount_cents integer NOT NULL,
  reason       text NOT NULL,                     -- cancelación | aplazamiento | petición del cliente | doble cobro
  ticket_ids   text[] NOT NULL DEFAULT '{}',
  created_by   text NOT NULL DEFAULT 'backoffice',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_cases (
  id          text PRIMARY KEY,                   -- INC-0001
  tenant_id   text NOT NULL REFERENCES tenants(id),
  order_id    text REFERENCES orders(id),
  buyer_email text NOT NULL,
  category    text NOT NULL,                      -- devolución | cambio de titular | acceso | cobro | accesibilidad | correo
  status      text NOT NULL DEFAULT 'abierta',    -- abierta | en curso | resuelta
  subject     text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_tenant_status ON orders (tenant_id, status);
CREATE INDEX tickets_order ON tickets (order_id);
