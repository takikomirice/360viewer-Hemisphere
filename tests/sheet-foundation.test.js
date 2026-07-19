const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const codePath = path.join(rootDir, 'Code.js');

const INFO_HEADERS = ['保存日時', '画像ID', 'ラベル', '説明', 'リンクURL', 'Pitch', 'Yaw', '形状', '色', 'アイコン', '写真ID', 'ジャンプ先ID', 'ID'];
const EXPECTED_CONFIG_KEYS = [
  'IMAGE_DRIVE_URL',
  'HOTSPOT_PHOTO_FOLDER_URL',
  'STUDENT_SHEET_URL',
  'EDIT_KEY',
  'WEB_APP_URL',
  'EDIT_URL'
];
const EXPECTED_SCENE_HEADERS = ['DriveファイルID', '表示名', '親フォルダID', '種別', 'ホーム設定', '表示順', 'northOffset', 'northOffset取得元', 'Drive更新日時', 'scenes行の更新日時'];
const STUDENT_HEADERS = ['No', '対象シーン', 'ラベル', '説明', 'リンクURL', '写真', 'ジャンプ先', '状態'];

function uncheckedSceneRow() {
  const row = Array(EXPECTED_SCENE_HEADERS.length).fill('');
  row[4] = false;
  return row;
}

function cloneCell(value) {
  return value instanceof Date ? new Date(value.getTime()) : value;
}

function cellValue(cell) {
  return cell && typeof cell === 'object' && Object.prototype.hasOwnProperty.call(cell, 'formula')
    ? cell.value
    : (typeof cell === 'string' && cell.startsWith("'=")
        ? cell.slice(1)
        : (typeof cell === 'string' && cell.startsWith('=') ? '' : cell));
}

function storedCell(value, previous) {
  return typeof value === 'string' && value.startsWith('=')
    ? {
        value: previous && typeof previous === 'object' && previous.formula === value ? previous.value : '',
        formula: value
      }
    : cloneCell(value);
}

function createSheet(name, initialRows = []) {
  const rows = initialRows.map((row) => row.map(cloneCell));
  const getValuesCalls = [];
  const setValuesCalls = [];
  const clearContentCalls = [];
  const dataValidationCalls = [];
  const columnWidthCalls = [];
  let frozenRows = 0;

  function ensureCell(rowIndex, colIndex) {
    while (rows.length <= rowIndex) rows.push([]);
    while (rows[rowIndex].length <= colIndex) rows[rowIndex].push('');
  }

  function makeRange(row, col, numRows = 1, numCols = 1) {
    const rowIndex = row - 1;
    const colIndex = col - 1;
    return {
      getValues() {
        getValuesCalls.push({ row, col, numRows, numCols });
        return Array.from({ length: numRows }, (_, rowOffset) =>
          Array.from({ length: numCols }, (_, colOffset) => {
            const sourceRow = rows[rowIndex + rowOffset] || [];
            const value = sourceRow[colIndex + colOffset];
            return value === undefined ? '' : cloneCell(cellValue(value));
          })
        );
      },
      getFormulas() {
        return Array.from({ length: numRows }, (_, rowOffset) =>
          Array.from({ length: numCols }, (_, colOffset) => {
            const sourceRow = rows[rowIndex + rowOffset] || [];
            const value = sourceRow[colIndex + colOffset];
            if (value && typeof value === 'object' && value.formula) return value.formula;
            return typeof value === 'string' && value.startsWith('=') ? value : '';
          })
        );
      },
      setValue(value) {
        ensureCell(rowIndex, colIndex);
        rows[rowIndex][colIndex] = storedCell(value, rows[rowIndex][colIndex]);
        return this;
      },
      setValues(values) {
        setValuesCalls.push({
          row,
          col,
          numRows,
          numCols,
          values: values.map((sourceRow) => sourceRow.map(cloneCell))
        });
        values.forEach((sourceRow, rowOffset) => {
          sourceRow.forEach((value, colOffset) => {
            ensureCell(rowIndex + rowOffset, colIndex + colOffset);
            const previous = rows[rowIndex + rowOffset][colIndex + colOffset];
            rows[rowIndex + rowOffset][colIndex + colOffset] = storedCell(value, previous);
          });
        });
        return this;
      },
      clearContent() {
        clearContentCalls.push({ row, col, numRows, numCols });
        for (let rowOffset = 0; rowOffset < numRows; rowOffset++) {
          for (let colOffset = 0; colOffset < numCols; colOffset++) {
            ensureCell(rowIndex + rowOffset, colIndex + colOffset);
            rows[rowIndex + rowOffset][colIndex + colOffset] = '';
          }
        }
        return this;
      },
      setFontWeight() { return this; },
      setBackground() { return this; },
      setDataValidation(rule) {
        dataValidationCalls.push({ row, col, numRows, numCols, rule });
        return this;
      },
      setNumberFormat() { return this; }
    };
  }

  return {
    __rows: rows,
    __name: name,
    __getValuesCalls: getValuesCalls,
    __setValuesCalls: setValuesCalls,
    __clearContentCalls: clearContentCalls,
    __dataValidationCalls: dataValidationCalls,
    __columnWidthCalls: columnWidthCalls,
    get __frozenRows() { return frozenRows; },
    getName() { return this.__name; },
    setName(nextName) { this.__name = nextName; return this; },
    getLastRow() {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].some((cell) => cell !== '' && cell !== null && cell !== undefined)) return i + 1;
      }
      return 0;
    },
    getLastColumn() {
      let lastColumn = 0;
      rows.forEach((row) => {
        for (let i = row.length - 1; i >= 0; i--) {
          if (row[i] !== '' && row[i] !== null && row[i] !== undefined) {
            lastColumn = Math.max(lastColumn, i + 1);
            break;
          }
        }
      });
      return lastColumn;
    },
    getMaxRows() { return Math.max(rows.length, 100); },
    getRange(row, col, numRows, numCols) { return makeRange(row, col, numRows, numCols); },
    appendRow(row) { rows.push(row.map(cloneCell)); return this; },
    insertColumnAfter(afterPosition) {
      rows.forEach((row) => row.splice(afterPosition, 0, ''));
      return this;
    },
    insertColumnsAfter(afterPosition, howMany) {
      rows.forEach((row) => row.splice(afterPosition, 0, ...Array(howMany).fill('')));
      return this;
    },
    deleteRows(startRow, howMany = 1) {
      rows.splice(startRow - 1, howMany);
      return this;
    },
    deleteRow(rowNumber) {
      rows.splice(rowNumber - 1, 1);
      return this;
    },
    setColumnWidth(column, width) { columnWidthCalls.push({ column, width }); },
    setFrozenRows(count) { frozenRows = count; }
  };
}

function createFolderConfigSheet(folderId) {
  return createSheet('config', [
    ['設定項目', '値', '説明'],
    ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${folderId}`, '']
  ]);
}

function createIterator(items) {
  let index = 0;
  return {
    hasNext() { return index < items.length; },
    next() {
      if (index >= items.length) throw new Error('Iterator exhausted');
      return items[index++];
    }
  };
}

function createDriveFile({
  id,
  name,
  mimeType = 'image/jpeg',
  bytes = null,
  sizeBytes = null,
  updatedAt = new Date('2026-07-18T01:00:00.000Z'),
  operations = [],
  failRename = false,
  failTrash = false
}) {
  let currentName = name;
  let currentUpdatedAt = updatedAt;
  let parents = [];
  let trashed = false;
  let blobReads = 0;
  const blobBytes = Array.from(bytes || (mimeType === 'image/jpeg' ? [0xff, 0xd8, 0xff, 0xd9] : []));
  return {
    __operations: operations,
    __setParents(nextParents) { parents = nextParents.slice(); },
    __setNameDirect(nextName) { currentName = nextName; },
    __setUpdatedAt(nextUpdatedAt) { currentUpdatedAt = nextUpdatedAt; },
    __setFailRename(value) { failRename = value; },
    __setFailTrash(value) { failTrash = value; },
    get __blobReads() { return blobReads; },
    get __trashed() { return trashed; },
    getId() { return id; },
    getName() { return currentName; },
    getMimeType() { return mimeType; },
    getLastUpdated() { return currentUpdatedAt; },
    getParents() { return createIterator(parents); },
    getBlob() {
      blobReads += 1;
      return {
        getBytes() { return blobBytes.slice(); },
        getContentType() { return mimeType; },
        getName() { return currentName; }
      };
    },
    getSize() { return sizeBytes == null ? (blobBytes.length || 1234) : sizeBytes; },
    getUrl() { return `https://drive.google.com/file/d/${id}/view`; },
    setSharing() { operations.push(`share:${id}`); return this; },
    setName(nextName) {
      operations.push(`rename:${id}`);
      if (failRename) throw new Error('Drive rename failed');
      currentName = nextName;
      currentUpdatedAt = new Date('2026-07-18T02:00:00.000Z');
      return this;
    },
    setTrashed(value) {
      operations.push(`trash:${id}`);
      if (failTrash) throw new Error('Drive trash failed');
      trashed = !!value;
      return this;
    }
  };
}

function createDriveFolder({
  id,
  name = id,
  files = [],
  folders = [],
  parentIds = [],
  operations = [],
  listError = null,
  createError = null,
  createdFileFailTrash = false
}) {
  let uploadCounter = 0;
  let folderCounter = 0;
  let trashed = false;
  const folder = {
    __files: files,
    __folders: folders,
    __setListError(value) { listError = value; },
    get __trashed() { return trashed; },
    getId() { return id; },
    getName() { return name; },
    getParents() {
      return createIterator(parentIds.map((parentId) => ({ getId() { return parentId; } })));
    },
    getFolders() {
      if (listError) throw new Error(String(listError));
      return createIterator(folders);
    },
    getFiles() {
      if (listError) throw new Error(String(listError));
      return createIterator(files.filter((file) => !file.__trashed));
    },
    createFile(blob) {
      operations.push(`create:${id}`);
      if (createError) throw new Error(String(createError));
      uploadCounter += 1;
      const file = createDriveFile({
        id: `uploaded-file-${uploadCounter}`,
        name: blob.getName(),
        mimeType: blob.getContentType(),
        operations,
        failTrash: createdFileFailTrash
      });
      file.__setParents([folder]);
      files.push(file);
      return file;
    },
    createFolder(folderName) {
      operations.push(`create-folder:${id}:${String(folderName || '')}`);
      if (createError) throw new Error(String(createError));
      folderCounter += 1;
      const child = createDriveFolder({
        id: `${id}-folder-${folderCounter}`,
        name: String(folderName || ''),
        parentIds: [id],
        operations
      });
      folders.push(child);
      return child;
    },
    setTrashed(value) {
      operations.push(`trash-folder:${id}`);
      trashed = !!value;
      return this;
    }
  };
  files.forEach((file) => file.__setParents([folder]));
  return folder;
}

function createSpreadsheet(id, url, sheetEntries = {}) {
  const sheets = new Map(Object.entries(sheetEntries));
  return {
    __sheets: sheets,
    getId() { return id; },
    getUrl() { return url; },
    getSheetByName(name) { return sheets.get(name) || null; },
    insertSheet(name) {
      const sheet = createSheet(name);
      sheets.set(name, sheet);
      return sheet;
    },
    getActiveSheet() { return sheets.values().next().value || this.insertSheet('シート1'); }
  };
}

function loadCode({
  sheets = {},
  scriptProperties = {},
  scriptPropertyReadError = null,
  scriptPropertyWriteError = null,
  externalSpreadsheets = {},
  scriptUrl = 'https://script.google.com/macros/s/deploy-id/exec',
  driveFolders = {},
  driveFiles = {},
  containerParentFolderIds = [],
  cacheValues = {},
  driveOperations = [],
  rejectNestedLock = false,
  cacheRemoveError = null,
  activeSpreadsheetAvailable = true
} = {}) {
  const tokenCacheKeys = Object.keys(cacheValues).filter((key) => key.startsWith('EDIT_TOKEN_'));
  if (tokenCacheKeys.length > 0) {
    if (!scriptProperties.EDIT_KEY) scriptProperties.EDIT_KEY = 'test-edit-key';
    tokenCacheKeys.forEach((key) => {
      if (cacheValues[key] === '1') cacheValues[key] = `edit-key:${scriptProperties.EDIT_KEY}`;
    });
  }
  const code = fs.readFileSync(codePath, 'utf8');
  const activeSpreadsheet = createSpreadsheet(
    'container-spreadsheet-id',
    'https://docs.google.com/spreadsheets/d/container-spreadsheet-id/edit',
    sheets
  );
  const toasts = [];
  activeSpreadsheet.toast = function(message, title, timeoutSeconds) {
    toasts.push({ message, title, timeoutSeconds });
  };
  const externalById = new Map(Object.entries(externalSpreadsheets));
  const driveFoldersById = new Map(Object.entries(driveFolders));
  const driveFilesById = new Map(Object.entries(driveFiles));
  const containerDriveFile = createDriveFile({
    id: 'container-spreadsheet-id',
    name: 'Hemisphere spreadsheet',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    bytes: []
  });
  containerDriveFile.__setParents(containerParentFolderIds.map((id) => {
    if (!driveFoldersById.has(id)) throw new Error(`Container parent folder not found: ${id}`);
    return driveFoldersById.get(id);
  }));
  if (!driveFilesById.has('container-spreadsheet-id')) {
    driveFilesById.set('container-spreadsheet-id', containerDriveFile);
  }
  const cache = new Map(Object.entries(cacheValues));
  const cacheRemovals = [];
  const createdSpreadsheets = [];
  const spreadsheetCreateCalls = [];
  let createdSpreadsheetCounter = 0;
  let scriptLockHeld = false;
  let uuidCounter = 0;
  const warnings = [];
  const errors = [];
  const menus = [];
  const context = {
    console: {
      log() {},
      warn(...args) { warnings.push(args.map(String).join(' ')); },
      error(...args) { errors.push(args.map(String).join(' ')); }
    },
    __alerts: [],
    __toasts: toasts,
    __warnings: warnings,
    __errors: errors,
    __menus: menus,
    __scriptProperties: scriptProperties,
    __spreadsheet: activeSpreadsheet,
    __cache: cache,
    __cacheRemovals: cacheRemovals,
    __driveFolders: driveFoldersById,
    __driveOperations: driveOperations,
    __createdSpreadsheets: createdSpreadsheets,
    __spreadsheetCreateCalls: spreadsheetCreateCalls,
    CacheService: {
      getScriptCache() {
        return {
          get(key) { return cache.has(key) ? cache.get(key) : null; },
          put(key, value) { cache.set(key, value); },
          remove(key) {
            cacheRemovals.push(key);
            if (cacheRemoveError) throw new Error(String(cacheRemoveError));
            cache.delete(key);
          }
        };
      }
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock() {
            if (rejectNestedLock && scriptLockHeld) return false;
            scriptLockHeld = true;
            return true;
          },
          releaseLock() { scriptLockHeld = false; }
        };
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            if (scriptPropertyReadError) throw new Error(String(scriptPropertyReadError));
            return Object.prototype.hasOwnProperty.call(scriptProperties, key) ? scriptProperties[key] : null;
          },
          setProperty(key, value) {
            if (scriptPropertyWriteError) throw new Error(String(scriptPropertyWriteError));
            scriptProperties[key] = value;
          }
        };
      }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() { return activeSpreadsheetAvailable ? activeSpreadsheet : null; },
      create(name) {
        createdSpreadsheetCounter += 1;
        const id = `created-student-sheet-${createdSpreadsheetCounter}-123456789`;
        const spreadsheet = createSpreadsheet(
          id,
          `https://docs.google.com/spreadsheets/d/${id}/edit`,
          { 'シート1': createSheet('シート1') }
        );
        spreadsheetCreateCalls.push(String(name || ''));
        createdSpreadsheets.push(spreadsheet);
        externalById.set(id, spreadsheet);
        driveFilesById.set(id, {
          getId() { return id; },
          moveTo(folder) {
            driveOperations.push(`move:${id}:${folder.getId()}`);
            return this;
          }
        });
        return spreadsheet;
      },
      openById(id) {
        if (!externalById.has(id)) throw new Error(`Spreadsheet not found: ${id}`);
        return externalById.get(id);
      },
      getUi() {
        if (!activeSpreadsheetAvailable) throw new Error('Spreadsheet UI is unavailable');
        const ui = {
          Button: { OK: 'OK', YES: 'YES', NO: 'NO' },
          ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' },
          alert(...args) { context.__alerts.push(args); return ui.Button.YES; },
          createMenu(label) {
            const menu = {
              label,
              items: [],
              submenus: [],
              addedToUi: false,
              addItem(itemLabel, functionName) {
                this.items.push({ label: itemLabel, functionName });
                return this;
              },
              addSeparator() {
                this.items.push({ separator: true });
                return this;
              },
              addSubMenu(subMenu) {
                this.submenus.push(subMenu);
                this.items.push({ subMenu });
                return this;
              },
              addToUi() {
                this.addedToUi = true;
                return this;
              }
            };
            menus.push(menu);
            return menu;
          },
          showModalDialog() {}
        };
        return ui;
      },
      newDataValidation() {
        const state = { criteria: '', values: [], showDropdown: null, formula: '', allowInvalid: null };
        return {
          requireValueInList(values, showDropdown) {
            state.criteria = 'VALUE_IN_LIST';
            state.values = Array.from(values || []);
            state.showDropdown = showDropdown;
            return this;
          },
          requireCheckbox() {
            state.criteria = 'CHECKBOX';
            return this;
          },
          requireFormulaSatisfied(formula) {
            state.criteria = 'FORMULA';
            state.formula = String(formula || '');
            return this;
          },
          setAllowInvalid(value) {
            state.allowInvalid = !!value;
            return this;
          },
          build() { return { ...state, values: state.values.slice() }; }
        };
      }
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFolderById(id) {
        if (driveFoldersById.has(id)) return driveFoldersById.get(id);
        const visited = new Set();
        function findFolder(folder) {
          if (!folder || visited.has(folder)) return null;
          visited.add(folder);
          if (folder.getId() === id) return folder;
          for (const child of folder.__folders || []) {
            const found = findFolder(child);
            if (found) return found;
          }
          return null;
        }
        for (const folder of driveFoldersById.values()) {
          const found = findFolder(folder);
          if (found) return found;
        }
        throw new Error(`Drive folder not found: ${id}`);
      },
      getFileById(id) {
        if (driveFilesById.has(id)) return driveFilesById.get(id);
        const visited = new Set();
        function findFile(folder) {
          if (!folder || visited.has(folder)) return null;
          visited.add(folder);
          const match = (folder.__files || []).find((file) => file.getId() === id);
          if (match) return match;
          for (const child of folder.__folders || []) {
            const found = findFile(child);
            if (found) return found;
          }
          return null;
        }
        for (const folder of driveFoldersById.values()) {
          const found = findFile(folder);
          if (found) return found;
        }
        throw new Error(`Drive file not found: ${id}`);
      }
    },
    ScriptApp: { getService() { return { getUrl() { return scriptUrl; } }; } },
    Utilities: {
      getUuid() { uuidCounter += 1; return `uuid-${uuidCounter}`; },
      formatDate(date) { return date.toISOString(); },
      base64Decode(value) { return Array.from(Buffer.from(value, 'base64')); },
      base64Encode(bytes) { return Buffer.from(bytes).toString('base64'); },
      newBlob(bytes, contentType, blobName) {
        return {
          getBytes() { return bytes; },
          getContentType() { return contentType; },
          getName() { return blobName; }
        };
      }
    },
    Session: { getScriptTimeZone() { return 'Asia/Tokyo'; } },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput() { return { setWidth() { return this; }, setHeight() { return this; } }; },
      createTemplateFromFile() { return { evaluate() { return { setTitle() { return this; }, setXFrameOptionsMode() { return this; } }; } }; }
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'Code.js' });
  return context;
}

function configRows(context) {
  const sheet = context.__spreadsheet.getSheetByName('config');
  return sheet.__rows.slice(1, sheet.getLastRow()).map((row) => row.slice(0, 3).map((cell) =>
    cell && typeof cell === 'object' && cell.formula ? cell.formula : cell
  ));
}

function configObject(context) {
  return Object.fromEntries(configRows(context).filter((row) => row[0]).map((row) => [row[0], row[1]]));
}

function getFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(bodyStart + 1, i);
  }
  throw new Error(`Could not parse ${functionName}`);
}

test('extractSpreadsheetId_ accepts Google Sheets URLs and raw IDs only', () => {
  const context = loadCode();
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz_12345';

  assert.equal(context.extractSpreadsheetId_(id), id);
  assert.equal(context.extractSpreadsheetId_(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), id);
  assert.equal(context.extractSpreadsheetId_(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(context.extractSpreadsheetId_('https://docs.google.com/spreadsheets/'), null);
  assert.equal(context.extractSpreadsheetId_('not an id'), null);
});

test('setupSheets is idempotent and preserves config formulas and existing info data', () => {
  const infoData = ['2026-01-01', 'image-1', 'label', 'description', 'https://example.test', 1, 2, 'circle', 'blue', 'info', '', '', 'hotspot-1'];
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['EXTRA_SETTING', '=CONCAT("ke","ep")', '保持する数式'],
        ['EDIT_KEY', 'existing-key', ''],
        ['EDIT_URL', 'https://keep.example/exec?mode=edit&editKey=old', ''],
        ['IMAGE_DRIVE_URL', 'https://drive.google.com/drive/folders/folder12345678901', ''],
        ['WEB_APP_URL', 'https://example.test/exec?old=1', '']
      ]),
      info: createSheet('info', [INFO_HEADERS, infoData])
    }
  });

  context.setupSheets();
  const once = JSON.stringify(Array.from(context.__spreadsheet.__sheets.entries()).map(([name, sheet]) => [name, sheet.__rows]));
  context.setupSheets();
  const twice = JSON.stringify(Array.from(context.__spreadsheet.__sheets.entries()).map(([name, sheet]) => [name, sheet.__rows]));

  assert.equal(twice, once);
  assert.deepEqual(configRows(context).slice(0, 6).map((row) => row[0]), EXPECTED_CONFIG_KEYS);
  assert.equal(configRows(context).filter((row) => row[0] === 'EDIT_KEY').length, 1);
  assert.equal(configObject(context).EDIT_KEY, 'existing-key');
  assert.equal(configObject(context).EDIT_URL, 'https://keep.example/exec?mode=edit&editKey=old');
  assert.equal(context.__alerts.some((args) => String(args).includes('EDIT_URLを更新')), false);
  assert.equal(configObject(context).EXTRA_SETTING, '=CONCAT("ke","ep")');
  assert.deepEqual(context.__spreadsheet.getSheetByName('info').__rows[1], infoData);
  assert.deepEqual(context.__spreadsheet.getSheetByName('scenes').__rows[0].slice(0, 10), EXPECTED_SCENE_HEADERS);
});

test('a new environment creates the exact primary config order with an empty managed photo folder URL', () => {
  const context = loadCode();

  context.setupSheets();

  assert.deepEqual(configRows(context).slice(0, 6).map((row) => row[0]), EXPECTED_CONFIG_KEYS);
  assert.equal(configObject(context).HOTSPOT_PHOTO_FOLDER_URL, '');
});

test('config repair inserts the managed hotspot photo URL below IMAGE_DRIVE_URL and safely reorders legacy primary rows', () => {
  const config = createSheet('config', [
    ['設定項目', '値', '説明'],
    ['WEB_APP_URL', 'https://example.test/exec', 'web app'],
    ['EDIT_URL', { value: 'computed', formula: '=A1' }, 'edit formula'],
    ['CUSTOM_SETTING', { value: 'custom', formula: '=CONCAT("cus","tom")' }, '独自行'],
    ['EDIT_KEY', 'keep-edit-key', 'edit key'],
    ['STUDENT_SHEET_URL', 'https://docs.google.com/spreadsheets/d/student-sheet-id/edit', 'student'],
    ['IMAGE_DRIVE_URL', { value: 'root', formula: '=CONCAT("https://drive.google.com/drive/folders/","root-id")' }, 'image']
  ]);
  const context = loadCode({ sheets: { config } });

  const result = context.repairConfigSheet_(config);
  const rows = configRows(context);

  assert.deepEqual(rows.slice(0, 6).map((row) => row[0]), EXPECTED_CONFIG_KEYS);
  assert.equal(rows[1][0], 'HOTSPOT_PHOTO_FOLDER_URL');
  assert.equal(rows[1][1], '');
  assert.equal(rows[1][2], 'ホットスポット添付写真の専用Google DriveフォルダURL。システムが自動設定します。');
  assert.equal(rows.find((row) => row[0] === 'IMAGE_DRIVE_URL')[1], '=CONCAT("https://drive.google.com/drive/folders/","root-id")');
  assert.equal(rows.find((row) => row[0] === 'EDIT_URL')[1], '=A1');
  assert.equal(rows.find((row) => row[0] === 'CUSTOM_SETTING')[1], '=CONCAT("cus","tom")');
  assert.equal(rows.find((row) => row[0] === 'CUSTOM_SETTING')[2], '独自行');
  assert.deepEqual(Array.from(result.addedKeys), ['HOTSPOT_PHOTO_FOLDER_URL']);
});

