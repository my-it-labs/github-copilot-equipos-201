#!/usr/bin/env bash
# Crea en tu fork de GitHub un issue por cada fichero de teatralia/docs/backlog/TEA-*.md.
# Necesita gh con sesión iniciada (en Codespaces ya lo está). Si un issue con el mismo título existe, no lo repite.
set -euo pipefail
cd "$(dirname "$0")/.."
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
existentes=$(gh issue list -R "$repo" --state all --limit 200 --json title -q '.[].title')
for f in teatralia/docs/backlog/TEA-*.md; do
  id=$(basename "$f" .md | cut -d- -f1-2)
  titulo=$(sed -n 's/^titulo: "\(.*\)"$/\1/p' "$f")
  etiquetas=$(sed -n 's/^etiquetas: \[\(.*\)\]$/\1/p' "$f")
  cuerpo=$(awk 'BEGIN{n=0} /^---$/{n++; next} n>=2' "$f")
  if grep -Fxq "$id · $titulo" <<<"$existentes"; then echo "ya existe: $id"; continue; fi
  for e in ${etiquetas//,/ }; do gh label create "$e" -R "$repo" --force >/dev/null 2>&1 || true; done
  gh issue create -R "$repo" --title "$id · $titulo" --body "$cuerpo" --label "$etiquetas" >/dev/null
  echo "creado: $id · $titulo"
done
