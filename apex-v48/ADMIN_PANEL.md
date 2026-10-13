# Velocity Apex admin panel

The administrator UI is available only to the authenticated `@w1st1r` account. The ROOT button remains protected by the existing ROOT passcode, but the passcode is now verified by the Cloudflare Worker instead of browser JavaScript.

The panel includes Money, Cars, Effects, Cases, Accounts, and Blocked tabs. Account search supports usernames with or without a leading `@`. Selecting a user allows credit adjustments, resource grant/revoke operations, timed bans with a reason, and unbanning.

No manual D1 migration is required for deployment: the Worker creates the moderation tables with `CREATE TABLE IF NOT EXISTS` on first account/admin API use. `migrations/0002_admin.sql` is included for source-controlled schema documentation.

## Remote resource synchronization
Remote CR/resources are authoritative on the server. After an admin change, the target client checks the cloud revision and refreshes automatically. Client writes include their base revision, so an older local save cannot overwrite a newer admin change.

## Admin UI v2

- Навигация панели разделена на «Мой аккаунт» и «Управление игроками».
- Раздел «Аккаунты» использует двухколоночный workspace: поиск/список слева, выбранный профиль справа.
- При выборе игрока первым экраном показываются дата регистрации, последний вход, время обновления cloud save и server revision.
- Управление игроком разделено на вкладки «Обзор», «Деньги», «Ресурсы», «Блокировка».
- Срок блокировки можно задавать с точностью до секунды: секунда, минута, час или день. Минимум — 1 секунда, максимум — 365 дней.
- Добавлены быстрые пресеты блокировки: 30 секунд, 5 минут, 1 час, 1 день и 7 дней.
