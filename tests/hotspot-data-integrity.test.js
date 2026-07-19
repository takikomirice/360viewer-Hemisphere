const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const code = fs.readFileSync(path.resolve(__dirname, '..', 'Code.js'), 'utf8');

const SELECTABLE_MARKER_ICONS = [
  'info', 'photo', 'link', 'wifi', 'quiz', 'eye', 'warning', 'flag',
  'animal', 'leaf', 'flower', 'historic'
];
const LEGACY_MARKER_ICONS = ['video', 'audio'];
const SUPPORTED_MARKER_ICONS = SELECTABLE_MARKER_ICONS.concat(LEGACY_MARKER_ICONS);

function getFunctionSource(functionName) {
  const start = code.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const bodyStart = code.indexOf('{', start);
  let depth = 0;
  for (let offset = bodyStart; offset < code.length; offset += 1) {
    if (code[offset] === '{') depth += 1;
    if (code[offset] === '}') depth -= 1;
    if (depth === 0) return code.slice(start, offset + 1);
  }
  throw new Error(`Could not parse ${functionName}`);
}

function readConst(name) {
  const match = code.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  assert.ok(match, `${name} should exist`);
  const dependencies = name === 'SUPPORTED_MARKER_ICONS'
    ? {
        SELECTABLE_MARKER_ICONS: readConst('SELECTABLE_MARKER_ICONS'),
        LEGACY_MARKER_ICONS: readConst('LEGACY_MARKER_ICONS')
      }
    : {};
  return vm.runInNewContext(`(${match[1]})`, dependencies);
}

