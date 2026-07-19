const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(rootDir, 'app.html'), 'utf8');
const code = fs.readFileSync(path.join(rootDir, 'Code.js'), 'utf8');
const index = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(rootDir, 'styles.html'), 'utf8');
const readmeJa = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
const readmeEn = fs.readFileSync(path.join(rootDir, 'README.en.md'), 'utf8');

const EXPECTED_SHAPES = ['circle', 'square', 'diamond'];
const EXPECTED_COLORS = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple', 'gray', 'white'];
const EXPECTED_SELECTABLE_ICONS = [
  'info', 'photo', 'link', 'wifi', 'quiz', 'eye', 'warning', 'flag',
  'animal', 'leaf', 'flower', 'historic'
];
const EXPECTED_LEGACY_ICONS = ['video', 'audio'];
const EXPECTED_SUPPORTED_ICONS = EXPECTED_SELECTABLE_ICONS.concat(EXPECTED_LEGACY_ICONS);

function getFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let offset = bodyStart; offset < source.length; offset += 1) {
    if (source[offset] === '{') depth += 1;
    if (source[offset] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, offset + 1);
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

function readVarArray(name) {
  const match = app.match(new RegExp(`var\\s+${name}\\s*=\\s*([^;]+);`));
  assert.ok(match, `${name} should exist`);
  const dependencies = name === 'SUPPORTED_MARKER_ICONS'
    ? {
        SELECTABLE_MARKER_ICONS: readVarArray('SELECTABLE_MARKER_ICONS'),
        LEGACY_MARKER_ICONS: readVarArray('LEGACY_MARKER_ICONS')
      }
    : {};
  return Array.from(vm.runInNewContext(`(${match[1]})`, dependencies));
}

function readVarObject(name) {
  const match = app.match(new RegExp(`var\\s+${name}\\s*=\\s*(\\{[\\s\\S]*?\\n\\});`));
  assert.ok(match, `${name} should exist`);
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${match[1]})`)));
}

function selectOptionValues(selectId) {
  const match = index.match(new RegExp(`<select id="${selectId}"[\\s\\S]*?<\\/select>`));
  assert.ok(match, `${selectId} should exist`);
  return Array.from(match[0].matchAll(/<option value="([^"]+)"/g), (option) => option[1]);
}

function selectOptgroups(selectId) {
  const match = index.match(new RegExp(`<select id="${selectId}"[\\s\\S]*?<\\/select>`));
  assert.ok(match, `${selectId} should exist`);
  return Array.from(match[0].matchAll(/<optgroup([^>]*)>([\s\S]*?)<\/optgroup>/g), (group) => {
    const label = group[1].match(/label="([^"]+)"/);
    const id = group[1].match(/id="([^"]+)"/);
    return {
      label: label ? label[1] : '',
      id: id ? id[1] : '',
      hidden: /(?:^|\s)hidden(?:\s|$|=)/.test(group[1]),
      values: Array.from(group[2].matchAll(/<option value="([^"]+)"/g), (option) => option[1])
    };
  });
}

test('server marker catalogs separate the twelve selectable values from two legacy values', () => {
  assert.deepEqual(Array.from(readConst('ALLOWED_MARKER_SHAPES')), EXPECTED_SHAPES);
  assert.deepEqual(Array.from(readConst('ALLOWED_MARKER_COLORS')), EXPECTED_COLORS);
  assert.deepEqual(Array.from(readConst('SELECTABLE_MARKER_ICONS')), EXPECTED_SELECTABLE_ICONS);
  assert.deepEqual(Array.from(readConst('LEGACY_MARKER_ICONS')), EXPECTED_LEGACY_ICONS);
  assert.deepEqual(Array.from(readConst('SUPPORTED_MARKER_ICONS')), EXPECTED_SUPPORTED_ICONS);
});

test('client marker catalogs match the server selectable and supported values', () => {
  assert.deepEqual(readVarArray('SELECTABLE_MARKER_ICONS'), EXPECTED_SELECTABLE_ICONS);
  assert.deepEqual(readVarArray('LEGACY_MARKER_ICONS'), EXPECTED_LEGACY_ICONS);
  assert.deepEqual(readVarArray('SUPPORTED_MARKER_ICONS'), EXPECTED_SUPPORTED_ICONS);
});

test('client marker catalogs expose the exact Japanese labels and no star entry', () => {
  assert.deepEqual(readVarObject('MARKER_SHAPE_LABELS'), {
    circle: '丸',
    square: '四角',
    diamond: '菱形'
  });
  assert.deepEqual(readVarObject('MARKER_COLOR_LABELS'), {
    blue: '青',
    cyan: '水色',
    teal: '青緑',
    green: '緑',
    lime: '黄緑',
    yellow: '黄',
    orange: 'オレンジ',
    red: '赤',
    pink: 'ピンク',
    purple: '紫',
    gray: '灰',
    white: '白'
  });
  assert.deepEqual(readVarObject('MARKER_ICON_LABELS'), {
    info: '情報',
    photo: '写真',
    link: 'リンク',
    wifi: 'Wi-Fi',
    quiz: 'クイズ',
    eye: '観察',
    warning: '注意',
    flag: '目的地',
    animal: '動物',
    leaf: '葉っぱ',
    flower: '花',
    historic: '史跡',
    video: '動画',
    audio: '音声'
  });
});

test('new marker selector lists exactly twelve icons in the specified optgroups and order', () => {
  assert.deepEqual(selectOptionValues('marker-shape'), EXPECTED_SHAPES);
  assert.deepEqual(selectOptionValues('marker-color'), EXPECTED_COLORS);
  assert.deepEqual(selectOptionValues('marker-icon'), EXPECTED_SELECTABLE_ICONS);
  assert.equal(selectOptionValues('marker-icon').includes('video'), false);
  assert.equal(selectOptionValues('marker-icon').includes('audio'), false);
  assert.deepEqual(selectOptgroups('marker-icon'), [
    {
      label: '基本', id: '', hidden: false,
      values: EXPECTED_SELECTABLE_ICONS.slice(0, 8)
    },
    {
      label: '自然・地域学習', id: '', hidden: false,
      values: EXPECTED_SELECTABLE_ICONS.slice(8)
    },
    {
      label: '旧アイコン', id: 'marker-icon-legacy-group', hidden: true, values: []
    }
  ]);
  assert.match(index, /<option value="info" selected>|<option value="info">情報<\/option>/);
  assert.doesNotMatch(index, /<option value="star">/);
});

test('client and server preserve all supported icons and normalize only unsupported values', () => {
  const clientContext = {
    DEFAULT_MARKER_SHAPE: 'circle',
    DEFAULT_MARKER_COLOR: 'blue',
    DEFAULT_MARKER_ICON: 'info',
    MARKER_SHAPE_LABELS: readVarObject('MARKER_SHAPE_LABELS'),
    MARKER_COLOR_LABELS: readVarObject('MARKER_COLOR_LABELS'),
    SUPPORTED_MARKER_ICONS: EXPECTED_SUPPORTED_ICONS
  };
  vm.createContext(clientContext);
  vm.runInContext([
    getFunctionSource(app, 'normalizeMarkerShape'),
    getFunctionSource(app, 'normalizeMarkerColor'),
    getFunctionSource(app, 'normalizeMarkerIcon')
  ].join('\n'), clientContext);

  assert.equal(clientContext.normalizeMarkerShape('star'), 'circle');
  assert.equal(clientContext.normalizeMarkerShape(' triangle '), 'circle');
  assert.equal(clientContext.normalizeMarkerColor('navy'), 'blue');
  EXPECTED_SUPPORTED_ICONS.forEach((icon) => assert.equal(clientContext.normalizeMarkerIcon(icon), icon));
  assert.equal(clientContext.normalizeMarkerIcon('map'), 'info');

  const serverContext = {
    DEFAULT_MARKER_SHAPE: 'circle',
    DEFAULT_MARKER_COLOR: 'blue',
    DEFAULT_MARKER_ICON: 'info',
    ALLOWED_MARKER_SHAPES: readConst('ALLOWED_MARKER_SHAPES'),
    ALLOWED_MARKER_COLORS: readConst('ALLOWED_MARKER_COLORS'),
    SUPPORTED_MARKER_ICONS: readConst('SUPPORTED_MARKER_ICONS')
  };
  vm.createContext(serverContext);
  vm.runInContext([
    getFunctionSource(code, 'normalizeMarkerShape_'),
    getFunctionSource(code, 'normalizeMarkerColor_'),
    getFunctionSource(code, 'normalizeMarkerIcon_')
  ].join('\n'), serverContext);

  assert.equal(serverContext.normalizeMarkerShape_('star'), 'circle');
  assert.equal(serverContext.normalizeMarkerColor_('navy'), 'blue');
  EXPECTED_SUPPORTED_ICONS.forEach((icon) => assert.equal(serverContext.normalizeMarkerIcon_(icon), icon));
  assert.equal(serverContext.normalizeMarkerIcon_('map'), 'info');
});

test('legacy stored icon preference falls back for new markers without rewriting localStorage', () => {
  const writes = [];
  const context = {
    window: {
      localStorage: {
        getItem(key) {
          return { hsMarkerShape: 'star', hsMarkerColor: 'navy', hsMarkerIcon: 'video' }[key];
        },
        setItem(key, value) {
          writes.push([key, value]);
        }
      }
    },
    DEFAULT_MARKER_SHAPE: 'circle',
    DEFAULT_MARKER_COLOR: 'blue',
    DEFAULT_MARKER_ICON: 'info',
    MARKER_SHAPE_LABELS: readVarObject('MARKER_SHAPE_LABELS'),
    MARKER_COLOR_LABELS: readVarObject('MARKER_COLOR_LABELS'),
    SUPPORTED_MARKER_ICONS: EXPECTED_SUPPORTED_ICONS,
    SELECTABLE_MARKER_ICONS: EXPECTED_SELECTABLE_ICONS,
    lastMarkerShape: 'circle',
    lastMarkerColor: 'blue',
    lastMarkerIcon: 'info'
  };
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'normalizeMarkerShape'),
    getFunctionSource(app, 'normalizeMarkerColor'),
    getFunctionSource(app, 'normalizeMarkerIcon'),
    getFunctionSource(app, 'normalizeSelectableMarkerIcon'),
    getFunctionSource(app, 'loadMarkerStylePreference')
  ].join('\n'), context);

  context.loadMarkerStylePreference();

  assert.equal(context.lastMarkerShape, 'circle');
  assert.equal(context.lastMarkerColor, 'blue');
  assert.equal(context.lastMarkerIcon, 'info');
  assert.deepEqual(writes, []);
});

test('legacy edit options are injected only for an existing video or audio marker', () => {
  const select = { value: 'info' };
  const legacyGroup = {
    hidden: true,
    children: [],
    get firstChild() { return this.children[0] || null; },
    appendChild(node) { this.children.push(node); return node; },
    removeChild(node) {
      const index = this.children.indexOf(node);
      if (index >= 0) this.children.splice(index, 1);
    }
  };
  const context = {
    DEFAULT_MARKER_ICON: 'info',
    SELECTABLE_MARKER_ICONS: EXPECTED_SELECTABLE_ICONS,
    LEGACY_MARKER_ICONS: EXPECTED_LEGACY_ICONS,
    SUPPORTED_MARKER_ICONS: EXPECTED_SUPPORTED_ICONS,
    MARKER_ICON_LABELS: readVarObject('MARKER_ICON_LABELS'),
    document: {
      getElementById(id) {
        if (id === 'marker-icon') return select;
        if (id === 'marker-icon-legacy-group') return legacyGroup;
        throw new Error(`unexpected id: ${id}`);
      },
      createElement(tagName) {
        assert.equal(tagName, 'option');
        return { value: '', textContent: '' };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'normalizeMarkerIcon'),
    getFunctionSource(app, 'normalizeSelectableMarkerIcon'),
    getFunctionSource(app, 'setMarkerIconSelectValue')
  ].join('\n'), context);

  assert.equal(context.setMarkerIconSelectValue('video', true), 'video');
  assert.equal(select.value, 'video');
  assert.equal(legacyGroup.hidden, false);
  assert.deepEqual(
    legacyGroup.children.map((option) => [option.value, option.textContent]),
    [['video', '動画（旧アイコン）']]
  );

  assert.equal(context.setMarkerIconSelectValue('leaf', false), 'leaf');
  assert.equal(select.value, 'leaf');
  assert.equal(legacyGroup.hidden, true);
  assert.equal(legacyGroup.children.length, 0);

  assert.equal(context.setMarkerIconSelectValue('audio', true), 'audio');
  assert.equal(select.value, 'audio');
  assert.deepEqual(
    legacyGroup.children.map((option) => [option.value, option.textContent]),
    [['audio', '音声（旧アイコン）']]
  );

  assert.match(getFunctionSource(app, 'openPopup'), /setMarkerIconSelectValue\(editArgs\.markerIcon,\s*true\)/);
  assert.match(getFunctionSource(app, 'syncMarkerStyleInputsFromPreference'), /setMarkerIconSelectValue\(lastMarkerIcon,\s*false\)/);
});

test('last-icon preference stores current icons but never offers a legacy icon to a new marker', () => {
  const writes = [];
  const context = {
    window: { localStorage: { setItem(key, value) { writes.push([key, value]); } } },
    DEFAULT_MARKER_SHAPE: 'circle',
    DEFAULT_MARKER_COLOR: 'blue',
    DEFAULT_MARKER_ICON: 'info',
    MARKER_SHAPE_LABELS: readVarObject('MARKER_SHAPE_LABELS'),
    MARKER_COLOR_LABELS: readVarObject('MARKER_COLOR_LABELS'),
    SELECTABLE_MARKER_ICONS: EXPECTED_SELECTABLE_ICONS,
    SUPPORTED_MARKER_ICONS: EXPECTED_SUPPORTED_ICONS,
    lastMarkerShape: 'circle',
    lastMarkerColor: 'blue',
    lastMarkerIcon: 'info',
    updateMarkerStyleSummary() {}
  };
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'normalizeMarkerShape'),
    getFunctionSource(app, 'normalizeMarkerColor'),
    getFunctionSource(app, 'normalizeMarkerIcon'),
    getFunctionSource(app, 'normalizeSelectableMarkerIcon'),
    getFunctionSource(app, 'persistMarkerStylePreference')
  ].join('\n'), context);

  context.persistMarkerStylePreference('diamond', 'pink', 'historic');
  assert.equal(context.lastMarkerIcon, 'historic');
  assert.deepEqual(writes.at(-1), ['hsMarkerIcon', 'historic']);

  context.persistMarkerStylePreference('circle', 'blue', 'video');
  assert.equal(context.lastMarkerIcon, 'info');
  assert.deepEqual(writes.at(-1), ['hsMarkerIcon', 'info']);
});

function markerCssRule(colorId) {
  const match = styles.match(new RegExp(`\\.marker-color-${colorId}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `marker-color-${colorId} should exist`);
  return Object.fromEntries(Array.from(
    match[1].matchAll(/(--marker-[a-z-]+)\s*:\s*(#[0-9a-f]{6})/gi),
    (entry) => [entry[1], entry[2].toLowerCase()]
  ));
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(left, right) {
  const lighter = Math.max(relativeLuminance(left), relativeLuminance(right));
  const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

test('all twelve current and two legacy marker icons use one inline currentColor SVG wrapper', () => {
  const definitions = readVarObject('MARKER_ICON_SVGS');
  assert.deepEqual(Object.keys(definitions), EXPECTED_SUPPORTED_ICONS);
  for (const iconId of EXPECTED_SUPPORTED_ICONS) {
    assert.ok(definitions[iconId].includes('<'), `${iconId} should contain SVG geometry`);
  }

  const context = {
    DEFAULT_MARKER_ICON: 'info',
    SUPPORTED_MARKER_ICONS: EXPECTED_SUPPORTED_ICONS,
    MARKER_ICON_SVGS: definitions
  };
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'normalizeMarkerIcon'),
    getFunctionSource(app, 'createMarkerIconSvg')
  ].join('\n'), context);

  for (const iconId of EXPECTED_SUPPORTED_ICONS) {
    const svg = context.createMarkerIconSvg(iconId);
    assert.match(svg, /^<svg class="marker-icon-svg" viewBox="0 0 24 24"/);
    assert.match(svg, /stroke-width="2\.2"/);
    assert.match(svg, /currentColor/);
    assert.doesNotMatch(svg, /https?:\/\//i);
  }

  assert.match(definitions.eye, /<circle[^>]*cx="10\.5"[^>]*cy="10\.5"[^>]*r="5\.5"/);
  assert.match(definitions.eye, /14\.5 14\.5 5 5/);
  assert.match(definitions.warning, /M12 4v11/);
  assert.doesNotMatch(definitions.warning, /M12 3 2\.5 20|<polygon/);
  assert.ok((definitions.animal.match(/<circle/g) || []).length >= 4, 'animal should have recognizable paw toes');
  assert.match(definitions.leaf, /C/);
  assert.ok((definitions.flower.match(/<(?:circle|ellipse)/g) || []).length >= 6, 'flower should have a center and five petals');
  assert.match(definitions.historic, /M5 20h14|M6 20h12/);
});

test('twelve marker palettes provide readable icon contrast including light colors and white outlines', () => {
  for (const colorId of EXPECTED_COLORS) {
    const rule = markerCssRule(colorId);
    for (const property of ['--marker-bg-start', '--marker-bg-end', '--marker-border', '--marker-ink']) {
      assert.match(rule[property] || '', /^#[0-9a-f]{6}$/, `${colorId} should define ${property}`);
    }
    assert.ok(
      contrastRatio(rule['--marker-ink'], rule['--marker-bg-start']) >= 3,
      `${colorId} ink should contrast with gradient start`
    );
    assert.ok(
      contrastRatio(rule['--marker-ink'], rule['--marker-bg-end']) >= 3,
      `${colorId} ink should contrast with gradient end`
    );
  }

  for (const lightColor of ['cyan', 'lime', 'yellow', 'white']) {
    assert.ok(relativeLuminance(markerCssRule(lightColor)['--marker-ink']) < 0.2, `${lightColor} should use dark ink`);
  }
  assert.ok(
    contrastRatio(markerCssRule('white')['--marker-border'], '#ffffff') >= 3,
    'white marker border should remain visible on white backgrounds'
  );
});

test('marker class and SVG helpers normalize values before applying appearance', () => {
  const definitions = readVarObject('MARKER_ICON_SVGS');
  function makeClassList(initial = []) {
    const values = new Set(initial);
    return {
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      contains(name) { return values.has(name); },
      [Symbol.iterator]() { return values[Symbol.iterator](); }
    };
  }
  const context = {
    DEFAULT_MARKER_SHAPE: 'circle',
    DEFAULT_MARKER_COLOR: 'blue',
    DEFAULT_MARKER_ICON: 'info',
    MARKER_SHAPE_LABELS: readVarObject('MARKER_SHAPE_LABELS'),
    MARKER_COLOR_LABELS: readVarObject('MARKER_COLOR_LABELS'),
    SUPPORTED_MARKER_ICONS: EXPECTED_SUPPORTED_ICONS,
    MARKER_ICON_SVGS: definitions
  };
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'normalizeMarkerShape'),
    getFunctionSource(app, 'normalizeMarkerColor'),
    getFunctionSource(app, 'normalizeMarkerIcon'),
    getFunctionSource(app, 'removeMarkerClassesByPrefix'),
    getFunctionSource(app, 'createMarkerIconSvg'),
    getFunctionSource(app, 'applyMarkerClasses'),
    getFunctionSource(app, 'applyMarkerIconClass')
  ].join('\n'), context);

  const marker = { classList: makeClassList(['marker-shape-square', 'marker-color-red']) };
  context.applyMarkerClasses(marker, 'star', 'cyan');
  assert.equal(marker.classList.contains('marker-shape-circle'), true);
  assert.equal(marker.classList.contains('marker-shape-square'), false);
  assert.equal(marker.classList.contains('marker-color-cyan'), true);
  assert.equal(marker.classList.contains('marker-color-red'), false);

  const core = { classList: makeClassList(['marker-icon-info']), innerHTML: '' };
  context.applyMarkerIconClass(core, 'video');
  assert.equal(core.classList.contains('marker-icon-video'), true);
  assert.equal(core.classList.contains('marker-icon-info'), false);
  assert.match(core.innerHTML, /marker-icon-svg/);
});

