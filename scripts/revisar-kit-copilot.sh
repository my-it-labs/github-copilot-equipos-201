#!/usr/bin/env bash
# Revisa el «kit de Copilot» del equipo: los ficheros de personalización que se versionan en el repo.
# No juzga si el texto es bueno; comprueba que cada pieza existe, que Copilot puede leerla
# (cabecera YAML con los campos que necesita) y que no lleva secretos.
#
#   scripts/revisar-kit-copilot.sh          # revisa el repositorio actual
#   scripts/revisar-kit-copilot.sh RUTA     # revisa otra copia
set -uo pipefail
raiz="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$raiz" || exit 2
fallos=0
ok()   { printf '  ✔ %s\n' "$1"; }
mal()  { printf '  ✘ %s\n' "$1"; fallos=$((fallos + 1)); }

# Devuelve el valor de un campo de la cabecera YAML (entre las dos primeras líneas ---)
campo() { awk -v c="$2" 'NR==1 && $0!="---"{exit} /^---$/{n++; next} n==1 && $0 ~ "^"c":" {sub("^"c":[ ]*",""); print; exit}' "$1"; }

echo "Instrucciones"
if [ -s .github/copilot-instructions.md ]; then ok ".github/copilot-instructions.md ($(wc -l < .github/copilot-instructions.md) líneas)"
else mal ".github/copilot-instructions.md no existe o está vacío"; fi
n=0
for f in .github/instructions/*.instructions.md; do
  [ -e "$f" ] || continue; n=$((n + 1))
  a=$(campo "$f" applyTo)
  if [ -n "$a" ]; then ok "$f → applyTo: $a"; else mal "$f sin applyTo en la cabecera"; fi
done
[ "$n" -gt 0 ] || mal "ningún fichero en .github/instructions/"

echo "Prompt files"
n=0
for f in .github/prompts/*.prompt.md; do
  [ -e "$f" ] || continue; n=$((n + 1))
  d=$(campo "$f" description)
  if [ -n "$d" ]; then ok "/$(basename "$f" .prompt.md) → $d"; else mal "$f sin description"; fi
done
[ "$n" -gt 0 ] || mal "ningún fichero en .github/prompts/"

echo "Agentes personalizados"
n=0
for f in .github/agents/*.agent.md .github/chatmodes/*.chatmode.md; do
  [ -e "$f" ] || continue; n=$((n + 1))
  d=$(campo "$f" description); t=$(campo "$f" tools)
  if [ -z "$d" ]; then mal "$f sin description"; continue; fi
  if [ -z "$t" ]; then mal "$f sin lista de tools (tendría todas)"; continue; fi
  if grep -Eq "'(edit|editFiles|execute|runCommands|terminal)[/']" <<<"$t"; then
    ok "$(basename "$f") → tools: $t (puede cambiar ficheros o ejecutar: ¿es lo que quieres?)"
  else ok "$(basename "$f") → tools: $t"; fi
done
[ "$n" -gt 0 ] || mal "ningún agente en .github/agents/"

echo "Revisión"
if [ -s .github/pull_request_template.md ]; then
  if grep -qi "copilot\|IA" .github/pull_request_template.md; then ok ".github/pull_request_template.md (pregunta por el uso de IA)"
  else mal ".github/pull_request_template.md no dice nada del uso de IA"; fi
else mal ".github/pull_request_template.md no existe"; fi

echo "MCP"
if [ -s .vscode/mcp.json ]; then
  s=$(node -e '
    const t = require("fs").readFileSync(".vscode/mcp.json", "utf8").replace(/^\s*\/\/.*$/gm, "");
    try { console.log(Object.keys(JSON.parse(t).servers).join(", ")); } catch (e) { console.log("ERROR " + e.message); }')
  case "$s" in ERROR*) mal ".vscode/mcp.json no se puede leer: $s" ;; *) ok ".vscode/mcp.json → servidores: $s" ;; esac
else mal ".vscode/mcp.json no existe"; fi

echo "Adopción"
if [ -s docs/equipo/adopcion-copilot.md ]; then ok "docs/equipo/adopcion-copilot.md ($(grep -c '^## ' docs/equipo/adopcion-copilot.md) secciones)"
else mal "docs/equipo/adopcion-copilot.md no existe"; fi

echo "Secretos"
encontrados=$(grep -rEn '(SG\.[A-Za-z0-9_-]{10,}|key-[0-9a-f]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|postgres://[^:"$]+:[^@"$]+@)' \
  .github .vscode docs/equipo 2>/dev/null)
if [ -z "$encontrados" ]; then ok "ningún token ni contraseña en .github, .vscode ni docs/equipo"
else mal "posibles secretos:"; echo "$encontrados" | sed 's/^/      /'; fi

echo
if [ "$fallos" -eq 0 ]; then echo "Kit completo."; else echo "Kit incompleto: $fallos problema(s)."; exit 1; fi
