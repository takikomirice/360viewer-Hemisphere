const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const codePath = path.join(rootDir, 'Code.js');
const appPath = path.join(rootDir, 'app.html');
const indexPath = path.join(rootDir, 'index.html');
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
      getFormulas() {
        return this.getValues().map((sourceRow) => sourceRow.map((value) =>
          typeof value === 'string' && value.startsWith('=') ? value : ''
        ));
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
      clearContent() {
        for (let rowOffset = 0; rowOffset < numRows; rowOffset++) {
          for (let colOffset = 0; colOffset < numCols; colOffset++) {
            const targetRowIndex = row - 1 + rowOffset;
            while (rows.length <= targetRowIndex) rows.push([]);
            rows[targetRowIndex][col - 1 + colOffset] = '';
          }
        }
        return this;
      },
      setFontWeight() { return this; },
      setBackground() { return this; }
    };
  }

  return {
    __rows: rows,
    getName() { return 'config'; },
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
  const activeSpreadsheet = {
    getId() {
      return 'container-spreadsheet-id';
    },
    getSheetByName(name) {
      return name === 'config' ? configSheet : null;
    },
    insertSheet(name) {
      return name === 'config' ? configSheet : createConfigSheet();
    },
    toast(message, title, timeoutSeconds) {
      context.__toasts.push({ message, title, timeoutSeconds });
    }
  };
  const context = {
    console,
    __cacheValues: cacheValues,
    __cachePuts: [],
    __uuidCalls: 0,
    __createdTemplate: null,
    __configSheet: configSheet,
    __scriptProperties: scriptProperties,
    __menuItems: [],
    __menuLabels: [],
    __alerts: [],
    __toasts: [],
    __dialog: null,
    __scriptUrlCalls: 0,
    __lockEvents: [],
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
    LockService: {
      getScriptLock() {
        let held = false;
        return {
          tryLock() {
            context.__lockEvents.push('acquire');
            held = true;
            return true;
          },
          releaseLock() {
            if (held) context.__lockEvents.push('release');
            held = false;
          }
        };
      }
    },
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
        return activeSpreadsheet;
      },
      getUi() {
        const ui = {
          Button: { YES: 'YES', NO: 'NO', OK: 'OK' },
          ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
          createMenu(label) {
            context.__menuLabels.push(label);
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
            context.__scriptUrlCalls += 1;
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
    { key: 'EDIT_TOKEN_uuid-123', value: 'edit-key:class-key', ttlSeconds: 21600 }
  ]);
});

test('configured edit key prefers config so generated edit URLs and authentication use the same key', () => {
  const context = loadCode({}, { EDIT_KEY: 'script-key' }, { EDIT_KEY: 'config-key' });

  assert.equal(typeof context.getConfiguredEditKey_, 'function');
  assert.equal(context.getConfiguredEditKey_(), 'config-key');

  context.doGet({ parameter: { mode: 'edit', editKey: 'config-key' } });

  assert.equal(context.__createdTemplate.editToken, 'uuid-123');
  assert.deepEqual(context.__cachePuts, [
    { key: 'EDIT_TOKEN_uuid-123', value: 'edit-key:config-key', ttlSeconds: 21600 }
  ]);
});

test('configured edit key falls back to the legacy ScriptProperty only when config is blank', () => {
  const context = loadCode({}, { EDIT_KEY: 'script-key' }, { EDIT_KEY: '' });

  assert.equal(context.getConfiguredEditKey_(), 'script-key');

  context.doGet({ parameter: { mode: 'edit', editKey: 'script-key' } });

  assert.equal(context.__createdTemplate.editToken, 'uuid-123');
  assert.equal(context.__uuidCalls, 1);
});

