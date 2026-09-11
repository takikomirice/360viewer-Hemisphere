const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.html'), 'utf8');

function harness(realAudio = false) {
  const requests = [], timers = new Map();
  let timer = 0, now = 1000;
  const c = {
    photoCache: {}, photoCacheOrder: [], photoInFlight: {},
    hotspotAudioCache: {}, hotspotAudioCacheOrder: [], hotspotAudioInFlight: {}, hotspotAudioRequestGeneration: 0,
    HOTSPOT_AUDIO_CACHE_LIMIT: 2,
    mediaWarmupEnabled: false, hotspotMediaCacheExpires: {}, HOTSPOT_MEDIA_CACHE_TTL_MS: 300000,
    hotspotMediaPrefetchGeneration: 0, hotspotAudioPrefetchTimers: [],
    hotspotPrefetchEnabled: true, hotspotMediaPrefetchTimer: null, hotspotMediaPrefetchActive: 0,
    sceneLoadGeneration: 1, currentFileId: 'home', isEditMode: false, isSwitching: false,
    sceneDisplayReady: true, isPublicViewingMode: () => true,
    document: { hidden: false }, navigator: { connection: {} },
    Date: { now: () => now },
    setTimeout(fn, ms) { timers.set(++timer, { fn, ms }); return timer; }, clearTimeout(id) { timers.delete(id); },
    google: { script: { run: { withSuccessHandler(success) { return { withFailureHandler(failure) {
      return { getHotspotPhotoDataUri(request) { requests.push({ request, success, failure }); },
        getHotspotAudioData(request) { requests.push({ request, success, failure }); } };
    } }; } } } },
    requestHotspotAudio(args, callbacks) { requests.push({ audio: args, success() { callbacks.settled(); } }); }
  };
  vm.createContext(c);
  const names = ['canPrefetchHotspotContent', 'requestHotspotPhoto', 'scheduleHotspotMediaPrefetch'];
  for (const name of ['getCachedHotspotMedia', 'clearHotspotMediaCache', 'prepareHotspotMediaForSceneChange', 'clearHotspotAudioCache']) {
    if (source.includes('function ' + name + '(')) names.push(name);
  }
  if (realAudio) names.push('normalizeHotspotAudioIdentity', 'getHotspotAudioCacheKey', 'putHotspotAudioCache', 'requestHotspotAudio');
  for (const name of names) {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `${name} exists`); vm.runInContext(match[0], c);
  }
  return { c, requests, advance(ms) { now += ms; }, tick() { const entry = [...timers.entries()].sort((a, b) => a[1].ms - b[1].ms)[0]; assert.ok(entry); timers.delete(entry[0]); entry[1].fn(); } };
}
const photo = { fileId: 'home', id: 'photo', photoId: 'p' };
const audio = { fileId: 'home', id: 'audio', audioId: 'a' };

test('photo intent and click share one authorized request; late popup closure still warms cache', () => {
  const { c, requests, tick } = harness(); let result;
  c.requestHotspotPhoto(photo);
  c.requestHotspotPhoto(photo, { success: value => { result = value; } });
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].request)), { fileId: 'home', hotspotId: 'photo', photoId: 'p' });
  requests[0].success({ success: true, dataUri: 'data:image/png;base64,AA==' });
  assert.equal(result, 'data:image/png;base64,AA==');
  c.requestHotspotPhoto(photo, { success: value => { result = value; } }); tick();
  assert.equal(requests.length, 1);
});

test('failed and stale photo responses are not cached, and the cache is bounded', () => {
  const { c, requests } = harness();
  c.requestHotspotPhoto(photo); requests[0].failure();
  c.requestHotspotPhoto(photo); c.sceneLoadGeneration++; requests[1].success({ success: true, dataUri: 'stale' });
  assert.equal(Object.keys(c.photoCache).length, 0);
  for (let i = 0; i < 8; i++) {
    c.requestHotspotPhoto({ ...photo, photoId: String(i) });
    requests.at(-1).success({ success: true, dataUri: 'data' + i });
  }
  assert.equal(Object.keys(c.photoCache).length, 4);
});

test('idle media warms at most two attachments sequentially and stops on scene change', () => {
  const { c, requests, tick } = harness();
  c.scheduleHotspotMediaPrefetch([photo, audio, { ...photo, id: 'third', photoId: 'third' }]);
  tick(); assert.equal(requests.length, 1);
  requests[0].success({ success: true, dataUri: 'data' }); tick();
  assert.equal(requests.length, 2); assert.equal(requests[1].audio.audioId, 'a');
  requests[1].success(); tick(); assert.equal(requests.length, 2);
  c.scheduleHotspotMediaPrefetch([photo]); c.sceneLoadGeneration++; tick();
  assert.equal(requests.length, 2);
});

test('idle work declines editing, data saver, 2G and disabled comparison mode', () => {
  for (const configure of [c => { c.isEditMode = true; }, c => { c.hotspotPrefetchEnabled = false; },
    c => { c.navigator.connection.saveData = true; }, c => { c.navigator.connection.effectiveType = '2g'; }]) {
    const { c, requests, tick } = harness(); configure(c); c.scheduleHotspotMediaPrefetch([photo]);
    try { tick(); } catch (error) { if (error.code !== 'ERR_ASSERTION') throw error; }
    assert.equal(requests.length, 0);
  }
});

