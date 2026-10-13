#!/usr/bin/env bash
# Velocity Apex V67 — one terminal paste after uploading ZIP and this .sh to GitHub main.
set -Eeuo pipefail
ROOT="/workspaces/Velocity-apex"
ZIP="Velocity-Apex-Racing-AI-Physics-V67.zip"
EXPECTED_SHA="3b264a2f9cc8683f5649a32d9fbbab767f45342e044376bce40799868cc23c90"
SITE="https://velocity-apex.maximmanzha20.workers.dev"
STEP="Запуск"
TMP="$(mktemp -d)"
LOG="$TMP/update.log"
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
  echo '❌ VELOCITY APEX V67 — ОШИБКА'
  echo "Этап: $STEP"
  echo "Код ошибки: $code"
  echo "GitHub обновлён: $GITHUB_PUSHED (1 = да)"
  echo "Cloudflare принял деплой: $DEPLOYED (1 = да)"
  echo "Сайт подтвердил V67: $LIVE_OK (1 = да)"
  echo 'Последние сообщения диагностики:'
  tail -n 20 "$LOG" 2>/dev/null || true
  if [ "$STEP" = "Доступ Cloudflare" ]; then
    echo 'Для подключения Cloudflare в Codespaces: npx wrangler login'
  fi
  echo '=================================================='
  exit "$code"
}
trap cleanup EXIT
trap failed ERR
cd "$ROOT"
echo '========== VELOCITY APEX V67 =========='
STEP="Скачивание файлов из GitHub"
git fetch origin main >"$LOG" 2>&1
if ! git cat-file -e "origin/main:$ZIP" 2>/dev/null; then
  echo "Файл $ZIP не обнаружен в GitHub main. Сначала загрузите его и нажмите Commit changes." > "$LOG"
  false
fi
git show "origin/main:$ZIP" >"$TMP/game.zip" 2>"$LOG"
echo '✓ ZIP получен из GitHub'
STEP="Проверка архива"
if ! echo "$EXPECTED_SHA  $TMP/game.zip" | sha256sum -c - >"$LOG" 2>&1; then
  echo 'Контрольная сумма не совпала: загружен не тот ZIP V67.' >> "$LOG"
  false
fi
unzip -tqq "$TMP/game.zip" >>"$LOG" 2>&1
mkdir -p "$TMP/release"
unzip -oq "$TMP/game.zip" -d "$TMP/release" >>"$LOG" 2>&1
test -f "$TMP/release/package.json"
test -f "$TMP/release/public/version.json"
test -f "$TMP/release/public/js/ai.js"
test -f "$TMP/release/tests/racing_ai_v67_test.mjs"
test -f "$TMP/release/tests/racing_ai_v67_field_test.mjs"
grep -q '"version":"V67"' "$TMP/release/public/version.json"
grep -q '"test:v67"' "$TMP/release/package.json"
echo '✓ Проверена правильная сборка V67'
STEP="Подготовка чистого проекта"
git worktree add --detach "$TMP/staging" origin/main >"$LOG" 2>&1
cp -a "$TMP/release/." "$TMP/staging/"
cd "$TMP/staging"
echo '✓ Файлы V67 установлены'
STEP="Зависимости Node.js"
npm install --no-audit --no-fund >"$LOG" 2>&1
echo '✓ Зависимости установлены'
STEP="Тесты гоночного ИИ V67"
npm run test:v67 >"$LOG" 2>&1
echo '✓ Тесты ботов и физики пройдены'
STEP="Проверки совместимости V66"
npm run test:v66 >"$LOG" 2>&1
echo '✓ Старая игра и Upgrade прошли регрессию'
STEP="Доступ Cloudflare"
npx --no-install wrangler whoami >"$LOG" 2>&1
echo '✓ Cloudflare доступен'
STEP="GitHub commit и push"
git add -A -- public src tests package.json README_V67_RU.md
if ! git diff --cached --quiet; then
  git -c user.name="Velocity Apex Release" -c user.email="velocity-apex@users.noreply.github.com" commit -m "Velocity Apex V67 Racing AI and Physics" >"$LOG" 2>&1
fi
git push origin HEAD:main >"$LOG" 2>&1
GITHUB_PUSHED=1
echo '✓ Исходники V67 отправлены в GitHub'
STEP="Публикация Worker и PWA в Cloudflare"
npx --no-install wrangler deploy --config wrangler.jsonc >"$LOG" 2>&1
DEPLOYED=1
echo '✓ Cloudflare подтвердил деплой'
STEP="Проверка живого сайта"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsSL --connect-timeout 10 --max-time 20 -H 'Cache-Control: no-cache' "$SITE/version.json?version=v67-check-$i" -o "$TMP/live.json" 2>>"$LOG"; then
    if grep -Eq '"version"[[:space:]]*:[[:space:]]*"V67"' "$TMP/live.json"; then
      LIVE_OK=1
      break
    fi
  fi
  sleep 2
done
if [ "$LIVE_OK" -ne 1 ]; then
  echo "Cloudflare принял деплой, но $SITE/version.json не подтвердил V67" >> "$LOG"
  false
fi
trap - ERR
echo
echo '=================================================='
echo '✅ VELOCITY APEX V67 — УСПЕШНО ОБНОВЛЕНА'
echo '=================================================='
echo '✓ Правильный архив V67 проверен'
echo '✓ Гоночный ИИ и физика прошли тесты'
echo '✓ Проверки совместимости прошли'
echo '✓ GitHub обновлён'
echo '✓ Cloudflare опубликовал игру'
echo '✓ ЖИВОЙ САЙТ ПОДТВЕРДИЛ V67'
echo "Игра: $SITE"
echo '=================================================='
