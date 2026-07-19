const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(rootDir, 'Code.js'), 'utf8');
const index = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(rootDir, 'styles.html'), 'utf8');
const app = fs.readFileSync(path.join(rootDir, 'app.html'), 'utf8');

function getBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `${marker} should exist`);
  const braceIndex = source.indexOf('{', markerIndex);
  assert.notEqual(braceIndex, -1, `${marker} should have a block`);
  let depth = 0;
  for (let index = braceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(braceIndex + 1, index);
  }
  throw new Error(`${marker} block is not closed`);
}

test('GAS seeds only a normalized initial mode into the HTML template', () => {
  const doGet = getBlock(code, 'function doGet(');

  assert.match(doGet, /template\.initialMode\s*=/);
  assert.match(doGet, /mode\s*===\s*'public'/);
  assert.match(doGet, /mode\s*===\s*'internal'/);
  assert.match(doGet, /mode\s*===\s*'edit'/);
  assert.match(index, /<body\s+data-app-mode="<\?!=\s*initialMode\s*\?>">/);
});

test('layout exposes one dynamic viewport and safe-area contract', () => {
  assert.match(styles, /--app-toolbar-height\s*:/);
  assert.match(styles, /--app-edit-banner-height\s*:/);
  assert.match(styles, /--app-top-offset\s*:/);
  assert.match(styles, /--app-viewport-height\s*:/);
  assert.match(styles, /100dvh/);
  assert.match(styles, /env\(safe-area-inset-top/);
  assert.match(styles, /env\(safe-area-inset-right/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
  assert.match(styles, /env\(safe-area-inset-left/);
});

test('360, 2D, sidebar, loading, transition, and expand controls share the top offset', () => {
  const panorama = getBlock(styles, '#panorama {');
  const flatMap = getBlock(styles, '#flat-map-container {');
  const sidebar = getBlock(styles, '#scene-sidebar {');
  const loading = getBlock(styles, '#loading {');
  const transition = getBlock(styles, '#scene-transition-overlay {');
  const expand = getBlock(styles, '#sidebar-expand-tab {');

  assert.match(panorama, /top:\s*var\(--app-top-offset\)/);
  assert.match(panorama, /height:\s*var\(--app-viewport-height\)/);
  assert.match(flatMap, /top:\s*var\(--app-top-offset\)/);
  assert.match(flatMap, /height:\s*var\(--app-viewport-height\)/);
  assert.match(sidebar, /top:\s*var\(--app-top-offset\)/);
  assert.match(sidebar, /height:\s*var\(--app-viewport-height\)/);
  assert.match(loading, /top:\s*var\(--app-top-offset\)/);
  assert.match(transition, /top:\s*var\(--app-top-offset\)/);
  assert.match(expand, /top:\s*calc\(var\(--app-top-offset\)\s*\+/);

  assert.doesNotMatch(styles, /#scene-sidebar\.with-banner\s*\{[^}]*top:\s*100px/);
  assert.doesNotMatch(styles, /#sidebar-expand-tab\.with-banner\s*\{[^}]*top:\s*110px/);
});

test('public and internal initial modes remove the topbar before client callbacks', () => {
  assert.match(styles, /body\[data-app-mode="public"\][\s\S]*--app-top-offset:\s*0px/);
  assert.match(styles, /body\[data-app-mode="internal"\][\s\S]*--app-top-offset:\s*0px/);
  assert.match(styles, /body\[data-app-mode="public"\][\s\S]*#topbar/);
  assert.match(styles, /body\[data-app-mode="internal"\][\s\S]*#topbar/);
  assert.doesNotMatch(app, /topbar\.style\.display\s*=\s*'none'/);
});

test('client measures toolbar and edit banner heights and tracks editing state', () => {
  const metrics = getBlock(app, 'function updateAppLayoutMetrics(');
  const visibleHeight = getBlock(app, 'function getVisibleAppLayoutHeight(');
  const toggleMode = getBlock(app, 'function toggleMode(');

  assert.match(visibleHeight, /getBoundingClientRect\(\)\.height/);
  assert.match(metrics, /--app-toolbar-height/);
  assert.match(metrics, /--app-edit-banner-height/);
  assert.match(app, /ResizeObserver/);
  assert.match(app, /window\.addEventListener\('resize',\s*scheduleAppLayoutMetrics\)/);
  assert.match(toggleMode, /classList\.toggle\('edit-mode-active'/);
});

test('narrow editing controls wrap and keep touch-sized interactive areas', () => {
  const topbar = getBlock(styles, '#topbar {');

  assert.match(topbar, /flex-wrap:\s*wrap/);
  assert.match(styles, /@media\s*\(max-width:\s*420px\)/);
  assert.match(styles, /@media\s*\(max-height:\s*420px\)/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /:focus-visible/);
  assert.match(index, /id="mode-toggle"[^>]+aria-label=/);
  assert.match(index, /id="bulk-input-trigger"[^>]+title=/);
});