function baseContext(overrides = {}) {
  return Object.assign({
    console: { error() {}, warn() {} },
    INFO_SHEET_NAME: 'info',
    INFO_HEADERS: Array.from({ length: 13 }, (_, index) => `h${index}`),
    ID_COL_INDEX: 12,
    DEFAULT_MARKER_SHAPE: 'circle',
    DEFAULT_MARKER_COLOR: 'blue',
    DEFAULT_MARKER_ICON: 'info',
    ALLOWED_MARKER_SHAPES: readConst('ALLOWED_MARKER_SHAPES'),
    ALLOWED_MARKER_COLORS: readConst('ALLOWED_MARKER_COLORS'),
    SUPPORTED_MARKER_ICONS: readConst('SUPPORTED_MARKER_ICONS'),
    getOrExtractNorthOffset_() { return null; },
    normalizeLinkUrl_(value) { return /^https?:\/\//i.test(String(value || '').trim()) ? String(value).trim() : ''; },
    getHotspotReadContext_() { return { sceneType: '360' }; },
    getHotspotStorageContext_(fileId) {
      return {
        storageFileId: String(fileId || ''),
        actualFileId: String(fileId || ''),
        rootFolderId: 'test-root',
        sceneType: '360'
      };
    },
    normalizeHotspotCoordinates_(pitch, yaw) {
      return typeof pitch === 'number' && typeof yaw === 'number' &&
        Number.isFinite(pitch) && Number.isFinite(yaw) &&
        pitch >= -90 && pitch <= 90 && yaw >= -180 && yaw <= 180
        ? { pitch, yaw }
        : null;
    },
    validateHotspotRelatedIds_(data) {
      return {
        photoId: String(data && data.photoId || '').trim(),
        jumpSceneId: String(data && data.jumpSceneId || '').trim()
      };
    },
    buildNormalizedHotspot_(fileId, id, fields) {
      return Object.assign({ id: String(id || ''), fileId: String(fileId || '') }, fields || {});
    },
    assertHotspotSceneTypeUnchanged_() {},
    assertEditToken_() {},
    acquireLock_() { return { releaseLock() {} }; },
    ensureInfoSheetSchema_() {},
    Utilities: {
      getUuid() { return 'new-id'; },
      formatDate() { return 'date'; }
    },
    Session: { getScriptTimeZone() { return 'Asia/Tokyo'; } }
  }, overrides);
}

function installMarkerHelpers(context) {
  vm.createContext(context);
  const helperNames = [
    'normalizeMarkerShape_',
    'normalizeMarkerColor_',
    'normalizeMarkerIcon_',
    'hasHotspotLabelOrJump_'
  ];
  const sources = helperNames
    .filter((name) => code.includes(`function ${name}(`))
    .map(getFunctionSource);
  vm.runInContext(sources.join('\n'), context);
}

test('server separates selectable marker icons from supported legacy values', () => {
  assert.deepEqual(Array.from(readConst('SELECTABLE_MARKER_ICONS')), SELECTABLE_MARKER_ICONS);
  assert.deepEqual(Array.from(readConst('LEGACY_MARKER_ICONS')), LEGACY_MARKER_ICONS);
  assert.deepEqual(Array.from(readConst('SUPPORTED_MARKER_ICONS')), SUPPORTED_MARKER_ICONS);
});

test('server accepts all supported marker icons and normalizes only unknown values to info', () => {
  const context = baseContext();
  installMarkerHelpers(context);

  SUPPORTED_MARKER_ICONS.forEach((icon) => {
    assert.equal(context.normalizeMarkerIcon_(icon), icon);
  });
  assert.equal(context.normalizeMarkerIcon_('unknown-icon'), 'info');
  assert.equal(context.normalizeMarkerIcon_(''), 'info');
});

test('saveHotspot and updateHotspot preserve the four new marker icon values', () => {
  ['animal', 'leaf', 'flower', 'historic'].forEach((icon) => {
    const appended = [];
    const saveSheet = { appendRow(row) { appended.push(row.slice()); } };
    const saveContext = baseContext({
      SpreadsheetApp: {
        getActiveSpreadsheet() {
          return { getSheetByName() { return saveSheet; } };
        }
      }
    });
    installMarkerHelpers(saveContext);
    vm.runInContext(getFunctionSource('saveHotspot'), saveContext);

    const saveResult = saveContext.saveHotspot({
      label: `new ${icon}`, fileId: 'scene-a', pitch: 1, yaw: 2,
      markerShape: 'circle', markerColor: 'blue', markerIcon: icon
    });

    assert.equal(saveResult.success, true);
    assert.equal(appended[0][9], icon);
    assert.equal(saveResult.hotspot.markerIcon, icon);

    const stored = [
      'date', 'scene-a', `old ${icon}`, '', '', 1, 2,
      'circle', 'blue', 'info', '', '', `${icon}-id`
    ];
    let written = null;
    const updateSheet = {
      getLastRow() { return 2; },
      getRange() {
        return {
          getValues() { return [stored.slice()]; },
          setValues(rows) { written = rows[0].slice(); }
        };
      }
    };
    const updateContext = baseContext({
      SpreadsheetApp: {
        getActiveSpreadsheet() {
          return { getSheetByName() { return updateSheet; } };
        }
      }
    });
    installMarkerHelpers(updateContext);
    vm.runInContext(getFunctionSource('updateHotspot'), updateContext);

    const updateResult = updateContext.updateHotspot({
      fileId: 'scene-a', label: `updated ${icon}`, description: '', linkUrl: '',
      pitch: 3, yaw: 4, markerShape: 'circle', markerColor: 'blue', markerIcon: icon,
      photoId: '', jumpSceneId: ''
    }, `${icon}-id`);

    assert.equal(updateResult.success, true);
    assert.equal(written[9], icon);
    assert.equal(updateResult.hotspot.markerIcon, icon);
  });
});

test('loadHotspots and updateHotspot preserve existing video and audio icon values', () => {
  LEGACY_MARKER_ICONS.forEach((icon) => {
    const stored = [
      'date', 'scene-a', `${icon} marker`, 'old description', '', 1, 2,
      'circle', 'blue', icon, '', '', `${icon}-id`
    ];
    let written = null;
    const sheet = {
      getLastRow() { return 2; },
      getRange() {
        return {
          getValues() { return [stored.slice()]; },
          setValues(rows) { written = rows[0].slice(); }
        };
      }
    };
    const context = baseContext({
      SpreadsheetApp: {
        getActiveSpreadsheet() {
          return { getSheetByName() { return sheet; } };
        }
      }
    });
    installMarkerHelpers(context);
    vm.runInContext(`${getFunctionSource('loadHotspots')}\n${getFunctionSource('updateHotspot')}`, context);

    const loaded = context.loadHotspots('scene-a');
    assert.equal(loaded.hotspots[0].markerIcon, icon);

    const updateResult = context.updateHotspot({
      fileId: 'scene-a', label: `${icon} marker renamed`, description: 'new description',
      linkUrl: '', pitch: 1, yaw: 2, markerShape: 'circle', markerColor: 'blue',
      markerIcon: icon, photoId: '', jumpSceneId: ''
    }, `${icon}-id`);

    assert.equal(updateResult.success, true);
    assert.equal(written[9], icon);
    assert.equal(updateResult.hotspot.markerIcon, icon);
  });
});

test('loading legacy star data returns circle, keeps blank-label jumps, and never writes the info sheet', () => {
  const writes = [];
  const rows = [
    ['date', 'scene-a', 'legacy marker', 'desc', '', 1, 2, 'star', 'blue', 'info', '', '', 'legacy-id'],
    ['date', 'scene-a', '', '', '', 3, 4, 'circle', 'cyan', 'flag', '', 'scene-b', 'jump-id'],
    ['date', 'scene-a', '', '', '', 5, 6, 'circle', 'blue', 'info', '', '', 'empty-id']
  ];
  const sheet = {
    getLastRow() { return rows.length + 1; },
    getRange() {
      return {
        getValues() { return rows.map((row) => row.slice()); },
        setValues(value) { writes.push(value); }
      };
    },
    appendRow(value) { writes.push(value); }
  };
  const context = baseContext({
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSheetByName() { return sheet; } };
      }
    }
  });
  installMarkerHelpers(context);
  vm.runInContext(getFunctionSource('loadHotspots'), context);

  const result = context.loadHotspots('scene-a');

  assert.equal(result.hotspots.length, 2);
  assert.equal(result.hotspots[0].markerShape, 'circle');
  assert.equal(result.hotspots[1].label, '');
  assert.equal(result.hotspots[1].jumpSceneId, 'scene-b');
  assert.deepEqual(writes, []);
});

