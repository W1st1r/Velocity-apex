# Velocity Apex 2 — Validation Report

Date: 2026-09-14

## Scope

This package keeps the existing HTML/CSS/vanilla JavaScript/Canvas 2D and Cloudflare Worker/Durable Object/WebSocket architecture. The pass covers the main menu, local race setup, Online landing/create/join/Lobby UI, shared vehicle physics, AI/racing-line tuning, online state validation, and a new sixth track. Legacy save key `velocityApex.v1`, car IDs, Shop/Garage, controls, pause behavior, PWA assets and room flow remain in place.

## New track

- `AURORA GRAND LOOP` (`auroraGrandLoop`)
- Generated length: **15,000.0** world-distance units / **15.00 km**
- `targetLength: 15000`
- `roadWidth: 226`
- 25 Catmull-Rom control points
- Geometry smoke test: 1,250 samples, minimum local segment 11.87, no centerline self-intersections
- `aurora` cached Canvas scenery adds shoreline/water, forest belts, rock zones, paddock/service details, grandstand/pit treatment, signals and braking/road markings.

## Shared race physics

- `maxSpeed`: **510**
- `accel`: **268**
- `brakePower`: **368**
- `turnRate`: **2.40**

The deterministic six-second full-throttle straight-line check measures 2,278.4 distance units in the new model versus 1,807.7 with the legacy 400/210/320/2.32 settings: **1.260× distance**. HUD speed now shows actual `Car.speed`. Player and AI still share the same `Car.update()` physics; difficulty remains a driver-model difference.

AI braking horizon, racing-line speed envelopes, look-ahead, traffic horizon and recovery speeds were retuned for the higher velocities. Camera look-ahead/zoom and subtle speed-line thresholds were also adapted. Online `player_state` accepts the new honest top speed with a bounded 650 speed ceiling and ±1200 velocity-component limits; the Durable Object displacement guard and client large-correction threshold were scaled correspondingly without removing sanity checks.

## UI / iPhone landscape

Menu and Online panels now use a compact premium graphite/teal treatment with a clearer primary-action hierarchy, subtle highlights, controlled lime glow, modern fields/selects/toggles, dedicated connection pill, richer room-code card, player status badges, separated Host Settings, copy feedback, pressed/focus states and 120–180 ms micro-transitions. Compact landscape rules preserve the same layout hierarchy down to 375–430 px viewport heights, retain safe-area insets and respect `prefers-reduced-motion`.


## Drift mode update

Local **ИГРАТЬ РЯДОМ** now branches into **ОБЫЧНЫЙ** and **ДРИФТ**. The normal catalog/physics/reward path remains unchanged. Drift adds `SIERRA FLOW` (10.4 km) and `MIDNIGHT SWITCHBACKS` (11.8 km), an iPhone multitouch handbrake, separate slip/yaw tuning, smoke/skid feedback, forward-progress-gated drift score/combo, independent bot/difficulty/track save fields, and capped score contribution to CR rewards.

`tests/drift_smoke.js` validates both map lengths, catalog isolation, handbrake slip/recovery, AI completion on all four difficulties, reward scaling/capping, persisted drift settings and the anti-stationary-farm scoring gate. Both drift routes completed in the deterministic AI check with zero barrier impacts.

## Automated validation

### `npm test` — PASS

The full suite passed: physics/camera, economy, 41-car catalog/assets, geometry/collisions, Shop/Garage, root tools, interaction guards, all six track geometries, trajectory sectors, deterministic standalone AI/traffic, online protocol, network interpolation/extrapolation, room/Durable Object flow and Online DOM/PWA static checks.

Notable checks:
- all six tracks have finite smooth geometry and zero detected centerline self-intersections;
- `auroraGrandLoop` is exactly 15,000.0 generated length and >1.4× Desert Canyon;
- standalone difficulty hierarchy is valid on all six tracks;
- Online protocol accepts `auroraGrandLoop` and valid speed 510, while rejecting speed 651+;
- bounded extrapolation remains capped at 140 ms.

