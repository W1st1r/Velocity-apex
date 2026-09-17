# Velocity Apex — Accounts deployment

The project now includes account authentication and D1 cloud saves.

## Already required in Cloudflare

- D1 database: `velocity-apex-db`
- D1 binding in `wrangler.jsonc`: `DB`
- Tables: `users`, `sessions`, `player_saves`

The SQL schema is stored in `migrations/0001_accounts.sql`.

## Deploy

1. Copy this project over the GitHub repository files.
2. Keep `wrangler.jsonc` as included; it already points to the D1 database.
3. Run `npm install` if dependencies are not installed.
4. Run `npm test`.
5. Run `npx wrangler deploy --dry-run`.
6. Commit and push to `main`.
7. Wait for the Cloudflare Git deployment to succeed.

## Production checks

1. Open the game and choose **АККАУНТ**.
2. Register a test user with a new login and 8+ character password.
3. Confirm the menu shows the account display name.
4. Buy/select something or change settings, wait about one second, then reload.
5. Confirm the same progress is restored.
6. Log out, then log in again.
7. On another browser/device, log in with the same account and confirm cloud progress loads.

## API added

- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/account/save`
- `PUT|POST /api/account/save`

Passwords are stored as PBKDF2-SHA-256 hashes with per-user salts. Session tokens are random and only their SHA-256 hashes are stored in D1. Browser sessions use an HttpOnly, SameSite=Lax cookie and Secure on HTTPS.