test('setup synchronizes the managed hotspot photo URL from the validated official property and clears it when uncreated', () => {
  const rootId = 'config-photo-scene-root';
  const parentId = 'config-photo-container-parent';
  const photoFolderId = 'config-official-photo-folder';
  const root = createDriveFolder({ id: rootId });
  const parent = createDriveFolder({ id: parentId });
  const photoFolder = createDriveFolder({ id: photoFolderId, parentIds: [parentId] });
  const restored = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, ''],
        ['HOTSPOT_PHOTO_FOLDER_URL', 'https://drive.google.com/drive/folders/tampered-folder', '']
      ])
    },
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: photoFolderId },
    driveFolders: { [rootId]: root, [parentId]: parent, [photoFolderId]: photoFolder },
    containerParentFolderIds: [parentId]
  });

  restored.setupSheets();

  assert.equal(
    configObject(restored).HOTSPOT_PHOTO_FOLDER_URL,
    `https://drive.google.com/drive/folders/${photoFolderId}`
  );

  const uncreated = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', '', ''],
        ['HOTSPOT_PHOTO_FOLDER_URL', 'https://drive.google.com/drive/folders/user-edited', '']
      ])
    }
  });

  uncreated.setupSheets();

  assert.equal(configObject(uncreated).HOTSPOT_PHOTO_FOLDER_URL, '');
});

test('setup migrates a legacy edit key while preserving its existing EDIT_URL', () => {
  const legacyKey = 'legacy-script-key';
  const legacyUrl = 'https://example.test/exec?mode=edit&editKey=' + legacyKey;
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['WEB_APP_URL', 'https://example.test/exec', ''],
        ['EDIT_URL', legacyUrl, ''],
        ['EDIT_KEY', '', '']
      ])
    },
    scriptProperties: { EDIT_KEY: legacyKey }
  });

  context.setupSheets();

  assert.equal(configObject(context).EDIT_KEY, legacyKey);
  assert.equal(configObject(context).EDIT_URL, legacyUrl);
  assert.equal(context.getConfiguredEditKey_(), legacyKey);
  assert.equal(context.__alerts.some((args) => String(args).includes('EDIT_URLを更新')), false);
});

test('scenes repair applies type, home, northOffset, and source input helpers without changing values or formulas', () => {
  const formula = { value: 15, formula: '=A2' };
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['validation-file', 'Validation', 'validation-root', '360', true, 1, formula, 'manual', '', '']
  ]);
  const context = loadCode({ sheets: { scenes: scenesSheet } });
  const before = JSON.stringify(scenesSheet.__rows);

  context.repairScenesSheet_(scenesSheet);
  context.repairScenesSheet_(scenesSheet);

  assert.equal(JSON.stringify(scenesSheet.__rows), before);
  const latestByColumn = {};
  scenesSheet.__dataValidationCalls.forEach((call) => { latestByColumn[call.col] = call; });
  assert.deepEqual(Array.from(latestByColumn[4].rule.values), ['360', '2D']);
  assert.equal(latestByColumn[4].rule.criteria, 'VALUE_IN_LIST');
  assert.equal(latestByColumn[5].rule.criteria, 'CHECKBOX');
  assert.equal(latestByColumn[7].rule.criteria, 'FORMULA');
  assert.match(latestByColumn[7].rule.formula, /G2/);
  assert.match(latestByColumn[7].rule.formula, />=0/);
  assert.match(latestByColumn[7].rule.formula, /<360/);
  assert.deepEqual(Array.from(latestByColumn[8].rule.values), ['', 'xmp', 'manual', 'none']);
  assert.equal(latestByColumn[8].rule.criteria, 'VALUE_IN_LIST');
  assert.equal(latestByColumn[4].numRows, scenesSheet.getMaxRows() - 1);
});

test('setup preserves EDIT_KEY formulas but repairs the student display URL from the official property ID', () => {
  const legacyId = 'legacyStudentSheetId123456789';
  const legacySheet = createSpreadsheet(legacyId, `https://docs.google.com/spreadsheets/d/${legacyId}/edit`, {
    'シート1': createSheet('シート1', [STUDENT_HEADERS])
  });
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['STUDENT_SHEET_URL', { value: '', formula: '=IF(A1="", "", A1)' }, ''],
        ['WEB_APP_URL', 'https://example.test/exec', ''],
        ['EDIT_KEY', { value: '', formula: '=IF(A1="", "", A1)' }, '']
      ])
    },
    scriptProperties: { STUDENT_SHEET_ID: legacyId },
    externalSpreadsheets: { [legacyId]: legacySheet }
  });

  context.setupSheets();

  const rows = configRows(context);
  assert.equal(rows.find((row) => row[0] === 'STUDENT_SHEET_URL')[1], legacySheet.getUrl());
  assert.equal(rows.find((row) => row[0] === 'EDIT_KEY')[1], '=IF(A1="", "", A1)');
});

test('info migration keeps unknown schemas untouched and aligns known five-column data safely', () => {
  const unknownRows = [
    ['独自A', '独自B', '独自C', '独自D', '独自E'],
    ['a', 'b', 'c', 'd', 'e']
  ];
  const unknown = createSheet('info', unknownRows);
  const unknownContext = loadCode({ sheets: { info: unknown } });
  const unknownResult = unknownContext.migrateSheetIfNeeded_(unknown);
  assert.match(unknownResult.warning, /未知|想定/);
  assert.deepEqual(unknown.__rows, unknownRows);

  const fileId = 'imageFileId123456789012345';
  const legacy = createSheet('info', [
    ['保存日時', 'ラベル', '説明', 'Pitch', 'Yaw'],
    ['2026-01-01', 'label', 'description', 12, 34]
  ]);
  const legacyContext = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/file/d/${fileId}/view`, '']
      ]),
      info: legacy
    }
  });
  legacyContext.migrateSheetIfNeeded_(legacy);

  assert.deepEqual(legacy.__rows[0].slice(0, 13), INFO_HEADERS);
  assert.equal(legacy.__rows[1][1], fileId);
  assert.equal(legacy.__rows[1][2], 'label');
  assert.equal(legacy.__rows[1][3], 'description');
  assert.equal(legacy.__rows[1][4], '');
  assert.equal(legacy.__rows[1][5], 12);
  assert.equal(legacy.__rows[1][6], 34);
});

test('ScriptProperties student ID is authoritative and setup repairs a conflicting config display URL', () => {
  const legacyId = 'legacyStudentSheetId123456789';
  const configuredId = 'configuredStudentSheetId123456';
  const legacySheet = createSpreadsheet(legacyId, `https://docs.google.com/spreadsheets/d/${legacyId}/edit`, {
    'シート1': createSheet('シート1', [STUDENT_HEADERS])
  });
  const configuredSheet = createSpreadsheet(configuredId, `https://docs.google.com/spreadsheets/d/${configuredId}/edit`, {
    'シート1': createSheet('シート1', [STUDENT_HEADERS])
  });
  const migrated = loadCode({
    sheets: { config: createSheet('config', [['設定項目', '値', '説明']]) },
    scriptProperties: { STUDENT_SHEET_ID: legacyId },
    externalSpreadsheets: { [legacyId]: legacySheet }
  });

  migrated.setupSheets();
  assert.equal(configObject(migrated).STUDENT_SHEET_URL, legacySheet.getUrl());

  const preferred = loadCode({
    sheets: { config: createSheet('config', [['設定項目', '値', '説明'], ['STUDENT_SHEET_URL', configuredSheet.getUrl(), '']]) },
    scriptProperties: { STUDENT_SHEET_ID: legacyId },
    externalSpreadsheets: { [legacyId]: legacySheet, [configuredId]: configuredSheet }
  });
  assert.equal(preferred.getStudentSheetId_(), legacyId);
  preferred.setupSheets();
  assert.equal(configObject(preferred).STUDENT_SHEET_URL, legacySheet.getUrl());
  assert.equal(preferred.__scriptProperties.STUDENT_SHEET_ID, legacyId);
});

test('config STUDENT_SHEET_URL alone never links a student sheet', () => {
  const configuredId = 'configuredOnlyStudentSheet123456';
  const context = loadCode({
    sheets: { config: createSheet('config', [
      ['設定項目', '値', '説明'],
      ['STUDENT_SHEET_URL', `https://docs.google.com/spreadsheets/d/${configuredId}/edit`, '']
    ]) }
  });

  assert.equal(context.getStudentSheetId_(), '');
  assert.throws(() => context.getStudentSheetContext_({ repairHeaders: true }), /紐づけ/);
});

test('new student sheet references update config URL and the compatibility ScriptProperty', () => {
  const context = loadCode();
  const id = 'newStudentSheetId1234567890123';
  const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;

  context.saveStudentSheetReference_(id, url);

  assert.equal(configObject(context).STUDENT_SHEET_URL, url);
  assert.equal(context.__scriptProperties.STUDENT_SHEET_ID, id);
});

test('student sheet creation is menu-only, reuses an official existing sheet, and never duplicates it', () => {
  const rootId = 'existing-student-root-folder';
  const studentId = 'existingStudentSheet123456789';
  const root = createDriveFolder({
    id: rootId,
    files: [createDriveFile({ id: 'existing-student-scene', name: 'Scene.jpg' })]
  });
  const studentSheet = createSheet('シート1', [STUDENT_HEADERS, [1, 'Scene.jpg', 'Keep row', '', '', '', '', '']]);
  const official = createSpreadsheet(
    studentId,
    `https://docs.google.com/spreadsheets/d/${studentId}/edit`,
    { 'シート1': studentSheet }
  );
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, ''],
        ['STUDENT_SHEET_URL', 'stale-url', '']
      ]),
      scenes: createSheet('scenes', [EXPECTED_SCENE_HEADERS])
    },
    scriptProperties: { STUDENT_SHEET_ID: studentId },
    externalSpreadsheets: { [studentId]: official },
    driveFolders: { [rootId]: root }
  });

  const beforeRows = JSON.stringify(studentSheet.__rows);
  const result = context.createStudentSheetFromMenu();

  assert.equal(result.success, true);
  assert.equal(result.alreadyExists, true);
  assert.deepEqual(context.__spreadsheetCreateCalls, []);
  assert.equal(context.__scriptProperties.STUDENT_SHEET_ID, studentId);
  assert.equal(configObject(context).STUDENT_SHEET_URL, official.getUrl());
  assert.equal(JSON.stringify(studentSheet.__rows), beforeRows);
  assert.equal(studentSheet.__dataValidationCalls.length, 3);
  assert.equal(context.__alerts.length, 0);
  assert.equal(context.__toasts.length, 1);
  assert.match(context.__toasts[0].message, /作成済み/);
});

test('student sheet creation refuses to replace an invalid official ID', () => {
  const context = loadCode({
    scriptProperties: { STUDENT_SHEET_ID: 'missingOfficialStudentSheet123456' }
  });

  const result = context.createStudentSheetFromMenu();

  assert.equal(result.success, false);
  assert.deepEqual(context.__spreadsheetCreateCalls, []);
  assert.equal(context.__scriptProperties.STUDENT_SHEET_ID, 'missingOfficialStudentSheet123456');
  assert.equal(context.__toasts.length, 1);
  assert.match(context.__toasts[0].message, /確認|開|失敗/);
});

test('student sheet creation fails closed for malformed or unreadable official properties', () => {
  const malformed = loadCode({
    scriptProperties: { STUDENT_SHEET_ID: 'bad' }
  });

  const malformedResult = malformed.createStudentSheetFromMenu();

  assert.equal(malformedResult.success, false);
  assert.deepEqual(malformed.__spreadsheetCreateCalls, []);
  assert.equal(malformed.__scriptProperties.STUDENT_SHEET_ID, 'bad');
  assert.match(malformedResult.error, /STUDENT_SHEET_ID|不正/);

  const unreadable = loadCode({ scriptPropertyReadError: 'PropertiesService unavailable' });
  const unreadableResult = unreadable.createStudentSheetFromMenu();

  assert.equal(unreadableResult.success, false);
  assert.deepEqual(unreadable.__spreadsheetCreateCalls, []);
  assert.match(unreadableResult.error, /PropertiesService unavailable/);
});

test('student sheet creation serializes the authority check through reference persistence', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const body = getFunctionBody(code, 'createStudentSheetFromMenu');
  const acquire = body.indexOf('acquireLock_(');
  const authorityCheck = body.indexOf('getStudentSheetId_(');
  const create = body.indexOf('createStudentSheet_(');
  const release = body.indexOf('releaseLock(');

  assert.ok(acquire >= 0, 'menu creation should acquire the shared script lock');
  assert.ok(acquire < authorityCheck, 'authority must be checked after acquiring the lock');
  assert.ok(authorityCheck < create, 'creation must follow the locked authority check');
  assert.ok(create < release, 'the lock must be held through official reference persistence');
});

test('spreadsheet-menu handlers fail before side effects in a web-app execution context', () => {
  for (const functionName of [
    'generateOrUpdateEditUrlFromMenu',
    'createStudentSheetFromMenu',
    'updateStudentSheetDropdownsFromMenu',
    'bulkImportStudentSheetFromMenu'
  ]) {
    const context = loadCode({ activeSpreadsheetAvailable: false });
    let result;
    assert.doesNotThrow(() => { result = context[functionName](); }, functionName);
    assert.equal(result && result.success, false, functionName);
    assert.deepEqual(context.__spreadsheetCreateCalls, [], functionName);
    assert.equal(context.__scriptProperties.STUDENT_SHEET_ID, undefined, functionName);
  }
});

test('student sheet creation creates only when the official ID is missing and initializes it beside the container', () => {
  const rootId = 'new-student-root-folder';
  const root = createDriveFolder({
    id: rootId,
    files: [createDriveFile({ id: 'new-student-scene', name: 'Scene.jpg' })]
  });
  const containerParent = createDriveFolder({ id: 'container-parent-folder' });
  const containerFile = createDriveFile({ id: 'container-spreadsheet-id', name: 'Container' });
  containerFile.__setParents([containerParent]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: createSheet('scenes', [EXPECTED_SCENE_HEADERS])
    },
    driveFolders: { [rootId]: root },
    driveFiles: { 'container-spreadsheet-id': containerFile }
  });

  const result = context.createStudentSheetFromMenu();
  const created = context.__createdSpreadsheets[0];
  const sheet = created.getSheetByName('シート1');

  assert.equal(result.success, true);
  assert.equal(result.alreadyExists, false);
  assert.deepEqual(context.__spreadsheetCreateCalls, ['一括入力用スプシ']);
  assert.equal(context.__scriptProperties.STUDENT_SHEET_ID, created.getId());
  assert.equal(configObject(context).STUDENT_SHEET_URL, created.getUrl());
  assert.deepEqual(sheet.__rows[0].slice(0, 8), STUDENT_HEADERS);
  assert.equal(sheet.__columnWidthCalls.length, 8);
  assert.equal(sheet.__frozenRows, 1);
  assert.equal(sheet.__dataValidationCalls.length, 3);
  assert.ok(context.__driveOperations.includes(`move:${created.getId()}:container-parent-folder`));
  assert.equal(context.__alerts.length, 0);
  assert.equal(context.__toasts.length, 1);
});

test('student sheet headers are repaired only when missing cells are safe to fill', () => {
  const studentId = 'studentSheetId123456789012345';
  const repairable = createSpreadsheet(studentId, `https://docs.google.com/spreadsheets/d/${studentId}/edit`, {
    'シート1': createSheet('シート1', [['No', '対象シーン', '', '説明', 'リンクURL', '写真', 'ジャンプ先', '状態']])
  });
  const context = loadCode({
    sheets: { config: createSheet('config', [['設定項目', '値', '説明'], ['STUDENT_SHEET_URL', 'stale-display-value', '']]) },
    scriptProperties: { STUDENT_SHEET_ID: studentId },
    externalSpreadsheets: { [studentId]: repairable }
  });

  const result = context.getStudentSheetContext_({ repairHeaders: true });
  assert.equal(result.id, studentId);
  assert.deepEqual(repairable.getSheetByName('シート1').__rows[0].slice(0, 8), STUDENT_HEADERS);
  assert.equal(configObject(context).STUDENT_SHEET_URL, repairable.getUrl());

  repairable.getSheetByName('シート1').__rows[0][2] = '別の列';
  assert.throws(() => context.getStudentSheetContext_({ repairHeaders: true }), /ヘッダー/);
});

test('bulk-input dropdowns accept scenes-typed joined images instead of the legacy image type', () => {
  const rootId = 'bulk-dropdown-folder';
  const studentId = 'bulkDropdownSheet123456789';
  const folder = createDriveFolder({
    id: rootId,
    files: [createDriveFile({ id: 'bulk-scene-file', name: 'Scene.jpg' })]
  });
  const studentSpreadsheet = createSpreadsheet(
    studentId,
    `https://docs.google.com/spreadsheets/d/${studentId}/edit`,
    { 'シート1': createSheet('シート1', [STUDENT_HEADERS]) }
  );
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, ''],
        ['STUDENT_SHEET_URL', 'https://docs.google.com/spreadsheets/d/wrong-config-sheet-123456/edit', '']
      ]),
      scenes: createSheet('scenes', [EXPECTED_SCENE_HEADERS])
    },
    scriptProperties: { STUDENT_SHEET_ID: studentId },
    externalSpreadsheets: { [studentId]: studentSpreadsheet },
    driveFolders: { [rootId]: folder }
  });

  const result = context.updateStudentSheetDropdownsFromMenu();

  assert.equal(result.success, true);
  assert.equal(context.readSceneRows_().byFileId['bulk-scene-file'].type, '360');
  assert.equal(configObject(context).STUDENT_SHEET_URL, studentSpreadsheet.getUrl());
  assert.deepEqual(studentSpreadsheet.getSheetByName('シート1').__rows, [STUDENT_HEADERS]);
  assert.equal(context.__alerts.length, 0);
  assert.equal(context.__toasts.length, 1);
});

test('bulk import reuses its existing script lock while synchronizing scenes', () => {
  const rootId = 'bulk-import-folder';
  const studentId = 'bulkImportSheet12345678901';
  const folder = createDriveFolder({
    id: rootId,
    files: [createDriveFile({ id: 'bulk-import-scene', name: 'Scene.jpg' })]
  });
  const studentSpreadsheet = createSpreadsheet(
    studentId,
    `https://docs.google.com/spreadsheets/d/${studentId}/edit`,
    {
      'シート1': createSheet('シート1', [
        STUDENT_HEADERS,
        [1, 'Scene.jpg', 'Imported label', 'Imported description', '', '', '', '']
      ])
    }
  );
  const infoSheet = createSheet('info', [INFO_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, ''],
        ['STUDENT_SHEET_URL', 'https://docs.google.com/spreadsheets/d/wrong-import-sheet-123456/edit', '']
      ]),
      scenes: createSheet('scenes', [EXPECTED_SCENE_HEADERS]),
      info: infoSheet
    },
    externalSpreadsheets: { [studentId]: studentSpreadsheet },
    scriptProperties: { STUDENT_SHEET_ID: studentId },
    driveFolders: { [rootId]: folder },
    rejectNestedLock: true
  });

  const result = context.bulkImportStudentSheetFromMenu();

  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.equal(infoSheet.__rows.some((row) => row[1] === 'bulk-import-scene'), true);
  assert.equal(configObject(context).STUDENT_SHEET_URL, studentSpreadsheet.getUrl());
  assert.equal(context.__alerts.length, 0);
  assert.equal(context.__toasts.length, 1);
  assert.match(context.__toasts[0].message, /1件/);
});

test('EDIT_URL is unchanged by setup or ordinary config writes and generated only by the explicit menu action', () => {
  const context = loadCode({
    sheets: { config: createSheet('config', [
      ['設定項目', '値', '説明'],
      ['WEB_APP_URL', 'https://example.test/exec?old=1', ''],
      ['EDIT_KEY', 'a b&c', ''],
      ['EDIT_URL', 'keep-this-value', '']
    ]) }
  });

  context.setupSheets();
  assert.equal(context.buildEditUrl_('https://example.test/exec?old=1', 'a b&c'), 'https://example.test/exec?mode=edit&editKey=a%20b%26c');
  assert.equal(configObject(context).EDIT_URL, 'keep-this-value');

  context.setConfigValue_('WEB_APP_URL', 'https://new.example/exec', '');
  assert.equal(configObject(context).EDIT_URL, 'keep-this-value');
  context.setConfigValue_('EDIT_KEY', 'new/key', '');
  assert.equal(configObject(context).EDIT_URL, 'keep-this-value');

  const result = context.generateOrUpdateEditUrlFromMenu();
  assert.equal(result.success, true);
  assert.equal(configObject(context).EDIT_URL, 'https://new.example/exec?mode=edit&editKey=new%2Fkey');
  assert.equal(context.__toasts.length, 1);
});

test('scenes upsert creates one row per file ID, preserves zero, and reports existing duplicates', () => {
  const context = loadCode();
  const sheet = context.getOrCreateScenesSheet_();

  context.upsertScenes_([
    { fileId: 'file-1', displayName: 'Scene 1', northOffset: 0, northOffsetSource: 'xmp' },
    { fileId: 'file-1', displayName: 'Scene 1 updated', northOffset: 0, northOffsetSource: 'xmp' }
  ], sheet);
  context.upsertScenes_([{ fileId: 'file-1', displayName: 'Scene 1 final' }], sheet);

  let snapshot = context.readSceneRows_(sheet);
  assert.equal(snapshot.rows.filter((row) => row.fileId === 'file-1').length, 1);
  assert.equal(snapshot.byFileId['file-1'].northOffset, 0);
  assert.equal(snapshot.byFileId['file-1'].displayName, 'Scene 1 final');

  sheet.appendRow(['file-1', 'duplicate']);
  snapshot = context.readSceneRows_(sheet);
  assert.deepEqual(Array.from(snapshot.duplicateFileIds), ['file-1']);
  assert.match(context.__warnings.join('\n'), /file-1/);
});

test('scenes upsert preserves formulas in columns that are not being updated', () => {
  const sheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['file-1', { value: 'Calculated scene', formula: '=A2&" scene"' }, '', '', '', '', '', '', '', '']
  ]);
  const context = loadCode({ sheets: { scenes: sheet } });

  context.upsertScenes_([{ fileId: 'file-1', northOffset: 0, northOffsetSource: 'xmp' }], sheet);

  assert.equal(sheet.getRange(2, 2).getFormulas()[0][0], '=A2&" scene"');
  assert.equal(context.readSceneRows_(sheet).byFileId['file-1'].displayName, 'Calculated scene');
});

test('scenes additions use the logical last data row when unchecked checkboxes make getLastRow return 1000', () => {
  const falseRows = Array.from({ length: 999 }, uncheckedSceneRow);
  const sheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS, ...falseRows]);
  const context = loadCode({ sheets: { scenes: sheet } });

  assert.equal(sheet.getLastRow(), 1000);
  context.upsertScenes_([{ fileId: 'first-file', displayName: 'First.jpg', type: '360' }], sheet);

  assert.equal(sheet.__rows[1][0], 'first-file');
  assert.equal(sheet.__rows.slice(2).some((row) => row[0] === 'first-file'), false);
  assert.equal(context.readSceneRows_(sheet).logicalLastRow, 2);
});

test('scenes additions append immediately after the existing logical scene instead of the FALSE tail', () => {
  const falseRows = Array.from({ length: 998 }, uncheckedSceneRow);
  const sheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['existing-file', 'Existing.jpg', 'root', '360', false, 1, '', '', '', ''],
    ...falseRows
  ]);
  const context = loadCode({ sheets: { scenes: sheet } });

  assert.equal(sheet.getLastRow(), 1000);
  context.upsertScenes_([{ fileId: 'next-file', displayName: 'Next.jpg', type: '2D' }], sheet);

  assert.equal(sheet.__rows[1][0], 'existing-file');
  assert.equal(sheet.__rows[2][0], 'next-file');
  assert.equal(context.readSceneRows_(sheet).logicalLastRow, 3);
});

