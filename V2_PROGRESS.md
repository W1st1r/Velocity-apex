# Velocity Apex 2.0 development checkpoint

- Base: verified `main` at `fe9bbb0f23939892b99cece49f1fea9255f17f42`.
- Local branch: `velocity-apex-2.0-dev` in this checkout. Local checkpoint commit is recorded in Git history. No push, merge, deploy, release, or production D1 operation was performed. Draft PR #17 was not changed.
- `npm ci --no-audit --no-fund` completed successfully in Node 24.19.0 / npm 11.9.0.

## Implemented locally

- Introduced a shared 12 world-units/metre scale and explicit world-speed ↔ km/h and acceleration conversions. Car movement remains delta-time based; player HUD, free roam, speed traps and server-authoritative race state now consistently interpret speed. Existing server race payloads continue to use world units.
- Rebalanced all catalog cars into class-based 140–300 km/h bands, recalibrated acceleration/braking/handling and speed upgrades, bounded upgrade and owner tuning values, and generated the server catalog from the client physics catalog. Legacy owner tuning values are remapped without a D1 schema/data change.
- Recalibrated player car drag, grip, steering, drift thresholds, camera speed response and high-speed road effects. AI controller, racing-line planner, difficulty profiles and AI-only track speed-profile code are restored unchanged from base; bot calibration is explicitly deferred.
- Refined free-roam chat metadata layout, responsive chat panel/friends cards and overlay transitions in `public/css/ui-polish-v2.css`.
- Added centralized `public/version.json` and `public/js/app-version.mjs`; development UI reports `2.0.0-dev`, while production/default/offline fallback stays at V77. Build stamping versions HTML-linked JS/CSS assets. No service worker exists in the project, so no cache lifecycle change was introduced.
- Added physics/version tests and updated existing expectations for converted physical speeds.

## Validation

Passed: catalog generation; race runtime generation and consistency check; physics unit/FPS test (30/60/120 FPS distance spread 0.84%); upgrade/catalog tests; owner panel SQLite migration/validation tests; account auth smoke; drift and garage/free-roam tests; social/free-roam, mobile HUD, mobile UI navigation, online protocol/network/room/UI tests; `git diff --check`.

Known deferred bot issues (not changed in this task):
- Full `npm test` fails at `trajectory_sector_test.js` (`Fast-corner sector did not gain enough path efficiency`).
- `race_authority_v77_test.mjs` fails its honest AI-driven career completion gate. Previous standalone/AI benchmark results also showed Extreme off-road/barrier incidents on Apex Circuit, Desert Canyon, Coastline GT and Aurora Grand Loop, poor difficulty hierarchy on some tracks, and Desert traffic incidents. Bot behavior and related tests are left untouched for a separate phase.
- Playwright mobile race tests cannot launch WebKit because this managed environment lacks OS libraries (GTK/GStreamer/Wayland and related packages); installing them is blocked by the environment's package-manager permissions. No physical iPhone/iPad is available.
- Full `npm test` stops at the bot trajectory gate, so later tests were selected and run individually where relevant.

## Real iPhone checklist

- Test Safari and installed PWA on iOS 17+ at narrow and Pro Max widths, portrait and landscape; inspect safe areas and rotation.
- Open/close each menu (main, garage, shop, account, friends, clans, ratings, promo, cases, career, settings, online lobby, free roam and chat); verify no leftover dim layer, black rectangle, blank frame or clipped panel.
- Verify chat long names/roles/IDs, long messages, rapid incoming messages, reconnect and scroll-to-latest behavior.
- Focus chat input with the iOS keyboard open; verify 16 px text prevents zoom, send button remains tappable, input stays visible above keyboard and safe area.
- Drive at low speed and near class top speed; compare HUD speed with movement, then verify steering, braking, drift and upgrades in solo/free roam/online.
- Background and restore the PWA, toggle network/offline state, and confirm saved account/game state and screen state recover.
- Check transitions with Reduce Motion enabled and normal animation; record any dropped frames or persistent overlay.

Next development is limited to player physics, UI/chat and versioning. Keep work local until Cloudflare Git integration safety is independently confirmed and the owner authorizes pushing; do not publish 2.0. Bot tuning is explicitly deferred.
