const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const codePath = path.join(rootDir, 'Code.js');
const appPath = path.join(rootDir, 'app.html');
const readmePath = path.join(rootDir, 'README.md');

function readCode() {
  return fs.readFileSync(codePath, 'utf8');
}

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

test('server caches folder listings through CacheService with a short TTL', () => {
  const code = readCode();
  const getConfigFromFolderBody = getFunctionBody(code, 'getConfigFromFolder_');
  const listDriveFolderItemsBody = getFunctionBody(code, 'listDriveFolderItems_');
  const getCacheBody = getFunctionBody(code, 'getCachedFolderList_');
  const setCacheBody = getFunctionBody(code, 'setCachedFolderList_');

  assert.match(code, /const FOLDER_LIST_CACHE_TTL_SECONDS\s*=\s*300/);
  assert.match(code, /function getFolderListCacheKey_\(/);
  assert.match(getCacheBody, /CacheService\.getScriptCache\(\)\.get\(/);
  assert.match(getCacheBody, /JSON\.parse/);
  assert.match(setCacheBody, /CacheService\.getScriptCache\(\)\.put\(/);
  assert.match(setCacheBody, /JSON\.stringify/);
  assert.match(getConfigFromFolderBody, /getCachedFolderList_\(folderId\)/);
  assert.match(getConfigFromFolderBody, /setCachedFolderList_\(folderId,\s*result\)/);
  assert.match(getConfigFromFolderBody, /syncDriveFolderToScenes_\(folderId,\s*syncOptions\)/);
  assert.match(listDriveFolderItemsBody, /DriveApp\.getFolderById\(folderId\)/);
});

test('folder sync publishes its joined cache while holding the same lock as scene mutations', () => {
  const code = readCode();
  const body = getFunctionBody(code, 'getConfigFromFolder_');
  const acquireIndex = body.indexOf('acquireLock_(');
  const syncIndex = body.indexOf('syncDriveFolderToScenes_(');
  const cacheIndex = body.indexOf('setCachedFolderList_(');
  const releaseIndex = body.indexOf('releaseLock(');

  assert.ok(acquireIndex >= 0, 'folder sync should acquire the shared mutation lock');
  assert.match(body, /lockAlreadyHeld\s*:\s*true/);
  assert.ok(acquireIndex < syncIndex, 'the lock should be held before Drive/scenes sync');
  assert.ok(syncIndex < cacheIndex, 'the fresh joined result should be cached after sync');
  assert.ok(cacheIndex < releaseIndex, 'the cache must be published before releasing the lock');
});

test('folder listing cache is invalidated after image mutations', () => {
  const code = readCode();
  const settingsBody = getFunctionBody(code, 'updateSceneSettings');
  const deleteBody = getFunctionBody(code, 'deleteImageFile');
  const uploadBody = getFunctionBody(code, 'uploadImageToDrive');

  assert.match(code, /function invalidateFolderListCache_\(/);
  assert.match(settingsBody, /getEditableSceneContext_\(req\.fileId\)/);
  assert.match(settingsBody, /invalidateFolderListCache_\(folderId\)/);
  assert.ok(settingsBody.indexOf('context.file.setName') < settingsBody.indexOf('upsertScenes_'));
  assert.ok(settingsBody.indexOf('upsertScenes_') < settingsBody.indexOf('invalidateFolderListCache_'));
  assert.match(deleteBody, /getEditableSceneContext_\(targetId\)/);
  assert.match(deleteBody, /parentFolderIds\s*=\s*targetContext\.parentFolderIds\.slice\(\)/);
  assert.match(deleteBody, /invalidateFolderListCaches_\(parentFolderIds\)/);
  assert.ok(deleteBody.indexOf('file.setTrashed') < deleteBody.indexOf('deleteInfoRowsForImage_'));
  assert.ok(deleteBody.indexOf('deleteInfoRowsForImage_') < deleteBody.indexOf('deleteSceneRowsForFileId_'));
  assert.ok(deleteBody.indexOf('deleteSceneRowsForFileId_') < deleteBody.indexOf('invalidateFolderListCaches_'));
  assert.match(uploadBody, /invalidateFolderListCaches_\(\[rootFolderId,\s*uploadFolderId\]\)/);
  assert.ok(uploadBody.indexOf('folder.createFile') < uploadBody.indexOf('getConfigFromFolder_'));
});

test('client caches hotspots for read-only viewing and bypasses cache while editing', () => {
  const app = readApp();
  const loadCachedBody = getFunctionBody(app, 'loadHotspotsCached');
  const startHotspotBody = getFunctionBody(app, 'startHotspotPreparation');
  const loadSceneBody = getFunctionBody(app, 'loadScene');

  assert.match(app, /var hotspotCacheByFileId\s*=\s*\{\}/);
  assert.match(app, /function getHotspotCacheKey\(/);
  assert.match(app, /function clearHotspotCache\(/);
  assert.match(loadCachedBody, /isPublicViewingMode\(\)/);
  assert.match(loadCachedBody, /!isEditMode/);
  assert.match(loadCachedBody, /hotspotCacheByFileId\[cacheKey\]/);
  assert.match(loadCachedBody, /\.loadHotspots\(request\)/);
  assert.match(loadSceneBody, /startHotspotPreparation\(imgData\.id,\s*imgData\.id/);
  assert.match(startHotspotBody, /loadHotspotsCached\(fileId,/);
  assert.doesNotMatch(loadSceneBody, /\.loadHotspots\(imgData\.id\)/);
});

test('client clears hotspot cache after hotspot edits and imports', () => {
  const app = readApp();
  const saveBody = getFunctionBody(app, 'onSaveClick');
  const deleteBody = getFunctionBody(app, 'onHotspotDeleteClick');
  const moveBody = getFunctionBody(app, 'commitHotspotMove');
  const importBody = getFunctionBody(app, 'onBulkInputDropdownClick');

  assert.match(saveBody, /clearHotspotCache\(mutationRequest\.fileId/);
  assert.match(deleteBody, /clearHotspotCache\(mutationRequest\.fileId/);
  assert.match(moveBody, /clearHotspotCache\(startSceneId/);
  assert.match(importBody, /clearHotspotCache\(currentFileId \|\| ''\)/);
});

test('delivery auto uses one scene-start fallback deadline without changing fixed modes', () => {
  const app = readApp();
  const loadSceneBody = getFunctionBody(app, 'loadScene');
  const singleBody = getFunctionBody(app, 'loadSingleImageScene');
  const controllerBody = getFunctionBody(app, 'createAutoFallbackController');

  assert.match(app, /var DIRECT_FALLBACK_TIMEOUT_MS\s*=\s*8000/);
  assert.match(controllerBody, /startedAt/);
  assert.match(controllerBody, /deadlineAt/);
  assert.match(controllerBody, /fallbackStarted/);
  assert.match(controllerBody, /DIRECT_FALLBACK_TIMEOUT_MS/);
  assert.match(controllerBody, /autoFallbackDeadline/);
  assert.match(controllerBody, /autoFallbackStart/);
  assert.match(controllerBody, /directDisplayStart/);
  assert.match(loadSceneBody, /sceneDeliveryMode === 'auto'[\s\S]*?createAutoFallbackController\(/);
  assert.match(singleBody, /deliveryMode === 'auto'[\s\S]*?createAutoFallbackController\(/);
  assert.doesNotMatch(loadSceneBody, /function startAutoFallbackTimer\(/);
  assert.doesNotMatch(singleBody, /function startSingleImageAutoFallbackTimer\(/);
  assert.doesNotMatch(loadSceneBody, /deliveryMode === 'direct'[\s\S]{0,900}?fallbackToBase64\(/);
  assert.doesNotMatch(singleBody, /deliveryMode === 'direct'[\s\S]{0,900}?fallbackToBase64\(/);
});

test('scene switching no longer waits on a fixed transition timeout before rendering', () => {
  const app = readApp();
  const loadSceneBody = getFunctionBody(app, 'loadScene');

  assert.doesNotMatch(loadSceneBody, /350\)/);
  assert.doesNotMatch(loadSceneBody, /完全に暗転/);
});

test('README documents Phase 6 performance caching behavior', () => {
  const readme = fs.readFileSync(readmePath, 'utf8');

  assert.match(readme, /フォルダ一覧.*短時間キャッシュ/s);
  assert.match(readme, /編集後.*キャッシュ.*無効化/s);
  assert.match(readme, /ホットスポット取得.*キャッシュ/s);
  assert.match(readme, /delivery=auto.*一定時間/s);
  assert.match(readme, /delivery=direct.*最速/s);
  assert.match(readme, /ページ再読み込み.*シーン一覧更新/s);
});