test('360, 2D, settings, and move previews share marker appearance helpers', () => {
  const buildMarker = getFunctionSource(app, 'buildMarkerElement');
  const render2D = getFunctionSource(app, 'render2DHotspots');
  const summary = getFunctionSource(app, 'updateMarkerStyleSummary');

  assert.match(buildMarker, /renderMarkerAppearance\(/);
  assert.match(render2D, /createStandaloneMarkerElement\(/);
  assert.match(render2D, /flat-hs-marker/);
  assert.match(summary, /applyMarkerClasses\(/);
  assert.match(summary, /applyMarkerIconClass\(/);
  assert.match(app, /function createHotspotMovePreviewElement\([\s\S]*createStandaloneMarkerElement\(/);
  assert.doesNotMatch(styles, /\.marker-shape-star\b/);
});

test('quiz remains the only marker icon that opens the quiz modal behavior', () => {
  const markerClick = getFunctionSource(app, 'onMarkerClick');
  assert.match(markerClick, /markerIcon\s*===\s*'quiz'/);
  for (const iconId of EXPECTED_SUPPORTED_ICONS.filter((icon) => icon !== 'quiz')) {
    assert.doesNotMatch(markerClick, new RegExp(`markerIcon\\s*===\\s*'${iconId}'`));
  }
});

test('2D move coordinates use the live image rectangle, clamp edges, and reject outside points', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'clampHotspotPercent'),
    getFunctionSource(app, 'get2DHotspotCoordinates')
  ].join('\n'), context);
  const image = {
    getBoundingClientRect() {
      return { left: 100, top: 50, right: 300, bottom: 150, width: 200, height: 100 };
    }
  };

  assert.deepEqual({ ...context.get2DHotspotCoordinates(200, 100, image) }, { pitch: 50, yaw: 50 });
  assert.deepEqual({ ...context.get2DHotspotCoordinates(100, 50, image) }, { pitch: 0, yaw: 0 });
  assert.deepEqual({ ...context.get2DHotspotCoordinates(300, 150, image) }, { pitch: 100, yaw: 100 });
  assert.equal(context.get2DHotspotCoordinates(99, 100, image), null);
  assert.equal(context.get2DHotspotCoordinates(200, 151, image), null);

  image.getBoundingClientRect = () => ({ left: 10, top: 20, right: 410, bottom: 220, width: 400, height: 200 });
  assert.deepEqual({ ...context.get2DHotspotCoordinates(110, 70, image) }, { pitch: 25, yaw: 25 });
});

test('move save payload replaces only coordinates and preserves every hotspot field', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'buildHotspotMoveSaveData'), context);
  const target = {
    label: '',
    description: 'keep description',
    linkUrl: 'https://example.com/',
    markerShape: 'diamond',
    markerColor: 'pink',
    markerIcon: 'flag',
    photoId: 'photo-a',
    jumpSceneId: 'scene-b',
    pitch: 1,
    yaw: 2
  };

  const payload = context.buildHotspotMoveSaveData(target, { pitch: 45, yaw: 67 }, 'scene-a', '2D');

  assert.deepEqual({ ...payload }, {
    fileId: 'scene-a',
    sceneType: '2D',
    label: '',
    description: 'keep description',
    linkUrl: 'https://example.com/',
    markerShape: 'diamond',
    markerColor: 'pink',
    markerIcon: 'flag',
    pitch: 45,
    yaw: 67,
    photoId: 'photo-a',
    jumpSceneId: 'scene-b'
  });
});

