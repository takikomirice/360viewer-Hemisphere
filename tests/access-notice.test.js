const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const appPath = path.join(rootDir, 'app.html');
const indexPath = path.join(rootDir, 'index.html');

function readApp() {
  return fs.readFileSync(appPath, 'utf8');
}

function readIndex() {
  return fs.readFileSync(indexPath, 'utf8');
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

test('normal URL without edit token shows a small read-only notice', () => {
  const index = readIndex();
  const app = readApp();
  const body = getFunctionBody(app, 'updateAccessNotice');

  assert.match(index, /id="view-only-notice"/);
  assert.match(index, /閲覧専用/);
  assert.match(body, /!appMode\s*&&\s*!canEdit/);
  assert.match(body, /view-only-notice/);
  assert.match(body, /classList\.toggle\('visible'/);
});

test('edit mode without edit token shows edit-key warning without exposing key value', () => {
  const index = readIndex();
  const app = readApp();
  const body = getFunctionBody(app, 'updateAccessNotice');

  assert.match(index, /id="edit-key-warning"/);
  assert.match(index, /EDIT_KEY/);
  assert.match(index, /configシートの EDIT_KEY/);
  assert.match(index, /URL の editKey/);
  assert.doesNotMatch(index, /スクリプト プロパティ EDIT_KEY/);
  assert.doesNotMatch(index, /YOUR_EDIT_KEY|class-key|SECRET/);
  assert.match(body, /appMode\s*===\s*'edit'\s*&&\s*!canEdit/);
  assert.match(body, /edit-key-warning/);
});

test('access notices are not shown for public, internal, or valid edit view', () => {
  const app = readApp();
  const body = getFunctionBody(app, 'updateAccessNotice');

  assert.match(body, /appMode\s*!==\s*'public'/);
  assert.match(body, /appMode\s*!==\s*'internal'/);
  assert.match(body, /!canEdit/);
  assert.match(app, /updateAccessNotice\(\)/);
});
