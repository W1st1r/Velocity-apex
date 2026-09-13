# Velocity Apex

Velocity Apex is a lightweight top-down racing PWA for iPhone/Safari, Android and desktop. The existing HTML/CSS/JavaScript/Canvas 2D game remains intact and the project now adds a first working Online Multiplayer mode without React, Vue, TypeScript or a browser runtime framework.

The deployed app uses **Cloudflare Workers Static Assets + Worker + Durable Objects + WebSocket Hibernation API**. Offline/solo racing still uses the original local `R.Track`, `R.Car`, AI, physics, shop, controls and `velocityApex.v1` save data.

## Local launch

For the complete app, including Online Multiplayer, use Wrangler from the project root:

```bash
npm install
npm run dev
```

Open the local URL printed by Wrangler in two browser windows to test multiplayer. The frontend itself is in `public/`; opening `public/index.html` directly still works for the offline **ИГРАТЬ РЯДОМ** mode, but browser security rules mean the Cloudflare `/api/*` multiplayer backend is only available through `wrangler dev` or a deployed Worker.

On iPhone, use landscape orientation. For Home Screen installation, deploy over HTTPS and use Safari → Share → Add to Home Screen.

## Game modes

The main menu now has two primary choices:

- **ИГРАТЬ РЯДОМ** — the existing offline race setup with bots, difficulty, 3/5/7/10/15 laps and all existing controls/economy.
- **ОНЛАЙН** — room creation/join, Lobby, READY, synchronized countdown and multiplayer race.

Shop and Settings remain available from the main menu. The existing save key stays exactly `velocityApex.v1`; online nickname is stored separately under `velocityApex.onlineName` so legacy saves are not cleared or replaced.

## Online Multiplayer architecture

### Frontend

- `public/js/network.js` — WebSocket connection, reconnect/backoff, ping/pong clock offset, snapshot throttling, snapshot buffers, interpolation and short bounded extrapolation.
- `public/js/online.js` — Online menu, room creation/join, Lobby UI, READY, host settings, connection state, room code copy and online result UI.
- `public/js/game.js` — keeps offline lifecycle and physics, with a separate Online race path that instantiates the same `R.Car` renderer/physics for the local player and remote `R.Car` renderers without `AIController`.

Each client renders locally. Canvas frames are never transmitted. The local car continues to use the existing fixed/substep physics; compact state snapshots are sent at approximately 18 updates/sec when the WebSocket is healthy. If `bufferedAmount` grows, intermediate snapshots are dropped instead of building an old-packet backlog.

Remote cars use a snapshot buffer with about 100 ms interpolation delay, shortest-angle interpolation across `-π/π`, and extrapolation capped at roughly 140 ms. Very large corrections clear stale history and snap to the latest verified state instead of interpolating through the world. Invalid/non-finite states are ignored.

### Cloudflare backend

- `src/worker.mjs` — Worker API routing plus the `Room` Durable Object.
- `src/protocol.mjs` — protocol/version constants and validation helpers.
- `wrangler.jsonc` — Static Assets, `ROOMS` Durable Object binding and SQLite Durable Object class declaration.

One room code maps to one Durable Object. The Worker creates a six-character room code from an alphabet that excludes ambiguous `O/0/I/1`, then routes create/join/WebSocket traffic to the Durable Object named by that code.

The room server owns membership, host identity, settings, READY flags, grid order, `raceStartAt`, reconnect slots and immutable finish ordering. Host-only actions are checked on the server. Unknown or malformed messages do not crash the room; oversized, wrong-version or invalid state messages are rejected. Player snapshots have sequence/rate/sanity checks, bounded displacement checks and basic server-side lap progression timing so a client cannot claim all race laps in a single packet.

WebSockets use the Cloudflare Hibernation API via `ctx.acceptWebSocket()`. A per-socket player attachment survives hibernation. Durable Object storage keeps room metadata and reconnect identity. A disconnected player keeps the same slot for about 25 seconds; after grace expiry the player is removed and, if necessary, host ownership migrates. Alarms also clean abandoned room state.

### Protocol

Protocol version: `1`.

