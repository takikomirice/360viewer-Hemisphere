const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'Code.js'), 'utf8');
function jpeg(width, height) {
  return [255,216,255,192,0,17,8,height >> 8,height & 255,width >> 8,width & 255,3,1,17,0,2,17,0,3,17,0,255,217];
}
function harness(overrides = {}) {
  const calls = { fetch: 0, original: 0, serviceEncoding: 0 };
  const file = { getId: () => 'allowed', getBlob: () => { calls.original++; return { getContentType: () => 'image/jpeg', getBytes: () => [1,2,3] }; } };
  const context = {
    console: { error() {}, warn() {} },
    getReadableImageContext_: () => ({ file, fileId: 'allowed' }),
    Drive: { Files: { get: () => ({ thumbnailLink: 'https://lh3.googleusercontent.com/drive-storage/image=s220', imageMediaMetadata: { width: 6000, height: 3000 }, size: '8000000' }) } },
    ScriptApp: { getOAuthToken: () => 'test-token' },
    UrlFetchApp: { fetch: (url, options) => { calls.fetch++; calls.url = url; calls.options = options; return { getResponseCode: () => 200, getBlob: () => ({ getContentType: () => 'image/jpeg', getBytes: () => jpeg(4096,2048) }) }; } },
    Utilities: { base64Encode: bytes => { calls.serviceEncoding++; return Buffer.from(bytes).toString('base64'); } },
    ...overrides
  };
  vm.createContext(context);
  for (const name of ['encodeImageBytes_', 'fileToDataUri_', 'readJpegDimensions_', 'getFastImageDataUri_', 'getImageDataUri', 'getImageHeadingBlob_']) {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `${name} is available`);
    vm.runInContext(match[0], context);
  }
  return { context, calls };
}

test('image encoding preserves every byte, signed GAS bytes, padding and large chunk boundaries', () => {
  const { context } = harness();
  for (const size of [0, 1, 2, 3, 255, 256, 257, 24575, 24576, 24577, 1400000]) {
    const bytes = Buffer.alloc(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 71 + 173) & 255;
    const signed = Array.from(bytes, b => b > 127 ? b - 256 : b);
    assert.equal(context.encodeImageBytes_(signed), bytes.toString('base64'), `length ${size}`);
  }
});

test('fast compatible delivery uses a credentialed bounded preview and high retains the original', () => {
  const { context, calls } = harness();
  assert.equal(context.getImageDataUri('allowed', 'public', 'fast').quality, 'fast');
  assert.equal(calls.original, 0);
  assert.equal(calls.serviceEncoding, 0, 'fast preview avoids sending the large byte array through Utilities');
  assert.match(calls.url, /=w4096$/);
  assert.equal(calls.options.followRedirects, false);
  assert.equal(calls.options.headers.Authorization, 'Bearer test-token');
  assert.equal(context.getImageDataUri('allowed', 'public', 'high').quality, 'original');
  assert.equal(calls.original, 1);
  assert.equal(calls.serviceEncoding, 1, 'original quality retains the existing conversion');
  assert.equal(calls.fetch, 1);
});

for (const scenario of ['untrusted-host', 'too-small', 'wrong-aspect', 'redirect', 'error', 'missing-thumbnail']) {
  test(`fast preview falls back to original: ${scenario}`, () => {
    const { context, calls } = harness();
    if (scenario === 'untrusted-host') context.Drive.Files.get = () => ({ thumbnailLink: 'https://attacker.example/image=s220', imageMediaMetadata: { width:6000, height:3000 } });
    if (scenario === 'missing-thumbnail') context.Drive.Files.get = () => ({});
    if (scenario === 'error') context.UrlFetchApp.fetch = () => { throw new Error('offline'); };
    if (['too-small', 'wrong-aspect', 'redirect'].includes(scenario)) context.UrlFetchApp.fetch = () => ({
      getResponseCode: () => scenario === 'redirect' ? 302 : 200,
      getBlob: () => ({ getContentType: () => 'image/jpeg', getBytes: () => scenario === 'too-small' ? jpeg(220,110) : jpeg(4096,4096) })
    });
    assert.equal(context.getImageDataUri('allowed', 'public', 'fast').quality, 'original');
    assert.equal(calls.original, 1);
    if (scenario === 'untrusted-host' || scenario === 'missing-thumbnail') assert.equal(calls.fetch, 0);
  });
}

test('public image authorization runs before preview fetch and errors disclose no token', () => {
  const { context, calls } = harness({ getReadableImageContext_: () => { throw new Error('outside root'); } });
  const result = context.getImageDataUri('outside', 'public', 'fast');
  assert.equal(result.success, false);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.original, 0);
  assert.doesNotMatch(JSON.stringify(result), /test-token|outside root/);
});

test('delivery profiling returns numeric stages without leaking credentials and still authorizes', () => {
  const { context, calls } = harness();
  const definition = source.match(/function getImageDeliveryProfile\([^]*?\n\}/);
  assert.ok(definition, 'profile endpoint exists');
  vm.runInContext(definition[0], context);
  const result = context.getImageDeliveryProfile('allowed');
  assert.equal(result.success, true);
  assert.equal(result.quality, 'fast');
  assert.ok(result.timings.totalMs >= 0);
  assert.ok(result.timings.authorizationMs >= 0);
  assert.ok(result.timings.previewFetchMs >= 0);
  assert.equal(context.getImageDeliveryProfile('allowed', true).imageUrl, result.imageUrl,
    'the measured alternative must return the exact same JPEG bytes');
  assert.doesNotMatch(JSON.stringify(result), /test-token|googleusercontent/);
  context.getReadableImageContext_ = () => { throw Error('private detail'); };
  const count = calls.fetch;
  const denied = context.getImageDeliveryProfile('outside');
  assert.equal(denied.success, false);
  assert.equal(calls.fetch, count);
  assert.doesNotMatch(JSON.stringify(denied), /private detail|test-token/);
});

test('heading extraction downloads only the first 128 KiB and preserves fallback on error', () => {
  const { context } = harness();
  let originals = 0;
  const file = { getId: () => 'authorized-image', getBlob: () => { originals++; return 'original'; } };
  const blob = { getBytes: () => [255,216,255,225] };
  context.UrlFetchApp.fetch = (url, options) => {
    assert.equal(url, 'https://www.googleapis.com/drive/v3/files/authorized-image?alt=media');
    assert.equal(options.headers.Range, 'bytes=0-131071');
    assert.equal(options.followRedirects, false);
    return { getResponseCode: () => 206, getHeaders: () => ({ 'Content-Range': 'bytes 0-3/8000000' }), getBlob: () => blob };
  };
  assert.equal(context.getImageHeadingBlob_(file), blob);
  assert.equal(originals, 0);
  context.UrlFetchApp.fetch = () => { throw new Error('offline'); };
  assert.equal(context.getImageHeadingBlob_(file), 'original');
  assert.equal(originals, 1);
});
