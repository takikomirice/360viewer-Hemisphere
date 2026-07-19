const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(rootDir, 'styles.html'), 'utf8');
const app = fs.readFileSync(path.join(rootDir, 'app.html'), 'utf8');

function getFunctionBody(source, functionName) {
  const functionIndex = source.indexOf(`function ${functionName}(`);
  assert.notEqual(functionIndex, -1, `${functionName} should exist`);
  const braceIndex = source.indexOf('{', functionIndex);
  assert.notEqual(braceIndex, -1, `${functionName} should have a body`);

  let depth = 0;
  for (let index = braceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(braceIndex + 1, index);
  }

  throw new Error(`${functionName} body is not closed`);
}

function getButtonTag(id) {
  const match = index.match(new RegExp(`<button\\b[^>]*\\bid="${id}"[^>]*>`, 'i'));
  assert.ok(match, `${id} button should exist`);
  return match[0];
}

test('initial theme is resolved before the stylesheet is included', () => {
  const stylesIndex = index.indexOf('<?!= include("styles") ?>');
  const themeIndex = index.indexOf('data-theme');
  assert.notEqual(stylesIndex, -1, 'styles include should exist');
  assert.notEqual(themeIndex, -1, 'initial theme bootstrap should exist');
  assert.ok(themeIndex < stylesIndex, 'theme bootstrap should run before CSS');

  const bootstrap = index.slice(0, stylesIndex);
  assert.match(bootstrap, /hemisphereTheme/);
  assert.match(bootstrap, /localStorage\.getItem/);
  assert.match(bootstrap, /theme\s*===\s*['"]light['"]/);
  assert.match(bootstrap, /theme\s*===\s*['"]dark['"]/);
  assert.match(bootstrap, /matchMedia\(['"]\(prefers-color-scheme:\s*dark\)['"]\)/);
  assert.match(bootstrap, /document\.documentElement\.(?:dataset\.theme\s*=|setAttribute\(['"]data-theme['"])/);
  assert.doesNotMatch(bootstrap, /addEventListener\(\s*['"]change['"]/);
});

test('public and toolbar theme controls expose the same accessible action', () => {
  for (const id of ['toolbar-theme-toggle', 'floating-theme-toggle']) {
    const button = getButtonTag(id);
    assert.match(button, /\btype="button"/);
    assert.match(button, /\bclass="[^"]*theme-toggle/);
    assert.match(button, /\bonclick="toggleTheme\(\)"/);
    assert.match(button, /\baria-label="[^"]+"/);
    assert.match(button, /\btitle="[^"]+"/);
    assert.match(button, /\baria-pressed="(?:true|false)"/);
  }
});

test('one shared client theme state applies, persists, and synchronizes both controls', () => {
  const normalizeTheme = getFunctionBody(app, 'normalizeTheme');
  const applyTheme = getFunctionBody(app, 'applyTheme');
  const syncControls = getFunctionBody(app, 'syncThemeToggleButtons');
  const toggleTheme = getFunctionBody(app, 'toggleTheme');

  assert.match(normalizeTheme, /light/);
  assert.match(normalizeTheme, /dark/);
  assert.match(applyTheme, /document\.documentElement/);
  assert.match(applyTheme, /localStorage\.setItem/);
  assert.match(applyTheme, /try\s*\{/);
  assert.match(applyTheme, /syncThemeToggleButtons/);
  assert.match(syncControls, /toolbar-theme-toggle/);
  assert.match(syncControls, /floating-theme-toggle/);
  assert.match(syncControls, /aria-label/);
  assert.match(syncControls, /title/);
  assert.match(syncControls, /aria-pressed/);
  assert.match(toggleTheme, /applyTheme/);
});

test('theme CSS defines semantic dark surfaces and mutually exclusive controls', () => {
  assert.match(styles, /--theme-background\s*:/);
  assert.match(styles, /--theme-surface\s*:/);
  assert.match(styles, /--theme-text\s*:/);
  assert.match(styles, /--theme-border\s*:/);
  assert.match(styles, /--theme-focus-ring\s*:/);
  assert.match(styles, /html\[data-theme="dark"\]/);
  assert.match(styles, /color-scheme:\s*dark/);

  assert.match(styles, /#floating-theme-toggle\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(styles, /#floating-theme-toggle\s*\{[\s\S]*?min-width:\s*44px/);
  assert.match(styles, /#floating-theme-toggle\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(styles, /body\[data-app-mode="public"\][\s\S]*?#floating-theme-toggle/);
  assert.match(styles, /body\[data-app-mode="internal"\][\s\S]*?#floating-theme-toggle/);
  assert.match(styles, /body\[data-app-mode="public"\][\s\S]*?#toolbar-theme-toggle/);
  assert.match(styles, /body\[data-app-mode="internal"\][\s\S]*?#toolbar-theme-toggle/);
  assert.match(styles, /\.theme-toggle:focus-visible/);
});

test('dark theme selectors do not filter the panorama or 2D image', () => {
  assert.doesNotMatch(
    styles,
    /html\[data-theme="dark"\][^{]*(?:#panorama|#flat-map-container|#flat-map-img)[^{]*\{[^}]*\bfilter\s*:/
  );
});