test('scenes logical rows preserve id-less real data and never overwrite it with a new scene', () => {
  const sheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    uncheckedSceneRow(),
    ['', 'orphan value', '', '', false, '', '', '', '', ''],
    uncheckedSceneRow()
  ]);
  const context = loadCode({ sheets: { scenes: sheet } });

  context.upsertScenes_([{ fileId: 'after-orphan', displayName: 'After.jpg' }], sheet);

  assert.equal(sheet.__rows[2][1], 'orphan value');
  assert.equal(sheet.__rows[3][0], 'after-orphan');
  assert.deepEqual(Array.from(context.readSceneRows_(sheet).orphanRowNumbers), [3]);
});

test('setup leaves scenes data and formulas unchanged when a formula row would need to move', () => {
  const driveUpdatedAt = new Date('2026-07-18T03:00:00.000Z');
  const sceneUpdatedAt = new Date('2026-07-18T04:00:00.000Z');
  const sparseRows = [EXPECTED_SCENE_HEADERS];
  sparseRows.push(...Array.from({ length: 5 }, uncheckedSceneRow));
  sparseRows.push([
    'formula-file',
    { value: 'Formula scene', formula: '=A7&" scene"' },
    'root',
    '360',
    true,
    7,
    0,
    'manual',
    driveUpdatedAt,
    sceneUpdatedAt
  ]);
  sparseRows.push(...Array.from({ length: 3 }, uncheckedSceneRow));
  sparseRows.push(['second-file', 'Second.jpg', 'root', '2D', false, 8, '', 'none', '', 'updated']);
  sparseRows.push(...Array.from({ length: 3 }, uncheckedSceneRow));
  const sheet = createSheet('scenes', sparseRows);
  const context = loadCode({ sheets: { scenes: sheet } });
  const beforeDataRegion = JSON.stringify(sheet.__rows.slice(0, 11));

  context.setupSheets();

  assert.equal(JSON.stringify(sheet.__rows.slice(0, 11)), beforeDataRegion);
  assert.equal(sheet.__rows[6][0], 'formula-file');
  assert.equal(sheet.__rows[10][0], 'second-file');
  assert.equal(sheet.getRange(7, 2).getFormulas()[0][0], '=A7&" scene"');
  assert.deepEqual(sheet.getRange(7, 3, 1, 8).getValues()[0], [
    'root', '360', true, 7, 0, 'manual', driveUpdatedAt, sceneUpdatedAt
  ]);
  assert.equal(sheet.getLastRow(), 11);
  assert.match(String(context.__alerts), /数式.*移動|移動.*数式/);
  assert.equal(
    sheet.__setValuesCalls.some((call) => call.row >= 2 && call.col === 1 && call.numCols === EXPECTED_SCENE_HEADERS.length),
    false
  );
  assert.ok(sheet.__clearContentCalls.some((call) => call.row === 12 && call.numRows === 3));
  assert.ok(sheet.__dataValidationCalls.some((call) => call.col === 5));

  context.setupSheets();
  assert.equal(JSON.stringify(sheet.__rows.slice(0, 11)), beforeDataRegion);
  assert.equal(context.readSceneRows_(sheet).duplicateFileIds.length, 0);
});

test('setup compacts a formula-free scene above a 1000-row FALSE tail to row 2', () => {
  const sparseRows = [EXPECTED_SCENE_HEADERS];
  sparseRows.push(...Array.from({ length: 998 }, uncheckedSceneRow));
  sparseRows.push(['late-file', 'Late.jpg', 'root', '360', false, 1, 0, 'manual', '', '']);
  const sheet = createSheet('scenes', sparseRows);
  const context = loadCode({ sheets: { scenes: sheet } });

  assert.equal(sheet.getLastRow(), 1000);
  context.setupSheets();

  assert.equal(sheet.__rows[1][0], 'late-file');
  assert.equal(sheet.getLastRow(), 2);
  assert.equal(context.readSceneRows_(sheet).logicalLastRow, 2);
  assert.doesNotMatch(String(context.__alerts), /⚠️|数式.*移動|移動.*数式/);
});

test('setup keeps an already-positioned formula row untouched while compacting later formula-free scenes', () => {
  const sheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['formula-file', { value: 'Formula scene', formula: '=A2&" scene"' }, 'root', '360', false, 1, '', '', '', ''],
    uncheckedSceneRow(),
    uncheckedSceneRow(),
    ['later-file', 'Later.jpg', 'root', '2D', false, 2, '', '', '', ''],
    uncheckedSceneRow(),
    uncheckedSceneRow()
  ]);
  const context = loadCode({ sheets: { scenes: sheet } });
  const formulaBefore = JSON.stringify(sheet.__rows[1]);

  context.setupSheets();

  assert.equal(JSON.stringify(sheet.__rows[1]), formulaBefore);
  assert.equal(sheet.getRange(2, 2).getFormulas()[0][0], '=A2&" scene"');
  assert.equal(sheet.__rows[2][0], 'later-file');
  assert.equal(sheet.getLastRow(), 3);
  assert.equal(
    sheet.__setValuesCalls.some((call) => call.row === 2 && call.col === 1 && call.numCols === EXPECTED_SCENE_HEADERS.length),
    false
  );
});

test('setup fails closed without changing scenes data when formulas cannot be read reliably', () => {
  const sheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    uncheckedSceneRow(),
    ['formula-file', { value: '', formula: '=A3' }, 'root', '360', false, 1, '', '', '', '']
  ]);
  const originalGetRange = sheet.getRange.bind(sheet);
  sheet.getRange = function(row, col, numRows, numCols) {
    const range = originalGetRange(row, col, numRows, numCols);
    if (row === 2 && col === 1) {
      range.getFormulas = function() { throw new Error('formulas unavailable'); };
    }
    return range;
  };
  const context = loadCode({ sheets: { scenes: sheet } });
  const before = JSON.stringify(sheet.__rows);

  assert.throws(() => context.setupSheets(), /数式|formulas unavailable/);

  assert.equal(JSON.stringify(sheet.__rows), before);
  assert.equal(sheet.__clearContentCalls.length, 0);
  assert.equal(
    sheet.__setValuesCalls.some((call) => call.row >= 2 && call.col === 1 && call.numCols === EXPECTED_SCENE_HEADERS.length),
    false
  );
});

test('setup does not compact scenes when id-less real data or duplicate file IDs make movement unsafe', () => {
  const orphanSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    uncheckedSceneRow(),
    ['', 'orphan value', '', '', false, '', '', '', '', ''],
    uncheckedSceneRow(),
    ['valid-file', 'Valid.jpg', 'root', '360', false, 1, '', '', '', '']
  ]);
  const orphanContext = loadCode({ sheets: { scenes: orphanSheet } });
  const orphanBefore = JSON.stringify(orphanSheet.__rows);

  orphanContext.setupSheets();

  assert.equal(JSON.stringify(orphanSheet.__rows), orphanBefore);
  assert.match(String(orphanContext.__alerts), /DriveファイルID|孤立|自動.*移動/);

  const duplicateSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    uncheckedSceneRow(),
    ['duplicate-file', 'First.jpg', 'root', '360', false, 1, '', '', '', ''],
    uncheckedSceneRow(),
    ['duplicate-file', 'Second.jpg', 'root', '360', false, 2, '', '', '', '']
  ]);
  const duplicateContext = loadCode({ sheets: { scenes: duplicateSheet } });
  const duplicateBefore = JSON.stringify(duplicateSheet.__rows);

  duplicateContext.setupSheets();

  assert.equal(JSON.stringify(duplicateSheet.__rows), duplicateBefore);
  assert.match(String(duplicateContext.__alerts), /重複.*自動.*移動|自動.*移動.*重複/);
});

test('scene checkbox assistance applies validation without generating FALSE values', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const start = code.indexOf('function applyScenesDataValidations_(');
  const end = code.indexOf('function repairScenesSheet_(', start);
  const body = code.slice(start, end);

  assert.match(body, /requireCheckbox\(\)/);
  assert.match(body, /setDataValidation\(/);
  assert.doesNotMatch(body, /insertCheckboxes\(/);
});

test('automatic northOffset updates respect a manual source produced by a formula', () => {
  const sheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['file-1', '', '', '', '', '', 90, { value: 'manual', formula: '="manual"' }, '', '']
  ]);
  const context = loadCode({ sheets: { scenes: sheet } });

  context.setCachedNorthOffset_('file-1', 180, 'xmp');

  const scene = context.readSceneRows_(sheet).byFileId['file-1'];
  assert.equal(scene.northOffset, 90);
  assert.equal(scene.northOffsetSource, 'manual');
  assert.equal(sheet.getRange(2, 8).getFormulas()[0][0], '="manual"');
});

test('automatic northOffset writes go to scenes and never overwrite manual values', () => {
  const context = loadCode({
    sheets: { config: createSheet('config', [['設定項目', '値', '説明'], ['NORTH_file-1', '45', 'legacy']]) }
  });

  context.setCachedNorthOffset_('file-1', 0, 'xmp');
  assert.equal(configRows(context).filter((row) => row[0] === 'NORTH_file-1').length, 1);
  assert.equal(configObject(context)['NORTH_file-1'], '45');
  let cached = context.getCachedNorthOffset_('file-1');
  assert.equal(cached.cached, true);
  assert.equal(cached.value, 0);
  assert.equal(cached.source, 'xmp');

  context.upsertScenes_([{ fileId: 'file-1', northOffset: 90, northOffsetSource: 'manual' }]);
  context.setCachedNorthOffset_('file-1', 180, 'xmp');
  cached = context.getCachedNorthOffset_('file-1');
  assert.equal(cached.value, 90);
  assert.equal(cached.source, 'manual');

  context.setCachedNorthOffset_('file-2', null, 'none');
  cached = context.getCachedNorthOffset_('file-2');
  assert.equal(cached.cached, true);
  assert.equal(cached.value, null);
  assert.equal(cached.source, 'none');
});

test('loadHotspots routes northOffset through authorized existing-scene helpers', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const loadStart = code.indexOf('function loadHotspots(');
  const saveStart = code.indexOf('function saveHotspot(', loadStart);
  const loadBody = code.slice(loadStart, saveStart);

  assert.match(loadBody, /getOrExtractNorthOffset_\(/);
  assert.match(code, /function getOrExtractNorthOffset_\([\s\S]*?getNorthOffsetAccessContext_\(/);
  assert.match(code, /function getOrExtractNorthOffset_\([\s\S]*?updateExistingSceneNorthOffset_\(/);
  assert.doesNotMatch(
    code.slice(code.indexOf('function getOrExtractNorthOffset_('), code.indexOf('// ============================================================', code.indexOf('function getOrExtractNorthOffset_('))),
    /setCachedNorthOffset_\(/
  );
});

test('setup migrates valid NORTH rows, preserves invalid and conflicting rows, and is idempotent', () => {
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['NORTH_numeric-file', '0', 'legacy'],
        ['NORTH_none-file', 'NONE', 'legacy'],
        ['NORTH_invalid-file', '12degrees', 'legacy'],
        ['NORTH_manual-file', '45', 'legacy']
      ]),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        ['manual-file', '', '', '', '', '', 90, 'manual', '', 'existing']
      ])
    }
  });

  context.setupSheets();
  const firstRows = JSON.stringify(context.__spreadsheet.getSheetByName('scenes').__rows);
  context.setupSheets();
  const secondRows = JSON.stringify(context.__spreadsheet.getSheetByName('scenes').__rows);
  const config = configObject(context);
  const scenes = context.readSceneRows_();

  assert.equal(secondRows, firstRows);
  assert.equal(scenes.byFileId['numeric-file'].northOffset, 0);
  assert.equal(scenes.byFileId['numeric-file'].northOffsetSource, 'xmp');
  assert.equal(scenes.byFileId['none-file'].northOffset, null);
  assert.equal(scenes.byFileId['none-file'].northOffsetSource, 'none');
  assert.equal(config['NORTH_numeric-file'], undefined);
  assert.equal(config['NORTH_none-file'], undefined);
  assert.equal(config['NORTH_invalid-file'], '12degrees');
  assert.equal(config['NORTH_manual-file'], '45');
  assert.equal(scenes.byFileId['manual-file'].northOffset, 90);
  assert.equal(scenes.byFileId['manual-file'].northOffsetSource, 'manual');
});

test('northOffset migration registers a new scene at row 2 despite a 1000-row FALSE checkbox tail', () => {
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ...Array.from({ length: 999 }, uncheckedSceneRow)
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['NORTH_migrated-file', '45', 'legacy']
      ]),
      scenes: scenesSheet
    }
  });

  assert.equal(scenesSheet.getLastRow(), 1000);
  context.setupSheets();

  assert.equal(scenesSheet.__rows[1][0], 'migrated-file');
  assert.equal(context.readSceneRows_(scenesSheet).byFileId['migrated-file'].northOffset, 45);
  assert.equal(configObject(context)['NORTH_migrated-file'], undefined);
});

test('folder sync batch-registers Drive images once with parent, order, metadata, and no Blob reads', () => {
  const rootId = 'root-folder-phase2';
  const files = [
    createDriveFile({ id: 'drive-home', name: '[HOME] Lobby.jpg' }),
    createDriveFile({ id: 'drive-map', name: 'Floor [2D].png', mimeType: 'image/png' }),
    createDriveFile({ id: 'drive-room', name: 'Room.jpg' })
  ];
  const folder = createDriveFolder({ id: rootId, files });
  const scenesSheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  const context = loadCode({
    sheets: {
      scenes: scenesSheet,
      info: createSheet('info', [INFO_HEADERS, ['keep', 'missing-id', 'label']])
    },
    driveFolders: { [rootId]: folder }
  });

  const first = context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });
  assert.equal(first.error, undefined);
  let snapshot = context.readSceneRows_(scenesSheet);
  assert.equal(snapshot.rows.length, 3);
  assert.equal(snapshot.byFileId['drive-home'].parentFolderId, rootId);
  assert.equal(snapshot.byFileId['drive-map'].type, '2D');
  assert.equal(snapshot.byFileId['drive-home'].isHome, true);
  assert.deepEqual(
    Array.from(snapshot.rows, (row) => row.displayOrder).sort((a, b) => a - b),
    [1, 2, 3]
  );
  assert.equal(snapshot.byFileId['drive-room'].northOffset, null);
  assert.equal(snapshot.byFileId['drive-room'].northOffsetSource, '');
  assert.ok(snapshot.byFileId['drive-room'].driveUpdatedAt);
  assert.ok(snapshot.byFileId['drive-room'].sceneUpdatedAt);
  assert.equal(files.reduce((sum, file) => sum + file.__blobReads, 0), 0);

  const dataReadsAfterFirstSync = scenesSheet.__getValuesCalls.filter((call) => call.row === 2).length;
  const batchAdds = scenesSheet.__setValuesCalls.filter((call) => call.row === 2 && call.numRows === 3);
  assert.equal(dataReadsAfterFirstSync, 1, 'header-only scenes needs no data-range read before the batch add');
  assert.equal(batchAdds.length, 1);
  const rowsAfterFirstSync = JSON.stringify(scenesSheet.__rows);
  const cachedJoined = JSON.parse(context.__cache.get('FOLDER_LIST_V2_' + rootId));
  assert.equal(cachedJoined.images.find((item) => item.id === 'drive-map').sceneType, '2D');
  assert.equal(cachedJoined.images.find((item) => item.id === 'drive-home').isHome, true);

  context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });
  snapshot = context.readSceneRows_(scenesSheet);
  assert.equal(JSON.stringify(scenesSheet.__rows), rowsAfterFirstSync);
  assert.equal(snapshot.rows.length, 3);
  assert.equal(new Set(snapshot.rows.map((row) => row.fileId)).size, 3);
  assert.equal(files.reduce((sum, file) => sum + file.__blobReads, 0), 0);

  const returnedMap = Object.fromEntries(first.images.filter((item) => item.type !== 'folder').map((item) => [item.id, item]));
  assert.equal(returnedMap['drive-map'].type, '2D');
  assert.equal(returnedMap['drive-map'].sceneType, '2D');
  assert.equal(returnedMap['drive-home'].isHome, true);
  assert.equal(returnedMap['drive-room'].parentFolderId, rootId);
});

test('Drive folder sync uses the common logical scenes insertion row', () => {
  const rootId = 'logical-row-sync-root';
  const file = createDriveFile({ id: 'logical-row-sync-file', name: 'Synced.jpg' });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ...Array.from({ length: 999 }, uncheckedSceneRow)
  ]);
  const context = loadCode({
    sheets: { scenes: scenesSheet },
    driveFolders: { [rootId]: createDriveFolder({ id: rootId, files: [file] }) }
  });

  context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });

  assert.equal(scenesSheet.__rows[1][0], 'logical-row-sync-file');
  assert.equal(context.readSceneRows_(scenesSheet).logicalLastRow, 2);
});

test('folder sync stores a Drive name beginning with equals as literal scenes text', () => {
  const rootId = 'formula-name-sync-root';
  const fileId = 'formula-name-sync-file';
  const file = createDriveFile({ id: fileId, name: '=Map.jpg' });
  const scenesSheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  const context = loadCode({
    sheets: { scenes: scenesSheet },
    driveFolders: { [rootId]: createDriveFolder({ id: rootId, files: [file] }) }
  });

  const result = context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });
  const snapshot = context.readSceneRows_(scenesSheet);

  assert.equal(result.error, undefined);
  assert.equal(snapshot.byFileId[fileId].displayName, '=Map.jpg');
  assert.equal(scenesSheet.__rows[1][1], "'=Map.jpg");
  assert.equal(scenesSheet.getRange(2, 2, 1, 1).getFormulas()[0][0], '');
});

test('folder sync never deletes scenes or info for a missing image and changes nothing on Drive failure', () => {
  const rootId = 'root-folder-safety';
  const present = createDriveFile({ id: 'present-file', name: 'Present.jpg' });
  const folder = createDriveFolder({ id: rootId, files: [present] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['present-file', 'Present', rootId, '360', true, 1, '', '', '', ''],
    ['temporarily-missing', 'Keep me', rootId, '2D', false, 2, 0, 'manual', '', '']
  ]);
  const infoSheet = createSheet('info', [
    INFO_HEADERS,
    ['keep', 'temporarily-missing', 'label', 'description']
  ]);
  const context = loadCode({
    sheets: { scenes: scenesSheet, info: infoSheet },
    driveFolders: { [rootId]: folder }
  });

  const listed = context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });
  assert.equal(listed.error, undefined);
  assert.ok(context.readSceneRows_(scenesSheet).byFileId['temporarily-missing']);
  assert.equal(infoSheet.getLastRow(), 2);

  const scenesBeforeFailure = JSON.stringify(scenesSheet.__rows);
  const infoBeforeFailure = JSON.stringify(infoSheet.__rows);
  const cacheBeforeFailure = context.__cache.get('FOLDER_LIST_V2_' + rootId);
  folder.__setListError('permission denied');
  const failed = context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });

  assert.match(failed.error, /アクセス|取得|同期/);
  assert.equal(failed.errorStage, 'drive-list');
  assert.equal(JSON.stringify(scenesSheet.__rows), scenesBeforeFailure);
  assert.equal(JSON.stringify(infoSheet.__rows), infoBeforeFailure);
  assert.equal(context.__cache.get('FOLDER_LIST_V2_' + rootId), cacheBeforeFailure);
});

test('folder sync moves one existing scene row and invalidates both previous and current parent caches', () => {
  const rootId = 'move-root-folder-123';
  const previousFolderId = 'move-folder-a-123';
  const currentFolderId = 'move-folder-b-123';
  const fileId = 'moved-scene-file-123';

  function createMoveContext(cacheRemoveError) {
    const movedFile = createDriveFile({ id: fileId, name: 'Moved.jpg' });
    const scenesSheet = createSheet('scenes', [
      EXPECTED_SCENE_HEADERS,
      [fileId, 'Moved.jpg', previousFolderId, '360', false, 1, '', '', '', '']
    ]);
    const infoSheet = createSheet('info', [
      INFO_HEADERS,
      ['date', fileId, 'keep hotspot', 'keep description', '', 1, 2, 'circle', 'blue', 'info', '', '', 'move-hotspot']
    ]);
    const context = loadCode({
      sheets: { scenes: scenesSheet, info: infoSheet },
      driveFolders: {
        [rootId]: createDriveFolder({ id: rootId }),
        [previousFolderId]: createDriveFolder({ id: previousFolderId, parentIds: [rootId] }),
        [currentFolderId]: createDriveFolder({ id: currentFolderId, parentIds: [rootId], files: [movedFile] })
      },
      cacheValues: {
        ['FOLDER_LIST_V2_' + previousFolderId]: JSON.stringify({ images: [{ id: fileId }] }),
        ['FOLDER_LIST_V2_' + currentFolderId]: JSON.stringify({ images: [] })
      },
      cacheRemoveError: cacheRemoveError || null
    });
    return { context, scenesSheet, infoSheet };
  }

  const normal = createMoveContext(null);
  const infoBefore = JSON.stringify(normal.infoSheet.__rows);
  const result = normal.context.getConfigFromFolder_(currentFolderId, {
    forceRefresh: true,
    rootFolderId: rootId
  });
  const snapshot = normal.context.readSceneRows_(normal.scenesSheet);

  assert.equal(result.error, undefined);
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.byFileId[fileId].parentFolderId, currentFolderId);
  assert.equal(new Set(snapshot.rows.map((row) => row.fileId)).size, 1);
  assert.equal(JSON.stringify(normal.infoSheet.__rows), infoBefore);
  assert.ok(normal.context.__cacheRemovals.includes('FOLDER_LIST_V2_' + previousFolderId));
  assert.ok(normal.context.__cacheRemovals.includes('FOLDER_LIST_V2_' + currentFolderId));
  assert.deepEqual(
    Array.from(result.sync.cacheFolderIdsToInvalidate).sort(),
    [previousFolderId, currentFolderId].sort()
  );
  assert.equal(result.partialSuccess, false);

  const failedCache = createMoveContext('cache remove failed');
  const failedResult = failedCache.context.getConfigFromFolder_(currentFolderId, {
    forceRefresh: true,
    rootFolderId: rootId
  });
  const failedSnapshot = failedCache.context.readSceneRows_(failedCache.scenesSheet);

  assert.equal(failedResult.error, undefined);
  assert.equal(failedSnapshot.rows.length, 1);
  assert.equal(failedSnapshot.byFileId[fileId].parentFolderId, currentFolderId);
  assert.equal(failedResult.partialSuccess, true);
  assert.match(failedResult.warning, /キャッシュ/);
  assert.deepEqual(
    Array.from(failedResult.sync.cacheInvalidationFailedFolderIds).sort(),
    [previousFolderId, currentFolderId].sort()
  );
  assert.ok(failedCache.context.__errors.some((entry) =>
    entry.includes('stage=cache-invalidate') && entry.includes(previousFolderId)
  ));
  assert.ok(failedCache.context.__errors.some((entry) =>
    entry.includes('stage=cache-invalidate') && entry.includes(currentFolderId)
  ));
});

