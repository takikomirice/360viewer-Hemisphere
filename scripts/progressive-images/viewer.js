'use strict';
const $ = id => document.getElementById(id);
let scenes = [], viewer = null, generation = 0, thumbQueue = null, batchActive = false;
const records = [];
function record(value) { records.push(value); $('results').textContent = records.map(r => JSON.stringify(r)).join('\n'); }
function asset(m, p) { return '/assets/' + m.key + '/' + p; }
function current() { return scenes[Number($('scene').value) || 0]; }
function setWidth(value) {
  const width = Math.max(180, Math.min(480, window.innerWidth * .5, Number(value)));
  $('sidebar').style.width = width + 'px'; $('width').value = width;
  $('divider').setAttribute('aria-valuenow', String(Math.round(width)));
  if (viewer) viewer.resize();
}
$('width').addEventListener('input',e=>setWidth(e.target.value));
$('divider').addEventListener('pointerdown',e=>{ e.currentTarget.setPointerCapture(e.pointerId); });
$('divider').addEventListener('pointermove',e=>{ if(e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(e.clientX); });
$('divider').addEventListener('keydown',e=>{ if(['ArrowLeft','ArrowRight'].includes(e.key)){ e.preventDefault(); setWidth(parseFloat($('sidebar').style.width || '260')+(e.key==='ArrowLeft'?-10:10)); } });
function show(mode) {
  const m = current(); if (!m) return;
  generation++;
  const request = generation, start = performance.now();
  const fresh=$('fresh').checked, visibilityAtStart=document.visibilityState;
  const base='/assets/'+m.key+(fresh?'/@'+Date.now()+'-'+request:'');
  if (thumbQueue) thumbQueue.cancelPending();
  if (viewer) viewer.destroy();
  const config = { autoLoad:true, autoRotate:0, hfov:90, yaw:0, pitch:0, showControls:true, compass:false };
  if (mode === 'tiles') Object.assign(config, {type:'multires',multiRes:{...m.multiRes,basePath:base},preview:base+'/'+m.paths.preview});
  else Object.assign(config,{type:'equirectangular',panorama:base+'/'+(mode==='whole'?m.paths.original:m.paths.preview)});
  viewer = pannellum.viewer('panorama',config);
  let readyRecorded = false;
  function ready() {
    if (readyRecorded) return;
    readyRecorded = true;
    if (request!==generation) return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if (request!==generation) return;
      record({image:Number($('scene').value)+1,mode,event:'renderer-ready',ms:Math.round(performance.now()-start),note:'initialization only; multires tiles may still be loading'});
      let stableFrames=0;
      function settled() {
        if(request!==generation)return;
        if(performance.now()-start>20000){record({mode,event:'settle-timeout'});return;}
        const prefix=base+'/';
        const resources=performance.getEntriesByType('resource').filter(r=>{
          const p=new URL(r.name).pathname;
          if(r.startTime<start || !p.startsWith(prefix))return false;
          const relative=p.slice(prefix.length);
          return mode==='tiles' ? /^\d+\/[frblud]\d+_\d+\.jpg$/.test(relative) || relative===m.paths.preview : relative===(mode==='whole'?m.paths.original:m.paths.preview);
        });
        const hasImage=resources.some(r=>mode!=='tiles'||/\/\d+\/[frblud]\d+_\d+\.jpg$/.test(new URL(r.name).pathname));
        if(hasImage && viewer.isLoaded() && !viewer.getRenderer().isLoading())stableFrames++;else stableFrames=0;
        if(stableFrames>=2)record({image:Number($('scene').value)+1,mode,event:'current-view-settled',fresh,visibilityAtStart,visibilityAtEnd:document.visibilityState,ms:Math.round(performance.now()-start),completedImageRequests:resources.length,transferredBytes:resources.reduce((sum,r)=>sum+r.transferSize,0),note:'current visible tiles idle + 2 frames; not all directions or measured first paint'});
        else requestAnimationFrame(settled);
      }
      settled();
    }));
  }
  viewer.on('load',ready);
  if (viewer.isLoaded()) ready();
  viewer.on('error',message=>{if(request===generation)record({mode,event:'error',message:String(message)});});
}
for(const mode of ['whole','reduced','tiles']) $(mode).onclick=()=>show(mode);
$('scene').onchange=()=>{ updateSource();show('tiles'); };
function updateSource(){const m=current();$('source').textContent=`素材 ${m.source.width}×${m.source.height} / ${Math.round(m.source.bytes/1024)} KB`;}
async function loadImage(url,crossOrigin) {
  return new Promise((resolve,reject)=>{
    const img=new Image(); if(crossOrigin)img.crossOrigin='anonymous';
    const timer=setTimeout(()=>{img.src='';reject(new Error('15秒でタイムアウト'));},15000);
    img.onload=()=>{clearTimeout(timer);resolve(img);};img.onerror=()=>{clearTimeout(timer);reject(new Error('画像を取得できません'));};img.src=url;
  });
}
async function thumbnails(concurrency) {
  if(batchActive)return;
  batchActive=true;$('serial').disabled=true;$('parallel').disabled=true;
  if(thumbQueue)thumbQueue.cancelPending();
  const queue=thumbQueue=createImageQueue(concurrency), start=performance.now(), run=Date.now();
  const delay=Number($('delay').value), m=current();
  $('thumbs').replaceChildren();
  let loaded=0,failed=0,cancelled=0,first=null;
  const jobs=[];
  for(let i=0;i<16;i++){
    const slot=document.createElement('div');slot.textContent=`${i+1}: 待機`; $('thumbs').append(slot);
    jobs.push(queue.add(String(i),()=>loadImage(asset(m,m.paths.thumbnailWebp)+`?run=${run}-${i}&delay=${delay}`)).then(result=>{
      if(result.status==='loaded'){loaded++;if(first===null)first=Math.round(performance.now()-start);result.value.alt=`サムネイル ${i+1}`;slot.replaceChildren(result.value);}
      else if(result.status==='failed'){failed++;slot.textContent=`${i+1}: 取得失敗`;}
      else {cancelled++;slot.textContent=`${i+1}: 中止`;}
    }));
  }
  await Promise.all(jobs);
  record({event:'thumbnail-batch',concurrency,artificialDelayMs:delay,firstMs:first,totalMs:Math.round(performance.now()-start),loaded,failed,cancelled});
  batchActive=false;$('serial').disabled=false;$('parallel').disabled=false;
}
$('serial').onclick=()=>thumbnails(1);$('parallel').onclick=()=>thumbnails(4);$('stop').onclick=()=>thumbQueue?.cancelPending();
async function probe(cors){
  let url;try{url=new URL($('drive-url').value);if(url.protocol!=='https:'||!/^lh\d+\.google(?:usercontent)?\.com$/.test(url.hostname))throw new Error();}catch{record({event:'drive-probe',error:'Google画像URLを入力してください'});return;}
  const start=performance.now();
  try {const img=await loadImage(url.href,cors);record({event:'drive-probe',cors,status:'loaded',ms:Math.round(performance.now()-start),width:img.naturalWidth,height:img.naturalHeight});}
  catch{record({event:'drive-probe',cors,status:'failed',ms:Math.round(performance.now()-start)});}
}
$('drive-plain').onclick=()=>probe(false);$('drive-cors').onclick=()=>probe(true);
fetch('/manifest.json').then(r=>r.json()).then(data=>{
  scenes=data;
  if(!scenes.length){$('results').textContent='先にgenerate.jsで画像を生成してください。';return;}
  scenes.forEach((m,i)=>{
    const option=document.createElement('option');option.value=i;option.textContent=`画像 ${i+1} (${m.source.width}×${m.source.height})`;$('scene').append(option);
    const button=document.createElement('button');button.className='scene';
    const image=document.createElement('img');image.alt=`画像 ${i+1}`;image.loading='lazy';image.src=asset(m,m.paths.thumbnailWebp);button.append(image);
    button.onclick=()=>{$('scene').value=i;updateSource();show('tiles');};$('scene-list').append(button);
  });
  $('results').textContent='比較する表示方式を選んでください。';updateSource();
}).catch(()=>{$('results').textContent='画像情報の取得に失敗しました。';});
