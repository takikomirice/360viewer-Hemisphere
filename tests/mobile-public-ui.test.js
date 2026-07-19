const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const appPath = path.join(rootDir, 'app.html');
const stylesPath = path.join(rootDir, 'styles.html');
const readmePath = path.join(rootDir, 'README.md');

function readApp() {
  return fs.readFileSync(appPath, 'utf8');
}

function readStyles() {
  return fs.readFileSync(stylesPath, 'utf8');
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

test('client defines centralized public mobile viewing predicates', () => {
  const app = readApp();
  const publicBody = getFunctionBody(app, 'isPublicViewingMode');
  const smallBody = getFunctionBody(app, 'isSmallViewport');

  assert.match(publicBody, /appMode\s*===\s*'public'/);
  assert.match(publicBody, /appMode\s*===\s*'internal'/);
  assert.match(publicBody, /!canEdit/);
  assert.match(smallBody, /matchMedia/);
  assert.match(smallBody, /max-width:\s*700px/);
});

test('client applies body classes for public and mobile public view', () => {
  const app = readApp();
  const body = getFunctionBody(app, 'updateViewingModeClasses');

  assert.match(body, /classList\.toggle\('public-view'/);
  assert.match(body, /classList\.toggle\('mobile-view'/);
  assert.match(body, /classList\.toggle\('mobile-public-view'/);
  assert.match(app, /window\.addEventListener\('resize',\s*updateViewingModeClasses\)/);
});

test('mobile public scene list has bottom sheet control logic', () => {
  const app = readApp();
  const styles = readStyles();

  assert.match(app, /function toggleMobileSceneSheet\(/);
  assert.match(app, /function setMobileSceneSheetExpanded\(/);
  assert.match(app, /mobile-scene-sheet-expanded/);
  assert.match(styles, /body\.mobile-public-view[\s\S]*#scene-sidebar/);
  assert.match(styles, /#scene-sidebar\.mobile-expanded/);
  assert.match(styles, /#scene-sidebar-title/);
});

test('mobile public hotspot details use bottom sheet class and CSS', () => {
  const app = readApp();
  const styles = readStyles();
  const markerBody = getFunctionBody(app, 'onMarkerClick');

  assert.match(markerBody, /isPublicViewingMode\(\)\s*&&\s*isSmallViewport\(\)/);
  assert.match(markerBody, /mobile-info-sheet/);
  assert.match(styles, /body\.mobile-public-view[\s\S]*\.info-popup\.mobile-info-sheet/);
  assert.match(styles, /max-height:\s*min\(70dvh/);
});

test('mobile public viewing removes topbar offset and enlarges viewer controls', () => {
  const styles = readStyles();

  assert.match(styles, /body\[data-app-mode="public"\][\s\S]*--app-top-offset:\s*0px/);
  assert.match(styles, /body\[data-app-mode="internal"\][\s\S]*--app-top-offset:\s*0px/);
  assert.match(styles, /#loading[\s\S]*top:\s*var\(--app-top-offset\)/);
  assert.match(styles, /#scene-transition-overlay[\s\S]*top:\s*var\(--app-top-offset\)/);
  assert.match(styles, /body\.mobile-public-view\s+#panorama\.with-sidebar/);
  assert.match(styles, /body\.mobile-public-view\s+#flat-map-container\.with-sidebar/);
  assert.match(styles, /body\.mobile-public-view\s+#fullscreen-btn/);
  assert.match(styles, /width:\s*44px/);
  assert.match(styles, /height:\s*44px/);
});

test('mobile public gyro hint is shown once and scoped to public viewing', () => {
  const app = readApp();

  assert.match(app, /function maybeShowMobilePublicHint\(/);
  assert.match(app, /isPublicViewingMode\(\)/);
  assert.match(app, /isSmallViewport\(\)/);
  assert.match(app, /localStorage/);
  assert.match(app, /mobilePublicGyroHintShown/);
});

test('README documents mobile public viewing assumptions', () => {
  const readme = fs.readFileSync(readmePath, 'utf8');

  assert.match(readme, /スマホ閲覧/);
  assert.match(readme, /public閲覧モード/);
  assert.match(readme, /編集はPC推奨/);
  assert.match(readme, /QR形式/);
  assert.match(readme, /編集URLのQR化は想定していません/);
  assert.match(readme, /mode=public/);
});