test('folder sync clears home when a root image moves to a child regardless of sync order', () => {
  const rootId = 'home-move-root-folder-123';
  const childId = 'home-move-child-folder-123';
  const movedId = 'home-move-old-file-123';
  const replacementId = 'home-move-replacement-file-123';

  function createHomeMoveContext() {
    const movedFile = createDriveFile({ id: movedId, name: 'Moved.jpg' });
    const replacementFile = createDriveFile({ id: replacementId, name: 'Replacement.jpg' });
    const scenesSheet = createSheet('scenes', [
      EXPECTED_SCENE_HEADERS,
      [movedId, 'Moved.jpg', rootId, '360', true, 1, '', '', '', ''],
      [replacementId, 'Replacement.jpg', rootId, '360', false, 2, '', '', '', '']
    ]);
    const infoSheet = createSheet('info', [
      INFO_HEADERS,
      ['date', movedId, 'keep hotspot', '', '', 0, 0, 'circle', 'blue', 'info', '', '', 'home-move-hotspot']
    ]);
    const context = loadCode({
      sheets: { scenes: scenesSheet, info: infoSheet },
      driveFolders: {
        [rootId]: createDriveFolder({ id: rootId, files: [replacementFile] }),
        [childId]: createDriveFolder({ id: childId, parentIds: [rootId], files: [movedFile] })
      }
    });
    return { context, scenesSheet, infoSheet };
  }

  for (const order of [[rootId, childId], [childId, rootId]]) {
    const fixture = createHomeMoveContext();
    const infoBefore = JSON.stringify(fixture.infoSheet.__rows);
    for (const folderId of order) {
      const result = fixture.context.getConfigFromFolder_(folderId, {
        forceRefresh: true,
        rootFolderId: rootId
      });
      assert.equal(result.error, undefined, `sync failed for ${folderId}`);
    }

    const snapshot = fixture.context.readSceneRows_(fixture.scenesSheet);
    assert.equal(snapshot.rows.length, 2);
    assert.equal(new Set(snapshot.rows.map((row) => row.fileId)).size, 2);
    assert.equal(snapshot.byFileId[movedId].parentFolderId, childId);
    assert.equal(snapshot.byFileId[movedId].isHome, false);
    assert.equal(snapshot.byFileId[replacementId].isHome, true);
    assert.equal(snapshot.rows.filter((row) => row.isHome).length, 1);
    assert.equal(JSON.stringify(fixture.infoSheet.__rows), infoBefore);
  }
});

test('folder sync reports Drive listing and scenes failures as distinct stages', () => {
  const driveFailureId = 'sync-stage-drive-folder';
  const driveFailureFolder = createDriveFolder({
    id: driveFailureId,
    listError: 'permission denied'
  });
  const driveFailureContext = loadCode({
    sheets: { scenes: createSheet('scenes', [EXPECTED_SCENE_HEADERS]) },
    driveFolders: { [driveFailureId]: driveFailureFolder }
  });
  const driveFailure = driveFailureContext.getConfigFromFolder_(driveFailureId, {
    forceRefresh: true,
    rootFolderId: driveFailureId
  });
  assert.equal(driveFailure.errorStage, 'drive-list');

  const scenesFailureId = 'sync-stage-scenes-folder';
  const scenesFailureFolder = createDriveFolder({ id: scenesFailureId, files: [] });
  const failingScenes = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  failingScenes.getRange = function () { throw new Error('scenes unavailable'); };
  const scenesFailureContext = loadCode({
    sheets: { scenes: failingScenes },
    driveFolders: { [scenesFailureId]: scenesFailureFolder }
  });
  const scenesFailure = scenesFailureContext.getConfigFromFolder_(scenesFailureId, {
    forceRefresh: true,
    rootFolderId: scenesFailureId
  });
  assert.equal(scenesFailure.errorStage, 'scenes-sync');
});

test('public folder navigation synchronizes only the configured root subtree', () => {
  const rootId = 'configured-root-folder-123';
  const childId = 'configured-child-folder-123';
  const outsideId = 'outside-drive-folder-123';
  const childFile = createDriveFile({ id: 'child-image-file', name: 'Child.jpg' });
  const outsideFile = createDriveFile({ id: 'outside-image-file', name: 'Outside.jpg' });
  const rootFolder = createDriveFolder({ id: rootId });
  const childFolder = createDriveFolder({
    id: childId,
    parentIds: [rootId],
    files: [childFile]
  });
  const outsideFolder = createDriveFolder({ id: outsideId, files: [outsideFile] });
  const scenesSheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: {
      [rootId]: rootFolder,
      [childId]: childFolder,
      [outsideId]: outsideFolder
    }
  });

  const allowed = context.navigateToFolder(childId, true);
  assert.equal(allowed.error, undefined);
  assert.ok(context.readSceneRows_(scenesSheet).byFileId['child-image-file']);

  const rejected = context.navigateToFolder(outsideId, true);
  assert.match(rejected.error, /ルートフォルダ|範囲|配下/);
  assert.equal(context.readSceneRows_(scenesSheet).byFileId['outside-image-file'], undefined);
});

test('legacy filename tags apply only on first registration and existing scenes settings win', () => {
  const rootId = 'root-folder-tags';
  const existing = createDriveFile({ id: 'existing', name: '[2D] [HOME] Existing.jpg' });
  const newHomeA = createDriveFile({ id: 'new-home-a', name: '[HOME] A.jpg' });
  const newHomeB = createDriveFile({ id: 'new-home-b', name: '[HOME] B.jpg' });
  const newMap = createDriveFile({ id: 'new-map', name: '[2D] Map.jpg' });
  const folder = createDriveFolder({ id: rootId, files: [newHomeB, newMap, existing, newHomeA] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['existing', 'Existing', rootId, '360', true, 1, '', '', '', '']
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(rootId), scenes: scenesSheet },
    driveFolders: { [rootId]: folder }
  });

  context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });
  let snapshot = context.readSceneRows_(scenesSheet);
  assert.equal(snapshot.byFileId.existing.type, '360');
  assert.equal(snapshot.byFileId.existing.isHome, true);
  assert.equal(snapshot.byFileId['new-map'].type, '2D');
  assert.equal(snapshot.rows.filter((row) => row.isHome === true).length, 1);

  existing.__setNameDirect('Existing.jpg');
  newMap.__setNameDirect('Map.jpg');
  newHomeA.__setNameDirect('[2D] [HOME] A.jpg');
  context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });
  snapshot = context.readSceneRows_(scenesSheet);

  assert.equal(snapshot.byFileId.existing.type, '360');
  assert.equal(snapshot.byFileId['new-map'].type, '2D');
  assert.equal(snapshot.byFileId['new-home-a'].type, '360');
  assert.equal(snapshot.byFileId.existing.isHome, true);
  assert.equal(snapshot.byFileId['new-home-a'].isHome, false);
});

test('root home normalization keeps one valid home and otherwise selects the first scene order', () => {
  const rootId = 'root-folder-home';
  const files = [
    createDriveFile({ id: 'order-two', name: 'B.jpg' }),
    createDriveFile({ id: 'order-one', name: 'A.jpg' }),
    createDriveFile({ id: 'order-three', name: 'C.jpg' })
  ];
  const folder = createDriveFolder({ id: rootId, files });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['order-two', 'B', rootId, '360', true, 2, '', '', '', ''],
    ['order-one', 'A', rootId, '360', true, 1, '', '', '', ''],
    ['order-three', 'C', rootId, '360', false, 3, '', '', '', '']
  ]);
  const context = loadCode({
    sheets: { scenes: scenesSheet },
    driveFolders: { [rootId]: folder }
  });

  const result = context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });
  let snapshot = context.readSceneRows_(scenesSheet);
  assert.equal(snapshot.byFileId['order-one'].isHome, true);
  assert.equal(snapshot.byFileId['order-two'].isHome, false);
  assert.deepEqual(
    Array.from(result.images).filter((item) => item.type !== 'folder').map((item) => item.id),
    ['order-one', 'order-two', 'order-three']
  );

  context.upsertScenes_([
    { fileId: 'order-one', isHome: false },
    { fileId: 'order-two', isHome: false }
  ], scenesSheet);
  context.getConfigFromFolder_(rootId, { forceRefresh: true, rootFolderId: rootId });
  snapshot = context.readSceneRows_(scenesSheet);
  assert.equal(snapshot.byFileId['order-one'].isHome, true);
  assert.equal(snapshot.rows.filter((row) => row.isHome === true).length, 1);
});

test('uploads keep the original filename and register the UI-selected 2D or 360 type in scenes', () => {
  const rootId = 'upload-root-folder-123';
  const operations = [];
  const folder = createDriveFolder({ id: rootId, files: [], operations });
  const scenesSheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    driveOperations: operations
  });

  const mapResult = context.uploadImageToDrive({
    __editToken: 'valid-token',
    base64: 'data:image/png;base64,YQ==',
    fileName: 'Floor.png',
    mimeType: 'image/png',
    is2D: true,
    targetFolderId: rootId
  });
  const panoramaResult = context.uploadImageToDrive({
    __editToken: 'valid-token',
    base64: 'data:image/jpeg;base64,Yg==',
    fileName: 'Lobby.jpg',
    mimeType: 'image/jpeg',
    is2D: false,
    targetFolderId: rootId
  });

  assert.equal(mapResult.success, true);
  assert.equal(panoramaResult.success, true);
  assert.equal(mapResult.file.name, 'Floor.png');
  assert.equal(panoramaResult.file.name, 'Lobby.jpg');
  assert.equal(mapResult.file.type, '2D');
  assert.equal(panoramaResult.file.type, '360');
  assert.doesNotMatch(folder.__files[0].getName(), /\[2D\]/);

  const scenes = context.readSceneRows_(scenesSheet);
  assert.equal(scenes.byFileId[mapResult.file.id].type, '2D');
  assert.equal(scenes.byFileId[panoramaResult.file.id].type, '360');
  assert.equal(scenes.byFileId[mapResult.file.id].parentFolderId, rootId);
  assert.equal(mapResult.sceneRegistered, true);
  assert.equal(panoramaResult.sceneRegistered, true);
});

test('upload registration uses the common logical scenes insertion row', () => {
  const rootId = 'logical-row-upload-root';
  const folder = createDriveFolder({ id: rootId, files: [] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ...Array.from({ length: 999 }, uncheckedSceneRow)
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  const result = context.uploadImageToDrive({
    __editToken: 'valid-token',
    base64: 'data:image/jpeg;base64,YQ==',
    fileName: 'Uploaded.jpg',
    mimeType: 'image/jpeg',
    is2D: false,
    targetFolderId: rootId
  });

  assert.equal(result.success, true);
  assert.equal(scenesSheet.__rows[1][0], result.file.id);
  assert.equal(context.readSceneRows_(scenesSheet).logicalLastRow, 2);
});

test('upload reports partial success and never trashes a created Drive file when scenes sync fails', () => {
  const rootId = 'upload-partial-folder';
  const operations = [];
  const folder = createDriveFolder({ id: rootId, files: [], operations });
  const failingScenes = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  failingScenes.getRange = function () { throw new Error('scenes unavailable'); };
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: failingScenes
    },
    driveFolders: { [rootId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    driveOperations: operations
  });

  const result = context.uploadImageToDrive({
    __editToken: 'valid-token',
    base64: 'data:image/jpeg;base64,YQ==',
    fileName: 'Created.jpg',
    mimeType: 'image/jpeg',
    is2D: false,
    targetFolderId: rootId
  });

  assert.equal(result.success, true);
  assert.equal(result.partialSuccess, true);
  assert.equal(result.sceneRegistered, false);
  assert.match(result.warning, /scenes|同期/);
  assert.equal(folder.__files.length, 1);
  assert.equal(folder.__files[0].__trashed, false);
  assert.equal(operations.some((entry) => entry.startsWith('trash:')), false);
});

test('upload does not report Drive failure after file creation when cache invalidation fails', () => {
  const rootId = 'upload-cache-failure-folder';
  const operations = [];
  const folder = createDriveFolder({ id: rootId, files: [], operations });
  const scenesSheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    driveOperations: operations,
    cacheRemoveError: 'cache unavailable'
  });

  const result = context.uploadImageToDrive({
    __editToken: 'valid-token',
    base64: 'data:image/jpeg;base64,YQ==',
    fileName: 'Created.jpg',
    mimeType: 'image/jpeg',
    is2D: false,
    targetFolderId: rootId
  });

  assert.equal(result.success, true);
  assert.equal(result.driveUpdated, true);
  assert.equal(result.sceneRegistered, true);
  assert.equal(result.partialSuccess, true);
  assert.equal(result.cacheInvalidated, false);
  assert.match(result.warning, /キャッシュ/);
  assert.equal(folder.__files[0].__trashed, false);
});

test('upload rejects a target folder outside the configured root subtree', () => {
  const rootId = 'upload-scope-root-folder-123';
  const outsideId = 'upload-scope-outside-folder-123';
  const rootFolder = createDriveFolder({ id: rootId });
  const outsideFolder = createDriveFolder({ id: outsideId });
  const scenesSheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: {
      [rootId]: rootFolder,
      [outsideId]: outsideFolder
    },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  const result = context.uploadImageToDrive({
    __editToken: 'valid-token',
    base64: 'data:image/jpeg;base64,YQ==',
    fileName: 'Outside.jpg',
    mimeType: 'image/jpeg',
    is2D: false,
    targetFolderId: outsideId
  });

  assert.equal(result.success, false);
  assert.match(result.error, /ルートフォルダ|範囲|配下/);
  assert.equal(outsideFolder.__files.length, 0);
  assert.equal(context.readSceneRows_(scenesSheet).rows.length, 0);
});

test('scene name validation normalizes the original extension and rejects every extension-like mismatch', () => {
  const context = loadCode();

  const png = context.normalizeSceneNameForSave_(' 校内.体育館.PNG ', 'Before.PNG', 'image/png');
  assert.equal(png.baseName, '校内.体育館');
  assert.equal(png.fullName, '校内.体育館.PNG');
  assert.equal(png.extension, '.PNG');

  const jpeg = context.normalizeSceneNameForSave_('校庭', 'Before.jpeg', 'image/jpeg');
  assert.equal(jpeg.fullName, '校庭.jpeg');

  const dottedBase = context.normalizeSceneNameForSave_('Map.v2', 'Map.v2.jpg', 'image/jpeg');
  assert.equal(dottedBase.baseName, 'Map.v2');
  assert.equal(dottedBase.fullName, 'Map.v2.jpg');

  const unchangedAlphaDottedBase = context.normalizeSceneNameForSave_('校舎.main', '校舎.main.jpg', 'image/jpeg');
  assert.equal(unchangedAlphaDottedBase.baseName, '校舎.main');
  assert.equal(unchangedAlphaDottedBase.fullName, '校舎.main.jpg');

  const unchangedRepeatedExtensionBase = context.normalizeSceneNameForSave_('archive.jpg', 'archive.jpg.jpg', 'image/jpeg');
  assert.equal(unchangedRepeatedExtensionBase.baseName, 'archive.jpg');
  assert.equal(unchangedRepeatedExtensionBase.fullName, 'archive.jpg.jpg');

  const unchangedFinalBase = context.normalizeSceneNameForSave_('Map.final', 'Map.final.jpg', 'image/jpeg');
  assert.equal(unchangedFinalBase.baseName, 'Map.final');
  assert.equal(unchangedFinalBase.fullName, 'Map.final.jpg');

  const repeatedExtension = context.normalizeSceneNameForSave_('Gym.JPG', 'Before.jpg', 'image/jpeg');
  assert.equal(repeatedExtension.baseName, 'Gym');
  assert.equal(repeatedExtension.fullName, 'Gym.jpg');

  const numericJapaneseBase = context.normalizeSceneNameForSave_('撮影.2026', 'Before.jpg', 'image/jpeg');
  assert.equal(numericJapaneseBase.fullName, '撮影.2026.jpg');

  assert.throws(() => context.normalizeSceneNameForSave_('', 'Before.jpg', 'image/jpeg'), /空|名前/);
  assert.throws(() => context.normalizeSceneNameForSave_('Bad\u0000Name', 'Before.jpg', 'image/jpeg'), /制御/);
  for (const invalidName of [
    'After.jpeg', 'After.png', 'After.bmp', '資料.pdf', '資料.txt', '資料.docx', '資料.zip'
  ]) {
    assert.throws(
      () => context.normalizeSceneNameForSave_(invalidName, 'Before.jpg', 'image/jpeg'),
      /拡張子/,
      invalidName
    );
  }
  assert.throws(() => context.normalizeSceneNameForSave_('After', 'Before.jpg', 'image/png'), /MIME|拡張子/);
});

test('scene settings preserve unchanged alphabetic dotted basenames without a Drive rename', () => {
  for (const scenario of [
    { fileId: 'main-name-file', fullName: '校舎.main.jpg', baseName: '校舎.main' },
    { fileId: 'repeated-name-file', fullName: 'archive.jpg.jpg', baseName: 'archive.jpg' }
  ]) {
    const folderId = scenario.fileId + '-folder';
    const operations = [];
    const file = createDriveFile({ id: scenario.fileId, name: scenario.fullName, operations });
    const scenesSheet = createSheet('scenes', [
      EXPECTED_SCENE_HEADERS,
      [scenario.fileId, scenario.fullName, folderId, '360', false, 1, 10, 'manual', '', '']
    ]);
    const context = loadCode({
      sheets: { config: createFolderConfigSheet(folderId), scenes: scenesSheet },
      driveFolders: { [folderId]: createDriveFolder({ id: folderId, files: [file] }) },
      cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
      driveOperations: operations
    });

    const result = context.updateSceneSettings({
      __editToken: 'valid-token',
      fileId: scenario.fileId,
      name: scenario.baseName,
      type: '360',
      northOffsetMode: 'manual',
      northOffset: 10
    });

    assert.equal(result.success, true, scenario.fullName);
    assert.equal(result.driveUpdated, false, scenario.fullName);
    assert.equal(file.getName(), scenario.fullName);
    assert.equal(context.readSceneRows_(scenesSheet).byFileId[scenario.fileId].displayName, scenario.fullName);
    assert.deepEqual(operations, []);
  }
});

test('scene settings preserve a dotted basename without a redundant Drive rename', () => {
  const folderId = 'dotted-name-settings-folder';
  const fileId = 'dotted-name-settings-file';
  const operations = [];
  const file = createDriveFile({ id: fileId, name: 'Map.v2.jpg', operations });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [fileId, 'Map.v2.jpg', folderId, '360', false, 1, 10, 'manual', '', '']
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(folderId), scenes: scenesSheet },
    driveFolders: { [folderId]: createDriveFolder({ id: folderId, files: [file] }) },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    driveOperations: operations
  });

  const result = context.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: fileId,
    name: 'Map.v2',
    type: '360',
    northOffsetMode: 'manual',
    northOffset: 20
  });

  assert.equal(result.success, true);
  assert.equal(result.driveUpdated, false);
  assert.equal(file.getName(), 'Map.v2.jpg');
  assert.equal(result.scene.northOffset, 20);
  assert.deepEqual(operations, []);
});

test('scene settings rename Drive first and save name, type, and northOffset together', () => {
  const folderId = 'rename-parent-folder';
  const operations = [];
  const file = createDriveFile({ id: 'rename-file', name: 'Before.PNG', mimeType: 'image/png', operations });
  const folder = createDriveFolder({ id: folderId, files: [file], operations });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['rename-file', 'Before.PNG', folderId, '360', true, 1, '', '', '', '']
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(folderId), scenes: scenesSheet },
    driveFolders: { [folderId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    driveOperations: operations
  });

  const result = context.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: 'rename-file',
    name: 'After.PNG',
    type: '360',
    northOffsetMode: 'manual',
    northOffset: 0
  });

  assert.equal(result.success, true);
  assert.equal(result.partialSuccess, false);
  assert.equal(result.driveUpdated, true);
  assert.equal(result.sceneUpdated, true);
  assert.equal(file.getName(), 'After.PNG');
  assert.equal(context.readSceneRows_(scenesSheet).byFileId['rename-file'].displayName, 'After.PNG');
  assert.equal(context.readSceneRows_(scenesSheet).byFileId['rename-file'].northOffset, 0);
  assert.equal(result.scene.type, '360');
  assert.equal(operations[0], 'rename:rename-file');
  assert.ok(context.__cacheRemovals.includes('FOLDER_LIST_V2_' + folderId));

  const unchangedName = context.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: 'rename-file',
    name: 'After',
    type: '2D'
  });
  assert.equal(unchangedName.success, true);
  assert.equal(unchangedName.driveUpdated, false);
  assert.equal(file.getName(), 'After.PNG');
  assert.equal(operations.filter((entry) => entry === 'rename:rename-file').length, 1);
  assert.equal(unchangedName.scene.type, '2D');
});

test('scene settings reject a type change with stored hotspots before renaming Drive', () => {
  const folderId = 'type-hotspot-folder';
  const fileId = 'type-hotspot-file';
  const operations = [];
  const file = createDriveFile({ id: fileId, name: 'Before.jpg', operations });
  const folder = createDriveFolder({ id: folderId, files: [file], operations });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [fileId, 'Before.jpg', folderId, '360', false, 1, 45, 'manual', '', '']
  ]);
  const infoSheet = createSheet('info', [
    INFO_HEADERS,
    ['date', fileId, 'Stored hotspot', '', '', 10, 20, 'info', '#fff', '', '', '', 'hotspot-id']
  ]);
  const context = loadCode({
    sheets: {
      config: createFolderConfigSheet(folderId),
      scenes: scenesSheet,
      info: infoSheet
    },
    driveFolders: { [folderId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    driveOperations: operations
  });
  const beforeScenes = JSON.stringify(scenesSheet.__rows);
  const beforeInfo = JSON.stringify(infoSheet.__rows);

  const result = context.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: fileId,
    name: 'After',
    type: '2D'
  });

  assert.equal(result.success, false);
  assert.match(result.error, /ホットスポット|種別/);
  assert.equal(file.getName(), 'Before.jpg');
  assert.equal(JSON.stringify(scenesSheet.__rows), beforeScenes);
  assert.equal(JSON.stringify(infoSheet.__rows), beforeInfo);
  assert.deepEqual(operations, []);
});

test('scene settings store a renamed equals-prefixed Drive name as literal scenes text', () => {
  const folderId = 'formula-name-settings-folder';
  const fileId = 'formula-name-settings-file';
  const file = createDriveFile({ id: fileId, name: 'Before.jpg' });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [fileId, 'Before.jpg', folderId, '360', false, 1, '', '', '', '']
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(folderId), scenes: scenesSheet },
    driveFolders: { [folderId]: createDriveFolder({ id: folderId, files: [file] }) },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  const result = context.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: fileId,
    name: '=1+1',
    type: '360'
  });

  assert.equal(result.success, true);
  assert.equal(file.getName(), '=1+1.jpg');
  assert.equal(context.readSceneRows_(scenesSheet).byFileId[fileId].displayName, '=1+1.jpg');
  assert.equal(scenesSheet.__rows[1][1], "'=1+1.jpg");
  assert.equal(scenesSheet.getRange(2, 2, 1, 1).getFormulas()[0][0], '');
});

test('scene settings validates every name input before mutating Drive or scenes', () => {
  const folderId = 'rename-validation-folder';
  const operations = [];
  const file = createDriveFile({ id: 'rename-validation-file', name: 'Before.jpg', operations });
  const folder = createDriveFolder({ id: folderId, files: [file], operations });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['rename-validation-file', 'Before.jpg', folderId, '360', false, 1, 45, 'manual', '', '']
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(folderId), scenes: scenesSheet },
    driveFolders: { [folderId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    driveOperations: operations
  });
  const before = JSON.stringify(scenesSheet.__rows);

  for (const name of [
    '', 'Bad\u0000Name', 'After.png', 'After.jpeg', 'After.bmp', '資料.pdf', '資料.txt', '資料.docx', '資料.zip'
  ]) {
    const result = context.updateSceneSettings({
      __editToken: 'valid-token',
      fileId: 'rename-validation-file',
      name: name,
      type: '2D'
    });
    assert.equal(result.success, false, JSON.stringify(name));
    assert.equal(file.getName(), 'Before.jpg', JSON.stringify(name));
    assert.equal(JSON.stringify(scenesSheet.__rows), before, JSON.stringify(name));
  }
  assert.deepEqual(operations, []);

  const mismatchFile = createDriveFile({
    id: 'rename-mime-mismatch-file',
    name: 'Mismatch.jpg',
    mimeType: 'image/png',
    operations
  });
  const mismatchFolder = createDriveFolder({ id: 'rename-mime-mismatch-folder', files: [mismatchFile] });
  const mismatchScenes = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['rename-mime-mismatch-file', 'Mismatch.jpg', 'rename-mime-mismatch-folder', '360', false, 1, '', '', '', '']
  ]);
  const mismatchContext = loadCode({
    sheets: { config: createFolderConfigSheet('rename-mime-mismatch-folder'), scenes: mismatchScenes },
    driveFolders: { 'rename-mime-mismatch-folder': mismatchFolder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });
  const mismatch = mismatchContext.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: 'rename-mime-mismatch-file',
    name: 'After',
    type: '360'
  });
  assert.equal(mismatch.success, false);
  assert.match(mismatch.error, /MIME|拡張子/);
  assert.equal(mismatchFile.getName(), 'Mismatch.jpg');
});

