#!/usr/bin/env bash
# Velocity Apex V73 — upload this file and the V73 ZIP to repo main, then run from Codespaces.
set -Eeuo pipefail
VERSION=V73
ARCHIVE="${1:-Velocity-Apex-Apex-Lime-Preview-V73.zip}"
STEP='Начало'
WORK=''
fail(){ rc=$?; echo; echo "ОШИБКА: ${VERSION} не опубликована; этап: ${STEP}; код: ${rc}" >&2; [[ -n "$WORK" ]] && rm -rf "$WORK"; exit "$rc"; }
trap fail ERR
trap '[[ -n "$WORK" ]] && rm -rf "$WORK"' EXIT
cd "$(git rev-parse --show-toplevel)"
[[ -f "$ARCHIVE" ]] || { echo "ОШИБКА: не найден архив $ARCHIVE (загрузите его в корень репозитория)" >&2; exit 1; }
[[ -d .git ]] || { echo 'ОШИБКА: Codespaces открыт не в Git-репозитории' >&2; exit 1; }
STEP='Распаковка V73'
WORK="$(mktemp -d)"
unzip -oq "$ARCHIVE" -d "$WORK"
[[ -f "$WORK/package.json" && -f "$WORK/public/version.json" && -f "$WORK/tests/v72_ui_map_review_test.mjs" ]] || { echo 'ОШИБКА: ZIP содержит неполный проект' >&2; exit 1; }
node -e 'if(require(process.argv[1]).version!=="V73")process.exit(1)' "$WORK/public/version.json"
echo '[1/5] Распаковка обновлённой версии V73 в проект'
cp -a "$WORK"/. .
STEP='Зависимости'
echo '[2/5] Установка зависимостей'
npm install --no-audit --no-fund
STEP='Регрессионные тесты'
echo '[3/5] Тесты интерфейса, Free Roam, гонок, iOS'
npm run test:v72
node tests/free_minigame_buildings_owner_v30_test.mjs
node tests/free_map_drag_v34_test.mjs
node tests/free_map_football_ui_v35_test.mjs
node tests/progression_live_events_test.mjs
STEP='Публикация исходников GitHub'
echo '[4/5] Коммит и отправка кода на GitHub main'
git add -A
if ! git diff --cached --quiet; then git commit -m 'Velocity Apex V73: map venues, garage, car preview, mobile UI'; fi
git push origin HEAD:main
SHA="$(git rev-parse HEAD)"
echo "${VERSION} успешно установлена в репозиторий (коммит ${SHA:0:8})."
STEP='Проверка публикации Cloudflare'
echo '[5/5] Проверка GitHub Actions: deploy.yml -> Cloudflare'
if ! command -v gh >/dev/null 2>&1; then
  echo 'Cloudflare не подтверждён: GitHub CLI отсутствует; проверьте Actions > Deploy Velocity Apex V73.'
  echo 'V73 успешно установлена и отправлена в GitHub; публикация Cloudflare не подтверждена.'
  exit 0
fi
RUN=''
for _ in $(seq 1 24); do
  RUN="$(gh run list --workflow deploy.yml --commit "$SHA" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
  [[ -n "$RUN" ]] && break
  sleep 5
done
if [[ -z "$RUN" ]]; then
  echo 'V73 успешно установлена и отправлена в GitHub; запуск Cloudflare Actions не найден (проверьте Actions вручную).'
  exit 0
fi
if gh run watch "$RUN" --exit-status; then
  echo; echo '============================================'
  echo 'V73 УСПЕШНО ОПУБЛИКОВАНА В CLOUDFLARE'
  echo "GitHub commit: ${SHA:0:8}; Actions run: ${RUN}"
  echo '============================================'
else
  echo 'ОШИБКА: V73 код в GitHub, но публикация Cloudflare не прошла. Посмотрите журнал Actions.' >&2
  exit 1
fi