test('move preview start creates one matching ghost and dims the original marker', () => {
  function classList(initial = []) {
    const values = new Set(initial);
    return {
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      contains(name) { return values.has(name); }
    };
  }
  const appended = [];
  const source = {
    classList: classList(),
    getBoundingClientRect() { return { left: 20, top: 30, width: 24, height: 24 }; }
  };
  const preview = { style: { pointerEvents: 'none' } };
  const state = {
    active: false,
    target: null,
    sourceElement: null,
    previewElement: null,
    pointerPosition: null,
    rafId: null,
    startSceneId: '',
    generation: 0,
    saving: false,
    pointerDown: null,
    mode2D: false,
    listenersAttached: false
  };
  let attached = 0;
  let cancelled = 0;
  const context = {
    canEdit: true,
    isEditMode: true,
    currentFileId: 'scene-a',
    is2DMode: false,
    hotspotMoveState: state,
    isMovingHotspot: false,
    movingHotspotTarget: null,
    hasPendingHotspotMutationForTarget() { return false; },
    stopGyroIfActive() {},
    cancelHotspotMove() { cancelled += 1; state.active = false; },
    createHotspotMovePreviewElement() { return preview; },
    getHotspotMovePreviewParent() { return { appendChild(node) { appended.push(node); } }; },
    renderHotspotMovePreview() {},
    attachHotspotMoveListeners() { attached += 1; },
    showToast() {}
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'startHotspotMovePreview'), context);

  const target = { id: 'hotspot-a', markerShape: 'diamond', markerColor: 'pink', markerIcon: 'flag' };
  assert.equal(context.startHotspotMovePreview(target, source), true);
  assert.equal(state.active, true);
  assert.equal(state.target, target);
  assert.equal(state.startSceneId, 'scene-a');
  assert.deepEqual({ ...state.pointerPosition }, { clientX: 32, clientY: 42 });
  assert.equal(source.classList.contains('hs-marker-moving-source'), true);
  assert.equal(appended[0], preview);
  assert.equal(preview.style.pointerEvents, 'none');
  assert.equal(attached, 1);

  assert.equal(context.startHotspotMovePreview(target, source), true);
  assert.equal(cancelled, 1, 'starting another move should cancel the active one first');
});

