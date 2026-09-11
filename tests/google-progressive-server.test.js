const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','Code.js'),'utf8');
function harness() {
  const calls={authorize:0,fetch:0}, checksum='a'.repeat(32);
  const jpeg=[255,216,255,192,0,17,8,0,128,0,128,3,1,17,0,2,17,0,3,17,0,255,217];
  const c={console,Number,JSON,Array,Set,Error,Math,
    getReadableImageContext_:id=>{calls.authorize++;if(id!=='allowed')throw Error('outside');return{fileId:id};},
    Drive:{Files:{get:()=>({md5Checksum:checksum})}},
    Utilities:{base64Encode:b=>Buffer.from(b).toString('base64')},
    ScriptApp:{getOAuthToken:()=> 'secret'},
    UrlFetchApp:{fetchAll:req=>{calls.fetch+=req.length;return req.map(()=>({getResponseCode:()=>200,getBlob:()=>({getBytes:()=>jpeg,getContentType:()=> 'image/jpeg'})}));}},
    getGooglePackContext_:id=>{c.getReadableImageContext_(id);return{checksum,manifest:{width:1024,height:512},files:Array.from({length:32},(_,i)=>({id:'tile'+i,name:'tile-'+i+'.jpg',size:jpeg.length,mimeType:'image/jpeg'}))};}
  };
  vm.createContext(c);
  for(const name of ['readJpegDimensions_','getSceneTileBatch']) {
    const found=source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));assert.ok(found,`${name} exists`);vm.runInContext(found[0],c);
  }
  return {c,calls,checksum};
}
test('tile batch is authorized, bounded and deduplicated',()=>{
  const {c,calls,checksum}=harness();
  const r=c.getSceneTileBatch({fileId:'allowed',checksum,tiles:[0,1,1]});
  assert.equal(r.success,true);assert.equal(r.tiles.length,2);assert.equal(calls.fetch,2);assert.equal(calls.authorize,1);
});
test('tile batch rejects scope, stale generation, traversal, oversized and fractional requests before fetch',()=>{
  for(const change of [{fileId:'outside'},{checksum:'b'.repeat(32)},{tiles:['../secret']},{tiles:Array.from({length:9},(_,i)=>i)},{tiles:[1.5]},{tiles:[32]}]) {
    const {c,calls,checksum}=harness();
    assert.equal(c.getSceneTileBatch({fileId:'allowed',checksum,tiles:[0],...change}).success,false);
    assert.equal(calls.fetch,0);
  }
});
test('tile partial failure does not discard successful siblings or expose OAuth',()=>{
  const {c,calls,checksum}=harness();
  const fetch=c.UrlFetchApp.fetchAll;
  c.UrlFetchApp.fetchAll=req=>{const r=fetch(req);r[1]={getResponseCode:()=>403};return r;};
  const r=c.getSceneTileBatch({fileId:'allowed',checksum,tiles:[0,1]});
  assert.equal(r.success,true);assert.equal(r.tiles.length,1);assert.deepEqual(Array.from(r.failed),[1]);
  assert.doesNotMatch(JSON.stringify(r),/secret/);
});

test('pack lookup validates scene scope, revision, manifest, and unique managed folders',()=>{
  const {c,checksum}=harness();
  const iterator=items=>({hasNext:()=>items.length>0,next:()=>items.shift()});
  const manifest={schemaVersion:1,sceneId:'allowed',checksum,width:1024,height:512,columns:8,rows:4};
  let duplicate=false,complete=true,listCalls=0;
  const metadataCache=new Map();
  c.CacheService={getScriptCache:()=>({get:key=>metadataCache.get(key),put:(key,value)=>metadataCache.set(key,value)})};
  const pack={getId:()=> 'managed-pack',getFilesByName:name=>iterator(complete?[{getSize:()=>1000,getBlob:()=>({getDataAsString:()=>JSON.stringify(manifest)})}]:[])};
  const folder={getFoldersByName:name=>iterator(duplicate?[pack,pack]:[pack])};
  c.getHotspotRootFolder_=()=>({getFoldersByName:name=>{assert.equal(name,'progressive');return iterator([folder]);}});
  c.Drive.Files.list=options=>{assert.match(options.q,/'managed-pack' in parents/);listCalls++;return{files:[]};};
  vm.runInContext(source.match(/function getGooglePackContext_\([^]*?\n\}/)[0],c);
  assert.equal(c.getGooglePackContext_('allowed').checksum,checksum);
  assert.equal(c.getGooglePackContext_('allowed').checksum,checksum);
  assert.equal(listCalls,1,'reuse metadata after rechecking scope and source revision');
  const authorize=c.getReadableImageContext_;
  c.getReadableImageContext_=()=>{throw Error('revoked');};
  assert.throws(()=>c.getGooglePackContext_('allowed'),/revoked/);
  c.getReadableImageContext_=authorize;
  c.Drive.Files.get=()=>({md5Checksum:'b'.repeat(32)});
  assert.throws(()=>c.getGooglePackContext_('allowed'),/Invalid manifest/);
  c.Drive.Files.get=()=>({md5Checksum:checksum});
  assert.throws(()=>c.getGooglePackContext_('outside'),/outside/);
  metadataCache.clear();
  duplicate=true;assert.throws(()=>c.getGooglePackContext_('allowed'),/Duplicate/);duplicate=false;
  complete=false;assert.throws(()=>c.getGooglePackContext_('allowed'),/Incomplete/);complete=true;
  manifest.checksum='b'.repeat(32);assert.throws(()=>c.getGooglePackContext_('allowed'),/Invalid/);
  assert.equal(listCalls,1);
});
