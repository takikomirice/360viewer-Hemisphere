const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const vendorRegion = {
  name: 'audio vendor bundle',
  startMarker: 'AUDIO_VENDOR_BUNDLE_START',
  endMarker: 'AUDIO_VENDOR_BUNDLE_END'
};

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

function extractMarkedScript(source, block) {
  assert.equal(countOccurrences(source, block.startMarker), 1, `${block.name} start marker must be unique`);
  assert.equal(countOccurrences(source, block.endMarker), 1, `${block.name} end marker must be unique`);
  const startAt = source.indexOf(block.startMarker);
  const endAt = source.indexOf(block.endMarker);
  assert.ok(startAt < endAt, `${block.name} markers must be ordered`);
  const marked = source.slice(startAt + block.startMarker.length, endAt);
  const match = marked.match(/^\r?\n<script>\r?\n([\s\S]*)<\/script>\r?\n$/);
  assert.ok(match, `${block.name} marker region must contain one directly wrapped script`);
  return Buffer.from(match[1], 'utf8');
}

function extractMarkedCss(source) {
  const startMarker = '/* HEMISPHERE_AUDIO_EDITOR_STYLES_START */';
  const endMarker = '/* HEMISPHERE_AUDIO_EDITOR_STYLES_END */';
  assert.equal(countOccurrences(source, startMarker), 1);
  assert.equal(countOccurrences(source, endMarker), 1);
  const startAt = source.indexOf(startMarker);
  const endAt = source.indexOf(endMarker);
  assert.ok(startAt < endAt);
  return source.slice(startAt + startMarker.length, endAt);
}

test('GAS client uses only the traditional three HTML files and two includes', () => {
  const htmlFiles = fs.readdirSync(root)
    .filter((name) => name.endsWith('.html'))
    .sort();
  assert.deepEqual(htmlFiles, ['app.html', 'index.html', 'styles.html']);

  const index = read('index.html');
  const includes = Array.from(index.matchAll(/include\(["']([^"']+)["']\)/g), (match) => match[1]);
  assert.deepEqual(includes, ['styles', 'app']);
  assert.match(index, /<dialog[^>]+id="hotspot-audio-editor-dialog"/);
  assert.match(index, /aria-labelledby="hotspot-audio-editor-title"/);
  assert.match(index, /data-hemisphere-audio-editor/);
  assert.match(index, /id="hotspot-audio-attach-result"/);
  assert.match(index, /data-hae-attach/);
  assert.match(index, /この音声を添付/);
  assert.match(index, /音声（任意・1件まで）/);
  assert.match(index, /生成したMP3をホットスポットへ添付する/);
  assert.doesNotMatch(index, /data-hae-download/);
  assert.doesNotMatch(index, /hae-modal-footer/);
  assert.doesNotMatch(index, /生成したMP3を保存する/);
});

