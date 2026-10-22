# Velocity Apex 2.0.0 — release preflight

Дата: 2026-10-22. **Итог: BLOCKED. Официальный релиз не выполнен.**

## Идентификаторы

- Ветка: `velocity-apex-2.0-dev`.
- Проверенный SHA исходников кандидата: `f5ebbdace037b8eaaaeeca962aac351cc789cdbd`.
- GitHub `main`, подтверждённый read-only connector: `fe9bbb0f23939892b99cece49f1fea9255f17f42`.
- Целевая версия: `2.0.0`. Фактическая локальная: `2.0.0-dev`; `public/version.json` сохраняет V77 как published и development channel. Версия, теги, package/PWA metadata не переключались из-за остановки на preflight.
- Staging URL: **отсутствует**, изолированное окружение не создано.
- Production URL: https://velocity-apex.maximmanzha20.workers.dev . V77 — последняя подтверждённая пользователем официальная версия; фактическая версия сайта в этой попытке не подтверждена.
- Документационный checkpoint создаётся после этого отчёта; его полный SHA записывается в `CHECKPOINT.txt` новой копии и итоговом сообщении. Runtime-код остаётся кодом кандидата выше.

## 1. Причина остановки

`node_modules/.bin/wrangler whoami` вернул: **You are not authenticated. Please run wrangler login.** Локальные переменные Cloudflare credentials отсутствуют; проверенные стандартные OAuth config paths также отсутствуют. Значения секретов не запрашивались и не выводились.

GitHub connector доступен (репозиторий читается, main ref подтверждён), но не предоставляет Cloudflare provisioning/D1 metadata/backup API или workflow-dispatch capability. CLI `gh` не найден. Попытка read-only получить список запусков release workflow через GitHub fetch отклонена разрешённым набором endpoint инструмента (`INVALID_ARGUMENT`); это не падение GitHub Actions и не доказательство неисправности CI.

Предлагаемый Wrangler temporary preview не использовался: временный посторонний account не подтверждает нужный Cloudflare account, production bindings или безопасность миграции. Никаких обходов release protection не выполнялось.

По правилу последовательности preflight → staging → gate → production работа остановлена до инфраструктурных мутаций. Разрешение владельца на условный релиз учтено; повторного согласования релиза не требуется после прохождения gate, но для продолжения нужна авторизованная среда нужного Cloudflare account и доступ к защищённому ручному workflow.

## 2. Проверено на preflight

| Проверка | Факт / результат |
|---|---|
| Ветка/HEAD | Совпали с заданием; предыдущие исправления P0/P1 присутствуют в commit f5ebbdac. |
| Рабочее дерево | Tracked tree на входе чистое. Существующие 13 untracked ZIP не менялись. |
| Защитная Git-ссылка | Создана `safety/pre-release-f5ebbdac` на исходный SHA. |
| Локальный backup исходников | Предыдущий bundle/source archive/CHECKPOINT SHA-256 повторно проверены: все OK. Это **не production D1 backup**. |
| Cloudflare конфигурация | `wrangler.jsonc`: Worker `velocity-apex`, DB `velocity-apex-db` / binding DB, configured UUID `dee1721c-9730-4780-9185-7b23666333b2`; ROOMS → Room, sqlite export; Cron `0 * * * *`. Account ID в этой конфигурации не указан; R2 binding и env staging не объявлены. Это чтение конфигурации, не подтверждение реально развёрнутых bindings. |
| Ручной production workflow | `.github/workflows/release-v77.yml` подтверждён на main: workflow_dispatch, exact main SHA, explicit production confirmation, environment production, backup/export/encryption/restore check до D1 apply, затем deploy и smoke. |
| PR deployment | Локальный актуальный `deploy.yml` содержит тесты/dry-run, а не production deploy. Remote main production workflow также прочитан. Репозиторные runtime protections не изменялись. |
| Required reviewer | **Не подтверждён**. `environment: production` в YAML сам по себе не доказывает наличие required reviewer. Настройки environment через доступный connector не проверены. |
| Фактический production Worker/version ID | Не получен: нет Cloudflare auth. main SHA нельзя приравнивать к фактически опубликованному SHA. |
| Production HTTP read | Одна попытка GET `/version.json` из workspace получила HTTP 403. Источник отказа (сайт или сетевой/proxy слой) не установлен; это не заявляется как дефект игры. Повторных попыток с теми же условиями не было. |

