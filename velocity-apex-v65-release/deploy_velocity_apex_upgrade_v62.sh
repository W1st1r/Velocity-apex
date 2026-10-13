#!/usr/bin/env bash
set -euo pipefail
WORKSPACE="${1:-/workspaces/Velocity-apex}"
ARCHIVE="Velocity-Apex-Garage-Upgrade-Odds-Border-V62.zip"
cd "$WORKSPACE"
test -f "$ARCHIVE" || { echo "Не найден файл: $WORKSPACE/$ARCHIVE" >&2; exit 1; }
rm -rf velocity-apex-v62-release
mkdir -p velocity-apex-v62-release
unzip -oq "$ARCHIVE" -d velocity-apex-v62-release
cd velocity-apex-v62-release
test -f wrangler.jsonc
grep -q 'upgrade=20260920-v62' public/index.html
npm install
node tests/garage_upgrade_v62_odds_boundary_test.mjs
node tests/garage_upgrade_v52_test.mjs
node tests/garage_layout_v54_test.mjs
node tests/garage_nav_v56_test.mjs
node tests/garage_confirm_v57_test.mjs
node tests/free_football_smooth_v61_test.mjs
npx wrangler deploy --config "$PWD/wrangler.jsonc"
