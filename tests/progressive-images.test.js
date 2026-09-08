'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { cubeDirection, directionToPixel, sampleBilinear } = require('../scripts/progressive-images/project');
const { generate } = require('../scripts/progressive-images/generate');

test('cube faces and their shared edges use Pannellum orientation', () => {
  const centers = { f:[0,0,1], r:[1,0,0], b:[0,0,-1], l:[-1,0,0], u:[0,1,0], d:[0,-1,0] };
  for (const [face, expected] of Object.entries(centers)) {
    assert.deepEqual(cubeDirection(face, 0, 0).map(v => v || 0), expected);
  }
  assert.deepEqual(cubeDirection('f', 1, .3), cubeDirection('r', -1, .3));
  assert.deepEqual(cubeDirection('f', .2, -1), cubeDirection('u', .2, 1));
  assert.deepEqual(cubeDirection('f', .2, 1), cubeDirection('d', .2, -1));
  assert.deepEqual(directionToPixel([1,0,0], 360,180), {x:269.5,y:89.5});
  assert.deepEqual(directionToPixel([0,1,0], 360,180), {x:179.5,y:-.5});
});

test('bilinear sampling wraps the panorama seam and clamps the poles', () => {
  const pixels = Buffer.from([0,0,0, 100,100,100, 200,200,200, 240,240,240]);
  assert.deepEqual(sampleBilinear(pixels,4,1,-.5,-20), [120,120,120]);
  assert.deepEqual(sampleBilinear(pixels,4,1,3.5,20), [120,120,120]);
});

const options = {cubeResolution:64,tileResolution:32,previewWidth:128,thumbnailWidth:64,thumbnailHeight:36};
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'hemisphere-projection-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const source = path.join(root,'source.png');
  const raw = Buffer.alloc(256*128*3);
  for(let y=0;y<128;y++) for(let x=0;x<256;x++) {
    const i=(y*256+x)*3; raw[i]=x;raw[i+1]=y*2;raw[i+2]=50;
  }
  await sharp(raw,{raw:{width:256,height:128,channels:3}}).png().toFile(source);
  return {root,source,output:path.join(root,'output')};
}

test('generation creates valid panorama levels, previews and perspective thumbnails', async t => {
  const {source,output} = await fixture(t);
  const manifest = await generate(source,output,options);
  assert.deepEqual([manifest.source.width,manifest.source.height],[256,128]);
  assert.equal(manifest.multiRes.maxLevel,2);
  assert.equal(manifest.multiRes.path,'/%l/%s%y_%x');
  assert.equal(manifest.files.length,34);
  for(const [asset,w,h] of [[manifest.paths.preview,128,64],[manifest.paths.thumbnailWebp,64,36],[manifest.paths.thumbnailJpeg,64,36],['2/f0_0.jpg',32,32]]) {
    const meta=await sharp(await fs.readFile(path.join(manifest.directory,asset))).metadata();
    assert.deepEqual([meta.width,meta.height],[w,h]);
  }
  assert.deepEqual(await fs.readFile(path.join(manifest.directory,manifest.paths.original)),await fs.readFile(source));
  assert.equal(JSON.parse(await fs.readFile(path.join(manifest.directory,'manifest.json'),'utf8')).key,manifest.key);
  for (const [asset,red,green] of [['1/f0_0.jpg',129,130],['1/r0_0.jpg',193,130],['1/u0_0.jpg',160,4],['thumbnail.jpg',129,130]]) {
    const {data,info}=await sharp(await fs.readFile(path.join(manifest.directory,asset))).raw().toBuffer({resolveWithObject:true});
    const offset=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*info.channels;
    assert.ok(Math.abs(data[offset]-red)<12,`${asset} center yaw is wrong: ${data[offset]}`);
    assert.ok(Math.abs(data[offset+1]-green)<12,`${asset} center pitch is wrong: ${data[offset+1]}`);
  }
});

test('identity survives rename, normalizes defaults, changes with settings, and reuse repairs missing or corrupt assets',async t => {
  const {source,root,output} = await fixture(t);
  const first=await generate(source,output,options);
  const renamed=path.join(root,'renamed.png');await fs.copyFile(source,renamed);
  const target=path.join(first.directory,'2/f0_0.jpg');
  const stamp=(await fs.stat(target)).mtimeMs;
  const reused=await generate(renamed,output,{...options,yaw:360,quality:82});
  assert.equal(reused.key,first.key);assert.equal(reused.reused,true);
  assert.equal((await fs.stat(target)).mtimeMs,stamp);
  await fs.unlink(target);
  assert.equal((await generate(source,output,options)).reused,false);
  const good=await fs.readFile(target);await fs.writeFile(target,Buffer.alloc(good.length));
  assert.equal((await generate(source,output,options)).reused,false);
  assert.deepEqual(await fs.readFile(target),good);
  assert.notEqual((await generate(source,output,{...options,yaw:90})).key,first.key);
});

test('an interrupted asset write never publishes a completed manifest',async t => {
  const {source,output}=await fixture(t);
  const first=await generate(source,output,options);
  const manifestPath=path.join(first.directory,'manifest.json');
  await fs.unlink(manifestPath);
  const tile=path.join(first.directory,'2/f0_0.jpg');
  await fs.unlink(tile);await fs.mkdir(tile);
  await assert.rejects(generate(source,output,options));
  assert.equal(await fs.stat(manifestPath).then(()=>true,()=>false),false);
});

test('invalid configuration or non-panorama inputs leave no completed output', async t => {
  const {source,root,output}=await fixture(t);
  for(const config of [{...options,cubeResolution:100},{...options,cubeResolution:128},{...options,hfov:180},{...options,thumbnailWidth:1000},{...options,typo:1}]) {
    await assert.rejects(generate(source,output,config));
  }
  const square=path.join(root,'square.jpg');
  await sharp({create:{width:32,height:32,channels:3,background:'red'}}).jpeg().toFile(square);
  await assert.rejects(generate(square,output,options),/2:1/);
  assert.equal(await fs.stat(output).then(()=>true,()=>false),false);
});
