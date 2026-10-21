# Clan war orchestration (local V2 slice)

This additive slice is backed by `0024_clan_war_orchestration.sql`. It adds challenge lifecycle, locked 3+3 rosters, per-account reservations, readiness, and private `CLAN_WAR:<uuid>` Durable Object rooms. It does not transfer territories, award influence, or settle CR/EXP.

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

Invitations and accepted/roster-ready matches expire after 24 hours unless racing has started. Unique clan and user reservation rows prevent overlapping matches. The same idempotency key replays the original call; roster and ready retries are also idempotent.

## Room trust boundary

The Worker alone provisions a room with a private namespace name and the exact six account IDs. The Room rejects ordinary `/join`; its internal session endpoint only returns the DO-generated player ID and secret token for a roster account. The public `api/rooms/:six-character-code` mapping cannot derive the private namespace name. Starting this room requires six connected, ready, unique accounts and then calls the existing `prepareRoomAuthority`/`RoomRaceInputs` path. Clan finish persistence is isolated from ordinary online rewards and leaderboards while the larger clan settlement policy remains unapproved.

The room keeps the same participant identity and server state across DO reconstruction and gives a disconnected participant 60 seconds to reconnect. This slice does not yet implement rounds, battle score aggregation, an end-of-match callback, territory transfer, or automated notification delivery.

## Local verification

Run `npm run test:clan-wars:v2`. Its first test uses an in-memory SQLite database with all local migrations and six account sessions; Durable Object calls are in-process using the real `Room` class and virtual sockets. It checks create/accept/reject/cancel/expiry, idempotency, clan and leader permissions, roster validation, six ready/connect accounts, outsider rejection, DO-storage reconstruction, and one server-authority race start. The second test is the existing public Room and wager regression suite. This is not a Cloudflare deployment or six physical clients.

Before any future release, deploy/apply this migration only to an isolated D1, verify that the production Worker and migrations are not targeted, and run authenticated browser WebSocket testing with two actual clans. No production migration or deployment is part of this slice.
