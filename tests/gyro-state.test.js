const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const appPath = path.join(rootDir, 'app.html');

function readApp() {
  return fs.readFileSync(appPath, 'utf8');
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

test('gyro shutdown is centralized in stopGyroIfActive', () => {
  const app = readApp();
  const body = getFunctionBody(app, 'stopGyroIfActive');

  assert.match(body, /if\s*\(\s*!isGyroActive\s*\)\s*return/);
  assert.match(body, /viewer\.stopOrientation\(\)/);
  assert.match(body, /isGyroActive\s*=\s*false/);
  assert.match(body, /updateGyroBtn\(\)/);
});

test('toggleGyro uses the centralized shutdown path when already active', () => {
  const app = readApp();
  const body = getFunctionBody(app, 'toggleGyro');

  assert.match(body, /if\s*\(\s*isGyroActive\s*\)\s*{[\s\S]*stopGyroIfActive\('toggle'\)/);
});

test('manual panorama interaction syncs gyro state off without reacting to the gyro button itself', () => {
  const app = readApp();
  const pointerBody = getFunctionBody(app, 'onPanoramaPointerDown');
  const ignoreBody = getFunctionBody(app, 'shouldIgnoreGyroStopEvent');

  assert.match(pointerBody, /stopGyroIfActive\('manual-pointer'\)/);
  assert.match(ignoreBody, /#gyro-toggle-btn/);
  assert.match(ignoreBody, /closest\(/);
});

test('scene loading and major viewer actions stop gyro state first', () => {
  const app = readApp();
  const loadSceneBody = getFunctionBody(app, 'loadScene');
  const goHomeBody = getFunctionBody(app, 'goHome');
  const toggleQualityBody = getFunctionBody(app, 'toggleQuality');
  const markerClickBody = getFunctionBody(app, 'onMarkerClick');

  assert.match(loadSceneBody.slice(0, 240), /stopGyroIfActive\('load-scene'\)/);
  assert.match(goHomeBody, /stopGyroIfActive\('home'\)/);
  assert.match(toggleQualityBody, /stopGyroIfActive\('quality'\)/);
  assert.match(markerClickBody, /stopGyroIfActive\('jump'\)/);
});

test('gyro button state updates class, title, and aria-pressed', () => {
  const app = readApp();
  const body = getFunctionBody(app, 'updateGyroBtn');

  assert.match(body, /classList\.toggle\('gyro-active',\s*isGyroActive\)/);
  assert.match(body, /btn\.title\s*=\s*isGyroActive\s*\?\s*'ジャイロOFF'\s*:\s*'ジャイロON'/);
  assert.match(body, /setAttribute\('aria-pressed',\s*isGyroActive\s*\?\s*'true'\s*:\s*'false'\)/);
});