test('blank config migrates a legacy ScriptProperty key without changing the stored edit URL', () => {
  const legacyUrl = 'https://example.test/exec?mode=edit&editKey=legacy-script-key';
  const context = loadCode({}, { EDIT_KEY: 'legacy-script-key' }, {
    EDIT_KEY: '',
    EDIT_URL: legacyUrl
  });

  const result = context.ensureEditKeyConfig_();

  assert.equal(result.key, 'legacy-script-key');
  assert.equal(result.generated, false);
  assert.equal(result.migrated, true);
  assert.equal(context.__uuidCalls, 0);
  assert.equal(context.__configSheet.__rows[1][1], 'legacy-script-key');
  assert.equal(context.__configSheet.__rows[2][1], legacyUrl);
  assert.equal(context.getConfiguredEditKey_(), 'legacy-script-key');
});

test('a stored legacy edit URL remains accepted until explicit config URL regeneration', () => {
  const context = loadCode({}, { EDIT_KEY: 'legacy-script-key' }, {
    WEB_APP_URL: 'https://example.test/exec',
    EDIT_KEY: 'config-key',
    EDIT_URL: 'https://example.test/exec?mode=edit&editKey=legacy-script-key'
  });

  context.doGet({ parameter: { mode: 'edit', editKey: 'legacy-script-key' } });
  const legacyToken = context.__createdTemplate.editToken;
  assert.equal(legacyToken, 'uuid-123');
  assert.doesNotThrow(() => context.assertEditToken_({ __editToken: legacyToken }));

  const regenerated = context.generateOrUpdateEditUrlFromMenu();
  assert.equal(regenerated.success, true);
  assert.equal(
    context.__configSheet.__rows.find((row) => row[0] === 'EDIT_URL')[1],
    'https://example.test/exec?mode=edit&editKey=config-key'
  );
  assert.throws(
    () => context.assertEditToken_({ __editToken: legacyToken }),
    /編集権限/
  );

  context.doGet({ parameter: { mode: 'edit', editKey: 'legacy-script-key' } });
  assert.equal(context.__createdTemplate.editToken, '');
  context.doGet({ parameter: { mode: 'edit', editKey: 'config-key' } });
  assert.equal(context.__createdTemplate.editToken, 'uuid-123');
});

test('edit authentication fails closed when the config sheet cannot be read', () => {
  const context = loadCode(
    { 'EDIT_TOKEN_legacy-token': 'edit-key:revoked-legacy-key' },
    { EDIT_KEY: 'revoked-legacy-key' },
    {
      EDIT_KEY: 'current-config-key',
      EDIT_URL: 'https://example.test/exec?mode=edit&editKey=current-config-key'
    }
  );
  context.getAppConfig_ = () => {
    throw new Error('temporary config read failure');
  };

  assert.deepEqual(Array.from(context.getAcceptedEditKeys_()), []);

  context.doGet({ parameter: { mode: 'edit', editKey: 'revoked-legacy-key' } });
  assert.equal(context.__createdTemplate.editToken, '');
  assert.equal(context.__uuidCalls, 0);
  assert.throws(
    () => context.assertEditToken_({ __editToken: 'legacy-token' }),
    /編集権限/
  );
});

test('doGet reads edit keys through the bounded accepted-key resolver', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const body = getFunctionBody(code, 'doGet');

  assert.match(body, /getAcceptedEditKeys_\(\)/);
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
  const config = Object.fromEntries(
    context.__configSheet.__rows.slice(1).filter((row) => row[0]).map((row) => [row[0], row[1]])
  );
  assert.equal(config.EDIT_URL, undefined);
  assert.equal(context.__scriptUrlCalls, 0);
});

