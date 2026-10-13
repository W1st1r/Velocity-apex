#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${1:-/workspaces/Velocity-apex}"
ARCHIVE="${2:-Velocity-Apex-Garage-Upgrade-iPhone-V59.zip}"
cd "$WORKSPACE"
test -f "$ARCHIVE" || { echo "Archive not found: $WORKSPACE/$ARCHIVE" >&2; exit 1; }
mkdir -p velocity-apex-v59-release
unzip -oq "$ARCHIVE" -d velocity-apex-v59-release
cd velocity-apex-v59-release
grep -q 'chanceDivisor:6' src/upgrade-config.mjs
node tests/garage_upgrade_v52_test.mjs
npm ci
npm test
npx wrangler deploy --config "$PWD/wrangler.jsonc"