test('pointermove stores only the latest position and schedules one requestAnimationFrame', () => {
  const callbacks = [];
  let renders = 0;
  const state = {
    active: true,
    saving: false,
    previewElement: {},
    pointerPosition: null,
    rafId: null
  };
  const context = {
    hotspotMoveState: state,
    requestAnimationFrame(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    renderHotspotMovePreview() { renders += 1; }
  };
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'scheduleHotspotMovePreviewRender'),
    getFunctionSource(app, 'updateHotspotMovePreview')
  ].join('\n'), context);

  context.updateHotspotMovePreview({ clientX: 10, clientY: 20 });
  context.updateHotspotMovePreview({ clientX: 30, clientY: 40 });
  assert.equal(callbacks.length, 1);
  assert.deepEqual({ ...state.pointerPosition }, { clientX: 30, clientY: 40 });

  callbacks[0]();
  assert.equal(renders, 1);
  assert.equal(state.rafId, null);
});

test('cleanup cancels RAF, removes preview and pointer listeners, and restores source state', () => {
  const removed = [];
  const sourceClasses = new Set(['hs-marker-moving-source']);
  const source = { classList: { remove(name) { sourceClasses.delete(name); } } };
  const parent = { removeChild(node) { removed.push(node); } };
  const preview = { parentNode: parent };
  const state = {
    active: true,
    target: { id: 'hotspot-a' },
    sourceElement: source,
    previewElement: preview,
    pointerPosition: { clientX: 1, clientY: 2 },
    rafId: 91,
    startSceneId: 'scene-a',
    generation: 4,
    saving: true,
    pointerDown: { pointerId: 1 },
    mode2D: false,
    listenersAttached: true
  };
  const cancelledFrames = [];
  let detached = 0;
  const context = {
    hotspotMoveState: state,
    isMovingHotspot: true,
    movingHotspotTarget: state.target,
    cancelAnimationFrame(id) { cancelledFrames.push(id); },
    detachHotspotMoveListeners() { detached += 1; }
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'cleanupHotspotMovePreview'), context);

  context.cleanupHotspotMovePreview();

  assert.deepEqual(cancelledFrames, [91]);
  assert.deepEqual(removed, [preview]);
  assert.equal(sourceClasses.has('hs-marker-moving-source'), false);
  assert.equal(detached, 1);
  assert.equal(state.active, false);
  assert.equal(state.target, null);
  assert.equal(state.previewElement, null);
  assert.equal(state.rafId, null);
  assert.equal(state.saving, false);
  assert.equal(context.isMovingHotspot, false);
  assert.equal(context.movingHotspotTarget, null);
});

