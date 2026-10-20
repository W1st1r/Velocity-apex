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
- In iPhone Safari and installed PWA, open a verification/reset email link from Mail; confirm the fragment disappears from the address bar, the correct screen opens, a valid link succeeds once, and an expired link offers a new request. Confirm password inputs remain usable with the iOS keyboard and returning to login works.
- With Resend configured, confirm the verification, reset and password-changed messages arrive in a real mailbox; test unknown email response without revealing account existence. This delivery check has not been performed in the local environment.
- Check transitions with Reduce Motion enabled and normal animation; record any dropped frames or persistent overlay.

Next development is limited to player physics, UI/chat and versioning. Keep work local until Cloudflare Git integration safety is independently confirmed and the owner authorizes pushing; do not publish 2.0. Bot tuning is explicitly deferred.

## Checkpoint update — 2026-10-20

- Isolated the V2 metric profile to player cars. `R.RACE_PHYSICS`, legacy vehicle stats/upgrades, steering thresholds, grip, drag and speed-based rendering remain in their pre-2.0 world-unit profile for bots and racing-line planners. `R.PLAYER_RACE_PHYSICS` and `applyCarPerformance()` opt human cars into km/h-derived world units; online room cars and free-roam loadouts use that path. No edits to `ai.js`, `racing-line.js` or `track.js`.
- Added `tests/player_bot_physics_isolation_v2_test.mjs` and registered the new player/bot isolation, race-start guard and chat-delivery regressions in `tests/run_all.js`.
- Hardened race-start single-flight and error recovery: double starts/navigation during startup are blocked, setup/career/mode panels become inert while startup awaits the server, and the previous screen remains available if asynchronous startup fails.
- Free-roam chat now waits for a server echo before showing a sent message as delivered, correlates acknowledgements, reports server rejection and restores a draft after rejection/timeout. Mobile viewport/keyboard geometry is recalculated while chat is focused; pending state is cleared on enter/leave.
- Targeted checks passed: metric physics/FPS test (30/60/120 FPS distance spread 0.5%; 200 km/h coast covers 107.4 m in 2 s), isolation test, player physics smoke, car upgrades/catalog/geometry, owner runtime, free chat moderation/delivery, chat/mobile HUD, navigation guard, deterministic race session and room engines, race client recovery, online authority, app-version smoke, mobile navigation and account-auth smoke. Race runtime generation/check and `git diff --check` passed.
- Not rerun: the known full-suite bot trajectory gate failure and related AI benchmark; bot behavior remains outside this work. No physical iPhone/iPad; WebKit launch remains blocked by missing host libraries as recorded above. Existing PR #17 remains separate and untouched; email recovery is not duplicated in this branch.
- Remaining: broad UI visual review on a physical iPhone; complete new ghost, bug-report, clan treasury/progression and territory systems are still future implementation stages. This checkpoint only closes the current player-physics isolation/chat acknowledgement/navigation reliability slice.
- Local checkpoint: `0ad6c375e6a9b6ccbfa144d99ed8e3fe18271993` (`fix: isolate 2.0 player physics and harden chat navigation`). This code/progress slice is committed locally; no push, merge, deploy, production D1 access, or PR #17 changes. The branch remains open for the next requested stage.
- A follow-up guard also blocks settings/menu/modal navigation while an async race start is pending; `game_transition_guard_v2_test.mjs` and syntax/diff checks pass.
- Latest local checkpoint: `c1ae1689d033c0cb20cc1a77789ed510e58bcfa4` (`fix: lock navigation during async race startup`).

## Account recovery, network resilience and resource version checkpoint — 2026-10-20

- Added additive local D1 migration `0022_account_recovery_v2.sql` for verified/pending email ownership, hash-only email-verification and password-reset tokens, and hashed rate-limit keys. It adds no columns to existing player rows and does not alter saves, balances, cars, crews or progress. If application rollback is needed, retain these additive tables and their email state; do not drop them as part of a code rollback.
- Existing accounts can link/change an email only from an authenticated session after re-entering the current password. A new address becomes active only after its one-time verification link is used; the previous verified address remains active until then. An address is unique across accounts. Accounts without a confirmed email must contact support for manual ownership review; a nickname alone cannot reset access.
- Added 256-bit random verification/reset links, SHA-256 token hashes only in D1, 20-minute expiry, single-use claims, same-origin POST checks, per-IP and per-account/email hourly limits, neutral reset-request responses, banned-account checks, and password reset through the existing PBKDF2 format. Successful resets revoke all account sessions while leaving `player_saves` untouched. Reset email delivery runs through the Resend HTTP API; no sender or key is hard-coded.
- Added login-screen recovery UI, email-link screens, profile email linking, safe fragment token handling (removed from address bar before API use), iOS-sized inputs/safe-area layout, explicit expired-link/offline feedback and 15-second network timeouts. Account status refreshes on page restore.
- `version.json` keeps published `V77` and internal `2.0.0-dev`, and now separates resource cache version (`2.0.0-dev.20261020.2`) and protocol version (matched to `src/protocol.mjs`). The stamping script applies the resource version consistently to linked JS/CSS. No Service Worker exists, so no worker cache lifecycle was added. No public/release channel was changed.
- Tests added: `account_recovery_v2_test.mjs` and `account_recovery_ui_v2_test.mjs`; recovery is included in the existing standalone test runner before the known bot test gate. Targeted SQLite tests cover email claim/change and collision, one-time/hash-only/expired tokens, neutral unknown-email responses, per-email rate limiting, origin protection, new/old password behavior, session revocation and save preservation.
- Targeted checks passed on this checkpoint: recovery backend/UI tests, version test, account auth smoke, transition guard, chat delivery regression, car upgrades, deterministic race session engine, owner-panel migration/authorization test, syntax checks and `git diff --check`.
- External mail has not been delivered in this environment; tests intercept the Resend HTTP request. Before any release the owner must configure a Resend API key as a Worker secret, verify a sender domain/DNS with the provider, set `EMAIL_FROM` and `PUBLIC_APP_ORIGIN`, then perform a real inbox delivery check. Do not state mail delivery is live until that check passes.
- Migration was applied only to in-memory SQLite during tests. No Cloudflare account, production D1, deployment, push, merge, release or PR #17 was accessed/changed. No physical iPhone/iPad is available; the listed real-device checklist remains required.
- Local code checkpoint: `ee0a1e656116460270369215fe75d7ffcd3debc9` (`feat: add secure account recovery and versioned app resources`). This progress note is being recorded in a follow-up local documentation commit. The working branch remains `velocity-apex-2.0-dev`; no push, merge, deploy, production database access or PR #17 change was made.
