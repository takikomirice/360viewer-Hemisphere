const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const codePath = path.join(rootDir, 'Code.js');
const appPath = path.join(rootDir, 'app.html');

function readApp() {
  return fs.readFileSync(appPath, 'utf8');
}

function readCode() {
  return fs.readFileSync(codePath, 'utf8');
}

function getFunctionBody(source, functionName) {
  const fnStart = source.indexOf(`function ${functionName}(`);
  assert.notEqual(fnStart, -1, `${functionName} should exist`);
  const bodyStart = source.indexOf('{', fnStart);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(bodyStart + 1, i);
  }
  throw new Error(`Could not parse ${functionName}`);
}

test('delivery mode normalization allows only direct, auto, and base64', () => {
  const app = readApp();
  const fnSource = app.match(/function normalizeDeliveryMode\(value\) \{[\s\S]*?\n\}/);
  assert.ok(fnSource, 'normalizeDeliveryMode should exist');

  const context = {};
  vm.createContext(context);
  vm.runInContext(`${fnSource[0]}; result = [
    normalizeDeliveryMode('direct'),
    normalizeDeliveryMode('auto'),
    normalizeDeliveryMode('base64'),
    normalizeDeliveryMode(''),
    normalizeDeliveryMode('PUBLIC'),
    normalizeDeliveryMode('invalid')
  ];`, context);

  assert.deepEqual(Array.from(context.result), ['direct', 'auto', 'base64', 'auto', 'auto', 'auto']);
});

test('client reads delivery URL parameter and defaults to auto', () => {
  const app = readApp();

  assert.match(app, /var deliveryMode\s*=\s*'auto'\s*;/);
  assert.match(app, /loc\.parameter\s*&&\s*loc\.parameter\.delivery/);
  assert.match(app, /deliveryMode\s*=\s*normalizeDeliveryMode\(dParam\)/);
});

