#!/usr/bin/env bash
# Resumen de los datos de ejemplo de Teatralia (usa la base de datos del curso)
url=${DATABASE_URL:-postgres://teatralia:teatralia@localhost:5432/teatralia}
psql "$url" -At -F ' ' -c "
  SELECT 'promotores', count(*) FROM tenants UNION ALL
  SELECT 'eventos', count(*) FROM events UNION ALL
  SELECT 'pedidos', count(*) FROM orders UNION ALL
  SELECT 'entradas', count(*) FROM tickets UNION ALL
  SELECT 'reembolsos', count(*) FROM refunds UNION ALL
  SELECT 'incidencias', count(*) FROM support_cases"
