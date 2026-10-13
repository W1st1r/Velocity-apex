#!/usr/bin/env bash
# Velocity Apex V66 — one paste from GitHub Codespaces after uploading the ZIP to main.
bash <<'APEX_V66'
set -Eeuo pipefail
ROOT="/workspaces/Velocity-apex"
ZIP="Velocity-Apex-Race-Control-Blue-UI-Audit-V66.zip"
EXPECTED_SHA="ee5e3096b7270fc41f1b6de8a831e389f6c888996031d225277b32907fe3e107"
SITE="https://velocity-apex.maximmanzha20.workers.dev"
STEP="Подготовка"
TMP="$(mktemp -d)"
LOG="$TMP/update.log"
: > "$LOG"
GITHUB_PUSHED=0
DEPLOYED=0
cleanup() {
  git -C "$ROOT" worktree remove --force "$TMP/staging" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
failed() {
  local code=$?
  trap - ERR
  echo
  echo '================================================='
  echo '❌ VELOCITY APEX V66 — ОШИБКА'
  echo "ЭТАП: $STEP"
  echo "КОД: $code"
  echo "GitHub обновлён: $GITHUB_PUSHED (1 = да)"
  echo "Cloudflare подтвердил загрузку: $DEPLOYED (1 = да)"
  echo 'Последние сообщения:'
  tail -n 20 "$LOG" 2>/dev/null || true
  echo '================================================='
  exit "$code"
}
trap cleanup EXIT
trap failed ERR
cd "$ROOT"
echo '========== VELOCITY APEX V66 =========='
STEP="Получение ZIP из GitHub"
git fetch origin main >"$LOG" 2>&1
if ! git cat-file -e "origin/main:$ZIP" 2>/dev/null; then
  echo "ZIP $ZIP ещё не загружен на GitHub в main" >"$LOG"
  false
fi
git show "origin/main:$ZIP" > "$TMP/game.zip" 2>"$LOG"
echo '✓ Архив найден в GitHub'

STEP="Контроль целостности ZIP"
echo "$EXPECTED_SHA  $TMP/game.zip" | sha256sum -c - >"$LOG" 2>&1
unzip -tqq "$TMP/game.zip" >>"$LOG" 2>&1
mkdir -p "$TMP/release"
unzip -oq "$TMP/game.zip" -d "$TMP/release" >>"$LOG" 2>&1
test -f "$TMP/release/package.json"
test -f "$TMP/release/public/css/unified-blue-v66.css"
test -f "$TMP/release/public/version.json"
test -f "$TMP/release/tests/unified_blue_v66_test.mjs"
grep -q '"test:v66"' "$TMP/release/package.json"
echo '✓ Проверена именно V66 с синей темой'

STEP="Подготовка чистой копии проекта"
git worktree add --detach "$TMP/staging" origin/main >"$LOG" 2>&1
cp -a "$TMP/release/." "$TMP/staging/"
cd "$TMP/staging"
echo '✓ Файлы V66 установлены в чистую копию'

STEP="Установка зависимостей"
npm install --no-audit --no-fund >"$LOG" 2>&1
echo '✓ Зависимости готовы'

STEP="Тесты V66"
npm run test:v66 >"$LOG" 2>&1
echo '✓ Тесты V66 пройдены'

STEP="Полный набор тестов игры"
echo '⌛ Проверяю остальные игровые системы (может занять несколько минут)...'
npm test >"$LOG" 2>&1
echo '✓ Полные тесты пройдены'

STEP="Проверка доступа к Cloudflare"
npx --no-install wrangler whoami >"$LOG" 2>&1
echo '✓ Cloudflare доступен'

STEP="Отправка исходного кода в GitHub"
git add -A -- public src tests .github package.json README_V66_RU.md
if ! git diff --cached --quiet; then
  git -c user.name="Velocity Apex Release" -c user.email="velocity-apex@users.noreply.github.com" commit -m "Velocity Apex V66 unified blue UI and QA" >"$LOG" 2>&1
fi
git push origin HEAD:main >"$LOG" 2>&1
GITHUB_PUSHED=1
echo '✓ Исходный код V66 отправлен в GitHub'

STEP="Прямой деплой Cloudflare"
npx --no-install wrangler deploy --config wrangler.jsonc >"$LOG" 2>&1
DEPLOYED=1
echo '✓ Wrangler подтвердил деплой Cloudflare'

STEP="Проверка версии на реальном сайте"
VERIFIED=0
for i in 1 2 3 4 5 6 7 8; do
  if curl -fsSL --connect-timeout 10 --max-time 20 "$SITE/version.json?check=v66-${i}" -o "$TMP/live.json" 2>>"$LOG"; then
    if grep -Eq '"version"[[:space:]]*:[[:space:]]*"V66"' "$TMP/live.json"; then VERIFIED=1; break; fi
  fi
  sleep 2
done
if [ "$VERIFIED" -ne 1 ]; then
  echo "Деплой принят, но $SITE/version.json пока не отвечает версией V66" >>"$LOG"
  false
fi
trap - ERR
echo
echo '================================================='
echo '✅ VELOCITY APEX V66 — ПОЛНОСТЬЮ ОБНОВЛЕНА'
echo '================================================='
echo '✓ ZIP совпал с проверенной сборкой'
echo '✓ Все локальные тесты прошли'
echo '✓ GitHub обновлён'
echo '✓ Cloudflare опубликовал Worker и статические файлы'
echo '✓ ЖИВОЙ САЙТ ПОДТВЕРДИЛ VERSION V66'
echo "Игра: $SITE"
echo '================================================='
APEX_V66
