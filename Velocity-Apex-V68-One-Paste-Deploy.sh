#!/usr/bin/env bash
# Velocity Apex V68 — upload this script + ZIP to GitHub main, then invoke via git show ... | bash.
set -Eeuo pipefail
ROOT="/workspaces/Velocity-apex"
ZIP="Velocity-Apex-Race-Control-UI-Clans-V68.zip"
SHA="0eaf336c8e1509dcb9b58b84956e59e1403c77c4f0fc0ee5fa145e547fc5b486"
SITE="https://velocity-apex.maximmanzha20.workers.dev"
STEP="Запуск"
TMP="$(mktemp -d)"
LOG="$TMP/deploy.log"
: > "$LOG"
GITHUB_PUSHED=0
DEPLOYED=0
LIVE_OK=0
cleanup() {
  git -C "$ROOT" worktree remove --force "$TMP/staging" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
failed() {
  local code=$?
  trap - ERR
  echo
  echo '=================================================='
  echo '❌ VELOCITY APEX V68 — ОШИБКА ОБНОВЛЕНИЯ'
  echo '=================================================='
  echo "Этап: $STEP"
  echo "Код ошибки: $code"
  echo "GitHub обновлён: $GITHUB_PUSHED (1 = да)"
  echo "Cloudflare принял деплой: $DEPLOYED (1 = да)"
  echo "Живой сайт подтвердил V68: $LIVE_OK (1 = да)"
  echo 'Последние сообщения диагностики:'
  tail -n 22 "$LOG" 2>/dev/null || true
  if [ "$STEP" = "Доступ к Cloudflare" ]; then
    echo 'Если доступ не настроен, запусти в Codespaces: npx wrangler login'
  fi
  echo '=================================================='
  exit "$code"
}
trap cleanup EXIT
trap failed ERR
cd "$ROOT"
echo '=============================================='
echo '  VELOCITY APEX V68 — УСТАНОВКА И ДЕПЛОЙ'
echo '=============================================='
STEP="Скачивание ZIP из GitHub"
git fetch origin main >"$LOG" 2>&1
if ! git cat-file -e "origin/main:$ZIP" 2>/dev/null; then
  echo "Файл $ZIP отсутствует в ветке main. Загрузите ZIP в https://github.com/W1st1r/Velocity-apex/upload/main и нажмите Commit changes." >"$LOG"
  false
fi
git show "origin/main:$ZIP" >"$TMP/game.zip" 2>"$LOG"
echo '✓ ZIP загружен из GitHub'
STEP="Проверка точной версии ZIP"
if ! echo "$SHA  $TMP/game.zip" | sha256sum -c - >"$LOG" 2>&1; then
  echo 'SHA-256 не совпала — загружен другой или повреждённый ZIP V68. Перезагрузите архив из этого чата.' >>"$LOG"
  false
fi
unzip -tqq "$TMP/game.zip" >>"$LOG" 2>&1
mkdir -p "$TMP/release"
unzip -oq "$TMP/game.zip" -d "$TMP/release" >>"$LOG" 2>&1
test -f "$TMP/release/package.json"
test -f "$TMP/release/public/version.json"
test -f "$TMP/release/public/css/polish-v68.css"
test -f "$TMP/release/tests/ui_clans_v68_test.mjs"
grep -q '"version": "V68"' "$TMP/release/public/version.json"
grep -q '"test:v68"' "$TMP/release/package.json"
echo '✓ Архив и сборка V68 проверены'
STEP="Чистая установка исходников"
git worktree add --detach "$TMP/staging" origin/main >"$LOG" 2>&1
cp -a "$TMP/release/." "$TMP/staging/"
cd "$TMP/staging"
echo '✓ Новые файлы установлены в чистый проект'
STEP="Установка Node-зависимостей"
npm install --no-audit --no-fund >"$LOG" 2>&1
echo '✓ Зависимости установлены'
STEP="Целевые тесты V68, кланы, кнопки, гонки"
npm run test:v68 >"$LOG" 2>&1
echo '✓ Тесты V68 пройдены'
STEP="Полный набор тестов игры"
echo '⏳ Проверяю остальные системы игры...'
npm test >"$LOG" 2>&1
echo '✓ Полные тесты игры пройдены'
STEP="Доступ к Cloudflare"
npx --no-install wrangler whoami >"$LOG" 2>&1
echo '✓ Cloudflare доступен'
STEP="GitHub commit и push"
git add -A -- public src tests package.json README_V68_RU.md
if ! git diff --cached --quiet; then
  git -c user.name="Velocity Apex Release" -c user.email="velocity-apex@users.noreply.github.com" commit -m "Velocity Apex V68 HUD Controls Clan UX" >"$LOG" 2>&1
fi
git push origin HEAD:main >"$LOG" 2>&1
GITHUB_PUSHED=1
echo '✓ Исходники V68 отправлены в GitHub'
STEP="Прямой деплой в Cloudflare"
npx --no-install wrangler deploy --config wrangler.jsonc >"$LOG" 2>&1
DEPLOYED=1
echo '✓ Cloudflare подтвердил деплой'
STEP="Проверка живого сайта и нового CSS"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsSL --connect-timeout 10 --max-time 25 -H 'Cache-Control: no-cache' "$SITE/version.json?v68-check-$i" -o "$TMP/live.json" 2>>"$LOG" &&
     grep -Eq '"version"[[:space:]]*:[[:space:]]*"V68"' "$TMP/live.json" &&
     curl -fsSL --connect-timeout 10 --max-time 25 -H 'Cache-Control: no-cache' "$SITE/css/polish-v68.css?v68-check-$i" -o "$TMP/live.css" 2>>"$LOG" &&
     grep -q 'Velocity Apex V68' "$TMP/live.css"; then
    LIVE_OK=1
    break
  fi
  sleep 2
done
if [ "$LIVE_OK" -ne 1 ]; then
  echo "Cloudflare принял деплой, но $SITE не подтвердил V68 и новый файл CSS." >>"$LOG"
  false
fi
trap - ERR
echo
echo '=================================================='
echo '✅ VELOCITY APEX V68 — УСПЕШНО ОПУБЛИКОВАНА'
echo '=================================================='
echo '✓ Проверен правильный ZIP V68'
echo '✓ Доработаны кнопки гонок и HUD'
echo '✓ Кланы и интерфейс прошли тесты'
echo '✓ Полный набор тестов пройден'
echo '✓ GitHub обновлён'
echo '✓ Cloudflare подтвердил деплой'
echo '✓ ЖИВОЙ САЙТ ПОДТВЕРДИЛ V68 И НОВЫЙ CSS'
echo "Адрес: $SITE"
echo '=================================================='
