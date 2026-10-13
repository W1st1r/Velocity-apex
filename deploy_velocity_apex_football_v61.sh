#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${1:-/workspaces/Velocity-apex}"
ARCHIVE="Velocity-Apex-Mini-Football-Smooth-V61.zip"
cd "$WORKSPACE"
test -f "$ARCHIVE" || { echo "Не найден файл: $WORKSPACE/$ARCHIVE" >&2; exit 1; }
mkdir -p velocity-apex-football-v61-release
unzip -oq "$ARCHIVE" -d velocity-apex-football-v61-release
cd velocity-apex-football-v61-release
test -f wrangler.jsonc
grep -q 'football=20260920-v61' public/index.html
node tests/free_football_smooth_v61_test.mjs
npm install
npm test
npx wrangler deploy --config "$PWD/wrangler.jsonc"
