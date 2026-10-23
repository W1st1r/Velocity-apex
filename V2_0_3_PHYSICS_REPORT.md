# Velocity Apex 2.0.3 — Physics Restoration Report

## Status

**Candidate; release gate currently blocked.** Production is back on V2.0.2. The V2.0.3 app-only deployment was rolled back after its live browser gate found a mixed-version shell. The latest available production D1 backup/restore gate #3 had succeeded before this candidate. This candidate contains no D1 migration.

## Root cause and correction

V2.0.2 intended to modernize the displayed performance values, but `R.applyCarPerformance` also converted those values into the player's physical `maxSpeed`, `accel` and `brakePower`. The same V2 physics switch then applied the newer normal-driving steering, grip, drag and corner-scrub formulae outside drift. That changed actual movement rather than only the UI values.

V2.0.3 keeps the current V2.0.2 performance metrics for the speedometer and shop/garage information, while assigning ordinary driving properties from the `fe9bbb0` legacy catalog and upgrade calculation. An explicit `ordinaryPhysicsVersion` keeps the old non-drift movement formulae independent from the V2 drift switch. Player-owned tuning is included in the restored legacy profile. The bot path continues to use its prior legacy profile.

The 2.0.2 `_updateDrift` implementation and its parameters are unchanged. Player drift calls run under the exact current 2.0.2 performance profile; ordinary driving uses the restored legacy profile. The transition back to ordinary driving reduces the temporary drift speed cap gradually instead of snapping the car's speed.

## Measured comparison — ordinary driving

Deterministic flat-track runs use the same vehicle setup, input sequence and 60 FPS for the values below. `fe9bbb0` and V2.0.3 outputs match exactly for the measured physical values. Maximum speed is shown both as the legacy simulation cap and as km/h using the current display conversion.

| Car | Metric | `fe9bbb0` baseline | V2.0.2 | V2.0.3 candidate |
|---|---|---:|---:|---:|
| Apex Lime (starter) | Maximum cap (world units/s; km/h) | 300; 90 | 466.7; 140 | 300; 90 |
|  | 0–60 km/h | 1.53 s | 2.50 s | 1.53 s |
|  | 80–0 braking distance | 11.17 m | 22.73 m | 11.17 m |
|  | 80 km/h turn radius* | 18.28 m | 40.56 m | 18.28 m |
| BMW M5 F90 (mid class) | Maximum cap (world units/s; km/h) | 371; 111.3 | 660; 198 | 371; 111.3 |
|  | 0–60 km/h | 1.10 s | 1.80 s | 1.10 s |
|  | 0–100 km/h | 2.25 s | 3.20 s | 2.25 s |
|  | 80–0 braking distance | 9.46 m | 18.13 m | 9.46 m |
|  | 80 km/h turn radius* | 19.56 m | 44.08 m | 19.56 m |
| Apollo EVO (highest-performance class) | Maximum cap (world units/s; km/h) | 558; 167.4 | 953.3; 286 | 558; 167.4 |
|  | 0–60 km/h | 0.60 s | 1.15 s | 0.60 s |
|  | 0–100 km/h | 1.10 s | 2.00 s | 1.10 s |
|  | 0–160 km/h | 2.35 s | 3.43 s | 2.35 s |
|  | 80–0 braking distance | 6.25 m | 12.88 m | 6.25 m |
|  | 80 km/h turn radius* | 22.91 m | 51.20 m | 22.91 m |

\* Turn-radius comparison uses the same one-second steering/throttle input from 80 km/h. Acceleration milestones above a car's physical cap are not reachable in that configuration. V2.0.2's increased shop/speedometer figures remain current UI metrics; they are not fed back into ordinary-physics calculations. This deliberately preserves the `fe9bbb0` physical caps as requested.

## Measured comparison — drift

