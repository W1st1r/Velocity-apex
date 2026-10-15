#!/usr/bin/env bash
set -Eeuo pipefail
VERSION=V73.1
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
fail(){ echo "ОШИБКА: $1" >&2; exit 1; }
trap 'echo "ОШИБКА: установка прервана на строке $LINENO" >&2' ERR
[[ -n "$ROOT" ]] || fail 'Запускайте скрипт внутри GitHub Codespaces проекта Velocity Apex'
cd "$ROOT"
[[ -f src/worker.mjs && -f public/js/main-menu-ui.js && -f public/css/race-control-v65.css ]] || fail 'Не найдены файлы проекта'
BRANCH="$(git branch --show-current)"
[[ "$BRANCH" == velocity-v73-clean ]] || fail "Ожидалась ветка velocity-v73-clean, сейчас $BRANCH. Ничего не изменено"
# Preserve user's existing changes and refuse to edit unexpected files.
CHANGES="$(git status --porcelain | awk '{print $2}')"
while IFS= read -r f; do
  [[ -z "$f" || "$f" == public/js/main-menu-ui.js || "$f" == public/css/race-control-v65.css ]] || fail "Есть постороннее изменение: $f. Ничего не перезаписано"
done <<< "$CHANGES"
mkdir -p .velocity-v73-backup
for f in src/worker.mjs public/js/main-menu-ui.js public/css/race-control-v65.css; do
  cp "$f" ".velocity-v73-backup/$(basename "$f").before-$VERSION"
done
python3 - <<'PY'
from pathlib import Path
worker=Path('src/worker.mjs')
s=worker.read_text()
route="""    if(url.pathname==='/api/progression/me'&&request.method==='GET'){
      const identity=await freeAccountIdentity(env,request);
      if(identity.response)return identity.response;
      if(!identity.user)return json({authenticated:false,level:0});
      const progress=await getProgression(env,identity.user.id);
      return json({ok:true,authenticated:true,...progress});
    }
"""
if "if(url.pathname==='/api/progression/me'" not in s:
    assert "import {handleAuthRequest,freeAccountIdentity}" in s, 'Не найден модуль авторизации; изменение остановлено'
    assert "import {getProgression," in s, 'Не найден модуль прогресса; изменение остановлено'
    anchor="    if(url.pathname==='/api/free/servers'&&request.method==='GET'){"
    assert s.count(anchor)==1, 'Изменилась структура worker.mjs; изменение остановлено'
    worker.write_text(s.replace(anchor,route+anchor,1))
    print('Добавлен авторизованный API уровня')
else: print('API уровня уже существует')
menu=Path('public/js/main-menu-ui.js')
s=menu.read_text()
if "'/api/progression/me'" not in s:
    raise RuntimeError('Главное меню отличается от проверенного V73: сначала требуется ручная проверка')
if "d.authenticated===false" not in s:
    raise RuntimeError('Не обнаружена проверка уровня из V73')
print('Исправление LEVEL проверено')
css=Path('public/css/race-control-v65.css')
s=css.read_text()
old='transform:rotate(-11deg) scale(.88);'
new='transform:rotate(-11deg) scale(1.12);'
if old in s: css.write_text(s.replace(old,new,1))
elif new not in s: raise RuntimeError('Стили машины отличаются от ожидаемых')
print('Размер APEX LIME проверен')
PY
node --check src/worker.mjs
node --check public/js/main-menu-ui.js
npm test > /tmp/velocity-v73-core-tests.log 2>&1 || { tail -n 35 /tmp/velocity-v73-core-tests.log; fail 'основные тесты не пройдены; публикация запрещена'; }
echo 'Основные тесты пройдены.'
if npm run test:ai > /tmp/velocity-v73-ai-tests.log 2>&1; then
  echo 'Тест ИИ пройден.'
else
  echo 'ВНИМАНИЕ: тест ИИ не пройден (подробности: /tmp/velocity-v73-ai-tests.log).'
  echo "${VERSION} успешно установлена локально, но НЕ опубликована: ошибки ИИ требуют исправления."
  exit 2
fi
if [[ "${1:-}" != '--publish' ]]; then
  echo "${VERSION} успешно установлена локально. Для публикации запустите скрипт с --publish."
  exit 0
fi
# Do not overwrite the latest remote history or any existing unrelated changes.
git fetch origin main
[[ "$(git rev-parse origin/main)" == "$(git merge-base HEAD origin/main)" ]] || fail 'Удалённая main изменилась: публикация остановлена'
[[ -z "$(git status --porcelain | grep '^??' | grep -Ev '(\.velocity-v73-backup/|install_velocity_apex_v73_safe\.sh|README_V73_1\.txt|Velocity-Apex-V73-1-Safe-Patch\.zip)' || true)" ]] || fail 'Есть новые посторонние файлы'
git add src/worker.mjs public/js/main-menu-ui.js public/css/race-control-v65.css
git diff --cached --quiet && fail 'Изменений для публикации нет'
git commit -m 'V73.1: fix account level API and main menu car preview'
git push origin HEAD:main || fail 'GitHub отклонил push; Cloudflare не обновлён'
npm run deploy || fail 'GitHub обновлён, но публикация Cloudflare завершилась ошибкой'
echo "${VERSION} успешно опубликована в GitHub и Cloudflare"
