const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const appPath = path.join(rootDir, 'app.html');
const indexPath = path.join(rootDir, 'index.html');
const stylesPath = path.join(rootDir, 'styles.html');

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
    'buildPublicShareUrl'
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(functionNames.map((name) => getFunctionSource(app, name)).join('\n'), context);
  return context;
}

test('share modal offers QR format and QR display area', () => {
  const index = readIndex();
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.match(index, /name="share-format"[^>]+value="qr"/);
  assert.match(index, /id="share-qr-panel"/);
  assert.match(index, /id="share-qr-code"/);
  assert.doesNotMatch(index, /id="share-qr-url"/);
  assert.match(index, /id="share-qr-note"/);
  assert.match(styles, /\.share-qr-panel/);
  assert.match(styles, /\.share-qr-code/);
});

test('QR output is rendered from the public share URL builder', () => {
  const app = readApp();
  const updateBody = getFunctionBody(app, 'updateShareOutput');

  assert.match(updateBody, /buildPublicShareUrl\(options\)/);
  assert.match(updateBody, /options\.format\s*===\s*'qr'/);
  assert.match(updateBody, /updateShareQrPanel\(url,\s*options\.format\)/);
  assert.match(app, /function renderShareQrCode\(/);
  assert.match(app, /function createQrMatrix\(/);
});

test('QR target URL is public and never contains editKey', () => {
  const helpers = loadShareHelpers();
  const url = helpers.buildPublicShareUrl({
    baseUrl: 'https://script.google.com/macros/s/xxxxx/exec?mode=edit&editKey=SECRET',
    delivery: 'direct',
    quality: 'fast'
  });

  assert.match(url, /mode=public/);
  assert.doesNotMatch(url, /editKey|SECRET/);
  assert.doesNotMatch(url, /quality=/);
});

test('QR target URL reflects delivery and omits share-time quality', () => {
  const helpers = loadShareHelpers();

  assert.equal(helpers.buildPublicShareUrl({ baseUrl: 'https://example.test/exec', delivery: 'direct', quality: 'fast' }), 'https://example.test/exec?mode=public&delivery=direct');
  assert.equal(helpers.buildPublicShareUrl({ baseUrl: 'https://example.test/exec', delivery: 'auto', quality: 'high' }), 'https://example.test/exec?mode=public&delivery=auto');
  assert.equal(helpers.buildPublicShareUrl({ baseUrl: 'https://example.test/exec', delivery: 'base64', quality: 'fast' }), 'https://example.test/exec?mode=public&delivery=base64');
});

test('QR target URL can include scene, yaw, and pitch', () => {
  const helpers = loadShareHelpers();
  const url = helpers.buildPublicShareUrl({
    baseUrl: 'https://example.test/exec',
    delivery: 'auto',
    quality: 'high',
    sceneId: 'FILE_123',
    yaw: 45.678,
    pitch: -12.346
  });

  assert.match(url, /scene=FILE_123/);
  assert.match(url, /yaw=45\.68/);
  assert.match(url, /pitch=-12\.35/);
});

test('QR code generation does not use external QR image APIs', () => {
  const combined = [
    readApp(),
    readIndex(),
    fs.readFileSync(stylesPath, 'utf8')
  ].join('\n');

  assert.doesNotMatch(combined, /api\.qrserver\.com/i);
  assert.doesNotMatch(combined, /chart\.googleapis\.com/i);
  assert.doesNotMatch(combined, /qr[^'"]*https?:\/\//i);
});
