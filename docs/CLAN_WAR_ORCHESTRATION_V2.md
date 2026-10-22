# Clan war orchestration (local V2 slice)

This additive slice is backed by `0024_clan_war_orchestration.sql`, `0027_clan_war_rounds.sql`, `0028_clan_district_control.sql`, and metadata refresh `0030_clan_district_labels.sql`. It adds challenge lifecycle, locked 3+3 rosters, per-account reservations, readiness, private `CLAN_WAR:<uuid>` Durable Object rooms, and server-confirmed multi-round results. Territory capture and server-confirmed influence are also implemented in this local slice; no war CR/EXP rewards are issued.

## API

All routes require a current authenticated game session. Mutating routes reject a mismatched browser origin. Crew identity is read from `crew_members`; leader-only actions are checked against `crews.leader_id` on the server.

| Route | Purpose |
|---|---|
| `POST /api/clan-wars` | Leader creates a challenge with `defenderCrewId` and `idempotencyKey`. |
| `GET /api/clan-wars` | List challenges for the caller's current crew. |
| `GET /api/clan-wars/:id` | Read a challenge if the caller belongs to either crew. |
| `POST /api/clan-wars/:id/decision` | Defender leader accepts or rejects. |
| `POST /api/clan-wars/:id/cancel` | Attacker leader cancels before a race starts. |
| `POST /api/clan-wars/:id/roster` | A crew leader submits exactly three current members; first submission locks that crew. |
| `POST /api/clan-wars/:id/ready` | A rostered player marks their own account ready. Six ready accounts provision the private room. |
| `POST /api/clan-wars/:id/connect` | Returns the caller's room credentials after server-side roster verification. |
| `GET /api/clan-wars/:id/ws` | Authenticates the cookie and roster, then proxies the WebSocket upgrade to the private Room. |

Invitations and accepted/roster-ready matches expire after 24 hours unless racing has started. Unique clan and user reservation rows prevent overlapping matches. The same idempotency key replays the original call; roster and ready retries are also idempotent. Match reads include the attacked district, each saved round and the aggregate score.

## Room trust boundary

The Worker alone provisions a room with a private namespace name and the exact six account IDs. The Room rejects ordinary `/join`; its internal session endpoint only returns the DO-generated player ID and secret token for a roster account. The public `api/rooms/:six-character-code` mapping cannot derive the private namespace name. Starting this room requires six connected, ready, unique accounts and then calls the existing `prepareRoomAuthority`/`RoomRaceInputs` path. Clan finish persistence is isolated from ordinary online rewards and leaderboards while the larger clan settlement policy remains unapproved.

The room keeps the same participant identity and server state across DO reconstruction and gives a disconnected participant 60 seconds to reconnect. A voluntary leave keeps the roster slot during that window; if the participant does not return, the match aborts safely without rewards and releases both clan/player reservations. Confirmed finishes are scored by place (10/7/5/3/2/1) for three rounds. A tied aggregate starts round four; if that remains tied, lower combined team time in round four wins; equal total time leaves the district with the defender. Results are unique per battle/round, replay safely after DO recovery, and persist in D1. War matches do not award CR/EXP. A confirmed attacker victory settles accrued district income, transfers district ownership exactly once, writes ownership history, and protects the district for 12 hours. Confirmed normal online finishes award influence (20 points, or 30 for first place) with a 200-point per-player daily cap; clan war and media event finishes do not add influence.

## Local verification

Run `npm run test:clan-wars:v2`. Tests use in-memory SQLite with local migrations. They check district seeds and income; score six participants through three tied rounds and the tie-breaker with replay and reservation release; run the real `Room` class with virtual sockets for challenge lifecycle, permissions, rosters, six authorized connect sessions, outsider rejection, storage reconstruction, and a server-authority race start; and run ordinary room/wager regressions. This is not a Cloudflare deployment or six physical clients.

Before any future release, deploy/apply this migration only to an isolated D1, verify that the production Worker and migrations are not targeted, and run authenticated browser WebSocket testing with two actual clans. No production migration or deployment is part of this slice.
