# Apex Bay district income (local V2)

The additive schema is in `0025_clan_treasury.sql`, `0026_clan_war_districts.sql`, and `0029_clan_district_income.sql`. The eight seeded districts use the agreed rates: four at 3,000 CR/day, three at 6,000 CR/day, and one at 10,000 CR/day. Ownership, balance, and income entries are read and written only on the Worker/D1 side.

The same treasury slice now supports authenticated member contributions with server-side wallet debit, and leader-only five-slot expansions. New clans start with 15 slots; migration backfills legacy clans to at least 20 while preserving any roster already larger than 20. The cap is 50. Expansion prices by current capacity are 15→20: 20,000; 20→25: 40,000; 25→30: 60,000; 30→35: 80,000; 35→40: 100,000; 40→45: 120,000; and 45→50: 140,000 CR (560,000 total). No contribution cap was specified. The mobile clan panel exposes treasury balance, contribution, next expansion, district income/rates, and recent ledger entries.

`settleClanDistrictIncome` is called from the existing hourly Worker Cron (`0 * * * *`). It prorates each ownership interval against 24 hours, writes an immutable district ledger entry and a uniquely keyed treasury ledger entry in one D1 batch, and advances an income cursor. A repeated invocation replays neither the balance credit nor the ledger entry. When ownership changes, accrued time is attributed through the stored capture timestamp to the prior owner; subsequent time belongs to the current owner. The authenticated read endpoint is `GET /api/crews/district-income`.

## Local verification

Run `node tests/clan_district_income_v2_test.mjs`. Its in-memory SQLite test covers rates/pro-rata accrual, concurrent retries, replay, a change of owner, persistence after reloading state, and rerunning the additive migration. Related local checks include the clan-war orchestration test, online room and wager recovery tests, authentication, physics, bug reports/ghosts, and presence timeout.

District control is implemented locally in `0028_clan_district_control.sql`: influence thresholds, attack caps, 12-hour protection, ownership history, capture settlement, and the responsive district map. These changes have not been applied to D1, staged, or deployed, and no physical iPhone test has been done. Do not enable this code against a database until migrations 0025, 0026, and 0029 are applied in an isolated D1 and the settlement path is verified there. The map coordinates are initial seed data and still need visual confirmation against the Apex Bay rendering before a territory map is accepted.
