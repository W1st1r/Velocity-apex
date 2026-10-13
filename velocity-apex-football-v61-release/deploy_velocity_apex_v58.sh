#!/usr/bin/env bash
set -euo pipefail
WORKSPACE="${1:-/workspaces/Velocity-apex}"
ARCHIVE="${2:-Velocity-Apex-Garage-Upgrade-iPhone-V58.zip}"
cd "$WORKSPACE"
mkdir -p velocity-apex-v58-release
unzip -oq "$ARCHIVE" -d velocity-apex-v58-release
cd velocity-apex-v58-release
grep -q 'returnBps:7360' src/upgrade-config.mjs
grep -q 'maxChanceBps:7200' src/upgrade-config.mjs
npm install
npm test
npx wrangler deploy --config "$PWD/wrangler.jsonc"
