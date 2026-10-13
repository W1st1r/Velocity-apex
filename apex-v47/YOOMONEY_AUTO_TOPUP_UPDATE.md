# Velocity Apex — YooMoney automatic top-up update

## Added

- Main-menu **ПОПОЛНИТЬ** tile.
- Phone-optimized CR top-up screen.
- Server-side CR packages and RUB prices.
- YooMoney QuickPay form redirect for card (`AC`) and YooMoney wallet (`PC`).
- Unique APEX order `label` per purchase.
- `/api/payments/yoomoney` HTTP notification endpoint.
- Current YooMoney `sign` verification using HMAC-SHA256 and RFC 3986 canonicalization.
- Exact `withdraw_amount` validation against the server-side order price.
- Atomic D1 crediting and idempotency by YooMoney `operation_id`.
- Purchase history for the current account.
- Automatic cloud-save refresh after a successful redirect.
- OWNER PANEL → Logs → Purchases entry for each confirmed YooMoney purchase.
- Optional existing YooMoney collection link via `YOOMONEY_COLLECTION_URL`.
- Migration `0013_yoomoney_payments.sql`.
- Setup guide `YOOMONEY_SETUP.md`.

## Security rules

- Browser never sends the RUB price or amount of CR to grant.
- CR are granted only after a valid YooMoney HTTP notification.
- Notification signature is verified server-side.
- Currency must be RUB (`643`).
- Protected/unaccepted payments are ignored.
- The amount paid must match the D1 order.
- One YooMoney operation can be credited only once.
- Payment package definitions are stored in `src/payments.mjs`.
- YooMoney notification secret is never exposed to the browser.

## Default packages

- 5,000 CR — 99 ₽
- 12,000 CR — 199 ₽
- 35,000 CR — 499 ₽
- 80,000 CR — 999 ₽
- 180,000 CR — 1,990 ₽