test('spreadsheet menu exposes explicit edit URL generation and removes legacy URL functions', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const onOpenBody = getFunctionBody(code, 'onOpen');
  const generateBody = getFunctionBody(code, 'generateOrUpdateEditUrlFromMenu');
  const regenerateBody = getFunctionBody(code, 'regenerateEditKey');

  assert.match(onOpenBody, /編集用URLを生成・更新/);
  assert.match(onOpenBody, /generateOrUpdateEditUrlFromMenu/);
  assert.match(onOpenBody, /編集キーを再生成/);
  assert.match(onOpenBody, /regenerateEditKey/);
  assert.doesNotMatch(code, /function showEditUrl\(/);
  assert.doesNotMatch(code, /function setWebAppUrl\(/);
  assert.match(generateBody, /refreshEditUrlConfig_\(/);
  assert.doesNotMatch(generateBody, /showModalDialog|\.prompt\(|\.alert\(/);
  assert.match(code, /function buildEditUrl_\([\s\S]*?mode=edit[\s\S]*?encodeURIComponent\(/);
  assert.match(regenerateBody, /ButtonSet\.YES_NO/);
  assert.match(regenerateBody, /acquireLock_\(/);
  assert.match(regenerateBody, /generateEditKey_\(/);
  assert.match(regenerateBody, /updateEditKeyConfigPair_\(/);
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

test('configured web app URL never falls back to ScriptApp when config is absent', () => {
  const context = loadCode(
    {},
    {},
    {},
    'https://script.google.com/a/e.osakamanabi.jp/macros/s/fallback-id/exec?foo=bar'
  );

  assert.equal(context.getConfiguredWebAppUrl_(), '');
  assert.equal(context.__scriptUrlCalls, 0);
  assert.doesNotMatch(fs.readFileSync(codePath, 'utf8'), /ScriptApp\.getService\(\)\.getUrl\(\)/);
});

test('config setup prepares a WEB_APP_URL row without overwriting existing values', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const initBody = getFunctionBody(code, 'initializeConfigSheet_');
  const setupBody = getFunctionBody(code, 'setupSheets');

  assert.match(code, /const WEB_APP_URL_CONFIG_KEY\s*=\s*'WEB_APP_URL'/);
  assert.match(initBody, /repairConfigSheet_\(/);
  assert.match(setupBody, /repairConfigSheet_\(/);

  const context = loadCode({}, {}, {
    WEB_APP_URL: 'https://example.test/exec'
  });
  context.ensureWebAppUrlConfig_();

  const webAppRows = context.__configSheet.__rows.filter((row) => row[0] === 'WEB_APP_URL');
  assert.equal(webAppRows.length, 1);
  assert.equal(webAppRows[0][1], 'https://example.test/exec');
});

test('explicit menu generation writes encoded EDIT_URL, uses toast, and never opens a dialog', () => {
  const configured = loadCode({}, {}, {
    EDIT_KEY: 'config key&value',
    WEB_APP_URL: 'https://example.test/deploy/exec?old=1#fragment',
    EDIT_URL: 'https://stale.example/exec?mode=edit&editKey=old'
  });
  const result = configured.generateOrUpdateEditUrlFromMenu();
  const config = Object.fromEntries(
    configured.__configSheet.__rows.slice(1).filter((row) => row[0]).map((row) => [row[0], row[1]])
  );

  assert.equal(result.success, true);
  assert.equal(config.EDIT_URL, 'https://example.test/deploy/exec?mode=edit&editKey=config%20key%26value');
  assert.equal(configured.__dialog, null);
  assert.equal(configured.__alerts.length, 0);
  assert.equal(configured.__toasts.length, 1);
  assert.match(configured.__toasts[0].message, /EDIT_URL/);
  assert.equal(configured.__scriptUrlCalls, 0);
});

test('explicit menu generation clears stale EDIT_URL for blank or invalid WEB_APP_URL', () => {
  for (const webAppUrl of ['', 'https://example.test/not-exec', 'http://example.test/exec', 'not a url']) {
    const context = loadCode({}, {}, {
      EDIT_KEY: 'config-key',
      WEB_APP_URL: webAppUrl,
      EDIT_URL: 'https://stale.example/exec?mode=edit&editKey=old'
    });

    const result = context.generateOrUpdateEditUrlFromMenu();
    const config = Object.fromEntries(
      context.__configSheet.__rows.slice(1).filter((row) => row[0]).map((row) => [row[0], row[1]])
    );
    assert.equal(result.success, false, webAppUrl);
    assert.equal(config.EDIT_URL, '', webAppUrl);
    assert.equal(context.__toasts.length, 1, webAppUrl);
    assert.match(context.__toasts[0].message, /WEB_APP_URL|\/exec/, webAppUrl);
    assert.equal(context.__scriptUrlCalls, 0, webAppUrl);
  }
});

test('regenerateEditKey updates config and EDIT_URL before synchronizing ScriptProperties under one lock', () => {
  const context = loadCode({}, { EDIT_KEY: 'legacy-script-key' }, {
    WEB_APP_URL: 'https://example.test/exec',
    EDIT_KEY: 'old-config-key',
    EDIT_URL: 'https://example.test/exec?mode=edit&editKey=legacy-script-key'
  });
  const events = [];
  const originalGetUi = context.SpreadsheetApp.getUi.bind(context.SpreadsheetApp);
  context.SpreadsheetApp.getUi = () => {
    const ui = originalGetUi();
    const originalAlert = ui.alert.bind(ui);
    ui.alert = (...args) => {
      events.push(args[0] === '編集キーを再生成' ? 'confirm' : 'result');
      return originalAlert(...args);
    };
    return ui;
  };
  const originalGetScriptLock = context.LockService.getScriptLock.bind(context.LockService);
  context.LockService.getScriptLock = () => {
    const lock = originalGetScriptLock();
    const originalTryLock = lock.tryLock.bind(lock);
    const originalReleaseLock = lock.releaseLock.bind(lock);
    lock.tryLock = (...args) => { events.push('lock'); return originalTryLock(...args); };
    lock.releaseLock = () => { events.push('unlock'); return originalReleaseLock(); };
    return lock;
  };
  const originalGetRange = context.__configSheet.getRange.bind(context.__configSheet);
  context.__configSheet.getRange = (row, col, numRows, numCols) => {
    const range = originalGetRange(row, col, numRows, numCols);
    const originalSetValues = range.setValues;
    range.setValues = function(values) {
      if (values.some((sourceRow) => sourceRow.includes('ed_uuid123'))) events.push('config');
      return originalSetValues.call(this, values);
    };
    return range;
  };
  const originalGetScriptProperties = context.PropertiesService.getScriptProperties.bind(context.PropertiesService);
  context.PropertiesService.getScriptProperties = () => {
    const properties = originalGetScriptProperties();
    const originalSetProperty = properties.setProperty.bind(properties);
    properties.setProperty = (key, value) => {
      events.push('scriptProperties');
      return originalSetProperty(key, value);
    };
    return properties;
  };

  const result = context.regenerateEditKey();

  const config = Object.fromEntries(
    context.__configSheet.__rows.slice(1).filter((row) => row[0]).map((row) => [row[0], row[1]])
  );
  assert.equal(result.success, true);
  assert.equal(context.__scriptProperties.EDIT_KEY, 'ed_uuid123');
  assert.equal(config.EDIT_KEY, 'ed_uuid123');
  assert.equal(config.EDIT_URL, 'https://example.test/exec?mode=edit&editKey=ed_uuid123');
  assert.deepEqual(context.__lockEvents, ['acquire', 'release']);
  assert.deepEqual(events, ['confirm', 'lock', 'config', 'scriptProperties', 'unlock', 'result']);
  assert.ok(context.__alerts.some((args) => String(args).includes('config') && String(args).includes('EDIT_URL')));
  assert.equal(context.__alerts.some((args) => String(args).includes('編集URLを表示')), false);
});

test('regenerateEditKey clears EDIT_URL when WEB_APP_URL is blank or invalid', () => {
  for (const webAppUrl of ['', 'https://example.test/dev']) {
    const context = loadCode({}, {}, {
      WEB_APP_URL: webAppUrl,
      EDIT_KEY: 'old-config-key',
      EDIT_URL: 'https://stale.example/exec?mode=edit&editKey=old-config-key'
    });

    const result = context.regenerateEditKey();
    const config = Object.fromEntries(
      context.__configSheet.__rows.slice(1).filter((row) => row[0]).map((row) => [row[0], row[1]])
    );
    assert.equal(result.success, true, webAppUrl);
    assert.equal(config.EDIT_KEY, 'ed_uuid123', webAppUrl);
    assert.equal(config.EDIT_URL, '', webAppUrl);
    assert.ok(
      context.__alerts.some((args) => String(args).includes('WEB_APP_URL') && String(args).includes('編集用URLを生成・更新')),
      webAppUrl
    );
    assert.equal(context.__scriptUrlCalls, 0, webAppUrl);
  }
});

test('regenerateEditKey preserves config and ScriptProperties when the config pair update fails', () => {
  const context = loadCode({}, { EDIT_KEY: 'legacy-script-key' }, {
    WEB_APP_URL: 'https://example.test/exec',
    EDIT_KEY: 'old-config-key',
    EDIT_URL: 'https://example.test/exec?mode=edit&editKey=old-config-key'
  });
  const originalGetRange = context.__configSheet.getRange.bind(context.__configSheet);
  context.__configSheet.getRange = (row, col, numRows, numCols) => {
    const range = originalGetRange(row, col, numRows, numCols);
    const originalSetValue = range.setValue;
    const originalSetValues = range.setValues;
    range.setValue = function(value) {
      if (value === 'ed_uuid123') throw new Error('config unavailable');
      return originalSetValue.call(this, value);
    };
    range.setValues = function(values) {
      if (values.some((sourceRow) => sourceRow.includes('ed_uuid123'))) {
        originalSetValues.call(this, values);
        throw new Error('config unavailable');
      }
      return originalSetValues.call(this, values);
    };
    return range;
  };

  const result = context.regenerateEditKey();
  const config = Object.fromEntries(
    context.__configSheet.__rows.slice(1).filter((row) => row[0]).map((row) => [row[0], row[1]])
  );

  assert.equal(result.success, false);
  assert.equal(result.partialSuccess, false);
  assert.equal(context.__scriptProperties.EDIT_KEY, 'legacy-script-key');
  assert.equal(config.EDIT_KEY, 'old-config-key');
  assert.equal(config.EDIT_URL, 'https://example.test/exec?mode=edit&editKey=old-config-key');
  assert.equal(context.__alerts.some((args) => String(args).includes('以前の編集URLは無効')), false);
  assert.deepEqual(context.__lockEvents, ['acquire', 'release']);
});

test('regenerateEditKey leaves an existing malformed config untouched instead of repairing it in-place', () => {
  const context = loadCode({}, { EDIT_KEY: 'legacy-script-key' }, {
    WEB_APP_URL: 'https://example.test/exec',
    EDIT_KEY: 'old-config-key'
  });
  const before = JSON.stringify(context.__configSheet.__rows);

  const result = context.regenerateEditKey();

  assert.equal(result.success, false);
  assert.equal(context.__scriptProperties.EDIT_KEY, 'legacy-script-key');
  assert.equal(JSON.stringify(context.__configSheet.__rows), before);
  assert.deepEqual(context.__lockEvents, ['acquire', 'release']);
});

test('regenerateEditKey rejects duplicate authoritative config rows before changing any key', () => {
  const context = loadCode({}, { EDIT_KEY: 'legacy-script-key' }, {
    WEB_APP_URL: 'https://example.test/exec',
    EDIT_KEY: 'first-config-key',
    EDIT_URL: 'https://example.test/exec?mode=edit&editKey=first-config-key'
  });
  context.__configSheet.__rows.push(
    ['EDIT_KEY', 'last-config-key', 'duplicate'],
    ['EDIT_URL', 'https://example.test/exec?mode=edit&editKey=last-config-key', 'duplicate']
  );
  const before = JSON.stringify(context.__configSheet.__rows);

  const result = context.regenerateEditKey();

  assert.equal(result.success, false);
  assert.equal(context.__scriptProperties.EDIT_KEY, 'legacy-script-key');
  assert.equal(JSON.stringify(context.__configSheet.__rows), before);
  assert.deepEqual(Array.from(context.getAcceptedEditKeys_()), ['last-config-key']);
});

test('regenerateEditKey does not claim the old URL is valid when config restoration cannot be verified', () => {
  const context = loadCode({}, { EDIT_KEY: 'legacy-script-key' }, {
    WEB_APP_URL: 'https://example.test/exec',
    EDIT_KEY: 'old-config-key',
    EDIT_URL: 'https://example.test/exec?mode=edit&editKey=old-config-key'
  });
  const originalGetRange = context.__configSheet.getRange.bind(context.__configSheet);
  context.__configSheet.getRange = (row, col, numRows, numCols) => {
    const range = originalGetRange(row, col, numRows, numCols);
    const originalSetValues = range.setValues;
    range.setValues = function(values) {
      if (values.some((sourceRow) => sourceRow.includes('ed_uuid123'))) {
        originalSetValues.call(this, values);
        throw new Error('config write uncertain');
      }
      throw new Error('config restore unavailable');
    };
    return range;
  };

  const result = context.regenerateEditKey();

  assert.equal(result.success, false);
  assert.equal(result.oldValuesVerified, false);
  assert.equal(context.__scriptProperties.EDIT_KEY, 'legacy-script-key');
  assert.equal(context.__alerts.some((args) => String(args).includes('旧編集URLは引き続き利用できます')), false);
});

test('regenerateEditKey keeps the new config key authoritative when ScriptProperties synchronization fails', () => {
  const context = loadCode({}, { EDIT_KEY: 'legacy-script-key' }, {
    WEB_APP_URL: 'https://example.test/exec',
    EDIT_KEY: 'old-config-key',
    EDIT_URL: 'https://example.test/exec?mode=edit&editKey=old-config-key'
  });
  context.PropertiesService.getScriptProperties = () => ({
    getProperty(key) {
      return Object.prototype.hasOwnProperty.call(context.__scriptProperties, key)
        ? context.__scriptProperties[key]
        : null;
    },
    setProperty() {
      throw new Error('script properties unavailable');
    }
  });

  const result = context.regenerateEditKey();
  const config = Object.fromEntries(
    context.__configSheet.__rows.slice(1).filter((row) => row[0]).map((row) => [row[0], row[1]])
  );

  assert.equal(result.success, true);
  assert.equal(result.partialSuccess, true);
  assert.equal(context.__scriptProperties.EDIT_KEY, 'legacy-script-key');
  assert.equal(config.EDIT_KEY, 'ed_uuid123');
  assert.equal(config.EDIT_URL, 'https://example.test/exec?mode=edit&editKey=ed_uuid123');
  assert.deepEqual(Array.from(context.getAcceptedEditKeys_()), ['ed_uuid123']);
  assert.ok(context.__alerts.some((args) => String(args).includes('一部') || String(args).includes('同期')));
  assert.deepEqual(context.__lockEvents, ['acquire', 'release']);
});

test('onEdit clears only stale EDIT_URL after direct WEB_APP_URL or EDIT_KEY value edits', () => {
  for (const editedKey of ['WEB_APP_URL', 'EDIT_KEY']) {
    const context = loadCode({}, {}, {
      WEB_APP_URL: 'https://example.test/exec',
      EDIT_KEY: 'config-key',
      EDIT_URL: 'https://example.test/exec?mode=edit&editKey=config-key'
    });
    const row = context.__configSheet.__rows.findIndex((cells) => cells[0] === editedKey) + 1;
    context.onEdit({
      range: {
        getSheet() { return context.__configSheet; },
        getRow() { return row; },
        getNumRows() { return 1; },
        getColumn() { return 2; },
        getNumColumns() { return 1; }
      }
    });
    const config = Object.fromEntries(
      context.__configSheet.__rows.slice(1).filter((cells) => cells[0]).map((cells) => [cells[0], cells[1]])
    );
    assert.equal(config.EDIT_URL, '', editedKey);
    assert.equal(context.__scriptUrlCalls, 0, editedKey);
  }

  const unrelated = loadCode({}, {}, {
    WEB_APP_URL: 'https://example.test/exec',
    EDIT_KEY: 'config-key',
    EDIT_URL: 'keep-me',
    OTHER: 'value'
  });
  const otherRow = unrelated.__configSheet.__rows.findIndex((cells) => cells[0] === 'OTHER') + 1;
  unrelated.onEdit({
    range: {
      getSheet() { return unrelated.__configSheet; },
      getRow() { return otherRow; },
      getNumRows() { return 1; },
      getColumn() { return 2; },
      getNumColumns() { return 1; }
    }
  });
  const config = Object.fromEntries(
    unrelated.__configSheet.__rows.slice(1).filter((cells) => cells[0]).map((cells) => [cells[0], cells[1]])
  );
  assert.equal(config.EDIT_URL, 'keep-me');
});

test('getConfig reuses one config read when resolving execUrl', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const body = getFunctionBody(code, 'getConfig');

  assert.match(body, /const appConfig\s*=\s*getAppConfig_\(\)/);
  assert.match(body, /getConfiguredWebAppUrl_\(appConfig\)/);
  assert.equal((body.match(/getAppConfig_\(\)/g) || []).length, 1);
  assert.doesNotMatch(body, /ScriptApp\.getService\(\)\.getUrl\(\)/);
});

test('README documents config-sheet edit key workflow and token lifetime', () => {
  const readme = fs.readFileSync(readmePath, 'utf8');
  const index = fs.readFileSync(indexPath, 'utf8');

  assert.match(readme, /config.*EDIT_KEY/s);
  assert.match(readme, /WEB_APP_URL/);
  assert.match(readme, /\/exec/);
  assert.doesNotMatch(readme, /ScriptApp\.getService\(\)\.getUrl\(\)/);
  assert.match(readme, /編集用URLを生成・更新/);
  assert.doesNotMatch(readme, /編集URLを表示/);
  assert.match(readme, /編集キーを再生成/);
  assert.match(readme, /6時間/);
  assert.match(readme, /一時的な編集トークン/);
  assert.match(readme, /同じ編集URLを再読み込み/);
  assert.match(readme, /public URL、iframe、QR.*editKey.*含めない/s);
  assert.match(readme, /表示されたQRコードをスマホで読み取るか、\*\*「URLをコピー」\*\* ボタン/);
  assert.doesNotMatch(index, /編集URLを表示/);
  assert.match(index, /configシートの EDIT_URL/);
});

test('assertEditToken_ accepts only tokens issued by the current edit key', () => {
  const context = loadCode(
    { 'EDIT_TOKEN_valid-token': 'edit-key:class-key' },
    { EDIT_KEY: 'class-key' }
  );

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
    'deleteImageFile',
    'getImageFileProperties',
    'getHotspotPhotoFolderUrlForEdit',
    'getSceneSettings',
    'updateSceneSettings',
    'setHomeScene',
    'reorderScenes',
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
    'deleteImageFile',
    'getImageFileProperties',
    'getHotspotPhotoFolderUrlForEdit',
    'getSceneSettings',
    'updateSceneSettings',
    'setHomeScene',
    'reorderScenes',
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
