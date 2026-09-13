const {spawnSync}=require('child_process');
const tests=['physics_smoke.js','economy_smoke.js','porsche_shop_smoke.js','root_tools_smoke.js','track_geometry_smoke.js','trajectory_sector_test.js','standalone_race_test.js'];
for(const t of tests){console.log('\n== '+t+' ==');const r=spawnSync(process.execPath,[require('path').join(__dirname,t)],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
console.log('\nexisting standalone tests: OK');