test('idle work pauses while hidden, switching or an earlier scene still has a request', () => {
  const { c, requests, tick } = harness();
  c.scheduleHotspotMediaPrefetch([photo]); c.document.hidden = true; tick(); assert.equal(requests.length, 0);
  c.document.hidden = false; c.isSwitching = true; tick(); assert.equal(requests.length, 0);
  c.isSwitching = false; tick(); assert.equal(requests.length, 1);
  c.sceneLoadGeneration++; c.scheduleHotspotMediaPrefetch([audio]); tick(); assert.equal(requests.length, 1);
  requests[0].success({ success: true, dataUri: 'stale' }); tick(); assert.equal(requests.length, 2);
});

test('lost photo responses time out, retry, and cannot settle twice or poison the retry', () => {
  const { c, requests, tick } = harness(); let settled = 0;
  c.requestHotspotPhoto(photo, { settled() { settled++; } }); tick();
  assert.equal(settled, 1);
  c.requestHotspotPhoto(photo); requests[0].success({ success: true, dataUri: 'late' });
  assert.equal(settled, 1); assert.equal(Object.keys(c.photoCache).length, 0);
  requests[1].success({ success: true, dataUri: 'fresh' });
  assert.equal(c.photoCache['home|photo|p'], 'fresh');
});

test('real audio failure and stale completion release the background slot without caching old data', () => {
  for (const outcome of ['failure', 'stale']) {
    const { c, requests, tick } = harness(true);
    c.scheduleHotspotMediaPrefetch([audio]); tick();
    c.sceneLoadGeneration++; c.scheduleHotspotMediaPrefetch([photo]); tick(); assert.equal(requests.length, 1);
    if (outcome === 'failure') requests[0].failure();
    else requests[0].success({ success: true, dataUri: 'stale' });
    tick(); assert.equal(requests.length, 2); assert.equal(Object.keys(c.hotspotAudioCache).length, 0);
  }
});

test('lost audio reads time out and ignore late duplicate completion', () => {
  const { c, requests, tick } = harness(true); let settled = 0;
  c.requestHotspotAudio(audio, { settled() { settled++; } }); tick();
  assert.equal(settled, 1);
  c.requestHotspotAudio(audio); requests[0].success({ success: true, dataUri: 'stale' });
  assert.equal(settled, 1); assert.equal(Object.keys(c.hotspotAudioCache).length, 0);
  requests[1].success({ success: true, dataUri: 'fresh' });
  assert.equal(c.hotspotAudioCache['home|audio|a'].dataUri, 'fresh');
});

test('completed and pending attachments survive scene navigation but expire after five minutes', () => {
  const { c, requests, tick, advance } = harness(true); c.mediaWarmupEnabled = true;
  c.requestHotspotPhoto(photo); c.requestHotspotAudio(audio);
  c.sceneLoadGeneration++; c.currentFileId = 'elsewhere';
  requests[0].success({ success: true, dataUri: 'photo' });
  requests[1].success({ success: true, dataUri: 'audio' });
  c.currentFileId = 'home'; c.sceneLoadGeneration++;
  c.requestHotspotPhoto(photo); c.requestHotspotAudio(audio); tick(); tick();
  assert.equal(requests.length, 2, 'navigation must not cause duplicate media reads');
  advance(300001); c.requestHotspotPhoto(photo); c.requestHotspotAudio(audio);
  assert.equal(requests.length, 4, 'expired attachments are reauthorized');
});

test('revisiting while a photo or audio is pending joins its original request', () => {
  const { c, requests } = harness(true); c.mediaWarmupEnabled = true;
  c.requestHotspotPhoto(photo); c.requestHotspotAudio(audio);
  c.sceneLoadGeneration += 2;
  c.requestHotspotPhoto(photo); c.requestHotspotAudio(audio);
  assert.equal(requests.length, 2);
});

test('media invalidation discards late responses and pending background candidates', () => {
  const { c, requests, tick } = harness(true); c.mediaWarmupEnabled = true;
  c.requestHotspotPhoto(photo); c.requestHotspotAudio(audio);
  assert.equal(typeof c.clearHotspotMediaCache, 'function');
  c.clearHotspotMediaCache('home');
  requests[0].success({ success: true, dataUri: 'old' }); requests[1].success({ success: true, dataUri: 'old' });
  assert.equal(Object.keys(c.photoCache).length + Object.keys(c.hotspotAudioCache).length, 0);
  c.scheduleHotspotMediaPrefetch([photo, audio]); c.clearHotspotMediaCache('home');
  c.requestHotspotPhoto(photo); tick(); // Only the explicit request timeout remains.
  assert.equal(requests.length, 3);
});

test('photo and audio idle reads start together, with two global slots across scenes', () => {
  const { c, requests, tick } = harness(true); c.mediaWarmupEnabled = true;
  c.scheduleHotspotMediaPrefetch([photo, audio, { ...photo, photoId: 'third' }]); tick();
  assert.equal(requests.length, 2, 'audio must not wait for the photo response');
  c.sceneLoadGeneration++; c.currentFileId = 'next';
  c.scheduleHotspotMediaPrefetch([{ ...photo, fileId: 'next' }]); tick();
  assert.equal(requests.length, 2, 'scene changes must not exceed the background limit');
  requests[0].success({ success: true, dataUri: 'photo' }); tick();
  assert.equal(requests.length, 3);
});

test('quiz photo/audio participate in bounded idle preparation', () => {
  const { c, requests, tick } = harness(true); c.mediaWarmupEnabled = true;
  c.scheduleHotspotMediaPrefetch([{ ...photo, audioId: 'a', markerIcon: 'quiz' }]); tick();
  assert.equal(requests.length, 2);
});
