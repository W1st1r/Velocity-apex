const fallback='2.0.1';
const versionPattern=/^(?:V\d+(?:\.\d+)*|\d+\.\d+\.\d+(?:-[a-z\d.-]+)?)$/i;

export async function loadAppVersion(fetcher=fetch,doc=document){
  try{
    const response=await fetcher('./version.json',{cache:'no-store'});
    if(!response.ok)throw new Error('VERSION_UNAVAILABLE');
    const manifest=await response.json();
    const selected=manifest.channel==='development'?manifest.developmentVersion:manifest.version;
    const version=typeof selected==='string'&&versionPattern.test(selected)?selected:fallback;
    const resourceVersion=typeof manifest.resourceVersion==='string'&&versionPattern.test(manifest.resourceVersion)?manifest.resourceVersion:version;
    const protocolVersion=Number.isInteger(manifest.protocolVersion)&&manifest.protocolVersion>0?manifest.protocolVersion:1;
    const meta=doc.querySelector('meta[name="velocity-apex-version"]');if(meta)meta.content=version;
    if(doc.documentElement){doc.documentElement.dataset.appVersion=version;doc.documentElement.dataset.resourceVersion=resourceVersion;doc.documentElement.dataset.protocolVersion=String(protocolVersion);}
    doc.title=`Velocity Apex · ${version}`;
    doc.querySelectorAll('[data-app-version]').forEach(node=>{if(node!==doc.documentElement)node.textContent=version;});
    return version;
  }catch{return fallback;}
}

if(typeof document!=='undefined')loadAppVersion();
