import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';

const quote=s=>'"'+s.replaceAll('"','""')+'"';
function fingerprints(db){
  const result=new Map();
  for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations','_cf_KV')").all()){
    const columns=db.prepare(`PRAGMA table_info(${quote(name)})`).all().map(x=>x.name).filter(c=>name!=='clan_war_districts'||!['name','map_x','map_y','updated_at'].includes(c));
    const rows=db.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)}`).all().map(x=>JSON.stringify(x)).sort();
    result.set(name,{columns,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')});
  }
  return result;
}
function integrity(db){assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);}
export function verifyMigrationCopy(input,migrationDir=new URL('../migrations/',import.meta.url)){
  // The export remains inside the runner: it is never imported into public staging.
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(readFileSync(input,'utf8'));integrity(db);
    const files=readdirSync(migrationDir).filter(f=>/^\d{4}_.+\.sql$/.test(f)).sort();
    assert.equal(files.length,33);files.forEach((f,i)=>assert.equal(Number(f.slice(0,4)),i+1));
    const before=fingerprints(db),applied=new Set(db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(x=>x.name));
    const nums=[...applied].map(f=>Number(f.slice(0,4))).sort((a,b)=>a-b);
    assert.ok(nums.length>=21,'V77 migration inventory is incomplete');nums.forEach((n,i)=>assert.equal(n,i+1,'migration inventory is not contiguous'));
    for(const f of applied)assert.ok(files.includes(f),'unknown applied migration');
    let count=0;
    for(const file of files){if(applied.has(file))continue;db.exec(readFileSync(new URL(file,new URL(String(migrationDir).endsWith('/')?String(migrationDir):String(migrationDir)+'/',import.meta.url)),'utf8'));db.prepare('INSERT INTO d1_migrations(name,applied_at) VALUES(?,?)').run(file,Date.now());count++;}
    integrity(db);
    for(const [table,{columns,hash}] of before){const rows=db.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`).all().map(x=>JSON.stringify(x)).sort();assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),hash,`existing records changed: ${table}`);}
    const after=new Set(db.prepare('SELECT name FROM d1_migrations').all().map(x=>x.name));
    assert.equal(files.filter(f=>!after.has(f)).length,0,'repeat migration plan is not empty');
    return{ok:true,applied:count,protectedTables:before.size,totalMigrations:files.length,repeatPending:0};
  }finally{db.close();}
}