Новых игровых исправлений в этой release-попытке не вносилось. Секреты в изменениях документации не добавлялись. Старые архивы сохранены.

## 3. Миграции, старые данные и четыре дефекта

Локальная цепочка 0001–0033 и восстановление fixture уже проверены в предыдущем аудите на точном неизменённом runtime SHA. Полный suite/стресс не повторялся: исходники игры не менялись и инфраструктурный preflight завершился блокером.

Реальная production D1, её migration table, схема, журналы, аккаунты/пароли/сессии, CR, имущество, гаражи/апгрейды, карьера, друзья, кланы, казна, ставки, промокоды и покупки **не читались и не изменялись**. Их совместимость после миграций на реальной копии не подтверждена.

Чтение дерева GitHub main SHA `fe9bbb0…` показало: в нём нет `src/clan-district-income.mjs`, `src/clan-seasons.mjs` и маршрута `/api/crews/treasury/contribute`. Следовательно, четыре исправленных дефекта новых путей отсутствуют в исходниках этого main commit. **Это условное свидетельство для V77, а не проверка фактического production deployment или его данных.** Без метаданных Worker и D1 нельзя утверждать, что последствия на реальной базе исключены.

Корректировки не рассчитывались: реальных расхождений/исходных сумм не получено. Скрипт ремонта данных не придумывался. Перед выпуском следует сверить реальный опубликованный SHA, миграции и существование V2-таблиц/журналов на read-only снимке; если данные V2 имеются — проверить contribution/income ledgers и pending season outbox на копии, а неоднозначные суммы не применять автоматически.

## 4. Release gate

| Gate | Статус |
|---|---|
| Предыдущий технический аудит | 123/123 уникальных процессов + 1/1 дополнительный; новых открытых P0/P1 в проверенном объёме не было. Четыре найденных дефекта исправлены ранее, повторно не реализованы. |
| Авторизация и корректный Cloudflare account | **BLOCKED** |
| Staging Worker/D1/DO/R2/test secrets | Не создан / не подтверждён |
| Staging migration на копии V77 | Не выполнена |
| Сохранность реальных старых данных | Не проверена |
| Staging API smoke и итоговое D1 состояние | Не проверены |
| Production D1 backup + isolated restore | **Не выполнены** |
| Worker recovery version ID/bookmark | Не получены |
| Проверенный rollback V77 на V2-схеме | Не выполнен |
| Metadata/PWA/cache migration 2.0.0 | Не подготовлены/не проверены после остановки |
| Визуальный gate / Coastal Ridge / mobile landscape | **Не выполнен**, staging URL отсутствует |
| Production migrations/deploy/smoke | **Не выполнялись**, gate не пройден |

Полный package/test audit не повторялся. Браузеры и библиотеки не скачивались; CUA не запускался без staging URL. Не создан Git tag v2.0.0, не было push/merge/dispatch/deploy и production migrations. Ни новая пустая production-база, ни операции над реальными балансами не создавались.

## 5. Rollback: план, пока не проверенная процедура

1. До любого production D1 изменения записать фактический Worker deployment/version ID, SHA, migration inventory и D1 recovery bookmark. Создать шифрованный экспорт, проверить восстановление и контрольные суммы на изолированной копии.
2. Применить V2 миграции на копии; сверить защищённые записи до/после. Проверить запуск сохранённой V77 на полученной схеме и последствия совместного существования старого/нового Worker и DO storage.
3. Если после будущей публикации возникает критический дефект — прекратить дальнейшие мутации, сохранить свежий снимок/метаданные и решить, совместим ли возврат сохранённого Worker ID с текущей D1/DO схемой. Откат Worker выполнять только через принятую защищённую процедуру.
4. Не восстанавливать старый D1 snapshot поверх операций игроков после релиза. При необходимости DB recovery сначала согласовать остановку записей и сохранение/replay новых операций. Неоднозначные данные требуют отдельного плана.

Без первых двух шагов rollback gate не считается пройденным. Конкретный deployment ID или готовая команда восстановления не подставляются вымышленно.

## 6. Todoist

В проекте `🏎️ Velocity Apex` (`6hmhP35pFPJG58cj`) обновлены описания **7 существующих** карточек: staging, отчёт/backup, миграции/история, visual, workflow/rollback, официальный релиз, PWA/данные. Записаны BLOCKED/не выполнено и фактические результаты. Новые задачи не создавались, задачи не завершались; существующие разделы В работе/Тестирование сохранены. Release и iPhone QA не помечены выполненными. Другие проекты не затрагивались.