test('public mode no longer uses Base64 as the standard route', () => {
  const app = readApp();
  const loadSceneBody = getFunctionBody(app, 'loadScene');

  assert.doesNotMatch(loadSceneBody, /appMode\s*===\s*'public'[\s\S]{0,900}?getImageDataUri/);
  assert.match(loadSceneBody, /var directImageUrl\s*=\s*getDirectImageUrl\(imgData\)/);
  assert.match(loadSceneBody, /hotspotPreparation\s*=\s*startHotspotPreparation\(imgData\.id,\s*imgData\.id/);
  assert.match(loadSceneBody, /directImagePreparation\s*=\s*preloadSceneImage\(/);
  assert.match(loadSceneBody, /Promise\.all\(\[hotspotPreparation,\s*directImagePreparation\]\)/);
});

test('single-image getConfig does not return Base64 just because mode is public', () => {
  const code = readCode();
  const getConfigBody = getFunctionBody(code, 'getConfig');

  assert.doesNotMatch(getConfigBody, /mode\s*===\s*'public'[\s\S]*?fileToDataUri_\(/);
  assert.doesNotMatch(getConfigBody, /return\s*\{\s*imageUrl:\s*fileToDataUri_\(/);
});

test('single-image getConfig returns the image file id and name for delivery fallback', () => {
  const code = readCode();
  const getConfigBody = getFunctionBody(code, 'getConfig');

  assert.match(getConfigBody, /fileId:\s*fileId/);
  assert.match(getConfigBody, /imageName:\s*file\.getName\(\)/);
});

test('single-image mode routes through delivery-aware loading', () => {
  const app = readApp();
  const onConfigLoadedBody = getFunctionBody(app, 'onConfigLoaded');
  const loadSingleImageBody = getFunctionBody(app, 'loadSingleImageScene');
  const startHotspotBody = getFunctionBody(app, 'startHotspotPreparation');
  const loadHotspotsCachedBody = getFunctionBody(app, 'loadHotspotsCached');

  assert.match(onConfigLoadedBody, /loadSingleImageScene\(config\)/);
  assert.match(loadSingleImageBody, /deliveryMode === 'base64'/);
  assert.match(loadSingleImageBody, /deliveryMode === 'auto'/);
  assert.match(loadSingleImageBody, /startHotspotPreparation\('',\s*config\.fileId\s*\|\|\s*''/);
  assert.match(startHotspotBody, /loadHotspotsCached\(fileId,/);
  assert.match(loadHotspotsCachedBody, /\.loadHotspots\(request\)/);
});

test('single-image Base64 is used only for forced mode or auto fallback', () => {
  const app = readApp();
  const loadSingleImageBody = getFunctionBody(app, 'loadSingleImageScene');

  assert.match(loadSingleImageBody, /var directImageUrl\s*=\s*config\.imageUrl/);
  assert.match(loadSingleImageBody, /deliveryMode === 'base64'[\s\S]*?startBase64ImagePreparation\(config\.fileId/);
  assert.match(loadSingleImageBody, /deliveryMode !== 'base64'[\s\S]*?preloadSceneImage\([\s\S]*?directImageUrl/);
  assert.match(loadSingleImageBody, /function beginSingleImageBase64Fallback[\s\S]*?startBase64ImagePreparation\(config\.fileId/);
  assert.match(loadSingleImageBody, /deliveryMode === 'auto'[\s\S]*?createAutoFallbackController\([\s\S]*?beginSingleImageBase64Fallback/);
  assert.equal((loadSingleImageBody.match(/startBase64ImagePreparation\(config\.fileId/g) || []).length, 2);
});

test('single-image auto fallback keeps internal trigger reasons out of user-facing errors', () => {
  const app = readApp();
  const loadSingleImageBody = getFunctionBody(app, 'loadSingleImageScene');

  assert.match(loadSingleImageBody, /function beginSingleImageBase64Fallback\(\)/);
  assert.match(loadSingleImageBody, /Base64 fallback用のファイルIDも見つかりませんでした/);
});

test('delivery=base64 uses Base64 before starting the viewer', () => {
  const app = readApp();
  const loadSceneBody = getFunctionBody(app, 'loadScene');
  const fallbackBody = getFunctionBody(app, 'fallbackToBase64');

  assert.match(loadSceneBody, /if \(deliveryMode === 'base64'\)/);
  assert.match(loadSceneBody, /base64Preparation\s*=\s*startBase64ImagePreparation\(imgData\.id/);
  assert.match(loadSceneBody, /Promise\.all\(\[hotspotPreparation,\s*base64Preparation\]\)/);
  assert.match(loadSceneBody, /displayPreparedImage\(prepared\[1\]\.imageUrl,\s*prepared\[0\],\s*'base64'/);
  assert.match(fallbackBody, /\.getImageDataUri\(fileId, 'public'\)/);
});

test('delivery=auto starts with direct URL and uses Base64 only from fallback', () => {
  const app = readApp();
  const loadSceneBody = getFunctionBody(app, 'loadScene');
  const fallbackBody = getFunctionBody(app, 'fallbackToBase64');

  assert.match(loadSceneBody, /deliveryMode === 'auto'/);
  assert.match(loadSceneBody, /directImagePreparation\s*=\s*preloadSceneImage\(/);
  assert.match(loadSceneBody, /Promise\.all\(\[hotspotPreparation,\s*directImagePreparation\]\)/);
  assert.match(loadSceneBody, /Promise\.all\(\[hotspotPreparation,\s*directImagePreparation\]\)[\s\S]{0,500}?prepared\[1\]\.status/);
  assert.match(loadSceneBody, /function beginBase64Fallback[\s\S]*?startBase64ImagePreparation\(imgData\.id/);
  assert.match(loadSceneBody, /displayPreparedImage\(directImageUrl,\s*prepared\[0\],\s*'direct',[\s\S]{0,240}?autoFallbackController\.startFallback\('direct-display-failed'\)/);
  assert.match(fallbackBody, /\.getImageDataUri\(fileId, 'public'\)/);
});

test('loadHotspots routes northOffset through authorization and existing-scene cache helpers', () => {
  const code = readCode();
  const loadHotspotsBody = getFunctionBody(code, 'loadHotspots');
  const extractBody = getFunctionBody(code, 'getOrExtractNorthOffset_');
  const updateExistingBody = getFunctionBody(code, 'updateExistingSceneNorthOffset_');

  assert.match(loadHotspotsBody, /getOrExtractNorthOffset_\(/);
  assert.doesNotMatch(loadHotspotsBody, /migrateSheetIfNeeded_\(/);
  assert.match(extractBody, /getNorthOffsetAccessContext_\(/);
  assert.match(extractBody, /updateExistingSceneNorthOffset_\(/);
  assert.doesNotMatch(extractBody, /setCachedNorthOffset_\(/);
  assert.match(updateExistingBody, /snapshot\.byFileId\[targetId\]/);
  assert.match(updateExistingBody, /upsertScenes_\(/);
  assert.doesNotMatch(updateExistingBody, /getOrCreateScenesSheet_/);
});

test('single-image hotspot loading sends the configured file ID without changing the legacy hotspot key', () => {
  const app = readApp();
  const singleBody = getFunctionBody(app, 'loadSingleImageScene');
  const startHotspotBody = getFunctionBody(app, 'startHotspotPreparation');
  const cachedBody = getFunctionBody(app, 'loadHotspotsCached');

  assert.match(singleBody, /startHotspotPreparation\(\s*''\s*,\s*config\.fileId\s*\|\|\s*''/);
  assert.match(startHotspotBody, /loadHotspotsCached\(fileId,[\s\S]*?northFileId/);
  assert.match(cachedBody, /hotspotFileId/);
  assert.match(cachedBody, /fileId:\s*northFileId/);
});

test('getImageDataUri remains available for Base64 fallback', () => {
  const code = readCode();

  assert.match(code, /function getImageDataUri\(fileId, mode\)/);
});