test('scene settings Drive rename failure leaves all scenes settings unchanged, while post-Drive scenes failure is partial', () => {
  const folderId = 'rename-failure-folder';
  const failedDriveFile = createDriveFile({
    id: 'rename-drive-fail',
    name: 'Before.jpg',
    failRename: true
  });
  const failedDriveFolder = createDriveFolder({ id: folderId, files: [failedDriveFile] });
  const driveFailureScenes = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['rename-drive-fail', 'Before.jpg', folderId, '360', false, 1, '', '', '', '']
  ]);
  const driveFailureContext = loadCode({
    sheets: { config: createFolderConfigSheet(folderId), scenes: driveFailureScenes },
    driveFolders: { [folderId]: failedDriveFolder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  const driveFailure = driveFailureContext.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: 'rename-drive-fail',
    name: 'After',
    type: '2D'
  });
  assert.equal(driveFailure.success, false);
  assert.equal(driveFailureContext.readSceneRows_(driveFailureScenes).byFileId['rename-drive-fail'].displayName, 'Before.jpg');
  assert.equal(driveFailureContext.readSceneRows_(driveFailureScenes).byFileId['rename-drive-fail'].type, '360');

  const partialFile = createDriveFile({ id: 'rename-scene-fail', name: 'Before.jpg' });
  const partialFolder = createDriveFolder({ id: folderId, files: [partialFile] });
  const failingScenes = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['rename-scene-fail', 'Before.jpg', folderId, '360', false, 1, '', '', '', '']
  ]);
  const workingScenesRange = failingScenes.getRange.bind(failingScenes);
  let failSceneWrite = true;
  failingScenes.getRange = function (row, col, numRows, numCols) {
    const range = workingScenesRange(row, col, numRows, numCols);
    const originalSetValues = range.setValues.bind(range);
    range.setValues = function (values) {
      if (failSceneWrite && row >= 2) throw new Error('scenes unavailable');
      return originalSetValues(values);
    };
    return range;
  };
  const partialContext = loadCode({
    sheets: { config: createFolderConfigSheet(folderId), scenes: failingScenes },
    driveFolders: { [folderId]: partialFolder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  const partial = partialContext.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: 'rename-scene-fail',
    name: 'After.jpg',
    type: '2D'
  });
  assert.equal(partial.success, true);
  assert.equal(partial.partialSuccess, true);
  assert.equal(partial.driveUpdated, true);
  assert.equal(partial.sceneUpdated, false);
  assert.equal(partialFile.getName(), 'After.jpg');
  assert.match(partial.warning, /scenes/);

  failSceneWrite = false;
  partialContext.getConfigFromFolder_(folderId, { forceRefresh: true, rootFolderId: folderId });
  assert.equal(
    partialContext.readSceneRows_(failingScenes).byFileId['rename-scene-fail'].displayName,
    'After.jpg'
  );
});

test('integrated scene settings reports cache invalidation failure after Drive and scenes success', () => {
  const folderId = 'rename-cache-failure-folder';
  const file = createDriveFile({ id: 'rename-cache-file', name: 'Before.jpg' });
  const folder = createDriveFolder({ id: folderId, files: [file] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['rename-cache-file', 'Before.jpg', folderId, '360', false, 1, '', '', '', '']
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(folderId), scenes: scenesSheet },
    driveFolders: { [folderId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    cacheRemoveError: 'cache unavailable'
  });

  const result = context.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: 'rename-cache-file',
    name: 'After',
    type: '360'
  });

  assert.equal(result.success, true);
  assert.equal(result.driveUpdated, true);
  assert.equal(result.sceneUpdated, true);
  assert.equal(result.partialSuccess, true);
  assert.equal(result.cacheInvalidated, false);
  assert.match(result.warning, /キャッシュ/);
});

test('explicit delete removes hotspots and scenes only after Drive trash succeeds', () => {
  const folderId = 'delete-parent-folder';
  const operations = [];
  const file = createDriveFile({ id: 'delete-file', name: 'Delete.jpg', operations });
  const folder = createDriveFolder({ id: folderId, files: [file], operations });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['delete-file', 'Delete.jpg', folderId, '360', true, 1, 0, 'manual', '', ''],
    ['keep-file', 'Keep.jpg', folderId, '360', false, 2, '', '', '', '']
  ]);
  const infoSheet = createSheet('info', [
    INFO_HEADERS,
    ['date', 'delete-file', 'delete hotspot', '', '', 0, 0, 'circle', 'blue', 'info', '', '', 'delete-hs'],
    ['date', 'keep-file', 'keep hotspot', '', '', 0, 0, 'circle', 'blue', 'info', '', '', 'keep-hs']
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(folderId), scenes: scenesSheet, info: infoSheet },
    driveFolders: { [folderId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    driveOperations: operations
  });

  const result = context.deleteImageFile({ __editToken: 'valid-token', fileId: 'delete-file' });

  assert.equal(result.success, true);
  assert.equal(result.partialSuccess, false);
  assert.equal(result.driveDeleted, true);
  assert.equal(result.deletedHotspots, 1);
  assert.equal(result.deletedScenes, 1);
  assert.equal(file.__trashed, true);
  assert.equal(context.readSceneRows_(scenesSheet).byFileId['delete-file'], undefined);
  assert.ok(context.readSceneRows_(scenesSheet).byFileId['keep-file']);
  assert.equal(infoSheet.__rows.some((row) => row[1] === 'delete-file'), false);
  assert.equal(infoSheet.__rows.some((row) => row[1] === 'keep-file'), true);
  assert.equal(operations[0], 'trash:delete-file');
});

test('Drive delete failure preserves info and scenes, and a later scenes cleanup failure is partial', () => {
  const folderId = 'delete-failure-folder';
  const failedFile = createDriveFile({
    id: 'delete-drive-fail',
    name: 'Delete.jpg',
    failTrash: true
  });
  const failedFolder = createDriveFolder({ id: folderId, files: [failedFile] });
  const driveFailureScenes = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['delete-drive-fail', 'Delete.jpg', folderId, '360', false, 1, '', '', '', '']
  ]);
  const driveFailureInfo = createSheet('info', [
    INFO_HEADERS,
    ['date', 'delete-drive-fail', 'keep hotspot']
  ]);
  const driveFailureContext = loadCode({
    sheets: {
      config: createFolderConfigSheet(folderId),
      scenes: driveFailureScenes,
      info: driveFailureInfo
    },
    driveFolders: { [folderId]: failedFolder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });
  const beforeScenes = JSON.stringify(driveFailureScenes.__rows);
  const beforeInfo = JSON.stringify(driveFailureInfo.__rows);

  const failed = driveFailureContext.deleteImageFile({
    __editToken: 'valid-token',
    fileId: 'delete-drive-fail'
  });
  assert.equal(failed.success, false);
  assert.equal(JSON.stringify(driveFailureScenes.__rows), beforeScenes);
  assert.equal(JSON.stringify(driveFailureInfo.__rows), beforeInfo);

  const partialFile = createDriveFile({ id: 'delete-scene-fail', name: 'Delete.jpg' });
  const partialFolder = createDriveFolder({ id: folderId, files: [partialFile] });
  const failingScenes = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['delete-scene-fail', 'Delete.jpg', folderId, '360', false, 1, '', '', '', '']
  ]);
  failingScenes.deleteRows = function () { throw new Error('scenes delete unavailable'); };
  const partialInfo = createSheet('info', [
    INFO_HEADERS,
    ['date', 'delete-scene-fail', 'delete hotspot']
  ]);
  const partialContext = loadCode({
    sheets: {
      config: createFolderConfigSheet(folderId),
      scenes: failingScenes,
      info: partialInfo
    },
    driveFolders: { [folderId]: partialFolder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  const partial = partialContext.deleteImageFile({
    __editToken: 'valid-token',
    fileId: 'delete-scene-fail'
  });
  assert.equal(partial.success, true);
  assert.equal(partial.partialSuccess, true);
  assert.equal(partial.driveDeleted, true);
  assert.equal(partial.sceneDeleted, false);
  assert.equal(partialFile.__trashed, true);
  assert.equal(partialInfo.__rows.some((row) => row[1] === 'delete-scene-fail'), false);
  assert.equal(failingScenes.__rows.some((row) => row[0] === 'delete-scene-fail'), true);
  assert.match(partial.warnings.join('\n'), /scenes/);
});

test('delete reports cache invalidation failure after Drive and sheet cleanup as partial success', () => {
  const folderId = 'delete-cache-failure-folder';
  const file = createDriveFile({ id: 'delete-cache-file', name: 'Delete.jpg' });
  const folder = createDriveFolder({ id: folderId, files: [file] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['delete-cache-file', 'Delete.jpg', folderId, '360', false, 1, '', '', '', '']
  ]);
  const infoSheet = createSheet('info', [
    INFO_HEADERS,
    ['date', 'delete-cache-file', 'delete hotspot']
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(folderId), scenes: scenesSheet, info: infoSheet },
    driveFolders: { [folderId]: folder },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' },
    cacheRemoveError: 'cache unavailable'
  });

  const result = context.deleteImageFile({
    __editToken: 'valid-token',
    fileId: 'delete-cache-file'
  });

  assert.equal(result.success, true);
  assert.equal(result.driveDeleted, true);
  assert.equal(result.infoDeleted, true);
  assert.equal(result.sceneDeleted, true);
  assert.equal(result.partialSuccess, true);
  assert.equal(result.cacheInvalidated, false);
  assert.match(result.warning, /キャッシュ/);
});

test('cached northOffset zero avoids reading the Drive Blob', () => {
  const rootFolderId = 'north-zero-root-folder-123';
  const file = createDriveFile({ id: 'north-zero-file', name: 'North.jpg' });
  const rootFolder = createDriveFolder({ id: rootFolderId, files: [file] });
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootFolderId}`, '']
      ]),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        ['north-zero-file', 'North.jpg', rootFolderId, '360', false, 1, 0, 'xmp', '', '']
      ])
    },
    driveFolders: { [rootFolderId]: rootFolder },
    driveFiles: { 'north-zero-file': file }
  });

  assert.equal(context.getOrExtractNorthOffset_('north-zero-file', file), 0);
  assert.equal(file.__blobReads, 0);
});

test('public loadHotspots returns no data, reads no Blob, and creates no scenes for unauthorized IDs', () => {
  const rootFolderId = 'north-public-root-folder-123';
  const outsideFolderId = 'north-public-outside-folder-123';
  const unregisteredFile = createDriveFile({ id: 'north-unregistered-file', name: 'Unregistered.jpg' });
  const outsideFile = createDriveFile({ id: 'north-outside-file', name: 'Outside.jpg' });
  const rootFolder = createDriveFolder({ id: rootFolderId });
  const outsideFolder = createDriveFolder({ id: outsideFolderId, files: [outsideFile] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['north-outside-file', 'Outside.jpg', outsideFolderId, '360', false, 1, '', '', '', '']
  ]);
  const infoSheet = createSheet('info', [
    INFO_HEADERS,
    ['date', 'north-unregistered-file', 'public hotspot', '', '', 0, 0, 'circle', 'blue', 'info', '', '', 'hotspot-id']
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootFolderId}`, '']
      ]),
      scenes: scenesSheet,
      info: infoSheet
    },
    driveFolders: {
      [rootFolderId]: rootFolder,
      [outsideFolderId]: outsideFolder
    },
    driveFiles: {
      'north-unregistered-file': unregisteredFile,
      'north-outside-file': outsideFile
    }
  });
  const scenesBefore = JSON.stringify(scenesSheet.__rows);

  const unregistered = context.loadHotspots('north-unregistered-file');
  const outside = context.loadHotspots('north-outside-file');

  assert.equal(unregistered.northOffset, null);
  assert.equal(unregistered.hotspots.length, 0);
  assert.equal(outside.northOffset, null);
  assert.equal(unregisteredFile.__blobReads, 0);
  assert.equal(outsideFile.__blobReads, 0);
  assert.equal(JSON.stringify(scenesSheet.__rows), scenesBefore);
  assert.equal(context.readSceneRows_(scenesSheet).byFileId['north-unregistered-file'], undefined);
});

test('public loadHotspots saves registered 360 JPEG zero but skips 2D and preserves manual values', () => {
  const rootFolderId = 'north-types-root-folder-123';
  const zeroFile = createDriveFile({ id: 'north-360-zero-file', name: 'Zero.jpg' });
  const flatFile = createDriveFile({ id: 'north-2d-file', name: 'Flat.jpg' });
  const manualFile = createDriveFile({ id: 'north-manual-file', name: 'Manual.jpg' });
  const pngFile = createDriveFile({ id: 'north-png-file', name: 'Image.png', mimeType: 'image/png' });
  const manualPngFile = createDriveFile({ id: 'north-manual-png-file', name: 'Manual.png', mimeType: 'image/png' });
  const rootFolder = createDriveFolder({
    id: rootFolderId,
    files: [zeroFile, flatFile, manualFile, pngFile, manualPngFile]
  });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    ['north-360-zero-file', 'Zero.jpg', rootFolderId, '360', false, 1, '', '', '', ''],
    ['north-2d-file', 'Flat.jpg', rootFolderId, '2D', false, 2, 45, 'xmp', '', ''],
    ['north-manual-file', 'Manual.jpg', rootFolderId, '360', false, 3, 90, 'manual', '', ''],
    ['north-png-file', 'Image.png', rootFolderId, '360', false, 4, '', '', '', ''],
    ['north-manual-png-file', 'Manual.png', rootFolderId, '360', false, 5, 270.5, 'manual', '', '']
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootFolderId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootFolderId]: rootFolder }
  });
  context.extractHeadingFromBlob_ = function () { return 0; };

  const zero = context.loadHotspots('north-360-zero-file');
  const flat = context.loadHotspots('north-2d-file');
  const manual = context.loadHotspots('north-manual-file');
  const png = context.loadHotspots('north-png-file');
  const manualPng = context.loadHotspots('north-manual-png-file');
  const scenes = context.readSceneRows_(scenesSheet);

  assert.equal(zero.northOffset, 0);
  assert.equal(scenes.byFileId['north-360-zero-file'].northOffset, 0);
  assert.equal(scenes.byFileId['north-360-zero-file'].northOffsetSource, 'xmp');
  assert.equal(zeroFile.__blobReads, 1);
  assert.equal(flat.northOffset, null);
  assert.equal(flatFile.__blobReads, 0);
  assert.equal(scenes.byFileId['north-2d-file'].northOffset, 45);
  assert.equal(manual.northOffset, 90);
  assert.equal(manualFile.__blobReads, 0);
  assert.equal(scenes.byFileId['north-manual-file'].northOffset, 90);
  assert.equal(png.northOffset, null);
  assert.equal(pngFile.__blobReads, 0);
  assert.equal(scenes.byFileId['north-png-file'].northOffset, null);
  assert.equal(manualPng.northOffset, 270.5);
  assert.equal(manualPngFile.__blobReads, 0);
  assert.equal(scenes.byFileId['north-manual-png-file'].northOffsetSource, 'manual');
});

test('single-image loadHotspots allows only the configured file and never creates a scene row', () => {
  const configuredFileId = 'configured-single-image-file-123';
  const unrelatedFileId = 'unrelated-single-image-file-123';
  const configuredFile = createDriveFile({ id: configuredFileId, name: 'Single.jpg' });
  const unrelatedFile = createDriveFile({ id: unrelatedFileId, name: 'Other.jpg' });
  const scenesSheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/file/d/${configuredFileId}/view`, '']
      ]),
      scenes: scenesSheet,
      info: createSheet('info', [
        INFO_HEADERS,
        ['date', '', 'legacy single hotspot', '', '', 0, 0, 'circle', 'blue', 'info', '', '', 'single-hotspot']
      ])
    },
    driveFiles: {
      [configuredFileId]: configuredFile,
      [unrelatedFileId]: unrelatedFile
    }
  });
  context.extractHeadingFromBlob_ = function () { return 12; };

  const configured = context.loadHotspots({ fileId: configuredFileId, hotspotFileId: '' });
  const unrelated = context.loadHotspots({ fileId: unrelatedFileId, hotspotFileId: '' });

  assert.equal(configured.northOffset, 12);
  assert.equal(configured.hotspots.length, 1);
  assert.equal(configuredFile.__blobReads, 1);
  assert.equal(unrelated.northOffset, null);
  assert.equal(unrelatedFile.__blobReads, 0);
  assert.equal(context.readSceneRows_(scenesSheet).rows.length, 0);
});

test('public image Data URI access is limited to registered root scenes or the configured single file', () => {
  const rootId = 'image-read-root-folder-123';
  const outsideId = 'image-read-outside-folder-123';
  const allowedId = 'image-read-allowed-file-123';
  const unregisteredId = 'image-read-unregistered-file-123';
  const outsideFileId = 'image-read-outside-file-123';
  const allowed = createDriveFile({ id: allowedId, name: 'Allowed.png', mimeType: 'image/png' });
  const unregistered = createDriveFile({ id: unregisteredId, name: 'Unregistered.jpg' });
  const outside = createDriveFile({ id: outsideFileId, name: 'Outside.jpg' });
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        [allowedId, 'Allowed', rootId, '2D', false, 1, '', '', '', ''],
        [outsideFileId, 'Outside', outsideId, '360', false, 2, '', '', '', '']
      ])
    },
    driveFolders: {
      [rootId]: createDriveFolder({ id: rootId, files: [allowed, unregistered] }),
      [outsideId]: createDriveFolder({ id: outsideId, files: [outside] })
    },
    driveFiles: { [allowedId]: allowed, [unregisteredId]: unregistered, [outsideFileId]: outside }
  });

  const allowedResult = context.getImageDataUri(allowedId, 'public');
  const unregisteredResult = context.getImageDataUri(unregisteredId, 'public');
  const outsideResult = context.getImageDataUri(outsideFileId, 'public');

  assert.equal(allowedResult.success, true);
  assert.match(allowedResult.imageUrl, /^data:image\/png;base64,/);
  assert.equal(allowed.__blobReads, 1);
  assert.equal(unregisteredResult.success, false);
  assert.equal(outsideResult.success, false);
  assert.equal(unregistered.__blobReads, 0);
  assert.equal(outside.__blobReads, 0);

  const singleId = 'image-read-configured-single-123';
  const unrelatedId = 'image-read-unrelated-single-123';
  const single = createDriveFile({ id: singleId, name: 'Single.jpg' });
  const unrelated = createDriveFile({ id: unrelatedId, name: 'Other.jpg' });
  const singleContext = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/file/d/${singleId}/view`, '']
      ])
    },
    driveFiles: { [singleId]: single, [unrelatedId]: unrelated }
  });
  assert.equal(singleContext.getImageDataUri(singleId, 'public').success, true);
  assert.equal(singleContext.getImageDataUri(unrelatedId, 'public').success, false);
  assert.equal(single.__blobReads, 1);
  assert.equal(unrelated.__blobReads, 0);
});

test('integrated settings, delete, and properties reject unregistered or root-outside Drive IDs before mutation', () => {
  const rootId = 'mutation-scope-root-folder-123';
  const outsideId = 'mutation-scope-outside-folder-123';
  const renameId = 'mutation-scope-rename-file-123';
  const deleteId = 'mutation-scope-delete-file-123';
  const propertiesId = 'mutation-scope-properties-file-123';
  const renameFile = createDriveFile({ id: renameId, name: 'Rename.jpg' });
  const deleteFile = createDriveFile({ id: deleteId, name: 'Delete.jpg' });
  const propertiesFile = createDriveFile({ id: propertiesId, name: 'Properties.jpg' });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [deleteId, 'Delete', outsideId, '360', false, 1, '', '', '', '']
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet,
      info: createSheet('info', [INFO_HEADERS, ['date', deleteId, 'keep']])
    },
    driveFolders: {
      [rootId]: createDriveFolder({ id: rootId, files: [renameFile, propertiesFile] }),
      [outsideId]: createDriveFolder({ id: outsideId, files: [deleteFile] })
    },
    driveFiles: { [renameId]: renameFile, [deleteId]: deleteFile, [propertiesId]: propertiesFile },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });
  const scenesBefore = JSON.stringify(scenesSheet.__rows);

  const renameResult = context.updateSceneSettings({
    __editToken: 'valid-token',
    fileId: renameId,
    name: 'Changed',
    type: '360'
  });
  const deleteResult = context.deleteImageFile({ __editToken: 'valid-token', fileId: deleteId });
  const propertiesResult = context.getImageFileProperties({
    __editToken: 'valid-token',
    fileId: propertiesId
  });

  assert.equal(renameResult.success, false);
  assert.equal(renameFile.getName(), 'Rename.jpg');
  assert.equal(deleteResult.success, false);
  assert.equal(deleteFile.__trashed, false);
  assert.equal(propertiesResult.success, false);
  assert.equal(propertiesFile.__blobReads, 0);
  assert.equal(JSON.stringify(scenesSheet.__rows), scenesBefore);
});

test('image properties require a valid edit token and remain available to the edit screen', () => {
  const rootFolderId = 'properties-root-folder-123';
  const fileId = 'properties-image-file-123';
  const file = createDriveFile({ id: fileId, name: 'Properties.jpg' });
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootFolderId}`, '']
      ]),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        [fileId, 'Properties.jpg', rootFolderId, '360', false, 1, 30, 'manual', '', '']
      ])
    },
    driveFolders: {
      [rootFolderId]: createDriveFolder({ id: rootFolderId, files: [file] })
    },
    driveFiles: { [fileId]: file },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  assert.throws(
    () => context.getImageFileProperties({ fileId: fileId }),
    /編集権限が確認できません/
  );
  assert.throws(
    () => context.getImageFileProperties({ fileId: fileId, __editToken: 'invalid-token' }),
    /編集権限が確認できません/
  );

  const result = context.getImageFileProperties({ fileId: fileId, __editToken: 'valid-token' });
  assert.equal(result.success, true);
  assert.equal(result.properties.id, fileId);
  assert.equal(result.properties.url, `https://drive.google.com/file/d/${fileId}/view`);
  assert.equal(result.properties.northOffset, 30);
  assert.equal(file.__blobReads, 0);
});