Important message types include `hello`, `room_state`, `settings_update`, `ready`, `start_countdown`, `player_state`, `race_finish`, `ping`, `pong`, `error` and `return_lobby`.

The server-generated `raceStartAt` is shared by all clients. Ping/pong estimates server clock offset so all clients unlock controls against the same server timestamp instead of running independent countdown timeouts.

## Lobby and race behavior

The host can select any existing `R.TRACKS` track, 3/5/7/10/15 laps and 2–8 maximum players. The collisions switch defaults to OFF; when enabled it uses the existing local OBB collision response, but OFF remains the recommended multiplayer setting because snapshot synchronization is prioritized over networked collision authority in this MVP.

A race can start only when at least two players are connected and all connected players are READY. The server freezes the room settings for the race, generates one shared grid order and sends one `raceStartAt`. Each client places cars from that shared order using the existing track/grid sampling logic.

The HUD uses the same POS/LAP/minimap system, now with all online cars in the local `cars` collection. Ranking uses confirmed finish place first, then laps + track progress. A finish place is assigned by the Durable Object once and cannot be reordered by repeated finish messages.

Online Pause is local only. It hides local controls and sends neutral controls, but does not pause server time or other racers. Safari `visibilitychange` no longer globally pauses an Online race.

## Disconnect / reconnect

If the WebSocket drops, the UI enters **RECONNECTING** and reconnects with exponential backoff using the same player ID and session token. The Durable Object keeps the player's slot for approximately 25 seconds. A replaced/stale WebSocket close cannot create or remove a duplicate player.

If reconnect grace expires, the server removes the player. An explicit **ВЫЙТИ** removes the player immediately. If that player was Host, a remaining connected player becomes Host. The room is not destroyed when the first racer finishes; remaining players can continue.

## Controls

Control mode is stored in the existing save and works in both modes:

- **ARROWS** — touch arrows plus independent GAS/BRAKE; desktop A/D/W/S and arrow keys.
- **TILT** — DeviceOrientation analog steering with iOS permission flow.
- **WHEEL** — analog virtual wheel with independent GAS/BRAKE.
- `P` / `Escape` — pause; in Online this opens only a local menu.

## Formula-style physics and AI

The existing Formula-style yaw/tyre model, fixed/substep physics, track surfaces, racing-line planner and AI remain the offline baseline. Online does not replace the physics implementation; only the local player runs `Car.update()` from input, while remote cars are positioned by interpolated snapshots and never receive `AIController`.

The five existing tracks remain:

| Track | Length | Character |
| --- | ---: | --- |
| APEX CIRCUIT | 7.39 km | Technical circuit |
| NEON HARBOR | 5.40 km | Street / night |
| DESERT CANYON | 9.60 km | High speed + hairpin |
| ALPINE RING | 6.70 km | S-sections + hairpins |
| COASTLINE GT | 8.40 km | Fast arcs + technical sector |

The garage/economy and Porsche 911 still use the original `ownedLiveries` / `selectedLivery` save fields. Online loadout synchronizes `liveryId` and `effectId`, so remote cars use the same existing car/effect catalog.

## Tests

Install dev dependencies, then run:

```bash
npm test
```

This runs the existing standalone suites plus Online protocol, interpolation, room/server and UI/static-asset simulations. For the full deterministic AI stress matrix, run `npm run test:ai` (or `npm run test:all` for both).

Existing suites cover physics/camera invariants, economy, Porsche/shop, root tools, geometry, trajectory sectors and deterministic AI/traffic races.

Online tests cover:

- room-code generation/validation;
- nickname/settings validation;
- 2–8 room capacity;
- host-only permissions;
- READY state;
- host migration;
- malformed messages;
- snapshot finite/speed validation;
- client angle-wrap interpolation, bounded extrapolation and large-error snap;
- two-client race start flow;
- eight-player capacity simulation;
- immutable finish ordering;
- duplicate/stale reconnect handling;
- intentional Host leave/migration;
- impossible lap-jump rejection;
- empty-room cleanup;
- Online DOM IDs, `R.TRACKS` reuse, safe text rendering and manifest asset presence.

See `TEST_REPORT.md` for the completed validation summary.

# ONLINE MULTIPLAYER / CLOUDFLARE DEPLOYMENT

