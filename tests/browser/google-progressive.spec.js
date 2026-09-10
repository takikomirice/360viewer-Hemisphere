const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const sharp=require('sharp');
let full,tile,preview;
test.beforeAll(async()=>{
  const build=path.join(root,'output/quality-audit/google-progressive/pannellum-2.5.6.js');
  if(!fs.existsSync(build))throw Error('Run scripts/progressive-images/prepare-browser-test.ps1 before this real-renderer test.');
  expect(require('node:crypto').createHash('sha256').update(fs.readFileSync(build)).digest('hex')).toBe('a28b2f7b339fd0a602c6769df1dca6ad43af73bc8c6a5be67209715289c12a9a');
  const uri=async(width,height,color)=>'data:image/jpeg;base64,'+(await sharp({create:{width,height,channels:3,background:color}}).jpeg().toBuffer()).toString('base64');
  full=await uri(1024,512,'#df9033');preview=await uri(512,256,'#203b54');tile=await uri(128,128,'#df9033');
});
async function openLab(page,failTiles=false) {
  const html=fs.readFileSync(path.join(root,'delivery-lab.html'),'utf8').replace("<?!= include('progressive-client'); ?>",fs.readFileSync(path.join(root,'progressive-client.html'),'utf8'));
  await page.route('https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/*',route=>{
    const extension=route.request().url().endsWith('.js')?'js':'css';
    return route.fulfill({path:path.join(root,'output/quality-audit/google-progressive/pannellum-2.5.6.'+extension),contentType:extension==='js'?'application/javascript':'text/css'});
  });
  await page.route('http://127.0.0.1:4173/google-lab',route=>route.fulfill({body:html,contentType:'text/html'}));
  await page.addInitScript(({full,tile,preview,failTiles})=>{
    window.__tileRequests=0;
    window.google={script:{run:new Proxy({}, {get(_,method){
      if(method==='withSuccessHandler')return success=>({withFailureHandler:failure=>new Proxy({}, {get(_,name){return (...args)=>setTimeout(()=>{
        if(name==='getConfig')return success({images:[{id:'scene',name:'比較写真'}]});
        if(name==='getSceneTileBatch'){window.__tileRequests++;return success({success:!failTiles&&!window.__failNextTiles,error:'tile failed',tiles:args[0].tiles.map(index=>({index,imageUrl:tile})),failed:[]});}
        success({success:true,checksum:'a'.repeat(32),width:1024,height:512,imageUrl:name==='getImageDataUri'||args[1]==='full'?full:preview});
      },name==='getSceneTileBatch'||args[1]==='full'?1200:50);}})});
    }})}};
  },{full,tile,preview,failTiles});
  await page.goto('/google-lab');await expect(page.locator('#start')).toBeEnabled();
}
for(const method of ['single','full','tiles'])test(`real Pannellum 2.5.6 renders ${method} and records visible completion`,async({page})=>{
  await openLab(page);await page.locator('#method').selectOption(method);await page.locator('#start').click();
  async function centerPixel(){const bytes=await page.locator('#view').screenshot();const meta=await sharp(bytes).metadata();return sharp(bytes).extract({left:Math.floor(meta.width/2),top:Math.floor(meta.height/2),width:1,height:1}).removeAlpha().raw().toBuffer();}
  if(method!=='single'){
    await expect(page.locator('#status')).toContainText('操作できます');
    const pixel=await centerPixel();expect(pixel[2]).toBeGreaterThan(pixel[0]);
  }
  await expect(page.locator('#results')).toContainText('"status": "complete"',{timeout:15000});
  const [row]=JSON.parse(await page.locator('#results').textContent());
  expect(row.firstSceneMs).toBeGreaterThan(0);expect(row.currentViewMs).toBeGreaterThanOrEqual(row.firstSceneMs);
  expect(row.firstImageReadyMs).toBeGreaterThan(0);expect(row.firstImageReadyMs).toBeLessThanOrEqual(row.firstSceneMs);
  expect(row.rpcMs).toBeGreaterThan(0);expect(row.frameWaitMs).toBeGreaterThan(0);
  const pixel=await centerPixel();expect(pixel[0]).toBeGreaterThan(pixel[2]);
  if(method==='tiles'){expect(row.tiles).toBeGreaterThan(0);expect(row.tiles).toBeLessThan(32);}
  await page.locator('#cold').uncheck();await page.locator('#start').click();
  await expect(page.locator('#start')).toBeEnabled();
  const rows=JSON.parse(await page.locator('#results').textContent());expect(rows[1].cacheHits).toBeGreaterThan(0);expect(rows[1].rpcCount).toBe(0);
});
test('tile failure keeps the preview available and allows retry',async({page})=>{
  await openLab(page,true);await page.locator('#method').selectOption('tiles');await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('tile failed');
  await expect(page.locator('#view canvas')).toBeVisible();await expect(page.locator('#start')).toBeEnabled();
});
test('cancelled refinement never completes a stale view',async({page})=>{
  await openLab(page);await page.locator('#method').selectOption('full');await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('操作できます');await page.locator('#cancel').click();
  await expect(page.locator('#start')).toBeEnabled();
  const [row]=JSON.parse(await page.locator('#results').textContent());expect(row.currentViewMs).toBeNull();expect(row.status).toBe('中止');
});
test('failed refinement after panning stops automatic requests and keeps the scene',async({page})=>{
  await openLab(page);await page.locator('#method').selectOption('tiles');await page.locator('#start').click();
  await expect(page.locator('#results')).toContainText('"status": "complete"');
  await page.evaluate(()=>{window.__failNextTiles=true;viewer.setYaw(160);});
  await expect(page.locator('#status')).toContainText('tile failed');
  const count=await page.evaluate(()=>window.__tileRequests);
  await page.waitForTimeout(2200);
  expect(await page.evaluate(()=>window.__tileRequests)).toBe(count);
  await expect(page.locator('#view canvas')).toBeVisible();
});
