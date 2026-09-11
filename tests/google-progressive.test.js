const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

test('Google pack is complete, bounded, reusable, and repairs damaged tiles', async () => {
  const { generateGooglePack } = require('../scripts/progressive-images/google-pack');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hemisphere-pack-'));
  try {
    const input = path.join(dir, 'source.jpg');
    await sharp({create:{width:1024,height:512,channels:3,background:'#315ca0'}}).jpeg().toFile(input);
    const pack = await generateGooglePack(input, dir, 'scene_a');
    assert.equal(pack.width,1024); assert.equal(pack.height,512);
    assert.equal(pack.columns,8); assert.equal(pack.rows,4);
    assert.equal(pack.files.length,34);
    for (const entry of pack.files) assert.equal((await fs.stat(path.join(pack.directory,entry.name))).size,entry.bytes);
    const preview = await sharp(path.join(pack.directory,'preview.jpg')).metadata();
    assert.equal(preview.width,512);
    const last = await sharp(path.join(pack.directory,'tile-31.jpg')).metadata();
    assert.equal(last.width,128); assert.equal(last.height,128);
    assert.equal((await generateGooglePack(input,dir,'scene_a')).reused,true);
    await fs.writeFile(path.join(pack.directory,'tile-31.jpg'),'broken');
    assert.equal((await generateGooglePack(input,dir,'scene_a')).reused,false);
    assert.equal((await sharp(path.join(pack.directory,'tile-31.jpg')).metadata()).width,128);
    await assert.rejects(generateGooglePack(input,dir,'../escape'),/scene ID/);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('visible tile selection handles wraparound, poles and invalid angles', () => {
  const { visibleTiles } = require('../scripts/progressive-images/google-client');
  const center = visibleTiles(0,0,90,60);
  assert.ok(center.includes(11) && center.includes(12) && center.includes(19) && center.includes(20));
  assert.ok(center.length <= 8,'do not fetch polar rows for a horizontal view');
  const seam = visibleTiles(180,0,90,60);
  assert.ok(seam.includes(8) && seam.includes(15));
  assert.ok(!seam.includes(11));
  const pole = visibleTiles(0,85,90,60);
  for(let i=0;i<8;i++) assert.ok(pole.includes(i));
  assert.deepEqual(visibleTiles(NaN,0,90,60),[]);
});

test('tile bounds contain sampled viewport rays across tilted and seam-crossing views',()=>{
  const {visibleTiles}=require('../scripts/progressive-images/google-client');
  for(const yaw of [-179,0,150])for(const pitch of [-85,-45,0,45,85])for(const hfov of [45,90,120]){
    const vfov=70, tiles=new Set(visibleTiles(yaw,pitch,hfov,vfov));
    const radians=pitch*Math.PI/180;
    for(let a=-8;a<=8;a++)for(let b=-8;b<=8;b++){
      const u=a/8*Math.tan(hfov*Math.PI/360), v=b/8*Math.tan(vfov*Math.PI/360);
      const y=(v*Math.cos(radians)+Math.sin(radians))/Math.hypot(u,v,1);
      const z=Math.cos(radians)-v*Math.sin(radians);
      const lon=((Math.atan2(u,z)*180/Math.PI+yaw+180)%360+360)%360;
      const lat=Math.asin(Math.max(-1,Math.min(1,y)))*180/Math.PI;
      const index=Math.min(3,Math.floor((90-lat)/45))*8+Math.min(7,Math.floor(lon/45));
      assert.ok(tiles.has(index),`${yaw}/${pitch}/${hfov}: missing ${index}`);
    }
  }
});

test('GAS client include is a complete script element, preventing HTML escaping of JavaScript operators',async()=>{
  const generated=await fs.readFile(path.join(__dirname,'../progressive-client.html'),'utf8');
  assert.match(generated,/<script>\s*\(function/);
  assert.match(generated,/<\/script>\s*$/);
  const lab=await fs.readFile(path.join(__dirname,'../delivery-lab.html'),'utf8');
  assert.doesNotMatch(lab,/<script>\s*<\?!= include\('progressive-client'\)/);
});
