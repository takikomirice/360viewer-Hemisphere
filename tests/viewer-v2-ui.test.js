const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(rootDir, 'app.html'), 'utf8');
const index = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

function getFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let cursor = bodyStart; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, cursor + 1);
  }
  throw new Error(`Could not parse ${functionName}`);
}

test('scene action visibility is synchronized from scene readiness and edit mode', () => {
  const sync = getFunctionSource(app, 'syncSceneActionButtons');
  const syncButton = getFunctionSource(app, 'syncSceneActionButton_');
  const loading = getFunctionSource(app, 'showSceneLoading');
  const empty = getFunctionSource(app, 'showSceneEmptyState');
  const initViewer = getFunctionSource(app, 'initViewer');
  const loadScene = getFunctionSource(app, 'loadScene');
  const toggleMode = getFunctionSource(app, 'toggleMode');

  assert.match(app, /var sceneDisplayReady\s*=\s*false\s*;/);
  assert.match(sync, /var canUseScene\s*=\s*!!sceneDisplayReady/);
  assert.match(sync, /canUseScene\s*&&\s*!isEditMode/);
  assert.match(sync, /fullscreen-btn/);
  assert.match(syncButton, /disabled/);
  assert.match(syncButton, /hidden/);
  assert.match(loading, /setSceneDisplayReady\(false\)/);
  assert.match(empty, /setSceneDisplayReady\(false\)/);
  assert.match(initViewer, /setSceneDisplayReady\(true\)/);
  assert.match(loadScene, /setSceneDisplayReady\(true\)/);
  assert.match(toggleMode, /syncSceneActionButtons\(\)/);
  assert.doesNotMatch(initViewer, /fullscreen-btn[^\n]+classList\.add\('visible'\)/);
  assert.doesNotMatch(loadScene, /fullscreen-btn[^\n]+classList\.add\('visible'\)/);
});

test('fullscreen entry is rejected while editing and delayed fallbacks re-check edit mode', () => {
  const toggle = getFunctionSource(app, 'toggleFullscreen');
  const requestTracker = getFunctionSource(app, 'beginFullscreenRequest_');
  const newTab = getFunctionSource(app, 'openInNewTab_');
  const cssEntry = getFunctionSource(app, 'enterCssFullscreen_');

  const guardIndex = toggle.indexOf('isEditMode');
  const requestIndex = toggle.indexOf('requestFullscreen');
  const gyroIndex = toggle.indexOf('stopGyroIfActive');
  assert.ok(guardIndex >= 0 && guardIndex < requestIndex, 'edit guard must run before requestFullscreen lookup');
  assert.ok(guardIndex < gyroIndex, 'edit guard must reject before fullscreen side effects');
  assert.match(toggle, /fullscreenEntryPromise/);
  assert.match(requestTracker, /fullscreenchange/);
  assert.match(requestTracker, /typeof requestResult\.then/);
  assert.match(newTab, /isEditMode/);
  assert.match(cssEntry, /isEditMode/);
});

