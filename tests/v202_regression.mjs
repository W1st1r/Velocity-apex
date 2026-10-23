import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const scripts=JSON.parse(fs.readFileSync('package.json','utf8')).scripts;
const plan=[];
for(const key of ['test','test:race:authority','test:clan-wars:v2','test:v2:bug-ghosts','test:map']){
  for(const command of scripts[key].split(' && ')){
    if(command==='node tests/run_all.js'){
      const source=fs.readFileSync('tests/run_all.js','utf8');
      const list=source.match(/const tests=\[([^\]]+)\]/)[1];
      for(const match of list.matchAll(/'([^']+)'/g))plan.push('node tests/'+match[1]);
    }else plan.push(command);
  }
}
const results=[];
fs.mkdirSync('artifacts/v202',{recursive:true});
for(const command of new Set(plan)){
  const [exe,...args]=command.split(' '),start=Date.now();
  const r=spawnSync(exe,args,{encoding:'utf8',maxBuffer:8*1024*1024});
  const log=(r.stdout||'')+(r.stderr||'');
  fs.appendFileSync('artifacts/v202/regression.log','\n== '+command+' ==\n'+log);
  results.push({command,status:r.status===0?'PASS':'FAIL',exit:r.status,seconds:(Date.now()-start)/1000,error:r.error?.message});
  console.log(results.at(-1).status+' '+command);
  if(r.status!==0)console.log(log.slice(-5000));
}
fs.writeFileSync('artifacts/v202/regression.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length}));
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
