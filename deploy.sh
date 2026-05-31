#!/usr/bin/env bash
# deploy.sh — commit + push do GitHub + upload FTP na Hostido
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

echo "→ Upload FTP na Hostido (wobbly-world.xce.pl)..."
lftp -u "claude@wobbly-world.xce.pl,Electron1982!" ftp://wobbly-world.xce.pl <<'LFTP'
set ssl:verify-certificate no
set ftp:passive-mode yes
cd public_html
mirror -R --parallel=4 \
  --exclude-glob=*.sh \
  --exclude-glob=*.md \
  --exclude-glob=*.txt \
  --exclude-glob=.DS_Store \
  --exclude=wobbly-world.html \
  --exclude=docs \
  --exclude=.git \
  --exclude=.claude \
  . .
quit
LFTP

echo ""
echo "✅ Gotowe!"
echo "   GitHub Pages : https://electron19.github.io/wobbly-world/"
echo "   Hostido       : http://wobbly-world.xce.pl/"
