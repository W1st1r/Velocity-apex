# Velocity Apex admin panel

The administrator UI is available only to the authenticated `@w1st1r` account. The ROOT button remains protected by the existing ROOT passcode, but the passcode is now verified by the Cloudflare Worker instead of browser JavaScript.

The panel includes Money, Cars, Effects, Cases, Accounts, and Blocked tabs. Account search supports usernames with or without a leading `@`. Selecting a user allows credit adjustments, resource grant/revoke operations, timed bans with a reason, and unbanning.

No manual D1 migration is required for deployment: the Worker creates the moderation tables with `CREATE TABLE IF NOT EXISTS` on first account/admin API use. `migrations/0002_admin.sql` is included for source-controlled schema documentation.

## Remote resource synchronization
Remote CR/resources are authoritative on the server. After an admin change, the target client checks the cloud revision and refreshes automatically. Client writes include their base revision, so an older local save cannot overwrite a newer admin change.
