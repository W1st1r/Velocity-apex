const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/css/style.css'),'utf8');
const js=fs.readFileSync(path.join(root,'public/js/control-layout.js'),'utf8');
function ok(value,message){if(!value)throw new Error(message);}
ok(html.includes('id="controlLayoutOpenBtn"'),'settings layout button missing');
ok(html.includes('id="controlLayoutEditor"'),'layout editor missing');
for(const key of ['left','right','brake','handbrake','gas'])ok(html.includes(`data-layout-control="${key}"`),`editor node ${key} missing`);
ok(html.includes('js/control-layout.js?v=20260915-layout1'),'control layout script not loaded');
ok(css.includes('#controls.control-layout-custom .control-btn[data-layout-key]'),'race custom layout CSS missing');
ok(css.includes('#freeMobileControls.control-layout-custom button[data-layout-key]'),'free roam custom layout CSS missing');
ok(js.includes("velocityApex.controlLayout.v1"),'device layout storage key missing');
ok(js.includes('position')===false || js.includes('moveKeyToClient'),'drag position handler missing');
ok(js.includes('scale:clamp'),'size clamp missing');
ok(js.includes('apply(workingLayout,true)'),'live runtime preview missing');
console.log('control layout test: OK');