test('entering edit mode exits native or CSS fullscreen before applying edit UI', () => {
  const toggleMode = getFunctionSource(app, 'toggleMode');
  const exitBeforeEdit = getFunctionSource(app, 'exitFullscreenBeforeEdit_');

  assert.match(toggleMode, /exitFullscreenBeforeEdit_\(/);
  assert.match(toggleMode, /then\(/);
  assert.match(exitBeforeEdit, /exitCssFullscreen_\(/);
  assert.match(exitBeforeEdit, /exitFullscreen|webkitExitFullscreen|mozCancelFullScreen|msExitFullscreen/);
  assert.match(index, /id="fullscreen-btn"[^>]*type="button"/);
});

test('hotspot photo lightbox exposes an accessible modal with complete controls', () => {
  assert.match(index, /id="photo-lightbox"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(index, /id="photo-lightbox"[^>]*aria-labelledby="photo-lightbox-title"/);
  assert.match(index, /id="photo-lightbox-image"/);
  assert.match(index, /id="photo-lightbox-zoom-in"[^>]*aria-label=/);
  assert.match(index, /id="photo-lightbox-zoom-out"[^>]*aria-label=/);
  assert.match(index, /id="photo-lightbox-reset"[^>]*aria-label=/);
  assert.match(index, /id="photo-lightbox-close"[^>]*aria-label=/);
});

test('popup photo button opens the lightbox with the already fetched Data URI', () => {
  const renderPhoto = getFunctionSource(app, 'renderPhotoInPopup');
  const openLightbox = getFunctionSource(app, 'openPhotoLightbox');

  assert.match(renderPhoto, /info-popup-photo-button/);
  assert.match(renderPhoto, /openPhotoLightbox\(dataUri/);
  assert.match(openLightbox, /image\.src\s*=\s*dataUri/);
  assert.doesNotMatch(openLightbox, /google\.script\.run|getHotspotPhotoDataUri/);
});

test('lightbox closes with reset and focus restoration and supports bounded zoom and pan', () => {
  const closeLightbox = getFunctionSource(app, 'closePhotoLightbox');
  const setScale = getFunctionSource(app, 'setPhotoLightboxScale');
  const clampPan = getFunctionSource(app, 'clampPhotoLightboxPan');
  const initialize = getFunctionSource(app, 'initializePhotoLightbox');
  const globalKey = getFunctionSource(app, 'onGlobalKeyDown');

  assert.match(closeLightbox, /resetPhotoLightboxView\(\)/);
  assert.match(closeLightbox, /returnFocus/);
  assert.match(closeLightbox, /focus\(\)/);
  assert.match(setScale, /PHOTO_LIGHTBOX_MAX_SCALE/);
  assert.match(clampPan, /Math\.max\(0/);
  assert.match(initialize, /wheel/);
  assert.match(initialize, /pointerdown/);
  assert.match(initialize, /pointermove/);
  assert.match(initialize, /touch-action|pinchStart/);
  assert.match(globalKey, /closePhotoLightbox\(\)/);
});

test('direct image preparation sets CORS before src and resolves without failing the scene', () => {
  const preload = getFunctionSource(app, 'preloadSceneImage');
  const show2D = getFunctionSource(app, 'show2DView');
  const crossOriginIndex = preload.indexOf("crossOrigin = 'anonymous'");
  const srcIndex = preload.indexOf('image.src = imageUrl');
  const show2DCrossOriginIndex = show2D.indexOf("crossOrigin = 'anonymous'");
  const show2DSrcIndex = show2D.indexOf('img.src = imageUrl');

  assert.ok(crossOriginIndex >= 0 && crossOriginIndex < srcIndex, 'crossOrigin must be assigned before src');
  assert.ok(show2DCrossOriginIndex >= 0 && show2DCrossOriginIndex < show2DSrcIndex, '2D display must use the same CORS request mode as its preload');
  assert.match(app, /var DIRECT_IMAGE_PRELOAD_TIMEOUT_MS\s*=\s*\d+/);
  assert.match(preload, /finish\('loaded'\)/);
  assert.match(preload, /finish\('failed'\)/);
  assert.match(preload, /finish\('timeout'\)/);
});

test('folder scene loading starts hotspot and direct image work together and reuses one result', () => {
  const loadScene = getFunctionSource(app, 'loadScene');
  const cached = getFunctionSource(app, 'loadHotspotsCached');

  assert.match(loadScene, /var hotspotPreparation\s*=\s*startHotspotPreparation\(/);
  assert.match(loadScene, /directImagePreparation\s*=\s*preloadSceneImage\(/);
  assert.match(loadScene, /Promise\.all\(\[hotspotPreparation,\s*directImagePreparation\]\)/);
  assert.match(loadScene, /hotspotPreparation\.then\(/);
  assert.match(cached, /shouldHandle/);
  assert.doesNotMatch(loadScene, /function loadHotspotsForImage/);
});

test('Pannellum fallback configuration matches 2.5.6 scene switching constraints', () => {
  const createConfig = getFunctionSource(app, 'createPannellumViewerConfig');
  const initViewer = getFunctionSource(app, 'initViewer');

  assert.doesNotMatch(createConfig, /scenes:\s*\{\}/);
  assert.match(initViewer, /firstScene/);
  assert.match(initViewer, /scenes:\s*\{\}/);
  assert.match(initViewer, /initialSceneConfig/);
  assert.match(initViewer, /pendingSceneSwitch/);
  assert.match(initViewer, /getScene\(\)\s*===\s*sceneKey/);
  assert.match(initViewer, /onPanoramaLoaded[\s\S]*?tryPendingSceneSwitch/);
  assert.match(initViewer, /onPanoramaFailed[\s\S]*?tryPendingSceneSwitch/);
});

test('base64 and single-image loading start image and hotspots concurrently', () => {
  const loadScene = getFunctionSource(app, 'loadScene');
  const loadSingle = getFunctionSource(app, 'loadSingleImageScene');

  assert.match(loadScene, /base64Preparation\s*=\s*startBase64ImagePreparation\(/);
  assert.match(loadScene, /Promise\.all\(\[hotspotPreparation,\s*base64Preparation\]\)/);
  assert.match(loadSingle, /startHotspotPreparation\(/);
  assert.match(loadSingle, /preloadSceneImage\(/);
  assert.match(loadSingle, /startBase64ImagePreparation\(/);
  assert.match(loadSingle, /Promise\.all\(/);
});

test('scene performance marks are opt-in, generation-scoped, and omit scene identifiers', () => {
  const createPerformance = getFunctionSource(app, 'createScenePerformanceRecord');
  const finishPerformance = getFunctionSource(app, 'finishScenePerformanceRecord');

  assert.match(app, /loc\.parameter\s*&&\s*loc\.parameter\.perf/);
  assert.match(app, /scenePerformanceEnabled\s*=\s*String\([^\n]+\)\s*===\s*'1'/);
  for (const mark of [
    'sceneStart',
    'imagePreparationStart',
    'hotspotsStart',
    'hotspotsEnd',
    'imagePreloadComplete',
    'imagePreloadFailure',
    'autoFallbackDeadline',
    'autoFallbackStart',
    'directDisplayStart',
    'pannellumCreateStart',
    'pannellumLoad',
    'total'
  ]) {
    assert.match(app, new RegExp(mark));
  }
  assert.match(createPerformance, /generation/);
  assert.match(createPerformance, /superseded/);
  assert.match(app, /activeScenePerformanceRecord/);
  assert.doesNotMatch(finishPerformance, /currentFileId|sceneId|imgData|imageUrl|directImageUrl|googleusercontent/);
});
