# Velocity Apex — Administration System Update

## Added

- Five staff levels: Helper, Junior Moderator, Moderator, Senior Administrator, Chief Administrator.
- Server-side permission checks for questions, player reports, warnings, mutes and bans.
- Support section for players: Question, Player Report, Admin Report, My Requests.
- Up to three compressed screenshot attachments per request.
- Staff ADMIN PANEL with queues, exclusive ticket claiming, conversations, moderation actions and daily reporting.
- Active administration online tracking with AFK-safe heartbeat behavior (only active panel heartbeats count).
- Daily points and salary calculation with level norms and 20% bonus cap.
- Owner-only Administrators section: staff roster, rank changes, warnings, removal, live statistics, report approval/rejection, salary payout and admin complaints.
- Admin reports are immutable daily snapshots; the next day can accumulate separately while the previous report is pending.
- Player chat mutes are enforced server-side in Free Roam.
- Administration/audit history is retained when a staff member is removed.

## Deployment / update commands

Run from the project folder:

```bash
npm install
npx wrangler d1 migrations apply velocity-apex-db --remote
npm test
npm run deploy
```

The Worker also creates the administration tables with `CREATE TABLE IF NOT EXISTS`, but applying the migration keeps the remote database migration history explicit.

## New migration

`migrations/0010_admin_system.sql`

## Main files

- `src/admin-system.mjs`
- `src/worker.mjs`
- `public/js/admin-system.js`
- `public/css/admin-system.css`
- `public/index.html`
- `public/js/root-console.js`
- `public/js/freeroam.js`
