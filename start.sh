#!/usr/bin/env bash
# TonySpark — lance le dev server Vite (installe les dépendances au besoin).
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm n'est pas installé. Installe Node.js (https://nodejs.org) puis relance." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 Installation des dépendances (npm install)…"
  npm install
fi

echo "🚀 Démarrage de TonySpark sur http://localhost:5173"
exec npm run dev -- "$@"
