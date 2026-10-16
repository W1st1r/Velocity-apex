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
