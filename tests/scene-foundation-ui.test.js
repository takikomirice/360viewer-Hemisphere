const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const appPath = path.join(rootDir, 'app.html');

function readApp() {
  return fs.readFileSync(appPath, 'utf8');
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

function loadSceneListHelpers() {
  const app = readApp();
  const context = {};
  vm.createContext(context);
  const names = [
    'getSceneDisplayName',
    'getExplicitSceneType',
    'isSceneHome',
    'findHomeSceneImage',
    'compareSceneListItems',
    'sortSceneListItems'
  ];
  vm.runInContext(names.map((name) => getFunctionSource(app, name)).join('\n'), context);
  return context;
}

test('scene display names strip only the final supported image extension case-insensitively', () => {
  const helpers = loadSceneListHelpers();

  assert.equal(helpers.getSceneDisplayName('体育館.jpg'), '体育館');
  assert.equal(helpers.getSceneDisplayName({ name: '校内.体育館.PNG' }), '校内.体育館');
  assert.equal(helpers.getSceneDisplayName({ displayName: 'Map.JpEg' }), 'Map');
  assert.equal(helpers.getSceneDisplayName('photo.gif'), 'photo');
  assert.equal(helpers.getSceneDisplayName('photo.WEBP'), 'photo');
  assert.equal(helpers.getSceneDisplayName('archive.jpg.backup'), 'archive.jpg.backup');
  assert.equal(helpers.getSceneDisplayName('unsupported.bmp'), 'unsupported.bmp');
});

test('explicit scenes type wins and filename tags are fallback only for missing legacy type', () => {
  const helpers = loadSceneListHelpers();

  assert.equal(helpers.getExplicitSceneType({ type: '360', name: '[2D] Panorama.jpg' }), '360');
  assert.equal(helpers.getExplicitSceneType({ sceneType: '2D', name: 'Map.jpg' }), '2D');
  assert.equal(helpers.getExplicitSceneType({ type: '', name: 'Legacy [2D].jpg' }), '2D');
  assert.equal(helpers.getExplicitSceneType({ name: 'Legacy panorama.jpg' }), '360');
});

test('home selection uses the normalized scenes flag and never reparses the filename', () => {
  const helpers = loadSceneListHelpers();

  assert.equal(helpers.isSceneHome({ isHome: true, name: 'Normal.jpg' }), true);
  assert.equal(helpers.isSceneHome({ isHome: 'TRUE', name: 'Normal.jpg' }), true);
  assert.equal(helpers.isSceneHome({ isHome: false, name: '[HOME] Legacy.jpg' }), false);
  assert.equal(helpers.isSceneHome({ name: '[HOME] Missing scene row.jpg' }), false);

  const selected = helpers.findHomeSceneImage([
    { id: 'folder', type: 'folder', name: 'Folder' },
    { id: 'legacy-tag', type: '360', isHome: false, name: '[HOME] Legacy.jpg' },
    { id: 'scenes-home', type: '360', isHome: true, name: 'Home.jpg' }
  ]);
  assert.equal(selected.id, 'scenes-home');
  assert.equal(helpers.findHomeSceneImage([
    { id: 'folder', type: 'folder', name: 'Folder' },
    { id: 'first-image', type: '360', isHome: false, name: 'First.jpg' }
  ]).id, 'first-image');
});

test('scene list sorting keeps folders first and uses scenes order with stable name and id fallback', () => {
  const helpers = loadSceneListHelpers();
  const sorted = helpers.sortSceneListItems([
    { id: 'image-z', type: '360', displayOrder: 2, displayName: 'Z' },
    { id: 'folder-b', type: 'folder', name: 'B folder' },
    { id: 'image-b', type: '360', displayOrder: 1, displayName: 'B' },
    { id: 'image-a2', type: '2D', displayOrder: 1, displayName: 'A' },
    { id: 'folder-a', type: 'folder', name: 'A folder' },
    { id: 'image-a1', type: '360', displayOrder: 'invalid', displayName: 'A' }
  ]);

  assert.deepEqual(Array.from(sorted, (item) => item.id), [
    'folder-a',
    'folder-b',
    'image-a2',
    'image-b',
    'image-z',
    'image-a1'
  ]);
});

test('client scene loading, home selection, sync timing, and northOffset zero use scenes-aware helpers', () => {
  const app = readApp();
  const loadScene = getFunctionSource(app, 'loadScene');
  const onConfigLoaded = getFunctionSource(app, 'onConfigLoaded');
  const refreshSceneList = getFunctionSource(app, 'refreshSceneList');
  const applyDelete = getFunctionSource(app, 'applySceneDeleteLocally');
  const applySettings = getFunctionSource(app, 'applyNormalizedSceneLocally');
  const sidebar = getFunctionSource(app, 'buildSceneSidebar');
  const photoSelect = getFunctionSource(app, 'buildPhotoSelect');
  const jumpSelect = getFunctionSource(app, 'buildJumpSceneSelect');
  const uploadConfirm = getFunctionSource(app, 'onUploadConfirm');

  assert.match(loadScene, /getExplicitSceneType\(imgData\)\s*===\s*'2D'/);
  assert.match(onConfigLoaded, /updateRootHomeImageId\(\)/);
  assert.match(app, /\.getConfig\(appMode,\s*true\)/);
  assert.match(app, /\.navigateToFolder\(folderItem\.id,\s*true\)/);
  assert.match(refreshSceneList, /updateRootHomeImageId\(\)/);
  assert.match(applyDelete, /updateRootHomeImageId\(\)/);
  assert.match(applySettings, /sortSceneListItems\(allImages\)/);
  assert.match(sidebar, /getSceneDisplayName\(img\)/);
  assert.match(photoSelect, /getSceneDisplayName\(img\)/);
  assert.match(jumpSelect, /getSceneDisplayName\(img\)/);
  assert.match(uploadConfirm, /sortSceneListItems\(allImages\)/);
  assert.match(uploadConfirm, /updateRootHomeImageId\(\)/);
  assert.doesNotMatch(loadScene, /northOffset\s*\|\|\s*null/);
  assert.match(loadScene, /typeof northOffset === 'number'\s*&&\s*isFinite\(northOffset\)/);
  assert.match(refreshSceneList, /firstImage\s*=\s*allImages\.filter\(function\s*\(item\)/);
  assert.match(refreshSceneList, /loadScene\(firstImage\)/);
});

test('client discloses partial success for upload, integrated settings, and explicit delete', () => {
  const app = readApp();
  const uploadConfirm = getFunctionSource(app, 'onUploadConfirm');
  const saveSettings = getFunctionSource(app, 'saveSceneSettings');
  const requestDelete = getFunctionSource(app, 'requestSceneDelete');

  assert.match(uploadConfirm, /result\.partialSuccess/);
  assert.match(uploadConfirm, /result\.warning/);
  assert.match(saveSettings, /result\.partialSuccess/);
  assert.match(saveSettings, /result\.warning/);
  assert.match(requestDelete, /result\.partialSuccess/);
  assert.match(requestDelete, /result\.warning/);
});
