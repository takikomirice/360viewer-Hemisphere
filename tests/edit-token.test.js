const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const codePath = path.join(rootDir, 'Code.js');
const appPath = path.join(rootDir, 'app.html');
const readmePath = path.join(rootDir, 'README.md');

function createConfigSheet(configValues = {}) {
  const rows = [
    ['設定項目', '値', '説明'],
    ...Object.entries(configValues).map(([key, value]) => [key, value, ''])
  ];

  function makeRange(row, col, numRows = 1, numCols = 1) {
    return {
      getValues() {
        return rows.slice(row - 1, row - 1 + numRows)
          .map((sourceRow) => sourceRow.slice(col - 1, col - 1 + numCols));
      },
      setValue(value) {
        while (rows.length < row) rows.push([]);
        rows[row - 1][col - 1] = value;
        return this;
      },
      setValues(values) {
        values.forEach((sourceRow, rowOffset) => {
          const targetRowIndex = row - 1 + rowOffset;
          while (rows.length <= targetRowIndex) rows.push([]);
          sourceRow.forEach((value, colOffset) => {
            rows[targetRowIndex][col - 1 + colOffset] = value;
          });
        });
        return this;
      },
      setFontWeight() { return this; },
      setBackground() { return this; }
    };
  }

  return {
    __rows: rows,
    getLastRow() {
      return rows.length;
    },
    getRange(row, col, numRows, numCols) {
      return makeRange(row, col, numRows, numCols);
    },
    appendRow(row) {
      rows.push(row);
    },
    setColumnWidth() {},
    setFrozenRows() {}
  };
}

function loadCode(cacheValues = {}, scriptProperties = {}, configValues = {}, scriptUrl = 'https://script.google.com/macros/s/xxxxx/exec') {
  const code = fs.readFileSync(codePath, 'utf8');
  const configSheet = createConfigSheet(configValues);
  const context = {
    console,
    __cacheValues: cacheValues,
    __cachePuts: [],
    __uuidCalls: 0,
    __createdTemplate: null,
    __configSheet: configSheet,
    __menuItems: [],
    __alerts: [],
    CacheService: {
      getScriptCache() {
        return {
          put(key, value, ttlSeconds) {
            context.__cachePuts.push({ key, value, ttlSeconds });
            context.__cacheValues[key] = value;
          },
          get(key) {
            return context.__cacheValues[key] || null;
          }
        };
      }
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput(content) {
        return {
          content,
          width: null,
          height: null,
          setWidth(width) {
            this.width = width;
            return this;
          },
          setHeight(height) {
            this.height = height;
            return this;
          }
        };
      },
      createTemplateFromFile(name) {
        const template = {
          name,
          evaluate() {
            context.__createdTemplate = this;
            return {
              setTitle(title) {
                this.title = title;
                return this;
              },
              setXFrameOptionsMode(mode) {
                this.xFrameOptionsMode = mode;
                return this;
              }
            };
          }
        };
        context.__createdTemplate = template;
        return template;
      }
    },
    LockService: {},
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return Object.prototype.hasOwnProperty.call(scriptProperties, key)
              ? scriptProperties[key]
              : null;
          },
          setProperty(key, value) {
            scriptProperties[key] = value;
          }
        };
      }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName(name) {
            return name === 'config' ? configSheet : null;
          },
          insertSheet(name) {
            return name === 'config' ? configSheet : createConfigSheet();
          }
        };
      },
      getUi() {
        const ui = {
          Button: { YES: 'YES', NO: 'NO', OK: 'OK' },
          ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
          createMenu() {
            return {
              addItem(label, functionName) {
                context.__menuItems.push({ label, functionName });
                return this;
              },
              addSeparator() {
                context.__menuItems.push({ separator: true });
                return this;
              },
              addToUi() {
                return this;
              }
            };
          },
          alert(...args) {
            context.__alerts.push(args);
            return ui.Button.YES;
          },
          showModalDialog(html, title) {
            context.__dialog = { html, title };
          }
        };
        return ui;
      }
    },
    ScriptApp: {
      getService() {
        return {
          getUrl() {
            return scriptUrl;
          }
        };
      }
    },
    Utilities: {
      getUuid() {
        context.__uuidCalls += 1;
        return 'uuid-123';
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'Code.js' });
  return context;
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