test('saveHotspot accepts a blank label only when a jump destination is preserved', () => {
  const appended = [];
  const sheet = {
    appendRow(row) { appended.push(row.slice()); }
  };
  const context = baseContext({
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSheetByName() { return sheet; } };
      }
    }
  });
  installMarkerHelpers(context);
  vm.runInContext(getFunctionSource('saveHotspot'), context);

  const jumpResult = context.saveHotspot({
    label: '', jumpSceneId: 'scene-b', fileId: 'scene-a', pitch: 1, yaw: 2,
    markerShape: 'circle', markerColor: 'blue', markerIcon: 'flag'
  });
  const emptyResult = context.saveHotspot({
    label: '', jumpSceneId: '', fileId: 'scene-a', pitch: 1, yaw: 2
  });

  assert.equal(jumpResult.success, true);
  assert.equal(appended[0][2], '');
  assert.equal(appended[0][11], 'scene-b');
  assert.equal(emptyResult.success, false);
});

test('updateHotspot moves a blank-label jump without discarding marker metadata', () => {
  const stored = ['date', 'scene-a', '', '', '', 1, 2, 'diamond', 'pink', 'flag', 'photo-a', 'scene-b', 'jump-id'];
  let written = null;
  const range = {
    getValues() { return [stored.slice()]; },
    setValues(rows) { written = rows[0].slice(); }
  };
  const sheet = {
    getLastRow() { return 2; },
    getRange() { return range; }
  };
  const context = baseContext({
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return { getSheetByName() { return sheet; } };
      }
    }
  });
  installMarkerHelpers(context);
  vm.runInContext(getFunctionSource('updateHotspot'), context);

  const result = context.updateHotspot({
    fileId: 'scene-a', label: '', description: '', linkUrl: '', pitch: 33, yaw: 44,
    markerShape: 'diamond', markerColor: 'pink', markerIcon: 'flag',
    photoId: 'photo-a', jumpSceneId: 'scene-b'
  }, 'jump-id');

  assert.equal(result.success, true);
  assert.equal(written[2], '');
  assert.equal(written[5], 33);
  assert.equal(written[6], 44);
  assert.deepEqual(Array.from(written.slice(7, 12)), ['diamond', 'pink', 'flag', 'photo-a', 'scene-b']);
});
