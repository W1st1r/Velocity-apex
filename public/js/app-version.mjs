const fallback='2.0.2';
const versionPattern=/^(?:V\d+(?:\.\d+)*|\d+\.\d+\.\d+(?:-[a-z\d.-]+)?)$/i;

function applyVersion(doc,version,resourceVersion=version,protocolVersion=1){
  const meta=doc.querySelector('meta[name="velocity-apex-version"]');if(meta)meta.content=version;
  if(doc.documentElement){doc.documentElement.dataset.appVersion=version;doc.documentElement.dataset.resourceVersion=resourceVersion;doc.documentElement.dataset.protocolVersion=String(protocolVersion);}
  doc.title=`Velocity Apex · ${version}`;
  doc.querySelectorAll('[data-app-version]').forEach(node=>{if(node!==doc.documentElement)node.textContent=version;});
  return version;
}

export async function loadAppVersion(fetcher=fetch,doc=document){
  try{
    const response=await fetcher(`./version.json?build=${encodeURIComponent(fallback)}`,{cache:'no-store'});
    if(!response.ok)throw new Error('VERSION_UNAVAILABLE');
    const manifest=await response.json();
    const selected=manifest.channel==='development'?manifest.developmentVersion:manifest.version;
    let version=typeof selected==='string'&&versionPattern.test(selected)?selected:fallback;
    // A stale production manifest must not make a newer app shell identify as an older build.
    if(manifest.channel!=='development'&&version!==fallback)version=fallback;
    const manifestResource=typeof manifest.resourceVersion==='string'&&versionPattern.test(manifest.resourceVersion)?manifest.resourceVersion:version;
    const resourceVersion=manifest.channel==='development'?manifestResource:(manifestResource===version?manifestResource:version);
    const protocolVersion=Number.isInteger(manifest.protocolVersion)&&manifest.protocolVersion>0?manifest.protocolVersion:1;
    return applyVersion(doc,version,resourceVersion,protocolVersion);
  }catch{return applyVersion(doc,fallback,fallback,1);}
}

if(typeof document!=='undefined')loadAppVersion();
