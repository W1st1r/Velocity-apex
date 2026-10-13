#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npm install
node tests/economy_v63_test.mjs
node tests/economy_smoke.js
node tests/car_catalog_smoke.js
node tests/cases_smoke.js
node tests/payments_yoomoney_test.mjs
node tests/payments_webhook_atomic_test.mjs
node tests/garage_upgrade_v62_odds_boundary_test.mjs
npx wrangler deploy --config "$PWD/wrangler.jsonc"
