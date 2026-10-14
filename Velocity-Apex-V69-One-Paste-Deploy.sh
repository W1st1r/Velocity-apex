#!/usr/bin/env bash
# Velocity Apex V69. Upload ZIP and this SH to GitHub main; invoke by git show ... | bash.
set -Eeuo pipefail
ROOT='/workspaces/Velocity-apex'
ZIP='Velocity-Apex-Upgrade-Protection-iOS-V69.zip'
SHA='0e4de3ca80e580bfda079b487fb7dd3346fd207b9b0e61622ec92edab9e9faef'
SITE='https://velocity-apex.maximmanzha20.workers.dev'
STEP='Подготовка'
TMP="$(mktemp -d)"
LOG="$TMP/apex-v69-deploy.log"
: > "$LOG"
GITHUB_PUSHED=0
CLOUDFLARE_DEPLOYED=0
LIVE_VERIFIED=0
cleanup(){
  git -C "$ROOT" worktree remove --force "$TMP/staging" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
failed(){
  local code=$?
  trap - ERR
  printf '\n=====================================================\n'
  printf '❌ VELOCITY APEX V69 — ОШИБКА\n'
  printf '=====================================================\n'
  echo "Этап: $STEP"
  echo "Код ошибки: $code"
  echo "GitHub push: $GITHUB_PUSHED; Cloudflare deploy: $CLOUDFLARE_DEPLOYED; live V69: $LIVE_VERIFIED"
  echo 'Последние строки журнала:'
  tail -n 23 "$LOG" 2>/dev/null || true
  if [ "$STEP" = 'Доступ к Cloudflare' ]; then
    echo 'Выполни в Codespaces: npx wrangler login'
  fi
  echo '====================================================='
  exit "$code"
}
trap cleanup EXIT
trap failed ERR
cd "$ROOT"
printf '=====================================================\n'
printf 'VELOCITY APEX V69 — UPGRADE / iOS — ОБНОВЛЕНИЕ\n'
printf '=====================================================\n'

STEP='Загрузка архивного файла из GitHub'
git fetch origin main >"$LOG" 2>&1
if ! git cat-file -e "origin/main:$ZIP" 2>/dev/null; then
  echo "Не найден $ZIP в GitHub/main. Загрузи оба файла через https://github.com/W1st1r/Velocity-apex/upload/main и нажми Commit changes." > "$LOG"
  false
fi
git show "origin/main:$ZIP" > "$TMP/release.zip" 2>"$LOG"
echo '✓ ZIP получен из GitHub'

STEP='Проверка SHA256 и содержимого ZIP'
if ! echo "$SHA  $TMP/release.zip" | sha256sum -c - >"$LOG" 2>&1; then
  echo 'SHA256 не совпадает. Выбран неверный файл — загрузите именно ZIP V69 из этого сообщения.' >>"$LOG"
  false
fi
unzip -tqq "$TMP/release.zip" >>"$LOG" 2>&1
mkdir -p "$TMP/release"
unzip -oq "$TMP/release.zip" -d "$TMP/release" >>"$LOG" 2>&1
test -f "$TMP/release/package.json"
test -f "$TMP/release/public/version.json"
test -f "$TMP/release/public/css/ios-upgrade-v69.css"
test -f "$TMP/release/tests/upgrade_v69_server_integration_test.mjs"
grep -Eq '"version"[[:space:]]*:[[:space:]]*"V69"' "$TMP/release/public/version.json"
grep -q '"test:v69"' "$TMP/release/package.json"
echo '✓ Архив целый, версия V69 подтверждена'

STEP='Подготовка чистой рабочей версии'
git worktree add --detach "$TMP/staging" origin/main >"$LOG" 2>&1
cp -a "$TMP/release/." "$TMP/staging/"
cd "$TMP/staging"
echo '✓ Файлы V69 установлены во временную копию'

STEP='Установка зависимостей'
npm install --no-audit --no-fund >"$LOG" 2>&1
echo '✓ Зависимости готовы'

STEP='Проверка Upgrade V69, защиты и iOS-совместимости'
npm run test:v69 >"$LOG" 2>&1
echo '✓ Новая механика и совместимость V67/V68 прошли тесты'

STEP='Полная проверка игры'
echo '⏳ Запускаю полный набор тестов; длительные гонки могут занять несколько минут...'
npm test >"$LOG" 2>&1
echo '✓ Основной набор тестов игры пройден'

STEP='Доступ к Cloudflare'
npx --no-install wrangler whoami >"$LOG" 2>&1
echo '✓ Авторизация Cloudflare подтверждена'

STEP='Отправка исходников в GitHub'
git add -A -- public src tests package.json README_V69_RU.md
if [ -f package-lock.json ]; then git add -A -- package-lock.json; fi
if ! git diff --cached --quiet; then
  git -c user.name='Velocity Apex Release' -c user.email='velocity-apex@users.noreply.github.com' commit -m 'Velocity Apex V69 — Upgrade protection and iOS layout' >"$LOG" 2>&1
fi
git push origin HEAD:main >"$LOG" 2>&1
GITHUB_PUSHED=1
echo '✓ GitHub/main получил исходники V69'

STEP='Публикация Worker + assets в Cloudflare'
npx --no-install wrangler deploy --config wrangler.jsonc >"$LOG" 2>&1
CLOUDFLARE_DEPLOYED=1
echo '✓ Cloudflare Wrangler завершил деплой'

STEP='Проверка версии живого сайта'
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsSL --connect-timeout 10 --max-time 25 -H 'Cache-Control: no-cache' "$SITE/version.json?v69-check-$i" -o "$TMP/live.json" 2>>"$LOG" &&
     grep -Eq '"version"[[:space:]]*:[[:space:]]*"V69"' "$TMP/live.json" &&
     curl -fsSL --connect-timeout 10 --max-time 25 -H 'Cache-Control: no-cache' "$SITE/css/ios-upgrade-v69.css?v69-check-$i" -o "$TMP/live.css" 2>>"$LOG" &&
     grep -q 'Velocity Apex V69' "$TMP/live.css" &&
     curl -fsSL --connect-timeout 10 --max-time 25 -H 'Cache-Control: no-cache' "$SITE/js/garage.js?v69-check-$i" -o "$TMP/live.js" 2>>"$LOG" &&
     grep -q 'upgradeProtectionToggle' "$TMP/live.js"; then
    LIVE_VERIFIED=1
    break
  fi
  sleep 2
done
if [ "$LIVE_VERIFIED" -ne 1 ]; then
  echo 'Cloudflare сообщил об успешном деплое, но живой сайт ещё не подтвердил V69/CSS/Upgrade JS. Не считаем задачу завершённой.' >>"$LOG"
  false
fi
trap - ERR
printf '\n=====================================================\n'
printf '✅ VELOCITY APEX V69 — УСПЕШНО ОПУБЛИКОВАНА\n'
printf '=====================================================\n'
echo '✓ ZIP V69 и SHA256 проверены'
echo '✓ Защита ставки и серверная математика проверены'
echo '✓ iOS CSS и регрессионные тесты пройдены'
echo '✓ GitHub обновлён'
echo '✓ Cloudflare подтвердил публикацию'
echo '✓ ЖИВОЙ САЙТ ПОДТВЕРДИЛ V69 + CSS + JS'
echo "Сайт: $SITE"
echo '====================================================='