| Property | `fe9bbb0` baseline | V2.0.2 | V2.0.3 candidate |
|---|---|---|---|
| Drift mechanics | Earlier model; not used as restoration target | Current Apex Drift 2.0 model | Same Apex Drift 2.0 model and parameters |
| Player performance profile during drift | Not applicable to V2.0.2 model | Current V2.0.2 catalog/tuning values | Same current V2.0.2 catalog/tuning values |
| Recorded trajectory regression | Not a comparable V2 trace | Reference | 36/36 SHA-256 trajectory traces match exactly |
| Coverage | Legacy behavior not treated as target | 3 vehicles × 3 FPS × 3 starting speeds, including initiation, left/right transition and release | Same inputs, same sample sequence and exact matching traces |
| Release transition | Legacy | Smooth grip recovery from V2.0.2 | Retained; additional checks bound the speed step on return to normal driving |

The exact-trace fixture is `tests/fixtures/v202-drift-hashes.json`, generated from the 2.0.2 production source SHA. The unchanged drift method and profile are covered through the slide and immediate release/regrip window.

## Code and tests

Main code paths: `public/js/car.js`, `public/js/content.js`, generated `public/js/race-runtime-v77.mjs`, and Worker/version metadata. Regression tests cover the full catalog and upgrade levels, restored ordinary values against `fe9bbb0`, representative physical runs at 30/60/120 FPS, player/bot isolation, exact 2.0.2 drift traces, transition continuity, and client/server simulation parity. No bot, economy, account, save or migration source was changed.

Recorded successful local checks:

- `BASELINE_DIR=/tmp/velocity-apex-fe9 npm run test:v203` — 9 baseline driving comparisons, 36 exact drift traces, 27 drift stability runs, full-catalog ordinary upgrades and bot isolation, client/server parity.
- `npm run test:v202` — legacy drift, physics edges, multitouch, independent ghost playback and cache checks.
- `npm run test:race:authority`.
- `npm run test:d1-release` — local simulator only; production D1 not accessed.
- `npm run test:ai` — 42 models / 924 simulations; AI source unchanged.
- `npm test` — successful.
- `node tests/ui_version_v2_test.mjs`, `node scripts/build-race-runtime.mjs --check`, `git diff --check` — successful.

Automated local browser binaries were unavailable during these local checks. The PR QA and protected release workflows are configured to run WebKit iPhone 13/14/15/17 landscape and Chromium startup checks. Do not treat browser or physical iPhone validation as passed until their workflow/device evidence exists.

## Release safety

- Protected app-only release run #11 (`39987928490`) deployed exact main SHA `7e8b94dfe19fb427a012f93b0dd1ba686c20fb04`; its live smoke failed once on WebKit iPhone 14 repeat 1. The diagnostic showed a visible, functioning V2.0.2 shell (`title` and app-version marker 2.0.2) while the release manifest was 2.0.3. There were no JavaScript errors or failed requests; 15 of 16 browser profiles/repeats passed. API smoke was skipped after the browser gate failed.
- Protected rollback run #5 (`39989164459`) restored the verified V2.0.2 Worker version `78de7942-3b99-400e-b207-9778ef809f6e` successfully. Production `/version.json` and the login screen were then confirmed as V2.0.2. The rollback only changed the Worker; no D1 migration ran.
- Root cause: `/`, `/index.html` and `/version.json` were not in the Workers Assets `run_worker_first` list, so the Worker could not apply no-store response headers to the static app shell. During deployment propagation, one WebKit request received the old V2.0.2 shell while the release manifest was already V2.0.3. The current targeted fix routes only the shell and manifest through the Worker and applies no-store; regression coverage checks both routing and headers.
- Release workflow is manual, exact-main-SHA gated and app-only; it performs no D1 migration.
- Verified D1 backup/restore workflow #3 is the latest available pre-candidate backup evidence.
- The cache-policy fix is local and still requires PR CI, merge, a fresh protected app-only attempt and successful live browser/API smoke before V2.0.3 can be accepted.
