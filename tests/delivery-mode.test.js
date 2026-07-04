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

  assert.deepEqual(Array.from(context.result), ['direct', 'auto', 'base64', 'direct', 'direct', 'direct']);
});

test('client reads delivery URL parameter and defaults to direct', () => {
  const app = readApp();

  assert.match(app, /var deliveryMode\s*=\s*'direct'\s*;/);
  assert.match(app, /loc\.parameter\s*&&\s*loc\.parameter\.delivery/);
  assert.match(app, /deliveryMode\s*=\s*normalizeDeliveryMode\(dParam\)/);
});

test('public mode no longer uses Base64 as the standard route', () => {
  const app = readApp();
  const loadSceneBody = getFunctionBody(app, 'loadScene');

  assert.doesNotMatch(loadSceneBody, /appMode\s*===\s*'public'[\s\S]{0,900}?getImageDataUri/);
  assert.match(loadSceneBody, /var directImageUrl\s*=\s*getDirectImageUrl\(imgData\)/);
  assert.match(loadSceneBody, /loadHotspotsForImage\(directImageUrl/);
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
  const loadHotspotsCachedBody = getFunctionBody(app, 'loadHotspotsCached');

  assert.match(onConfigLoadedBody, /loadSingleImageScene\(config\)/);
  assert.match(loadSingleImageBody, /deliveryMode === 'base64'/);
  assert.match(loadSingleImageBody, /deliveryMode === 'auto'/);
  assert.match(loadSingleImageBody, /loadHotspotsCached\('',/);
  assert.match(loadHotspotsCachedBody, /\.loadHotspots\(fileId \|\| ''\)/);
});

test('single-image Base64 is used only for forced mode or auto fallback', () => {
  const app = readApp();
  const loadSingleImageBody = getFunctionBody(app, 'loadSingleImageScene');

  assert.match(loadSingleImageBody, /var directImageUrl\s*=\s*config\.imageUrl/);
  assert.match(loadSingleImageBody, /deliveryMode === 'base64'[\s\S]*?loadBase64ImageForScene\(config\.fileId/);
  assert.match(loadSingleImageBody, /deliveryMode === 'auto'[\s\S]*?loadSingleImageWithHotspots\(directImageUrl/);
  assert.match(loadSingleImageBody, /function startSingleImageBase64Fallback[\s\S]*?fallbackToBase64\(config\.fileId/);
  assert.match(loadSingleImageBody, /deliveryMode === 'auto'[\s\S]*?startSingleImageBase64Fallback\(/);
  assert.doesNotMatch(loadSingleImageBody, /deliveryMode === 'direct'[\s\S]*?fallbackToBase64\(/);
});

test('delivery=base64 uses Base64 before starting the viewer', () => {
  const app = readApp();
  const loadSceneBody = getFunctionBody(app, 'loadScene');
  const loadBase64Body = getFunctionBody(app, 'loadBase64ImageForScene');
  const fallbackBody = getFunctionBody(app, 'fallbackToBase64');

  assert.match(loadSceneBody, /if \(deliveryMode === 'base64'\)/);
  assert.match(loadSceneBody, /loadBase64ImageForScene\(/);
  assert.match(loadBase64Body, /fallbackToBase64\(fileId/);
  assert.match(fallbackBody, /\.getImageDataUri\(fileId, 'public'\)/);
});

test('delivery=auto starts with direct URL and uses Base64 only from fallback', () => {
  const app = readApp();
  const loadSceneBody = getFunctionBody(app, 'loadScene');
  const fallbackBody = getFunctionBody(app, 'fallbackToBase64');

  assert.match(loadSceneBody, /deliveryMode === 'auto'/);
  assert.match(loadSceneBody, /loadHotspotsForImage\(directImageUrl/);
  assert.match(loadSceneBody, /fallbackToBase64\(/);
  assert.match(fallbackBody, /\.getImageDataUri\(fileId, 'public'\)/);
});

test('loadHotspots does not write northOffset back to the spreadsheet cache', () => {
  const code = readCode();
  const loadHotspotsBody = getFunctionBody(code, 'loadHotspots');

  assert.doesNotMatch(loadHotspotsBody, /setCachedNorthOffset_\(/);
  assert.doesNotMatch(loadHotspotsBody, /migrateSheetIfNeeded_\(/);
});

test('getImageDataUri remains available for Base64 fallback', () => {
  const code = readCode();

  assert.match(code, /function getImageDataUri\(fileId, mode\)/);
});
