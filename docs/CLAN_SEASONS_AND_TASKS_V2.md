# Clan seasons and tasks — v2 local implementation

## Season clock and scoring

Season identifiers are the UTC date of the Monday start, for example `2026-10-19`. Each season is Monday 00:00 UTC through the following Monday 00:00 UTC. Daily tasks use the UTC calendar date. Player locale and device timezone are not used for server period boundaries.

Confirmed server events enter `clan_competition_outbox` from D1 triggers on the trusted source write. The Worker consumes that outbox into a season event ledger and task progress. Match outcomes require a finished challenge with a persisted winner; territory captures require the server ownership-history row; influence uses the server influence ledger; race finishes use the server progression reward; contributions use the treasury contribution ledger. Client state is not read as proof.

| Event | Season points | Ranking counter |
| --- | ---: | ---: |
| Confirmed clan-match win | 100 | +1 win |
| Confirmed clan-match loss | 25 | — |
| Confirmed district capture | 50 | +1 capture |
| Each completed 24-hour hold, per district | 10 | — |

Ranking is division-local by points, wins, captures, then confirmed influence. Equal metric rows share their competition rank. Promotion/relegation use the saved project default of the top two and bottom two in each division; ties at a quota use the shared rank, so the whole tied group receives the same movement decision. A division with no scored season activity does not move. Division transitions clamp at Bronze and Diamond.

## Divisions and settlement

The five divisions are Bronze, Silver, Gold, Platinum, and Diamond. A new clan starts Bronze. For a season payout, the server uses the division captured in that season's start snapshot; the next division is applied only after that result is archived.

| Division at season end | Clan treasury award |
| --- | ---: |
| Bronze | 10,000 CR |
| Silver | 20,000 CR |
| Gold | 30,000 CR |
| Platinum | 40,000 CR |
| Diamond | 50,000 CR |

A clan receives the division award plus 2,000 CR when it has at least one confirmed match in the season. No confirmed match means no season CR award. The unique season result, settlement row, treasury ledger key, balance change, and division history are written with D1 batches. Per-clan settlement is replay-safe; the season remains `FINALIZING` after an interrupted run and a later Cron continues it. D1 triggers use an outbox because the room Durable Object and D1 do not share a transaction.

Holding rewards are generated for every full 24-hour interval under one owner. The completion event is timestamped just inside the completed interval, so a period ending Monday at 00:00 UTC belongs to the season that elapsed it. Ownership is checked again when its unique hold settlement row is inserted.

The existing hourly Cron expression is unchanged. The competition sweep is added to the existing scheduled handler. No production Cron, Worker, D1, or migration was run or changed in Cloudflare.

## Task configuration

The server creates exactly three daily tasks and three weekly tasks. Their titles, event type, goal, and CR award live in `src/clan-season-config.mjs`; each period snapshots this config into `clan_task_periods.config_json`. The proposed goals and amounts below are adjustable balance defaults from the implementation request, not locked game-economy decisions.

| Period | Task | Goal | Proposed treasury reward |
| --- | --- | ---: | ---: |
| Daily | Гоночная активность | 5 confirmed online finishes | 1,000 CR |
| Daily | Влияние | 100 confirmed influence | 1,500 CR |
| Daily | Казна | 5,000 CR of contributions | 500 CR |
| Weekly | Командные гонки | 5 confirmed clan matches | 5,000 CR |
| Weekly | Территориальная активность | 2 confirmed district captures | 7,500 CR |
| Weekly | Развитие клана | 500 confirmed influence | 5,000 CR |

Each event is unique by event source, each task claim is unique by clan and period, and the claim/treasury ledger/balance update share a D1 batch. UTC reset countdown, progress, completion state, reward, division, standings, and finished-season history are returned by authenticated `GET /api/clan-seasons`.

## Mobile UI and district geometry

The clan overlay now shows daily and weekly task cards, season countdown/division/points/position, the season table, rewards, and previous results. The war roster flow uses a three-player checkbox picker; members already reserved by another active war are disabled. The UI shows roster readiness, live room connection counts, each round score, and final result. Challenge target choice is a mobile select control instead of `prompt`.

District markers continue to use their existing 5000×3000 map coordinates and now overlay the same `ApexCity.drawOverview` rendering used by the game. Seven markers fall inside their corresponding named city areas. `coastal-ridge` remains inside the bay bounds, but the city resolver currently classifies it only as generic `APEX BAY`; the location was preserved and should be visually reviewed during the local iPhone check rather than moved based on an unsupported guess.

## Local verification limits

`npm run test:clan-wars:v2` uses isolated SQLite/D1-style adapters and the existing in-process game room. It covers UTC boundaries, event triggers, task rewards, season awards, all five division reward tiers, hold attribution across two districts, one interrupted finalization/replay, division changes, district handoff, war orchestration, and ordinary room/wager regression.

The browser layout checks are source-based. No physical iPhone 13/14/15/17 or Safari session was available; local acceptance still needs a real-device pass in horizontal orientation, including safe areas, panel scrolling, map labels, war roster selection, and navigation return behavior.

### Local iPhone acceptance checklist

On iPhone 13, 14, 15, and 17 in Safari, rotate to landscape and then back to portrait while the clan overlay is open. Check the top/bottom safe areas, dialog height and scrolling, and that the page behind the dialog does not scroll. Open the map and verify all eight pins against the city artwork, especially Coastal Ridge. Verify that reserved roster members cannot be selected, exactly three available racers enable roster confirmation, each participant can mark ready, connection counts update after joining, and all round and final results remain readable. Close and reopen the overlay, return to the normal race menu, and check that no black frame, duplicate menu, or stale scroll position remains. Repeat after Safari reload and a network interruption.