test('scene settings get requires an edit token and returns one normalized registered scene', () => {
  const rootFolderId = 'settings-root-folder-123';
  const fileId = 'settings-scene-file-123';
  const file = createDriveFile({ id: fileId, name: 'Settings.jpg' });
  const rootFolder = createDriveFolder({ id: rootFolderId, files: [file] });
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootFolderId}`, '']
      ]),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        [fileId, 'Settings scene', rootFolderId, '360', true, 1, 12.5, 'manual', '', '']
      ])
    },
    driveFolders: { [rootFolderId]: rootFolder },
    driveFiles: { [fileId]: file },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  assert.throws(
    () => context.getSceneSettings({ fileId: fileId }),
    /編集権限が確認できません/
  );
  assert.throws(
    () => context.getSceneSettings({ fileId: fileId, __editToken: 'invalid-token' }),
    /編集権限が確認できません/
  );

  const result = context.getSceneSettings({ fileId: fileId, __editToken: 'valid-token' });
  assert.equal(result.success, true);
  assert.equal(result.scene.fileId, fileId);
  assert.equal(result.scene.displayName, 'Settings scene');
  assert.equal(result.scene.type, '360');
  assert.equal(result.scene.isHome, true);
  assert.equal(result.scene.northOffset, 12.5);
  assert.equal(result.scene.northOffsetSource, 'manual');
  assert.equal(result.scene.northOffsetMode, 'manual');
  assert.equal(result.scene.isRootScene, true);
  assert.equal(result.scene.mimeType, 'image/jpeg');
  assert.equal(file.__blobReads, 0);
});

test('scene settings reject unregistered, root-outside, parent-mismatched, and non-image targets', () => {
  const rootId = 'settings-scope-root-123';
  const childId = 'settings-scope-child-123';
  const outsideId = 'settings-scope-outside-123';
  const registeredId = 'settings-registered-123';
  const unregisteredId = 'settings-unregistered-123';
  const outsideFileId = 'settings-outside-file-123';
  const mismatchFileId = 'settings-mismatch-file-123';
  const textFileId = 'settings-text-file-123';
  const registered = createDriveFile({ id: registeredId, name: 'Registered.jpg' });
  const unregistered = createDriveFile({ id: unregisteredId, name: 'Unregistered.jpg' });
  const outside = createDriveFile({ id: outsideFileId, name: 'Outside.jpg' });
  const mismatch = createDriveFile({ id: mismatchFileId, name: 'Mismatch.jpg' });
  const textFile = createDriveFile({ id: textFileId, name: 'Notes.txt', mimeType: 'text/plain' });
  const rootFolder = createDriveFolder({ id: rootId, files: [registered, unregistered, mismatch, textFile] });
  const childFolder = createDriveFolder({ id: childId, parentIds: [rootId] });
  const outsideFolder = createDriveFolder({ id: outsideId, files: [outside] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [registeredId, 'Registered', rootId, '360', false, 1, '', '', '', ''],
    [outsideFileId, 'Outside', outsideId, '360', false, 2, '', '', '', ''],
    [mismatchFileId, 'Mismatch', childId, '360', false, 3, '', '', '', ''],
    [textFileId, 'Notes', rootId, '360', false, 4, '', '', '', '']
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: rootFolder, [childId]: childFolder, [outsideId]: outsideFolder },
    driveFiles: {
      [registeredId]: registered,
      [unregisteredId]: unregistered,
      [outsideFileId]: outside,
      [mismatchFileId]: mismatch,
      [textFileId]: textFile
    },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });
  const before = JSON.stringify(scenesSheet.__rows);
  const token = '__editToken';

  assert.equal(context.getSceneSettings({ fileId: unregisteredId, [token]: 'valid-token' }).success, false);
  assert.equal(context.updateSceneSettings({ fileId: unregisteredId, type: '2D', [token]: 'valid-token' }).success, false);
  assert.equal(context.updateSceneSettings({ fileId: outsideFileId, type: '2D', [token]: 'valid-token' }).success, false);
  assert.equal(context.updateSceneSettings({ fileId: mismatchFileId, type: '2D', [token]: 'valid-token' }).success, false);
  assert.equal(context.updateSceneSettings({ fileId: textFileId, type: '2D', [token]: 'valid-token' }).success, false);
  assert.equal(JSON.stringify(scenesSheet.__rows), before);
  assert.equal(unregistered.__blobReads + outside.__blobReads + mismatch.__blobReads + textFile.__blobReads, 0);
});

test('scene type switches only between 360 and 2D, preserves stored northOffset, and invalidates cache', () => {
  const rootId = 'settings-type-root-123';
  const fileId = 'settings-type-file-123';
  const file = createDriveFile({ id: fileId, name: 'Type.jpg' });
  const rootFolder = createDriveFolder({ id: rootId, files: [file] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [fileId, 'Type', rootId, '360', false, 1, 90, 'manual', '', '']
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: rootFolder },
    driveFiles: { [fileId]: file },
    cacheValues: {
      'EDIT_TOKEN_valid-token': '1',
      ['FOLDER_LIST_V2_' + rootId]: JSON.stringify({ images: [] })
    }
  });

  const twoD = context.updateSceneSettings({
    fileId: fileId,
    type: '2D',
    __editToken: 'valid-token'
  });
  assert.equal(twoD.success, true);
  assert.equal(twoD.scene.type, '2D');
  assert.equal(twoD.scene.northOffset, 90);
  assert.equal(twoD.scene.northOffsetSource, 'manual');
  assert.ok(context.__cacheRemovals.includes('FOLDER_LIST_V2_' + rootId));
  assert.equal(context.loadHotspots(fileId).northOffset, null);
  assert.equal(file.__blobReads, 0);

  const panorama = context.updateSceneSettings({
    fileId: fileId,
    type: '360',
    __editToken: 'valid-token'
  });
  assert.equal(panorama.success, true);
  assert.equal(panorama.scene.type, '360');
  assert.equal(panorama.scene.northOffset, 90);
  assert.equal(context.loadHotspots(fileId).northOffset, 90);
  assert.equal(file.__blobReads, 0);

  const beforeInvalid = JSON.stringify(scenesSheet.__rows);
  const invalid = context.updateSceneSettings({
    fileId: fileId,
    type: 'flat',
    __editToken: 'valid-token'
  });
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /種別|360|2D/);
  assert.equal(JSON.stringify(scenesSheet.__rows), beforeInvalid);
});

test('manual northOffset accepts zero and decimals but rejects every invalid boundary', () => {
  const rootId = 'settings-manual-root-123';
  const fileId = 'settings-manual-file-123';
  const file = createDriveFile({ id: fileId, name: 'Manual.jpg' });
  const rootFolder = createDriveFolder({ id: rootId, files: [file] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [fileId, 'Manual', rootId, '360', false, 1, '', '', '', '']
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: rootFolder },
    driveFiles: { [fileId]: file },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  for (const value of [0, 12.5]) {
    const result = context.updateSceneSettings({
      fileId: fileId,
      type: '360',
      northOffsetMode: 'manual',
      northOffset: value,
      __editToken: 'valid-token'
    });
    assert.equal(result.success, true);
    assert.equal(result.scene.northOffset, value);
    assert.equal(result.scene.northOffsetSource, 'manual');
    assert.equal(result.scene.northOffsetMode, 'manual');
  }

  for (const value of [-1, 360, NaN, Infinity, '', null]) {
    const result = context.updateSceneSettings({
      fileId: fileId,
      type: '360',
      northOffsetMode: 'manual',
      northOffset: value,
      __editToken: 'valid-token'
    });
    assert.equal(result.success, false, `manual value should be rejected: ${String(value)}`);
  }
  assert.equal(context.readSceneRows_(scenesSheet).byFileId[fileId].northOffset, 12.5);
});

test('auto clears manual for lazy XMP refresh while none blocks every later Blob read', () => {
  const rootId = 'settings-north-mode-root-123';
  const fileId = 'settings-north-mode-file-123';
  const file = createDriveFile({ id: fileId, name: 'NorthMode.jpg' });
  const rootFolder = createDriveFolder({ id: rootId, files: [file] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [fileId, 'NorthMode', rootId, '360', false, 1, 45, 'manual', '', '']
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, ''],
        [`NORTH_${fileId}`, '99', 'legacy value that must not override scenes auto mode']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: rootFolder },
    driveFiles: { [fileId]: file },
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });
  context.extractHeadingFromBlob_ = function () { return 123.25; };

  const auto = context.updateSceneSettings({
    fileId: fileId,
    type: '360',
    northOffsetMode: 'auto',
    __editToken: 'valid-token'
  });
  assert.equal(auto.success, true);
  assert.equal(auto.scene.northOffset, null);
  assert.equal(auto.scene.northOffsetSource, '');
  assert.equal(auto.scene.northOffsetMode, 'auto');
  const extracted = context.loadHotspots(fileId);
  assert.equal(extracted.northOffset, 123.25);
  assert.equal(file.__blobReads, 1);
  assert.equal(context.readSceneRows_(scenesSheet).byFileId[fileId].northOffsetSource, 'xmp');

  const none = context.updateSceneSettings({
    fileId: fileId,
    type: '360',
    northOffsetMode: 'none',
    __editToken: 'valid-token'
  });
  assert.equal(none.success, true);
  assert.equal(none.scene.northOffset, null);
  assert.equal(none.scene.northOffsetSource, 'none');
  assert.equal(none.scene.northOffsetMode, 'none');
  assert.equal(context.loadHotspots(fileId).northOffset, null);
  assert.equal(file.__blobReads, 1);
});

test('home settings atomically select one root 2D scene, preserve subfolders and info, and are idempotent', () => {
  const rootId = 'home-settings-root-123';
  const childId = 'home-settings-child-123';
  const oldHomeId = 'home-settings-old-123';
  const newHomeId = 'home-settings-new-123';
  const childFileId = 'home-settings-child-file-123';
  const oldHomeFile = createDriveFile({ id: oldHomeId, name: 'Old.jpg' });
  const newHomeFile = createDriveFile({ id: newHomeId, name: 'Map.png', mimeType: 'image/png' });
  const childFile = createDriveFile({ id: childFileId, name: 'Child.jpg' });
  const rootFolder = createDriveFolder({ id: rootId, files: [oldHomeFile, newHomeFile] });
  const childFolder = createDriveFolder({ id: childId, parentIds: [rootId], files: [childFile] });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [oldHomeId, 'Old', rootId, '360', true, 1, '', '', '', ''],
    [newHomeId, 'Map', rootId, '2D', false, 2, '', '', '', ''],
    [childFileId, 'Child', childId, '360', false, 1, '', '', '', '']
  ]);
  const infoSheet = createSheet('info', [
    INFO_HEADERS,
    ['date', oldHomeId, 'keep', 'description', '', 0, 0, 'circle', 'blue', 'info', '', '', 'home-info']
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet,
      info: infoSheet
    },
    driveFolders: { [rootId]: rootFolder, [childId]: childFolder },
    driveFiles: { [oldHomeId]: oldHomeFile, [newHomeId]: newHomeFile, [childFileId]: childFile },
    cacheValues: {
      'EDIT_TOKEN_valid-token': '1',
      ['FOLDER_LIST_V2_' + rootId]: JSON.stringify({ images: [] })
    }
  });

  assert.throws(
    () => context.setHomeScene({ fileId: newHomeId }),
    /編集権限が確認できません/
  );
  assert.throws(
    () => context.setHomeScene({ fileId: newHomeId, __editToken: 'invalid-token' }),
    /編集権限が確認できません/
  );

  const infoBefore = JSON.stringify(infoSheet.__rows);
  const first = context.setHomeScene({ fileId: newHomeId, __editToken: 'valid-token' });
  let snapshot = context.readSceneRows_(scenesSheet);
  assert.equal(first.success, true);
  assert.equal(first.homeImageId, newHomeId);
  assert.equal(first.scene.type, '2D');
  assert.equal(first.scene.isHome, true);
  assert.equal(snapshot.byFileId[oldHomeId].isHome, false);
  assert.equal(snapshot.byFileId[newHomeId].isHome, true);
  assert.equal(snapshot.byFileId[childFileId].isHome, false);
  assert.equal(snapshot.rows.filter((row) => row.parentFolderId === rootId && row.isHome).length, 1);
  assert.equal(JSON.stringify(infoSheet.__rows), infoBefore);
  assert.ok(context.__cacheRemovals.includes('FOLDER_LIST_V2_' + rootId));

  const rowsAfterFirst = JSON.stringify(scenesSheet.__rows);
  const writeCallsAfterFirst = scenesSheet.__setValuesCalls.length;
  const cacheRemovalsAfterFirst = context.__cacheRemovals.filter((key) =>
    key === 'FOLDER_LIST_V2_' + rootId
  ).length;
  const second = context.setHomeScene({ fileId: newHomeId, __editToken: 'valid-token' });
  assert.equal(second.success, true);
  assert.deepEqual(Array.from(second.changedFileIds), []);
  assert.equal(JSON.stringify(scenesSheet.__rows), rowsAfterFirst);
  assert.equal(scenesSheet.__setValuesCalls.length, writeCallsAfterFirst);
  assert.equal(
    context.__cacheRemovals.filter((key) => key === 'FOLDER_LIST_V2_' + rootId).length,
    cacheRemovalsAfterFirst + 1
  );

  const beforeChildAttempt = JSON.stringify(scenesSheet.__rows);
  const childResult = context.setHomeScene({ fileId: childFileId, __editToken: 'valid-token' });
  assert.equal(childResult.success, false);
  assert.match(childResult.error, /ルートフォルダ直下|サブフォルダ/);
  assert.equal(JSON.stringify(scenesSheet.__rows), beforeChildAttempt);
  snapshot = context.readSceneRows_(scenesSheet);
  assert.equal(snapshot.rows.filter((row) => row.parentFolderId === rootId && row.isHome).length, 1);
});

test('root upload can become home and clears the previous home', () => {
  const rootId = 'upload-home-root-123';
  const oldHomeId = 'upload-home-old-123';
  const operations = [];
  const oldHomeFile = createDriveFile({ id: oldHomeId, name: 'OldHome.jpg', operations });
  const rootFolder = createDriveFolder({ id: rootId, files: [oldHomeFile], operations });
  const scenesSheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    [oldHomeId, 'OldHome.jpg', rootId, '360', true, 1, '', '', '', '']
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: rootFolder },
    driveOperations: operations,
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  const result = context.uploadImageToDrive({
    base64: 'data:image/png;base64,AA==',
    fileName: 'NewHome.png',
    mimeType: 'image/png',
    is2D: true,
    setAsHome: true,
    targetFolderId: rootId,
    __editToken: 'valid-token'
  });
  const snapshot = context.readSceneRows_(scenesSheet);

  assert.equal(result.success, true);
  assert.equal(result.sceneRegistered, true);
  assert.equal(result.homeSet, true);
  assert.equal(result.file.isHome, true);
  assert.equal(snapshot.byFileId[oldHomeId].isHome, false);
  assert.equal(snapshot.byFileId[result.file.id].isHome, true);
  assert.equal(snapshot.rows.filter((row) => row.parentFolderId === rootId && row.isHome).length, 1);
  assert.equal(result.file.type, '2D');
  assert.equal(rootFolder.__files.find((item) => item.getId() === result.file.id).__trashed, false);
});

test('subfolder upload rejects home selection before creating a Drive file', () => {
  const rootId = 'upload-home-scope-root-123';
  const childId = 'upload-home-scope-child-123';
  const operations = [];
  const rootFolder = createDriveFolder({ id: rootId, operations });
  const childFolder = createDriveFolder({ id: childId, parentIds: [rootId], operations });
  const scenesSheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: rootFolder, [childId]: childFolder },
    driveOperations: operations,
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });

  const result = context.uploadImageToDrive({
    base64: 'data:image/jpeg;base64,AA==',
    fileName: 'ChildHome.jpg',
    mimeType: 'image/jpeg',
    setAsHome: true,
    targetFolderId: childId,
    __editToken: 'valid-token'
  });

  assert.equal(result.success, false);
  assert.match(result.error, /ホーム|ルートフォルダ/);
  assert.equal(operations.some((entry) => entry.startsWith('create:')), false);
  assert.equal(context.readSceneRows_(scenesSheet).rows.length, 0);
});

test('upload keeps Drive and scenes success when only home setting fails', () => {
  const rootId = 'upload-home-partial-root-123';
  const operations = [];
  const rootFolder = createDriveFolder({ id: rootId, operations });
  const scenesSheet = createSheet('scenes', [EXPECTED_SCENE_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, '']
      ]),
      scenes: scenesSheet
    },
    driveFolders: { [rootId]: rootFolder },
    driveOperations: operations,
    cacheValues: { 'EDIT_TOKEN_valid-token': '1' }
  });
  context.setHomeSceneInternal_ = function () { throw new Error('simulated home failure'); };

  const result = context.uploadImageToDrive({
    base64: 'data:image/jpeg;base64,AA==',
    fileName: 'PartialHome.jpg',
    mimeType: 'image/jpeg',
    setAsHome: true,
    targetFolderId: rootId,
    __editToken: 'valid-token'
  });

  assert.equal(result.success, true);
  assert.equal(result.sceneRegistered, true);
  assert.equal(result.homeSet, false);
  assert.equal(result.partialSuccess, true);
  assert.match(result.warning, /ホーム/);
  assert.ok(context.readSceneRows_(scenesSheet).byFileId[result.file.id]);
  assert.equal(rootFolder.__files.find((item) => item.getId() === result.file.id).__trashed, false);
  assert.equal(operations.some((entry) => entry.startsWith('trash:')), false);
});

test('saving a lazy northOffset invalidates the joined cache for the scene parent folder', () => {
  const parentFolderId = 'north-cache-parent';
  const context = loadCode({
    sheets: {
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        ['north-cache-file', 'North.jpg', parentFolderId, '360', false, 1, '', '', '', '']
      ])
    },
    cacheValues: {
      ['FOLDER_LIST_V2_' + parentFolderId]: JSON.stringify({ images: [] })
    }
  });

  context.setCachedNorthOffset_('north-cache-file', 0, 'xmp');

  assert.ok(context.__cacheRemovals.includes('FOLDER_LIST_V2_' + parentFolderId));
  assert.equal(context.getCachedNorthOffset_('north-cache-file').value, 0);
});

test('folder sync has no path to explicit deletion, info mutation, recursion, or Blob parsing', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const syncBody = getFunctionBody(code, 'syncDriveFolderToScenes_');
  const listingBody = getFunctionBody(code, 'listDriveFolderItems_');

  assert.doesNotMatch(syncBody, /deleteImageFile|deleteInfoRowsForImage_|deleteSceneRowsForFileId_|INFO_SHEET_NAME/);
  assert.doesNotMatch(syncBody, /syncDriveFolderToScenes_\(/);
  assert.doesNotMatch(listingBody, /getBlob\(|extractHeadingFromBlob_|getConfigFromFolder_\(/);
  assert.match(syncBody, /readSceneRows_\(scenesSheet\)/);
  assert.match(syncBody, /upsertScenes_\(plan\.updates,\s*scenesSheet,\s*snapshot\)/);
});

test('onOpen remains menu-only and editing API token guards remain in place', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const onOpenBody = getFunctionBody(code, 'onOpen');

  assert.doesNotMatch(onOpenBody, /getConfigFromFolder_|extractHeadingFromBlob_|migrateLegacyNorthOffsets_|setupSheets\(/);
  assert.match(onOpenBody, /createMenu\(['"]設定['"]\)/);
  assert.doesNotMatch(onOpenBody, /addSubMenu\(/);
  assert.match(onOpenBody, /初期設定・更新/);
  assert.match(onOpenBody, /一括入力データを取り込む/);
  assert.match(code, /function bulkImportStudentSheetFromMenu\(\)[\s\S]*?importDataFromStudentSheet_\(\)/);
  assert.doesNotMatch(code, /function createStudentSheet\(/);
  assert.match(code, /function createStudentSheet_\(/);
  assert.doesNotMatch(code, /function showLinkedStudentSheetId\(/);
  assert.doesNotMatch(code, /function renameImageFile\(/);
  for (const name of ['saveHotspot', 'updateHotspot', 'deleteHotspot', 'uploadImageToDrive', 'deleteImageFile', 'updateStudentSheetDropdowns', 'bulkImportStudentSheet']) {
    const start = code.indexOf(`function ${name}(`);
    assert.notEqual(start, -1);
    assert.match(code.slice(code.indexOf('{', start) + 1, code.indexOf('{', start) + 180), /assertEditToken_\(/);
  }
});

test('onOpen builds the exact flat Settings menu with two separators', () => {
  const context = loadCode();

  context.onOpen();

  assert.equal(context.__menus.length, 1);
  const root = context.__menus[0];
  assert.equal(root.label, '設定');
  assert.equal(root.submenus.length, 0);
  assert.deepEqual(Array.from(root.items, (item) => item.separator
    ? ['separator']
    : [item.label, item.functionName]), [
    ['初期設定・更新', 'setupSheets'],
    ['separator'],
    ['編集用URLを生成・更新', 'generateOrUpdateEditUrlFromMenu'],
    ['編集キーを再生成', 'regenerateEditKey'],
    ['separator'],
    ['一括入力用スプシを作成', 'createStudentSheetFromMenu'],
    ['一括入力用スプシを更新', 'updateStudentSheetDropdownsFromMenu'],
    ['一括入力データを取り込む', 'bulkImportStudentSheetFromMenu']
  ]);
  assert.equal(root.addedToUi, true);
  assert.equal(context.__spreadsheet.getSheetByName('scenes'), null);
});

function reviewSceneRow(fileId, displayName, parentFolderId, options = {}) {
  return [
    fileId,
    displayName,
    parentFolderId,
    options.type || '360',
    !!options.isHome,
    options.order == null ? 1 : options.order,
    options.northOffset == null ? '' : options.northOffset,
    options.northOffsetSource || 'none',
    options.driveUpdatedAt || '2026-07-18T02:00:00.000Z',
    options.sceneUpdatedAt || '2026-07-18T02:00:00.000Z'
  ];
}

function reviewInfoRow(fileId, label, id, options = {}) {
  return [
    '2026-07-18T00:00:00.000Z',
    fileId,
    label,
    options.description || '',
    options.linkUrl || '',
    options.pitch == null ? 0 : options.pitch,
    options.yaw == null ? 0 : options.yaw,
    options.markerShape || 'circle',
    options.markerColor || 'blue',
    options.markerIcon || 'info',
    options.photoId || '',
    options.jumpSceneId || '',
    id
  ];
}

test('public hotspot and photo reads stay inside configured, associated image IDs', () => {
  const rootId = 'review-public-root-folder';
  const outsideFolderId = 'review-public-outside-folder';
  const sceneId = 'review-public-scene-file';
  const photoId = 'review-associated-photo-file';
  const rogueId = 'review-unassociated-photo-file';
  const textPhotoId = 'review-associated-text-file';
  const outsidePhotoId = 'review-outside-photo-file';
  const secretSceneId = 'review-secret-scene-file';
  const sceneFile = createDriveFile({ id: sceneId, name: 'Scene.jpg' });
  const photoFile = createDriveFile({ id: photoId, name: 'Photo.jpg' });
  const rogueFile = createDriveFile({ id: rogueId, name: 'Rogue.jpg' });
  const textPhoto = createDriveFile({ id: textPhotoId, name: 'NotPhoto.txt', mimeType: 'text/plain' });
  const outsidePhoto = createDriveFile({ id: outsidePhotoId, name: 'Outside.jpg' });
  const root = createDriveFolder({ id: rootId, files: [sceneFile, photoFile, rogueFile, textPhoto] });
  const outside = createDriveFolder({ id: outsideFolderId, files: [outsidePhoto] });
  const context = loadCode({
    sheets: {
      config: createFolderConfigSheet(rootId),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        reviewSceneRow(sceneId, 'Scene.jpg', rootId),
        reviewSceneRow(photoId, 'Photo.jpg', rootId, { order: 2 }),
        reviewSceneRow(rogueId, 'Rogue.jpg', rootId, { order: 3 }),
        reviewSceneRow(textPhotoId, 'NotPhoto.txt', rootId, { order: 4 })
      ]),
      info: createSheet('info', [
        INFO_HEADERS,
        reviewInfoRow(sceneId, 'Associated', 'associated-id', { photoId }),
        reviewInfoRow(sceneId, 'Text association', 'text-id', { photoId: textPhotoId }),
        reviewInfoRow(sceneId, 'Outside association', 'outside-id', { photoId: outsidePhotoId }),
        reviewInfoRow(secretSceneId, 'Secret', 'secret-id')
      ])
    },
    driveFolders: { [rootId]: root, [outsideFolderId]: outside }
  });

  const mismatch = context.loadHotspots({ fileId: sceneId, hotspotFileId: secretSceneId });
  const associated = context.getHotspotPhotoDataUri({
    fileId: sceneId,
    hotspotId: 'associated-id',
    photoId
  });
  const unassociated = context.getHotspotPhotoDataUri({
    fileId: sceneId,
    hotspotId: 'associated-id',
    photoId: rogueId
  });
  const wrongMime = context.getHotspotPhotoDataUri({
    fileId: sceneId,
    hotspotId: 'text-id',
    photoId: textPhotoId
  });
  const outsideAssociated = context.getHotspotPhotoDataUri({
    fileId: sceneId,
    hotspotId: 'outside-id',
    photoId: outsidePhotoId
  });

  assert.deepEqual(Array.from(mismatch.hotspots), []);
  assert.equal(associated.success, true);
  assert.match(associated.dataUri, /^data:image\/jpeg;base64,/);
  assert.equal(unassociated.success, false);
  assert.equal(wrongMime.success, false);
  assert.equal(outsideAssociated.success, false);
});

test('hotspot CRUD rejects cross-scene ownership and unregistered storage keys', () => {
  const rootId = 'review-crud-root-folder';
  const sceneA = 'review-crud-scene-a-file';
  const sceneB = 'review-crud-scene-b-file';
  const fileA = createDriveFile({ id: sceneA, name: 'A.jpg' });
  const fileB = createDriveFile({ id: sceneB, name: 'B.jpg' });
  const root = createDriveFolder({ id: rootId, files: [fileA, fileB] });
  const info = createSheet('info', [INFO_HEADERS, reviewInfoRow(sceneA, 'Owned by A', 'owned-hotspot')]);
  const context = loadCode({
    sheets: {
      config: createFolderConfigSheet(rootId),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        reviewSceneRow(sceneA, 'A.jpg', rootId),
        reviewSceneRow(sceneB, 'B.jpg', rootId, { order: 2 })
      ]),
      info
    },
    driveFolders: { [rootId]: root }
  });
  context.assertEditToken_ = function () {};

  const deleted = context.deleteHotspot({ id: 'owned-hotspot', fileId: sceneB });
  const updated = context.updateHotspot({
    fileId: sceneB,
    label: 'Moved across scenes',
    pitch: 1,
    yaw: 2
  }, 'owned-hotspot');
  const saved = context.saveHotspot({
    fileId: 'review-unregistered-scene',
    label: 'Orphan',
    pitch: 1,
    yaw: 2
  });

  assert.equal(deleted.success, false);
  assert.equal(updated.success, false);
  assert.equal(saved.success, false);
  assert.equal(info.__rows.some((row) => row[12] === 'owned-hotspot' && row[1] === sceneA), true);
});

test('hotspot coordinates reject non-numbers, non-finite values, and scene-type ranges', () => {
  const rootId = 'review-coordinates-root';
  const sceneId = 'review-coordinates-scene';
  const sceneFile = createDriveFile({ id: sceneId, name: 'Scene.jpg' });
  const root = createDriveFolder({ id: rootId, files: [sceneFile] });
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow(sceneId, 'Existing', 'coordinate-hotspot'),
    reviewInfoRow(sceneId, 'Invalid stored', 'invalid-stored', { pitch: 'not-a-number', yaw: 0 })
  ]);
  const context = loadCode({
    sheets: {
      config: createFolderConfigSheet(rootId),
      scenes: createSheet('scenes', [EXPECTED_SCENE_HEADERS, reviewSceneRow(sceneId, 'Scene.jpg', rootId)]),
      info
    },
    driveFolders: { [rootId]: root }
  });
  context.assertEditToken_ = function () {};

  const stringCoordinate = context.saveHotspot({
    fileId: sceneId,
    label: 'String coordinate',
    pitch: '12',
    yaw: 20
  });
  const outOfRange = context.updateHotspot({
    fileId: sceneId,
    label: 'Out of range',
    pitch: 91,
    yaw: 0
  }, 'coordinate-hotspot');
  const loaded = context.loadHotspots(sceneId);

  assert.equal(stringCoordinate.success, false);
  assert.equal(outOfRange.success, false);
  assert.equal(Array.from(loaded.hotspots).some((hotspot) => hotspot.id === 'invalid-stored'), false);
});

test('hotspot save rejects coordinates captured for a scene type that changed before the locked write', () => {
  const rootId = 'review-type-race-root';
  const sceneId = 'review-type-race-scene';
  const file = createDriveFile({ id: sceneId, name: 'Map.png', mimeType: 'image/png' });
  const info = createSheet('info', [INFO_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createFolderConfigSheet(rootId),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        reviewSceneRow(sceneId, 'Map.png', rootId, { type: '2D' })
      ]),
      info
    },
    driveFolders: { [rootId]: createDriveFolder({ id: rootId, files: [file] }) }
  });
  context.assertEditToken_ = function () {};

  const result = context.saveHotspot({
    fileId: sceneId,
    sceneType: '360',
    label: 'Captured as panorama',
    pitch: 10,
    yaw: 20
  });

  assert.equal(result.success, false);
  assert.match(result.error, /種別|再読み込み|360|2D/);
  assert.equal(info.getLastRow(), 1);
});

test('edit-key regeneration immediately invalidates tokens issued by the previous key', () => {
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['WEB_APP_URL', 'https://example.test/exec', ''],
        ['EDIT_KEY', 'old-edit-key', ''],
        ['EDIT_URL', 'https://example.test/exec?mode=edit&editKey=old-edit-key', '']
      ])
    },
    scriptProperties: { EDIT_KEY: 'old-edit-key' }
  });

  context.doGet({ parameter: { mode: 'edit', editKey: 'old-edit-key' } });
  assert.doesNotThrow(() => context.assertEditToken_({ __editToken: 'uuid-1' }));

  context.regenerateEditKey();

  assert.throws(
    () => context.assertEditToken_({ __editToken: 'uuid-1' }),
    /編集権限/
  );
});

test('bulk import leaves invalid or ambiguous references pending and preserves blank jump labels', () => {
  const rootId = 'review-bulk-root-folder';
  const studentId = 'reviewBulkStudentSheet123456789';
  const files = [
    createDriveFile({ id: 'review-bulk-scene-file', name: 'Scene.jpg' }),
    createDriveFile({ id: 'review-bulk-jump-file', name: 'Jump.jpg' }),
    createDriveFile({ id: 'review-bulk-photo-file', name: 'Photo.jpg' }),
    createDriveFile({ id: 'review-bulk-duplicate-a', name: 'Duplicate.jpg' }),
    createDriveFile({ id: 'review-bulk-duplicate-b', name: 'Duplicate.jpg' })
  ];
  const root = createDriveFolder({ id: rootId, files });
  const studentSheet = createSheet('シート1', [
    STUDENT_HEADERS,
    [1, 'Missing.jpg', 'Missing scene', '', '', '', '', ''],
    [2, 'Scene.jpg', '', '', '', '', '', ''],
    [3, 'Scene.jpg', '', '', '', '', 'Jump.jpg', ''],
    [4, 'Scene.jpg', 'Bad photo', '', '', 'Missing photo.jpg', '', ''],
    [5, 'Scene.jpg', 'Bad jump', '', '', '', 'Missing jump.jpg', ''],
    [6, 'Duplicate.jpg', 'Ambiguous target', '', '', '', '', ''],
    [7, 'Scene.jpg', 'Valid info', '', '', 'Photo.jpg', '', '']
  ]);
  const studentSpreadsheet = createSpreadsheet(
    studentId,
    `https://docs.google.com/spreadsheets/d/${studentId}/edit`,
    { 'シート1': studentSheet }
  );
  const info = createSheet('info', [INFO_HEADERS]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/drive/folders/${rootId}`, ''],
        ['STUDENT_SHEET_URL', 'https://docs.google.com/spreadsheets/d/wrong-review-sheet-123456/edit', '']
      ]),
      scenes: createSheet('scenes', [EXPECTED_SCENE_HEADERS]),
      info
    },
    externalSpreadsheets: { [studentId]: studentSpreadsheet },
    scriptProperties: { STUDENT_SHEET_ID: studentId },
    driveFolders: { [rootId]: root },
    rejectNestedLock: true
  });

  const result = context.importDataFromStudentSheet_();
  const importedRows = info.__rows.slice(1);
  const statuses = studentSheet.__rows.slice(1).map((row) => row[7]);

  assert.equal(result.success, true);
  assert.equal(result.count, 2);
  assert.equal(result.skipped, 5);
  assert.deepEqual(statuses, ['', '', '済', '', '', '', '済']);
  assert.equal(importedRows.some((row) => row[2] === '' && row[11] === 'review-bulk-jump-file'), true);
  assert.equal(importedRows.some((row) => row[2] === '(無題)'), false);
});

test('invalid or conflicting STUDENT_SHEET_URL is ignored in favor of the official ScriptProperty', () => {
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['STUDENT_SHEET_URL', 'this-is-not-a-spreadsheet-reference!', '']
      ])
    },
    scriptProperties: { STUDENT_SHEET_ID: 'legacyStudentSheetId123456789' }
  });

  assert.equal(context.getStudentSheetId_(), 'legacyStudentSheetId123456789');
});

test('public northOffset access rejects a scene whose real Drive parent moved outside root', () => {
  const rootId = 'review-north-root-folder';
  const outsideId = 'review-north-outside-folder';
  const sceneId = 'review-north-moved-scene';
  const movedFile = createDriveFile({ id: sceneId, name: 'Moved.jpg' });
  const root = createDriveFolder({ id: rootId, files: [] });
  const outside = createDriveFolder({ id: outsideId, files: [movedFile] });
  const context = loadCode({
    sheets: {
      config: createFolderConfigSheet(rootId),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        reviewSceneRow(sceneId, 'Moved.jpg', rootId, { northOffsetSource: '' })
      ])
    },
    driveFolders: { [rootId]: root, [outsideId]: outside }
  });

  const access = context.getNorthOffsetAccessContext_(sceneId);
  const northOffset = context.getOrExtractNorthOffset_(sceneId);

  assert.equal(access.allowed, false);
  assert.equal(northOffset, null);
  assert.equal(movedFile.__blobReads, 0);
});

test('scene sync locks before Drive enumeration and ignores older Drive metadata', () => {
  const code = fs.readFileSync(codePath, 'utf8');
  const syncBody = getFunctionBody(code, 'syncDriveFolderToScenes_');
  assert.ok(syncBody.indexOf('acquireLock_()') < syncBody.indexOf('listDriveFolderItems_(folderId)'));

  const context = loadCode();
  const sheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    reviewSceneRow('review-stale-scene-file', 'Renamed.jpg', 'review-sync-root-folder', {
      driveUpdatedAt: '2026-07-18T02:00:00.000Z'
    })
  ]);
  const snapshot = context.readSceneRows_(sheet);
  const plan = context.buildSceneFolderSyncPlan_([{
    id: 'review-stale-scene-file',
    driveName: 'Old.jpg',
    mimeType: 'image/jpeg',
    driveUpdatedAt: new Date('2026-07-18T01:00:00.000Z')
  }], snapshot, {
    folderId: 'review-sync-root-folder',
    rootFolderId: 'review-sync-root-folder',
    now: new Date('2026-07-18T03:00:00.000Z')
  });

  assert.equal(plan.images[0].name, 'Renamed.jpg');
  assert.equal(plan.updates.some((update) => update.displayName === 'Old.jpg'), false);
});

test('root sync does not clear or replace a home omitted by a transient Drive listing', () => {
  const rootId = 'review-home-sync-root';
  const oldHomeId = 'review-missing-home-file';
  const visibleId = 'review-visible-scene-file';
  const context = loadCode();
  const sheet = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    reviewSceneRow(oldHomeId, 'Home.jpg', rootId, { isHome: true }),
    reviewSceneRow(visibleId, 'Visible.jpg', rootId, { order: 2 })
  ]);
  const snapshot = context.readSceneRows_(sheet);
  const plan = context.buildSceneFolderSyncPlan_([{
    id: visibleId,
    driveName: 'Visible.jpg',
    mimeType: 'image/jpeg',
    driveUpdatedAt: new Date('2026-07-18T02:00:00.000Z')
  }], snapshot, {
    folderId: rootId,
    rootFolderId: rootId,
    now: new Date('2026-07-18T03:00:00.000Z')
  });

  const oldHomeUpdate = plan.updates.find((update) => update.fileId === oldHomeId);
  const visibleUpdate = plan.updates.find((update) => update.fileId === visibleId);
  assert.equal(oldHomeUpdate && oldHomeUpdate.isHome, undefined);
  assert.notEqual(visibleUpdate && visibleUpdate.isHome, true);
  assert.equal(plan.images[0].isHome, false);
});

test('setHomeScene rejects any duplicate scene IDs before changing home flags', () => {
  const rootId = 'review-home-duplicate-root';
  const targetId = 'review-home-target-file';
  const duplicateId = 'review-home-duplicate-file';
  const targetFile = createDriveFile({ id: targetId, name: 'Target.jpg' });
  const duplicateFile = createDriveFile({ id: duplicateId, name: 'Duplicate.jpg' });
  const root = createDriveFolder({ id: rootId, files: [targetFile, duplicateFile] });
  const scenes = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    reviewSceneRow(targetId, 'Target.jpg', rootId, { isHome: false }),
    reviewSceneRow(duplicateId, 'Duplicate 1.jpg', rootId, { isHome: true, order: 2 }),
    reviewSceneRow(duplicateId, 'Duplicate 2.jpg', rootId, { isHome: true, order: 3 })
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(rootId), scenes },
    driveFolders: { [rootId]: root }
  });
  context.assertEditToken_ = function () {};

  const result = context.setHomeScene({ fileId: targetId });

  assert.equal(result.success, false);
  assert.match(result.error, /重複/);
  assert.equal(context.readSceneRows_(scenes).rows.filter((scene) => scene.isHome).length, 2);
});

test('deleting image info rows preserves formulas in every unrelated row', () => {
  const formulaCell = { value: 'computed label', formula: '=CONCAT("computed"," label")' };
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow('keep-scene', formulaCell, 'keep-hotspot'),
    reviewInfoRow('delete-scene', 'Delete me', 'delete-hotspot')
  ]);
  const context = loadCode({ sheets: { info } });

  const deleted = context.deleteInfoRowsForImage_('delete-scene', info);

  assert.equal(deleted, 1);
  assert.equal(info.__rows.length, 2);
  assert.equal(info.__rows[1][2].formula, '=CONCAT("computed"," label")');
});

test('single-image mode keeps the legacy blank info key for valid hotspot CRUD', () => {
  const fileId = 'review-single-image-file-123';
  const file = createDriveFile({ id: fileId, name: 'Single.jpg' });
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow('', 'Existing single hotspot', 'single-existing')
  ]);
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/file/d/${fileId}/view`, '']
      ]),
      info
    },
    driveFiles: { [fileId]: file }
  });
  context.assertEditToken_ = function () {};

  const saved = context.saveHotspot({ fileId: '', label: 'New single hotspot', pitch: 1, yaw: 2 });
  const updated = context.updateHotspot({ fileId: '', label: 'Updated single hotspot', pitch: 3, yaw: 4 }, 'single-existing');
  const deleted = context.deleteHotspot({ fileId: '', id: 'single-existing' });

  assert.equal(saved.success, true);
  assert.equal(updated.success, true);
  assert.equal(deleted.success, true);
  assert.equal(info.__rows.slice(1).some((row) => row[1] !== ''), false);
  assert.equal(info.__rows.slice(1).some((row) => row[2] === 'New single hotspot'), true);
});

