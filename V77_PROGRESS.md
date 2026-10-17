# V77 implementation checkpoint

Updated: 2026-10-16
Working branch: `v77-full-rework` (PR #13, keep Draft until all release gates pass)

## Completed in this checkpoint

- Kept the existing V77 venue geometry/Extreme work and the three removed decorative map crosses from commit `8f74d64`.
- Added the additive `economy_operations` idempotency ledger; migration 0018 does not rewrite player saves.
- Added a server-owned case catalog generated from the canonical client catalog, with a parity test for all eight cases and all displayed odds.
- Authenticated case buying/opening now charges, draws with server crypto randomness, grants cars/effects or duplicate compensation, and stores the full result atomically with the save revision and request receipt.
- Authenticated garage operations now have server routes for buying cars/effects, selling cars, buying performance upgrades, and buying/selecting styles. Prices and tuning costs come from canonical project catalogs; client-submitted prices/payouts are ignored.
- Client case/store/tuning/sale flows use these routes when signed in; guest/offline flows remain local.
- New account creation no longer accepts a client save snapshot as starting CR/items/progress; it starts from the server baseline.
- Restored the full V77 HTML document after detecting that the first API commit had accidentally truncated `public/index.html`; all existing market/career/modal UI is present again. Added cache-busting versions for the updated account and garage scripts.
- Updated stale V74 release assertions to check the current dynamic UI/data source instead of removed static markup.

## Verification completed

- `npm test` — passed on this checkout, including the existing regression suite and new SQLite/server tests.
- `npm run test:ai` — passed; existing six-track difficulty/traffic benchmark completed. It does not cover all requested vehicle-class/player-skill matrix combinations.
- `tests/case_server_authority_v77_test.mjs` — catalog price/odds parity for eight cases and tuning-price parity across registered cars.
- `tests/economy_case_api_v77_test.mjs` — authenticated server endpoints, case purchase/open, car purchase, tuning, sale, insufficient funds, idempotent retries, and concurrent duplicate request.
- `npm run test:v74` — passed after correcting stale markup checks; market, career, mobile layout and free HUD regression tests pass.
- Migration 0018 ran against the test SQLite database alongside all existing migrations; saves were not reset.

## Still blocking release

- `/api/account/save` still accepts a client-controlled full save snapshot. This must not be declared secure or deployed until the remaining client economy/progression flows have been moved or safely isolated.
- Solo race/drift and career payouts/progress are still client-computed; there is no independent server race simulation/checkpoint proof yet.
- Other protected save fields (EXP/level/career/achievements and some inventory/selectors) need a safe settings-only save protocol and compatible server operations.
- Economy analysis/rebalance across all income/sink sources and the requested long-range progression simulations remain incomplete.
- Full minigame play/visual QA, physical iPhone Safari, TEST account transactions, production backup/migration rehearsal, production deploy, and final PDF remain unverified/not done.

## Next steps

1. Audit all remaining writers of protected fields and route them through server operations or explicitly keep them offline-only.
2. Add a settings-only account save protocol with old-client compatibility that cannot overwrite server-owned fields.
3. Implement/strengthen race and career reward validation, then cover retry/concurrency and save migration behavior with integration tests.
4. Complete economy/progression analysis and the missing map/AI integration coverage.
5. Re-run CI and inspect all release gates. Keep PR #13 Draft and do not merge until the data-integrity/security gaps are closed.

## 2026-10-16 - Authoritative solo-race implementation checkpoint
- Added additive migration 0019: race sessions + bounded input receipts; existing saves are not rewritten. Migration replay preserves the legacy fixture byte-for-byte.
- Added shared fixed-60Hz simulation, generated from existing content/track/car/AI sources at npm postinstall. Browser and Worker use the same source and a source-version hash. Exact speed-profile cache keys avoid warm-cache-dependent simulation.
- Server session start validates owned car, upgrades, owner overrides, mode, difficulty, track and career unlock. Input endpoint accepts only four bounded controls per frame; server calculates positions, checkpoints, laps, collisions, AI, time and finish. Server elapsed time bounds accepted simulation frames.
- Server finish uses the existing economy operation ledger and one D1 transaction for CR, career progression, EXP, statistics and paid session status. Fresh transaction tokens guard all extra writes. Input and finish replay/concurrency are tested; past input receipts are pruned and removed after settlement.
- Browser authenticated solo/career/drift paths now use the authority client; unacknowledged controls are retained, retried with the same sequence, and corrected to server state. Network timeout/backoff and a bounded queue prevent unbounded retries.
- Passed targeted tests: race_authority_v77_test (3371 career frames; fake results/positions/clock; EXP failure rollback; concurrent payout; expiry); engine normal (3304 frames) and drift (3554 frames) with repeated exact restore; transport lost-response test; existing economy_case_api_v77_test; physics_smoke; account_auth_smoke; syntax/diff checks.
- Added WebKit CI test for actual game page race start, controls, lost post-commit response, no premature payout, pause/resume on two landscape iPhone profiles. NOT yet executed for this checkpoint.
- Still Draft / do not release: account/save snapshot remains open; finish migrating online drift, cosmetic selections/local record writers and other remaining client changes before enforcing settings-only saves. Security cutover, production backup/restore rehearsal, Worker CPU/latency validation, long-term economy rebalance, expanded AI matrix and map QA remain required.
- Next: inspect new CI browser result, fix integration issues; then complete the remaining client-writer migration and enforce the snapshot allowlist with forged-save tests. No new PDF or production deployment at this checkpoint.

## 2026-10-16 - Owner and selection migration checkpoint
- CI run 38935731769 for 532a5d9 passed, including the new actual-page race WebKit integration on iPhone 13 Mini and iPhone 17 Pro Max landscape emulation, then the full existing npm test/test:v74 gate.
- Migrated garage equipped car/effect selections to an ownership-checked server operation. Existing owned limited cars remain selectable without a repurchase.
- Migrated ROOT self credit/inventory/case actions to the same server economy ledger, behind the existing OWNER session and server unlock. Server always targets the authenticated owner; client target IDs have no effect. No production owner operation was performed.
- Added bounded streaming JSON reads, so missing/spoofed Content-Length cannot bypass the request size limit. Added Worker dry-run bundling to CI.
- Passed targeted owner/self SQLite authorization/unlock, self-only target, idempotent/concurrent delta, negative amount/resource validation and legacy-field-preservation tests; equipped/unowned-car tests; full new race authority/transport tests; existing root tools/admin console/account/garage smoke checks.
- Next blocking writers identified precisely: ordinary online-room wagers still use client creditSnapshot and online.js reconcileSettlement/changeCredits; online track-drift bonus is still calculated in game.js. Free-roam drag already has its own server debit/settlement and must not be duplicated. Move ordinary room wagers to persistent server escrow and replace online result claims with input-based authority before enabling snapshot settings-only enforcement.
- Additional release gate: benchmark the shared race runtime under actual Cloudflare CPU/latency limits (local cold track construction is substantially more expensive than a cached input batch). No paid-plan or production setting was changed.

## 2026-10-16 - Race integration follow-up
- CI 38936880710 (d8b0755) passed, including Worker dry-run and WebKit gates.
- Explicit race restart now settles a completed pending result or cancels an active session before creating a fresh one; reload recovery still resumes. Added transport regressions for all three paths.
- Restored browser-only player cosmetics/effect and bot paint after authoritative corrections; synchronized live drift combo/chain HUD and control feedback; paused sessions no longer restart engine audio. Physics and reward formulas unchanged.
- Targeted transport tests and JS syntax checks passed. Online authority/escrow, snapshot cutover and remaining release gates above remain next; no production changes.

## 2026-10-16 - Persistent ordinary-room wager checkpoint
- Added additive migration 0020 and room-wager-escrow.mjs: multi-account debit, winner payout and refund use atomic D1 batches and unique durable operation tokens. Duplicate race keys cannot charge twice or change participants/stake; competing settlement/spend requests cannot double pay or overdraw. Failed batches roll back the journal and balances together.
- Wired ordinary room wager confirmation to actual server balances, lock/payout/refund to the journal, and new-client wallet display to confirmed cloud state. Existing free-drag code remains separate and unchanged. Client supplied balance no longer gates wager confirmation.
- Persisted a pre-lock Durable Object marker; interrupted starts refund once on recovery. Durable payout/refund journal reconciles room state after a crash between D1 and DO writes. Tests use isolated SQLite saves, including legacy fields; no production data touched.
- Passed: escrow unit/integration cases (replay/conflict/concurrency/rollback/migration replay/legacy preservation), actual Room wager lock/payout/leave refund, interrupted-start and interrupted-payout recovery, existing room capacity/lifecycle, online UI/network, presence timeout and free-drag synchronization tests. WebKit fixture now also checks explicit fresh race restart; CI execution pending for these changes.
- IMPORTANT: multiplayer finish/checkpoint messages are still client-derived, so server wallet custody does NOT yet prove fair race results. Snapshot writes also remain open until all reward paths migrate. Keep PR Draft and do not release.
- Next: inspect CI for this checkpoint; implement input-driven shared multiplayer authority and migrate online drift payout, then finish economic-writer migration and settings-only snapshot cutover. Existing production backup/restore and CPU budget gates, long-term balancing, AI matrix and map QA remain required. No interim PDF.

## 2026-10-16 - Cross-storage concurrency follow-up
- Added ordinary-room event serialization for WebSocket messages, disconnects and alarms so an awaited D1 reservation cannot race a leave/refund callback. Free-roam state fan-out remains on its existing path.
- Added an actual Room concurrent start/leave test; balances are conserved and the journal is refunded once. Fixed failed wallet refresh markers to allow a later retry.
- Targeted Room lifecycle/escrow/recovery/concurrency, presence timeout, account auth smoke and online UI tests passed. CI for a5752bf was in progress when this follow-up was prepared; no deployment requested.

## 2026-10-16 - Regression and browser follow-up
- CI 38940204112 executed and passed the expanded actual-page WebKit race scenario on iPhone 13 Mini and 17 Pro Max landscape, including fresh restart. The job then failed an old prefix smoke assertion requiring the historical online.js version query; retained that compatible query and added the new authority cache parameter. Local npm test and test:v74 both passed after this correction.
- Added an explicit in-flight-autosave restart fixture. Account flushSave now shares an active save promise rather than returning a spurious failure, has a 15-second network timeout, and reschedules a newer queued snapshot. Targeted account/UI smoke and syntax checks passed; new WebKit variant awaits CI.
- Server-wallet display updates no longer queue another snapshot write. Added escrow overflow/fractional-balance rejection tests (passed).
- Added successful-case-visual-result caching keyed by the fixture's exact CSS/JS/lockfile inputs, avoiding repeated screenshots of unchanged cases. Cache is populated only by a successful job. New race/mobile and economy checks remain live.
- Continue from server-controlled multiplayer input/result validation and online drift reward migration. Do not enforce preferences-only snapshots or publish until all currently used economic actions have server replacements. No production deployment or intermediate PDF.

## 2026-10-16 - Shared multiplayer-authority engine foundation
- Added RaceRoomSession, reusing existing Car/Track/SAT and drift-score physics for independent human control streams, shared collisions, server-derived checkpoints, lap times, ranks, drift scores and finishes. It freezes server-owned tuning per entrant and restores exact world state. This module is not yet wired to production online messages; do not claim online anti-cheat complete.
- Added RoomRaceInputs: participant-bound control-only packets, per-participant sequences/replay receipts, strict untrusted-field rejection, bounded future/queue windows, 200ms server input buffer, neutral/braking fallback for lost controls, bounded catchup and state restore. Coordinates/laps/rewards are never accepted by this control channel.
- Passed actual normal (1816 frames) and drift (8730 frames) two-stream physics completion/restore tests, plus fake-field/identity/clock/replay/queue/restore tests. Existing solo authoritative race, normal/drift restore and transport tests also passed after adding multiplayer source to the runtime hash.
- Concrete next integration: freeze authenticated room entrants from D1 at start; persist RoomRaceInputs with the room; add a versioned control packet to protocol/network client; derive broadcasts/finishes and online drift rewards from the shared world; remove client-state economic finish paths. Then finish remaining writers and enforce settings-only saves. CI for 1589dad is still pending; inspect before repeating checks.

## 2026-10-16 - CI portability correction
- Run 38940800585 passed Worker bundling, server race tests, and WebKit including restart while an autosave is deliberately in flight on both mobile profiles. Its final regression failed only the new MAX_SAFE_INTEGER test fixture: Node 22's SQLite json_set serialized a bound REAL as one CR less before the operation was invoked. The production escrow already casts resulting balances to INTEGER. Corrected the fixture to cast its setup value to INTEGER and assert exact storage before testing overflow; targeted test passes locally. Next CI must verify on Node 22.

## 2026-10-16 - Verified checkpoint
- CI 38941498361 for 1d22678 completed SUCCESS: full npm test/test:v74, Worker dry-run, shared solo/multiplayer physics/input checks, and actual-page WebKit race/recovery/autosave/restart tests. Deploy skipped as required for Draft PR.
- Inspected both race WebKit screenshots from artifact 12063197624. The captures caught the pause overlay before its entry animation finished, so they show the race field but are insufficient evidence of pause-button geometry. Updated screenshots to fast-forward CSS animations and added in-viewport bounds checks for every pause control; this strengthened visual assertion awaits CI. No physical iPhone was used.

## 2026-10-16 - Online protocol authority integration
- Confirmed branch 7842d4a and unchanged main faf8e54; CI 38942141274 passed, including settled pause-button geometry. Continued the same branch.
- Connected RoomRaceInputs/RaceRoomSession to authenticated ordinary/media room start, control packets, server-clock ticks, authoritative world broadcasts, sync and reconnect. Real DB rooms now require the matching runtime on READY/START; client coordinate/finish messages cannot issue their economic results. No production deployment.
- Extracted the shared D1 ownership/tuning freeze for solo and online. Starter ownership remains compatible with legacy saves; duplicate account slots and unowned/disabled vehicles are rejected before escrow is touched. Public race bootstrap contains selected performance only, not an entire account inventory.
- Persisted server physics before issuing wager/EXP/drift/media rewards. Online drift CR is calculated from server drift score using the existing medium online reward formula; client authenticated drift payout is removed. Existing idempotent escrow/progression/media journals are reused. Finish sync can recover confirmed reward display after disconnect.
- Added browser RoomRaceClient with fixed-step prediction, authoritative correction, bounded controls, one in-flight sequence/retry and reconnect recovery. Game rendering/control flow uses this client for authoritative rooms; server wallet display does not save a client CR snapshot.
- Passed real Room/D1 normal-race integration (4404 actual physics frames), ownership/runtime/fake-finish/field/clock checks, duplicate-account rejection, wager+EXP settlement, DO eviction, replay, and injected payout-failure recovery. Passed two-client loss/retry/disconnect/resume/prediction transport tests, solo/room simulation tests and targeted existing online/presence/free-drag checks.
- Added a two-page WebKit fixture using actual game/Worker/Room/D1 handlers with Playwright-routed WebSocket transport, checking real lobby controls, movement, lost ACK, reconnect, fake finish rejection, stakes/refund and landscape HUD. This new browser scenario has not yet run; CI is the next gate (do not attempt local WebKit dependency installation).
- Release gates still open: migrate remaining account writers and settings-only save cutover; handle legacy active-room migration explicitly; backup/restore and Worker CPU validation; 3–5 month economy, expanded AI matrix/map QA and final regression. Do not merge or deploy before these gates. No intermediate PDF.

## 2026-10-16 - Account snapshot authority cutover
- Replaced public account/save writes with a strict shared preference allowlist. Full client save snapshots return CLIENT_UPDATE_REQUIRED (409); economic/progress/ownership/unknown fields in a preference patch are rejected. Internal authorized server mutations continue using the existing CAS writer. Client save transport sends preferences only, retries revision conflicts, accepts confirmed server state and preserves settings queued during an in-flight save.
- Added non-destructive migration 0021 and first-read checkpoints of exact account JSON/revision. No balances or inventories are recalculated or reset. These per-account checkpoints are not a substitute for the final production D1 backup/restore release gate.
- Moved Free Roam garage selection persistence to an ownership-rechecked server CAS mutation; the client refreshes confirmed state. A guest run cannot credit an account after a mid-race login.
- Passed isolated SQLite cutover tests: old save migration twice, backup/copy/restore, immutable raw checkpoint, forged CR/cars/upgrades/EXP/levels/career/owner snapshots, forbidden settings fields, CSRF/auth/foreign account, legitimate controls settings, a concurrent case purchase, request replay, and real Free Roam garage selection. Legacy inventory/unknown fields and separate player_progress EXP remain preserved. Solo/online race tests still pass after the cutover.
- CI 38946091739 for 0f1d6e8 passed bundling and server tests, then reached real WebKit online controls/lost-ACK recovery but failed the reconnect assertion. The fixture installed WebSocketRoute.onClose without forwarding the close handshake; local Playwright type documentation explicitly says this disables automatic forwarding. Added explicit close forwarding. New browser fixture also tests direct forged snapshot rejection and the real account client's preference-only flush. Await CI, no local WebKit install retries.
- Next: verify new CI/repair any browser integration error, then audit remaining server-only transaction concurrency and legacy active-room cutover; complete economy/AI/map gates. Snapshot arbitrary economic assignment is now closed in this branch, but full anti-cheat/transaction-security acceptance is not claimed (Free Roam position-derived activity checks and older multi-account transactions still need targeted validation). PR remains Draft; no deployment/PDF.

## 2026-10-16 - Atomic multi-account market
- Extended the same economy_operations receipt/token model to atomic multi-account CAS batches (account-transactions.mjs); no second balance store was introduced. A batch covers participating saves, escrow/listing/order state and history. Repeat receipts return the original result with the actor's current confirmed save.
- Replaced separate buyer/seller writes and compensating market rollbacks with this mechanism. Listing/order creation, cancellation, purchase and fulfillment require a stable request ID from the existing client transaction transport. Server prices and escrowed tuning are used; paid customization now transfers/returns with the car. Invalid or competing requests cannot partially move assets or CR.
- Passed isolated real SQLite market tests for simultaneous duplicate creates, competing buyers, cancellation vs fulfillment, insufficient/foreign/price cases, same-request retries, rollback injected after account writes and before history, tuning/style transfer and total CR plus escrow conservation. Updated the older source-contract smoke to assert atomic receipt guards instead of the superseded processing-state implementation.
- Existing legacy processing rows are left untouched; final production preflight must check/reconcile any such interrupted transactions from the older implementation. No automatic speculative refunds or balance changes were made.
- Next after CI feedback: atomic referral/promo/clan/drag edge cases and legacy active-room handover, then authoritative activity validation and economy/AI/QA gates. No production deploy/PDF.

## 2026-10-16 - Preference flush ordering regression
- Run 38947517153 (8fd314a) passed bundling/server races, but the new WebKit cutover assertion found that flushSave could return the older in-flight write while a newer mute setting was still queued. Added saved-generation draining so all joining callers await the newer pending settings, without duplicate writes.
- Added a fast test that executes the real account.js client against a deferred fetch and minimal DOM: two concurrent flush callers, later queued preferences, economic-field stripping, and pagehide. It passes. Found and removed the old full-snapshot pagehide request as part of that check; unload now sends preferences only. Failed preference-module loading cannot fall back to an unsafe snapshot.
- The corrected WebKit close forwarding and preference ordering still await their next CI run. No production changes.

## 2026-10-16 - Cloud preference echo and atomic referral upgrades
- CI 38949050001 passed bundling and server authority, then solo WebKit could not start: applying cloud settings invokes actual control callbacks which queued identical preferences forever while flush drained generations. Deduplicated preference-equivalent queues; the real account client test now includes both cloud echo callbacks and passes. Await next WebKit CI.
- Referral level purchases now use the existing atomic account transaction ledger: server cost, expected target level, verified invites, account debit, profile level/spend, purchase audit and receipt commit together. Client uses the existing stable request transport. Old missing-ID clients receive update-required.
- Passed isolated SQLite referral purchase rollback injected after account updates, concurrent duplicate requests, competing next-level purchases, server cost, old receipt replay after another purchase, and legacy field preservation; existing referral configuration smoke passes. Referral welcome dual-account awards are still the next transaction gap; do not claim all referral security closed. No deployment or intermediate PDF.

## 2026-10-16 - Atomic promo and referral welcome recovery
- Replaced promo use reservation, redemption and account reward compensation with one existing-ledger CAS batch. Competing last-use requests cannot both redeem; lost-response retries return the original receipt even after code disable/reward edits. Existing legacy redemptions are not re-awarded.
- New referral welcome intents freeze tier/reward alongside their processing row in one D1 batch. Both accounts, limits, awarded status and receipt commit atomically; authenticated bootstrap recovers interrupted new intents. Existing ambiguous legacy processing rows remain untouched and require release preflight reconciliation. No speculative refunds.
- Isolated tests passed: rollback injected after account writes, concurrent last promo use, server reward and replay; dual-account welcome rollback, durable recovery after inviter tier change, receipt replay, competing identical device gate and legacy pending preservation. Full npm test reached the final new suites without assertion failures.
- CI 38949715414 for 4ebdce1 has now passed actual-page solo and two-client online WebKit, including lost ACK/reconnect and preference cutover. Final regression job was still running at last inspection. No physical iPhone or production deployment.
- Next: durable Free Roam drag escrow and input-authority for economic activities, legacy room/market/referral preflight, then economy/AI/map and release gates.

## 2026-10-17 - Atomic Free Roam drag stakes
- Replaced direct drag D1 balance updates with the existing durable multi-account room escrow ledger. The room intent and immutable authenticated account IDs are saved before debit; replay of the same race ID cannot charge twice. Winner/refund settlement uses durable journal status and rejects conflicting outcomes.
- Free Roam room restores reconcile V77 drag intents from the escrow journal. A crash before debit removes the uncharged challenge; a crash after debit restores locked state; a crash after refund/payout clears only after reading the durable settlement. A failed refund leaves the challenge for retry. Old ambiguous drag wagers without the V77 marker are deliberately preserved and rejected for manual reconciliation, never guessed or re-credited.
- Serialized drag join/leave, room alarms and disconnects against each other while keeping frequent ordinary state fan-out on its existing path.
- Replaced the drag money test's fake balance map with SQLite. Verified lock/payout/draw, immutable legacy save fields, DO failure after D1 lock, lock replay, refund journal recovery, conflicting settlement rejection, and protection of an ambiguous legacy pending stake.
- V74 cache-bust assertion now accepts the existing authority query parameter while preserving the V74 asset marker. Its focused check passes. `npm run test:v74` is still running its existing 50-track career loop; no result claimed yet.
- CI run 39004550015 on 7afc39a passed Worker bundling, server race suite, and both iPhone-landscape WebKit flows; its final regression job was in progress. New drag changes await targeted race/Worker and PR CI.
- Remaining: CR/EXP in Free Roam activities still depends on server-derived metrics built from client-reported vehicle state in non-race rooms; this is not full physics anti-cheat. Economy balance simulation/repricing and broad AI overhaul/matrix, full arena browser playtests, production D1 backup/restore/preflight, TEST-account live QA, deployment and final PDF are still open. Keep PR #13 Draft and do not publish yet.

## 2026-10-17 - Atomic Media Event prize settlement
- Replaced sequential participant credits and separate terminal-event writes with the existing D1 account transaction journal. Winner payouts (up to the real 12-player minigame limit), event result/status, account revisions, and the idempotency receipt commit together. Prize refunds use the same atomic pattern.
- Event creation now reserves the CR and inserts its event row atomically, with a required client request key; the browser reuses that key on retry, and both Durable Object create routes replay the same event instead of replacing its room. Room-create failure/refund is retained as a cancelled event rather than deleting the audit record. Fixed the daily event limit comparison and added an atomic SQL guard against concurrent limit overrun.
- Old ambiguous `SETTLING`/`REFUNDING` rows fail closed for manual release reconciliation; no inferred second payout/refund. Zero-prize events only transition terminal event state, without touching account balances.
- Added SQLite integration coverage for concurrent duplicate settlement, full 12-winner distribution/conservation, injected failure rollback and retry, one-time refund, and fail-closed legacy settlement. Updated the old static check for the now-atomic status behavior.
- Targeted checks passed: `media_atomic_v77_test` (including 12 recipients, request replay, room-create refund), `media_v50_test`, `market_atomic_v77_test`, `free_map_drag_v34_test`, and Node syntax checks.
- CI run 39005000256 (commit `6d16d44`) completed successfully, including the prior WebKit and full regression jobs. CI run 39005361493 (commit `8c32831`) was still running the online WebKit navigation step when the next Media Event creation extension was implemented. That extension still needs its own Actions run. No merge/deploy; economy simulation, AI expansion, map play QA, production backup/preflight and live-account QA remain open.


## 2026-10-17 - Chat recovery and current GitHub state
- Verified PR #13 is open, Draft, and targets `main`. Current branch `v77-full-rework` HEAD is `a7ddd04d89c16dc2e48386ee55a89e61680efabe`, parent `8c32831a33318e3c0a3e9faf6d14052f07cd4397`. The last commit is `fix: make media event creation replay-safe`; its GitHub Actions run 39005729393 completed SUCCESS. Worker bundle, server-authoritative race checks, WebKit race/recovery, and server/mobile navigation passed; Cloudflare deploy was skipped because this is a Draft PR.
- The interrupted-upload check found no newer or partial GitHub ref to restore. The AI source and benchmark are present on the branch; path history shows the AI source last changed in `409cbac9`, before subsequent economy/media commits. Do not overwrite it with an unavailable local copy.
- Current saved AI includes stable per-bot talent profiles, predictive nearby-car gap checks, trajectory candidate scoring, safe side-by-side spacing, dynamic pass-side selection, curve-aware speed targets, braking-distance control, throttle smoothing, and distinct drift control. `tests/ai_benchmark.js` covers six tracks, four difficulties, clean-air laps and traffic counts 3/7/13 over two deterministic seeds, with hierarchy, finish, contact, off-road, and reward-rate assertions. The benchmark has not been rerun in this recovery turn.
- This confirms the AI code already present in GitHub; it does not establish whether uncommitted files in the previous Work session were lost. No local repository checkout or recoverable local changes were available in this workspace.
- Release remains blocked: no full vehicle-class × track × difficulty × field-size × upgrade AI calibration or human playtest; no full CR source/sink and 3–5 month progression balance analysis; no comprehensive minigame gameplay/map browser QA; no production D1 backup/restore rehearsal or legacy pending-transaction reconciliation; no live TEST-account transaction QA. Do not merge or publish V77 until these gates are completed and validated. No production data or account was changed.
- Next low-redundancy action: continue from HEAD above, run the missing targeted economy/AI/map release gates only where their evidence is still absent, append results here, and keep PR #13 Draft until the release gates pass.


## 2026-10-17 - Recovery checkpoint CI result
- CI run 39009076133 for recovery checkpoint `169c2fcb55397ac194fbcd91648ffa82a59aaaa0` completed SUCCESS. Worker dry-run, authoritative race tests, race/reconnect WebKit, `npm test`, and `npm run test:v74` all passed. Deploy remained skipped for the Draft PR.
- This run did not execute `npm run test:ai`; its previous passing result remains the last benchmark evidence. No physical iPhone Safari, full AI vehicle/upgrades matrix, or production-data rehearsal was performed.


## 2026-10-17 - Fleet and dense-traffic AI calibration
- Baseline AI benchmark reproduced one stress failure: 13-car Medium traffic on Aurora Grand Loop (11.77s off-road, 3 barrier impacts). A general density-based speed reduction was rejected because it caused new barrier/off-road failures in other hard/extreme stress runs.
- Added a Medium-only density-aware following gap, capped at +36 world units. This moves braking response earlier in dense packs while leaving Easy/Hard/Extreme speed profiles unchanged.
- Expanded `tests/ai_benchmark.js`: real stats for all 42 shop cars across BASIC/SPORT/PREMIUM/RARE/LEGENDARY/LUX; 924 one-lap simulations across stock, each individual level-5 upgrade, all level-5 upgrades, all four difficulties, and technical/high-speed tracks. Verified monotonic stat gain for every car at levels 0–5.
- Local Node 24 simulation passed the full legacy matrix plus the new fleet matrix: 144 traffic scenarios, 1,315 position changes, no stress threshold failures, all 42 models and 924 fleet runs finished without barrier hits. Mean CR/hour on the model/upgrades matrix: Hard 8,806 vs Extreme 9,228 (1.048×, under the 1.15× cap). This is local simulation evidence; GitHub Actions is the next required check.
- Added the fleet benchmark to the PR workflow and refreshed the AI script cache-bust in the game page.


## 2026-10-17 - Release gates after AI fleet CI
- GitHub Actions run 39010033643 for `16e1402cdbd2d56e5b1f0d1c8deab0a719f9beb6` completed SUCCESS: Worker dry-run, server-authoritative race tests, WebKit race/reconnect, `npm test`, `test:v74`, and the new 42-car/924-run AI fleet benchmark all passed. Unchanged case visual checks used the successful CI cache. No physical iPhone was available; mobile QA is WebKit emulation.
- Economy controls verified in the executed suite: reward receipts are idempotent; progression activity is capped at 1,800 CR/rolling hour and 6,500 CR/24h, online-time credit at 720 CR/24h; case RTP simulation constrains each case to 79–81.5%, with canonical server/client price parity. The suite includes career, duplicate award, rollback/retry, and authority checks. No economy code change was justified by a failing test; a dedicated 7–150-day behavioral forecast was not run in this checkpoint.
- Production database was not accessed or changed. Release blocker: `.github/workflows/deploy.yml` deploys the Worker but contains no D1 backup or migration-apply step. The cutover test proves local backup/migration/recovery behavior, not a production backup. Before merging/deploying, establish the approved production D1 backup and migration sequence; do not infer production safety from the local test. PR remains Draft pending this release gate.


## 2026-10-17 - Safe production D1 release pipeline
- Added `scripts/d1-release-safety.mjs` and a CI test that simulates the pre-production upgrade on an isolated SQLite database. It snapshots/restores the fixture, exercises migrations 0015-0021 (including repeat application of V77 migrations 0018-0021), runs SQLite integrity/foreign-key checks, and asserts preservation of CR, car ownership/upgrades, EXP, pending payment and market orders, and active race/wager records. The test passed locally on Node 24.
- Replaced automatic main-branch Worker deployment with a separate manual release workflow. It requires main SHA confirmation and a production confirmation choice, checks successful CI for that exact main SHA, validates the pre-V77 migration ledger, exports and locally restores the pre-migration D1 snapshot, encrypts the export using an environment secret, stores only the encrypted export as a 30-day Actions artifact, applies only Wrangler-tracked unapplied migrations, verifies post-migration state before deployment, then publishes and smoke-tests the Worker.
- Production has not been accessed. The release workflow expects environment secret `D1_BACKUP_ENCRYPTION_KEY` (32-byte hex) in addition to Cloudflare credentials. Cloudflare documents that a running D1 SQL export blocks other database requests; schedule the confirmed release for an acceptable maintenance window. The release workflow is manual and must be run only after the explicit action-time production confirmation.