test('audio editor styles are integrated, theme-aware, responsive, and globally scoped safely', () => {
  const styles = read('styles.html');
  const audioStyles = extractMarkedCss(styles);
  assert.match(audioStyles, /\.hemisphere-audio-editor-dialog/);
  assert.match(audioStyles, /html\[data-theme="dark"\][^{]*\.hemisphere-audio-editor-dialog/);
  assert.match(audioStyles, /@media\s*\(max-width:\s*700px\)/);

  for (const selector of [':root', 'body', '\\*', 'button', 'input', 'svg', '\\[hidden\\]', ':focus-visible']) {
    assert.doesNotMatch(
      audioStyles,
      new RegExp(`(^|[},]\\s*)${selector}(?=\\s|[,{:.#\\[])`, 'm'),
      `${selector} must not be introduced as a global audio-editor selector`
    );
  }
});

test('app embeds one deterministic tree-shaken Mediabunny 1.50.8 browser bundle', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.dependencies.mediabunny, '1.50.8');
  assert.equal(packageJson.dependencies['@mediabunny/mp3-encoder'], '1.50.8');
  assert.equal(packageJson.devDependencies.esbuild, '0.25.6');
  assert.equal(packageJson.scripts['vendor:sync'], 'node scripts/sync-audio-vendor.js');
  assert.equal(packageJson.scripts['vendor:check'], 'node scripts/sync-audio-vendor.js --check');

  const gitAttributes = read('.gitattributes');
  assert.match(gitAttributes, /^app\.html text eol=lf$/m);
  assert.match(gitAttributes, /^vendor\/mediabunny-LICENSE\.txt text eol=lf$/m);
  assert.match(gitAttributes, /^vendor\/mediabunny-mp3-encoder-LICENSE\.txt text eol=lf$/m);

  const syncVendor = require('../scripts/sync-audio-vendor');
  assert.equal(syncVendor.audioVendorEntrySource, [
    "import { canEncodeAudio, BufferTarget, Output, Mp3OutputFormat, AudioBufferSource } from 'mediabunny';",
    "import { registerMp3Encoder } from '@mediabunny/mp3-encoder';",
    'globalThis.Mediabunny = { canEncodeAudio, BufferTarget, Output, Mp3OutputFormat, AudioBufferSource };',
    'globalThis.MediabunnyMp3Encoder = { registerMp3Encoder };'
  ].join('\n'));

  const firstBuild = syncVendor.buildAudioVendorBundle();
  const secondBuild = syncVendor.buildAudioVendorBundle();
  assert.equal(secondBuild, firstBuild, 'repeated in-memory builds must be byte-identical');
  assert.doesNotMatch(firstBuild, /sourceMappingURL|\/\*!|@license/i);
  assert.ok(Buffer.byteLength(firstBuild, 'utf8') <= 400000, 'raw bundle must stay within 400000 bytes');
  assert.ok(zlib.gzipSync(firstBuild).length <= 160000, 'gzip bundle must stay within 160000 bytes');

  const browserGlobal = { console, TextDecoder, TextEncoder, URL, Blob, setTimeout, clearTimeout };
  vm.runInNewContext(firstBuild, browserGlobal, { filename: 'audio-vendor-bundle.js' });
  assert.deepEqual(
    Object.keys(browserGlobal.Mediabunny).sort(),
    ['AudioBufferSource', 'BufferTarget', 'Mp3OutputFormat', 'Output', 'canEncodeAudio']
  );
  assert.deepEqual(Object.keys(browserGlobal.MediabunnyMp3Encoder), ['registerMp3Encoder']);

  const app = read('app.html');
  const embedded = extractMarkedScript(app, vendorRegion).toString('utf8');
  assert.equal(embedded, firstBuild);
  assert.equal(countOccurrences(app, vendorRegion.startMarker), 1, 'only one start marker is allowed');
  assert.equal(countOccurrences(app, vendorRegion.endMarker), 1, 'only one end marker is allowed');
  assert.doesNotMatch(app, /<!--\s*AUDIO_VENDOR_BUNDLE_(?:START|END)\s*-->/);

  const order = [
    vendorRegion.startMarker,
    vendorRegion.endMarker,
    '<!-- HEMISPHERE_AUDIO_EDITOR_START -->',
    '<!-- HEMISPHERE_AUDIO_EDITOR_END -->',
    '//  状態変数'
  ];
  let previous = -1;
  order.forEach((marker) => {
    const at = app.indexOf(marker);
    assert.ok(at > previous, `${marker} must follow the previous dependency`);
    previous = at;
  });
});

test('vendor marker helpers change only payload bytes and reject unsafe or malformed regions', () => {
  const syncVendor = require('../scripts/sync-audio-vendor');
  assert.equal(typeof syncVendor.locateVendorRegion, 'function');
  assert.equal(typeof syncVendor.extractAppVendorSource, 'function');
  assert.equal(typeof syncVendor.updateAppVendorSource, 'function');

  const valid = [
    'prefix',
    vendorRegion.startMarker,
    '<script>',
    'old-source',
    '</script>',
    vendorRegion.endMarker,
    'suffix'
  ].join('\r\n');
  const expected = valid.replace('old-source\r\n', 'new-source\n');
  const updated = syncVendor.updateAppVendorSource(valid, 'new-source\n');
  assert.equal(updated, expected);
  assert.equal(syncVendor.extractAppVendorSource(updated), 'new-source\n');

  const malformed = [
    valid.replace(vendorRegion.startMarker, ''),
    valid.replace(vendorRegion.startMarker, `${vendorRegion.startMarker}\r\n${vendorRegion.startMarker}`),
    valid.replace(
      `${vendorRegion.startMarker}\r\n<script>\r\nold-source\r\n</script>\r\n${vendorRegion.endMarker}`,
      `${vendorRegion.endMarker}\r\n<script>\r\nold-source\r\n</script>\r\n${vendorRegion.startMarker}`
    ),
    valid.replace('<script>', '<script>\r\n</script>\r\n<script>')
  ];
  malformed.forEach((source) => assert.throws(
    () => syncVendor.updateAppVendorSource(source, 'new-source'),
    /marker|order|region/i
  ));
  assert.throws(
    () => syncVendor.updateAppVendorSource(valid, 'bad</script>source'),
    /script/i
  );
});

