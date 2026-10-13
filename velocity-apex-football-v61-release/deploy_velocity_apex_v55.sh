#!/usr/bin/env bash
set -euo pipefail
ARCHIVE="${1:-Velocity-Apex-Garage-Upgrade-iPhone-V55.zip}"
TARGET="${2:-velocity-apex-v55}"
mkdir -p "$TARGET"
unzip -o "$ARCHIVE" -d "$TARGET"
cd "$TARGET"
npm install
npm test
npx wrangler d1 migrations apply velocity-apex-db --remote
npx wrangler deploy
