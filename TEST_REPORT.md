# Velocity Apex — AI Rework Test Report

Date: 2026-09-13

## Scope
Deep audit and rework covered `js/ai.js`, `js/racing-line.js`, `js/track.js`, `js/car.js`, race traffic behaviour, and the deterministic tests. No AI-only max speed, acceleration, braking, grip, collision, off-road or traction advantage was added. Player and AI still use the same `Car.update()` physics.

## Baseline problems reproduced
The supplied baseline was reproduced before edits. Extreme average laps were: Apex Circuit 19.55 s, Neon Harbor 20.76 s, Desert Canyon 32.87 s, Alpine Ring 32.54 s, Coastline GT 29.29 s. Hard was 21.10 / 21.07 / 33.49 / 32.64 / 29.87 s. Hard→Extreme separation was therefore only ~0.3% on Alpine, ~1.5% Neon, ~1.9% Desert and ~2.0% Coastline.

A newly enabled Easy hierarchy check also exposed a hidden baseline defect: Easy was faster than Medium on Neon Harbor, Desert Canyon and Coastline GT.

## Root causes found
1. **Throttle controller undershot its own speed target.** At `speed == desired`, old AI requested only ~30% throttle. At high speed this is insufficient to offset the quadratic drag in `Car.update()`, so bots spent large fractions of a lap below their own speed profile, especially on exits and straights.
2. **Braking envelope ignored real drag deceleration.** `getSpeedProfile()` propagated braking using only `brakePower * .80 * brakeUsage`, although the actual car simultaneously receives rolling/aero drag while braking. This produced systematically early braking points.
3. **High-end difficulty ceiling was masked by incomplete tests.** Standalone hierarchy omitted Easy and therefore did not catch incorrect low-end ordering.
4. **Traffic safety is cumulative.** `crowdReserve`, side-by-side speed reductions, density penalties, follow-gap limits and lead-car braking can stack. The benchmark was expanded to quantify this under 3/7/13-car loads.
5. **The theoretical planner is optimistic on acceleration.** Its speed envelope assumes a simpler acceleration model than the torque-falloff + drag model in `Car.update()`. This explains why twisty circuits still spend substantial time below target even after controller fixes; it is now measured rather than hidden.

## Algorithm changes
- Added drag-aware feed-forward throttle. The controller now computes approximate hold throttle from the same torque curve, traction and drag used by the common car physics, then adds speed-error demand. This reduces pointless partial-throttle underspeed and opens the throttle earlier after apex.
- Exit-aware throttle commitment was strengthened: when the profile rises after a corner, high-level AI commits to power before steering reaches zero.
- `getSpeedProfile()` braking propagation now includes the deceleration contributed by shared vehicle drag. Higher skill levels exploit more of this known braking capacity, moving braking points later without changing `brakePower`.
- Difficulty profiles were re-spaced after the Extreme controller improvement. Easy now carries a genuine physical reserve; Medium is a normal racing competitor; Hard remains close to the limit; Extreme uses near-total available control authority.
- Added explicit launch reaction delay by level: Extreme ~0.01 s, Hard ~0.04 s, Medium ~0.10 s, Easy ~0.20 s.
- Driver variance remains small and bounded; Extreme variance cannot turn a driver into a Medium-level bot.
- Standalone hierarchy now includes Easy and asserts `Extreme < Hard < Medium < Easy` on every track.
- Added `tests/ai_benchmark.js`: all 5 tracks, all 4 difficulties, clean-air telemetry, 3/7/13-car traffic, two deterministic seeds (120 traffic runs total).

