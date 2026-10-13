#!/usr/bin/env bash
set -euo pipefail
WORKSPACE="${1:-/workspaces/Velocity-apex}"
ARCHIVE="${2:-Velocity-Apex-Garage-Upgrade-iPhone-V57.zip}"
cd "$WORKSPACE"
mkdir -p velocity-apex-v57-release
unzip -oq "$ARCHIVE" -d velocity-apex-v57-release
cd velocity-apex-v57-release
grep -q 'confirm=20260920-v57' public/index.html
npm install
npm test
npx wrangler deploy --config "$PWD/wrangler.jsonc"
