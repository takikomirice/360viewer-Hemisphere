'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const sharp = require('sharp');
const {projectCubeFace, projectThumbnail} = require('./project');
const SCHEMA_VERSION = 1;
const FACES = ['f', 'r', 'b', 'l', 'u', 'd'];
const MAX_PIXELS = 100_000_000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const powerOfTwo = n => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

function normalizeOptions(options, width, height) {
  const defaultCube = 2 ** Math.floor(Math.log2(Math.min(1024, width / Math.PI)));
  const config = {
    cubeResolution: defaultCube, tileResolution: Math.min(512, options.cubeResolution ?? defaultCube),
    previewWidth: Math.min(1024, width), thumbnailWidth: Math.min(320, Math.floor(width / 4)),
    thumbnailHeight: Math.min(180, Math.floor(width / 4 * 9 / 16)),
    hfov: 90, yaw: 0, pitch: 0, quality: 82
  };
  for (const name of Object.keys(options)) {
    if (!(name in config)) throw new Error(`Unknown generation option: ${name}`);
    if (!Number.isFinite(options[name])) throw new Error(`Invalid generation option: ${name}`);
    config[name] = options[name];
  }
  for (const name of ['cubeResolution', 'tileResolution', 'previewWidth', 'thumbnailWidth', 'thumbnailHeight', 'quality']) {
    if (!Number.isInteger(config[name]) || config[name] < 1) throw new Error(`Invalid ${name}`);
  }
  if (!powerOfTwo(config.cubeResolution) || !powerOfTwo(config.tileResolution) ||
      config.tileResolution > config.cubeResolution || config.cubeResolution > 4096 || config.tileResolution > 512) {
    throw new Error('Cube and tile sizes must be bounded powers of two');
  }
  if (config.hfov < 10 || config.hfov >= 160 || Math.abs(config.pitch) > 90 || Math.abs(config.yaw) > 36000 || config.quality > 100) {
    throw new Error('Invalid projection angle or quality');
  }
  const vfov = 2 * Math.atan(Math.tan(config.hfov * Math.PI / 360) * config.thumbnailHeight / config.thumbnailWidth) * 180 / Math.PI;
  if (config.cubeResolution > width / Math.PI || config.previewWidth > width || config.previewWidth % 2 ||
      config.thumbnailWidth > width * config.hfov / 360 || config.thumbnailHeight > height * vfov / 180 ||
      config.previewWidth > 8192 || config.thumbnailWidth > 2048 || config.thumbnailHeight > 2048) {
    throw new Error('Requested output would upscale the source or exceed the size limit');
  }
  config.yaw = ((config.yaw % 360) + 360) % 360;
  return config;
}