## BEFORE → AFTER clean-air average lap
| Track | Easy after | Medium before | Medium after | Hard before | Hard after | Extreme before | Extreme after |
|---|---:|---:|---:|---:|---:|---:|---:|
| Apex Circuit | 29.9 | 28.27 | 28.0 | 21.10 | 21.5 | 19.55 | **19.28** |
| Neon Harbor | 24.4 | 23.79 | 23.8 | 21.07 | 21.1 | 20.76 | **20.27** |
| Desert Canyon | 40.7 | 38.99 | 38.7 | 33.49 | 33.7 | 32.87 | **32.11** |
| Alpine Ring | 37.8 | 34.66 | 34.5 | 32.64 | 32.8 | 32.54 | **32.02** |
| Coastline GT | 37.2 | 35.57 | 35.4 | 29.87 | 30.0 | 29.29 | **28.49** |

The largest clean-air Extreme gain is Coastline (~2.7%), followed by Desert (~2.3%), Neon (~2.4%) and Alpine (~1.6%). Apex is already dominated by long high-speed sections and showed a smaller ~1.4% gain. More importantly, the high-end controller now brakes later using real deceleration capacity and carries throttle instead of chronically undershooting its target.

## Difficulty hierarchy after
Deterministic benchmark averages:
- Apex: Easy 29.96 > Medium 28.03 > Hard 21.52 > Extreme 19.28
- Neon: Easy 24.39 > Medium 23.76 > Hard 21.12 > Extreme 20.27
- Desert: Easy 40.67 > Medium 38.66 > Hard 33.69 > Extreme 32.11
- Alpine: Easy 37.83 > Medium 34.48 > Hard 32.76 > Extreme 32.02
- Coastline: Easy 37.16 > Medium 35.36 > Hard 30.00 > Extreme 28.49

The hierarchy is now explicit on all five tracks. Alpine remains the tightest Hard→Extreme circuit because its low-speed sequence is close to the shared car's lateral/acceleration limit; this is visible in telemetry rather than being hidden by test omission.

## Sector / trajectory checks
`trajectory_sector_test.js` remains green. The planner still demonstrates: fast-turn path shortening on Desert, hairpin entry/apex/exit differentiation on Alpine, left-right and right-left S straightening on Neon, triple-corner improvement on Neon, and exit-speed prioritisation before Coastline's long straight. No change introduced discontinuous racing-line steps.

## Traffic and racecraft benchmark
`tests/ai_benchmark.js` executes 120 deterministic traffic races (3, 7 and 13 cars, 2 seeds, every track and difficulty). All runs finish all cars. Aggregate traffic result from the validation run: ~23.5 contact episodes/run, ~3.9 heavy contacts/run and 618 confirmed order changes/passes across the suite.

The existing focused traffic test also finishes 8/8 Hard at Neon, 10/10 Extreme at Alpine, and 13/13 Extreme at Desert with no barrier pile-up. The 13-car matrix showed one notable true-off-road stress case on Coastline Extreme (~3.24 aggregate seconds across 13 cars); it still completed 13/13 and is retained as a documented stress edge rather than hidden.

## Stability
- Clean-air single bots: no barrier impacts and effectively zero true off-road time.
- No steering oscillation regression in the standalone suite.
- No DNF in deterministic traffic matrix.
- No runtime dependencies or frameworks added.
- No per-frame global racing-line optimisation added; track planning/speed profiles remain cached.

## iPhone / PWA performance considerations
The changes are constant-time arithmetic inside the existing AI tick plus cached speed-profile construction. No large temporary per-frame arrays were introduced. The new benchmark code lives only under `tests/` and is not shipped into the runtime loop. Fixed/substep physics remains unchanged.

## Final validation commands
The final package was validated with:

```bash
node --check js/*.js
node --check tests/*.js
node tests/physics_smoke.js
node tests/standalone_race_test.js
node tests/trajectory_sector_test.js
node tests/ai_benchmark.js
```

See `AI_BENCHMARK_REPORT.json` for the full deterministic benchmark output.

## Garage categories / Porsche 911 regression (2026-09-13)

Additional validation after the garage update:

