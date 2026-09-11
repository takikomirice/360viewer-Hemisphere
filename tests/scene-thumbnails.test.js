const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'Code.js'), 'utf8');

function harness() {
  const saved = new Map();
  const calls = { fetch: 0, writes: 0, releases: 0 };
  const jpeg = [255,216,255,192,0,17,8,0,160,1,64,3,1,17,0,2,17,0,3,17,0,255,217];
  const blob = { getContentType: () => 'image/jpeg', getBytes: () => jpeg, setName() { return this; } };
  const iterator = values => ({ hasNext: () => values.length > 0, next: () => values.shift() });
  const folder = {
    getFilesByName: name => iterator(saved.has(name) ? [saved.get(name)] : []),
    createFile: b => { calls.writes++; const f = { getBlob: () => b, getSize: () => jpeg.length }; saved.set(calls.name, f); return f; }
  };
  const context = {
    console: { warn() {}, error() {} },
    getReadableImageContext_: id => { if (id !== 'allowed') throw Error('outside root'); return { fileId: id, file: {} }; },
    getSceneThumbnailFolder_: create => folder,
    assertEditToken_: p => { if (p.__editToken !== 'valid') throw Error('invalid token'); },
    acquireLock_: () => ({ releaseLock: () => calls.releases++ }),
    Drive: { Files: { get: () => ({ md5Checksum: 'a'.repeat(32), thumbnailLink: 'https://lh3.googleusercontent.com/image=s220' }) } },
    ScriptApp: { getOAuthToken: () => 'secret' },
    Utilities: { base64Encode: b => Buffer.from(b).toString('base64') },
    UrlFetchApp: { fetch: (url, options) => { calls.fetch++; calls.url = url; calls.options = options; return { getResponseCode: () => 200, getBlob: () => blob }; } }
  };
  blob.setName = name => { calls.name = name; return blob; };
  vm.createContext(context);
  for (const name of ['readJpegDimensions_', 'fileToDataUri_', 'readSceneThumbnail_', 'getSceneThumbnail', 'prepareSceneThumbnail']) {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `${name} is available`);
    vm.runInContext(match[0], context);
  }
  return { context, calls };
}

test('viewer gets a bounded thumbnail without creating files; editor persists and reuses it', () => {
  const { context: c, calls } = harness();
  assert.equal(c.getSceneThumbnail('allowed').success, true);
  assert.equal(calls.writes, 0);
  assert.equal(c.prepareSceneThumbnail({ fileId: 'allowed', __editToken: 'valid' }).success, true);
  assert.equal(calls.writes, 1);
  assert.equal(c.prepareSceneThumbnail({ fileId: 'allowed', __editToken: 'valid' }).success, true);
  assert.equal(calls.writes, 1);
  assert.equal(calls.fetch, 2);
  assert.equal(calls.releases, 1);
  assert.match(calls.url, /=w320$/);
  assert.equal(calls.options.followRedirects, false);
});

test('scope and edit authorization precede image fetch or persistence', () => {
  const { context: c, calls } = harness();
  assert.equal(c.getSceneThumbnail('outside').success, false);
  assert.equal(c.prepareSceneThumbnail({ fileId: 'allowed' }).success, false);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.writes, 0);
});

for (const kind of ['host', 'redirect', 'large', 'mime']) {
  test(`rejects unsafe thumbnail ${kind} before taking a write lock`, () => {
    const { context: c, calls } = harness();
    if (kind === 'host') c.Drive.Files.get = () => ({ md5Checksum: 'a'.repeat(32), thumbnailLink: 'https://evil.example/image=s220' });
    else c.UrlFetchApp.fetch = () => ({ getResponseCode: () => kind === 'redirect' ? 302 : 200,
      getBlob: () => ({ getContentType: () => kind === 'mime' ? 'text/html' : 'image/jpeg', getBytes: () => kind === 'large' ? new Array(200000) : [] }) });
    const result = c.prepareSceneThumbnail({ fileId: 'allowed', __editToken: 'valid' });
    assert.equal(result.success, false);
    assert.equal(calls.writes, 0);
    assert.equal(calls.releases, 0);
    assert.doesNotMatch(JSON.stringify(result), /secret|evil/);
  });
}
