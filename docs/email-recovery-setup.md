# V77 email recovery setup

Password recovery uses Resend's transactional email HTTP API from the Cloudflare Worker. The feature fails closed when mail is not configured: password reset requests keep a neutral response, while the account email-binding screen states that verification mail is unavailable. No fake delivery is reported.

## Owner setup required before enabling email recovery

1. Choose a sending domain you control (the `workers.dev` hostname cannot receive sender-domain DNS records). Create/verify that domain in Resend.
2. Publish the DNS records Resend provides for sender authentication (DKIM and SPF; configure DMARC for the domain). Wait for verification and send a real test message from the intended sender.
3. Create a restricted Resend API key for sending mail.
4. Add `RESEND_API_KEY` as a Cloudflare Worker secret for the `velocity-apex` Worker. Do not commit the value or add it to client code or GitHub logs.
5. Set Worker variables:
   - `EMAIL_FROM`: e.g. `Velocity Apex <no-reply@mail.your-domain.example>`, using the verified domain.
   - `PUBLIC_APP_ORIGIN`: the canonical HTTPS game origin used for recovery links (currently `https://velocity-apex.maximmanzha20.workers.dev`, unless a custom game domain is selected).
6. Configure a private support contact in the project's official support channel. The app does not expose account recovery by nickname or provide an admin/master-password bypass.

Resend's current free transactional tier lists 3,000 emails/month and a 100-email daily limit; its paid Pro plan is listed at $20/month for 50,000 emails, with overage pricing shown by Resend. Limits/pricing can change; check the provider's pricing page before choosing a plan.

## Legacy account support procedure

Accounts without a confirmed email continue to sign in and play. A login alone is not proof of ownership. Support must not ask for passwords, one-time codes, full payment-card data, or public posting of personal information. For a manual ownership review, compare at least two independent account-specific signals already retained by the player (for example, an established session on a previously used device plus a non-public historical purchase receipt or another pre-existing account record). Do not reset access when the evidence is insufficient; guide the player through recovery of their mailbox instead. Keep the case private and record the review outcome without recording secrets.

The API does not implement a privileged password-reset route. A manual case must never be replaced by a master code or a reset based only on the username.

## Data and deployment

Migration `0022_account_email_recovery.sql` only adds nullable email fields and new token/rate/audit tables. It does not rewrite users, password hashes, saves, currency, cars, progress, or social records. Production migration and Worker release remain separate owner-approved actions; take and verify the production D1 backup through the existing release workflow first.