test('pointer handlers distinguish panorama drags from simple clicks and use pointercancel cleanup', () => {
  const pointerUp = getFunctionSource(app, 'onHotspotMovePointerUp');
  const pointerCancel = getFunctionSource(app, 'onHotspotMovePointerCancel');
  const attach = getFunctionSource(app, 'attachHotspotMoveListeners');
  const detach = getFunctionSource(app, 'detachHotspotMoveListeners');

  assert.match(pointerUp, /isHotspotMovePointerDrag\(/);
  assert.match(pointerUp, /commitHotspotMove\(/);
  assert.match(pointerUp, /suppressHotspotMoveFollowupClick\(/);
  assert.match(pointerCancel, /cancelHotspotMove\(/);
  for (const eventName of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    assert.match(attach, new RegExp(`addEventListener\\('${eventName}'`));
    assert.match(detach, new RegExp(`removeEventListener\\('${eventName}'`));
  }
});

test('move commit uses live 360/2D conversion, tokenized updateHotspot, and generation guards', () => {
  const commit = getFunctionSource(app, 'commitHotspotMove');
  const currentRequest = getFunctionSource(app, 'isCurrentHotspotMoveRequest');

  assert.match(commit, /get2DHotspotCoordinates\(/);
  assert.match(commit, /viewer\.mouseEventToCoords\(evt\)/);
  assert.match(commit, /buildHotspotMoveSaveData\(/);
  assert.match(commit, /hotspotMoveState\.mode2D\s*\?\s*'2D'\s*:\s*'360'/);
  assert.match(commit, /hotspotMoveState\.saving\s*=\s*true/);
  assert.match(commit, /isCurrentHotspotMoveRequest\(/);
  assert.match(commit, /\.updateHotspot\(withEditToken\(saveData\),\s*target\.id\)/);
  assert.match(commit, /target\.pitch\s*=\s*coordinates\.pitch/);
  assert.match(commit, /target\.yaw\s*=\s*coordinates\.yaw/);
  assert.match(commit, /cancelHotspotMove\(/);
  assert.match(currentRequest, /generation/);
  assert.match(currentRequest, /startSceneId/);
  assert.match(currentRequest, /currentFileId/);
});

test('Escape, scene changes, edit exit, modals, list refresh, and popup opening share cancellation', () => {
  for (const functionName of [
    'onGlobalKeyDown',
    'loadScene',
    'toggleMode',
    'openSceneSettingsModal',
    'openSceneProperties',
    'openUploadModal',
    'openShareModal',
    'refreshSceneList',
    'openPopup'
  ]) {
    assert.match(getFunctionSource(app, functionName), /cancelHotspotMove\(/, `${functionName} should cancel hotspot movement`);
  }
});

test('2D click and 360 click both delegate active moves instead of opening an add popup', () => {
  const flatClick = getFunctionSource(app, 'onFlatMapClick');
  const panoramaClick = getFunctionSource(app, 'onPanoramaClick');
  assert.match(flatClick, /isMovingHotspot[\s\S]*commitHotspotMove\(evt\)[\s\S]*return/);
  assert.match(panoramaClick, /isMovingHotspot[\s\S]*commitHotspotMove\(evt\)[\s\S]*return/);
});

test('jump mode hides and disables labels, preserves existing values, and requires a destination', () => {
  const saveClick = getFunctionSource(app, 'onSaveClick');
  const popupMode = getFunctionSource(app, 'setPopupMode');
  const selectType = getFunctionSource(app, 'selectHotspotType');
  const openPopup = getFunctionSource(app, 'openPopup');
  assert.match(index, /id="input-label-label"/);
  assert.match(index, /id="input-label-group"/);
  assert.match(index, /閲覧時にはジャンプ先のシーン名が表示されます/);
  assert.match(popupMode, /labelGroup\.style\.display\s*=\s*mode\s*===\s*'jump'\s*\?\s*'none'/);
  assert.match(popupMode, /labelInput\.disabled\s*=\s*mode\s*===\s*'jump'/);
  assert.doesNotMatch(popupMode, /labelInput\.value\s*=/);
  assert.match(selectType, /type\s*===\s*'jump'\s*&&\s*!editingHotspot/);
  assert.match(openPopup, /input-label[^\n]*\.value\s*=\s*editArgs\.label\s*\|\|\s*''/);
  assert.match(openPopup, /input-label[^\n]*\.value\s*=\s*''/);
  assert.match(saveClick, /currentPopupMode\s*===\s*'jump'\s*&&\s*!jumpSceneId/);
  assert.match(saveClick, /currentPopupMode\s*!==\s*'jump'\s*&&\s*!label/);
});

test('selecting jump clears a new draft label but preserves an existing edit value', () => {
  const labelInput = { value: 'hidden stale label' };
  const markerIcon = { value: 'info' };
  const context = {
    editingHotspot: null,
    DEFAULT_MARKER_ICON: 'info',
    document: {
      getElementById(id) {
        if (id === 'input-label') return labelInput;
        if (id === 'marker-icon') return markerIcon;
        throw new Error(`unexpected id: ${id}`);
      }
    },
    setPopupMode() {},
    normalizeMarkerIcon(value) { return value; },
    syncMarkerStyleSummaryFromInputs() {},
    setQuizDescMode() {}
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'selectHotspotType'), context);

  context.selectHotspotType('jump');
  assert.equal(labelInput.value, '');

  labelInput.value = 'saved existing label';
  context.editingHotspot = { id: 'existing-jump' };
  context.selectHotspotType('jump');
  assert.equal(labelInput.value, 'saved existing label');
});

test('jump tooltips use the latest extensionless scene name then saved label and id fallbacks', () => {
  const buildMarker = getFunctionSource(app, 'buildMarkerElement');
  const render2D = getFunctionSource(app, 'render2DHotspots');
  const showTooltip = getFunctionSource(app, 'showJumpTooltip');
  const displayName = getFunctionSource(app, 'getSceneDisplayName');
  const jumpDisplayName = getFunctionSource(app, 'getJumpSceneDisplayName');

  assert.match(buildMarker, /showJumpTooltip\(container,\s*args\.jumpSceneId,\s*args\.label\)/);
  assert.match(render2D, /showJumpTooltip\(marker,\s*hs\.jumpSceneId,\s*hs\.label\)/);
  assert.match(showTooltip, /getJumpSceneDisplayName\(jumpSceneId,\s*savedLabel\)/);

  const scenes = new Map([
    ['target', { id: 'target', name: '校内.体育館.PNG' }]
  ]);
  const context = {
    getSceneImageById(id) { return scenes.get(id) || null; }
  };
  vm.createContext(context);
  vm.runInContext(`${displayName}\n${jumpDisplayName}`, context);
  assert.equal(context.getJumpSceneDisplayName('target', '古い保存名'), '校内.体育館');
  assert.equal(context.getJumpSceneDisplayName('missing', '保存済みラベル'), '保存済みラベル');
  assert.equal(context.getJumpSceneDisplayName('missing', ''), 'missing');
});

test('Japanese and English documentation list the twelve selectable icons and legacy compatibility', () => {
  assert.match(readmeJa, /circle\/square\/diamond（旧 `star` は読込時に `circle`/);
  assert.match(readmeJa, /blue\/cyan\/teal\/green\/lime\/yellow\/orange\/red\/pink\/purple\/gray\/white/);
  assert.match(readmeJa, /info\/photo\/link\/wifi\/quiz\/eye\/warning\/flag\/animal\/leaf\/flower\/historic/);
  assert.match(readmeJa, /video.*audio.*旧|旧.*video.*audio/);
  assert.match(readmeJa, /シートを自動更新しません/);
  assert.match(readmeJa, /仮マーカー[\s\S]*カーソルまたはタッチ位置/);
  assert.match(readmeJa, /動画・音声の再生機能は追加されません/);
  assert.match(readmeJa, /「設定の変更」[^\n]*名前・種別・北方向補正/);
  assert.match(readmeJa, /画像拡張子[^\n]*表示し/);
  assert.doesNotMatch(readmeJa, /「名前を変更」/);
  assert.match(readmeJa, /ジャンプモード[^\n]*ラベル欄[^\n]*無効/);

  assert.match(readmeEn, /circle \/ square \/ diamond \(legacy `star` values are read as `circle`/);
  assert.match(readmeEn, /blue \/ cyan \/ teal \/ green \/ lime \/ yellow \/ orange \/ red \/ pink \/ purple \/ gray \/ white/);
  assert.match(readmeEn, /info \/ photo \/ link \/ wifi \/ quiz \/ eye \/ warning \/ flag \/ animal \/ leaf \/ flower \/ historic/);
  assert.match(readmeEn, /video.*audio.*legacy|legacy.*video.*audio/i);
  assert.match(readmeEn, /does not rewrite the sheet automatically/);
  assert.match(readmeEn, /preview marker[\s\S]*pointer or touch position/);
  assert.match(readmeEn, /Change settings[^\n]*name, type, and north correction/i);
  assert.match(readmeEn, /image extensions[^\n]*hidden/i);
  assert.doesNotMatch(readmeEn, /right-click an image[^\n]*"Rename"/i);
  assert.match(readmeEn, /jump mode[^\n]*label field[^\n]*disabled/i);
});

test('a submitted move cannot be cancelled or replaced while its server save is pending', () => {
  const state = {
    active: true,
    saving: true,
    previewElement: { parentNode: {} },
    generation: 7
  };
  let cleaned = 0;
  const toasts = [];
  const context = {
    hotspotMoveState: state,
    cleanupHotspotMovePreview() { cleaned += 1; state.active = false; },
    showToast(message, type) { toasts.push([message, type]); }
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'cancelHotspotMove'), context);

  const cancelled = context.cancelHotspotMove('移動をキャンセルしました。', { type: 'error' });

  assert.equal(cancelled, false);
  assert.equal(state.active, true);
  assert.equal(state.generation, 7);
  assert.equal(cleaned, 0);
  assert.match(toasts[0][0], /保存中|完了まで/);

  const startBody = getFunctionSource(app, 'startHotspotMovePreview');
  assert.match(startBody, /hotspotMoveState\.saving[\s\S]*return false/);
});

test('non-quiz type selection clears a restored quiz icon before saving normal information', () => {
  const markerIcon = { value: 'quiz' };
  const quizModes = [];
  let summaries = 0;
  const context = {
    document: {
      getElementById(id) {
        if (id === 'marker-icon') return markerIcon;
        if (id === 'quiz-input-question' || id === 'quiz-input-answer') return { value: '' };
        if (id === 'popup-header-title') return { textContent: '' };
        throw new Error(`unexpected id: ${id}`);
      }
    },
    normalizeMarkerIcon(value) { return value; },
    DEFAULT_MARKER_ICON: 'info',
    setPopupMode() {},
    setQuizDescMode(value) { quizModes.push(value); },
    syncMarkerStyleSummaryFromInputs() { summaries += 1; }
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'selectHotspotType'), context);

  context.selectHotspotType('info');

  assert.equal(markerIcon.value, 'info');
  assert.equal(quizModes.at(-1), false);
  assert.equal(summaries, 1);
});

test('move preview re-renders on scroll and resize and removes both listeners during cleanup', () => {
  const attach = getFunctionSource(app, 'attachHotspotMoveListeners');
  const detach = getFunctionSource(app, 'detachHotspotMoveListeners');

  assert.match(attach, /window\.addEventListener\(['"]resize['"],\s*scheduleHotspotMovePreviewRender/);
  assert.match(attach, /window\.addEventListener\(['"]scroll['"],\s*scheduleHotspotMovePreviewRender,\s*true\)/);
  assert.match(detach, /window\.removeEventListener\(['"]resize['"],\s*scheduleHotspotMovePreviewRender/);
  assert.match(detach, /window\.removeEventListener\(['"]scroll['"],\s*scheduleHotspotMovePreviewRender,\s*true\)/);
});

test('ordinary save, edit, and delete callbacks are guarded by scene identity and tracked independently', () => {
  const createRequest = getFunctionSource(app, 'createHotspotMutationRequest');
  const currentRequest = getFunctionSource(app, 'isCurrentHotspotMutationRequest');
  const save = getFunctionSource(app, 'onSaveClick');
  const remove = getFunctionSource(app, 'onHotspotDeleteClick');

  assert.match(createRequest, /sceneLoadGeneration/);
  assert.match(currentRequest, /sceneLoadGeneration/);
  assert.match(currentRequest, /currentFileId/);
  assert.doesNotMatch(currentRequest, /request\.generation\s*===\s*hotspotMutationGeneration/);
  assert.match(save, /createHotspotMutationRequest\(/);
  assert.match(save, /finishHotspotMutationRequest\(/);
  assert.match(save, /isCurrentHotspotMutationRequest\(/);
  assert.match(save, /sceneType:\s*hotspotFormSessionState\.sceneType/);
  assert.match(remove, /createHotspotMutationRequest\(/);
  assert.match(remove, /finishHotspotMutationRequest\(/);
  assert.match(remove, /isCurrentHotspotMutationRequest\(/);
});

test('independent hotspot mutations in the same scene remain current together', () => {
  const context = {
    hotspotMutationGeneration: 0,
    pendingHotspotMutationRequests: {},
    sceneLoadGeneration: 8,
    currentFileId: 'scene-a'
  };
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'createHotspotMutationRequest'),
    getFunctionSource(app, 'isCurrentHotspotMutationRequest')
  ].join('\n'), context);

  const first = context.createHotspotMutationRequest('scene-a', 'delete', 'marker-a');
  const second = context.createHotspotMutationRequest('scene-a', 'delete', 'marker-b');

  assert.equal(context.isCurrentHotspotMutationRequest(first), true);
  assert.equal(context.isCurrentHotspotMutationRequest(second), true);
});

test('a pending ordinary mutation blocks moving the same marker until its callback finishes', () => {
  const context = {
    pendingHotspotMutationRequests: {
      1: { id: 1, targetId: 'marker-a' },
      2: { id: 2, targetId: 'marker-b' }
    }
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'hasPendingHotspotMutationForTarget'), context);

  assert.equal(context.hasPendingHotspotMutationForTarget('marker-a'), true);
  assert.equal(context.hasPendingHotspotMutationForTarget('marker-c'), false);
  assert.match(getFunctionSource(app, 'startHotspotMovePreview'), /hasPendingHotspotMutationForTarget\(/);
});

test('normal edit, delete, and popup actions are refused while a move save is pending', () => {
  const toasts = [];
  const context = {
    hotspotMoveState: { active: true, saving: true },
    showToast(message, type) { toasts.push([message, type]); }
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'canStartHotspotMutation'), context);

  assert.equal(context.canStartHotspotMutation(), false);
  assert.match(toasts[0][0], /移動.*保存中|完了まで/);

  const edit = getFunctionSource(app, 'onHotspotEditClick');
  const remove = getFunctionSource(app, 'onHotspotDeleteClick');
  const popup = getFunctionSource(app, 'openPopup');
  const save = getFunctionSource(app, 'onSaveClick');
  assert.match(edit, /canStartHotspotMutation\(/);
  assert.match(remove, /canStartHotspotMutation\(/);
  assert.match(popup, /canStartHotspotMutation\(/);
  assert.match(save, /canStartHotspotMutation\(/);
});

test('openPopup stops before touching form state when an active move cannot be cancelled', () => {
  let documentReads = 0;
  const context = {
    canEdit: true,
    canStartHotspotMutation() { return true; },
    hotspotMoveState: { active: true },
    cancelHotspotMove() { return false; },
    document: {
      getElementById() {
        documentReads += 1;
        throw new Error('form state must not be touched');
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'openPopup'), context);

  assert.equal(context.openPopup(10, 20, { id: 'marker-a' }), false);
  assert.equal(documentReads, 0);
});

test('scene switching is refused while a move save is pending', () => {
  const toasts = [];
  const context = {
    hotspotMoveState: { active: true, saving: true },
    showToast(message, type) { toasts.push([message, type]); }
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'loadScene'), context);

  const result = context.loadScene({ id: 'scene-b' });

  assert.equal(result, false);
  assert.match(toasts[0][0], /移動.*保存中|完了まで/);
});

test('scene settings do not open when an in-flight hotspot move cannot be cancelled', () => {
  let documentReads = 0;
  let cancelCalls = 0;
  const context = {
    canEdit: true,
    isEditMode: true,
    hotspotMoveState: { active: true, previewElement: {} },
    hasPendingHotspotMutationForScene() { return false; },
    cancelHotspotMove() {
      cancelCalls += 1;
      return false;
    },
    document: {
      getElementById() {
        documentReads += 1;
        throw new Error('settings UI should not be read');
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'openSceneSettingsModal'), context);

  assert.doesNotThrow(() => context.openSceneSettingsModal({ id: 'scene-a' }));
  assert.equal(cancelCalls, 1);
  assert.equal(documentReads, 0);
});

test('scene settings do not open while the same scene has a pending hotspot CRUD request', () => {
  let documentReads = 0;
  let cancelCalls = 0;
  const toasts = [];
  const context = {
    canEdit: true,
    isEditMode: true,
    pendingHotspotMutationRequests: {
      1: { id: 1, fileId: 'scene-a', operation: 'create', targetId: '' },
      2: { id: 2, fileId: 'scene-b', operation: 'delete', targetId: 'marker-b' }
    },
    hotspotMoveState: { active: false, previewElement: null },
    cancelHotspotMove() {
      cancelCalls += 1;
      return true;
    },
    showToast(message, type) { toasts.push([message, type]); },
    document: {
      getElementById() {
        documentReads += 1;
        throw new Error('settings UI should not be read');
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'hasPendingHotspotMutationForScene'),
    getFunctionSource(app, 'openSceneSettingsModal')
  ].join('\n'), context);

  assert.doesNotThrow(() => context.openSceneSettingsModal({ id: 'scene-a' }));
  assert.equal(cancelCalls, 0);
  assert.equal(documentReads, 0);
  assert.match(toasts[0][0], /ホットスポット.*処理中|完了まで/);
});

test('closing the hotspot popup always restores its save control state', () => {
  const popup = { classList: { remove() {} }, style: {} };
  const button = {
    disabled: true,
    classList: {
      removed: [],
      remove(name) { this.removed.push(name); }
    }
  };
  const label = { textContent: '保存中...' };
  const title = { textContent: '' };
  const context = {
    hotspotSaveUiRequestId: 12,
    pendingPitch: 1,
    pendingYaw: 2,
    editingHotspot: { id: 'marker-a' },
    currentPopupMode: 'info',
    document: {
      getElementById(id) {
        if (id === 'hotspot-popup') return popup;
        if (id === 'btn-save') return button;
        if (id === 'save-label') return label;
        if (id === 'popup-header-title') return title;
        throw new Error(`unexpected id: ${id}`);
      }
    }
  };
  vm.createContext(context);
  vm.runInContext([
    getFunctionSource(app, 'resetHotspotSaveUi'),
    getFunctionSource(app, 'closePopup')
  ].join('\n'), context);

  context.closePopup();

  assert.equal(button.disabled, false);
  assert.ok(button.classList.removed.includes('loading'));
  assert.equal(label.textContent, '保存する');
  assert.equal(context.hotspotSaveUiRequestId, 0);
});

test('an older save success cannot close a popup now owned by another request or draft', () => {
  const save = getFunctionSource(app, 'onSaveClick');

  assert.match(save, /var\s+ownsSaveUi\s*=\s*resetHotspotSaveUi\(mutationRequest/);
  assert.equal(
    (save.match(/if\s*\(ownsSaveUi\)\s*closePopup\(\)/g) || []).length,
    2,
    'both update and create success callbacks should close only their own popup'
  );
  assert.doesNotMatch(save, /resetHotspotSaveUi\(mutationRequest,[\s\S]{0,500}?\n\s*closePopup\(\)/);
});

test('deleting during an unsent move preview cancels and cleans the move before the delete request', () => {
  let cancelCalls = 0;
  let deleteCalls = 0;
  const runner = {
    withSuccessHandler() { return this; },
    withFailureHandler() { return this; },
    deleteHotspot() { deleteCalls += 1; }
  };
  const context = {
    canEdit: true,
    suppressNextPanoramaClick: false,
    setTimeout() {},
    hotspotContextTarget: { id: 'marker-a' },
    closeHotspotContextMenu() {},
    canStartHotspotMutation() { return true; },
    hasPendingHotspotMutationForTarget() { return false; },
    hotspotMoveState: { active: true, saving: false },
    cancelHotspotMove() { cancelCalls += 1; return true; },
    currentFileId: 'scene-a',
    createHotspotMutationRequest(fileId) { return { id: 1, fileId }; },
    google: { script: { run: runner } },
    withEditToken(payload) { return payload; },
    showToast() {}
  };
  vm.createContext(context);
  vm.runInContext(getFunctionSource(app, 'onHotspotDeleteClick'), context);

  context.onHotspotDeleteClick();

  assert.equal(cancelCalls, 1);
  assert.equal(deleteCalls, 1);
});

test('move callbacks distinguish a pending request from whether its original scene is still visible', () => {
  const pendingRequest = getFunctionSource(app, 'isPendingHotspotMoveRequest');
  const commit = getFunctionSource(app, 'commitHotspotMove');

  assert.doesNotMatch(pendingRequest, /currentFileId/);
  assert.match(commit, /isPendingHotspotMoveRequest\(/);
  assert.match(commit, /isCurrentHotspotMoveRequest\([\s\S]*cleanupHotspotMovePreview\(\)/);
});