test('doGet does not issue an edit token for public view', () => {
  const context = loadCode();

  context.doGet({ parameter: { mode: 'public' } });

  assert.equal(context.__createdTemplate.editToken, '');
  assert.equal(context.__uuidCalls, 0);
  assert.deepEqual(context.__cachePuts, []);
});

test('doGet does not issue an edit token for internal view', () => {
  const context = loadCode();

  context.doGet({ parameter: { mode: 'internal' } });

  assert.equal(context.__createdTemplate.editToken, '');
  assert.equal(context.__uuidCalls, 0);
  assert.deepEqual(context.__cachePuts, []);
});

test('doGet does not issue an edit token when mode is omitted', () => {
  const context = loadCode();

  context.doGet({ parameter: {} });

  assert.equal(context.__createdTemplate.editToken, '');
  assert.equal(context.__uuidCalls, 0);
  assert.deepEqual(context.__cachePuts, []);
});

test('doGet does not issue an edit token for edit mode without editKey', () => {
  const context = loadCode({}, { EDIT_KEY: 'class-key' });

  context.doGet({ parameter: { mode: 'edit' } });

  assert.equal(context.__createdTemplate.editToken, '');
  assert.equal(context.__uuidCalls, 0);
  assert.deepEqual(context.__cachePuts, []);
});

test('doGet does not issue an edit token for edit mode with invalid editKey', () => {
  const context = loadCode({}, { EDIT_KEY: 'class-key' });

  context.doGet({ parameter: { mode: 'edit', editKey: 'wrong-key' } });

  assert.equal(context.__createdTemplate.editToken, '');
  assert.equal(context.__uuidCalls, 0);
  assert.deepEqual(context.__cachePuts, []);
});

test('doGet does not issue an edit token when EDIT_KEY is not configured', () => {
  const context = loadCode();

  context.doGet({ parameter: { mode: 'edit', editKey: 'class-key' } });

  assert.equal(context.__createdTemplate.editToken, '');
  assert.equal(context.__uuidCalls, 0);
  assert.deepEqual(context.__cachePuts, []);
});

test('doGet issues an edit token only for edit mode with the configured editKey', () => {
  const context = loadCode({}, { EDIT_KEY: 'class-key' });

  context.doGet({ parameter: { mode: 'edit', editKey: 'class-key' } });

  assert.equal(context.__createdTemplate.editToken, 'uuid-123');
  assert.equal(context.__uuidCalls, 1);
  assert.deepEqual(context.__cachePuts, [
    { key: 'EDIT_TOKEN_uuid-123', value: '1', ttlSeconds: 21600 }
  ]);
});

test('configured edit key prefers ScriptProperties over config sheet', () => {
  const context = loadCode({}, { EDIT_KEY: 'script-key' }, { EDIT_KEY: 'config-key' });

  assert.equal(typeof context.getConfiguredEditKey_, 'function');
  assert.equal(context.getConfiguredEditKey_(), 'script-key');
});

test('configured edit key falls back to config sheet EDIT_KEY', () => {
  const context = loadCode({}, {}, { EDIT_KEY: 'config-key' });

  assert.equal(context.getConfiguredEditKey_(), 'config-key');

  context.doGet({ parameter: { mode: 'edit', editKey: 'config-key' } });

  assert.equal(context.__createdTemplate.editToken, 'uuid-123');
  assert.equal(context.__uuidCalls, 1);
});

test('doGet reads edit key through getConfiguredEditKey_', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const body = getFunctionBody(code, 'doGet');

  assert.match(body, /getConfiguredEditKey_\(\)/);
  assert.doesNotMatch(body, /getScriptProperties\(\)\.getProperty\('EDIT_KEY'\)/);
});