## 7. Черновик release notes — НЕ ОПУБЛИКОВАНО

Кандидат 2.0.0 содержит новые кланы с казной, расширением мест, войнами 3×3 и районами Apex Bay; семидневные сезоны/дивизионы, ежедневные и еженедельные задания; серверные доходы и влияние; призраков, баг-репорты, переходы меню и изменения физики игрока. Серверные проверки защищают CR и подтверждённые результаты.

Этот список описывает исходники кандидата, а не доступное игрокам обновление. Публичные release notes утверждаются по фактически опубликованной после staging сборке. Официальная 2.0.0 здесь не объявляется выпущенной.

## 8. Продолжение

Первое необходимое действие — предоставить этой работе авторизованный доступ к нужному Cloudflare account/защищённому GitHub Actions запуску. Затем: metadata-only production inventory → isolated staging → проверенная копия/миграции/smoke → визуальный gate по всем сохранённым экранам → PWA/update/rollback → release gate → только затем защищённая production публикация и smoke.

Тестового URL сейчас нет. После появления staging ручной чек-лист: landscape iPhone 13–17; меню/гараж/гонки/кейсы; кланы/казна/составы/войны/районы; Coastal Ridge (4580,1390), береговой marker и правильное название; сезоны/рейтинг/задания; чат/друзья/баг-репорты; overflow, прокрутка, возвраты и ошибки консоли. Ни один из этих пунктов не заявляется выполненным сейчас.

## 9. Уточнение диагностики GitHub Actions — 2026-10-22

Cloudflare доступ через GitHub Actions **не признан недоступным** на основании локального Wrangler. Найден предусмотренный путь через существующие repository secrets и read-only workflow; выполнение пока не подтверждено.

- Remote main по-прежнему `fe9bbb0f23939892b99cece49f1fea9255f17f42`. Оба workflow прочитаны из GitHub main. W1st1r имеет repository permission admin. Чтение `actions/runs` работает (111 runs в общем ответе, 5 последних получены); запрос `event=workflow_dispatch` вернул 0. Нельзя на этом основании утверждать, что все прежние ручные запуски отсутствовали.
- Доступный GitHub connector не предоставляет нового workflow dispatch, secret-name inventory или environment protection API. Repository admin владельца не доказывает Actions:write scope connector. Без известного failed/cancelled preflight job безопасного адресного rerun здесь нет; чужой CI/release job не перезапускался.
- Read-only preflight на main требует CLOUDFLARE_ACCOUNT_ID и CLOUDFLARE_API_TOKEN как secrets, не указывает environment. Поэтому secrets, сохранённые только в production environment, этому job недоступны. Наличие самих имён и D1_BACKUP_ENCRYPTION_KEY не подтверждено: значения не запрашиваются. Production workflow указывает environment production, но это не доказывает configured required reviewer.
- У существующего preflight есть ограничения: Worker metadata HTTP 403 допускается без падения; DO/R2/bindings, D1_BACKUP_ENCRYPTION_KEY и staging write scopes не проверяются. Даже зелёный run не равен полному release gate. Защиты не изменены, новый механизм деплоя и новые токены не создавались.

### Точные действия владельца

1. https://github.com/W1st1r/Velocity-apex/settings/secrets/actions — проверить наличие **имён**, не раскрывая значения: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN; для production также D1_BACKUP_ENCRYPTION_KEY (может быть в production environment). Существующие корректные secrets не заменять.
2. https://github.com/W1st1r/Velocity-apex/settings/environments — открыть production, проверить и сохранить Required reviewers: W1st1r; защиту не отключать.
3. https://github.com/W1st1r/Velocity-apex/actions/workflows/v77-cloudflare-preflight.yml — Run workflow → branch main → Run workflow. Это metadata GET-only без SQL/deploy. Передать ссылку нового run для проверки steps/summary. При отсутствии кнопки проверить, что вход выполнен владельцем W1st1r и Actions разрешены в Settings → Actions → General; это не повод отключать production protection.

Staging не создан, production не изменён, официальная 2.0.0 не выпущена. Четыре существующие release-карточки Todoist обновлены без завершения задач. Старые тесты/локальный login не повторялись. Runtime и архивы исходников остались прежними; новый полный bundle ради документационного уточнения не создавался.
