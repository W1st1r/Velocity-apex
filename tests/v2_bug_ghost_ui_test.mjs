import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),support=fs.readFileSync(new URL('../public/js/admin-system.js',import.meta.url),'utf8'),game=fs.readFileSync(new URL('../public/js/game.js',import.meta.url),'utf8');
for(const item of ['data-support-tab="bug"','data-support-tab="player"','data-support-tab="account"','data-support-tab="other"','id="ghostHud"','data-open-ghost-picker="normal"','data-open-ghost-picker="career"'])assert.ok(html.includes(item),`missing interface element ${item}`);
for(const item of ['id="bugImages"','type="file" accept="image/jpeg,image/png,image/webp" multiple','renderBugPreviews','data-remove-bug-image','FormData','/api/bugs','submitBugReport','internalComment','Ответ игроку'])assert.ok(support.includes(item),`missing report UI behavior ${item}`);
for(const item of ['openGhostPicker','БЕЗ ПРИЗРАКА','showTrail','ghostAtProgress','drawGhost','ghostRequest'])assert.ok(game.includes(item),`missing ghost interface behavior ${item}`);
console.log('v2_bug_ghost_ui_test: support, screenshot picker, owner response, ghost selection and HUD hooks passed');
