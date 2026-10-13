#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${1:-/workspaces/Velocity-apex}"
ARCHIVE="${2:-Velocity-Apex-Garage-Upgrade-Visual-Odds-V60.zip}"
cd "$WORKSPACE"
test -f "$ARCHIVE" || { echo "Archive not found: $WORKSPACE/$ARCHIVE" >&2; exit 1; }
rm -rf velocity-apex-v60-release
mkdir -p velocity-apex-v60-release
unzip -oq "$ARCHIVE" -d velocity-apex-v60-release
cd velocity-apex-v60-release
grep -q 'chanceDivisor:6' src/upgrade-config.mjs
grep -q 'UPGRADE_VISUAL_MULTIPLIER=4.5' public/js/garage.js
node tests/garage_upgrade_v60_visual_odds_test.mjs
npm install
npm test
npx wrangler deploy --config "$PWD/wrangler.jsonc"