### `npm run test:ai` — PASS

The deterministic 6-track × 4-difficulty clean-air benchmark plus 3/7/13-car traffic matrix passed all quality gates:
- hierarchy: PASS
- clean finish: PASS
- clean no-barrier: PASS
- traffic finish: PASS
- 13-car stress no pile-up: PASS
- stress off-road: PASS

Aurora clean-air average laps were 58.37 s (Easy), 57.38 s (Medium), 44.36 s (Hard), and 42.46 s (Extreme) in the standalone suite, with zero barrier impacts and zero true off-road time.

## iPhone cases / multi-open / Online Hub pass

- Case modal is hard-constrained to the safe-area viewport with `min-width:0`, clipped horizontal overflow, compact rules for <=620 px landscape and <=430 px portrait layouts.
- Quantity selector and batch purchase/open remain limited to 1–10. Multi-open resolves every real reward first, then animates a visual reel and renders all drops in a staggered result grid.
- Premium/rare reel near-misses are display-only. `R.openCases()` executes before the visual sequence is built, so the reel cannot change the selected rewards or their existing `chanceBps` values.
- Online opens on the Rooms / locked Free Mode hub. The night-city scene now has lightweight ambient motion plus a `prefers-reduced-motion` fallback.
- Account/D1 files, save key, manifest, worker routes, Durable Object binding and existing gameplay modules are preserved.

Validation: `npm test` PASS; JavaScript syntax checks PASS; manifest and `wrangler.jsonc` structural JSON checks PASS. A local Wrangler dry-run was not available in this isolated build container because Wrangler dependencies are not installed here; the deployment configuration itself was left unchanged from the already-working account build.

## Startup authorization gate update

- The game menu is hidden on launch until account bootstrap completes and the player explicitly enters an authenticated profile.
- If the Cloudflare HttpOnly session is still valid, the startup screen shows the active profile and a **ПРОДОЛЖИТЬ** action; the game does not auto-enter behind the player.
- Previously used profiles on the same iPhone are remembered as username/display-name metadata only (maximum five). Selecting another remembered profile pre-fills its login and still requires the password.
- Passwords and session tokens are never written to localStorage. The active server session remains the existing HttpOnly `va_session` cookie.
- Logout returns to the startup authorization gate instead of leaving an unauthenticated player in the main menu.
- Existing D1 schema, account endpoints, cloud save format, multiplayer, cases, PWA manifest and Worker/Durable Object bindings are unchanged.

Validation: full `npm test` PASS; `account.js`, `auth.mjs`, and `worker.mjs` syntax checks PASS; manifest JSON parse PASS.

## Garage visual repair — 2026-09-15
- Verified all 41 real cars have both full-size and thumbnail WebP assets (82/82 files present).
- Garage/shop car cards now use direct thumbnail images instead of relying on dozens of continuously redrawn canvases; legacy cars retain a canvas fallback.
- Sprite URLs are normalized to root-relative `/assets/...` paths so installed PWA/navigation routes cannot break car artwork.
- Effect cards now have dedicated visual flame swatches, including STANDARD and RAINBOW/IRIDESCENT states.
- Previewed and equipped items have separate, visible states (`ПРОСМОТР` / `АКТИВНО`) and selected buttons show `✓ АКТИВНО`.
- Added broken-thumbnail fallback instead of showing a broken-image icon.
- Added `garage_visual_smoke.js`; full `npm test` passes.

## Garage/store catalog layout fix (v6)
- Prevented CSS Grid auto rows from collapsing car/effect cards on short iPhone landscape viewports.
- Added intrinsic/max-content catalog rows and compact minimum card heights with internal flex layout.
- Kept car thumbnails/effect swatches contained inside each card instead of clipping into neighboring rows.
- Fitted all seven rarity filters across the iPhone landscape catalog bar (no half-cut final chip).
- Cache-bust bumped to `20260915-006`.
- `npm test`: PASS, including `garage_visual_smoke.js` anti-collapse checks.
