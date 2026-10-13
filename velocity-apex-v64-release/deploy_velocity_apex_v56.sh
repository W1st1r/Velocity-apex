#!/usr/bin/env bash
set -euo pipefail
WORKSPACE="${1:-/workspaces/Velocity-apex}"
ARCHIVE="${2:-Velocity-Apex-Garage-Upgrade-iPhone-V56.zip}"
cd "$WORKSPACE"
mkdir -p velocity-apex-v56-release
unzip -oq "$ARCHIVE" -d velocity-apex-v56-release
cd velocity-apex-v56-release
grep -q 'garageNav=20260920-v56' public/index.html
npm install
npm test
npx wrangler deploy --config "$PWD/wrangler.jsonc"