test('synchronizeVendorFiles owns the complete sync and check lifecycle inside a temp fixture', () => {
  const syncVendor = require('../scripts/sync-audio-vendor');
  const trackedPaths = [
    'app.html',
    'vendor/mediabunny-LICENSE.txt',
    'vendor/mediabunny-mp3-encoder-LICENSE.txt'
  ];
  const trackedBefore = new Map(trackedPaths.map((relativePath) => [
    relativePath,
    fs.readFileSync(path.join(root, relativePath))
  ]));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hemisphere-audio-vendor-'));
  const appPath = path.join(tempRoot, 'app.html');
  const destinationLicensePaths = [
    path.join(tempRoot, 'vendor', 'mediabunny-LICENSE.txt'),
    path.join(tempRoot, 'vendor', 'mediabunny-mp3-encoder-LICENSE.txt')
  ];
  const licenseSources = [
    [path.join(tempRoot, 'node_modules', 'mediabunny', 'LICENSE'), Buffer.from('mediabunny fixture license\n')],
    [path.join(tempRoot, 'node_modules', '@mediabunny', 'mp3-encoder', 'LICENSE'), Buffer.from('mp3 fixture license\n')]
  ];
  const fixtureApp = [
    'prefix',
    vendorRegion.startMarker,
    '<script>',
    'stale-source',
    '</script>',
    vendorRegion.endMarker,
    'suffix'
  ].join('\n');
  const bundleSource = 'globalThis.__audioVendorFixture = true;\n';
  const expectedApp = syncVendor.updateAppVendorSource(fixtureApp, bundleSource);
  let buildCalls = 0;
  const options = {
    rootDir: tempRoot,
    buildBundle() {
      buildCalls += 1;
      return bundleSource;
    }
  };

  try {
    fs.writeFileSync(appPath, fixtureApp, 'utf8');
    licenseSources.forEach(([sourcePath, bytes]) => {
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(sourcePath, bytes);
    });

    syncVendor.synchronizeVendorFiles(options);
    assert.equal(fs.readFileSync(appPath, 'utf8'), expectedApp);
    destinationLicensePaths.forEach((destinationPath, index) => {
      assert.equal(fs.readFileSync(destinationPath).equals(licenseSources[index][1]), true);
    });

    const unchangedTime = new Date('2001-01-01T00:00:00.000Z');
    [appPath, ...destinationLicensePaths].forEach((filePath) => {
      fs.utimesSync(filePath, unchangedTime, unchangedTime);
    });
    syncVendor.synchronizeVendorFiles(options);
    assert.equal(fs.readFileSync(appPath, 'utf8'), expectedApp);
    [appPath, ...destinationLicensePaths].forEach((filePath) => {
      assert.equal(fs.statSync(filePath).mtimeMs, unchangedTime.getTime(), `${filePath} must not be rewritten`);
    });

    assert.doesNotThrow(() => syncVendor.synchronizeVendorFiles({ ...options, check: true }));
    [appPath, ...destinationLicensePaths].forEach((filePath) => {
      assert.equal(fs.statSync(filePath).mtimeMs, unchangedTime.getTime(), `${filePath} must remain untouched by check`);
    });

    const staleApp = expectedApp.replace(bundleSource, 'stale-again\n');
    const staleTime = new Date('2002-02-02T00:00:00.000Z');
    fs.writeFileSync(appPath, staleApp, 'utf8');
    fs.utimesSync(appPath, staleTime, staleTime);
    assert.throws(
      () => syncVendor.synchronizeVendorFiles({ ...options, check: true }),
      /stale/i
    );
    assert.equal(fs.readFileSync(appPath, 'utf8'), staleApp);
    assert.equal(fs.statSync(appPath).mtimeMs, staleTime.getTime(), 'stale check must not rewrite app.html');
    assert.equal(buildCalls, 4);
  } finally {
    const resolvedTempRoot = path.resolve(tempRoot);
    const resolvedTempParent = path.resolve(os.tmpdir());
    assert.ok(resolvedTempRoot.startsWith(resolvedTempParent + path.sep));
    fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
    trackedBefore.forEach((bytes, relativePath) => {
      assert.equal(
        fs.readFileSync(path.join(root, relativePath)).equals(bytes),
        true,
        `${relativePath} must not be mutated by fixture tests`
      );
    });
  }
});

