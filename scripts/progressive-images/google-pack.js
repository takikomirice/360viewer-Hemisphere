'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const sharp = require('sharp');
const digest = (bytes, algorithm='sha256') => createHash(algorithm).update(bytes).digest('hex');

async function generateGooglePack(input, output, sceneId) {
  if (!/^[\w-]{1,160}$/.test(sceneId)) throw Error('Invalid scene ID');
  const bytes = await fs.readFile(input);
  const meta = await sharp(bytes,{limitInputPixels:100000000}).metadata();
  if (meta.width !== meta.height*2 || meta.width<512 || (meta.orientation||1)!==1 || (meta.pages||1)!==1) throw Error('Use an orientation-normalized full panorama, at least 512px wide');
  const checksum = digest(bytes,'md5');
  const directory = path.resolve(output,`google-v1-${sceneId}-${checksum}`);
  const width = Math.floor(Math.min(meta.width,4096)/8)*8, height = width/2;
  const manifestPath = path.join(directory,'manifest.json');
  try {
    const old = JSON.parse(await fs.readFile(manifestPath,'utf8'));
    if(old.schemaVersion===1 && old.checksum===checksum && old.sceneId===sceneId && old.files.length===34) {
      let valid=true;
      for(const entry of old.files) {
        if(!/^(preview|full|tile-(?:[0-9]|[12][0-9]|3[01]))\.jpg$/.test(entry.name)) {valid=false;break;}
        const data=await fs.readFile(path.join(directory,entry.name));
        if(data.length!==entry.bytes || digest(data)!==entry.sha256) {valid=false;break;}
      }
      if(valid) return {...old,directory,reused:true};
    }
  } catch(error) {if(!['ENOENT','ENOTDIR'].includes(error.code) && !(error instanceof SyntaxError)) throw error;}
  await fs.mkdir(directory,{recursive:true});
  await fs.rm(manifestPath,{force:true});
  const pixels = await sharp(bytes).resize(width,height).flatten({background:'#000'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const raw={width,height,channels:3};
  await sharp(pixels,{raw}).jpeg({quality:82}).toFile(path.join(directory,'full.jpg'));
  await sharp(pixels,{raw}).resize(512,256).jpeg({quality:65}).toFile(path.join(directory,'preview.jpg'));
  for(let i=0;i<32;i++) {
    await sharp(pixels,{raw}).extract({left:(i%8)*width/8,top:Math.floor(i/8)*height/4,width:width/8,height:height/4})
      .jpeg({quality:82}).toFile(path.join(directory,`tile-${i}.jpg`));
  }
  const files=[];
  for(const name of ['preview.jpg','full.jpg',...Array.from({length:32},(_,i)=>`tile-${i}.jpg`)]) {
    const data=await fs.readFile(path.join(directory,name)); files.push({name,bytes:data.length,sha256:digest(data)});
  }
  const manifest={schemaVersion:1,sceneId,checksum,width,height,columns:8,rows:4,files};
  await fs.writeFile(manifestPath,JSON.stringify(manifest));
  return {...manifest,directory,reused:false};
}
module.exports={generateGooglePack};
if(require.main===module) generateGooglePack(...process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
