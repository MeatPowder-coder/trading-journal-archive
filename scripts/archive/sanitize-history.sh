#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Uso: $0 /ruta/al/repo-clonado"
  exit 1
fi

REPO_DIR="$1"
cd "$REPO_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: la ruta no es un repositorio git"
  exit 1
fi

echo "[1/5] Eliminando archivos sensibles del árbol actual"
rm -f workflow.json workflow-notifier.json update_workflow.py update_workflow_v2.py

echo "[2/5] Intentando limpieza de historial"
if command -v git-filter-repo >/dev/null 2>&1; then
  git filter-repo --force \
    --path workflow.json --path workflow-notifier.json \
    --path update_workflow.py --path update_workflow_v2.py \
    --path-glob "*.log" \
    --path-glob ".env*" --invert-paths
else
  echo "git-filter-repo no encontrado. Instálalo para limpieza profunda:"
  echo "  pipx install git-filter-repo"
  echo "  # o"
  echo "  pip install git-filter-repo"
fi

echo "[3/5] Commit de saneamiento"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore: sanitize archive for public portfolio"
fi

echo "[4/5] Limpieza de objetos locales"
git reflog expire --expire=now --all || true
git gc --prune=now --aggressive || true

echo "[5/5] Listo. Recomendado push forzado a repo nuevo de archive"
