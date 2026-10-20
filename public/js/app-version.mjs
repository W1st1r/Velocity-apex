const fallback='V77';
const versionPattern=/^(?:V\d+(?:\.\d+)*|\d+\.\d+\.\d+(?:-[a-z\d.-]+)?)$/i;

export async function loadAppVersion(fetcher=fetch,doc=document){
  try{
    const response=await fetcher('./version.json',{cache:'no-store'});
    if(!response.ok)throw new Error('VERSION_UNAVAILABLE');
    const manifest=await response.json();
    const selected=manifest.channel==='development'?manifest.developmentVersion:manifest.version;
    const version=typeof selected==='string'&&versionPattern.test(selected)?selected:fallback;
    const meta=doc.querySelector('meta[name="velocity-apex-version"]');if(meta)meta.content=version;
    doc.title=`Velocity Apex · ${version}`;
    doc.querySelectorAll('[data-app-version]').forEach(node=>{node.textContent=version;});
    return version;
  }catch{return fallback;}
}

if(typeof document!=='undefined')loadAppVersion();
