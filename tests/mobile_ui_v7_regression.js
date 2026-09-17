import fs from 'node:fs';
const css=fs.readFileSync(new URL('../public/css/mobile-ui.css',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../public/js/admin-system.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../src/admin-system.mjs',import.meta.url),'utf8');
if(!css.includes('.menu-screen.hidden{display:none!important}')) throw new Error('menu hidden override missing');
if(!js.includes('ЖАЛОБА #${no} УСПЕШНО ОТПРАВЛЕНА')) throw new Error('complaint success text missing');
if(js.includes('d.ticket.no} ОТПРАВЛЕНО')) throw new Error('unsafe ticket response access remains');
if(!server.includes('inserted?.meta?.last_row_id')) throw new Error('ticket create response is not insert-backed');
console.log('mobile_ui_v7_regression: ok');
