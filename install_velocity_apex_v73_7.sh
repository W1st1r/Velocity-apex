#!/usr/bin/env bash
set -Eeuo pipefail
VERSION=V73.7
ROOT="/workspaces/Velocity-apex"
STAGE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail(){ echo "❌ ОШИБКА: $VERSION — этап: ${STEP:-неизвестно}. База D1 не изменялась."; }
trap fail ERR
STEP="проверка проекта"
cd "$ROOT"
test -f wrangler.jsonc && test -f public/index.html && test -f package.json
if ! grep -q '"database_name": "velocity-apex-db"' wrangler.jsonc; then echo '❌ ОШИБКА: неизвестная база D1, публикация отменена'; exit 1; fi
STEP="резервная копия исходного HTML"
mkdir -p .velocity-backups
cp public/index.html ".velocity-backups/index-before-v73-7-$(date +%Y%m%d-%H%M%S).html"
STEP="установка исправлений"
cp "$STAGE/public/css/velocity-ui-v73-7.css" public/css/velocity-ui-v73-7.css
python3 - <<'PYCODE'
from pathlib import Path
p=Path('public/index.html'); s=p.read_text(); link='  <link rel="stylesheet" href="css/velocity-ui-v73-7.css?v=20261015-v73-7">'
if 'velocity-ui-v73-7.css' not in s:s=s.replace('</head>',link+'\n</head>',1)
assert s.count('velocity-ui-v73-7.css')==1
p.write_text(s)
PYCODE
STEP="проверка HTML и стилей"
python3 - <<'PYCODE'
from pathlib import Path
s=Path('public/index.html').read_text(); c=Path('public/css/velocity-ui-v73-7.css').read_text()
assert 'raceMenuCarImage' in s and 'friendsTitle' in s and 'accountTitle' in s and 'promoTitle' in s
assert '#menu .rc-car-holder img' in c and 'object-fit:contain!important' in c
assert 'velocity-ui-v73-7.css' in s
print('Проверка интерфейса: OK')
PYCODE
STEP="проверка проекта"
npm test >/tmp/velocity-v73-7-test.log 2>&1 || { tail -n 30 /tmp/velocity-v73-7-test.log; false; }
echo 'Основные тесты: OK'
STEP="проверка публикации"
npm run test:v66 >/tmp/velocity-v73-7-v66.log 2>&1 || { tail -n 30 /tmp/velocity-v73-7-v66.log; false; }
echo 'Тесты публикации: OK'
STEP="публикация Cloudflare"
npx wrangler deploy --config wrangler.jsonc
STEP="готово"
echo '========================================'
echo '✅ V73.7 УСПЕШНО ОПУБЛИКОВАНА'
echo 'База D1 не сбрасывалась. Проверь меню на iPhone.'
echo '========================================'