test('setup flow prepares a generated config-sheet EDIT_KEY without overwriting existing keys', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const setupBody = getFunctionBody(code, 'setupSheets');
  const ensureBody = getFunctionBody(code, 'ensureEditKeyConfig_');
  const generateBody = getFunctionBody(code, 'generateEditKey_');

  assert.match(setupBody, /ensureEditKeyConfig_\(/);
  assert.match(ensureBody, /EDIT_KEY_CONFIG_KEY/);
  assert.match(ensureBody, /generateEditKey_\(/);
  assert.match(generateBody, /Utilities\.getUuid\(\)/);
  assert.match(generateBody, /replace\(/);
});

test('ensureEditKeyConfig_ preserves an existing config-sheet EDIT_KEY', () => {
  const context = loadCode({}, {}, { EDIT_KEY: 'existing-config-key' });

  const result = context.ensureEditKeyConfig_();

  assert.equal(result.key, 'existing-config-key');
  assert.equal(result.generated, false);
  assert.equal(context.__uuidCalls, 0);
  assert.equal(context.__configSheet.__rows[1][1], 'existing-config-key');
});

test('ensureEditKeyConfig_ generates a config-sheet EDIT_KEY when the row is empty', () => {
  const context = loadCode({}, {}, { EDIT_KEY: '' });

  const result = context.ensureEditKeyConfig_();

  assert.equal(result.key, 'ed_uuid123');
  assert.equal(result.generated, true);
  assert.equal(context.__uuidCalls, 1);
  assert.equal(context.__configSheet.__rows[1][1], 'ed_uuid123');
});

test('spreadsheet menu exposes edit URL display and edit key regeneration', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const onOpenBody = getFunctionBody(code, 'onOpen');
  const showBody = getFunctionBody(code, 'showEditUrl');
  const regenerateBody = getFunctionBody(code, 'regenerateEditKey');

  assert.match(onOpenBody, /編集URLを表示/);
  assert.match(onOpenBody, /showEditUrl/);
  assert.match(onOpenBody, /WebアプリURLを設定/);
  assert.match(onOpenBody, /setWebAppUrl/);
  assert.match(onOpenBody, /編集キーを再生成/);
  assert.match(onOpenBody, /regenerateEditKey/);
  assert.match(showBody, /getConfiguredWebAppUrl_\(\)/);
  assert.match(showBody, /mode=edit/);
  assert.match(showBody, /encodeURIComponent\(/);
  assert.match(showBody, /showModalDialog|alert/);
  assert.match(regenerateBody, /ButtonSet\.YES_NO/);
  assert.match(regenerateBody, /generateEditKey_\(/);
  assert.match(regenerateBody, /setConfigValue_\(/);
});

test('configured web app URL prefers config sheet and normalizes query, hash, and trailing slash', () => {
  const context = loadCode({}, {}, {
    WEB_APP_URL: '  https://script.google.com/a/macros/e.osakamanabi.jp/s/deploy-id/exec?mode=edit#x  '
  });

  assert.equal(typeof context.getConfiguredWebAppUrl_, 'function');
  assert.equal(
    context.getConfiguredWebAppUrl_(),
    'https://script.google.com/a/macros/e.osakamanabi.jp/s/deploy-id/exec'
  );
});

test('configured web app URL falls back to normalized ScriptApp URL only when config is absent', () => {
  const context = loadCode(
    {},
    {},
    {},
    'https://script.google.com/a/e.osakamanabi.jp/macros/s/fallback-id/exec?foo=bar'
  );

  assert.equal(
    context.getConfiguredWebAppUrl_(),
    'https://script.google.com/a/macros/e.osakamanabi.jp/s/fallback-id/exec'
  );
});

test('config setup prepares a WEB_APP_URL row without overwriting existing values', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const initBody = getFunctionBody(code, 'initializeConfigSheet_');
  const setupBody = getFunctionBody(code, 'setupSheets');

  assert.match(code, /const WEB_APP_URL_CONFIG_KEY\s*=\s*'WEB_APP_URL'/);
  assert.match(initBody, /WEB_APP_URL_CONFIG_KEY/);
  assert.match(setupBody, /ensureWebAppUrlConfig_\(/);

  const context = loadCode({}, {}, {
    WEB_APP_URL: 'https://example.test/exec'
  });
  context.ensureWebAppUrlConfig_();

  const webAppRows = context.__configSheet.__rows.filter((row) => row[0] === 'WEB_APP_URL');
  assert.equal(webAppRows.length, 1);
  assert.equal(webAppRows[0][1], 'https://example.test/exec');
});

test('showEditUrl uses WEB_APP_URL and warns when using fallback URL', () => {
  const configured = loadCode({}, {}, {
    EDIT_KEY: 'config-key',
    WEB_APP_URL: 'https://example.test/deploy/exec?old=1'
  });
  configured.showEditUrl();

  assert.match(configured.__dialog.html.content, /https:\/\/example\.test\/deploy\/exec\?mode=edit&amp;editKey=config-key/);
  assert.doesNotMatch(configured.__dialog.html.content, /WEB_APP_URL が未設定/);

  const fallback = loadCode({}, {}, { EDIT_KEY: 'config-key' });
  fallback.showEditUrl();

  assert.match(fallback.__dialog.html.content, /WEB_APP_URL が未設定/);
  assert.match(fallback.__dialog.html.content, /configシートの WEB_APP_URL/);
});

test('setWebAppUrl stores a normalized WEB_APP_URL from the spreadsheet menu prompt', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const body = getFunctionBody(code, 'setWebAppUrl');

  assert.match(body, /ui\.prompt\(/);
  assert.match(body, /normalizeWebAppUrl_\(/);
  assert.match(body, /setConfigValue_\(WEB_APP_URL_CONFIG_KEY/);
});

test('getConfig returns execUrl from getConfiguredWebAppUrl_', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const body = getFunctionBody(code, 'getConfig');

  assert.match(body, /getConfiguredWebAppUrl_\(\)/);
  assert.doesNotMatch(body, /ScriptApp\.getService\(\)\.getUrl\(\)/);
});

test('README documents config-sheet edit key workflow and token lifetime', () => {
  const readme = fs.readFileSync(readmePath, 'utf8');

  assert.match(readme, /config.*EDIT_KEY/s);
  assert.match(readme, /WEB_APP_URL/);
  assert.match(readme, /\/exec/);
  assert.match(readme, /ScriptApp\.getService\(\)\.getUrl\(\).*異なる場合/s);
  assert.match(readme, /編集URLを表示/);
  assert.match(readme, /編集キーを再生成/);
  assert.match(readme, /6時間/);
  assert.match(readme, /一時的な編集トークン/);
  assert.match(readme, /同じ編集URLを再読み込み/);
  assert.match(readme, /public URL、iframe、QR.*editKey.*含めない/s);
  assert.match(readme, /表示されたQRコードをスマホで読み取るか、\*\*「URLをコピー」\*\* ボタン/);
});

test('assertEditToken_ accepts only cached edit tokens', () => {
  const context = loadCode({ 'EDIT_TOKEN_valid-token': '1' });

  assert.doesNotThrow(() => context.assertEditToken_({ __editToken: 'valid-token' }));
  assert.throws(
    () => context.assertEditToken_({ __editToken: 'missing-token' }),
    /編集権限が確認できません/
  );
  assert.throws(
    () => context.assertEditToken_({}),
    /編集権限が確認できません/
  );
});

test('mutating server functions assert edit token before doing work', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const guardedFunctions = [
    'saveHotspot',
    'updateHotspot',
    'deleteHotspot',
    'uploadImageToDrive',
    'renameImageFile',
    'deleteImageFile',
    'createStudentSheet',
    'updateStudentSheetDropdowns',
    'bulkImportStudentSheet'
  ];

  for (const fnName of guardedFunctions) {
    const fnStart = code.indexOf(`function ${fnName}(`);
    assert.notEqual(fnStart, -1, `${fnName} should exist`);
    const bodyStart = code.indexOf('{', fnStart);
    const firstChunk = code.slice(bodyStart + 1, bodyStart + 180);
    assert.match(firstChunk, /assertEditToken_\(/, `${fnName} should assert edit token at the start`);
  }
});

test('client sends __editToken with mutating google.script.run calls', () => {
  const app = fs.readFileSync(appPath, 'utf8');

  assert.match(app, /var editToken\s*=/);
  assert.match(app, /function withEditToken\(/);

  const mutatingCalls = [
    'saveHotspot',
    'updateHotspot',
    'deleteHotspot',
    'uploadImageToDrive',
    'renameImageFile',
    'deleteImageFile',
    'updateStudentSheetDropdowns',
    'bulkImportStudentSheet'
  ];

  for (const call of mutatingCalls) {
    const pattern = new RegExp(`\\.${call}\\(\\s*withEditToken\\(`);
    assert.match(app, pattern, `${call} should receive a tokenized payload`);
  }
});

test('client defines canEdit from editToken', () => {
  const app = fs.readFileSync(appPath, 'utf8');

  assert.match(app, /var canEdit\s*=\s*!!editToken\s*;/);
});

test('toggleMode checks canEdit before entering edit mode', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  const fnStart = app.indexOf('function toggleMode(');
  assert.notEqual(fnStart, -1, 'toggleMode should exist');
  const bodyStart = app.indexOf('{', fnStart);
  const firstChunk = app.slice(bodyStart + 1, bodyStart + 240);

  assert.match(firstChunk, /canEdit/, 'toggleMode should guard editing with canEdit');
});
