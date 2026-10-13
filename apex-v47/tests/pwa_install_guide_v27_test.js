/* V27: iPhone portrait install guide must be clear and visible. */
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/css/style.css'),'utf8');
function ok(v,msg){if(!v)throw new Error(msg);}
ok(html.includes('ВАЖНО ДЛЯ IPHONE'),'iPhone install badge missing');
ok(html.includes('Откройте страницу в Safari'),'Safari instruction missing');
ok(html.includes('кнопку «Поделиться»'),'Share instruction missing');
ok(html.includes('«На экран Домой»'),'Add to Home Screen instruction missing');
ok(html.includes('Нажмите «Добавить»'),'final Add instruction missing');
ok(html.includes('css/style.css?v=20260919-v43'),'V27 stylesheet cache bust missing');
ok(css.includes('.install-guide')&&css.includes('.install-steps'),'install guide styles missing');
ok(css.includes('@media (display-mode: standalone)'),'standalone hide rule missing');
ok(css.includes('@media (max-height: 700px) and (orientation: portrait)'),'short iPhone portrait layout missing');
console.log('pwa_install_guide_v27_test: OK');
