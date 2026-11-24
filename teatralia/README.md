# Teatralia

Plataforma SaaS de venta de entradas para promotores de espectáculos: salas de conciertos, teatros, auditorios y festivales.

## Arrancar

Desde la raíz del repositorio:

```bash
make db-reset     # base de datos con los datos de ejemplo
make up           # arranca toda la plataforma
```

- Tienda: http://localhost:5173 (cada promotor en su dominio, p. ej. http://entradas.salafaro.localhost:5173)
- Backoffice: http://localhost:5174
- API: http://localhost:8080
- Mailpit (correo de desarrollo): http://localhost:8025

## Estructura

| Carpeta | Qué es |
|---------|--------|
| `apps/storefront` | Tienda pública: eventos, butacas, compra y «mis entradas» |
| `apps/backoffice` | Panel del promotor: ventas, eventos, pedidos, reembolsos, incidencias, dominios y correo |
| `apps/editor-mfe` | Editor de la página de cada evento (microfrontend) |
| `services/api` | API REST (Fastify + PostgreSQL): pedidos, precios, reembolsos, promotores |
| `services/payments` | Pasarela de pagos emulada |
| `services/notifier` | Envío de correos desde una cola (BullMQ + Redis) |
| `packages/ui` | Componentes de la tienda (selector de butacas, carrito, checkout) |
| `docs/` | Política de devoluciones y backlog de peticiones |

## Datos de ejemplo

`make db-reset` carga siempre los mismos datos:

| Promotor | Recinto | Token del backoffice |
|----------|---------|----------------------|
| Sala Faro | Sala Faro, A Coruña (platea y anfiteatro) | `faro-dev-token` |
| Teatro Lumen | Teatro Lumen, Madrid (platea y palcos) | `lumen-dev-token` |
| Auditorio El Olivo | Auditorio El Olivo, Sevilla (con fila de movilidad reducida) | `olivo-dev-token` |
| Teatro Cierzo | Teatro Cierzo, Zaragoza | `cierzo-dev-token` |
| Festival Alborada | Recinto Marina Sur, Valencia (sin butacas) | `alborada-dev-token` |
| Sala Marea | Sala Marea, Bilbao (de pie) | `marea-dev-token` |

29 eventos (pasados, a la venta, agotados, aplazados y cancelados), unos 2.500 pedidos, 6.800 entradas,
200 reembolsos y 48 incidencias de clientes. El pedido de referencia es `PED-2026-0107`
(Ana, dos butacas y un pase VIP de *Jazz en el Faro*).

## Importes

Todos los importes son enteros en **céntimos** (`price_cents`, `total_cents`…). La comisión de la plataforma
se expresa en puntos básicos (`commission_bps`: 750 = 7,5 %).

## Tests

```bash
npm test
```
