#!/usr/bin/env bash
# Use after extracting V65 archive to your GitHub Codespace repository.
set -euo pipefail
cd "$(dirname "$0")"
echo '[1/3] Installing dependencies'
npm install --no-audit --no-fund
echo '[2/3] Testing upgraded game'
npm test
npm run test:v65
echo '[3/3] Cloudflare Workers deploy'
npx wrangler deploy --config "$PWD/wrangler.jsonc"
echo 'Velocity Apex V65: Cloudflare deploy completed.'
