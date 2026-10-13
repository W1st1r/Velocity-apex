# APEX · ЮMoney automatic CR top-ups

The build contains a server-side payment flow:

1. Player opens **ПОПОЛНИТЬ** in APEX.
2. APEX creates a server-side order with a unique `label`.
3. The browser posts the order to `https://yoomoney.ru/quickpay/confirm`.
4. YooMoney sends an HTTP notification to `/api/payments/yoomoney`.
5. The Worker verifies the current YooMoney `sign` using HMAC-SHA256.
6. D1 atomically records the YooMoney `operation_id`, adds CR once, marks the order paid, and writes OWNER PANEL → Logs → Покупки.

## Cloudflare variables

Set these before enabling payments:

```bash
npx wrangler secret put YOOMONEY_RECEIVER
npx wrangler secret put YOOMONEY_NOTIFICATION_SECRET
```

`YOOMONEY_RECEIVER` = your YooMoney wallet number (digits only).

`YOOMONEY_NOTIFICATION_SECRET` = secret shown in YooMoney → wallet settings → HTTP notifications → "Показать секрет".

Optional existing fundraising page:

```bash
npx wrangler secret put YOOMONEY_COLLECTION_URL
```

## HTTP notification URL

After deployment, open APEX → **ПОПОЛНИТЬ**. The screen shows the exact callback URL. It is:

`https://YOUR-APEX-DOMAIN/api/payments/yoomoney`

Put that URL into YooMoney wallet settings → HTTP notifications and enable notifications.

Do not put `YOOMONEY_NOTIFICATION_SECRET` into HTML, JavaScript, GitHub, or a public file.

## Database

The Worker creates the tables defensively, but the migration can also be applied explicitly:

```bash
npx wrangler d1 migrations apply velocity-apex-db --remote
```

## Default packages

Packages live server-side in `src/payments.mjs`, not in browser code:

- 5,000 CR — 99 ₽
- 12,000 CR — 199 ₽
- 35,000 CR — 499 ₽
- 80,000 CR — 999 ₽
- 180,000 CR — 1,990 ₽

Changing HTML cannot change the price or CR reward.