The repository is already configured for **Cloudflare Workers**, not Cloudflare Pages and not Workers Sites. Static files are served by Workers Static Assets from `public/`; `/api/*` runs the Worker first.

## First deployment from GitHub

1. Unpack the ZIP, create a Git repository at the **project root** (the folder containing `package.json`, `wrangler.jsonc`, `public/` and `src/`), commit all files, and push to GitHub.
2. In Cloudflare Dashboard open **Workers & Pages → Create application → Import a repository** and connect that GitHub repository.
3. Create/import it as a **Worker / Workers Builds** project. The Cloudflare Worker name must match `name` in `wrangler.jsonc`, currently `velocity-apex`, unless you intentionally change both before the first deployment.
4. Set **Root directory** to the repository root (`/` or leave it blank when the project itself is the repo root).
5. **Build command:** leave blank. There is no frontend build step.
6. **Deploy command:** `npx wrangler deploy` (Cloudflare's normal Workers Builds default).
7. Save and deploy. Workers Builds uses the Wrangler version declared in `package.json`.

No manual source edits are required after unpacking.

## Durable Object configuration

`wrangler.jsonc` already contains:

```jsonc
"durable_objects": {
  "bindings": [
    { "name": "ROOMS", "class_name": "Room" }
  ]
},
"exports": {
  "Room": { "type": "durable-object", "storage": "sqlite" }
}
```

No legacy `migrations` array is required for this new project. The modern declarative `exports` field tells Cloudflare to provision the `Room` class with SQLite-backed Durable Object storage.

Static asset configuration is also already present:

```jsonc
"assets": {
  "directory": "./public",
  "binding": "ASSETS",
  "run_worker_first": ["/api/*"]
}
```

Do not change the asset directory to `.`: keeping it at `public/` prevents backend source, tests and locally installed `node_modules` from becoming public assets.

## Local Cloudflare test

```bash
npm install
npm test
npm run dev
```

Then:

1. Browser A → **ОНЛАЙН → СОЗДАТЬ КОМНАТУ**.
2. Copy the six-character room code.
3. Browser B (or a private/incognito window) → **ОНЛАЙН → ВОЙТИ В КОМНАТУ**.
4. Both players press **ГОТОВ**.
5. Host presses **НАЧАТЬ ГОНКУ**.
6. Verify shared countdown, both cars, minimap/ranking, reconnect and finish result flow.

For a real iPhone test, deploy to Cloudflare first (or expose your local Wrangler endpoint over an HTTPS method you control) so Safari/PWA APIs run in a secure context.

## Manual CLI deploy alternative

If you do not use GitHub integration:

```bash
npm install
npx wrangler login
npm test
npm run deploy
```

The Worker serves the PWA and Online backend from the same origin, so no API URL, token or secret is embedded in browser JavaScript.

## Project structure

- `public/index.html` — PWA shell and all game/online overlays.
- `public/css/style.css` — existing UI plus compact Online/Lobby/iPhone-landscape styles.
- `public/js/content.js` — tracks, save migration, garage/economy catalog.
- `public/js/racing-line.js` — racing-line planner.
- `public/js/track.js` — track geometry/rendering.
- `public/js/car.js` — shared physics/car renderer.
- `public/js/ai.js` — offline AI only.
- `public/js/controls.js` — ARROWS/TILT/WHEEL.
- `public/js/network.js` — Online transport/interpolation.
- `public/js/online.js` — Online UI/Lobby state.
- `public/js/game.js` — offline and Online race integration.
- `src/protocol.mjs` — server protocol validation.
- `src/worker.mjs` — Worker + Room Durable Object.
- `wrangler.jsonc` — Cloudflare configuration.
- `tests/online_protocol_test.mjs` — protocol validation.
- `tests/online_network_test.js` — client interpolation/extrapolation/snap validation.
- `tests/online_room_test.mjs` — room/server simulation.
- `tests/online_ui_smoke.js` — Online UI/static-asset smoke checks.

## Legacy static hosting note

`netlify.toml` remains only for backwards-compatible offline/static hosting and now points at `public/`. Online Multiplayer requires the Cloudflare Worker/Durable Object backend and therefore will not work on a static-only host.
