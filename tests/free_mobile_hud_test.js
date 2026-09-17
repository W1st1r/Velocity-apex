const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'public/css/style.css'),'utf8');
const js=fs.readFileSync(path.join(root,'public/js/freeroam.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
function ok(v,msg){if(!v)throw new Error(msg);}
ok(css.includes('Free Roam Mobile HUD v3'),'mobile HUD stylesheet block missing');
ok(css.includes('(orientation:landscape) and (max-height:540px) and (max-width:1024px)'),'modern iPhone landscape query missing');
ok(css.includes('.free-roam.drag-active .free-chat-preview{display:none}'),'chat preview must clear the race sightline');
ok(css.includes('bottom:calc(72px + var(--safe-b))'),'open chat must sit above phone controls during drag');
ok(css.includes('nth-last-child(n+3)'),'phone chat preview should be limited to newest lines');
ok(js.includes("roam.classList.toggle('drag-active',!!d)"),'drag-active UI state missing');
ok(js.includes('toggleChat(false);'),'drag start must close open chat/keyboard');
ok(html.includes('css/style.css?v=20260916-adminprefix1'),'CSS cache version not bumped');
ok(html.includes('js/freeroam.js?v=20260916-adminprefix1'),'Free Roam cache version not bumped');
ok(js.includes("else if(state.paused){steer=0;throttle=0;brake=0;handbrake=0;}"),'pause must coast without forced braking');
ok(!js.includes("if(state.paused){car.vx=0;car.vy=0;car.speed=0"),'pause must not zero vehicle velocity');
ok(css.includes('Tuning mobile compact pass'),'compact tuning mobile stylesheet missing');

console.log('free mobile HUD test: OK');
