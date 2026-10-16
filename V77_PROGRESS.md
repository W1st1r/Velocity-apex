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

## Verification completed

- `npm test` — passed on this checkout, including the existing regression suite and new SQLite/server tests.
- `npm run test:ai` — passed; existing six-track difficulty/traffic benchmark completed. It does not cover all requested vehicle-class/player-skill matrix combinations.
- `tests/case_server_authority_v77_test.mjs` — catalog price/odds parity for eight cases and tuning-price parity across registered cars.
- `tests/economy_case_api_v77_test.mjs` — authenticated server endpoints, case purchase/open, car purchase, tuning, sale, insufficient funds, idempotent retries, and concurrent duplicate request.
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
