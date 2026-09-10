const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.html'), 'utf8');
function load(names, context) {
  vm.createContext(context);
  for (const name of names) {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, name + ' exists');
    vm.runInContext(match[0], context);
  }
  return context;
}

test('sidebar clamps widths and reserves usable space when viewport shrinks', () => {
  const c = load(['normalizeSceneSidebarWidth'], {});
  assert.equal(c.normalizeSceneSidebarWidth(350, 1200), 350);
  assert.equal(c.normalizeSceneSidebarWidth(900, 1200), 480);
  assert.equal(c.normalizeSceneSidebarWidth(-1, 1200), 200);
  assert.equal(c.normalizeSceneSidebarWidth(NaN, 1200), 280);
  assert.equal(c.normalizeSceneSidebarWidth(480, 700), 350);
});

test('auto delivery immediately uses a warm or in-flight image but never overrides explicit direct mode', () => {
  const c = load(['getSceneDeliveryMode'], { deliveryMode: 'auto', imageQualityMode: 'fast', base64ImageCache: new Map(), base64ImageRequests: new Map(), Date });
  assert.equal(c.getSceneDeliveryMode('a'), 'auto');
  c.base64ImageCache.set('a:fast', { expiresAt: Date.now() + 10000 });
  assert.equal(c.getSceneDeliveryMode('a'), 'base64');
  c.deliveryMode = 'direct';
  assert.equal(c.getSceneDeliveryMode('a'), 'direct');
  c.deliveryMode = 'auto';
  c.imageQualityMode = 'high';
  assert.equal(c.getSceneDeliveryMode('a'), 'auto');
  c.base64ImageRequests.set('b:high', []);
  assert.equal(c.getSceneDeliveryMode('b'), 'base64');
  c.base64ImageCache.set('c:high', { expiresAt: Date.now() - 1 });
  assert.equal(c.getSceneDeliveryMode('c'), 'auto');
});

test('intent prefetch runs one image at a time and skips active scenes, high quality and data saver', () => {
  let timer, complete;
  const requested = [];
  const c = load(['scheduleSceneImagePrefetch'], {
    scenePrefetchTimer: null, scenePrefetchActive: false, scenePrefetchGeneration: 0,
    deliveryMode: 'auto', imageQualityMode: 'fast', currentFileId: 'current', isSwitching: false,
    navigator: { connection: {} }, isPublicViewingMode: () => true, isEditMode: false,
    loadHotspotsCached: (id, success) => { requested.push('hotspots:' + id); success({ hotspots: [] }); },
    clearTimeout() {}, setTimeout: fn => { timer = fn; return 1; },
    loadBase64ImageForScene: (id, success) => { requested.push(id); complete = success; }
  });
  c.scheduleSceneImagePrefetch('next'); timer();
  c.scheduleSceneImagePrefetch('another'); timer();
  assert.deepEqual(requested, ['hotspots:next', 'next']);
  complete('image');
  c.scheduleSceneImagePrefetch('current'); timer();
  c.navigator.connection.saveData = true;
  c.scheduleSceneImagePrefetch('another'); timer();
  assert.deepEqual(requested, ['hotspots:next', 'next']);
});

test('thumbnail queue caps simultaneous requests, displays arrivals, and ignores stale folder callbacks', () => {
  const requests = [], shown = [];
  const nodes = [1,2,3,4].map(id => ({ dataset: { fileId: String(id) }, isConnected: true, classList: { add() {}, remove() {} }, set src(v) { shown.push([id,v]); } }));
  const c = load(['startSceneThumbnailQueue'], {
    sceneThumbnailGeneration: 0, sceneThumbnailTimer: null, sceneThumbnailCache: new Map(), sceneThumbnailActive: 0, sceneThumbnailResume: null,
    isSwitching: false, sceneDisplayReady: true, canEdit: false, scenePrefetchActive: false,
    document: { querySelectorAll: () => nodes },
    setTimeout: fn => { fn(); return 1; }, clearTimeout() {},
    google: { script: { run: { withSuccessHandler(success) { return { withFailureHandler(failure) { return { getSceneThumbnail(id) { requests.push({id, success, failure}); } }; } }; } } } }
  });
  c.startSceneThumbnailQueue();
  assert.equal(requests.length, 2);
  requests[1].success({ success: true, imageUrl: 'data:image/jpeg;base64,Yg==' });
  assert.equal(shown[0][0], 2);
  assert.equal(requests.length, 3);
  requests[0].failure();
  assert.equal(requests.length, 4);
  c.sceneThumbnailGeneration++;
  requests[2].success({ success: true, imageUrl: 'data:image/jpeg;base64,Yw==' });
  assert.equal(shown.length, 1);
  c.document.querySelectorAll = () => [nodes[0], nodes[2]];
  c.startSceneThumbnailQueue();
  assert.equal(requests.length, 5, 'one old request plus one new request stay within the global limit');
  requests[3].failure();
  assert.equal(requests.length, 6, 'completion of old work resumes the current folder');
});
