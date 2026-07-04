const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const appPath = path.join(rootDir, 'app.html');
const indexPath = path.join(rootDir, 'index.html');

function readApp() {
  return fs.readFileSync(appPath, 'utf8');
}

function readIndex() {
  return fs.readFileSync(indexPath, 'utf8');
}

function getFunctionSource(source, functionName) {
  const fnStart = source.indexOf(`function ${functionName}(`);
  assert.notEqual(fnStart, -1, `${functionName} should exist`);
  const bodyStart = source.indexOf('{', fnStart);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(fnStart, i + 1);
  }
  throw new Error(`Could not parse ${functionName}`);
}

function getFunctionBody(source, functionName) {
  const fnSource = getFunctionSource(source, functionName);
  const bodyStart = fnSource.indexOf('{');
  return fnSource.slice(bodyStart + 1, -1);
}

function loadShareHelpers() {
  const app = readApp();
  const functionNames = [
    'normalizeDeliveryMode',
    'normalizeShareQualityMode',
    'parseNumberParam',
    'formatShareNumber',
    'buildPublicShareUrl',
    'buildIframeCode'
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(functionNames.map((name) => getFunctionSource(app, name)).join('\n'), context);
  return context;
}

test('buildPublicShareUrl always creates a public URL without editKey or default quality', () => {
  const helpers = loadShareHelpers();
  const url = helpers.buildPublicShareUrl({
    baseUrl: 'https://script.google.com/macros/s/xxxxx/exec?mode=edit&editKey=SECRET',
    delivery: 'direct',
    quality: 'fast'
  });

  assert.equal(url, 'https://script.google.com/macros/s/xxxxx/exec?mode=public&delivery=direct');
  assert.doesNotMatch(url, /editKey|SECRET/);
  assert.doesNotMatch(url, /quality=/);
});

test('buildPublicShareUrl reflects delivery while omitting quality by default', () => {
  const helpers = loadShareHelpers();

  assert.equal(helpers.buildPublicShareUrl({ baseUrl: 'https://example.test/exec', delivery: 'direct', quality: 'fast' }), 'https://example.test/exec?mode=public&delivery=direct');
  assert.equal(helpers.buildPublicShareUrl({ baseUrl: 'https://example.test/exec', delivery: 'auto', quality: 'high' }), 'https://example.test/exec?mode=public&delivery=auto');
  assert.equal(helpers.buildPublicShareUrl({ baseUrl: 'https://example.test/exec', delivery: 'base64', quality: 'invalid' }), 'https://example.test/exec?mode=public&delivery=base64');
});

test('buildPublicShareUrl can include scene, yaw, and pitch when requested', () => {
  const helpers = loadShareHelpers();
  const url = helpers.buildPublicShareUrl({
    baseUrl: 'https://example.test/exec',
    delivery: 'direct',
    quality: 'fast',
    sceneId: 'FILE_123',
    yaw: 120.1234,
    pitch: '-5.349'
  });

  assert.match(url, /scene=FILE_123/);
  assert.match(url, /yaw=120\.12/);
  assert.match(url, /pitch=-5\.35/);
});

test('buildIframeCode uses the public share URL as src and does not leak editKey', () => {
  const helpers = loadShareHelpers();
  const url = helpers.buildPublicShareUrl({
    baseUrl: 'https://example.test/exec?mode=edit&editKey=SECRET',
    delivery: 'auto',
    quality: 'high'
  });
  const iframe = helpers.buildIframeCode(url);

  assert.match(iframe, /^<iframe src="https:\/\/example\.test\/exec\?mode=public&delivery=auto"/);
  assert.match(iframe, /width="100%"/);
  assert.match(iframe, /height="600px"/);
  assert.match(iframe, /allowfullscreen/);
  assert.doesNotMatch(iframe, /editKey|SECRET/);
  assert.doesNotMatch(iframe, /quality=/);
});

test('share modal has compact URL, iframe, and QR formats plus delivery and target controls', () => {
  const index = readIndex();
  const app = readApp();

  assert.match(index, /name="share-format"[^>]+value="url"/);
  assert.match(index, /name="share-format"[^>]+value="iframe"/);
  assert.match(index, /name="share-format"[^>]+value="qr"/);
  assert.match(index, /class="share-format-icon/);
  assert.match(index, /name="share-delivery"[^>]+value="direct"/);
  assert.match(index, /name="share-delivery"[^>]+value="auto"/);
  assert.match(index, /name="share-delivery"[^>]+value="base64"/);
  assert.doesNotMatch(index, /name="share-quality"/);
  assert.doesNotMatch(index, /<div class="share-option-title">画質<\/div>/);
  assert.match(index, /name="share-target"[^>]+value="home"/);
  assert.match(index, /name="share-target"[^>]+value="scene"/);
  assert.match(index, /name="share-target"[^>]+value="view"/);
  assert.match(app, /function updateShareOutput\(/);
});

test('scene URL parameter is read and used for initial folder scene selection', () => {
  const app = readApp();
  const onConfigLoadedBody = getFunctionBody(app, 'onConfigLoaded');

  assert.match(app, /var initialSceneId\s*=\s*''/);
  assert.match(app, /loc\.parameter\s*&&\s*loc\.parameter\.scene/);
  assert.match(app, /function getRootSceneImageById\(/);
  assert.match(onConfigLoadedBody, /getRootSceneImageById\(allImages, initialSceneId\)/);
  assert.match(onConfigLoadedBody, /loadScene\(startImg,\s*initialViewYaw,\s*initialViewPitch\)/);
});

test('yaw and pitch URL parameters are parsed as numbers and invalid values are ignored', () => {
  const helpers = loadShareHelpers();
  const app = readApp();

  assert.equal(helpers.parseNumberParam('120.5'), 120.5);
  assert.equal(helpers.parseNumberParam('-5.25'), -5.25);
  assert.equal(helpers.parseNumberParam('bad'), null);
  assert.equal(helpers.parseNumberParam(''), null);
  assert.match(app, /loc\.parameter\s*&&\s*loc\.parameter\.yaw/);
  assert.match(app, /loc\.parameter\s*&&\s*loc\.parameter\.pitch/);
  assert.match(app, /loc\.parameter\s*&&\s*loc\.parameter\.quality/);
});