test('hotspot saves reject arbitrary photo and jump references even for an authorized scene', () => {
  const rootId = 'review-related-root-folder';
  const outsideId = 'review-related-outside-folder';
  const sceneId = 'review-related-scene-file';
  const outsidePhotoId = 'review-related-outside-photo';
  const sceneFile = createDriveFile({ id: sceneId, name: 'Scene.jpg' });
  const outsidePhoto = createDriveFile({ id: outsidePhotoId, name: 'Outside.jpg' });
  const root = createDriveFolder({ id: rootId, files: [sceneFile] });
  const outside = createDriveFolder({ id: outsideId, files: [outsidePhoto] });
  const context = loadCode({
    sheets: {
      config: createFolderConfigSheet(rootId),
      scenes: createSheet('scenes', [EXPECTED_SCENE_HEADERS, reviewSceneRow(sceneId, 'Scene.jpg', rootId)]),
      info: createSheet('info', [INFO_HEADERS])
    },
    driveFolders: { [rootId]: root, [outsideId]: outside }
  });
  context.assertEditToken_ = function () {};

  const arbitraryPhoto = context.saveHotspot({
    fileId: sceneId,
    label: 'Bad photo',
    pitch: 1,
    yaw: 2,
    photoId: outsidePhotoId
  });
  const arbitraryJump = context.saveHotspot({
    fileId: sceneId,
    label: '',
    pitch: 1,
    yaw: 2,
    jumpSceneId: 'review-related-unknown-jump'
  });

  assert.equal(arbitraryPhoto.success, false);
  assert.equal(arbitraryJump.success, false);
});

test('2D hotspot coordinates accept only numeric percentages from zero through one hundred', () => {
  const rootId = 'review-2d-coordinate-root';
  const sceneId = 'review-2d-coordinate-scene';
  const file = createDriveFile({ id: sceneId, name: 'Map.png', mimeType: 'image/png' });
  const root = createDriveFolder({ id: rootId, files: [file] });
  const context = loadCode({
    sheets: {
      config: createFolderConfigSheet(rootId),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        reviewSceneRow(sceneId, 'Map.png', rootId, { type: '2D' })
      ]),
      info: createSheet('info', [INFO_HEADERS])
    },
    driveFolders: { [rootId]: root }
  });
  context.assertEditToken_ = function () {};

  const edge = context.saveHotspot({ fileId: sceneId, label: 'Edge', pitch: 100, yaw: 0 });
  const below = context.saveHotspot({ fileId: sceneId, label: 'Below', pitch: -0.01, yaw: 50 });
  const above = context.saveHotspot({ fileId: sceneId, label: 'Above', pitch: 50, yaw: 100.01 });

  assert.equal(edge.success, true);
  assert.equal(below.success, false);
  assert.equal(above.success, false);
});

function hotspotPhotoBytes(mimeType) {
  if (mimeType === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
  }
  if (mimeType === 'image/webp') {
    return [0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
  }
  return [0xff, 0xd8, 0xff, 0xd9];
}

function makeHotspotPhotoUpload(options = {}) {
  const mimeType = options.mimeType || 'image/jpeg';
  const bytes = options.bytes || hotspotPhotoBytes(mimeType);
  const extension = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
  return {
    fileName: options.fileName || `camera.${extension}`,
    mimeType,
    originalSizeBytes: options.originalSizeBytes == null ? bytes.length : options.originalSizeBytes,
    sizeBytes: options.sizeBytes == null ? bytes.length : options.sizeBytes,
    base64: options.base64 || Buffer.from(bytes).toString('base64')
  };
}

function createHotspotPhotoServerFixture(options = {}) {
  const operations = options.driveOperations || [];
  const rootId = options.rootId || 'photo-feature-scene-root';
  const containerParentId = options.containerParentId || 'photo-feature-container-parent';
  const sceneId = options.sceneId || 'photo-feature-scene';
  const sceneFile = createDriveFile({ id: sceneId, name: 'Scene.jpg', operations });
  const root = createDriveFolder({ id: rootId, files: [sceneFile], operations });
  const containerParent = createDriveFolder({ id: containerParentId, name: 'Project', operations });
  const scenes = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    reviewSceneRow(sceneId, 'Scene.jpg', rootId)
  ]);
  const info = options.info || createSheet('info', [INFO_HEADERS]);
  const context = loadCode({
    sheets: {
      config: options.config || createFolderConfigSheet(rootId),
      scenes,
      info
    },
    scriptProperties: options.scriptProperties || {},
    scriptPropertyWriteError: options.scriptPropertyWriteError || null,
    driveFolders: Object.assign({
      [rootId]: root,
      [containerParentId]: containerParent
    }, options.driveFolders || {}),
    containerParentFolderIds: [containerParentId],
    driveOperations: operations
  });
  return { context, rootId, root, containerParentId, containerParent, sceneId, sceneFile, scenes, info };
}

test('hotspot photo upload validates MIME, extension, signature, original size, decoded size, and declared size', () => {
  const { context } = createHotspotPhotoServerFixture();
  const normalized = context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload());
  assert.equal(normalized.mimeType, 'image/jpeg');
  assert.equal(normalized.extension, 'jpg');
  assert.deepEqual(Array.from(normalized.bytes), hotspotPhotoBytes('image/jpeg'));

  assert.throws(() => context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload({
    fileName: 'spoof.png'
  })), /MIME|拡張子|形式/);
  assert.throws(() => context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload({
    bytes: hotspotPhotoBytes('image/png')
  })), /実データ|シグネチャ|形式/);
  assert.throws(() => context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload({
    mimeType: 'image/gif',
    fileName: 'animation.gif',
    bytes: Array.from(Buffer.from('GIF89a'))
  })), /JPEG|PNG|WebP|形式/);
  assert.throws(() => context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload({
    mimeType: 'image/png',
    fileName: 'vector.png',
    bytes: Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))
  })), /実データ|シグネチャ|形式/);
  assert.throws(() => context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload({
    originalSizeBytes: 20 * 1024 * 1024 + 1
  })), /20/);
  assert.throws(() => context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload({
    sizeBytes: 999
  })), /サイズ/);

  const oversized = Buffer.alloc(6 * 1024 * 1024 + 1, 0);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  assert.throws(() => context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload({
    bytes: Array.from(oversized)
  })), /6/);

  const unsignedDecode = context.Utilities.base64Decode;
  context.Utilities.base64Decode = function(value) {
    return unsignedDecode(value).map((byte) => byte > 127 ? byte - 256 : byte);
  };
  assert.equal(context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload()).mimeType, 'image/jpeg');
  assert.equal(context.normalizeHotspotPhotoUpload_(makeHotspotPhotoUpload({
    mimeType: 'image/png',
    fileName: 'signed.png',
    bytes: hotspotPhotoBytes('image/png')
  })).mimeType, 'image/png');
});

test('authoritative hotspot photo folder is created once beside the spreadsheet and never under IMAGE_DRIVE_URL', () => {
  const fixture = createHotspotPhotoServerFixture();
  const first = fixture.context.getHotspotPhotoFolder_(true);
  const second = fixture.context.getHotspotPhotoFolder_(true);

  assert.equal(first.getId(), second.getId());
  assert.equal(first.getName(), 'Hemisphere ホットスポット写真');
  assert.equal(fixture.containerParent.__folders.length, 1);
  assert.equal(fixture.root.__folders.length, 0);
  assert.equal(fixture.context.__scriptProperties.HOTSPOT_PHOTO_FOLDER_ID, first.getId());
});

test('the edit-token folder API creates or reuses one official folder, synchronizes config, and returns only its URL', () => {
  const fixture = createHotspotPhotoServerFixture();
  fixture.context.assertEditToken_ = function () {};

  const first = fixture.context.getHotspotPhotoFolderUrlForEdit({ __editToken: 'accepted' });
  const second = fixture.context.getHotspotPhotoFolderUrlForEdit({ __editToken: 'accepted' });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(first.url, second.url);
  assert.equal(fixture.containerParent.__folders.length, 1);
  assert.equal(
    configObject(fixture.context).HOTSPOT_PHOTO_FOLDER_URL,
    `https://drive.google.com/drive/folders/${fixture.context.__scriptProperties.HOTSPOT_PHOTO_FOLDER_ID}`
  );
  assert.deepEqual(Object.keys(first).sort(), ['success', 'url']);
  assert.doesNotMatch(JSON.stringify(first), /HOTSPOT_PHOTO_FOLDER_ID|folderId|officialId/);
});

test('hotspot photo folder property persistence failure rolls back the newly created folder', () => {
  const fixture = createHotspotPhotoServerFixture({
    scriptPropertyWriteError: 'properties unavailable'
  });

  assert.throws(
    () => fixture.context.getHotspotPhotoFolder_(true),
    /専用フォルダID|保存/
  );
  assert.equal(fixture.context.__scriptProperties.HOTSPOT_PHOTO_FOLDER_ID, undefined);
  assert.equal(fixture.containerParent.__folders.length, 1);
  assert.equal(fixture.containerParent.__folders[0].__trashed, true);
});

test('the folder API requires edit authorization and sanitizes failures without creating a replacement', () => {
  const unauthorized = createHotspotPhotoServerFixture();
  const denied = unauthorized.context.getHotspotPhotoFolderUrlForEdit({});

  assert.equal(denied.success, false);
  assert.equal(unauthorized.containerParent.__folders.length, 0);
  assert.doesNotMatch(JSON.stringify(denied), /EDIT_TOKEN_|HOTSPOT_PHOTO_FOLDER_ID|folderId/);

  const brokenOfficialId = 'missing-official-photo-folder';
  const broken = createHotspotPhotoServerFixture({
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: brokenOfficialId }
  });
  broken.context.assertEditToken_ = function () {};
  const failed = broken.context.getHotspotPhotoFolderUrlForEdit({ __editToken: 'accepted' });

  assert.equal(failed.success, false);
  assert.equal(broken.containerParent.__folders.length, 0);
  assert.doesNotMatch(JSON.stringify(failed), new RegExp(brokenOfficialId));
  assert.doesNotMatch(JSON.stringify(failed), /HOTSPOT_PHOTO_FOLDER_ID|権限|親フォルダ/);
});

test('authoritative hotspot photo folder is hidden from scene listing and cannot be synchronized directly', () => {
  const fixture = createHotspotPhotoServerFixture();
  const photoFolder = fixture.context.getHotspotPhotoFolder_(true);

  const parentItems = fixture.context.listDriveFolderItems_(fixture.containerParentId);

  assert.equal(parentItems.folders.some((folder) => folder.id === photoFolder.getId()), false);
  assert.throws(
    () => fixture.context.listDriveFolderItems_(photoFolder.getId()),
    /専用フォルダ|シーン一覧|公開/
  );
  assert.equal(fixture.context.readSceneRows_(fixture.scenes).byFileId[photoFolder.getId()], undefined);
});

