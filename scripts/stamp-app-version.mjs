import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/version.json'),'utf8'));
const selected=manifest.channel==='development'?manifest.developmentVersion:manifest.version;
if(typeof selected!=='string'||!/^(?:V\d+(?:\.\d+)*|\d+\.\d+\.\d+(?:-[a-z\d.-]+)?)$/i.test(selected))throw new Error('INVALID_APP_VERSION');
const build=encodeURIComponent(selected.toLowerCase());
const withBuild=url=>{
  if(!/^(?:js|css)\//.test(url))return url;
  const [file,query='']=url.split('?'),params=new URLSearchParams(query);params.set('build',build);return `${file}?${params}`;
};

const htmlPath=path.join(root,'public/index.html');let html=fs.readFileSync(htmlPath,'utf8');
html=html.replace(/(<script\b[^>]*\bsrc=")([^"]+)(")/g,(_,a,url,c)=>a+withBuild(url)+c);
html=html.replace(/(<link\b[^>]*\bhref=")([^"]+)(")/g,(_,a,url,c)=>a+withBuild(url)+c);
fs.writeFileSync(htmlPath,html);

console.log(`Stamped local app assets for ${selected}`);
