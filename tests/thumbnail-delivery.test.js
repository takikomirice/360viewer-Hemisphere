const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.html'), 'utf8');

function harness() {
  const images = [], requests = [], timers = new Map(), results = [];
  const c = { sceneThumbnailDirectEnabled: true, canEdit: false,
    setTimeout(fn) { timers.set(1, fn); return 1; }, clearTimeout(id) { timers.delete(id); },
    withEditToken: request => ({ ...request, __editToken: 'valid' }),
    Image: function () { images.push(this); },
    google: { script: { run: { withSuccessHandler(success) { return { withFailureHandler(failure) {
      return { getSceneThumbnail(id) { requests.push({ id, success, failure, method: 'get' }); },
        prepareSceneThumbnail(request) { requests.push({ request, success, failure, method: 'prepare' }); } };
    } }; } } } }
  };
  vm.createContext(c);
  vm.runInContext(source.match(/function requestSceneThumbnail\([^]*?\n\}/)[0], c);
  return { c, images, requests, timers, results, start() { c.requestSceneThumbnail('scene-id', (...args) => results.push(args)); } };
}

test('direct thumbnail returns a small anonymous image and never invokes GAS', () => {
  const h = harness(); h.start();
  assert.equal(h.images[0].crossOrigin, 'anonymous');
  assert.equal(h.images[0].src, 'https://lh3.googleusercontent.com/d/scene-id=w320');
  h.images[0].onload();
  assert.deepEqual(h.results, [['https://lh3.googleusercontent.com/d/scene-id=w320', 'direct']]);
  assert.equal(h.requests.length, 0);
  assert.equal(h.timers.size, 0);
});

for (const failure of ['error', 'timeout']) test(`${failure} falls back once and a late direct completion cannot replace GAS data`, () => {
  const h = harness(); h.start();
  const lateLoad = h.images[0].onload, lateError = h.images[0].onerror;
  if (failure === 'timeout') h.timers.get(1)(); else lateError();
  lateLoad(); lateError();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].id, 'scene-id');
  h.requests[0].success({ success: true, imageUrl: 'data:image/jpeg;base64,Zg==' });
  assert.deepEqual(h.results, [['data:image/jpeg;base64,Zg==', 'gas']]);
});

test('editor preserves authorized derivative preparation without trying public delivery', () => {
  const h = harness(); h.c.canEdit = true; h.start();
  assert.equal(h.images.length, 0);
  assert.equal(h.requests[0].method, 'prepare');
  assert.equal(h.requests[0].request.__editToken, 'valid');
  assert.equal(h.requests[0].request.fileId, 'scene-id');
});

test('explicit GAS delivery bypasses direct reads, and invalid responses remain failures', () => {
  const h = harness(); h.c.sceneThumbnailDirectEnabled = false; h.start();
  assert.equal(h.images.length, 0);
  h.requests[0].success({ success: true, imageUrl: 'https://other.example/image' });
  assert.deepEqual(h.results, [[null, 'gas']]);
});

test('failed private fallback completes as failure instead of leaving the thumbnail slot occupied', () => {
  const h = harness(); h.start(); h.images[0].onerror(); h.requests[0].failure();
  assert.deepEqual(h.results, [[null, 'gas']]);
});