async function generate(input, outputRoot, options = {}) {
  const sourceBytes = await fs.readFile(input);
  const metadata = await sharp(sourceBytes, {limitInputPixels: MAX_PIXELS}).metadata();
  if (!metadata.width || metadata.width !== metadata.height * 2) throw new Error('Source must be a full 2:1 panorama');
  if ((metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1) throw new Error('Use a single, orientation-normalized panorama');
  const extension = {jpeg: 'jpg', png: 'png', webp: 'webp'}[metadata.format];
  if (!extension) throw new Error('Use a JPEG, PNG, or WebP panorama');
  const config = normalizeOptions(options, metadata.width, metadata.height);
  const key = createHash('sha256').update(sourceBytes).update(JSON.stringify({schemaVersion: SCHEMA_VERSION, config})).digest('hex');
  const directory = path.resolve(outputRoot, key);
  const paths = {original: `original.${extension}`, preview: 'preview.jpg', thumbnailWebp: 'thumbnail.webp', thumbnailJpeg: 'thumbnail.jpg'};
  const multiRes = {path: '/%l/%s%y_%x', extension: 'jpg', tileResolution: config.tileResolution,
    maxLevel: Math.log2(config.cubeResolution / config.tileResolution) + 1, cubeResolution: config.cubeResolution};
  const expected = Object.values(paths);
  for (let level = 1; level <= multiRes.maxLevel; level++) {
    const count = 2 ** (level - 1);
    for (const face of FACES) for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) expected.push(`${level}/${face}${y}_${x}.jpg`);
  }
  const manifestPath = path.join(directory, 'manifest.json');
  try {
    const old = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (old.key === key && old.schemaVersion === SCHEMA_VERSION && old.files?.length === expected.length &&
        JSON.stringify(old.config) === JSON.stringify(config) && JSON.stringify(old.paths) === JSON.stringify(paths) &&
        JSON.stringify(old.multiRes) === JSON.stringify(multiRes)) {
      let valid = true;
      for (const assetPath of expected) {
        const entry = old.files.find(file => file.path === assetPath);
        if (!entry) { valid = false; break; }
        const bytes = await fs.readFile(path.join(directory, assetPath));
        if (entry.bytes !== bytes.length || entry.sha256 !== hash(bytes)) { valid = false; break; }
      }
      if (valid) return {...old, directory, reused: true};
    }
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code) && !(error instanceof SyntaxError)) throw error;
  }

  await fs.mkdir(directory, {recursive: true});
  // Invalidate a damaged generation before overwriting assets. A completed
  // manifest is published only after every expected asset has been hashed.
  await fs.rm(manifestPath, {force: true});
  await fs.writeFile(path.join(directory, paths.original), sourceBytes);
  await sharp(sourceBytes, {limitInputPixels: MAX_PIXELS}).resize(config.previewWidth).flatten({background: '#000'}).jpeg({quality: config.quality}).toFile(path.join(directory, paths.preview));
  const raw = await sharp(sourceBytes, {limitInputPixels: MAX_PIXELS}).flatten({background: '#000'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const thumbnail = projectThumbnail(raw, metadata.width, metadata.height, config);
  const thumbnailInput = {raw: {width: config.thumbnailWidth, height: config.thumbnailHeight, channels: 3}};
  await sharp(thumbnail, thumbnailInput).webp({quality: config.quality}).toFile(path.join(directory, paths.thumbnailWebp));
  await sharp(thumbnail, thumbnailInput).jpeg({quality: config.quality}).toFile(path.join(directory, paths.thumbnailJpeg));
  for (let level = 1; level <= multiRes.maxLevel; level++) await fs.mkdir(path.join(directory, String(level)), {recursive: true});
  for (const face of FACES) {
    const cube = projectCubeFace(raw, metadata.width, metadata.height, face, config.cubeResolution);
    for (let level = 1; level <= multiRes.maxLevel; level++) {
      const size = config.tileResolution * 2 ** (level - 1);
      const levelPixels = await sharp(cube, {raw: {width: config.cubeResolution, height: config.cubeResolution, channels: 3}}).resize(size, size).raw().toBuffer();
      for (let y = 0; y < size / config.tileResolution; y++) for (let x = 0; x < size / config.tileResolution; x++) {
        await sharp(levelPixels, {raw: {width: size, height: size, channels: 3}})
          .extract({left: x * config.tileResolution, top: y * config.tileResolution, width: config.tileResolution, height: config.tileResolution})
          .jpeg({quality: config.quality}).toFile(path.join(directory, `${level}/${face}${y}_${x}.jpg`));
      }
    }
  }
  const files = [];
  for (const assetPath of expected) {
    const bytes = await fs.readFile(path.join(directory, assetPath));
    files.push({path: assetPath, bytes: bytes.length, sha256: hash(bytes)});
  }
  const manifest = {schemaVersion: SCHEMA_VERSION, key, directory,
    source: {width: metadata.width, height: metadata.height, bytes: sourceBytes.length, sha256: hash(sourceBytes), format: metadata.format},
    config, paths, multiRes, files};
  const temporaryManifest = path.join(directory, 'manifest.pending.json');
  await fs.writeFile(temporaryManifest, JSON.stringify(manifest, null, 2) + '\n');
  await fs.rename(temporaryManifest, manifestPath);
  return {...manifest, reused: false};
}

module.exports = {generate};
if (require.main === module) {
  const [input, outputRoot, ...extra] = process.argv.slice(2);
  if (!input || !outputRoot || extra.length) {
    console.error('Usage: node scripts/progressive-images/generate.js <input> <output-root>');
    process.exitCode = 1;
  } else {
    generate(input, outputRoot).then(manifest => console.log(JSON.stringify(manifest, null, 2))).catch(error => {
      console.error(error.message); process.exitCode = 1;
    });
  }
}
