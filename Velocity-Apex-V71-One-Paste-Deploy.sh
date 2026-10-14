#!/usr/bin/env bash
# Velocity Apex V71. Upload ZIP and this SH to GitHub main; invoke by git show ... | bash.
set -Eeuo pipefail
ROOT='/workspaces/Velocity-apex'
ZIP='Velocity-Apex-Coastal-Ring-Cinematic-V71.zip'
SHA='814371f822baf68c0626539af32f29edd1d09616ae22c9b5d9f99df3a0e6c4ea'
SITE='https://velocity-apex.maximmanzha20.workers.dev'
STEP='Подготовка'
TMP="$(mktemp -d)"
LOG="$TMP/apex-v71-deploy.log"
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
  printf '❌ VELOCITY APEX V71 — ОШИБКА\n'
  printf '=====================================================\n'
  echo "Этап: $STEP"
  echo "Код ошибки: $code"
  echo "GitHub push: $GITHUB_PUSHED; Cloudflare deploy: $CLOUDFLARE_DEPLOYED; live V71: $LIVE_VERIFIED"
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
printf 'VELOCITY APEX V71 — COASTAL RING CINEMATIC / FREE ROAM — ОБНОВЛЕНИЕ\n'
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
  echo 'SHA256 не совпадает. Выбран неверный файл — загрузите именно ZIP V71 из этого сообщения.' >>"$LOG"
  false
fi
unzip -tqq "$TMP/release.zip" >>"$LOG" 2>&1
mkdir -p "$TMP/release"
unzip -oq "$TMP/release.zip" -d "$TMP/release" >>"$LOG" 2>&1
test -f "$TMP/release/package.json"
test -f "$TMP/release/public/version.json"
test -f "$TMP/release/public/js/free-city.js"
test -f "$TMP/release/tests/coastal_ring_v71_test.mjs"
grep -Eq '"version"[[:space:]]*:[[:space:]]*"V71"' "$TMP/release/public/version.json"
grep -q '"test:v71"' "$TMP/release/package.json"
echo '✓ Архив целый, версия V71 подтверждена'

STEP='Подготовка чистой рабочей версии'
git worktree add --detach "$TMP/staging" origin/main >"$LOG" 2>&1
cp -a "$TMP/release/." "$TMP/staging/"
cd "$TMP/staging"
echo '✓ Файлы V71 установлены во временную копию'

STEP='Установка зависимостей'
npm install --no-audit --no-fund >"$LOG" 2>&1
echo '✓ Зависимости готовы'

STEP='Проверка карты Coastal Ring V71, геометрии и iOS-совместимости'
npm run test:v71 >"$LOG" 2>&1
echo '✓ Карта, Mini Games и совместимость V67–V69 прошли тесты'

STEP='Полная проверка игры'
echo '⏳ Запускаю полный набор тестов; длительные гонки могут занять несколько минут...'
npm test >"$LOG" 2>&1
echo '✓ Основной набор тестов игры пройден'

STEP='Доступ к Cloudflare'
npx --no-install wrangler whoami >"$LOG" 2>&1
echo '✓ Авторизация Cloudflare подтверждена'

STEP='Отправка исходников в GitHub'
git add -A -- public src tests package.json README_V71_RU.md
if [ -f package-lock.json ]; then git add -A -- package-lock.json; fi
if ! git diff --cached --quiet; then
  git -c user.name='Velocity Apex Release' -c user.email='velocity-apex@users.noreply.github.com' commit -m 'Velocity Apex V71 — Coastal Ring CINEMATIC visual polish' >"$LOG" 2>&1
fi
git push origin HEAD:main >"$LOG" 2>&1
GITHUB_PUSHED=1
echo '✓ GitHub/main получил исходники V71'

STEP='Публикация Worker + assets в Cloudflare'
npx --no-install wrangler deploy --config wrangler.jsonc >"$LOG" 2>&1
CLOUDFLARE_DEPLOYED=1
echo '✓ Cloudflare Wrangler завершил деплой'

STEP='Проверка версии живого сайта'
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsSL --connect-timeout 10 --max-time 25 -H 'Cache-Control: no-cache' "$SITE/version.json?v71-check-$i" -o "$TMP/live.json" 2>>"$LOG" &&
     grep -Eq '"version"[[:space:]]*:[[:space:]]*"V71"' "$TMP/live.json" &&
     curl -fsSL --connect-timeout 10 --max-time 25 -H 'Cache-Control: no-cache' "$SITE/?v71-check-$i" -o "$TMP/live.html" 2>>"$LOG" &&
     grep -q 'coastal=v71' "$TMP/live.html" &&
     curl -fsSL --connect-timeout 10 --max-time 25 -H 'Cache-Control: no-cache' "$SITE/js/free-city.js?v71-check-$i" -o "$TMP/live.js" 2>>"$LOG" &&
     grep -q 'coastalRingVersion:71' "$TMP/live.js" &&
     grep -q 'palmSprites=new Map' "$TMP/live.js"; then
    LIVE_VERIFIED=1
    break
  fi
  sleep 2
done
if [ "$LIVE_VERIFIED" -ne 1 ]; then
  echo 'Cloudflare сообщил об успешном деплое, но живой сайт ещё не подтвердил V71 HTML + Coastal Ring JavaScript. Не считаем задачу завершённой.' >>"$LOG"
  false
fi
trap - ERR
printf '\n=====================================================\n'
printf '✅ VELOCITY APEX V71 — УСПЕШНО ОПУБЛИКОВАНА\n'
printf '=====================================================\n'
echo '✓ ZIP V71 и SHA256 проверены'
echo '✓ Геометрия прибрежного кольца и все мини-игры сохранены'
echo '✓ Детальные пальмы, аэропорт и Canvas Retina проверены'
echo '✓ GitHub обновлён'
echo '✓ Cloudflare подтвердил публикацию'
echo '✓ ЖИВОЙ САЙТ ПОДТВЕРДИЛ V71 + ИГРОВУЮ КАРТУ JS'
echo "Сайт: $SITE"
echo '====================================================='
