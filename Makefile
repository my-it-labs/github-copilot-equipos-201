# GitHub Copilot · Teatralia — comandos del curso
#
# Funciona dentro del Codespace (o Dev Container local) y en tu máquina con Node 22 + Docker.
# Todos los labs parten del mismo estado: el código de teatralia/ tal como está en el repositorio
# y la base de datos con los datos de ejemplo.

SHELL := /bin/bash
COMPOSE := docker compose -f infra/compose.yaml

.DEFAULT_GOAL := help
.PHONY: help setup infra up db-reset reset test status backlog

help:
	@echo "Teatralia · GitHub Copilot"
	@echo
	@echo "  make up         arranca la plataforma (api, pagos, correo, tienda, backoffice, editor)"
	@echo "  make db-reset   base de datos limpia con los datos de ejemplo"
	@echo "  make reset      descarta tus cambios en teatralia/ y reinicia la base de datos (pide confirmación)"
	@echo "  make test       tests de Teatralia"
	@echo "  make status     qué has cambiado en teatralia/ y cuántos datos hay"
	@echo "  make backlog    crea en tu fork los issues de teatralia/docs/backlog (necesita gh)"
	@echo
	@echo "  Tienda      http://localhost:5173   (Sala Faro: http://entradas.salafaro.localhost:5173)"
	@echo "  Backoffice  http://localhost:5174   (token: faro-dev-token, lumen-dev-token, olivo-dev-token…)"
	@echo "  Mailpit     http://localhost:8025"

setup:
	cd teatralia && npm install --no-audit --no-fund

# Dentro del Codespace la infraestructura ya la levanta el Dev Container
infra:
	@if [ -z "$$TEATRALIA_DEVCONTAINER" ]; then $(COMPOSE) up -d --wait postgres redis mailpit; fi

up: infra
	@[ -d teatralia/node_modules ] || $(MAKE) --no-print-directory setup
	cd teatralia && npm run dev

db-reset: infra
	@[ -d teatralia/node_modules ] || $(MAKE) --no-print-directory setup
	cd teatralia && npm run db:reset

reset:
	@if [ "$$CONFIRM" != "1" ]; then read -p "Se descartan tus cambios en teatralia/. ¿Seguro? [s/N] " r; [ "$$r" = "s" ]; fi
	git checkout -- teatralia && git clean -fdq teatralia -e node_modules
	@$(MAKE) --no-print-directory db-reset

test:
	cd teatralia && npm test

status:
	@git status --short teatralia || true
	@scripts/datos.sh 2>/dev/null || true

backlog:
	@scripts/crear-backlog.sh