test('audio editor remains vanilla, preserves its public API, and keeps viewer audio lifecycle guards', () => {
  const app = read('app.html');
  const editorScript = extractMarkedScript(app, {
    name: 'audio editor',
    startMarker: '<!-- HEMISPHERE_AUDIO_EDITOR_START -->',
    endMarker: '<!-- HEMISPHERE_AUDIO_EDITOR_END -->'
  }).toString('utf8');
  assert.match(editorScript, /global\.HemisphereAudioEditor\s*=\s*\{/);
  for (const method of ['init', 'destroy', 'loadFile', 'encodeSelection', 'getResult', 'downloadResult', 'clearResult', 'setResultHandler']) {
    assert.match(editorScript, new RegExp(`\\b${method}: ${method}\\b`));
  }
  assert.doesNotMatch(editorScript, /data-hae-download/);
  assert.doesNotMatch(editorScript, /addListener\(elements\.download/);
  assert.doesNotMatch(editorScript, /React|Vue|ffmpeg/i);

  for (const name of [
    'hotspotAudioAttachmentState',
    'openHotspotAudioEditor',
    'closeHotspotAudioEditor',
    'attachHotspotAudioEditorResult',
    'disposeHotspotAudioAttachmentState',
    'buildHotspotAudioUpload',
    'closeActiveInfoPopup',
    'loadHotspotAudioForPopup',
    'getHotspotAudioCacheKey',
    'requestHotspotAudio',
    'prefetchHotspotAudio',
    'openHotspotFolderInDrive'
  ]) {
    assert.match(app, new RegExp(`\\b${name}\\b`));
  }
  assert.match(app, /audioUpload/);
  assert.match(app, /audioId/);
  assert.match(app, /getHotspotAudioData\(\{/);
  assert.match(app, /sceneLoadGeneration/);
  assert.match(app, /infoPopupGeneration/);
  assert.match(app, /popup\.isConnected/);
  assert.match(app, /hotspotAudioInFlight/);
  assert.match(app, /HOTSPOT_AUDIO_PREFETCH_DELAY_MS\s*=\s*(?:1[0-9]{2}|200)/);
  assert.match(app, /preload\s*=\s*['"]none['"]/);
  assert.doesNotMatch(app, /autoplay\s*=/);
  assert.doesNotMatch(app, /info-popup-audio-name/);
  const popupAudioBody = app.slice(
    app.indexOf('function loadHotspotAudioForPopup('),
    app.indexOf('/**', app.indexOf('function loadHotspotAudioForPopup('))
  );
  assert.doesNotMatch(popupAudioBody, /fileName/);
});

test('audio vendor loader is an authenticated retryable singleton with exact runtime validation', () => {
  const app = read('app.html');
  const loaderStart = app.indexOf('function loadAudioVendorBundle(');
  const openStart = app.indexOf('function openHotspotAudioEditor(');
  assert.ok(loaderStart >= 0, 'client must define an internal audio vendor loader');
  assert.ok(openStart > loaderStart, 'editor opening must use the loader defined earlier in app.html');

  const loader = app.slice(loaderStart, openStart);
  assert.match(app, /var audioVendorBundlePromise\s*=\s*null\s*;/);
  assert.match(loader, /\.getAudioVendorBundle\(withEditToken\(\{\}\)\)/);
  assert.match(loader, /result\.version\s*!==\s*['"]1\.50\.8['"]/);
  assert.match(loader, /typeof result\.source\s*!==\s*['"]string['"]/);
  assert.match(loader, /result\.source\.trim\(\)/);
  for (const api of [
    'canEncodeAudio',
    'BufferTarget',
    'Output',
    'Mp3OutputFormat',
    'AudioBufferSource',
    'registerMp3Encoder'
  ]) {
    assert.match(loader, new RegExp(`typeof [^\\n]+\\.${api}\\s*!==\\s*['"]function['"]`));
  }
  assert.match(loader, /audioVendorBundlePromise\s*=\s*null/);
  assert.doesNotMatch(loader, /fetch\s*\(|XMLHttpRequest|\.src\s*=/, 'production loader must not accept a URL transport');

  const open = app.slice(openStart, app.indexOf('function closeHotspotAudioEditor(', openStart));
  assert.match(open, /!canEdit\s*\|\|\s*!isEditMode/);
  assert.match(open, /isHotspotFormSessionActive\(\)/);
  assert.match(open, /currentPopupMode\s*!==\s*['"]info['"]/);
  assert.match(open, /loadAudioVendorBundle\(\)/);
});

test('public hotspot audio player hides the browser download control', () => {
  const app = read('app.html');
  const popupBody = app.slice(
    app.indexOf('function onMarkerClick('),
    app.indexOf('function closeActiveInfoPopup(')
  );

  assert.match(popupBody, /<audio controls controlsList="nodownload" preload="none"/);
});

test('browser harness reads only production index, styles, and app HTML', () => {
  const harness = read('tests/browser/harness-server.js');
  const htmlReads = Array.from(harness.matchAll(/readSource\('([^']+\.html)'\)/g), (match) => match[1]);
  assert.deepEqual(Array.from(new Set(htmlReads)), ['index.html', 'styles.html', 'app.html']);
  assert.doesNotMatch(harness, /audio-editor-(?:ui|styles|script)|vendor-mediabunny/);
});

test('browser harness strips the real audio vendor from initial HTML and serves it only on demand', () => {
  const harnessModule = require('./browser/harness-server');
  assert.equal(typeof harnessModule.renderPage, 'function');
  const rendered = harnessModule.renderPage('/?mode=edit&sceneType=2D&storageMode=single');
  const app = read('app.html');
  const vendorSource = extractMarkedScript(app, vendorRegion).toString('utf8');

  assert.doesNotMatch(rendered, /AUDIO_VENDOR_BUNDLE_(?:START|END)/);
  assert.equal(rendered.includes(vendorSource), false, 'initial HTML must not contain the vendor source');
  assert.doesNotMatch(rendered, /globalThis\.Mediabunny\s*=/);
  assert.match(rendered, /HEMISPHERE_AUDIO_EDITOR_START/);

  const harness = read('tests/browser/harness-server.js');
  assert.match(harness, /\/__audio-vendor-bundle/);
  assert.match(harness, /method\s*===\s*['"]getAudioVendorBundle['"]/);
});

test('server, schema, deployment filters, and README notices describe managed optional MP3 attachments', () => {
  const code = read('Code.js');
  assert.match(code, /'ID', '音声ID'/);
  assert.match(code, /const AUDIO_ID_COL_INDEX = INFO_COLUMN_INDEX\.audioId/);
  assert.match(code, /const HOTSPOT_AUDIO_FINAL_MAX_BYTES = 4 \* 1024 \* 1024/);
  assert.match(code, /function getHotspotAudioData\(/);
  assert.match(code, /HOTSPOT_FOLDER_ID_KEY\s*=\s*'HOTSPOT_FOLDER_ID'/);
  assert.match(code, /HOTSPOT_FOLDER_NAME\s*=\s*'Hemisphere Hotspot'/);
  assert.match(code, /HOTSPOT_PHOTO_FOLDER_NAME\s*=\s*'photos'/);
  assert.match(code, /HOTSPOT_AUDIO_FOLDER_NAME\s*=\s*'audio'/);
  assert.match(code, /function getHotspotFolderStructure_\(/);
  assert.match(code, /function getHotspotFolderUrlForEdit\(/);
  assert.match(code, /function getHotspotAudioFolderUrlForEdit\(/);
  assert.match(code, /function rollbackCreatedHotspotAudio_\(/);
  const audioDataBody = code.slice(
    code.indexOf('function getHotspotAudioData('),
    code.indexOf('\n/**', code.indexOf('function getHotspotAudioData('))
  );
  assert.doesNotMatch(audioDataBody, /fileName/);

  const claspIgnore = read('.claspignore');
  assert.match(claspIgnore, /!\*\.html/);
  assert.match(claspIgnore, /node_modules\/\*\*/);

  const notices = read('README.md');
  assert.match(notices, /Mediabunny 1\.50\.8/);
  assert.match(notices, /Mediabunny MP3 Encoder 1\.50\.8/);
  assert.match(notices, /LAME 3\.100/);
  assert.match(notices, /LGPL/);
});
