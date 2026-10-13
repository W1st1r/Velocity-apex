#!/usr/bin/env bash
set -euo pipefail
ZIP="${1:-Velocity-Apex-Garage-Upgrade-iPhone-V54.zip}"
TARGET="${2:-velocity-apex-v54}"
rm -rf "$TARGET"
mkdir -p "$TARGET"
unzip -o "$ZIP" -d "$TARGET"
cd "$TARGET"
npm install
npm test
npx wrangler d1 migrations apply velocity-apex-db --remote
npx wrangler deploy
