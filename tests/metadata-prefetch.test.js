const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.html'), 'utf8');

function harness() {
  const requests = [], timers = new Map();
  let now = 1000, timerId = 0;
  const c = {
    hotspotCacheByFileId: {}, hotspotCacheExpiresByFileId: {}, hotspotRequestsByFileId: {},
    HOTSPOT_CACHE_TTL_MS: 300000, HOTSPOT_CACHE_MAX_ENTRIES: 50,
    sceneMetadataPrefetchEnabled: true, sceneMetadataPrefetchGeneration: 0,
    sceneMetadataPrefetchTimer: null, sceneMetadataPrefetchActive: 0, sceneMetadataPrefetchResume: null,
    scenePerformanceEnabled: false, sceneDisplayReady: true, isSwitching: false, isEditMode: false,
    currentFileId: 'home', navigator: { connection: {} }, document: { hidden: false },
    readOnly: true, isPublicViewingMode: () => c.readOnly,
    Date: { now: () => now }, console,
    setTimeout(fn, ms) { timers.set(++timerId, { fn, at: now + ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    google: { script: { run: { withSuccessHandler(success) { return { withFailureHandler(failure) {
      return { loadHotspots(request) { requests.push({ request, success, failure }); } };
    } }; } } } }
  };
  vm.createContext(c);
  for (const name of ['getHotspotCacheKey', 'cloneHotspotResult', 'normalizeHotspotResult', 'clearHotspotCache', 'loadHotspotsCached', 'startSceneMetadataPrefetchQueue']) {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    if (!match && name === 'startSceneMetadataPrefetchQueue') continue;
    assert.ok(match, `${name} exists`);
    vm.runInContext(match[0], c);
  }
  return { c, requests, advance(ms) { now += ms; }, tick() {
    const entry = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    assert.ok(entry, 'scheduled work exists'); timers.delete(entry[0]); now = Math.max(now, entry[1].at); entry[1].fn();
  } };
}
const response = () => ({ hotspots: [{ id: 'marker', yaw: 42 }], northOffset: 73 });

test('selection joins pending metadata, preserves view data and isolates mutable consumers', () => {
  const { c, requests, tick } = harness();
  const results = [];
  c.loadHotspotsCached('a', (r, origin) => { r.hotspots[0].yaw = 99; results.push(origin); });
  c.loadHotspotsCached('a', (r, origin) => results.push([r.hotspots[0].yaw, r.northOffset, origin]));
  assert.equal(requests.length, 1);
  requests[0].success(response());
  assert.deepEqual(results, ['network', [42, 73, 'pending']]);
  c.loadHotspotsCached('a', (r, origin) => results.push([r.hotspots[0].yaw, origin])); tick();
  assert.deepEqual(results[2], [42, 'cache']);
  assert.equal(requests.length, 1);
});

test('expired metadata is fetched again and editing bypasses pending and cached viewing reads', () => {
  const { c, requests, advance } = harness();
  c.loadHotspotsCached('a', () => {}); requests[0].success(response());
  advance(300001);
  c.loadHotspotsCached('a', () => {});
  c.isEditMode = true;
  c.loadHotspotsCached('a', () => {});
  assert.equal(requests.length, 3);
});

test('invalidated or failed prefetch cannot poison a later metadata read', () => {
  const { c, requests, tick } = harness();
  let staleDelivered = false;
  c.loadHotspotsCached('a', () => { staleDelivered = true; }, null, 'a', () => false);
  c.clearHotspotCache('a');
  c.loadHotspotsCached('a', () => {});
  requests[0].success({ hotspots: [], northOffset: -99 });
  requests[1].failure();
  c.loadHotspotsCached('a', () => {});
  assert.equal(requests.length, 3);
  requests[2].success(response());
  let north;
  c.loadHotspotsCached('a', r => { north = r.northOffset; }); tick();
  assert.equal(north, 73); assert.equal(staleDelivered, false);
});

test('metadata memory is bounded and clearing all data rejects late cache writes', () => {
  const { c, requests } = harness();
  for (let i = 0; i < 55; i++) { c.loadHotspotsCached('a' + i, () => {}); requests[i].success(response()); }
  assert.equal(Object.keys(c.hotspotCacheByFileId).length, 50);
  c.loadHotspotsCached('late', () => {}); c.clearHotspotCache(); requests[55].success(response());
  assert.equal(Object.keys(c.hotspotCacheByFileId).length, 0);
});

test('background metadata is sequential, skips current and folders, and pauses during foreground work', () => {
  const { c, requests, tick } = harness();
  c.startSceneMetadataPrefetchQueue([{ id: 'home', type: '360' }, { id: 'folder', type: 'folder' }, { id: 'a', type: '360' }, { id: 'b', type: '2D' }]);
  tick(); assert.equal(requests.length, 1); assert.equal(requests[0].request, 'a');
  c.isSwitching = true; requests[0].success(response()); tick();
  assert.equal(requests.length, 1);
  c.isSwitching = false; tick();
  assert.equal(requests.length, 2); assert.equal(requests[1].request, 'b');
});

test('disabled, editing, data saver and 2G do not start automatic metadata reads', () => {
  for (const configure of [c => { c.sceneMetadataPrefetchEnabled = false; }, c => { c.isEditMode = true; },
    c => { c.navigator.connection.saveData = true; }, c => { c.navigator.connection.effectiveType = '2g'; }]) {
    const { c, requests, tick } = harness(); configure(c);
    c.startSceneMetadataPrefetchQueue([{ id: 'a', type: '360' }]);
    // The queue may decline immediately or at its scheduled start.
    try { tick(); } catch (error) { if (!/scheduled work exists/.test(error.message)) throw error; }
    assert.equal(requests.length, 0);
  }
});

test('folder replacement never exceeds one background read or continues the old list', () => {
  const { c, requests, tick } = harness();
  c.startSceneMetadataPrefetchQueue([{ id: 'a' }, { id: 'old' }]); tick();
  c.startSceneMetadataPrefetchQueue([{ id: 'new' }]); tick();
  assert.equal(requests.length, 1);
  requests[0].success(response()); tick();
  assert.equal(requests.length, 2); assert.equal(requests[1].request, 'new');
});

test('a lost metadata response times out, permits retry and ignores late duplicate responses', () => {
  const { c, requests, tick } = harness();
  let failures = 0;
  c.loadHotspotsCached('a', () => assert.fail('timed out request must not succeed'), () => failures++);
  tick(); assert.equal(failures, 1);
  c.loadHotspotsCached('a', () => {});
  requests[0].success(response()); requests[0].failure();
  assert.equal(failures, 1); assert.equal(Object.keys(c.hotspotCacheByFileId).length, 0);
  requests[1].success(response());
  assert.equal(c.hotspotCacheByFileId.a.northOffset, 73);
});
