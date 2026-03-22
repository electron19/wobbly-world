#!/usr/bin/env bash
# deploy.sh — commit + push do GitHub (GitHub Pages)
# Użycie: bash deploy.sh "opis zmian" [wersja]

set -e

MSG="${1:-update}"
VERSION="${2:-}"

if [ -n "$VERSION" ]; then
  MSG="[$VERSION] $MSG"
fi

cd "$(dirname "$0")"

echo "→ Staging wszystkich zmian..."
git add -A

echo "→ Commit: $MSG"
git commit -m "$MSG" || { echo "Brak zmian do commitowania."; exit 0; }

echo "→ Push do GitHub..."
git push

echo ""
echo "✅ Gotowe! GitHub Pages: https://electron19.github.io/wobbly-world/wobbly-world.html"