test('hotspot photo folder creation fails closed when the spreadsheet parent is inside IMAGE_DRIVE_URL', () => {
  const rootId = 'photo-root-containing-spreadsheet';
  const sceneId = 'photo-root-scene';
  const operations = [];
  const sceneFile = createDriveFile({ id: sceneId, name: 'Scene.jpg', operations });
  const root = createDriveFolder({ id: rootId, files: [sceneFile], operations });
  const context = loadCode({
    sheets: {
      config: createFolderConfigSheet(rootId),
      scenes: createSheet('scenes', [
        EXPECTED_SCENE_HEADERS,
        reviewSceneRow(sceneId, 'Scene.jpg', rootId)
      ]),
      info: createSheet('info', [INFO_HEADERS])
    },
    driveFolders: { [rootId]: root },
    containerParentFolderIds: [rootId],
    driveOperations: operations
  });
  context.assertEditToken_ = function () {};

  const result = context.saveHotspot({
    fileId: sceneId,
    label: 'Must stay outside root',
    pitch: 0,
    yaw: 0,
    photoUpload: makeHotspotPhotoUpload()
  });

  assert.equal(result.success, false);
  assert.match(result.error, /IMAGE_DRIVE_URL|画像.*配下|専用フォルダ/);
  assert.equal(root.__folders.length, 0);
  assert.equal(context.__scriptProperties.HOTSPOT_PHOTO_FOLDER_ID, undefined);
});

test('a broken authoritative hotspot photo folder ID fails closed without creating a replacement', () => {
  const fixture = createHotspotPhotoServerFixture({
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: 'missing-official-photo-folder' }
  });

  assert.throws(() => fixture.context.getHotspotPhotoFolder_(true), /HOTSPOT_PHOTO_FOLDER_ID|専用フォルダ|正式/);
  assert.equal(fixture.containerParent.__folders.length, 0);
  assert.equal(fixture.root.__folders.length, 0);
});

test('missing edit authorization and ordinary hotspot validation create no attachment file or folder', () => {
  const fixture = createHotspotPhotoServerFixture();
  fixture.context.assertEditToken_ = function () { throw new Error('編集権限がありません。'); };
  assert.throws(() => fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    label: 'Unauthorized',
    pitch: 0,
    yaw: 0,
    photoUpload: makeHotspotPhotoUpload()
  }), /編集権限/);
  assert.equal(fixture.containerParent.__folders.length, 0);

  fixture.context.assertEditToken_ = function () {};
  const invalidCoordinates = fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    label: 'Invalid coordinates',
    pitch: 91,
    yaw: 0,
    photoUpload: makeHotspotPhotoUpload()
  });
  assert.equal(invalidCoordinates.success, false);
  assert.equal(fixture.containerParent.__folders.length, 0);
});

test('photoId and photoUpload are mutually exclusive before attachment creation', () => {
  const fixture = createHotspotPhotoServerFixture();
  fixture.context.assertEditToken_ = function () {};
  const result = fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    label: 'Conflicting photo',
    pitch: 0,
    yaw: 0,
    photoId: fixture.sceneId,
    photoUpload: makeHotspotPhotoUpload()
  });

  assert.equal(result.success, false);
  assert.match(result.error, /同時|photoId|アップロード/);
  assert.equal(fixture.containerParent.__folders.length, 0);
});

test('saveHotspot stores an attachment only during save, returns normalized photoId, and never registers it in scenes', () => {
  const fixture = createHotspotPhotoServerFixture();
  fixture.context.assertEditToken_ = function () {};
  const scenesBefore = JSON.stringify(fixture.scenes.__rows);
  const result = fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    sceneType: '360',
    label: 'Uploaded photo',
    description: 'description',
    pitch: 1,
    yaw: 2,
    markerShape: 'diamond',
    markerColor: 'pink',
    markerIcon: 'photo',
    photoUpload: makeHotspotPhotoUpload()
  });

  assert.equal(result.success, true);
  assert.equal(result.photoId, result.hotspot.photoId);
  assert.equal(result.hotspot.id, result.id);
  assert.equal(result.hotspot.fileId, fixture.sceneId);
  assert.equal(fixture.info.__rows[1][10], result.photoId);
  assert.equal(JSON.stringify(fixture.scenes.__rows), scenesBefore);
  assert.equal(fixture.containerParent.__folders[0].__files.length, 1);
  assert.match(fixture.containerParent.__folders[0].__files[0].getName(), /^hotspot_\d{8}_\d{6}_[A-Za-z0-9]+\.jpg$/);
  assert.equal(
    configObject(fixture.context).HOTSPOT_PHOTO_FOLDER_URL,
    `https://drive.google.com/drive/folders/${fixture.context.__scriptProperties.HOTSPOT_PHOTO_FOLDER_ID}`
  );
  assert.doesNotMatch(JSON.stringify(result), new RegExp(fixture.containerParent.__folders[0].getId()));
});

test('the first two photo uploads create exactly one official folder and store both files there', () => {
  const fixture = createHotspotPhotoServerFixture();
  fixture.context.assertEditToken_ = function () {};

  const first = fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    label: 'First upload',
    pitch: 1,
    yaw: 2,
    photoUpload: makeHotspotPhotoUpload()
  });
  const second = fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    label: 'Second upload',
    pitch: 3,
    yaw: 4,
    photoUpload: makeHotspotPhotoUpload()
  });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(fixture.containerParent.__folders.length, 1);
  assert.equal(fixture.containerParent.__folders[0].__files.length, 2);
  assert.equal(
    fixture.context.__scriptProperties.HOTSPOT_PHOTO_FOLDER_ID,
    fixture.containerParent.__folders[0].getId()
  );
});

test('a user-edited config photo URL never changes the official upload destination', () => {
  const containerParentId = 'authority-container-parent';
  const officialId = 'authority-official-photo-folder';
  const tamperedId = 'authority-tampered-photo-folder';
  const official = createDriveFolder({ id: officialId, parentIds: [containerParentId] });
  const tampered = createDriveFolder({ id: tamperedId, parentIds: [containerParentId] });
  const config = createSheet('config', [
    ['設定項目', '値', '説明'],
    ['IMAGE_DRIVE_URL', 'https://drive.google.com/drive/folders/photo-feature-scene-root', ''],
    ['HOTSPOT_PHOTO_FOLDER_URL', `https://drive.google.com/drive/folders/${tamperedId}`, '']
  ]);
  const fixture = createHotspotPhotoServerFixture({
    containerParentId,
    config,
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: officialId },
    driveFolders: { [officialId]: official, [tamperedId]: tampered }
  });
  fixture.context.assertEditToken_ = function () {};

  const result = fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    label: 'Official destination',
    pitch: 1,
    yaw: 2,
    photoUpload: makeHotspotPhotoUpload()
  });

  assert.equal(result.success, true);
  assert.equal(official.__files.length, 1);
  assert.equal(tampered.__files.length, 0);
  assert.equal(configObject(fixture.context).HOTSPOT_PHOTO_FOLDER_URL, `https://drive.google.com/drive/folders/${officialId}`);
});

test('config URL synchronization failure keeps the official folder and upload as a partial success', () => {
  const fixture = createHotspotPhotoServerFixture();
  fixture.context.assertEditToken_ = function () {};
  fixture.context.setConfigValueInSheet_ = function () {
    throw new Error('config write unavailable');
  };

  const result = fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    label: 'Config sync warning',
    pitch: 1,
    yaw: 2,
    photoUpload: makeHotspotPhotoUpload()
  });

  assert.equal(result.success, true);
  assert.equal(result.partialSuccess, true);
  assert.match(result.warning, /config|同期|写真フォルダ/);
  assert.ok(fixture.context.__scriptProperties.HOTSPOT_PHOTO_FOLDER_ID);
  assert.equal(fixture.containerParent.__folders.length, 1);
  assert.equal(fixture.containerParent.__folders[0].__trashed, false);
  assert.equal(fixture.containerParent.__folders[0].__files.length, 1);

  const opened = fixture.context.getHotspotPhotoFolderUrlForEdit({ __editToken: 'accepted' });
  assert.equal(opened.success, true);
  assert.equal(opened.partialSuccess, true);
  assert.equal(fixture.containerParent.__folders.length, 1);
});

test('saveHotspot trashes a newly created attachment when the info write fails', () => {
  const info = createSheet('info', [INFO_HEADERS]);
  info.appendRow = function () { throw new Error('info append failed'); };
  const operations = [];
  const fixture = createHotspotPhotoServerFixture({ info, driveOperations: operations });
  fixture.context.assertEditToken_ = function () {};
  const result = fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    label: 'Rollback photo',
    pitch: 1,
    yaw: 2,
    photoUpload: makeHotspotPhotoUpload()
  });

  assert.equal(result.success, false);
  const attachment = fixture.containerParent.__folders[0].__files[0];
  assert.equal(attachment.__trashed, true);
  assert.ok(operations.includes(`trash:${attachment.getId()}`));
  assert.equal(info.getLastRow(), 1);
});

test('saveHotspot reports cleanupRequired when attachment rollback also fails', () => {
  const info = createSheet('info', [INFO_HEADERS]);
  info.appendRow = function () { throw new Error('info append failed'); };
  const fixture = createHotspotPhotoServerFixture({ info });
  const originalCreateFolder = fixture.containerParent.createFolder.bind(fixture.containerParent);
  fixture.containerParent.createFolder = function(name) {
    const folder = originalCreateFolder(name);
    const originalCreateFile = folder.createFile.bind(folder);
    folder.createFile = function(blob) {
      const file = originalCreateFile(blob);
      file.__setFailTrash(true);
      return file;
    };
    return folder;
  };
  fixture.context.assertEditToken_ = function () {};

  const result = fixture.context.saveHotspot({
    fileId: fixture.sceneId,
    label: 'Rollback failure',
    pitch: 1,
    yaw: 2,
    photoUpload: makeHotspotPhotoUpload()
  });

  assert.equal(result.success, false);
  assert.equal(result.cleanupRequired, true);
  assert.match(result.warning, /添付写真|整理|取り消し/);
  assert.equal(fixture.containerParent.__folders[0].__files[0].__trashed, false);
});

test('updateHotspot finds the owned row first and trashes a replacement upload when the info write fails', () => {
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow('update-rollback-scene', 'Existing', 'update-rollback-hotspot')
  ]);
  const originalGetRange = info.getRange.bind(info);
  info.getRange = function (row, col, numRows, numCols) {
    const range = originalGetRange(row, col, numRows, numCols);
    if (row === 2 && col === 1 && numRows === 1 && numCols === INFO_HEADERS.length) {
      range.setValues = function () { throw new Error('info update failed'); };
    }
    return range;
  };
  const operations = [];
  const fixture = createHotspotPhotoServerFixture({
    sceneId: 'update-rollback-scene',
    info,
    driveOperations: operations
  });
  fixture.context.assertEditToken_ = function () {};

  const missing = fixture.context.updateHotspot({
    fileId: fixture.sceneId,
    label: 'Missing target',
    pitch: 1,
    yaw: 2,
    photoUpload: makeHotspotPhotoUpload()
  }, 'missing-hotspot');
  assert.equal(missing.success, false);
  assert.equal(fixture.containerParent.__folders.length, 0);

  const failed = fixture.context.updateHotspot({
    fileId: fixture.sceneId,
    label: 'Replacement fails',
    pitch: 1,
    yaw: 2,
    photoUpload: makeHotspotPhotoUpload()
  }, 'update-rollback-hotspot');
  assert.equal(failed.success, false);
  const attachment = fixture.containerParent.__folders[0].__files[0];
  assert.equal(attachment.__trashed, true);
  assert.equal(info.__rows[1][2], 'Existing');
});

test('update and delete trash only unreferenced managed attachments', () => {
  const containerParentId = 'cleanup-container-parent';
  const photoFolderId = 'cleanup-photo-folder';
  const operations = [];
  const managed = createDriveFile({ id: 'cleanup-managed-photo', name: 'managed.jpg', operations });
  const shared = createDriveFile({ id: 'cleanup-shared-photo', name: 'shared.jpg', operations });
  const photoFolder = createDriveFolder({
    id: photoFolderId,
    name: 'Hemisphere ホットスポット写真',
    files: [managed, shared],
    parentIds: [containerParentId],
    operations
  });
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow('cleanup-scene', 'Replace managed', 'replace-id', { photoId: managed.getId() }),
    reviewInfoRow('cleanup-scene', 'Shared one', 'shared-one', { photoId: shared.getId() }),
    reviewInfoRow('cleanup-scene', 'Shared two', 'shared-two', { photoId: shared.getId() })
  ]);
  const fixture = createHotspotPhotoServerFixture({
    containerParentId,
    sceneId: 'cleanup-scene',
    info,
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: photoFolderId },
    driveFolders: { [photoFolderId]: photoFolder },
    driveOperations: operations
  });
  fixture.context.assertEditToken_ = function () {};

  const updated = fixture.context.updateHotspot({
    fileId: fixture.sceneId,
    label: 'Replaced',
    pitch: 1,
    yaw: 2,
    photoId: ''
  }, 'replace-id');
  const deleted = fixture.context.deleteHotspot({ fileId: fixture.sceneId, id: 'shared-one' });

  assert.equal(updated.success, true);
  assert.equal(managed.__trashed, true);
  assert.equal(deleted.success, true);
  assert.equal(shared.__trashed, false);
});

test('cleanup never trashes scene images and reports cleanup failure as partial success', () => {
  const containerParentId = 'partial-container-parent';
  const photoFolderId = 'partial-photo-folder';
  const operations = [];
  const managed = createDriveFile({
    id: 'partial-managed-photo',
    name: 'managed.jpg',
    operations,
    failTrash: true
  });
  const photoFolder = createDriveFolder({
    id: photoFolderId,
    name: 'Hemisphere ホットスポット写真',
    files: [managed],
    parentIds: [containerParentId],
    operations
  });
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow('partial-scene', 'Managed', 'managed-id', { photoId: managed.getId() }),
    reviewInfoRow('partial-scene', 'Scene photo', 'scene-photo-id', { photoId: 'partial-scene' })
  ]);
  const fixture = createHotspotPhotoServerFixture({
    containerParentId,
    sceneId: 'partial-scene',
    info,
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: photoFolderId },
    driveFolders: { [photoFolderId]: photoFolder },
    driveOperations: operations
  });
  fixture.context.assertEditToken_ = function () {};

  const partial = fixture.context.updateHotspot({
    fileId: fixture.sceneId,
    label: 'Managed removed',
    pitch: 1,
    yaw: 2,
    photoId: ''
  }, 'managed-id');
  const scenePhotoRemoved = fixture.context.updateHotspot({
    fileId: fixture.sceneId,
    label: 'Scene photo removed',
    pitch: 1,
    yaw: 2,
    photoId: ''
  }, 'scene-photo-id');

  assert.equal(partial.success, true);
  assert.equal(partial.partialSuccess, true);
  assert.match(partial.warning, /整理|削除|写真/);
  assert.equal(info.__rows.find((row) => row[12] === 'managed-id')[10], '');
  assert.equal(scenePhotoRemoved.success, true);
  assert.equal(fixture.sceneFile.__trashed, false);
  assert.equal(operations.includes(`trash:${fixture.sceneId}`), false);
});

test('cleanup never trashes a registered scene even if it also has the formal photo folder as a parent', () => {
  const containerParentId = 'dual-parent-container';
  const photoFolderId = 'dual-parent-photo-folder';
  const operations = [];
  const photoFolder = createDriveFolder({
    id: photoFolderId,
    name: 'Hemisphere ホットスポット写真',
    parentIds: [containerParentId],
    operations
  });
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow('dual-parent-scene', 'Scene photo', 'dual-parent-hotspot', { photoId: 'dual-parent-scene' })
  ]);
  const fixture = createHotspotPhotoServerFixture({
    containerParentId,
    sceneId: 'dual-parent-scene',
    info,
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: photoFolderId },
    driveFolders: { [photoFolderId]: photoFolder },
    driveOperations: operations
  });
  photoFolder.__files.push(fixture.sceneFile);
  fixture.sceneFile.__setParents([fixture.root, photoFolder]);
  fixture.context.assertEditToken_ = function () {};

  const result = fixture.context.updateHotspot({
    fileId: fixture.sceneId,
    label: 'Scene photo removed',
    pitch: 1,
    yaw: 2,
    photoId: ''
  }, 'dual-parent-hotspot');

  assert.equal(result.success, true);
  assert.equal(fixture.sceneFile.__trashed, false);
  assert.equal(operations.includes(`trash:${fixture.sceneId}`), false);
});

test('deleteHotspot trashes an unreferenced managed attachment and keeps the deletion on cleanup failure', () => {
  const containerParentId = 'delete-cleanup-container-parent';
  const photoFolderId = 'delete-cleanup-photo-folder';
  const cleaned = createDriveFile({ id: 'delete-cleanup-managed', name: 'cleaned.jpg' });
  const failing = createDriveFile({
    id: 'delete-cleanup-failing',
    name: 'failing.jpg',
    failTrash: true
  });
  const photoFolder = createDriveFolder({
    id: photoFolderId,
    name: 'Hemisphere ホットスポット写真',
    files: [cleaned, failing],
    parentIds: [containerParentId]
  });
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow('delete-cleanup-scene', 'Cleaned', 'delete-cleaned', { photoId: cleaned.getId() }),
    reviewInfoRow('delete-cleanup-scene', 'Partial', 'delete-partial', { photoId: failing.getId() })
  ]);
  const fixture = createHotspotPhotoServerFixture({
    containerParentId,
    sceneId: 'delete-cleanup-scene',
    info,
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: photoFolderId },
    driveFolders: { [photoFolderId]: photoFolder }
  });
  fixture.context.assertEditToken_ = function () {};

  const deleted = fixture.context.deleteHotspot({ fileId: fixture.sceneId, id: 'delete-cleaned' });
  const partial = fixture.context.deleteHotspot({ fileId: fixture.sceneId, id: 'delete-partial' });

  assert.equal(deleted.success, true);
  assert.equal(cleaned.__trashed, true);
  assert.equal(partial.success, true);
  assert.equal(partial.partialSuccess, true);
  assert.match(partial.warning, /整理|削除|写真/);
  assert.equal(info.__rows.some((row) => row[12] === 'delete-partial'), false);
});

test('deleting a scene cleans its orphaned managed attachments and reports cleanup failures as partial success', () => {
  const rootId = 'scene-delete-photo-root';
  const containerParentId = 'scene-delete-container-parent';
  const sceneId = 'scene-delete-with-photos';
  const photoFolderId = 'scene-delete-photo-folder';
  const operations = [];
  const sceneFile = createDriveFile({ id: sceneId, name: 'Delete.jpg', operations });
  const cleaned = createDriveFile({ id: 'scene-delete-cleaned-photo', name: 'Cleaned.jpg', operations });
  const failing = createDriveFile({
    id: 'scene-delete-failing-photo',
    name: 'Failing.jpg',
    operations,
    failTrash: true
  });
  const root = createDriveFolder({ id: rootId, files: [sceneFile], operations });
  const containerParent = createDriveFolder({ id: containerParentId, operations });
  const photoFolder = createDriveFolder({
    id: photoFolderId,
    name: 'Hemisphere ホットスポット写真',
    files: [cleaned, failing],
    parentIds: [containerParentId],
    operations
  });
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow(sceneId, 'Cleaned', 'scene-delete-cleaned', { photoId: cleaned.getId() }),
    reviewInfoRow(sceneId, 'Partial', 'scene-delete-partial', { photoId: failing.getId() })
  ]);
  const scenes = createSheet('scenes', [
    EXPECTED_SCENE_HEADERS,
    reviewSceneRow(sceneId, 'Delete.jpg', rootId)
  ]);
  const context = loadCode({
    sheets: { config: createFolderConfigSheet(rootId), scenes, info },
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: photoFolderId },
    driveFolders: {
      [rootId]: root,
      [containerParentId]: containerParent,
      [photoFolderId]: photoFolder
    },
    containerParentFolderIds: [containerParentId],
    driveOperations: operations
  });
  context.assertEditToken_ = function () {};

  const result = context.deleteImageFile({ fileId: sceneId });

  assert.equal(result.success, true);
  assert.equal(result.partialSuccess, true);
  assert.equal(result.deletedHotspots, 2);
  assert.equal(cleaned.__trashed, true);
  assert.equal(failing.__trashed, false);
  assert.equal(info.__rows.length, 1);
  assert.match(result.warning, /添付写真|整理/);
});

test('single-image mode saves and publicly serves managed hotspot photo uploads', () => {
  const configuredFileId = 'single-photo-scene-123456789';
  const containerParentId = 'single-photo-container-parent';
  const operations = [];
  const configuredFile = createDriveFile({ id: configuredFileId, name: 'Single.jpg', operations });
  const containerParent = createDriveFolder({ id: containerParentId, operations });
  const context = loadCode({
    sheets: {
      config: createSheet('config', [
        ['設定項目', '値', '説明'],
        ['IMAGE_DRIVE_URL', `https://drive.google.com/file/d/${configuredFileId}/view`, '']
      ]),
      info: createSheet('info', [INFO_HEADERS])
    },
    driveFiles: { [configuredFileId]: configuredFile },
    driveFolders: { [containerParentId]: containerParent },
    containerParentFolderIds: [containerParentId],
    driveOperations: operations
  });
  context.assertEditToken_ = function () {};

  const saved = context.saveHotspot({
    fileId: '',
    sceneType: '360',
    label: 'Single upload',
    pitch: 1,
    yaw: 2,
    photoUpload: makeHotspotPhotoUpload()
  });
  const served = context.getHotspotPhotoDataUri({
    fileId: configuredFileId,
    hotspotId: saved.id,
    photoId: saved.photoId
  });

  assert.equal(saved.success, true);
  assert.equal(saved.hotspot.fileId, configuredFileId);
  assert.equal(context.__spreadsheet.getSheetByName('info').__rows[1][1], '');
  assert.equal(served.success, true);
  assert.match(served.dataUri, /^data:image\/jpeg;base64,/);
});

test('public hotspot photo reads require an exact association and allow only registered scenes or the formal attachment folder', () => {
  const containerParentId = 'public-photo-container-parent';
  const photoFolderId = 'public-photo-folder';
  const attachment = createDriveFile({
    id: 'public-managed-attachment',
    name: 'attachment.png',
    mimeType: 'image/png',
    bytes: hotspotPhotoBytes('image/png')
  });
  const arbitrary = createDriveFile({ id: 'public-arbitrary-root-file', name: 'Arbitrary.jpg' });
  const photoFolder = createDriveFolder({
    id: photoFolderId,
    name: 'Hemisphere ホットスポット写真',
    files: [attachment],
    parentIds: [containerParentId]
  });
  const info = createSheet('info', [
    INFO_HEADERS,
    reviewInfoRow('public-photo-scene', 'Managed', 'managed-hotspot', { photoId: attachment.getId() }),
    reviewInfoRow('public-photo-scene', 'Scene', 'scene-hotspot', { photoId: 'public-photo-scene' }),
    reviewInfoRow('public-photo-scene', 'Arbitrary', 'arbitrary-hotspot', { photoId: arbitrary.getId() })
  ]);
  const fixture = createHotspotPhotoServerFixture({
    containerParentId,
    sceneId: 'public-photo-scene',
    info,
    scriptProperties: { HOTSPOT_PHOTO_FOLDER_ID: photoFolderId },
    driveFolders: { [photoFolderId]: photoFolder }
  });
  fixture.root.__files.push(arbitrary);
  arbitrary.__setParents([fixture.root]);

  const managed = fixture.context.getHotspotPhotoDataUri({
    fileId: fixture.sceneId,
    hotspotId: 'managed-hotspot',
    photoId: attachment.getId()
  });
  const scene = fixture.context.getHotspotPhotoDataUri({
    fileId: fixture.sceneId,
    hotspotId: 'scene-hotspot',
    photoId: fixture.sceneId
  });
  const wrongHotspot = fixture.context.getHotspotPhotoDataUri({
    fileId: fixture.sceneId,
    hotspotId: 'scene-hotspot',
    photoId: attachment.getId()
  });
  const arbitraryResult = fixture.context.getHotspotPhotoDataUri({
    fileId: fixture.sceneId,
    hotspotId: 'arbitrary-hotspot',
    photoId: arbitrary.getId()
  });
  const legacyIdOnly = fixture.context.getHotspotPhotoDataUri(attachment.getId());

  assert.equal(managed.success, true);
  assert.match(managed.dataUri, /^data:image\/png;base64,/);
  assert.equal(scene.success, true);
  assert.equal(wrongHotspot.success, false);
  assert.equal(arbitraryResult.success, false);
  assert.equal(legacyIdOnly.success, false);
  assert.doesNotMatch(JSON.stringify(managed), new RegExp(photoFolderId));
  assert.doesNotMatch(JSON.stringify(managed), /drive\.google\.com|googleusercontent/);
});
