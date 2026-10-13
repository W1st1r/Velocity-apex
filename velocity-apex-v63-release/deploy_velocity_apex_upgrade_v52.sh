#!/usr/bin/env bash
set -euo pipefail

ZIP="${1:-Velocity-Apex-Garage-Upgrade-iPhone-V52.zip}"

if [[ ! -f "$ZIP" ]]; then
  echo "ZIP not found: $ZIP" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

unzip -q "$ZIP" -d "$TMP"
WRANGLER="$(find "$TMP" -maxdepth 5 -type f -name wrangler.jsonc -print -quit)"

if [[ -z "$WRANGLER" ]]; then
  echo "wrangler.jsonc not found inside ZIP" >&2
  exit 1
fi

ROOT="$(dirname "$WRANGLER")"
cd "$ROOT"

echo "==> Installing dependencies"
npm install

echo "==> Running V52 Upgrade regression tests"
node tests/garage_upgrade_v52_test.mjs
node tests/logs_system_test.mjs
node tests/media_v51_mobile_race_test.mjs
node tests/online_ui_smoke.js

echo "==> Applying D1 migrations (includes 0017_upgrade.sql)"
npx wrangler d1 migrations apply velocity-apex-db --remote

echo "==> Deploying Velocity Apex V52"
npx wrangler deploy
