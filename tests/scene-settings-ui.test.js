const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const appPath = path.join(rootDir, 'app.html');
const indexPath = path.join(rootDir, 'index.html');
const stylesPath = path.join(rootDir, 'styles.html');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function getFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${functionName}`);
}

test('scene context menu exposes the four phase 4A operations without independent rename', () => {
  const index = read(indexPath);
  const app = read(appPath);
  const menuStart = index.indexOf('<div id="scene-context-menu">');
  const menuEnd = index.indexOf('</div>', menuStart);
  const menu = index.slice(menuStart, menuEnd);
  const actions = Array.from(menu.matchAll(/data-action="([^"]+)"/g), (match) => match[1]);

  assert.deepEqual(actions, ['settings', 'set-home', 'properties', 'delete']);
  assert.match(menu, /data-action="settings"[^>]*>設定の変更/);
  assert.match(menu, /data-action="set-home"[^>]*>ホームに設定/);
  assert.doesNotMatch(app, /function requestSceneRename\s*\(/);
  assert.doesNotMatch(app, /\.renameImageFile\s*\(/);
});

test('scene settings modal has an editable display name plus accessible type and northOffset controls', () => {
  const index = read(indexPath);

  assert.match(index, /id="scene-settings-backdrop"/);
  assert.match(index, /id="scene-settings-dialog"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(index, /id="scene-settings-title"[^>]*>設定の変更</);
  assert.match(index, /<label[^>]*for="scene-settings-name"[^>]*>名前<\/label>/);
  assert.match(index, /<input[^>]*id="scene-settings-name"[^>]*type="text"[^>]*required/);
  assert.match(index, /id="scene-settings-type-360"[^>]*value="360"/);
  assert.match(index, /id="scene-settings-type-2d"[^>]*value="2D"/);
  assert.match(index, /id="scene-settings-north-auto"[^>]*value="auto"/);
  assert.match(index, /id="scene-settings-north-manual"[^>]*value="manual"/);
  assert.match(index, /id="scene-settings-north-none"[^>]*value="none"/);
  assert.match(index, /<label[^>]*for="scene-settings-north-value"/);
  assert.match(index, /id="scene-settings-north-value"[^>]*type="number"[^>]*min="0"[^>]*max="359\.999999"/);
  assert.match(index, /id="scene-settings-save-btn"/);
  assert.match(index, /id="scene-settings-error"[^>]*role="alert"/);
});

test('scene settings modal is responsive and scroll-safe', () => {
  const styles = read(stylesPath);

  assert.match(styles, /#scene-settings-backdrop[\s\S]*padding:\s*20px/);
  assert.match(styles, /#scene-settings-dialog[\s\S]*max-width:\s*calc\(100vw - 24px\)/);
  assert.match(styles, /#scene-settings-dialog[\s\S]*max-height:\s*calc\(var\(--app-viewport-base\) - 24px\)/);
  assert.match(styles, /#scene-settings-dialog[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.scene-context-menu-btn:disabled/);
});

test('scene settings requests are tokenized and saving is guarded against double submission', () => {
  const app = read(appPath);
  const openMenu = getFunctionSource(app, 'openSceneContextMenu');
  const openSettings = getFunctionSource(app, 'openSceneSettingsModal');
  const saveSettings = getFunctionSource(app, 'saveSceneSettings');

  assert.match(openMenu, /settingsButton\.disabled\s*=\s*!isEditMode/);
  assert.match(openSettings, /if\s*\(\s*!canEdit\s*\|\|\s*!isEditMode/);
  assert.match(openSettings, /\.getSceneSettings\(withEditToken\(\{\s*fileId:/);
  assert.match(saveSettings, /if\s*\(\s*!canEdit\s*\|\|\s*!isEditMode/);
  assert.match(saveSettings, /if\s*\(\s*isSavingSceneSettings\s*\)\s*return/);
  assert.match(saveSettings, /isSavingSceneSettings\s*=\s*true/);
  assert.match(saveSettings, /scene-settings-save-btn/);
  assert.match(saveSettings, /\.updateSceneSettings\(withEditToken\(/);
  assert.match(saveSettings, /name:\s*sceneName/);
  assert.match(saveSettings, /sceneName\s*=\s*String\([^)]*scene-settings-name/);
  assert.match(saveSettings, /[\\u0000-\\u001F\\u007F]/);
  assert.match(saveSettings, /applyNormalizedSceneLocally\(/);
});

test('scene settings renders extensionless names while properties retain the formal Drive name', () => {
  const app = read(appPath);
  const renderSettings = getFunctionSource(app, 'renderSceneSettings');
  const openSettings = getFunctionSource(app, 'openSceneSettingsModal');
  const renderProperties = getFunctionSource(app, 'renderSceneProperties');

  assert.match(renderSettings, /scene-settings-name[^\n]*\.value\s*=\s*getSceneDisplayName\(scene\)/);
  assert.match(openSettings, /scene-settings-name[^\n]*\.value\s*=\s*getSceneDisplayName\(img\)/);
  assert.match(renderProperties, /props\.name/);
  assert.doesNotMatch(renderProperties, /getSceneDisplayName/);
});

test('scene settings ignores stale responses when another scene becomes the modal target', () => {
  const app = read(appPath);
  const openSettings = getFunctionSource(app, 'openSceneSettingsModal');
  const closeSettings = getFunctionSource(app, 'closeSceneSettingsModal');
  const helper = getFunctionSource(app, 'isCurrentSceneSettingsRequest');

  assert.match(openSettings, /requestGeneration\s*=\s*\+\+sceneSettingsRequestGeneration/);
  assert.match(openSettings, /requestedFileId\s*=\s*String\(img\.id/);
  assert.match(openSettings, /if\s*\(\s*!isCurrentSceneSettingsRequest\(requestGeneration,\s*requestedFileId\)\s*\)\s*return/g);
  assert.match(closeSettings, /sceneSettingsRequestGeneration\s*\+=\s*1/);

  const context = {
    sceneSettingsRequestGeneration: 4,
    sceneSettingsTargetId: 'scene-b'
  };
  vm.createContext(context);
  vm.runInContext(helper, context);
  assert.equal(context.isCurrentSceneSettingsRequest(3, 'scene-a'), false);
  assert.equal(context.isCurrentSceneSettingsRequest(4, 'scene-a'), false);
  assert.equal(context.isCurrentSceneSettingsRequest(4, 'scene-b'), true);
});

test('scene loading generations prevent stale 360 or 2D callbacks from replacing a newer reload', () => {
  const app = read(appPath);
  const loadScene = getFunctionSource(app, 'loadScene');
  const initViewer = getFunctionSource(app, 'initViewer');
  const show2DView = getFunctionSource(app, 'show2DView');
  const helper = getFunctionSource(app, 'isCurrentSceneLoadRequest');

  assert.match(loadScene, /loadGeneration\s*=\s*\+\+sceneLoadGeneration/);
  assert.match(loadScene, /isCurrentSceneLoadRequest\(loadGeneration,\s*imgData\.id\)/);
  assert.match(loadScene, /function isCurrentImageAttempt\(\)[\s\S]{0,220}?isCurrentLoad\(\)/);
  assert.match(loadScene, /show2DView\([\s\S]{0,700}?isCurrentImageAttempt\s*\)/);
  assert.match(loadScene, /initViewer\([\s\S]{0,700}?isCurrentImageAttempt\s*\)/);
  assert.match(loadScene, /preloadSceneImage\([\s\S]{0,300}?isCurrentLoad/);
  assert.match(loadScene, /startHotspotPreparation\(imgData\.id,\s*imgData\.id,\s*isCurrentLoad/);
  assert.match(initViewer, /shouldHandle/);
  assert.match(initViewer, /viewerInstance/);
  assert.match(initViewer, /if\s*\(\s*!canHandle\(\)\s*\)/);
  assert.match(show2DView, /shouldHandle/);
  assert.match(show2DView, /if\s*\(\s*!canHandle\(\)\s*\)\s*return/);

  const context = { sceneLoadGeneration: 9, currentFileId: 'same-scene' };
  vm.createContext(context);
  vm.runInContext(helper, context);
  assert.equal(context.isCurrentSceneLoadRequest(8, 'same-scene'), false);
  assert.equal(context.isCurrentSceneLoadRequest(9, 'other-scene'), false);
  assert.equal(context.isCurrentSceneLoadRequest(9, 'same-scene'), true);
});

test('modal closes from Escape or backdrop, preserves errors, and disables north controls for 2D', () => {
  const app = read(appPath);
  const keydown = getFunctionSource(app, 'onGlobalKeyDown');
  const backdrop = getFunctionSource(app, 'onSceneSettingsBackdropClick');
  const sync = getFunctionSource(app, 'syncSceneSettingsControls');
  const saveSettings = getFunctionSource(app, 'saveSceneSettings');

  assert.match(keydown, /closeSceneSettingsModal\(/);
  assert.match(backdrop, /scene-settings-backdrop/);
  assert.match(backdrop, /closeSceneSettingsModal\(/);
  assert.match(sync, /===\s*'2D'/);
  assert.match(sync, /northFieldset\.disabled\s*=\s*is2D/);
  assert.match(sync, /manualInput\.disabled\s*=\s*is2D\s*\|\|/);
  assert.match(sync, /2D画像では北方向補正を使用しません/);
  assert.match(saveSettings, /scene-settings-error/);
  assert.doesNotMatch(saveSettings, /withFailureHandler\([\s\S]{0,280}closeSceneSettingsModal\(/);
});

test('normalized settings merge preserves image URLs and updates current display safely', () => {
  const app = read(appPath);
  const context = {};
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'mergeNormalizedSceneIntoImage'), context);

  const merged = context.mergeNormalizedSceneIntoImage(
    { id: 'scene-1', imageUrl: 'https://example.test/image', type: '360', northOffset: 12 },
    { fileId: 'scene-1', sceneType: '2D', type: '2D', northOffsetMode: 'manual' }
  );
  assert.equal(merged.id, 'scene-1');
  assert.equal(merged.imageUrl, 'https://example.test/image');
  assert.equal(merged.type, '2D');
  assert.equal(merged.sceneType, '2D');

  const apply = getFunctionSource(app, 'applyNormalizedSceneLocally');
  const reload = getFunctionSource(app, 'reloadCurrentSceneAfterSettings');
  assert.match(apply, /mergeNormalizedSceneIntoImage\(/);
  assert.match(apply, /buildSceneSidebar\(allImages\)/);
  assert.match(reload, /clearHotspotCache\(fileId\)/);
  assert.match(reload, /viewer\.getYaw/);
  assert.match(reload, /viewer\.getPitch/);
  assert.match(reload, /previousType\s*===\s*'360'\s*&&\s*nextType\s*===\s*'360'/);
  assert.match(reload, /hide2DView\(\)/);
  assert.match(reload, /loadScene\(/);
});

test('home action is edit-mode and root-only, tokenized, and never navigates immediately', () => {
  const app = read(appPath);
  const openMenu = getFunctionSource(app, 'openSceneContextMenu');
  const requestHome = getFunctionSource(app, 'requestSetHomeScene');

  assert.match(openMenu, /set-home/);
  assert.match(openMenu, /!isEditMode/);
  assert.match(openMenu, /!isRootSceneItem\(img\)/);
  assert.match(openMenu, /isSceneHome\(img\)/);
  assert.match(requestHome, /if\s*\(\s*!canEdit\s*\|\|\s*!isEditMode/);
  assert.match(requestHome, /\.setHomeScene\(withEditToken\(\{\s*fileId:/);
  assert.match(requestHome, /homeImageId\s*=/);
  assert.match(requestHome, /buildSceneSidebar\(allImages\)/);
  assert.doesNotMatch(requestHome, /loadScene\(/);
});

test('upload home checkbox is root-only and its tokenized payload includes setAsHome', () => {
  const index = read(indexPath);
  const app = read(appPath);
  const syncUpload = getFunctionSource(app, 'syncUploadHomeOption');
  const upload = getFunctionSource(app, 'onUploadConfirm');

  assert.match(index, /id="upload-set-home"[^>]*type="checkbox"/);
  assert.match(index, /この画像をホームに設定する/);
  assert.match(index, /id="upload-home-help"/);
  assert.match(syncUpload, /folderStack\.length\s*===\s*0/);
  assert.match(syncUpload, /getCurrentFolderId\(\)\s*===\s*rootFolderId/);
  assert.match(syncUpload, /homeCheckbox\.disabled\s*=\s*!isRootUpload/);
  assert.match(syncUpload, /サブフォルダ/);
  assert.match(upload, /setAsHome:\s*!!setAsHome/);
  assert.match(upload, /result\.homeSet/);
  assert.match(upload, /homeImageId\s*=/);
});