- `node tests/economy_smoke.js` — PASS, including Porsche exact-price purchase at 40,000 CR, insufficient-funds rejection at 39,999 CR, repeat-purchase protection and old-save normalization.
- `node tests/porsche_shop_smoke.js` — PASS: four existing cars resolve to `regular`, `sport` is empty, `premium` contains only `porsche-911`, both Porsche WebP assets exist, purchase/selection survives normalization, and category/premium/sprite integration is present.
- `node tests/physics_smoke.js` — PASS after sprite integration; physics/collision invariants remain unchanged.
- `node tests/trajectory_sector_test.js` — PASS after garage changes.
- `node tests/standalone_race_test.js` — PASS after garage changes; all deterministic race/traffic quality gates remain true.

The project has no existing service worker or explicit precache list, so no cache manifest required modification. The manifest and static PWA layout remain intact.

## Online Multiplayer validation (2026-09-13)

Added Cloudflare Worker + SQLite Durable Object + Hibernation WebSocket multiplayer and verified that the original standalone suites still pass after integration.

### Existing regression suite

Executed successfully:

- `node tests/physics_smoke.js`
- `node tests/economy_smoke.js`
- `node tests/porsche_shop_smoke.js`
- `node tests/root_tools_smoke.js`
- `node tests/track_geometry_smoke.js`
- `node tests/trajectory_sector_test.js`
- `node tests/standalone_race_test.js`

The deterministic standalone race suite continued to complete all five tracks and dense traffic cases without changing the existing physics/AI baseline.

### New Online tests

Executed successfully:

- `node tests/online_protocol_test.mjs`
- `node tests/online_room_test.mjs`

Covered room-code and nickname validation, 2–8 capacity, host-only settings, READY state, two-client server start, shared server race ID/start timestamp creation, malformed messages, state sanity validation, angle wrap interpolation, finish ordering/idempotency, host migration, stale reconnect close protection and empty-room storage cleanup. The room test reserves eight player slots and runs a two-connected-client lobby/race/finish flow through the actual `Room` class with mocked Durable Object storage/WebSockets.

### Limitations of this local validation

The test environment does not emulate Mobile Safari rendering, DeviceOrientation permission UI, Cloudflare's production edge network or real mobile packet loss. Those require deployment/manual device testing. Network collisions remain OFF by default because snapshot stability is the priority for the first multiplayer MVP.


## Final Online Multiplayer packaging validation (2026-09-13)

After the final reconnect/Host-leave, race-progress and UI hardening changes, the project was revalidated from the `public/` + Cloudflare Worker layout.

Commands executed successfully:

```bash
npm test
node tests/ai_benchmark.js
for f in public/js/*.js src/*.mjs tests/*.js tests/*.mjs; do node --check "$f"; done
```

Additional final checks covered:

- client snapshot interpolation across the `-π/π` angle boundary;
- 140 ms extrapolation cap and large-correction snap;
- server snapshot rate limiting and finite/speed/displacement sanity;
- basic server-controlled lap progression (impossible multi-lap jumps rejected);
- protocol-version rejection;
- explicit Host leave with immediate migration;
- 2-client lobby/start/finish/return-to-lobby simulation;
- 8-player room capacity;
- DOM-ID integrity for Online UI;
- safe nickname/player rendering without `innerHTML`;
- use of existing `R.TRACKS` for the Online track selector;
- referenced HTML/manifest static assets all present.

The separate deterministic AI benchmark completed 120 traffic runs and all quality flags were true (`hierarchy`, `cleanFinish`, `cleanNoBarrier`, `trafficFinish`, `stressNoPileup`, `stressOffroad`).

Wrangler itself could not be installed in this isolated build container because the package-install network request timed out, so a live `wrangler dev`/edge deployment was not executed here. The checked-in `wrangler.jsonc` follows the current Cloudflare Workers Static Assets + declarative Durable Object `exports` configuration described in the project README. Production/mobile-network behavior should still be verified after the first Cloudflare deployment on two real browsers/iPhones.
