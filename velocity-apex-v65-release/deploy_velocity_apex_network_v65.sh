#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${1:-/workspaces/Velocity-apex}"
ARCHIVE="${2:-Velocity-Apex-Online-NetSmooth-V65.zip}"
RELEASE_DIR="$WORKSPACE/velocity-apex-v65-release"

cd "$WORKSPACE"
test -f "$ARCHIVE" || { echo "Archive not found: $WORKSPACE/$ARCHIVE" >&2; exit 1; }
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
unzip -oq "$ARCHIVE" -d "$RELEASE_DIR"
cd "$RELEASE_DIR"
npm install
node --check public/js/network.js
node --check public/js/freeroam.js
node --check src/worker.mjs
node tests/online_network_test.js
node tests/network_smoothing_v65_test.mjs
node tests/free_network_v24_test.mjs
node tests/free_minigames_v21_test.mjs
node tests/free_minigames_v22_quality_test.mjs
node tests/free_football_v33_test.mjs
node tests/free_football_smooth_v61_test.mjs
node tests/free_drag_sync_test.mjs
npx wrangler deploy --config "$PWD/wrangler.jsonc"
