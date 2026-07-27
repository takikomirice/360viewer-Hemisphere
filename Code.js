// ============================================================
//  360° ビューア — Google Apps Script バックエンド
//  コンテナバインド型スプレッドシート対応
// ============================================================

/** 設定シート名 */
const CONFIG_SHEET_NAME = 'config';
const CONFIG_HEADERS = ['設定項目', '値', '説明'];
const IMAGE_DRIVE_URL_CONFIG_KEY = 'IMAGE_DRIVE_URL';
const IMAGE_DRIVE_URL_CONFIG_DESCRIPTION = '360度画像のGoogleドライブURL（単一ファイルまたはフォルダ）。共有設定を「リンクを知っている全員が閲覧可」にしてください。';
const HOTSPOT_FOLDER_URL_CONFIG_KEY = 'HOTSPOT_FOLDER_URL';
const HOTSPOT_FOLDER_URL_CONFIG_DESCRIPTION = 'ホットスポット添付ファイルの共通Google DriveフォルダURL。システムが自動設定します。';
const HOTSPOT_PHOTO_FOLDER_URL_CONFIG_KEY = 'HOTSPOT_PHOTO_FOLDER_URL';
const HOTSPOT_AUDIO_FOLDER_URL_CONFIG_KEY = 'HOTSPOT_AUDIO_FOLDER_URL';
const STUDENT_SHEET_URL_CONFIG_KEY = 'STUDENT_SHEET_URL';
const STUDENT_SHEET_URL_CONFIG_DESCRIPTION = 'ScriptPropertiesのSTUDENT_SHEET_IDに紐づく一括入力用スプシの表示URL（直接編集しても紐づき先は変わりません）。';
const WEB_APP_URL_CONFIG_KEY = 'WEB_APP_URL';
const WEB_APP_URL_CONFIG_DESCRIPTION = 'デプロイ済みWebアプリの /exec URLを直接入力します。編集URL・共有URL・QR生成に使います。';
const EDIT_URL_CONFIG_KEY = 'EDIT_URL';
const EDIT_URL_CONFIG_DESCRIPTION = 'メニュー「編集用URLを生成・更新」でWEB_APP_URLとEDIT_KEYから生成する編集用URL。';
const EDIT_KEY_CONFIG_KEY = 'EDIT_KEY';
const EDIT_KEY_CONFIG_DESCRIPTION = '編集URL用の共有キー。編集URLを知っている人は共同編集できます。';
const CONFIG_PRIMARY_KEYS = [
  IMAGE_DRIVE_URL_CONFIG_KEY,
  HOTSPOT_FOLDER_URL_CONFIG_KEY,
  STUDENT_SHEET_URL_CONFIG_KEY,
  EDIT_KEY_CONFIG_KEY,
  WEB_APP_URL_CONFIG_KEY,
  EDIT_URL_CONFIG_KEY
];
const CONFIG_DESCRIPTIONS = {
  IMAGE_DRIVE_URL: IMAGE_DRIVE_URL_CONFIG_DESCRIPTION,
  HOTSPOT_FOLDER_URL: HOTSPOT_FOLDER_URL_CONFIG_DESCRIPTION,
  STUDENT_SHEET_URL: STUDENT_SHEET_URL_CONFIG_DESCRIPTION,
  EDIT_KEY: EDIT_KEY_CONFIG_DESCRIPTION,
  WEB_APP_URL: WEB_APP_URL_CONFIG_DESCRIPTION,
  EDIT_URL: EDIT_URL_CONFIG_DESCRIPTION
};

/** ホットスポット保存シート名 */
const INFO_SHEET_NAME = 'info';
const INFO_HEADERS = ['保存日時', '画像ID', 'ラベル', '説明', 'リンクURL', 'Pitch', 'Yaw', '形状', '色', 'アイコン', '写真ID', 'ジャンプ先ID', 'ID', '音声ID'];
const HOTSPOT_FOLDER_ID_KEY = 'HOTSPOT_FOLDER_ID';
const HOTSPOT_FOLDER_MIGRATION_STATE_KEY = 'HOTSPOT_FOLDER_MIGRATION_STATE';
const HOTSPOT_FOLDER_MIGRATION_VERSION = 1;
const HOTSPOT_FOLDER_PENDING_SEPARATOR = '.__pending__';
const HOTSPOT_FOLDER_NAME = 'Hemisphere Hotspot';
const HOTSPOT_PHOTO_FOLDER_ID_KEY = 'HOTSPOT_PHOTO_FOLDER_ID';
const HOTSPOT_PHOTO_FOLDER_NAME = 'photos';
const HOTSPOT_PHOTO_ORIGINAL_MAX_BYTES = 20 * 1024 * 1024;
const HOTSPOT_PHOTO_FINAL_MAX_BYTES = 6 * 1024 * 1024;
const HOTSPOT_PHOTO_MIME_EXTENSIONS = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp']
};
const HOTSPOT_AUDIO_FOLDER_ID_KEY = 'HOTSPOT_AUDIO_FOLDER_ID';
const HOTSPOT_AUDIO_FOLDER_NAME = 'audio';
const HOTSPOT_AUDIO_MIME_TYPE = 'audio/mpeg';
const HOTSPOT_AUDIO_FINAL_MAX_BYTES = 4 * 1024 * 1024;
const HOTSPOT_AUDIO_MIN_DURATION_SECONDS = 0.5;
const HOTSPOT_AUDIO_MAX_DURATION_SECONDS = 120;
const DEFAULT_MARKER_SHAPE = 'circle';
const DEFAULT_MARKER_COLOR = 'blue';
const DEFAULT_MARKER_ICON = 'info';
const ALLOWED_MARKER_SHAPES = ['circle', 'square', 'diamond'];
const ALLOWED_MARKER_COLORS = ['blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple', 'gray', 'white'];
const SELECTABLE_MARKER_ICONS = [
  'info', 'photo', 'audio', 'link', 'wifi', 'quiz', 'eye', 'warning', 'flag',
  'animal', 'leaf', 'flower', 'historic'
];
const LEGACY_MARKER_ICONS = ['video'];
const SUPPORTED_MARKER_ICONS = SELECTABLE_MARKER_ICONS.concat(LEGACY_MARKER_ICONS);

/** info列のインデックス（0-based）。既存M列IDは移動しない。 */
const INFO_COLUMN_INDEX = {
  photoId: 10,
  jumpSceneId: 11,
  id: 12,
  audioId: 13
};
const ID_COL_INDEX = INFO_COLUMN_INDEX.id;
const AUDIO_ID_COL_INDEX = INFO_COLUMN_INDEX.audioId;

/** 一括入力用スプレッドシートIDの PropertiesService キー */
const STUDENT_SHEET_ID_KEY = 'STUDENT_SHEET_ID';

/** 一括入力用スプレッドシートのシート名 */
const STUDENT_SHEET_NAME = 'シート1';
const STUDENT_SHEET_HEADERS = ['No', '対象シーン', 'ラベル', '説明', 'リンクURL', '写真', 'ジャンプ先', '状態'];

/** シーン単位設定シート */
const SCENES_SHEET_NAME = 'scenes';
const SCENES_HEADERS = [
  'DriveファイルID',
  '表示名',
  '親フォルダID',
  '種別',
  'ホーム設定',
  '表示順',
  'northOffset',
  'northOffset取得元',
  'Drive更新日時',
  'scenes行の更新日時'
];
const SCENE_COLUMN_INDEX = {
  fileId: 0,
  displayName: 1,
  parentFolderId: 2,
  type: 3,
  isHome: 4,
  displayOrder: 5,
  northOffset: 6,
  northOffsetSource: 7,
  driveUpdatedAt: 8,
  sceneUpdatedAt: 9
};
const NORTH_OFFSET_SOURCES = ['xmp', 'none', 'manual'];
const SCENE_TYPE_360 = '360';
const SCENE_TYPE_2D = '2D';
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** LockService のタイムアウト（ミリ秒） */
const LOCK_TIMEOUT_MS = 15000;

/** 編集画面だけが保持する一時トークンの有効期間（6時間） */
const EDIT_TOKEN_TTL_SECONDS = 6 * 60 * 60;
const EDIT_TOKEN_CACHE_PREFIX = 'EDIT_TOKEN_';
const FOLDER_LIST_CACHE_TTL_SECONDS = 300;
const FOLDER_LIST_CACHE_PREFIX = 'FOLDER_LIST_V2_';


// ============================================================
//  排他制御・キャッシュユーティリティ
// ============================================================

/**
 * スクリプトロックを取得する。取得できなかった場合はエラーをスローする。
 *
 * @returns {GoogleAppsScript.Lock.Lock}
 */
function acquireLock_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error('他のユーザーが編集中です。しばらく待ってから再度お試しください。');
  }
  return lock;
}

/**
 * 編集トークンの CacheService キーを返す。
 *
 * @param {string} token
 * @returns {string}
 */
function getEditTokenCacheKey_(token) {
  return EDIT_TOKEN_CACHE_PREFIX + token;
}

/**
 * 編集トークンへ紐付ける現在の共有キー世代を返す。
 * CacheService はキー一覧を削除できないため、発行時と現在のEDIT_KEYを照合し、
 * キー変更・再生成直後に既発行トークンを失効させる。
 *
 * @param {*} editKey
 * @returns {string}
 */
function getEditTokenCacheValue_(editKey) {
  const normalized = String(editKey || '').trim();
  return normalized ? 'edit-key:' + normalized : '';
}

/**
 * 編集系APIが通常編集画面から呼ばれていることを確認する。
 * 個人認証ではなく、公開・埋め込みビューからの編集API呼び出しを防ぐための検証。
 *
 * @param {{ __editToken?: string }|null|undefined} payload
 */
function assertEditToken_(payload) {
  const token = payload && typeof payload === 'object'
    ? String(payload.__editToken || '')
    : '';
  if (!token) {
    throw new Error('編集権限が確認できません。通常の編集画面を開き直してください。');
  }

  const cached = CacheService.getScriptCache().get(getEditTokenCacheKey_(token));
  const currentValues = getAcceptedEditKeys_().map(function(editKey) {
    return getEditTokenCacheValue_(editKey);
  });
  if (!cached || currentValues.indexOf(cached) === -1) {
    throw new Error('編集権限が確認できません。通常の編集画面を開き直してください。');
  }
}

/**
 * 編集URLに使う共有キーを生成する。
 *
 * @returns {string}
 */
function generateEditKey_() {
  let uuid = '';
  try {
    uuid = String(Utilities.getUuid() || '');
  } catch (e) {
    uuid = '';
  }

  const normalized = uuid.replace(/[^A-Za-z0-9]/g, '');
  if (normalized) return 'ed_' + normalized;

  return 'ed_' + String(new Date().getTime()) + String(Math.floor(Math.random() * 1000000000));
}

/**
 * config シートに初期ヘッダーと基本行を作る。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function initializeConfigSheet_(sheet) {
  return repairConfigSheet_(sheet);
}

/**
 * config の値と数式を一括取得する。再配置時は数式文字列を優先して保持する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Array<{rowNumber:number,key:string,value:*,description:*,cells:Array<*>}>}
 */
function readConfigRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const range = sheet.getRange(2, 1, lastRow - 1, 3);
  const values = range.getValues();
  let formulas = [];
  try {
    formulas = range.getFormulas();
  } catch (e) {
    formulas = values.map(function() { return ['', '', '']; });
  }

  return values.map(function(row, index) {
    const rowFormulas = formulas[index] || [];
    const cells = row.map(function(value, columnIndex) {
      return rowFormulas[columnIndex] || value;
    });
    return {
      rowNumber: index + 2,
      key: String(row[0] || '').trim(),
      value: row[1],
      description: row[2],
      cells: cells
    };
  });
}

/**
 * config のデータ行を一括で置き換える。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<Array<*>>} rows
 */
function writeConfigRows_(sheet, rows) {
  const previousLastRow = sheet.getLastRow();
  sheet.getRange(1, 1, 1, CONFIG_HEADERS.length)
    .setValues([CONFIG_HEADERS])
    .setFontWeight('bold')
    .setBackground('#E8F0FE');

  if (previousLastRow > 1) {
    sheet.getRange(2, 1, previousLastRow - 1, CONFIG_HEADERS.length).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, CONFIG_HEADERS.length).setValues(rows);
  }

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 420);
  sheet.setColumnWidth(3, 420);
  sheet.setFrozenRows(1);
}

/**
 * config の基本項目を指定順に1行ずつ配置し、その他の有効行を後ろへ保持する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {{ addedKeys:Array<string>, removedDuplicateKeys:Array<string> }}
 */
function repairConfigSheet_(sheet) {
  const existingRows = readConfigRows_(sheet);
  const addedKeys = [];
  const removedDuplicateKeys = [];
  const primaryRows = [];

  CONFIG_PRIMARY_KEYS.forEach(function(key) {
    const matches = existingRows.filter(function(row) { return row.key === key; });
    let selected = null;
    for (let i = 0; i < matches.length; i++) {
      if (String(matches[i].cells[1] || '').trim()) {
        selected = matches[i];
        break;
      }
    }
    if (!selected && matches.length > 0) selected = matches[0];

    if (!selected) {
      addedKeys.push(key);
      primaryRows.push([key, '', CONFIG_DESCRIPTIONS[key] || '']);
      return;
    }

    if (matches.length > 1) removedDuplicateKeys.push(key);
    primaryRows.push([
      key,
      selected.cells[1] == null ? '' : selected.cells[1],
      String(selected.cells[2] || '').trim() ? selected.cells[2] : (CONFIG_DESCRIPTIONS[key] || '')
    ]);
  });

  const otherRows = existingRows
    .filter(function(row) {
      return row.key && CONFIG_PRIMARY_KEYS.indexOf(row.key) === -1;
    })
    .map(function(row) { return row.cells.slice(0, CONFIG_HEADERS.length); });

  writeConfigRows_(sheet, primaryRows.concat(otherRows));
  return { addedKeys: addedKeys, removedDuplicateKeys: removedDuplicateKeys };
}

/**
 * config シートを取得し、なければ作成する。
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateConfigSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    initializeConfigSheet_(sheet);
  }
  return sheet;
}

/**
 * config シート内のキー行を返す。見つからない場合は 0。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} key
 * @returns {number}
 */
function findConfigRow_(sheet, key) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) {
      return i + 2;
    }
  }
  return 0;
}

/**
 * 一括読込済みconfig行からキーを検索する。
 *
 * @param {Array<Object>} rows
 * @param {string} key
 * @returns {Object|null}
 */
function findConfigSnapshotRow_(rows, key) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].key === key) return rows[i];
  }
  return null;
}

/**
 * config シートの値を設定する。
 *
 * @param {string} key
 * @param {string} value
 * @param {string} description
 */
function setConfigValue_(key, value, description) {
  const sheet = getOrCreateConfigSheet_();
  setConfigValueInSheet_(sheet, key, value, description);
}

/**
 * 指定済みconfigシートの値を更新する。EDIT_URL再計算は呼び出し側が行う。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} key
 * @param {*} value
 * @param {string} description
 */
function setConfigValueInSheet_(sheet, key, value, description) {
  const row = findConfigRow_(sheet, key);
  if (!row) {
    sheet.appendRow([key, value, description || '']);
    return;
  }
  sheet.getRange(row, 2).setValue(value);
  if (description) sheet.getRange(row, 3).setValue(description);
}

/** 正式なホットスポット添付フォルダIDから、人間向けDrive URLを生成する。 */
function buildHotspotFolderUrl_(folderId) {
  const normalizedId = String(folderId || '').trim();
  if (!normalizedId) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(normalizedId)) {
    throw new Error('正式なホットスポット添付フォルダIDが不正です。');
  }
  return 'https://drive.google.com/drive/folders/' + normalizedId;
}

/**
 * 旧子フォルダURL行は、空欄または正式子フォルダURLと一致する場合だけ削除する。
 * 正式URLと一致しない利用者編集値は保持し、警告を返す。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {{photoFolder:Object,audioFolder:Object}} structure
 * @returns {{removed:number,warnings:Array<string>}}
 */
function removeVerifiedLegacyHotspotFolderUrlRows_(sheet, structure) {
  if (!sheet || !structure || !structure.photoFolder || !structure.audioFolder) {
    return { removed: 0, warnings: [] };
  }
  const expectedByKey = {};
  expectedByKey[HOTSPOT_PHOTO_FOLDER_URL_CONFIG_KEY] = buildHotspotFolderUrl_(structure.photoFolder.getId());
  expectedByKey[HOTSPOT_AUDIO_FOLDER_URL_CONFIG_KEY] = buildHotspotFolderUrl_(structure.audioFolder.getId());
  const rows = readConfigRows_(sheet);
  const keepRows = [];
  const warnings = [];
  let removed = 0;
  rows.forEach(function(row) {
    if (!Object.prototype.hasOwnProperty.call(expectedByKey, row.key)) {
      keepRows.push(row.cells.slice(0, CONFIG_HEADERS.length));
      return;
    }
    const value = String(row.cells[1] == null ? '' : row.cells[1]).trim();
    if (!value || value === expectedByKey[row.key]) {
      removed += 1;
      return;
    }
    keepRows.push(row.cells.slice(0, CONFIG_HEADERS.length));
    warnings.push(row.key + ' に想定外の旧URL値があるため削除せず保持しました。');
  });
  if (removed > 0) writeConfigRows_(sheet, keepRows);
  return { removed: removed, warnings: warnings };
}

/** 正式ルートIDだけからconfigの表示用URLを同期する。 */
function syncHotspotFolderUrlConfig_(folderId, sheet, structure) {
  const url = buildHotspotFolderUrl_(folderId);
  try {
    const configSheet = sheet || getOrCreateConfigSheet_();
    repairConfigSheet_(configSheet);
    setConfigValueInSheet_(
      configSheet,
      HOTSPOT_FOLDER_URL_CONFIG_KEY,
      url,
      HOTSPOT_FOLDER_URL_CONFIG_DESCRIPTION
    );
    const cleanup = structure
      ? removeVerifiedLegacyHotspotFolderUrlRows_(configSheet, structure)
      : { removed: 0, warnings: [] };
    return { success: true, url: url, warnings: cleanup.warnings, removedLegacyRows: cleanup.removed };
  } catch (e) {
    console.error('HotspotフォルダURLのconfig同期エラー:', e && e.message ? e.message : e);
    return {
      success: false,
      url: url,
      warnings: [],
      warning: 'Hotspotフォルダ構成を確認できましたが、configのフォルダURLを同期できませんでした。'
    };
  }
}

/** 旧内部呼び出し互換。configの正式項目は更新しない。 */
function buildHotspotPhotoFolderUrl_(folderId) { return buildHotspotFolderUrl_(folderId); }
function buildHotspotAudioFolderUrl_(folderId) { return buildHotspotFolderUrl_(folderId); }

/**
 * config シートに WEB_APP_URL 行を用意する。既存値は上書きしない。
 */
function ensureWebAppUrlConfig_() {
  const sheet = getOrCreateConfigSheet_();
  const existed = findConfigRow_(sheet, WEB_APP_URL_CONFIG_KEY) !== 0;
  repairConfigSheet_(sheet);
  return { created: !existed };
}

/**
 * WebアプリURLとして使う値を正規化する。
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeWebAppUrl_(value) {
  let url = String(value || '').trim();
  if (!url) return '';

  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) url = url.slice(0, queryIndex);
  url = url.trim();

  if (url.length > 1 && url.charAt(url.length - 1) === '/') {
    url = url.slice(0, -1);
  }

  url = url.replace(
    /^https:\/\/script\.google\.com\/a\/([^/]+)\/macros\/s\/([^/]+)\/(exec|dev)$/i,
    'https://script.google.com/a/macros/$1/s/$2/$3'
  );

  return /^https:\/\/[^\s/?#]+(?:\/[^\s?#]*)?\/exec$/i.test(url) ? url : '';
}

/**
 * WEB_APP_URL と EDIT_KEY から編集URLを生成する唯一の共通処理。
 *
 * @param {string} webAppUrl
 * @param {string} editKey
 * @returns {string}
 */
function buildEditUrl_(webAppUrl, editKey) {
  const normalizedUrl = normalizeWebAppUrl_(webAppUrl);
  const normalizedKey = String(editKey || '').trim();
  if (!normalizedUrl || !normalizedKey) return '';
  return normalizedUrl + '?mode=edit&editKey=' + encodeURIComponent(normalizedKey);
}

/**
 * config の EDIT_URL を現在の有効なWEBアプリURLと編集キーから更新する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet=} sheet
 * @param {Array<Object>=} configRows
 * @returns {{ url:string, webAppUrl:string, source:string }}
 */
function refreshEditUrlConfig_(sheet, configRows) {
  const configSheet = sheet || getOrCreateConfigSheet_();
  const rows = configRows || readConfigRows_(configSheet);
  const config = {};
  rows.forEach(function(row) {
    if (row.key && row.value !== '' && row.value != null) {
      config[row.key] = String(row.value).trim();
    }
  });

  const rawWebAppUrl = String(config[WEB_APP_URL_CONFIG_KEY] || '').trim();
  const webAppUrl = normalizeWebAppUrl_(rawWebAppUrl);
  const editKey = String(config[EDIT_KEY_CONFIG_KEY] || '').trim();
  const editUrl = buildEditUrl_(webAppUrl, editKey);
  setConfigValueInSheet_(configSheet, EDIT_URL_CONFIG_KEY, editUrl, EDIT_URL_CONFIG_DESCRIPTION);
  const editUrlRow = findConfigSnapshotRow_(rows, EDIT_URL_CONFIG_KEY);
  if (editUrlRow) {
    editUrlRow.value = editUrl;
    editUrlRow.cells[1] = editUrl;
    editUrlRow.description = EDIT_URL_CONFIG_DESCRIPTION;
    editUrlRow.cells[2] = EDIT_URL_CONFIG_DESCRIPTION;
  } else {
    rows.push({
      rowNumber: configSheet.getLastRow(),
      key: EDIT_URL_CONFIG_KEY,
      value: editUrl,
      description: EDIT_URL_CONFIG_DESCRIPTION,
      cells: [EDIT_URL_CONFIG_KEY, editUrl, EDIT_URL_CONFIG_DESCRIPTION]
    });
  }
  let error = '';
  if (!rawWebAppUrl) {
    error = 'configシートのWEB_APP_URLが空です。有効な /exec URLを直接入力してください。';
  } else if (!webAppUrl) {
    error = 'configシートのWEB_APP_URLが不正です。https:// で始まり /exec で終わるURLを入力してください。';
  } else if (!editKey) {
    error = 'configシートのEDIT_KEYが空です。';
  }
  return { url: editUrl, webAppUrl: webAppUrl, source: webAppUrl ? 'config' : '', error: error };
}

/**
 * 編集URL・共有URL生成で使うWebアプリURLを返す。
 * config シートへ直接入力された有効な /exec URLだけを使用する。
 *
 * @param {Object=} appConfig
 * @returns {string}
 */
function getConfiguredWebAppUrl_(appConfig) {
  try {
    const config = appConfig || getAppConfig_();
    return normalizeWebAppUrl_(config[WEB_APP_URL_CONFIG_KEY] || '');
  } catch (e) {
    return '';
  }
}

/**
 * フォルダ一覧キャッシュのキーを返す。
 *
 * @param {string} folderId
 * @returns {string}
 */
function getFolderListCacheKey_(folderId) {
  return FOLDER_LIST_CACHE_PREFIX + String(folderId || '');
}

/**
 * CacheService からフォルダ一覧を取得する。
 *
 * @param {string} folderId
 * @returns {{ images: Array }|null}
 */
function getCachedFolderList_(folderId) {
  if (!folderId) return null;
  try {
    const cached = CacheService.getScriptCache().get(getFolderListCacheKey_(folderId));
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    return parsed && Array.isArray(parsed.images) ? parsed : null;
  } catch (e) {
    return null;
  }
}

/**
 * CacheService にフォルダ一覧を保存する。失敗しても呼び出し元の処理は続ける。
 *
 * @param {string} folderId
 * @param {{ images: Array }} result
 */
function setCachedFolderList_(folderId, result) {
  if (!folderId || !result || !Array.isArray(result.images)) return;
  try {
    CacheService.getScriptCache().put(
      getFolderListCacheKey_(folderId),
      JSON.stringify(result),
      FOLDER_LIST_CACHE_TTL_SECONDS
    );
  } catch (e) {
    // CacheService のサイズ制限などで保存できなくても通常処理は継続する。
  }
}

/**
 * フォルダ一覧キャッシュを削除する。失敗しても編集処理は止めず、成否を返す。
 *
 * @param {string} folderId
 * @returns {boolean}
 */
function invalidateFolderListCache_(folderId) {
  if (!folderId) return true;
  try {
    CacheService.getScriptCache().remove(getFolderListCacheKey_(folderId));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Drive ファイルが属するフォルダの一覧キャッシュを削除する。
 *
 * @param {GoogleAppsScript.Drive.File} file
 */
function invalidateContainingFolderListCache_(file) {
  if (!file) return;
  try {
    const parents = file.getParents();
    while (parents.hasNext()) {
      invalidateFolderListCache_(parents.next().getId());
    }
  } catch (e) {
    // ignore
  }
}

/**
 * config シートに EDIT_KEY 行を用意し、空の場合は自動生成する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet=} sheet
 * @param {Array<Object>=} configRows
 * @returns {{ key: string, created: boolean, generated: boolean, formula?:boolean }}
 */
function ensureEditKeyConfig_(sheet, configRows) {
  const configSheet = sheet || getOrCreateConfigSheet_();
  const rows = configRows || readConfigRows_(configSheet);
  let configRow = findConfigSnapshotRow_(rows, EDIT_KEY_CONFIG_KEY);
  if (!configRow) {
    const legacyKey = getScriptEditKey_();
    const newKey = legacyKey || generateEditKey_();
    configSheet.appendRow([EDIT_KEY_CONFIG_KEY, newKey, EDIT_KEY_CONFIG_DESCRIPTION]);
    configRow = {
      rowNumber: configSheet.getLastRow(),
      key: EDIT_KEY_CONFIG_KEY,
      value: newKey,
      description: EDIT_KEY_CONFIG_DESCRIPTION,
      cells: [EDIT_KEY_CONFIG_KEY, newKey, EDIT_KEY_CONFIG_DESCRIPTION]
    };
    rows.push(configRow);
    return {
      key: newKey,
      created: true,
      generated: !legacyKey,
      migrated: !!legacyKey
    };
  }

  const currentKey = String(configRow.value || '').trim();
  if (currentKey) {
    if (!String(configRow.description || '').trim()) {
      configSheet.getRange(configRow.rowNumber, 3).setValue(EDIT_KEY_CONFIG_DESCRIPTION);
      configRow.description = EDIT_KEY_CONFIG_DESCRIPTION;
      configRow.cells[2] = EDIT_KEY_CONFIG_DESCRIPTION;
    }
    return { key: currentKey, created: false, generated: false };
  }

  const currentFormula = String(configRow.cells[1] || '').trim().charAt(0) === '='
    ? String(configRow.cells[1]).trim()
    : '';
  if (currentFormula) {
    if (!String(configRow.description || '').trim()) {
      configSheet.getRange(configRow.rowNumber, 3).setValue(EDIT_KEY_CONFIG_DESCRIPTION);
      configRow.description = EDIT_KEY_CONFIG_DESCRIPTION;
      configRow.cells[2] = EDIT_KEY_CONFIG_DESCRIPTION;
    }
    return { key: '', created: false, generated: false, formula: true };
  }

  const legacyKey = getScriptEditKey_();
  const replacementKey = legacyKey || generateEditKey_();
  configSheet.getRange(configRow.rowNumber, 2).setValue(replacementKey);
  configRow.value = replacementKey;
  configRow.cells[1] = replacementKey;
  if (!String(configRow.description || '').trim()) {
    configSheet.getRange(configRow.rowNumber, 3).setValue(EDIT_KEY_CONFIG_DESCRIPTION);
    configRow.description = EDIT_KEY_CONFIG_DESCRIPTION;
    configRow.cells[2] = EDIT_KEY_CONFIG_DESCRIPTION;
  }
  return {
    key: replacementKey,
    created: false,
    generated: !legacyKey,
    migrated: !!legacyKey
  };
}

/**
 * ScriptProperties の EDIT_KEY を返す。未設定や取得不可の場合は空文字。
 *
 * @returns {string}
 */
function getScriptEditKey_() {
  try {
    return String(PropertiesService.getScriptProperties().getProperty(EDIT_KEY_CONFIG_KEY) || '').trim();
  } catch (e) {
    return '';
  }
}

/** configに保存された旧EDIT_URLからeditKeyを読み取る。 */
function getStoredEditUrlKey_(editUrl) {
  const value = String(editUrl || '').trim();
  if (!/[?&]mode=edit(?:[&#]|$)/.test(value)) return '';
  const match = value.match(/[?&]editKey=([^&#]*)/);
  if (!match) return '';
  try {
    return decodeURIComponent(String(match[1] || '').replace(/\+/g, '%20')).trim();
  } catch (e) {
    return '';
  }
}

/**
 * 現在受け入れる編集キーを優先順で返す。
 * configキーを正本とし、異なる旧ScriptPropertyキーは保存済みEDIT_URLがそのキーを
 * 明示する移行中だけ併用する。明示生成後は旧キーを自動的に受け入れない。
 *
 * @returns {Array<string>}
 */
function getAcceptedEditKeys_() {
  let config;
  try {
    config = getAppConfig_();
  } catch (e) {
    return [];
  }
  config = config && typeof config === 'object' ? config : {};
  const configKey = String(config[EDIT_KEY_CONFIG_KEY] || '').trim();
  const scriptKey = getScriptEditKey_();
  const primaryKey = configKey || scriptKey;
  const acceptedKeys = primaryKey ? [primaryKey] : [];
  if (
    configKey &&
    scriptKey &&
    scriptKey !== configKey &&
    getStoredEditUrlKey_(config[EDIT_URL_CONFIG_KEY]) === scriptKey
  ) {
    acceptedKeys.push(scriptKey);
  }
  return acceptedKeys;
}

/**
 * 編集URL生成と通常認証の正本キーを返す。
 * 優先順位: config シートの EDIT_KEY → ScriptProperties の EDIT_KEY → 空文字。
 *
 * @returns {string}
 */
function getConfiguredEditKey_() {
  const acceptedKeys = getAcceptedEditKeys_();
  return acceptedKeys.length > 0 ? acceptedKeys[0] : '';
}

// ============================================================
//  scenes シート基盤
// ============================================================

/**
 * scenes シートの入力補助を設定する。既存値・数式は変更しない。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function applyScenesDataValidations_(sheet) {
  const applyRows = Math.max(sheet.getMaxRows() - 1, 1);
  const typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([SCENE_TYPE_360, SCENE_TYPE_2D], true)
    .setAllowInvalid(false)
    .build();
  const homeRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .setAllowInvalid(false)
    .build();
  const northOffsetRule = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(G2="",AND(ISNUMBER(G2),G2>=0,G2<360))')
    .setAllowInvalid(false)
    .build();
  const northOffsetSourceRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['', 'xmp', 'manual', 'none'], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, 4, applyRows, 1).setDataValidation(typeRule);
  sheet.getRange(2, 5, applyRows, 1).setDataValidation(homeRule);
  sheet.getRange(2, 7, applyRows, 1).setDataValidation(northOffsetRule);
  sheet.getRange(2, 8, applyRows, 1).setDataValidation(northOffsetSourceRule);
}

/**
 * scenes シートの不足ヘッダーを列位置を変えずに補修する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {{ repaired:boolean }}
 */
function repairScenesSheet_(sheet) {
  const current = sheet.getRange(1, 1, 1, SCENES_HEADERS.length).getValues()[0];
  const repaired = current.slice();
  let changed = false;
  for (let i = 0; i < SCENES_HEADERS.length; i++) {
    const value = String(current[i] || '').trim();
    if (value && value !== SCENES_HEADERS[i]) {
      throw new Error('scenesシートのヘッダーが想定と異なります（' + (i + 1) + '列目）。');
    }
    if (!value) {
      repaired[i] = SCENES_HEADERS[i];
      changed = true;
    }
  }

  sheet.getRange(1, 1, 1, SCENES_HEADERS.length)
    .setValues([repaired])
    .setFontWeight('bold')
    .setBackground('#E8F0FE');
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 240);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 100);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 150);
  sheet.setColumnWidth(9, 190);
  sheet.setColumnWidth(10, 190);
  sheet.setFrozenRows(1);
  applyScenesDataValidations_(sheet);
  return { repaired: changed };
}

/**
 * scenes シートを取得し、なければ作成する。
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateScenesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SCENES_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SCENES_SHEET_NAME);
  repairScenesSheet_(sheet);
  return sheet;
}

/**
 * 有限な数値だけを返す。0は有効値として保持する。
 *
 * @param {*} value
 * @returns {number|null}
 */
function toFiniteNumber_(value) {
  if (value === '' || value == null || typeof value === 'boolean') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return typeof number === 'number' && isFinite(number) ? number : null;
}

/**
 * Sheets 由来の真偽値を正規化する。
 *
 * @param {*} value
 * @returns {boolean}
 */
function toSceneBoolean_(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * scenes の明示種別だけを正規化する。不明値は空文字にする。
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeSceneType_(value) {
  const normalized = String(value == null ? '' : value).trim().toUpperCase();
  if (normalized === SCENE_TYPE_2D) return SCENE_TYPE_2D;
  if (normalized === SCENE_TYPE_360) return SCENE_TYPE_360;
  return '';
}

/**
 * Date、ISO文字列などを比較用ミリ秒へ正規化する。
 *
 * @param {*} value
 * @returns {number|null}
 */
function toSceneDateMillis_(value) {
  if (value == null || value === '') return null;
  try {
    if (value && typeof value.getTime === 'function') {
      const time = value.getTime();
      return isFinite(time) ? time : null;
    }
    const parsed = new Date(value).getTime();
    return isFinite(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

/**
 * クライアント返却用に日時を ISO 文字列へ正規化する。
 *
 * @param {*} value
 * @returns {string}
 */
function toSceneIsoString_(value) {
  const time = toSceneDateMillis_(value);
  return time == null ? '' : new Date(time).toISOString();
}

/** scenesの表示名をGoogle Sheetsで数式にしないリテラル値へ変換する。 */
function protectSceneDisplayNameForSheet_(value) {
  const text = String(value == null ? '' : value);
  return text.charAt(0) === '=' ? "'" + text : text;
}

/** リテラル保護用の先頭アポストロフがAPI値に残る環境で正規化する。 */
function unprotectSceneDisplayNameFromSheet_(value) {
  const text = String(value == null ? '' : value);
  return text.indexOf("'=") === 0 ? text.slice(1) : text;
}

/**
 * scenes の1行を名前付きオブジェクトへ変換する。
 *
 * @param {Array<*>} values
 * @param {number} rowNumber
 * @returns {Object}
 */
function sceneValuesToObject_(values, rowNumber) {
  return {
    rowNumber: rowNumber,
    values: values,
    fileId: String(values[SCENE_COLUMN_INDEX.fileId] || '').trim(),
    displayName: unprotectSceneDisplayNameFromSheet_(values[SCENE_COLUMN_INDEX.displayName]),
    parentFolderId: String(values[SCENE_COLUMN_INDEX.parentFolderId] || ''),
    type: normalizeSceneType_(values[SCENE_COLUMN_INDEX.type]),
    isHome: toSceneBoolean_(values[SCENE_COLUMN_INDEX.isHome]),
    displayOrder: toFiniteNumber_(values[SCENE_COLUMN_INDEX.displayOrder]),
    northOffset: toFiniteNumber_(values[SCENE_COLUMN_INDEX.northOffset]),
    northOffsetSource: String(values[SCENE_COLUMN_INDEX.northOffsetSource] || '').trim().toLowerCase(),
    driveUpdatedAt: values[SCENE_COLUMN_INDEX.driveUpdatedAt],
    sceneUpdatedAt: values[SCENE_COLUMN_INDEX.sceneUpdatedAt]
  };
}

/** 空行として無視できないscenesセルかを返す。数式は表示値に関係なく実データとする。 */
function isMeaningfulSceneCell_(value, formula) {
  if (String(formula || '').trim()) return true;
  return value !== '' && value !== null && value !== undefined && value !== false;
}

/** DriveファイルIDの有無に関係なく、scenesの論理データ行かを返す。 */
function isLogicalSceneDataRow_(values, formulas) {
  const rowValues = values || [];
  const rowFormulas = formulas || [];
  for (let i = 0; i < SCENES_HEADERS.length; i++) {
    if (isMeaningfulSceneCell_(rowValues[i], rowFormulas[i])) return true;
  }
  return false;
}

/**
 * scenes を一括読み取りし、ファイルID索引と既存重複を返す。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet=} sheet
 * @returns {{rows:Array<Object>,values:Array<Array<*>>,formulas:Array<Array<string>>,byFileId:Object,duplicateFileIds:Array<string>}}
 */
function readSceneRows_(sheet) {
  const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCENES_SHEET_NAME);
  if (!targetSheet || targetSheet.getLastRow() <= 1) {
    return {
      rows: [],
      values: [],
      formulas: [],
      byFileId: {},
      duplicateFileIds: [],
      orphanRowNumbers: [],
      logicalLastRow: 1,
      physicalLastRow: targetSheet ? targetSheet.getLastRow() : 0
    };
  }

  const physicalLastRow = targetSheet.getLastRow();
  const range = targetSheet.getRange(2, 1, physicalLastRow - 1, SCENES_HEADERS.length);
  const values = range.getValues();
  let formulas = [];
  try {
    formulas = range.getFormulas();
  } catch (e) {
    throw new Error(
      'scenesシートの数式を安全に取得できません。既存データを保護するため処理を中止しました: ' +
      (e && e.message ? e.message : String(e))
    );
  }
  const writableValues = values.map(function(row, rowIndex) {
    const rowFormulas = formulas[rowIndex] || [];
    return row.map(function(value, columnIndex) {
      if (rowFormulas[columnIndex]) return rowFormulas[columnIndex];
      return columnIndex === SCENE_COLUMN_INDEX.displayName
        ? protectSceneDisplayNameForSheet_(unprotectSceneDisplayNameFromSheet_(value))
        : value;
    });
  });
  const rows = [];
  const byFileId = {};
  const duplicateFileIds = [];
  const orphanRowNumbers = [];
  let logicalLastRow = 1;
  values.forEach(function(rowValues, index) {
    const rowNumber = index + 2;
    const rowFormulas = formulas[index] || [];
    if (!isLogicalSceneDataRow_(rowValues, rowFormulas)) return;
    logicalLastRow = rowNumber;
    const row = sceneValuesToObject_(rowValues, rowNumber);
    if (!row.fileId) {
      orphanRowNumbers.push(rowNumber);
      return;
    }
    rows.push(row);
    if (byFileId[row.fileId]) {
      if (duplicateFileIds.indexOf(row.fileId) === -1) duplicateFileIds.push(row.fileId);
    } else {
      byFileId[row.fileId] = row;
    }
  });

  if (duplicateFileIds.length > 0) {
    console.warn('scenesシートでDriveファイルIDの重複を検出しました:', duplicateFileIds.join(', '));
  }
  return {
    rows: rows,
    values: writableValues.slice(0, Math.max(logicalLastRow - 1, 0)),
    formulas: formulas.slice(0, Math.max(logicalLastRow - 1, 0)),
    byFileId: byFileId,
    duplicateFileIds: duplicateFileIds,
    orphanRowNumbers: orphanRowNumbers,
    logicalLastRow: logicalLastRow,
    physicalLastRow: physicalLastRow
  };
}

/**
 * setupSheets用の安全なscenes補修。
 * IDなし実データまたは重複IDがあれば移動せず、そうでなければID行だけを順序どおり上へ詰める。
 */
function repairScenesDataRows_(sheet) {
  const snapshot = readSceneRows_(sheet);
  const warnings = [];
  if (snapshot.orphanRowNumbers.length > 0) {
    warnings.push(
      'DriveファイルIDなしの実データ行があるため、scenesの自動移動を行いませんでした（行: ' +
      snapshot.orphanRowNumbers.join(', ') + '）。'
    );
  }
  if (snapshot.duplicateFileIds.length > 0) {
    warnings.push(
      '重複ファイルIDがあるため、scenesの自動移動を行いませんでした: ' +
      snapshot.duplicateFileIds.join(', ')
    );
  }
  if (warnings.length > 0) {
    applyScenesDataValidations_(sheet);
    return { moved: 0, clearedRows: 0, warnings: warnings };
  }

  const rowPlans = snapshot.rows.map(function(row, index) {
    const sourceIndex = row.rowNumber - 2;
    const formulas = snapshot.formulas[sourceIndex] || [];
    return {
      rowNumber: row.rowNumber,
      targetRowNumber: index + 2,
      values: snapshot.values[sourceIndex].slice(0, SCENES_HEADERS.length),
      hasFormula: formulas.some(function(formula) {
        return String(formula || '').trim() !== '';
      })
    };
  });
  const movingFormulaRows = rowPlans.filter(function(plan) {
    return plan.hasFormula && plan.rowNumber !== plan.targetRowNumber;
  });

  if (movingFormulaRows.length > 0) {
    warnings.push(
      '数式を含む行を移動する必要があるため、scenesの自動移動を行いませんでした（行: ' +
      movingFormulaRows.map(function(plan) { return plan.rowNumber; }).join(', ') +
      '）。既存の数式と参照先は変更していません。'
    );
    const trailingRowCount = Math.max(snapshot.physicalLastRow - snapshot.logicalLastRow, 0);
    if (trailingRowCount > 0) {
      sheet.getRange(
        snapshot.logicalLastRow + 1,
        1,
        trailingRowCount,
        SCENES_HEADERS.length
      ).clearContent();
    }
    applyScenesDataValidations_(sheet);
    return { moved: 0, clearedRows: trailingRowCount, warnings: warnings };
  }

  const movedPlans = rowPlans.filter(function(plan) {
    return plan.rowNumber !== plan.targetRowNumber;
  });
  const moved = movedPlans.length;

  if (moved > 0 && rowPlans.length > 0) {
    const hasAnyFormula = rowPlans.some(function(plan) { return plan.hasFormula; });
    if (hasAnyFormula) {
      movedPlans.forEach(function(plan) {
        sheet.getRange(plan.targetRowNumber, 1, 1, SCENES_HEADERS.length).setValues([plan.values]);
      });
    } else {
      sheet.getRange(2, 1, rowPlans.length, SCENES_HEADERS.length).setValues(
        rowPlans.map(function(plan) { return plan.values; })
      );
    }
  }

  const firstEmptyRow = rowPlans.length + 2;
  const clearedRows = Math.max(snapshot.physicalLastRow - firstEmptyRow + 1, 0);
  if (clearedRows > 0) {
    sheet.getRange(firstEmptyRow, 1, clearedRows, SCENES_HEADERS.length).clearContent();
  }
  applyScenesDataValidations_(sheet);
  return { moved: moved, clearedRows: clearedRows, warnings: warnings };
}

/**
 * 指定ファイルIDのscenes行を一括読込済みスナップショットから返す。
 *
 * @param {string} fileId
 * @param {{rows:Array<Object>}=} snapshot
 * @returns {Array<Object>}
 */
function findSceneRowsByFileId_(fileId, snapshot) {
  const targetId = String(fileId || '').trim();
  if (!targetId) return [];
  const data = snapshot || readSceneRows_();
  return data.rows.filter(function(row) { return row.fileId === targetId; });
}

/**
 * 更新オブジェクトをscenes行へ反映する。
 *
 * @param {Array<*>} row
 * @param {Object} update
 * @param {string=} existingNorthOffsetSource
 * @returns {boolean}
 */
function applySceneUpdate_(row, update, existingNorthOffsetSource) {
  const hasOwn = function(key) { return Object.prototype.hasOwnProperty.call(update, key); };
  const source = hasOwn('northOffsetSource')
    ? String(update.northOffsetSource || '').trim().toLowerCase()
    : '';
  const existingSource = String(
    existingNorthOffsetSource != null
      ? existingNorthOffsetSource
      : (row[SCENE_COLUMN_INDEX.northOffsetSource] || '')
  ).trim().toLowerCase();
  const protectsManual = existingSource === 'manual' && source !== 'manual' &&
    update.allowManualNorthOffsetOverride !== true &&
    (hasOwn('northOffset') || hasOwn('northOffsetSource'));
  let changed = false;

  const assign = function(index, value) {
    const previous = row[index];
    const isDateColumn = index === SCENE_COLUMN_INDEX.driveUpdatedAt ||
      index === SCENE_COLUMN_INDEX.sceneUpdatedAt;
    const previousTime = isDateColumn ? toSceneDateMillis_(previous) : null;
    const nextTime = isDateColumn ? toSceneDateMillis_(value) : null;
    const same = isDateColumn && previousTime != null && nextTime != null
      ? previousTime === nextTime
      : previous === value;
    if (!same) {
      row[index] = value;
      changed = true;
    }
  };

  const fields = [
    ['displayName', SCENE_COLUMN_INDEX.displayName],
    ['parentFolderId', SCENE_COLUMN_INDEX.parentFolderId],
    ['type', SCENE_COLUMN_INDEX.type],
    ['isHome', SCENE_COLUMN_INDEX.isHome],
    ['displayOrder', SCENE_COLUMN_INDEX.displayOrder],
    ['driveUpdatedAt', SCENE_COLUMN_INDEX.driveUpdatedAt]
  ];
  fields.forEach(function(field) {
    if (!hasOwn(field[0])) return;
    const value = field[0] === 'displayName'
      ? protectSceneDisplayNameForSheet_(unprotectSceneDisplayNameFromSheet_(update[field[0]]))
      : update[field[0]];
    assign(field[1], value);
  });

  if (!protectsManual && hasOwn('northOffset')) {
    const number = toFiniteNumber_(update.northOffset);
    assign(SCENE_COLUMN_INDEX.northOffset, number == null ? '' : number);
  }
  if (!protectsManual && hasOwn('northOffsetSource')) {
    if (source && NORTH_OFFSET_SOURCES.indexOf(source) === -1) {
      throw new Error('northOffset取得元が不正です: ' + source);
    }
    assign(SCENE_COLUMN_INDEX.northOffsetSource, source);
  }
  return changed;
}

/**
 * scenes の既存行を安全に更新し、未登録IDを一括追加する。
 *
 * @param {Array<Object>} updates
 * @param {GoogleAppsScript.Spreadsheet.Sheet=} sheet
 * @param {{rows:Array<Object>,values:Array<Array<*>>,byFileId:Object,duplicateFileIds:Array<string>}=} existingSnapshot
 * @returns {{updated:number,added:number,duplicateFileIds:Array<string>}}
 */
function upsertScenes_(updates, sheet, existingSnapshot) {
  const targetSheet = sheet || getOrCreateScenesSheet_();
  if (sheet) repairScenesSheet_(targetSheet);
  const snapshot = existingSnapshot || readSceneRows_(targetSheet);
  const mergedUpdates = {};
  const updateOrder = [];
  (updates || []).forEach(function(update) {
    const fileId = String(update && (update.fileId || update.driveFileId) || '').trim();
    if (!fileId) return;
    if (!mergedUpdates[fileId]) {
      mergedUpdates[fileId] = { fileId: fileId };
      updateOrder.push(fileId);
    }
    Object.keys(update).forEach(function(key) { mergedUpdates[fileId][key] = update[key]; });
  });

  const existingValues = snapshot.values;
  const additions = [];
  let updated = 0;

  updateOrder.forEach(function(fileId) {
    const update = mergedUpdates[fileId];
    const existing = snapshot.byFileId[fileId];
    if (existing) {
      const row = existingValues[existing.rowNumber - 2];
      if (applySceneUpdate_(row, update, existing.northOffsetSource)) {
        row[SCENE_COLUMN_INDEX.sceneUpdatedAt] = update.sceneUpdatedAt || new Date();
        updated++;
      }
      return;
    }

    const row = Array(SCENES_HEADERS.length).fill('');
    row[SCENE_COLUMN_INDEX.fileId] = fileId;
    applySceneUpdate_(row, update);
    row[SCENE_COLUMN_INDEX.sceneUpdatedAt] = update.sceneUpdatedAt || new Date();
    additions.push(row);
  });

  if (updated > 0) {
    targetSheet.getRange(2, 1, existingValues.length, SCENES_HEADERS.length).setValues(existingValues);
  }
  if (additions.length > 0) {
    const logicalLastRow = typeof snapshot.logicalLastRow === 'number'
      ? snapshot.logicalLastRow
      : snapshot.values.length + 1;
    targetSheet.getRange(logicalLastRow + 1, 1, additions.length, SCENES_HEADERS.length).setValues(additions);
  }
  return { updated: updated, added: additions.length, duplicateFileIds: snapshot.duplicateFileIds };
}

/** northOffset取得元から設定画面の3モードへ正規化する。 */
function getSceneNorthOffsetMode_(scene) {
  const source = String(scene && scene.northOffsetSource || '').trim().toLowerCase();
  if (source === 'manual') return 'manual';
  if (source === 'none') return 'none';
  return 'auto';
}

/** 手動northOffsetを0以上360未満の有限数へ正規化する。不正値はnull。 */
function normalizeManualNorthOffset_(value) {
  if (value === '' || value == null || typeof value === 'boolean') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (typeof number !== 'number' || !isFinite(number) || number < 0 || number >= 360) return null;
  return number;
}

/** 画像ファイル名末尾の対応拡張子とMIMEを返す。 */
function getSupportedImageExtension_(fileName) {
  const match = String(fileName || '').match(/\.(jpe?g|png|gif|webp)$/i);
  if (!match) return null;
  const normalized = String(match[1] || '').toLowerCase();
  const mimeType = normalized === 'jpg' || normalized === 'jpeg'
    ? 'image/jpeg'
    : 'image/' + normalized;
  return {
    extension: match[0],
    normalizedExtension: normalized,
    mimeType: mimeType
  };
}

/**
 * 設定モーダルの名前を検証し、元の拡張子を維持したDrive名へ正規化する。
 *
 * @param {*} requestedName
 * @param {*} originalFileName
 * @param {*} mimeType
 * @returns {{baseName:string,fullName:string,extension:string}}
 */
function normalizeSceneNameForSave_(requestedName, originalFileName, mimeType) {
  const original = String(originalFileName || '').trim();
  const extensionInfo = getSupportedImageExtension_(original);
  if (!extensionInfo) {
    throw new Error('元のDrive名に対応画像拡張子がないため、名前を変更できません。');
  }
  if (String(mimeType || '').trim().toLowerCase() !== extensionInfo.mimeType) {
    throw new Error('元のDrive名の拡張子とMIMEタイプが一致しません。');
  }

  let baseName = String(requestedName == null ? '' : requestedName).trim();
  if (!baseName) throw new Error('名前を空にはできません。');
  if (/[\u0000-\u001f\u007f-\u009f]/.test(baseName)) {
    throw new Error('名前に制御文字は使用できません。');
  }

  const originalBaseName = original.slice(0, -extensionInfo.extension.length);

  // 末尾の「ドット＋英字2～5文字」だけを拡張子らしい入力として扱う。
  // .v2 や .2026 は数字を含むため、Map.v2 / 撮影.2026 の名前として保持する。
  // 元のベース名との完全一致は、複数ドットを含んでいても変更なしとして先に受理する。
  if (baseName !== originalBaseName) {
    const extensionLikeMatch = baseName.match(/\.([A-Za-z]{2,5})$/);
    if (extensionLikeMatch) {
      const requestedExtension = String(extensionLikeMatch[1] || '').toLowerCase();
      if (requestedExtension !== extensionInfo.normalizedExtension) {
        throw new Error('元の画像と異なる拡張子は指定できません。');
      }
      baseName = baseName.slice(0, -extensionLikeMatch[0].length).trim();
    }
  }
  if (!baseName) throw new Error('名前を空にはできません。');
  if (/[\u0000-\u001f\u007f-\u009f]/.test(baseName)) {
    throw new Error('名前に制御文字は使用できません。');
  }

  return {
    baseName: baseName,
    fullName: baseName + extensionInfo.extension,
    extension: extensionInfo.extension
  };
}

/**
 * 編集対象sceneをSheetと実Driveの両方で検証する。
 * 未登録、重複、ルート外、親不一致、画像以外は拒否する。
 *
 * @param {string} fileId
 * @param {{scenesSheet?:GoogleAppsScript.Spreadsheet.Sheet,snapshot?:Object}=} options
 * @returns {{fileId:string,rootFolderId:string,scenesSheet:Object,snapshot:Object,scene:Object,file:Object,parentFolderIds:Array<string>}}
 */
function getEditableSceneContext_(fileId, options) {
  const targetId = String(fileId || '').trim();
  if (!targetId) throw new Error('ファイルIDが指定されていません。');

  const config = getAppConfig_();
  const rootFolderId = extractDriveFolderId_(config[IMAGE_DRIVE_URL_CONFIG_KEY] || '') || '';
  if (!rootFolderId) throw new Error('IMAGE_DRIVE_URLに有効なルートフォルダが設定されていません。');

  const opts = options || {};
  const scenesSheet = opts.scenesSheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCENES_SHEET_NAME);
  if (!scenesSheet) throw new Error('scenesシートに対象画像が登録されていません。');
  const snapshot = opts.snapshot || readSceneRows_(scenesSheet);
  if ((snapshot.duplicateFileIds || []).indexOf(targetId) !== -1) {
    throw new Error('scenesシートに対象ファイルIDの重複があります。先に重複を解消してください。');
  }
  const scene = snapshot.byFileId[targetId];
  if (!scene) throw new Error('scenesシートに対象画像が登録されていません。');

  const sceneParentFolderId = String(scene.parentFolderId || '').trim();
  if (!sceneParentFolderId || !isDriveFolderWithinRoot_(sceneParentFolderId, rootFolderId)) {
    throw new Error('対象シーンは設定済みルートフォルダの配下ではありません。');
  }

  const file = DriveApp.getFileById(targetId);
  if (String(file.getId() || '').trim() !== targetId) {
    throw new Error('DriveファイルIDがscenesの登録内容と一致しません。');
  }
  if (IMAGE_MIME_TYPES.indexOf(String(file.getMimeType() || '')) === -1) {
    throw new Error('対象ファイルは対応画像形式ではありません。');
  }

  const parentFolderIds = getFileParentFolderIds_(file);
  if (parentFolderIds.indexOf(sceneParentFolderId) === -1) {
    throw new Error('Drive上の親フォルダとscenesの親フォルダが一致しません。一覧を同期してください。');
  }
  const hasParentWithinRoot = parentFolderIds.some(function(parentFolderId) {
    return isDriveFolderWithinRoot_(parentFolderId, rootFolderId);
  });
  if (!hasParentWithinRoot) {
    throw new Error('対象Driveファイルは設定済みルートフォルダの配下ではありません。');
  }

  return {
    fileId: targetId,
    rootFolderId: rootFolderId,
    scenesSheet: scenesSheet,
    snapshot: snapshot,
    scene: scene,
    file: file,
    parentFolderIds: parentFolderIds
  };
}

/** 編集APIとクライアント局所更新で共用する正規化sceneを返す。 */
function buildEditableSceneResult_(context, scene) {
  const currentScene = scene || context.scene;
  const type = normalizeSceneType_(currentScene.type) || SCENE_TYPE_360;
  const northOffset = toFiniteNumber_(currentScene.northOffset);
  return {
    fileId: context.fileId,
    id: context.fileId,
    name: String(currentScene.displayName || context.file.getName() || ''),
    displayName: String(currentScene.displayName || context.file.getName() || ''),
    driveName: String(context.file.getName() || ''),
    parentFolderId: String(currentScene.parentFolderId || ''),
    type: type,
    sceneType: type,
    isHome: toSceneBoolean_(currentScene.isHome),
    displayOrder: toFiniteNumber_(currentScene.displayOrder),
    order: toFiniteNumber_(currentScene.displayOrder),
    northOffset: northOffset,
    northOffsetSource: String(currentScene.northOffsetSource || '').trim().toLowerCase(),
    northOffsetMode: getSceneNorthOffsetMode_(currentScene),
    isRootScene: String(currentScene.parentFolderId || '') === context.rootFolderId,
    mimeType: String(context.file.getMimeType() || ''),
    driveUpdatedAt: toSceneIsoString_(currentScene.driveUpdatedAt),
    sceneUpdatedAt: toSceneIsoString_(currentScene.sceneUpdatedAt)
  };
}

/** 編集トークン付きで一件のシーン設定を取得する。 */
function getSceneSettings(payload) {
  assertEditToken_(payload);
  try {
    const fileId = payload && typeof payload === 'object' ? payload.fileId : '';
    const context = getEditableSceneContext_(fileId);
    return { success: true, scene: buildEditableSceneResult_(context) };
  } catch (e) {
    console.error('[scene-settings] stage=get:', e && e.message ? e.message : e);
    return { success: false, error: e && e.message ? e.message : 'シーン設定を取得できませんでした。' };
  }
}

/**
 * infoシートに対象シーンのホットスポットが1件以上あるかを返す。
 * 360度と2Dでは座標の意味が異なるため、種別変更の事前確認に使う。
 *
 * @param {string} fileId
 * @param {GoogleAppsScript.Spreadsheet.Sheet=} infoSheet
 * @returns {boolean}
 */
function hasStoredHotspotsForScene_(fileId, infoSheet) {
  const targetId = String(fileId || '').trim();
  if (!targetId) return false;
  const sheet = infoSheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INFO_SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) return false;
  const imageIds = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
  return imageIds.some(function(row) {
    return String(row[0] || '').trim() === targetId;
  });
}

/** 編集トークン付きで名前、種別、northOffset設定を一回の保存操作で更新する。 */
function updateSceneSettings(payload) {
  assertEditToken_(payload);
  const req = payload && typeof payload === 'object' ? payload : {};

  let validatedContext = null;
  try {
    // 入力検証より先に、対象sceneとDriveファイルが編集可能であることを確認する。
    validatedContext = getEditableSceneContext_(req.fileId);
  } catch (e) {
    console.error('[scene-settings] fileId=' + String(req.fileId || '') + ' stage=validate-target:', e && e.message ? e.message : e);
    return { success: false, error: e && e.message ? e.message : '対象シーンを確認できませんでした。' };
  }

  const requestedType = normalizeSceneType_(req.type);
  if (!requestedType) {
    return { success: false, error: '種別は360または2Dを指定してください。' };
  }
  const validatedCurrentType = normalizeSceneType_(validatedContext.scene.type) || SCENE_TYPE_360;
  try {
    if (requestedType !== validatedCurrentType && hasStoredHotspotsForScene_(validatedContext.fileId)) {
      return {
        success: false,
        error: '保存済みのホットスポットがあるため、シーン種別を360と2Dの間で変更できません。先にホットスポットを削除してください。'
      };
    }
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : 'ホットスポットを確認できませんでした。' };
  }

  const hasRequestedName = Object.prototype.hasOwnProperty.call(req, 'name');
  let validatedName = null;
  if (hasRequestedName) {
    try {
      validatedName = normalizeSceneNameForSave_(
        req.name,
        validatedContext.file.getName(),
        validatedContext.file.getMimeType()
      );
    } catch (e) {
      return { success: false, error: e && e.message ? e.message : '名前が不正です。' };
    }
  }

  const hasNorthOffsetMode = Object.prototype.hasOwnProperty.call(req, 'northOffsetMode') &&
    String(req.northOffsetMode || '').trim() !== '';
  const northOffsetMode = String(req.northOffsetMode || '').trim().toLowerCase();
  let manualNorthOffset = null;
  if (requestedType === SCENE_TYPE_360 && hasNorthOffsetMode) {
    if (['auto', 'manual', 'none'].indexOf(northOffsetMode) === -1) {
      return { success: false, error: '北方向補正モードが不正です。' };
    }
    if (northOffsetMode === 'manual') {
      manualNorthOffset = normalizeManualNorthOffset_(req.northOffset);
      if (manualNorthOffset == null) {
        return { success: false, error: '手動northOffsetは0以上360未満の有限数を指定してください。' };
      }
    }
  }

  let lock = null;
  let context = null;
  let updatedScene = null;
  let driveUpdated = false;
  let sceneUpdated = false;
  let cacheInvalidated = true;
  const warnings = [];
  try {
    // 全入力の検証が完了してからLockを取得し、競合に備えて対象を再検証する。
    lock = acquireLock_();
    const scenesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCENES_SHEET_NAME);
    const snapshot = readSceneRows_(scenesSheet);
    context = getEditableSceneContext_(req.fileId, { scenesSheet: scenesSheet, snapshot: snapshot });
    const lockedCurrentType = normalizeSceneType_(context.scene.type) || SCENE_TYPE_360;
    if (requestedType !== lockedCurrentType && hasStoredHotspotsForScene_(
      context.fileId,
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INFO_SHEET_NAME)
    )) {
      throw new Error('保存済みのホットスポットがあるため、シーン種別を360と2Dの間で変更できません。');
    }

    if (hasRequestedName) {
      // Lock待ちの間にDrive名が変わっていないかを含め、現在値に対して再検証する。
      validatedName = normalizeSceneNameForSave_(
        req.name,
        context.file.getName(),
        context.file.getMimeType()
      );
      if (validatedName.fullName !== String(context.file.getName() || '')) {
        try {
          context.file.setName(validatedName.fullName);
          driveUpdated = true;
        } catch (driveError) {
          console.error(
            '[scene-settings] fileId=' + context.fileId + ' stage=rename-drive:',
            driveError && driveError.message ? driveError.message : driveError
          );
          return {
            success: false,
            partialSuccess: false,
            driveUpdated: false,
            sceneUpdated: false,
            error: '名前の変更に失敗しました。scenesの設定は変更していません。'
          };
        }
      }
    }

    const update = {
      fileId: context.fileId,
      type: requestedType,
      sceneUpdatedAt: new Date()
    };
    if (hasRequestedName) {
      update.displayName = validatedName.fullName;
      if (driveUpdated && context.file.getLastUpdated) {
        update.driveUpdatedAt = context.file.getLastUpdated();
      }
    }
    if (requestedType === SCENE_TYPE_360 && hasNorthOffsetMode) {
      update.allowManualNorthOffsetOverride = true;
      if (northOffsetMode === 'manual') {
        update.northOffset = manualNorthOffset;
        update.northOffsetSource = 'manual';
      } else if (northOffsetMode === 'none') {
        update.northOffset = null;
        update.northOffsetSource = 'none';
      } else {
        update.northOffset = null;
        update.northOffsetSource = '';
      }
    }
    try {
      upsertScenes_([update], context.scenesSheet, context.snapshot);
      updatedScene = readSceneRows_(context.scenesSheet).byFileId[context.fileId];
      if (!updatedScene) throw new Error('更新後のscenes行を確認できませんでした。');
      sceneUpdated = true;
    } catch (sceneError) {
      if (!driveUpdated) throw sceneError;
      warnings.push('Drive名は変更済みですが、scenesの設定更新に失敗しました。次回同期で表示名を修復できます。');
      console.error(
        '[scene-settings] fileId=' + context.fileId + ' stage=update-scenes-after-drive:',
        sceneError && sceneError.message ? sceneError.message : sceneError
      );
      updatedScene = Object.assign({}, context.scene, {
        displayName: String(context.file.getName() || validatedName.fullName),
        driveUpdatedAt: context.file.getLastUpdated ? context.file.getLastUpdated() : context.scene.driveUpdatedAt
      });
    }
  } catch (e) {
    console.error('[scene-settings] fileId=' + String(req.fileId || '') + ' stage=update:', e && e.message ? e.message : e);
    if (!driveUpdated) {
      return {
        success: false,
        partialSuccess: false,
        driveUpdated: false,
        sceneUpdated: false,
        error: e && e.message ? e.message : 'シーン設定を更新できませんでした。'
      };
    }
    warnings.push('Drive名は変更済みですが、scenesの設定更新に失敗しました。次回同期で表示名を修復できます。');
    updatedScene = Object.assign({}, context ? context.scene : validatedContext.scene, {
      displayName: String((context || validatedContext).file.getName() || '')
    });
  } finally {
    if (lock) lock.releaseLock();
  }

  const folderId = String(updatedScene && updatedScene.parentFolderId || context.scene.parentFolderId || '');
  cacheInvalidated = invalidateFolderListCache_(folderId);
  if (!cacheInvalidated) {
    warnings.push(
      sceneUpdated
        ? 'シーン設定は更新済みですが、フォルダ一覧キャッシュを無効化できませんでした。'
        : 'Drive名は変更済みですが、フォルダ一覧キャッシュを無効化できませんでした。'
    );
  }
  if (!cacheInvalidated) {
    console.error(
      '[scene-settings] fileId=' + context.fileId + ' folderId=' + folderId + ' stage=cache-invalidate:',
      'folder list cache invalidation failed'
    );
  }
  return {
    success: true,
    partialSuccess: warnings.length > 0,
    driveUpdated: driveUpdated,
    sceneUpdated: sceneUpdated,
    cacheInvalidated: cacheInvalidated,
    scene: buildEditableSceneResult_(context, updatedScene),
    warning: warnings.join('\n'),
    warnings: warnings
  };
}

/**
 * ルート直下のホームをLock内で最大1件へ更新する内部処理。
 * 公開ラッパーとアップロード後処理からだけ呼び出す。
 *
 * @param {string} fileId
 * @param {{lockAlreadyHeld?:boolean}=} options
 * @returns {{success:boolean,partialSuccess:boolean,scene:Object,homeImageId:string,changedFileIds:Array<string>,cacheInvalidated:boolean,warning:string,warnings:Array<string>}}
 */
function setHomeSceneInternal_(fileId, options) {
  const opts = options || {};
  const targetId = String(fileId || '').trim();
  let lock = null;
  let context = null;
  let updatedScene = null;
  let changedFileIds = [];
  try {
    lock = opts.lockAlreadyHeld ? null : acquireLock_();
    const scenesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCENES_SHEET_NAME);
    const snapshot = readSceneRows_(scenesSheet);
    if ((snapshot.duplicateFileIds || []).length > 0) {
      throw new Error(
        'scenesシートにファイルIDの重複があります。ホーム設定の前に重複を解消してください: ' +
        snapshot.duplicateFileIds.join(', ')
      );
    }
    context = getEditableSceneContext_(targetId, { scenesSheet: scenesSheet, snapshot: snapshot });
    if (String(context.scene.parentFolderId || '') !== context.rootFolderId) {
      throw new Error('ホームに設定できるのはルートフォルダ直下の画像だけです。サブフォルダ画像は指定できません。');
    }

    const updates = [];
    snapshot.rows.forEach(function(scene) {
      if (String(scene.parentFolderId || '') !== context.rootFolderId) return;
      const shouldBeHome = scene.fileId === targetId;
      if (toSceneBoolean_(scene.isHome) === shouldBeHome) return;
      updates.push({
        fileId: scene.fileId,
        isHome: shouldBeHome,
        sceneUpdatedAt: new Date()
      });
      changedFileIds.push(scene.fileId);
    });
    if (updates.length > 0) upsertScenes_(updates, context.scenesSheet, context.snapshot);
    updatedScene = readSceneRows_(context.scenesSheet).byFileId[targetId];
  } finally {
    if (lock) lock.releaseLock();
  }

  // 冪等な再指定でも、前回のCacheService失敗を回復できるよう必ず再試行する。
  const cacheInvalidated = invalidateFolderListCache_(context.rootFolderId);
  const warnings = cacheInvalidated
    ? []
    : ['ホーム設定は更新済みですが、ルート一覧キャッシュを無効化できませんでした。'];
  if (!cacheInvalidated) {
    console.error(
      '[scene-home] fileId=' + targetId + ' folderId=' + context.rootFolderId + ' stage=cache-invalidate:',
      'folder list cache invalidation failed'
    );
  }
  return {
    success: true,
    partialSuccess: warnings.length > 0,
    scene: buildEditableSceneResult_(context, updatedScene),
    homeImageId: targetId,
    changedFileIds: changedFileIds,
    cacheInvalidated: cacheInvalidated,
    warning: warnings.join('\n'),
    warnings: warnings
  };
}

/** 編集トークン付きでルート直下のホームシーンを変更する。 */
function setHomeScene(payload) {
  assertEditToken_(payload);
  const fileId = payload && typeof payload === 'object' ? payload.fileId : '';
  try {
    return setHomeSceneInternal_(fileId);
  } catch (e) {
    console.error('[scene-home] fileId=' + String(fileId || '') + ' stage=update:', e && e.message ? e.message : e);
    return { success: false, error: e && e.message ? e.message : 'ホームシーンを更新できませんでした。' };
  }
}

/**
 * 現在のDrive直下画像と完全一致する順序をscenesの表示順列へ一括保存する。
 *
 * @param {{folderId:string,orderedFileIds:Array<string>,__editToken:string}} payload
 * @returns {{success:boolean,orderedFileIds?:Array<string>,cacheInvalidated?:boolean,partialSuccess?:boolean,warning?:string,error?:string}}
 */
function reorderScenes(payload) {
  assertEditToken_(payload);
  const request = payload && typeof payload === 'object' ? payload : {};
  let lock = null;
  try {
    lock = acquireLock_();

    if (typeof request.folderId !== 'string' || !request.folderId.trim()) {
      throw new Error('並び替え対象のフォルダIDが指定されていません。');
    }
    const folderId = request.folderId.trim();
    if (!Array.isArray(request.orderedFileIds) || request.orderedFileIds.length === 0) {
      throw new Error('並び替え対象の画像ID一覧が指定されていません。');
    }

    const orderedFileIds = [];
    const requestedIdSet = {};
    request.orderedFileIds.forEach(function(rawFileId) {
      if (typeof rawFileId !== 'string' || !rawFileId.trim()) {
        throw new Error('画像ID一覧に空または不正な値が含まれています。');
      }
      const fileId = rawFileId.trim();
      if (requestedIdSet[fileId]) {
        throw new Error('画像ID一覧に重複があります: ' + fileId);
      }
      requestedIdSet[fileId] = true;
      orderedFileIds.push(fileId);
    });

    const rootFolderId = extractDriveFolderId_(
      getAppConfig_()[IMAGE_DRIVE_URL_CONFIG_KEY] || ''
    ) || '';
    if (!rootFolderId || !isDriveFolderWithinRoot_(folderId, rootFolderId)) {
      throw new Error('並び替え対象のフォルダは設定済みルートフォルダの配下ではありません。');
    }

    const driveListing = listDriveFolderItems_(folderId);
    const currentFileIds = driveListing.images.map(function(image) {
      return String(image && image.id || '').trim();
    });
    const currentIdSet = {};
    currentFileIds.forEach(function(fileId) { currentIdSet[fileId] = true; });
    if (orderedFileIds.length !== currentFileIds.length) {
      throw new Error('送信された画像一覧が現在のフォルダ直下の画像一覧と一致しません。');
    }
    orderedFileIds.forEach(function(fileId) {
      if (!currentIdSet[fileId]) {
        throw new Error('並び替え対象外の画像IDが含まれています: ' + fileId);
      }
    });

    const scenesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCENES_SHEET_NAME);
    if (!scenesSheet) throw new Error('scenesシートが見つかりません。シーン一覧を再読み込みしてください。');
    const snapshot = readSceneRows_(scenesSheet);
    if ((snapshot.duplicateFileIds || []).length > 0) {
      throw new Error(
        'scenesシートにファイルIDの重複があります。並び替えの前に重複を解消してください: ' +
        snapshot.duplicateFileIds.join(', ')
      );
    }

    const targetRows = orderedFileIds.map(function(fileId) {
      const scene = snapshot.byFileId[fileId];
      if (!scene || String(scene.parentFolderId || '') !== folderId) {
        throw new Error('対象画像のscenes行が現在のフォルダと一致しません: ' + fileId);
      }
      return scene.rowNumber;
    });
    const firstRow = Math.min.apply(null, targetRows);
    const lastRow = Math.max.apply(null, targetRows);
    const displayOrderValues = [];
    for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber++) {
      const sourceRow = snapshot.values[rowNumber - 2] || [];
      displayOrderValues.push([sourceRow[SCENE_COLUMN_INDEX.displayOrder]]);
    }
    orderedFileIds.forEach(function(fileId, index) {
      const rowNumber = snapshot.byFileId[fileId].rowNumber;
      displayOrderValues[rowNumber - firstRow][0] = index + 1;
    });
    scenesSheet.getRange(
      firstRow,
      SCENE_COLUMN_INDEX.displayOrder + 1,
      displayOrderValues.length,
      1
    ).setValues(displayOrderValues);

    const cacheInvalidated = invalidateFolderListCache_(folderId);
    const warning = cacheInvalidated
      ? ''
      : '並び順は保存済みですが、フォルダ一覧キャッシュを無効化できませんでした。';
    if (!cacheInvalidated) {
      console.error(
        '[scene-reorder] folderId=' + folderId + ' stage=cache-invalidate:',
        'folder list cache invalidation failed'
      );
    }
    return {
      success: true,
      orderedFileIds: orderedFileIds,
      cacheInvalidated: cacheInvalidated,
      partialSuccess: !cacheInvalidated,
      warning: warning
    };
  } catch (e) {
    console.error(
      '[scene-reorder] folderId=' + String(request.folderId || '') + ' stage=update:',
      e && e.message ? e.message : e
    );
    return { success: false, error: e && e.message ? e.message : 'シーンの並び順を保存できませんでした。' };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * 旧ファイル名タグを新規 scenes 行の初回登録時だけ解釈する。
 *
 * @param {*} fileName
 * @returns {{type:string,isHomeCandidate:boolean}}
 */
function parseLegacySceneTags_(fileName) {
  const name = String(fileName || '');
  return {
    type: name.indexOf('[2D]') !== -1 ? SCENE_TYPE_2D : SCENE_TYPE_360,
    isHomeCandidate: name.indexOf('[HOME]') !== -1
  };
}

/**
 * localeCompare を使った空文字許容の安定比較。
 *
 * @param {*} left
 * @param {*} right
 * @returns {number}
 */
function compareSceneText_(left, right) {
  return String(left == null ? '' : left).localeCompare(
    String(right == null ? '' : right),
    'ja'
  );
}

/**
 * scenes の表示順を優先し、名前とIDで安定フォールバックする。
 *
 * @param {Object} left
 * @param {Object} right
 * @returns {number}
 */
function compareSceneImages_(left, right) {
  const leftOrder = toFiniteNumber_(left && (
    left.displayOrder != null ? left.displayOrder : left.order
  ));
  const rightOrder = toFiniteNumber_(right && (
    right.displayOrder != null ? right.displayOrder : right.order
  ));
  if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  if (leftOrder != null && rightOrder == null) return -1;
  if (leftOrder == null && rightOrder != null) return 1;

  const displayCompare = compareSceneText_(
    left && (left.displayName || left.name || left.driveName),
    right && (right.displayName || right.name || right.driveName)
  );
  if (displayCompare !== 0) return displayCompare;
  const driveCompare = compareSceneText_(left && left.driveName, right && right.driveName);
  if (driveCompare !== 0) return driveCompare;
  return compareSceneText_(left && left.id, right && right.id);
}

/**
 * 同一ファイルIDの同期更新を一つへまとめる。
 *
 * @param {Object} updatesById
 * @param {Array<string>} updateOrder
 * @param {string} fileId
 * @param {Object} values
 */
function mergeSceneSyncUpdate_(updatesById, updateOrder, fileId, values) {
  if (!updatesById[fileId]) {
    updatesById[fileId] = { fileId: fileId };
    updateOrder.push(fileId);
  }
  Object.keys(values || {}).forEach(function(key) {
    updatesById[fileId][key] = values[key];
  });
}

/**
 * Drive画像と一つのscenes状態をクライアント互換の画像項目へ結合する。
 *
 * @param {Object} driveImage
 * @param {Object} scene
 * @returns {Object}
 */
function joinDriveImageWithScene_(driveImage, scene) {
  const driveName = String(driveImage && driveImage.driveName || '');
  const displayName = String(scene && scene.displayName || driveName);
  const sceneType = normalizeSceneType_(scene && scene.type);
  const displayOrder = toFiniteNumber_(scene && scene.displayOrder);
  const northOffset = toFiniteNumber_(scene && scene.northOffset);
  return {
    id: String(driveImage && driveImage.id || ''),
    name: displayName,
    driveName: driveName,
    displayName: displayName,
    imageUrl: 'https://lh3.googleusercontent.com/d/' + String(driveImage && driveImage.id || '') + '=s0',
    mimeType: String(driveImage && driveImage.mimeType || ''),
    parentFolderId: String(scene && scene.parentFolderId || ''),
    type: sceneType,
    sceneType: sceneType,
    isHome: toSceneBoolean_(scene && scene.isHome),
    displayOrder: displayOrder,
    order: displayOrder,
    northOffset: northOffset,
    northOffsetSource: String(scene && scene.northOffsetSource || '').trim().toLowerCase(),
    driveUpdatedAt: toSceneIsoString_(driveImage && driveImage.driveUpdatedAt),
    sceneUpdatedAt: toSceneIsoString_(scene && scene.sceneUpdatedAt)
  };
}

/**
 * 一括読込済みscenesとDrive画像から、書込配列と結合済み一覧を純粋に計画する。
 *
 * @param {Array<Object>} driveImages
 * @param {{rows:Array<Object>,byFileId:Object}} snapshot
 * @param {{folderId:string,rootFolderId?:string,now?:Date,newSceneOverridesByFileId?:Object}=} options
 * @returns {{updates:Array<Object>,images:Array<Object>,homeNormalized:number,previousParentFolderIds:Array<string>}}
 */
function buildSceneFolderSyncPlan_(driveImages, snapshot, options) {
  const opts = options || {};
  const folderId = String(opts.folderId || '');
  const rootFolderId = String(opts.rootFolderId || '');
  const isRootFolder = !!folderId && folderId === rootFolderId;
  const now = opts.now || new Date();
  const overridesById = opts.newSceneOverridesByFileId || {};
  const existingSnapshot = snapshot || { rows: [], byFileId: {} };
  const updatesById = {};
  const updateOrder = [];
  const previousParentFolderIds = [];
  const previousParentFolderIdSet = {};
  let confirmedRootHomeMovedOut = false;
  let maximumOrder = null;

  (existingSnapshot.rows || []).forEach(function(row) {
    if (String(row.parentFolderId || '') !== folderId) return;
    const order = toFiniteNumber_(row.displayOrder);
    if (order != null && (maximumOrder == null || order > maximumOrder)) maximumOrder = order;
  });

  const newImages = (driveImages || []).filter(function(image) {
    return !existingSnapshot.byFileId[String(image.id || '')];
  }).slice().sort(function(left, right) {
    const nameCompare = compareSceneText_(left.driveName, right.driveName);
    return nameCompare !== 0 ? nameCompare : compareSceneText_(left.id, right.id);
  });
  const newOrderById = {};
  let nextOrder = maximumOrder == null ? 1 : maximumOrder + 1;
  newImages.forEach(function(image) {
    newOrderById[String(image.id || '')] = nextOrder;
    nextOrder += 1;
  });

  const projectedScenes = [];
  const driveImageIdSet = {};
  (driveImages || []).forEach(function(driveImage) {
    const fileId = String(driveImage && driveImage.id || '').trim();
    if (!fileId) return;
    driveImageIdSet[fileId] = true;
    const existing = existingSnapshot.byFileId[fileId];
    if (existing) {
      const existingUpdate = {};
      let needsUpdate = false;
      let projectedIsHome = toSceneBoolean_(existing.isHome);
      if (String(existing.parentFolderId || '') !== folderId) {
        const previousParentFolderId = String(existing.parentFolderId || '').trim();
        if (previousParentFolderId && !previousParentFolderIdSet[previousParentFolderId]) {
          previousParentFolderIdSet[previousParentFolderId] = true;
          previousParentFolderIds.push(previousParentFolderId);
        }
        existingUpdate.parentFolderId = folderId;
        if (!isRootFolder && projectedIsHome) {
          existingUpdate.isHome = false;
          projectedIsHome = false;
          if (previousParentFolderId === rootFolderId) confirmedRootHomeMovedOut = true;
        }
        needsUpdate = true;
      }
      const previousDriveTime = toSceneDateMillis_(existing.driveUpdatedAt);
      const nextDriveTime = toSceneDateMillis_(driveImage.driveUpdatedAt);
      let displayName = String(existing.displayName || '');
      const driveMetadataIsNewer = nextDriveTime != null &&
        (previousDriveTime == null || nextDriveTime > previousDriveTime);
      if (driveMetadataIsNewer) {
        existingUpdate.driveUpdatedAt = driveImage.driveUpdatedAt || '';
        if (String(driveImage.driveName || '') && displayName !== String(driveImage.driveName || '')) {
          displayName = String(driveImage.driveName || '');
          existingUpdate.displayName = displayName;
        }
        needsUpdate = true;
      }
      if (!displayName) {
        existingUpdate.displayName = String(driveImage.driveName || '');
        displayName = existingUpdate.displayName;
        needsUpdate = true;
      }
      if (needsUpdate) {
        existingUpdate.sceneUpdatedAt = now;
        mergeSceneSyncUpdate_(updatesById, updateOrder, fileId, existingUpdate);
      }
      projectedScenes.push({
        id: fileId,
        displayName: displayName || String(driveImage.driveName || ''),
        driveName: String(driveImage.driveName || ''),
        parentFolderId: folderId,
        type: normalizeSceneType_(existing.type),
        isHome: projectedIsHome,
        displayOrder: toFiniteNumber_(existing.displayOrder),
        northOffset: toFiniteNumber_(existing.northOffset),
        northOffsetSource: String(existing.northOffsetSource || ''),
        driveUpdatedAt: driveImage.driveUpdatedAt || '',
        sceneUpdatedAt: needsUpdate ? now : existing.sceneUpdatedAt,
        _driveImage: driveImage,
        _isNew: false,
        _homeCandidate: false
      });
      return;
    }

    const legacyTags = parseLegacySceneTags_(driveImage.driveName);
    const override = overridesById[fileId] || {};
    const hasOverrideType = Object.prototype.hasOwnProperty.call(override, 'type');
    const hasOverrideHome = Object.prototype.hasOwnProperty.call(override, 'isHome');
    const sceneType = hasOverrideType
      ? (normalizeSceneType_(override.type) || SCENE_TYPE_360)
      : legacyTags.type;
    const displayName = String(
      Object.prototype.hasOwnProperty.call(override, 'displayName')
        ? override.displayName
        : driveImage.driveName
    );
    const newScene = {
      id: fileId,
      displayName: displayName,
      driveName: String(driveImage.driveName || ''),
      parentFolderId: folderId,
      type: sceneType,
      isHome: false,
      displayOrder: newOrderById[fileId],
      northOffset: null,
      northOffsetSource: '',
      driveUpdatedAt: driveImage.driveUpdatedAt || '',
      sceneUpdatedAt: now,
      _driveImage: driveImage,
      _isNew: true,
      _homeCandidate: hasOverrideHome ? toSceneBoolean_(override.isHome) : legacyTags.isHomeCandidate
    };
    projectedScenes.push(newScene);
    mergeSceneSyncUpdate_(updatesById, updateOrder, fileId, {
      displayName: newScene.displayName,
      parentFolderId: folderId,
      type: newScene.type,
      isHome: false,
      displayOrder: newScene.displayOrder,
      northOffset: null,
      northOffsetSource: '',
      driveUpdatedAt: newScene.driveUpdatedAt,
      sceneUpdatedAt: now
    });
  });

  let homeNormalized = 0;
  if (!isRootFolder && confirmedRootHomeMovedOut && rootFolderId) {
    const remainingRootScenes = (existingSnapshot.rows || []).filter(function(scene) {
      const fileId = String(scene.fileId || '').trim();
      return !!fileId &&
        !driveImageIdSet[fileId] &&
        String(scene.parentFolderId || '') === rootFolderId;
    }).slice().sort(function(left, right) {
      return compareSceneImages_(
        Object.assign({ id: left.fileId }, left),
        Object.assign({ id: right.fileId }, right)
      );
    });
    const remainingHome = remainingRootScenes.filter(function(scene) {
      return toSceneBoolean_(scene.isHome);
    })[0] || null;
    if (!remainingHome && remainingRootScenes.length > 0) {
      homeNormalized += 1;
      mergeSceneSyncUpdate_(updatesById, updateOrder, remainingRootScenes[0].fileId, {
        isHome: true,
        sceneUpdatedAt: now
      });
    }
  }
  const hasUnlistedRootHome = isRootFolder && (existingSnapshot.rows || []).some(function(scene) {
    const fileId = String(scene.fileId || '').trim();
    return !!fileId &&
      !driveImageIdSet[fileId] &&
      String(scene.parentFolderId || '') === rootFolderId &&
      toSceneBoolean_(scene.isHome);
  });
  // Driveの一覧は一時的に欠落することがある。既存ホームが今回の列挙にない場合は、
  // その行を解除したり別シーンを昇格したりせず、次回の完全な同期まで保留する。
  if (isRootFolder && projectedScenes.length > 0 && !hasUnlistedRootHome) {
    const stableScenes = projectedScenes.slice().sort(compareSceneImages_);
    let selectedHome = stableScenes.filter(function(scene) {
      return !scene._isNew && scene.isHome;
    })[0] || null;
    if (!selectedHome) {
      selectedHome = stableScenes.filter(function(scene) {
        return scene._isNew && scene._homeCandidate;
      })[0] || null;
    }
    if (!selectedHome) selectedHome = stableScenes[0];

    projectedScenes.forEach(function(scene) {
      const shouldBeHome = scene.id === selectedHome.id;
      if (scene.isHome === shouldBeHome) return;
      scene.isHome = shouldBeHome;
      scene.sceneUpdatedAt = now;
      homeNormalized += 1;
      mergeSceneSyncUpdate_(updatesById, updateOrder, scene.id, {
        isHome: shouldBeHome,
        sceneUpdatedAt: now
      });
    });
  }

  const joinedImages = projectedScenes.map(function(scene) {
    return joinDriveImageWithScene_(scene._driveImage, scene);
  }).sort(compareSceneImages_);
  return {
    updates: updateOrder.map(function(fileId) { return updatesById[fileId]; }),
    images: joinedImages,
    homeNormalized: homeNormalized,
    previousParentFolderIds: previousParentFolderIds
  };
}

/**
 * 対象フォルダ直下をDriveから列挙する。失敗は呼び出し元へ伝播する。
 *
 * @param {string} folderId
 * @returns {{folders:Array<Object>,images:Array<Object>}}
 */
function getOfficialHotspotPhotoFolderId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(HOTSPOT_PHOTO_FOLDER_ID_KEY) || ''
  ).trim();
}

function getOfficialHotspotFolderId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(HOTSPOT_FOLDER_ID_KEY) || ''
  ).trim();
}

function getOfficialHotspotAudioFolderId_() {
  return String(
    PropertiesService.getScriptProperties().getProperty(HOTSPOT_AUDIO_FOLDER_ID_KEY) || ''
  ).trim();
}

function getProtectedHotspotAttachmentFolderIds_() {
  return [
    getOfficialHotspotFolderId_(),
    getOfficialHotspotPhotoFolderId_(),
    getOfficialHotspotAudioFolderId_()
  ].filter(function(folderId, index, all) {
    return !!folderId && all.indexOf(folderId) === index;
  });
}

function listDriveFolderItems_(folderId) {
  const protectedFolderIds = getProtectedHotspotAttachmentFolderIds_();
  if (protectedFolderIds.indexOf(String(folderId || '').trim()) !== -1) {
    throw new Error('ホットスポット添付専用フォルダはシーン一覧へ公開できません。');
  }
  const folder = DriveApp.getFolderById(folderId);
  const folders = [];
  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    if (protectedFolderIds.indexOf(String(subfolder.getId() || '').trim()) !== -1) {
      continue;
    }
    folders.push({ id: subfolder.getId(), name: subfolder.getName(), type: 'folder' });
  }
  folders.sort(function(left, right) {
    const nameCompare = compareSceneText_(left.name, right.name);
    return nameCompare !== 0 ? nameCompare : compareSceneText_(left.id, right.id);
  });

  const images = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (IMAGE_MIME_TYPES.indexOf(file.getMimeType()) === -1) continue;
    let driveUpdatedAt = '';
    try {
      driveUpdatedAt = file.getLastUpdated() || '';
    } catch (e) {
      driveUpdatedAt = '';
    }
    images.push({
      id: file.getId(),
      driveName: file.getName(),
      mimeType: file.getMimeType(),
      driveUpdatedAt: driveUpdatedAt
    });
  }
  return { folders: folders, images: images };
}

/** 同期エラーへ失敗段階を付与し、Drive列挙失敗とscenes失敗を区別する。 */
function tagSceneSyncError_(error, stage) {
  const taggedError = error && typeof error === 'object'
    ? error
    : new Error(String(error || 'unknown error'));
  if (!taggedError.sceneSyncStage) taggedError.sceneSyncStage = stage;
  return taggedError;
}

/**
 * Drive列挙成功後だけロック内でscenesを一括同期する。
 *
 * @param {string} folderId
 * @param {{rootFolderId?:string,newSceneOverridesByFileId?:Object,lockAlreadyHeld?:boolean}=} options
 * @returns {{images:Array<Object>,sync:Object}}
 */
function syncDriveFolderToScenes_(folderId, options) {
  const opts = options || {};
  let lock = null;
  let driveListing;
  let writeResult;
  let plan;
  try {
    lock = opts.lockAlreadyHeld ? null : acquireLock_();
    try {
      driveListing = listDriveFolderItems_(folderId);
    } catch (driveError) {
      throw tagSceneSyncError_(driveError, 'drive-list');
    }
    const scenesSheet = getOrCreateScenesSheet_();
    const snapshot = readSceneRows_(scenesSheet);
    plan = buildSceneFolderSyncPlan_(driveListing.images, snapshot, {
      folderId: folderId,
      rootFolderId: opts.rootFolderId,
      newSceneOverridesByFileId: opts.newSceneOverridesByFileId,
      now: new Date()
    });
    writeResult = upsertScenes_(plan.updates, scenesSheet, snapshot);
  } catch (sceneError) {
    if (sceneError && sceneError.sceneSyncStage) throw sceneError;
    throw tagSceneSyncError_(sceneError, 'scenes-sync');
  } finally {
    if (lock) lock.releaseLock();
  }

  const hasSceneChanges = writeResult.added > 0 || writeResult.updated > 0 || plan.homeNormalized > 0;
  const cacheFolderIdsToInvalidate = [];
  const cacheFolderIdSet = {};
  if (hasSceneChanges) {
    [String(folderId || '')].concat(plan.previousParentFolderIds || []).forEach(function(cacheFolderId) {
      const normalizedId = String(cacheFolderId || '').trim();
      if (!normalizedId || cacheFolderIdSet[normalizedId]) return;
      cacheFolderIdSet[normalizedId] = true;
      cacheFolderIdsToInvalidate.push(normalizedId);
    });
  }

  const cacheInvalidationFailedFolderIds = [];
  cacheFolderIdsToInvalidate.forEach(function(cacheFolderId) {
    if (invalidateFolderListCache_(cacheFolderId)) return;
    cacheInvalidationFailedFolderIds.push(cacheFolderId);
    console.error(
      '[scene-sync] folderId=' + cacheFolderId + ' stage=cache-invalidate:',
      'folder list cache invalidation failed'
    );
  });
  const partialSuccess = cacheInvalidationFailedFolderIds.length > 0;
  const warnings = partialSuccess
    ? ['scenesは更新済みですが、一部のフォルダ一覧キャッシュを無効化できませんでした。']
    : [];
  return {
    images: driveListing.folders.concat(plan.images),
    partialSuccess: partialSuccess,
    warning: warnings.join('\n'),
    warnings: warnings,
    sync: {
      added: writeResult.added,
      updated: writeResult.updated,
      homeNormalized: plan.homeNormalized,
      duplicateFileIds: writeResult.duplicateFileIds,
      cacheFolderIdsToInvalidate: cacheFolderIdsToInvalidate,
      cacheInvalidationFailedFolderIds: cacheInvalidationFailedFolderIds,
      partialSuccess: partialSuccess,
      warning: warnings.join('\n')
    }
  };
}

/**
 * northOffsetキャッシュを返す。
 * 優先順位: scenes → 移行期間中のconfig NORTH_<ID>。
 *
 * @param {string} fileId
 * @returns {{ cached:boolean, value:number|null, source?:string }}
 */
function getCachedNorthOffset_(fileId) {
  const targetId = String(fileId || '').trim();
  if (!targetId) return { cached: false, value: null };

  const scenesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCENES_SHEET_NAME);
  if (scenesSheet) {
    const snapshot = readSceneRows_(scenesSheet);
    const scene = snapshot.byFileId[targetId];
    if (scene) {
      if (scene.northOffset != null) {
        return { cached: true, value: scene.northOffset, source: scene.northOffsetSource || 'xmp' };
      }
      if (scene.northOffsetSource === 'none') {
        return { cached: true, value: null, source: 'none' };
      }
    }
  }

  const config = getAppConfig_();
  const legacyValue = config['NORTH_' + targetId];
  if (legacyValue === undefined || legacyValue === '') return { cached: false, value: null };
  if (String(legacyValue).trim().toUpperCase() === 'NONE') {
    return { cached: true, value: null, source: 'legacy' };
  }
  const number = toFiniteNumber_(legacyValue);
  return number == null
    ? { cached: false, value: null }
    : { cached: true, value: number, source: 'legacy' };
}

/**
 * XMP取得結果をscenesへ保存する。manual値はupsert側で保護する。
 *
 * @param {string} fileId
 * @param {number|null} northOffset
 * @param {string=} source
 * @returns {{ saved:boolean, source?:string }}
 */
function setCachedNorthOffset_(fileId, northOffset, source) {
  const targetId = String(fileId || '').trim();
  if (!targetId) return { saved: false };
  const number = toFiniteNumber_(northOffset);
  const normalizedSource = String(source || (number == null ? 'none' : 'xmp')).trim().toLowerCase();
  const lock = acquireLock_();
  let parentFolderId = '';
  let writeResult = null;
  try {
    const scenesSheet = getOrCreateScenesSheet_();
    const snapshot = readSceneRows_(scenesSheet);
    const existing = snapshot.byFileId[targetId];
    parentFolderId = existing ? String(existing.parentFolderId || '') : '';
    writeResult = upsertScenes_([{
      fileId: targetId,
      northOffset: number,
      northOffsetSource: normalizedSource
    }], scenesSheet, snapshot);
  } finally {
    lock.releaseLock();
  }
  if (parentFolderId && writeResult && (writeResult.updated > 0 || writeResult.added > 0)) {
    invalidateFolderListCache_(parentFolderId);
  }
  return { saved: true, source: normalizedSource };
}

/**
 * 公開経路からのnorthOffset保存を既存scenes行だけに限定する。
 * Drive同期・アップロード等が使う新規登録可能なupsertとは分離し、未登録IDでは行を作らない。
 *
 * @param {string} fileId
 * @param {number|null} northOffset
 * @param {string=} source
 * @returns {{ saved:boolean, source?:string }}
 */
function updateExistingSceneNorthOffset_(fileId, northOffset, source) {
  const targetId = String(fileId || '').trim();
  if (!targetId) return { saved: false };

  const number = toFiniteNumber_(northOffset);
  const normalizedSource = String(source || (number == null ? 'none' : 'xmp')).trim().toLowerCase();
  const lock = acquireLock_();
  let parentFolderId = '';
  let writeResult = null;
  try {
    const scenesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCENES_SHEET_NAME);
    if (!scenesSheet) return { saved: false };

    const snapshot = readSceneRows_(scenesSheet);
    const existing = snapshot.byFileId[targetId];
    if (!existing) return { saved: false };

    parentFolderId = String(existing.parentFolderId || '');
    writeResult = upsertScenes_([{
      fileId: targetId,
      northOffset: number,
      northOffsetSource: normalizedSource
    }], scenesSheet, snapshot);
  } finally {
    lock.releaseLock();
  }

  const saved = !!(writeResult && writeResult.updated > 0);
  if (parentFolderId && saved) invalidateFolderListCache_(parentFolderId);
  return { saved: saved, source: normalizedSource };
}

/**
 * 公開northOffset取得の対象範囲をDrive Blob取得前に判定する。
 * フォルダモードは登録済み360シーンかつ設定ルート配下、単一画像モードは設定ファイルとの完全一致だけを許可する。
 *
 * @param {string} fileId
 * @returns {{ allowed:boolean, mode?:string, scene?:Object|null, reason?:string }}
 */
function getNorthOffsetAccessContext_(fileId) {
  const targetId = String(fileId || '').trim();
  if (!targetId) return { allowed: false, reason: 'empty-file-id' };

  const config = getAppConfig_();
  const configuredUrl = config[IMAGE_DRIVE_URL_CONFIG_KEY] || '';
  const rootFolderId = extractDriveFolderId_(configuredUrl) || '';
  const configuredFileId = extractDriveFileId_(configuredUrl) || '';
  const scenesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCENES_SHEET_NAME);
  const snapshot = scenesSheet ? readSceneRows_(scenesSheet) : { byFileId: {}, duplicateFileIds: [] };
  const scene = snapshot.byFileId[targetId] || null;

  if (rootFolderId) {
    if (!scene) return { allowed: false, reason: 'unregistered-scene' };
    if ((snapshot.duplicateFileIds || []).indexOf(targetId) !== -1) {
      return { allowed: false, reason: 'duplicate-scene-id', scene: scene };
    }
    if (normalizeSceneType_(scene.type) !== SCENE_TYPE_360) {
      return { allowed: false, reason: 'not-360-scene', scene: scene };
    }
    const parentFolderId = String(scene.parentFolderId || '').trim();
    if (!parentFolderId || !isDriveFolderWithinRoot_(parentFolderId, rootFolderId)) {
      return { allowed: false, reason: 'outside-configured-root', scene: scene };
    }
    try {
      const file = DriveApp.getFileById(targetId);
      if (String(file.getId() || '').trim() !== targetId) {
        return { allowed: false, reason: 'drive-id-mismatch', scene: scene };
      }
      if (IMAGE_MIME_TYPES.indexOf(String(file.getMimeType() || '')) === -1) {
        return { allowed: false, reason: 'not-image', scene: scene };
      }
      const parentFolderIds = getFileParentFolderIds_(file);
      if (parentFolderIds.indexOf(parentFolderId) === -1) {
        return { allowed: false, reason: 'drive-parent-mismatch', scene: scene };
      }
      const isActuallyWithinRoot = parentFolderIds.some(function(actualParentFolderId) {
        return isDriveFolderWithinRoot_(actualParentFolderId, rootFolderId);
      });
      if (!isActuallyWithinRoot) {
        return { allowed: false, reason: 'drive-outside-configured-root', scene: scene };
      }
      return { allowed: true, mode: 'folder', scene: scene, file: file };
    } catch (e) {
      return { allowed: false, reason: 'drive-validation-failed', scene: scene };
    }
  }

  if (configuredFileId && configuredFileId === targetId) {
    if (scene && normalizeSceneType_(scene.type) === SCENE_TYPE_2D) {
      return { allowed: false, reason: 'not-360-scene', scene: scene };
    }
    try {
      const file = DriveApp.getFileById(targetId);
      if (String(file.getId() || '').trim() !== targetId ||
          IMAGE_MIME_TYPES.indexOf(String(file.getMimeType() || '')) === -1) {
        return { allowed: false, reason: 'configured-file-invalid', scene: scene };
      }
      return { allowed: true, mode: 'single', scene: scene, file: file };
    } catch (e) {
      return { allowed: false, reason: 'drive-validation-failed', scene: scene };
    }
  }

  return { allowed: false, reason: 'not-configured-file' };
}

/**
 * 公開対象であることを確認し、未キャッシュのJPEGだけXMPを1回解析する。
 * フォルダモードの保存先は既存scenes行に限定し、2D・未登録・ルート外ではDriveファイルを読まない。
 *
 * @param {string} fileId
 * @param {GoogleAppsScript.Drive.File=} file
 * @returns {number|null}
 */
function getOrExtractNorthOffset_(fileId, file) {
  const targetId = String(fileId || '').trim();
  if (!targetId) return null;

  const access = getNorthOffsetAccessContext_(targetId);
  if (!access.allowed) return null;

  // scenes行がある場合はその状態を正とする。manual/noneは非JPEGでもBlobを読まず返し、
  // 空欄のautoへ戻した直後に旧config NORTH_<ID>へ逆戻りしないようにする。
  if (access.scene) {
    const sceneValue = toFiniteNumber_(access.scene.northOffset);
    const sceneSource = String(access.scene.northOffsetSource || '').trim().toLowerCase();
    if (sceneValue != null) return sceneValue;
    if (sceneSource === 'manual' || sceneSource === 'none') return null;
  } else {
    const cached = getCachedNorthOffset_(targetId);
    if (cached.cached) return cached.value;
  }

  const targetFile = file || access.file || DriveApp.getFileById(targetId);
  if (targetFile.getMimeType() !== 'image/jpeg') return null;

  const northOffset = toFiniteNumber_(extractHeadingFromBlob_(targetFile.getBlob()));
  try {
    updateExistingSceneNorthOffset_(targetId, northOffset, northOffset == null ? 'none' : 'xmp');
  } catch (cacheError) {
    console.warn('northOffsetのscenes保存をスキップしました:', cacheError.message);
  }
  return northOffset;
}


// ============================================================
//  スプレッドシートメニュー（onOpen トリガー）
// ============================================================

/**
 * スプレッドシートを開いたときにカスタムメニューを追加する。
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('設定')
    .addItem('初期設定・更新', 'setupSheets')
    .addSeparator()
    .addItem('編集用URLを生成・更新', 'generateOrUpdateEditUrlFromMenu')
    .addItem('編集キーを再生成', 'regenerateEditKey')
    .addSeparator()
    .addItem('一括入力用スプシを作成', 'createStudentSheetFromMenu')
    .addItem('一括入力用スプシを更新', 'updateStudentSheetDropdownsFromMenu')
    .addItem('一括入力データを取り込む', 'bulkImportStudentSheetFromMenu')
    .addToUi();
}

/**
 * configのWEB_APP_URLまたはEDIT_KEYが直接編集されたとき、古いEDIT_URLだけを消去する。
 * 値の再生成や外部リソースへのアクセスは行わない。
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit=} e
 */
function onEdit(e) {
  const range = e && e.range;
  if (!range || typeof range.getSheet !== 'function') return;
  const sheet = range.getSheet();
  if (!sheet || sheet.getName() !== CONFIG_SHEET_NAME) return;

  const firstColumn = range.getColumn();
  const lastColumn = firstColumn + range.getNumColumns() - 1;
  if (firstColumn > 2 || lastColumn < 2) return;

  const firstRow = range.getRow();
  const rowCount = range.getNumRows();
  const keys = sheet.getRange(firstRow, 1, rowCount, 1).getValues();
  const shouldInvalidate = keys.some(function(row) {
    const key = String(row[0] || '').trim();
    return key === WEB_APP_URL_CONFIG_KEY || key === EDIT_KEY_CONFIG_KEY;
  });
  if (!shouldInvalidate) return;

  const editUrlRow = findConfigRow_(sheet, EDIT_URL_CONFIG_KEY);
  if (editUrlRow) sheet.getRange(editUrlRow, 2).clearContent();
}


// ============================================================
//  初期設定シート生成
// ============================================================

/**
 * configの旧 NORTH_<DriveファイルID> 行をscenesへ移行する。
 * scenes側の同値確認後だけ元行を削除し、不正値・manual衝突は保持する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} configSheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} scenesSheet
 * @param {Array<Object>=} configRowsSnapshot
 * @returns {{ migrated:number, warnings:Array<string>, duplicateFileIds:Array<string> }}
 */
function migrateLegacyNorthOffsets_(configSheet, scenesSheet, configRowsSnapshot) {
  const configRows = configRowsSnapshot || readConfigRows_(configSheet);
  const candidates = [];
  const warnings = [];
  const before = readSceneRows_(scenesSheet);

  configRows.forEach(function(row) {
    if (row.key.indexOf('NORTH_') !== 0) return;
    const fileId = row.key.slice('NORTH_'.length).trim();
    const rawValue = String(row.value == null ? '' : row.value).trim();
    if (!fileId) {
      warnings.push(row.key + ': DriveファイルIDが空のため移行しませんでした。');
      return;
    }

    const isNone = rawValue.toUpperCase() === 'NONE';
    const number = isNone ? null : toFiniteNumber_(rawValue);
    if (!isNone && number == null) {
      warnings.push(row.key + ': 値「' + rawValue + '」が不正なためconfigに残しました。');
      return;
    }

    const existing = before.byFileId[fileId];
    if (existing && existing.northOffsetSource === 'manual') {
      const sameManualValue = isNone
        ? existing.northOffset == null
        : existing.northOffset === number;
      if (!sameManualValue) {
        warnings.push(row.key + ': scenesのmanual値を保護するためconfigに残しました。');
        return;
      }
    }

    candidates.push({
      rowNumber: row.rowNumber,
      key: row.key,
      fileId: fileId,
      isNone: isNone,
      number: number
    });
  });

  if (candidates.length > 0) {
    upsertScenes_(candidates.map(function(candidate) {
      return {
        fileId: candidate.fileId,
        northOffset: candidate.number,
        northOffsetSource: candidate.isNone ? 'none' : 'xmp'
      };
    }), scenesSheet, before);
  }

  const verifiedRows = [];
  const after = readSceneRows_(scenesSheet);
  candidates.forEach(function(candidate) {
    const scene = after.byFileId[candidate.fileId];
    const verified = !!scene && (candidate.isNone
      ? scene.northOffset == null && scene.northOffsetSource === 'none'
      : scene.northOffset === candidate.number &&
        (scene.northOffsetSource === 'xmp' || scene.northOffsetSource === 'manual'));
    if (verified) {
      verifiedRows.push(candidate.rowNumber);
    } else {
      warnings.push(candidate.key + ': scenes側の保存結果を確認できないためconfigに残しました。');
    }
  });

  if (verifiedRows.length > 0) {
    const keepRows = configRows
      .filter(function(row) { return verifiedRows.indexOf(row.rowNumber) === -1; })
      .map(function(row) { return row.cells.slice(0, CONFIG_HEADERS.length); });
    writeConfigRows_(configSheet, keepRows);
  }

  return {
    migrated: verifiedRows.length,
    warnings: warnings,
    duplicateFileIds: after.duplicateFileIds
  };
}

/**
 * config/info/scenesを既存データを保持しながら作成・補修・移行する。
 */
function setupSheets() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const ui   = SpreadsheetApp.getUi();
  const msgs = [];
  const lock = acquireLock_();
  try {
    // ---- config シート ----
    let configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
    const configExisted = !!configSheet;
    let configRepair;
    if (!configSheet) {
      configSheet = ss.insertSheet(CONFIG_SHEET_NAME);
      configRepair = initializeConfigSheet_(configSheet);
    } else {
      configRepair = repairConfigSheet_(configSheet);
    }
    msgs.push(configExisted
      ? '✅ 「config」シートの既存値を保持して不足項目と順序を補修しました。'
      : '✅ 「config」シートを作成しました。');
    if (configRepair.removedDuplicateKeys.length > 0) {
      msgs.push('⚠️ configの重複基本項目を1行へ統合しました: ' + configRepair.removedDuplicateKeys.join(', '));
    }
    const hasOfficialHotspotFolder = !!(
      getOfficialHotspotFolderId_() ||
      getOfficialHotspotPhotoFolderId_() ||
      getOfficialHotspotAudioFolderId_() ||
      String(PropertiesService.getScriptProperties().getProperty(HOTSPOT_FOLDER_MIGRATION_STATE_KEY) || '').trim()
    );
    if (hasOfficialHotspotFolder) {
      try {
        const hotspotStructure = getHotspotFolderStructure_(true, configSheet);
        msgs.push('✅ Hemisphere Hotspot/photos/audioの構成を検証・補修し、configのHOTSPOT_FOLDER_URLを同期しました。');
        (hotspotStructure.warnings || []).forEach(function(warning) { msgs.push('⚠️ ' + warning); });
      } catch (hotspotFolderError) {
        msgs.push('⚠️ Hotspot添付フォルダ構成を安全に検証・移行できませんでした。既存データは置き換えていません。');
        console.error(
          'setupSheets Hotspotフォルダ検証・移行エラー:',
          hotspotFolderError && hotspotFolderError.message ? hotspotFolderError.message : hotspotFolderError
        );
      }
    } else {
      const emptyFolderSync = syncHotspotFolderUrlConfig_('', configSheet, null);
      if (!emptyFolderSync.success) msgs.push('⚠️ ' + emptyFolderSync.warning);
    }
    const configRows = readConfigRows_(configSheet);

    const studentReferenceRepair = repairStudentSheetUrlConfigFromProperty_(configSheet, configRows);
    if (studentReferenceRepair.repaired) {
      msgs.push('✅ 正式なSTUDENT_SHEET_IDからconfigのSTUDENT_SHEET_URLを修復しました。');
    } else if (studentReferenceRepair.warning) {
      msgs.push('⚠️ STUDENT_SHEET_URLの修復をスキップしました: ' + studentReferenceRepair.warning);
    }

    const editKeyResult = ensureEditKeyConfig_(configSheet, configRows);
    msgs.push(editKeyResult.migrated
      ? '✅ 旧スクリプト プロパティのEDIT_KEYをconfigへ移行しました。'
      : (editKeyResult.generated
          ? '✅ configにEDIT_KEYを生成しました。'
          : 'ℹ️ configの既存EDIT_KEYを保持しました。'));

    // ---- info シート ----
    let infoSheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!infoSheet) {
      infoSheet = ss.insertSheet(INFO_SHEET_NAME);
      applyInfoSheetSchema_(infoSheet);
      msgs.push('✅ 「info」シートを作成しました。');
    } else {
      const infoMigration = migrateSheetIfNeeded_(infoSheet);
      if (infoMigration.warning) {
        msgs.push('⚠️ ' + infoMigration.warning + ' 既存データは変更していません。');
      } else {
        msgs.push('✅ 「info」シートの既存行を保持してスキーマを確認・補修しました。');
      }
    }

    // ---- scenes シートとNORTH移行 ----
    const scenesExisted = !!ss.getSheetByName(SCENES_SHEET_NAME);
    const scenesSheet = getOrCreateScenesSheet_();
    msgs.push(scenesExisted
      ? '✅ 「scenes」シートの不足ヘッダーを補修しました。'
      : '✅ 「scenes」シートを作成しました。');
    const scenesDataRepair = repairScenesDataRows_(scenesSheet);
    if (scenesDataRepair.moved > 0) {
      msgs.push('✅ scenesの実データ行を順序どおり上へ' + scenesDataRepair.moved + '件詰め直しました。');
    } else if (scenesDataRepair.clearedRows > 0) {
      msgs.push('✅ scenesの空行に残っていた未チェックFALSE値を安全に消去しました。');
    }
    scenesDataRepair.warnings.forEach(function(warning) { msgs.push('⚠️ ' + warning); });
    const northMigration = migrateLegacyNorthOffsets_(configSheet, scenesSheet, configRows);
    if (northMigration.migrated > 0) {
      msgs.push('✅ configのNORTH_行をscenesへ' + northMigration.migrated + '件移行しました。');
    }
    northMigration.warnings.forEach(function(warning) { msgs.push('⚠️ ' + warning); });
    if (northMigration.duplicateFileIds.length > 0) {
      msgs.push('⚠️ scenesに重複ファイルIDがあります（自動削除していません）: ' + northMigration.duplicateFileIds.join(', '));
    }

  } finally {
    lock.releaseLock();
  }

  // UI表示中にLockServiceのロックを保持しない。
  ui.alert(
    '初期設定',
    msgs.join('\n') + '\n\n' +
    '次のステップ:\n' +
    '① configのIMAGE_DRIVE_URLに画像のGoogleドライブURLを入力してください。\n' +
    '② ホットスポットはinfo、画像単位設定はscenesに保存されます。',
    ui.ButtonSet.OK
  );
}

/**
 * configのWEB_APP_URLとEDIT_KEYからEDIT_URLを明示的に生成・更新する。
 * 無効なWEB_APP_URLでは古いEDIT_URLを必ず空にする。
 *
 * @returns {{success:boolean,url:string,error?:string}}
 */
function generateOrUpdateEditUrlFromMenu() {
  let ss = null;
  try {
    ss = getSpreadsheetMenuContainer_();
    let configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
    if (!configSheet) {
      configSheet = ss.insertSheet(CONFIG_SHEET_NAME);
      initializeConfigSheet_(configSheet);
    } else {
      repairConfigSheet_(configSheet);
    }
    const configRows = readConfigRows_(configSheet);
    ensureEditKeyConfig_(configSheet, configRows);
    const editUrlResult = refreshEditUrlConfig_(configSheet, configRows);

    if (editUrlResult.url) {
      ss.toast(
        'configシートのEDIT_URLを生成・更新しました。',
        '編集用URL',
        5
      );
      return { success: true, url: editUrlResult.url };
    }

    const error = editUrlResult.error || 'EDIT_URLを生成できませんでした。';
    ss.toast(
      error + ' 古いEDIT_URLは空欄にしました。',
      '編集用URL',
      8
    );
    return { success: false, url: '', error: error };
  } catch (e) {
    console.error('generateOrUpdateEditUrlFromMenu エラー:', e.message);
    if (ss) ss.toast('EDIT_URLの生成・更新に失敗しました: ' + e.message, '編集用URL', 8);
    return { success: false, url: '', error: e.message };
  }
}

/**
 * configのEDIT_KEYとEDIT_URLを同じ範囲書き込みで更新する。
 * 範囲内に別のconfig行がある場合も値・数式をそのまま保持する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<Object>} configRows
 * @param {string} newKey
 * @param {string} newEditUrl
 */
function updateEditKeyConfigPair_(sheet, configRows, newKey, newEditUrl) {
  const editKeyRow = findConfigSnapshotRow_(configRows, EDIT_KEY_CONFIG_KEY);
  const editUrlRow = findConfigSnapshotRow_(configRows, EDIT_URL_CONFIG_KEY);
  if (!editKeyRow || !editUrlRow) {
    throw new Error('configシートのEDIT_KEYまたはEDIT_URL行が見つかりません。');
  }

  const startRow = Math.min(editKeyRow.rowNumber, editUrlRow.rowNumber);
  const rowCount = Math.abs(editKeyRow.rowNumber - editUrlRow.rowNumber) + 1;
  const valueRange = sheet.getRange(startRow, 2, rowCount, 1);
  const values = valueRange.getValues();
  const formulas = valueRange.getFormulas();
  const previousCells = values.map(function(row, index) {
    const formula = formulas[index] && formulas[index][0];
    return [formula || row[0]];
  });
  const nextCells = previousCells.map(function(row) { return row.slice(); });
  nextCells[editKeyRow.rowNumber - startRow][0] = newKey;
  nextCells[editUrlRow.rowNumber - startRow][0] = newEditUrl;

  try {
    valueRange.setValues(nextCells);
  } catch (writeError) {
    // setValuesは一括書き込みだが、失敗時も旧値を明示的に復元して正本の分裂を防ぐ。
    let restoreError = null;
    try {
      valueRange.setValues(previousCells);
    } catch (e) {
      restoreError = e;
    }
    let restored = false;
    try {
      const restoredValues = valueRange.getValues();
      const restoredFormulas = valueRange.getFormulas();
      const restoredCells = restoredValues.map(function(row, index) {
        const formula = restoredFormulas[index] && restoredFormulas[index][0];
        return [formula || row[0]];
      });
      restored = restoredCells.length === previousCells.length && restoredCells.every(function(row, index) {
        return String(row[0] == null ? '' : row[0]) ===
          String(previousCells[index][0] == null ? '' : previousCells[index][0]);
      });
    } catch (verifyError) {
      restored = false;
    }
    writeError.configRestoreVerified = restored;
    if (restoreError) writeError.configRestoreError = restoreError.message || String(restoreError);
    throw writeError;
  }
}

/** config シートの EDIT_KEY を再生成する。 */
function regenerateEditKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '編集キーを再生成',
    '編集キーを再生成すると、これまで共有した編集URLは使えなくなります。続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return { success: false, cancelled: true };

  let lock = null;
  let result = null;
  try {
    lock = acquireLock_();
    const ss = getSpreadsheetMenuContainer_();
    const configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
    if (!configSheet) {
      throw new Error('configシートがありません。先に「初期設定・更新」を実行してください。');
    }

    const configRows = readConfigRows_(configSheet);
    [WEB_APP_URL_CONFIG_KEY, EDIT_URL_CONFIG_KEY, EDIT_KEY_CONFIG_KEY].forEach(function(key) {
      const matches = configRows.filter(function(row) { return row.key === key; });
      if (matches.length !== 1) {
        throw new Error(
          'configシートの' + key + '行が' + matches.length + '件あります。' +
          '「初期設定・更新」でconfigを補修してから再実行してください。'
        );
      }
    });

    // Lock取得後の現在値だけを使い、待機中に行われたconfig編集を取りこぼさない。
    const currentEditKeyRow = findConfigSnapshotRow_(configRows, EDIT_KEY_CONFIG_KEY);
    const currentEditUrlRow = findConfigSnapshotRow_(configRows, EDIT_URL_CONFIG_KEY);
    const currentWebAppUrlRow = findConfigSnapshotRow_(configRows, WEB_APP_URL_CONFIG_KEY);
    const oldEditKey = String(currentEditKeyRow && currentEditKeyRow.value || '').trim();
    const oldEditUrl = String(currentEditUrlRow && currentEditUrlRow.value || '').trim();
    const rawWebAppUrl = String(currentWebAppUrlRow && currentWebAppUrlRow.value || '').trim();
    const normalizedWebAppUrl = normalizeWebAppUrl_(rawWebAppUrl);
    const newKey = generateEditKey_();
    const newEditUrl = buildEditUrl_(normalizedWebAppUrl, newKey);

    try {
      updateEditKeyConfigPair_(configSheet, configRows, newKey, newEditUrl);
    } catch (configError) {
      result = {
        success: false,
        partialSuccess: false,
        oldEditKey: oldEditKey,
        oldEditUrl: oldEditUrl,
        oldValuesVerified: configError && configError.configRestoreVerified === true,
        error: configError && configError.message ? configError.message : String(configError)
      };
    }

    if (!result) {
      let scriptPropertyUpdated = false;
      let scriptPropertyError = '';
      try {
        PropertiesService.getScriptProperties().setProperty(EDIT_KEY_CONFIG_KEY, newKey);
        scriptPropertyUpdated = true;
      } catch (propertyError) {
        scriptPropertyError = propertyError && propertyError.message
          ? propertyError.message
          : String(propertyError);
      }

      result = {
        success: true,
        partialSuccess: !scriptPropertyUpdated,
        key: newKey,
        editUrl: newEditUrl,
        webAppUrlValid: !!normalizedWebAppUrl,
        scriptPropertyUpdated: scriptPropertyUpdated
      };
      if (scriptPropertyError) result.error = scriptPropertyError;
    }
  } catch (e) {
    result = {
      success: false,
      partialSuccess: false,
      oldValuesVerified: false,
      error: e && e.message ? e.message : String(e)
    };
  } finally {
    if (lock) lock.releaseLock();
  }

  // UI表示中にLockServiceのロックを保持しない。
  if (!result.success) {
    ui.alert(
      '編集キーの再生成に失敗しました',
      (result.oldValuesVerified
        ? 'configの旧EDIT_KEY・旧EDIT_URLを保持し、ScriptPropertiesも変更していません。\n' +
          '旧編集URLは引き続き利用できます。時間をおいて再度お試しください。'
        : 'configまたはその更新状態を安全に確認できなかったため、ScriptPropertiesは変更していません。\n' +
          'configのEDIT_KEY・EDIT_URL・WEB_APP_URLを確認し、必要なら「初期設定・更新」後に再実行してください。'),
      ui.ButtonSet.OK
    );
    return result;
  }

  if (result.partialSuccess) {
    ui.alert(
      '編集キーを一部更新しました',
      'configのEDIT_KEYとEDIT_URLは新しいキーへ更新しました。\n' +
      'ScriptPropertiesの同期に失敗しましたが、configを正本として新しい編集キーだけが有効です。',
      ui.ButtonSet.OK
    );
    return result;
  }

  ui.alert(
    '編集キーを再生成しました',
    'configのEDIT_KEYとScriptPropertiesを新しい値へ同期しました。\n' +
    (result.editUrl
      ? 'configシートのEDIT_URLも新しいキーで更新しました。'
      : 'WEB_APP_URLが空または不正なため、EDIT_URLを空欄にしました。WEB_APP_URL入力後に「編集用URLを生成・更新」を実行してください。'),
    ui.ButtonSet.OK
  );
  return result;
}


// ============================================================
//  Web アプリ エントリーポイント
// ============================================================

/**
 * GET リクエストを受け取り、HTMLページを返す。
 * Googleサイトへの埋め込みを許可するため ALLOWALL を設定する。
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const mode = String(params.mode || '');
  const requestedEditKey = String(params.editKey || '');
  const template = HtmlService.createTemplateFromFile('index');

  template.initialMode = mode === 'public' || mode === 'internal' || mode === 'edit' ? mode : '';
  template.editToken = '';
  const acceptedEditKeys = getAcceptedEditKeys_();
  const configuredEditKey = acceptedEditKeys.length > 0 ? acceptedEditKeys[0] : '';
  const matchedEditKey = acceptedEditKeys.indexOf(requestedEditKey) !== -1 ? requestedEditKey : '';

  if (mode === 'edit' && configuredEditKey && matchedEditKey) {
    const editToken = Utilities.getUuid();
    CacheService.getScriptCache().put(
      getEditTokenCacheKey_(editToken),
      getEditTokenCacheValue_(matchedEditKey),
      EDIT_TOKEN_TTL_SECONDS
    );
    template.editToken = editToken;
  }

  return template
    .evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('360°Viewer - Hemisphere')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

const AUDIO_VENDOR_VERSION = '1.50.8';
const AUDIO_VENDOR_START_MARKER = 'AUDIO_VENDOR_BUNDLE_START';
const AUDIO_VENDOR_END_MARKER = 'AUDIO_VENDOR_BUNDLE_END';

/**
 * app.html の音声vendor領域を厳密に検証して返す。
 *
 * @param {string} appSource
 * @returns {{ markerStart: number, markerEnd: number, source: string }}
 */
function locateAudioVendorRegion_(appSource) {
  const source = String(appSource || '');
  const startAt = source.indexOf(AUDIO_VENDOR_START_MARKER);
  const endAt = source.indexOf(AUDIO_VENDOR_END_MARKER);
  if (startAt === -1 || startAt !== source.lastIndexOf(AUDIO_VENDOR_START_MARKER)) {
    throw new Error('Audio vendor start marker must appear exactly once.');
  }
  if (endAt === -1 || endAt !== source.lastIndexOf(AUDIO_VENDOR_END_MARKER)) {
    throw new Error('Audio vendor end marker must appear exactly once.');
  }
  if (startAt >= endAt) {
    throw new Error('Audio vendor marker order is invalid.');
  }

  const markedStart = startAt + AUDIO_VENDOR_START_MARKER.length;
  const markedSource = source.slice(markedStart, endAt);
  const prefix = markedSource.match(/^(?:\r\n|\n)<script>(?:\r\n|\n)/);
  if (!prefix
      || markedSource.split('<script>').length - 1 !== 1
      || markedSource.split('</script>').length - 1 !== 1) {
    throw new Error('Audio vendor region must contain one directly wrapped script.');
  }
  const closingScriptAt = markedSource.indexOf('</script>');
  const suffix = markedSource.slice(closingScriptAt + '</script>'.length);
  if (!/^(?:\r\n|\n)$/.test(suffix)) {
    throw new Error('Audio vendor region has an invalid closing boundary.');
  }

  const contentStart = markedStart + prefix[0].length;
  const contentEnd = markedStart + closingScriptAt;
  const vendorSource = source.slice(contentStart, contentEnd);
  if (/<\/script/i.test(vendorSource)) {
    throw new Error('Audio vendor source contains an unsafe closing script sequence.');
  }
  return {
    markerStart: startAt,
    markerEnd: endAt + AUDIO_VENDOR_END_MARKER.length,
    source: vendorSource
  };
}

/**
 * 認証済み編集画面へ音声vendorバンドルを返す。
 *
 * @param {{ __editToken?: string }} payload
 * @returns {{ version: string, source: string }}
 */
function getAudioVendorBundle(payload) {
  assertEditToken_(payload);
  const appSource = HtmlService.createHtmlOutputFromFile('app').getContent();
  const region = locateAudioVendorRegion_(appSource);
  return { version: AUDIO_VENDOR_VERSION, source: region.source };
}

/**
 * HTML テンプレートで <?!= include('filename') ?> を使って
 * 別ファイルの内容を埋め込むためのヘルパー。
 *
 * @param {string} filename 拡張子なしのファイル名
 * @returns {string}
 */
function include(filename) {
  const source = HtmlService.createHtmlOutputFromFile(filename).getContent();
  if (filename !== 'app') return source;

  const region = locateAudioVendorRegion_(source);
  return source.slice(0, region.markerStart) + source.slice(region.markerEnd);
}


// ============================================================
//  内部: config シートから設定を読み込む
// ============================================================

/**
 * config シートの全設定項目をキーバリューのオブジェクトで返す。
 *
 * @returns {{ [key: string]: string }}
 */
function getAppConfig_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) return {};

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {};

  const data   = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const config = {};
  data.forEach(function(row) {
    const key   = String(row[0]).trim();
    const value = String(row[1]).trim();
    if (key && value) config[key] = value;
  });
  return config;
}


// ============================================================
//  クライアント向け API
// ============================================================

/**
 * 画像URLなどの設定情報をクライアントに返す。
 * IMAGE_DRIVE_URL がフォルダURLの場合は直下の画像一覧を images 配列で返す。
 * 単一ファイルURLの場合は imageUrl（後方互換）で返す。
 *
 * @param {string} [mode] 表示モード。画像配信方式はクライアント側の delivery で制御する。
 * @param {boolean} [forceRefresh] true の場合は結合済み一覧キャッシュを使わず同期する。
 * @returns {{ imageUrl?: string, fileId?: string, imageName?: string, images?: Array<{id:string,name:string}>, error?: string }}
 */
function getConfig(mode, forceRefresh) {
  const appConfig     = getAppConfig_();
  var execUrl = getConfiguredWebAppUrl_(appConfig);
  const imageDriveUrl = appConfig['IMAGE_DRIVE_URL'] || '';

  // URL未設定 → デモ画像
  if (!imageDriveUrl) {
    return { imageUrl: 'https://pannellum.org/images/alma.jpg', execUrl: execUrl };
  }

  const folderId = extractDriveFolderId_(imageDriveUrl);
  if (folderId) {
    const result = getConfigFromFolder_(folderId, {
      forceRefresh: !!forceRefresh,
      rootFolderId: folderId
    });
    result.execUrl = execUrl;
    result.rootFolderId = folderId;
    return result;
  }

  const fileId = extractDriveFileId_(imageDriveUrl);
  if (!fileId) return { imageUrl: 'https://pannellum.org/images/alma.jpg', execUrl: execUrl };

  try {
    const file = DriveApp.getFileById(fileId);
    return {
      imageUrl: 'https://lh3.googleusercontent.com/d/' + fileId + '=s0',
      fileId: fileId,
      imageName: file.getName(),
      execUrl: execUrl
    };
  } catch (e) {
    console.error('画像取得エラー:', e.message);
    return { error: '画像の取得に失敗しました。ファイルIDまたは権限を確認してください。', execUrl: execUrl };
  }
}

/**
 * フォルダID からフォルダ直下の画像ファイル一覧を取得して返す内部関数。
 *
 * @param {string} folderId
 * @param {{forceRefresh?:boolean,rootFolderId?:string,newSceneOverridesByFileId?:Object}|boolean=} options
 * @returns {{ images: Array<{id:string,name:string,imageUrl:string}>, error?: string }}
 */
function getConfigFromFolder_(folderId, options) {
  const opts = options === true ? { forceRefresh: true } : (options || {});
  let lock = null;
  try {
    if (!opts.forceRefresh && !opts.newSceneOverridesByFileId) {
      const cached = getCachedFolderList_(folderId);
      if (cached) return cached;
    }

    lock = opts.lockAlreadyHeld ? null : acquireLock_();
    if (!opts.forceRefresh && !opts.newSceneOverridesByFileId) {
      const cachedAfterLock = getCachedFolderList_(folderId);
      if (cachedAfterLock) return cachedAfterLock;
    }

    const syncOptions = Object.assign({}, opts, { lockAlreadyHeld: true });
    const result = syncDriveFolderToScenes_(folderId, syncOptions);
    // rename/delete/upload と同じロック内で公開し、無効化後の旧一覧再投入を防ぐ。
    setCachedFolderList_(folderId, result);
    return result;
  } catch (e) {
    const errorStage = e && e.sceneSyncStage ? e.sceneSyncStage : 'unknown';
    console.error(
      '[scene-sync] folderId=' + String(folderId || '') + ' stage=' + errorStage + ':',
      e && e.message ? e.message : e
    );
    return {
      error: 'フォルダまたはscenesの同期に失敗しました。フォルダID、権限、scenesシートを確認してください。',
      errorStage: errorStage
    };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * 対象フォルダから親方向だけをたどり、設定済みルート配下か確認する。
 * 全サブフォルダの下向き再帰走査は行わない。
 *
 * @param {string} folderId
 * @param {string} rootFolderId
 * @returns {boolean}
 */
function isDriveFolderWithinRoot_(folderId, rootFolderId) {
  const targetId = String(folderId || '').trim();
  const rootId = String(rootFolderId || '').trim();
  if (!targetId || !rootId) return false;
  if (targetId === rootId) return true;

  const pendingIds = [targetId];
  const visited = {};
  let inspected = 0;
  while (pendingIds.length > 0 && inspected < 100) {
    const currentId = pendingIds.shift();
    if (!currentId || visited[currentId]) continue;
    visited[currentId] = true;
    inspected += 1;

    const folder = DriveApp.getFolderById(currentId);
    const parents = folder.getParents();
    while (parents.hasNext()) {
      const parentId = String(parents.next().getId() || '').trim();
      if (parentId === rootId) return true;
      if (parentId && !visited[parentId]) pendingIds.push(parentId);
    }
  }
  return false;
}

/**
 * 指定フォルダの中身（サブフォルダ＋画像）をクライアントから取得するための公開ラッパー。
 * サイドバーでサブフォルダをクリックしたとき等に呼ばれる。
 *
 * @param {string} folderId Google Drive フォルダID
 * @param {boolean=} forceRefresh true の場合はキャッシュを使わず同期する。
 * @returns {{ images: Array, error?: string }}
 */
function navigateToFolder(folderId, forceRefresh) {
  if (!folderId) return { error: 'フォルダIDが指定されていません。' };
  let rootFolderId = '';
  try {
    rootFolderId = extractDriveFolderId_(getAppConfig_()[IMAGE_DRIVE_URL_CONFIG_KEY] || '') || '';
  } catch (e) {
    rootFolderId = '';
  }
  if (!rootFolderId) {
    return { error: '設定済みルートフォルダを確認できません。configを確認してください。' };
  }
  try {
    if (!isDriveFolderWithinRoot_(folderId, rootFolderId)) {
      console.warn(
        '[scene-sync] folderId=' + String(folderId || '') + ' stage=folder-scope: configured root subtree rejected'
      );
      return { error: '指定フォルダは設定済みルートフォルダの配下ではありません。' };
    }
  } catch (scopeError) {
    console.error(
      '[scene-sync] folderId=' + String(folderId || '') + ' stage=folder-scope:',
      scopeError && scopeError.message ? scopeError.message : scopeError
    );
    return {
      error: '指定フォルダの範囲確認に失敗しました。フォルダIDまたは権限を確認してください。',
      errorStage: 'drive-list'
    };
  }
  return getConfigFromFolder_(folderId, {
    forceRefresh: forceRefresh !== false,
    rootFolderId: rootFolderId
  });
}

/**
 * Drive ファイルを Base64 Data URI に変換する内部ユーティリティ。
 *
 * @param {GoogleAppsScript.Drive.File} file
 * @returns {string} Data URI
 */
function fileToDataUri_(file) {
  const blob   = file.getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());
  return 'data:' + blob.getContentType() + ';base64,' + base64;
}

/**
 * GoogleドライブのURLからファイルIDを抽出する内部ユーティリティ。
 *
 * @param {string} url
 * @returns {string|null}
 */
function extractDriveFileId_(url) {
  if (!url || url === 'YOUR_GOOGLE_DRIVE_IMAGE_URL_HERE') return null;
  if (/\/folders\//.test(url)) return null;
  const match = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{15,})/);
  return match ? match[1] : null;
}

/**
 * GoogleドライブのフォルダURLからフォルダIDを抽出する内部ユーティリティ。
 *
 * @param {string} url
 * @returns {string|null}
 */
function extractDriveFolderId_(url) {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
  return match ? match[1] : null;
}

/**
 * 公開画像配信の対象を設定済みIMAGE_DRIVE_URLの範囲へ限定する。
 * フォルダモードは編集対象と同じscene/実Drive検証、単一画像は設定IDとの完全一致を必須にする。
 *
 * @param {string} fileId
 * @returns {{fileId:string,file:Object,scene?:Object|null,rootFolderId:string}}
 */
function getReadableImageContext_(fileId) {
  const targetId = String(fileId || '').trim();
  if (!targetId) throw new Error('ファイルIDが指定されていません。');

  const config = getAppConfig_();
  const configuredUrl = config[IMAGE_DRIVE_URL_CONFIG_KEY] || '';
  const rootFolderId = extractDriveFolderId_(configuredUrl) || '';
  if (rootFolderId) return getEditableSceneContext_(targetId);

  const configuredFileId = extractDriveFileId_(configuredUrl) || '';
  if (!configuredFileId || configuredFileId !== targetId) {
    throw new Error('対象画像は設定済みIMAGE_DRIVE_URLの範囲外です。');
  }
  const file = DriveApp.getFileById(targetId);
  if (String(file.getId() || '').trim() !== targetId) {
    throw new Error('DriveファイルIDが設定内容と一致しません。');
  }
  if (IMAGE_MIME_TYPES.indexOf(String(file.getMimeType() || '')) === -1) {
    throw new Error('対象ファイルは対応画像形式ではありません。');
  }
  return { fileId: targetId, file: file, scene: null, rootFolderId: '' };
}

/**
 * 指定したファイルIDの画像URLを返す（遅延読み込み用）。
 * フォルダモードでシーン切替時にクライアントから呼ばれる。
 *
 * @param {string} fileId Google Drive ファイルID
 * @param {string} [mode] 'public' の場合は Base64 Data URI を返す。それ以外は lh3 直リンクを返す。
 * @returns {{ success: boolean, imageUrl?: string, error?: string }}
 */
function getImageDataUri(fileId, mode) {
  try {
    const context = getReadableImageContext_(fileId);
    const file = context.file;
    if (mode === 'public') {
      return { success: true, imageUrl: fileToDataUri_(file) };
    }
    return { success: true, imageUrl: 'https://lh3.googleusercontent.com/d/' + context.fileId + '=s0' };
  } catch (e) {
    console.error('getImageDataUri エラー:', e.message);
    return { success: false, error: '画像の取得に失敗しました。' };
  }
}

/**
 * ホットスポットに紐付けられた写真ファイルを Base64 Data URI として返す。
 *
 * @param {{fileId:string,hotspotId:string,photoId:string}} request info関連付けを特定する公開取得要求
 * @returns {{ success: boolean, dataUri?: string, error?: string }}
 */
function getHotspotPhotoDataUri(request) {
  try {
    const req = request && typeof request === 'object' ? request : {};
    const fileId = String(req.fileId || '').trim();
    const hotspotId = String(req.hotspotId || '').trim();
    const photoId = String(req.photoId || '').trim();
    if (!fileId || !hotspotId || !photoId) {
      return { success: false, error: '写真の関連付け情報が不足しています。' };
    }

    const hotspotContext = getHotspotStorageContext_(fileId);

    // 写真Driveへ触れる前に、scene・hotspot・photoの三値が現在のinfo行と一致することを確認する。
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INFO_SHEET_NAME);
    if (!sheet || sheet.getLastRow() <= 1 || !hasReadableInfoSheetSchema_(sheet)) {
      return { success: false, error: '写真は公開中のホットスポットに関連付けられていません。' };
    }
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, INFO_HEADERS.length).getValues();
    const allowedStorageIds = [String(hotspotContext.storageFileId || '')];
    if (!hotspotContext.rootFolderId && allowedStorageIds.indexOf('') === -1) {
      allowedStorageIds.push('');
    }
    const isAssociated = data.some(function(row) {
      return allowedStorageIds.indexOf(String(row[1] || '').trim()) !== -1 &&
        String(row[ID_COL_INDEX] || '').trim() === hotspotId &&
        String(row[10] || '').trim() === photoId;
    });
    if (!isAssociated) {
      return { success: false, error: '写真は公開中のホットスポットに関連付けられていません。' };
    }

    let photoFile = null;
    if (hotspotContext.rootFolderId) {
      try {
        const scenePhotoContext = getEditableSceneContext_(photoId);
        if (scenePhotoContext.rootFolderId === hotspotContext.rootFolderId) {
          photoFile = scenePhotoContext.file;
        }
      } catch (scenePhotoError) {
        // scenes未登録の写真は、次の正式添付フォルダ検証へ進める。
      }
    }
    if (!photoFile) {
      photoFile = getManagedHotspotPhotoFile_(photoId);
    }
    if (!photoFile) {
      return { success: false, error: '写真は公開可能な保存先にありません。' };
    }
    return { success: true, dataUri: fileToDataUri_(photoFile) };
  } catch (e) {
    console.error('getHotspotPhotoDataUri エラー:', e.message);
    return { success: false, error: '写真の取得に失敗しました。' };
  }
}

/**
 * Driveファイルの現在の親フォルダIDを取得する。
 *
 * @param {GoogleAppsScript.Drive.File} file
 * @returns {Array<string>}
 */
function getFileParentFolderIds_(file) {
  const parentIds = [];
  const parents = file.getParents();
  while (parents.hasNext()) {
    const parentId = String(parents.next().getId() || '');
    if (parentId && parentIds.indexOf(parentId) === -1) parentIds.push(parentId);
  }
  return parentIds;
}

/** アップロード画像の実バイトシグネチャからMIMEを判定する。 */
function detectHotspotPhotoMime_(bytes) {
  const data = bytes || [];
  const byteAt = function(index) { return Number(data[index]) & 0xff; };
  if (data.length >= 3 && byteAt(0) === 0xff && byteAt(1) === 0xd8 && byteAt(2) === 0xff) {
    return 'image/jpeg';
  }
  if (data.length >= 8 &&
      byteAt(0) === 0x89 && byteAt(1) === 0x50 && byteAt(2) === 0x4e && byteAt(3) === 0x47 &&
      byteAt(4) === 0x0d && byteAt(5) === 0x0a && byteAt(6) === 0x1a && byteAt(7) === 0x0a) {
    return 'image/png';
  }
  if (data.length >= 12 &&
      byteAt(0) === 0x52 && byteAt(1) === 0x49 && byteAt(2) === 0x46 && byteAt(3) === 0x46 &&
      byteAt(8) === 0x57 && byteAt(9) === 0x45 && byteAt(10) === 0x42 && byteAt(11) === 0x50) {
    return 'image/webp';
  }
  return '';
}

/** ホットスポット添付payloadを復号し、MIME・拡張子・サイズ・実バイトを一致検証する。 */
function normalizeHotspotPhotoUpload_(photoUpload) {
  if (!photoUpload || typeof photoUpload !== 'object') {
    throw new Error('写真アップロードデータが不正です。');
  }
  const mimeType = String(photoUpload.mimeType || '').trim().toLowerCase();
  const allowedExtensions = HOTSPOT_PHOTO_MIME_EXTENSIONS[mimeType];
  if (!allowedExtensions) {
    throw new Error('写真はJPEG、PNG、WebP形式だけアップロードできます。');
  }

  const originalFileName = String(photoUpload.fileName || '').trim();
  if (!originalFileName || /[\u0000-\u001f\u007f-\u009f]/.test(originalFileName)) {
    throw new Error('写真ファイル名が不正です。');
  }
  const extensionMatch = originalFileName.match(/\.([A-Za-z0-9]+)$/);
  const suppliedExtension = extensionMatch ? String(extensionMatch[1] || '').toLowerCase() : '';
  if (allowedExtensions.indexOf(suppliedExtension) === -1) {
    throw new Error('写真のMIMEと拡張子が一致しません。');
  }

  const originalSizeBytes = photoUpload.originalSizeBytes;
  const declaredSizeBytes = photoUpload.sizeBytes;
  if (typeof originalSizeBytes !== 'number' || !isFinite(originalSizeBytes) ||
      originalSizeBytes <= 0 || Math.floor(originalSizeBytes) !== originalSizeBytes) {
    throw new Error('元写真のサイズが不正です。');
  }
  if (originalSizeBytes > HOTSPOT_PHOTO_ORIGINAL_MAX_BYTES) {
    throw new Error('元写真は20MB以下を選択してください。');
  }
  if (typeof declaredSizeBytes !== 'number' || !isFinite(declaredSizeBytes) ||
      declaredSizeBytes <= 0 || Math.floor(declaredSizeBytes) !== declaredSizeBytes) {
    throw new Error('処理後写真のサイズが不正です。');
  }
  if (declaredSizeBytes > HOTSPOT_PHOTO_FINAL_MAX_BYTES) {
    throw new Error('処理後写真は6MB以下にしてください。');
  }

  const base64 = String(photoUpload.base64 || '');
  const maximumBase64Length = Math.ceil(HOTSPOT_PHOTO_FINAL_MAX_BYTES / 3) * 4 + 4;
  if (!base64 || base64.length > maximumBase64Length || base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || /=/.test(base64.slice(0, -2))) {
    throw new Error('写真のBase64データが不正です。');
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (decodeError) {
    throw new Error('写真のBase64データを復号できません。');
  }
  if (!bytes || bytes.length === 0 || bytes.length !== declaredSizeBytes) {
    throw new Error('写真の申告サイズと実データのサイズが一致しません。');
  }
  if (bytes.length > HOTSPOT_PHOTO_FINAL_MAX_BYTES) {
    throw new Error('処理後写真は6MB以下にしてください。');
  }
  const detectedMimeType = detectHotspotPhotoMime_(bytes);
  if (!detectedMimeType || detectedMimeType !== mimeType) {
    throw new Error('写真のMIME、拡張子、実データの形式が一致しません。');
  }

  return {
    bytes: bytes,
    mimeType: mimeType,
    extension: mimeType === 'image/jpeg' ? 'jpg' : allowedExtensions[0],
    originalFileName: originalFileName,
    originalSizeBytes: originalSizeBytes,
    sizeBytes: bytes.length
  };
}

function getFolderParentObjects_(folder) {
  const result = [];
  const parents = folder.getParents();
  while (parents.hasNext()) result.push(parents.next());
  return result;
}

function getHotspotFolderContainerContext_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet || !spreadsheet.getId()) {
    throw new Error('本体スプレッドシートを特定できません。');
  }
  const spreadsheetFile = DriveApp.getFileById(spreadsheet.getId());
  const spreadsheetParents = getFolderParentObjects_(spreadsheetFile);
  const spreadsheetParentIds = spreadsheetParents.map(function(folder) {
    return String(folder.getId() || '').trim();
  }).filter(Boolean);
  if (spreadsheetParentIds.length === 0) {
    throw new Error('本体スプレッドシートの親フォルダを特定できません。');
  }
  const configuredImageRootId = extractDriveFolderId_(
    getAppConfig_()[IMAGE_DRIVE_URL_CONFIG_KEY] || ''
  ) || '';
  const eligibleParents = spreadsheetParents.filter(function(folder) {
    const folderId = String(folder.getId() || '').trim();
    return !configuredImageRootId || !isDriveFolderWithinRoot_(folderId, configuredImageRootId);
  });
  if (eligibleParents.length === 0) {
    throw new Error('HotspotフォルダはIMAGE_DRIVE_URL配下には作成・移行できません。');
  }
  return {
    spreadsheetParentIds: spreadsheetParentIds,
    parentFolder: eligibleParents[0],
    configuredImageRootId: configuredImageRootId
  };
}

function getOfficialDriveFolder_(folderId, propertyKey) {
  if (!folderId) return null;
  let folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (error) {
    throw new Error('ScriptProperties の ' + propertyKey + ' が壊れています。');
  }
  if (String(folder.getId() || '').trim() !== folderId) {
    throw new Error('ScriptProperties の ' + propertyKey + ' とDriveフォルダIDが一致しません。');
  }
  return folder;
}

function findDirectChildFoldersByName_(parentFolder, name, ignoredFolderId) {
  const matches = [];
  const ignoredId = String(ignoredFolderId || '').trim();
  const folders = parentFolder.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    const folderId = String(folder.getId() || '').trim();
    if (folderId === ignoredId) continue;
    if (String(folder.getName() || '') === name) matches.push(folder);
  }
  return matches;
}

function findDirectChildFolderByName_(parentFolder, name, ignoredFolderId) {
  const matches = findDirectChildFoldersByName_(parentFolder, name, ignoredFolderId);
  return matches.length > 0 ? matches[0] : null;
}

function assertNoUntrackedHotspotFolderName_(parentFolder, name, officialId) {
  if (findDirectChildFoldersByName_(parentFolder, name, officialId).length > 0) {
    throw new Error('正式IDに紐付かない同名の「' + name + '」フォルダがあるため自動採用・重複作成を停止しました。');
  }
}

function createHotspotFolderMigrationError_(message, unsafe) {
  const error = new Error(message);
  error.hotspotFolderMigrationUnsafe = !!unsafe;
  return error;
}

function getHotspotFolderPropertyIds_(properties) {
  return {
    rootId: String(properties.getProperty(HOTSPOT_FOLDER_ID_KEY) || '').trim(),
    photoId: String(properties.getProperty(HOTSPOT_PHOTO_FOLDER_ID_KEY) || '').trim(),
    audioId: String(properties.getProperty(HOTSPOT_AUDIO_FOLDER_ID_KEY) || '').trim()
  };
}

function getHotspotFolderConfigKeys_() {
  return [
    HOTSPOT_FOLDER_URL_CONFIG_KEY,
    HOTSPOT_PHOTO_FOLDER_URL_CONFIG_KEY,
    HOTSPOT_AUDIO_FOLDER_URL_CONFIG_KEY
  ];
}

function captureHotspotFolderConfigState_(sheet) {
  const keys = getHotspotFolderConfigKeys_();
  const rows = [];
  readConfigRows_(sheet).forEach(function(row, index) {
    if (keys.indexOf(row.key) === -1) return;
    rows.push({
      index: index,
      cells: row.cells.slice(0, CONFIG_HEADERS.length)
    });
  });
  return { rows: rows };
}

function restoreHotspotFolderConfigState_(sheet, savedState) {
  const keys = getHotspotFolderConfigKeys_();
  const keepRows = readConfigRows_(sheet).filter(function(row) {
    return keys.indexOf(row.key) === -1;
  }).map(function(row) {
    return row.cells.slice(0, CONFIG_HEADERS.length);
  });
  const savedRows = savedState && Array.isArray(savedState.rows)
    ? savedState.rows.slice().sort(function(a, b) { return Number(a.index) - Number(b.index); })
    : [];
  savedRows.forEach(function(entry) {
    const index = Math.max(0, Math.min(keepRows.length, Number(entry.index) || 0));
    keepRows.splice(index, 0, entry.cells.slice(0, CONFIG_HEADERS.length));
  });
  writeConfigRows_(sheet, keepRows);
}

function hotspotFolderConfigStateMatches_(sheet, savedState) {
  return JSON.stringify(captureHotspotFolderConfigState_(sheet)) ===
    JSON.stringify(savedState || { rows: [] });
}

function buildHotspotFolderPendingName_(baseName, transactionId) {
  return baseName + HOTSPOT_FOLDER_PENDING_SEPARATOR + transactionId;
}

function validateHotspotFolderMigrationState_(state) {
  if (!state || typeof state !== 'object' || state.version !== HOTSPOT_FOLDER_MIGRATION_VERSION) {
    throw createHotspotFolderMigrationError_('Hotspotフォルダ移行ジャーナルの形式が不正です。', true);
  }
  const transactionId = String(state.transactionId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(transactionId)) {
    throw createHotspotFolderMigrationError_('Hotspotフォルダ移行ジャーナルの識別子が不正です。', true);
  }
  if (!state.oldProperties || !state.root || !state.photo || !state.audio ||
      !state.oldConfig || !Array.isArray(state.oldConfig.rows)) {
    throw createHotspotFolderMigrationError_('Hotspotフォルダ移行ジャーナルに復旧情報が不足しています。', true);
  }
  if (state.mode !== 'forward' && state.mode !== 'rollback') {
    throw createHotspotFolderMigrationError_('Hotspotフォルダ移行ジャーナルの実行モードが不正です。', true);
  }
  if (typeof state.phase !== 'string' || !state.phase.trim()) {
    throw createHotspotFolderMigrationError_('Hotspotフォルダ移行ジャーナルのphaseが不正です。', true);
  }
  const expectedNames = {
    root: buildHotspotFolderPendingName_(HOTSPOT_FOLDER_NAME, transactionId),
    photo: buildHotspotFolderPendingName_(HOTSPOT_PHOTO_FOLDER_NAME, transactionId),
    audio: buildHotspotFolderPendingName_(HOTSPOT_AUDIO_FOLDER_NAME, transactionId)
  };
  ['root', 'photo', 'audio'].forEach(function(key) {
    if (String(state[key].temporaryName || '') !== expectedNames[key]) {
      throw createHotspotFolderMigrationError_('Hotspotフォルダ移行ジャーナルの一時名が一致しません。', true);
    }
    if (typeof state[key].created !== 'boolean' || typeof state[key].renamed !== 'boolean' ||
        (key !== 'root' && typeof state[key].moved !== 'boolean')) {
      throw createHotspotFolderMigrationError_('Hotspotフォルダ移行ジャーナルの変更状態が不正です。', true);
    }
    state[key].id = String(state[key].id || '').trim();
  });
  state.oldConfig.rows.forEach(function(entry) {
    if (!entry || typeof entry.index !== 'number' || !isFinite(entry.index) ||
        Math.floor(entry.index) !== entry.index || entry.index < 0 || !Array.isArray(entry.cells)) {
      throw createHotspotFolderMigrationError_('Hotspotフォルダ移行ジャーナルのconfig復元情報が不正です。', true);
    }
  });
  state.oldProperties.rootId = String(state.oldProperties.rootId || '').trim();
  state.oldProperties.photoId = String(state.oldProperties.photoId || '').trim();
  state.oldProperties.audioId = String(state.oldProperties.audioId || '').trim();
  state.phase = state.phase.trim();
  state.configWarnings = Array.isArray(state.configWarnings) ? state.configWarnings.map(String) : [];
  state.configSynced = !!state.configSynced || state.phase === 'config_synced';
  return state;
}

function readHotspotFolderMigrationState_(properties) {
  const raw = String(properties.getProperty(HOTSPOT_FOLDER_MIGRATION_STATE_KEY) || '').trim();
  if (!raw) return null;
  let state;
  try {
    state = JSON.parse(raw);
  } catch (error) {
    throw createHotspotFolderMigrationError_('Hotspotフォルダ移行ジャーナルを解析できません。', true);
  }
  return validateHotspotFolderMigrationState_(state);
}

function writeHotspotFolderMigrationState_(properties, state, phase) {
  if (phase) state.phase = phase;
  validateHotspotFolderMigrationState_(state);
  properties.setProperty(HOTSPOT_FOLDER_MIGRATION_STATE_KEY, JSON.stringify(state));
}

function getMigrationFolderById_(folderId, label) {
  if (!folderId) return null;
  let folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (error) {
    throw createHotspotFolderMigrationError_('移行ジャーナルの' + label + 'フォルダをDrive上で確認できません。', true);
  }
  if (String(folder.getId() || '').trim() !== folderId) {
    throw createHotspotFolderMigrationError_('移行ジャーナルの' + label + 'フォルダIDがDriveと一致しません。', true);
  }
  return folder;
}

function validateMigrationRootFolder_(folder, containerContext, allowedNames) {
  const folderId = String(folder.getId() || '').trim();
  const parentIds = getFileParentFolderIds_(folder);
  if (parentIds.length !== 1 || containerContext.spreadsheetParentIds.indexOf(parentIds[0]) === -1) {
    throw createHotspotFolderMigrationError_('移行中のHotspotルートの親フォルダが一致しません。', true);
  }
  if (allowedNames.indexOf(String(folder.getName() || '')) === -1) {
    throw createHotspotFolderMigrationError_('移行中のHotspotルート名がジャーナルと一致しません。', true);
  }
  if (containerContext.configuredImageRootId &&
      isDriveFolderWithinRoot_(folderId, containerContext.configuredImageRootId)) {
    throw createHotspotFolderMigrationError_('移行中のHotspotルートはIMAGE_DRIVE_URL配下に配置できません。', true);
  }
}

function validateRecoverableHotspotChildContents_(folder, kind, containerContext) {
  const folderId = String(folder.getId() || '').trim();
  if (containerContext.configuredImageRootId &&
      isDriveFolderWithinRoot_(folderId, containerContext.configuredImageRootId)) {
    throw createHotspotFolderMigrationError_('未追跡の添付候補はIMAGE_DRIVE_URL配下にあるため採用できません。', true);
  }
  const childFolders = folder.getFolders();
  if (childFolders.hasNext()) {
    throw createHotspotFolderMigrationError_('未追跡の添付候補にサブフォルダがあるため自動採用できません。', true);
  }
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const scenesSheet = spreadsheet ? spreadsheet.getSheetByName(SCENES_SHEET_NAME) : null;
  const registeredScenes = scenesSheet ? readSceneRows_(scenesSheet).byFileId : {};
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const fileId = String(file.getId() || '').trim();
    const mimeType = String(file.getMimeType() || '').trim().toLowerCase();
    const mimeMatches = kind === 'photo'
      ? !!HOTSPOT_PHOTO_MIME_EXTENSIONS[mimeType]
      : mimeType === HOTSPOT_AUDIO_MIME_TYPE;
    if (!mimeMatches || registeredScenes[fileId]) {
      throw createHotspotFolderMigrationError_('未追跡の添付候補の内容が対象種別と一致しません。', true);
    }
  }
}

function recoverHotspotRootFromOfficialChildren_(photoFolder, audioFolder, containerContext) {
  const candidates = [];
  [photoFolder, audioFolder].forEach(function(childFolder) {
    if (!childFolder) return;
    const parents = getFolderParentObjects_(childFolder);
    if (parents.length !== 1) {
      throw createHotspotFolderMigrationError_('正式な添付子フォルダに複数または不明な親があります。', true);
    }
    const parent = parents[0];
    const parentId = String(parent.getId() || '').trim();
    if (containerContext.spreadsheetParentIds.indexOf(parentId) !== -1) return;
    if (String(parent.getName() || '') !== HOTSPOT_FOLDER_NAME) {
      throw createHotspotFolderMigrationError_('正式な添付子フォルダの親をHotspotルートとして確認できません。', true);
    }
    validateMigrationRootFolder_(parent, containerContext, [HOTSPOT_FOLDER_NAME]);
    candidates.push(parent);
  });
  if (candidates.length === 0) return null;
  const rootId = String(candidates[0].getId() || '').trim();
  if (candidates.some(function(folder) { return String(folder.getId() || '').trim() !== rootId; })) {
    throw createHotspotFolderMigrationError_('正式な写真・音声フォルダが異なるHotspotルートを指しています。', true);
  }
  const childIds = [photoFolder, audioFolder].filter(Boolean).map(function(folder) {
    return String(folder.getId() || '').trim();
  });
  if (!rootId || childIds.indexOf(rootId) !== -1) {
    throw createHotspotFolderMigrationError_('Hotspotルートと添付子フォルダのIDが衝突しています。', true);
  }
  return candidates[0];
}

function recoverUntrackedHotspotChild_(rootFolder, targetName, kind, otherOfficialId, containerContext) {
  const candidates = findDirectChildFoldersByName_(rootFolder, targetName, '');
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) {
    throw createHotspotFolderMigrationError_('正式IDのない「' + targetName + '」候補が複数あるため自動採用できません。', true);
  }
  const candidate = candidates[0];
  const candidateId = String(candidate.getId() || '').trim();
  if (!candidateId || candidateId === String(rootFolder.getId() || '').trim() ||
      candidateId === String(otherOfficialId || '').trim()) {
    throw createHotspotFolderMigrationError_('未追跡の添付候補IDが既存の正式フォルダと衝突しています。', true);
  }
  validateRecoverableHotspotChildContents_(candidate, kind, containerContext);
  return candidate;
}

function inspectHotspotFolderStructure_(propertyIds, containerContext, allowInterruptedRecovery) {
  const distinctIds = [propertyIds.rootId, propertyIds.photoId, propertyIds.audioId].filter(Boolean);
  if (new Set(distinctIds).size !== distinctIds.length) {
    throw new Error('Hotspotルート、photos、audioにはすべて異なる正式IDが必要です。');
  }
  let rootFolder = getOfficialDriveFolder_(propertyIds.rootId, HOTSPOT_FOLDER_ID_KEY);
  let photoFolder = getOfficialDriveFolder_(propertyIds.photoId, HOTSPOT_PHOTO_FOLDER_ID_KEY);
  let audioFolder = getOfficialDriveFolder_(propertyIds.audioId, HOTSPOT_AUDIO_FOLDER_ID_KEY);
  if (!rootFolder && allowInterruptedRecovery && (photoFolder || audioFolder)) {
    rootFolder = recoverHotspotRootFromOfficialChildren_(photoFolder, audioFolder, containerContext);
  }
  if (rootFolder) validateMigrationRootFolder_(rootFolder, containerContext, [HOTSPOT_FOLDER_NAME]);
  photoFolder = validateHotspotChildForRead_(photoFolder, rootFolder, containerContext, 'photos');
  audioFolder = validateHotspotChildForRead_(audioFolder, rootFolder, containerContext, 'audio');
  if (allowInterruptedRecovery && rootFolder) {
    if (!photoFolder && !propertyIds.photoId) {
      photoFolder = recoverUntrackedHotspotChild_(
        rootFolder,
        HOTSPOT_PHOTO_FOLDER_NAME,
        'photo',
        propertyIds.audioId,
        containerContext
      );
    }
    if (!audioFolder && !propertyIds.audioId) {
      audioFolder = recoverUntrackedHotspotChild_(
        rootFolder,
        HOTSPOT_AUDIO_FOLDER_NAME,
        'audio',
        photoFolder ? photoFolder.getId() : propertyIds.photoId,
        containerContext
      );
    }
  }
  return { rootFolder: rootFolder, photoFolder: photoFolder, audioFolder: audioFolder };
}

function isCompleteHotspotFolderStructure_(propertyIds, inspected) {
  if (!propertyIds.rootId || !propertyIds.photoId || !propertyIds.audioId ||
      !inspected.rootFolder || !inspected.photoFolder || !inspected.audioFolder) return false;
  const rootId = String(inspected.rootFolder.getId() || '').trim();
  return rootId === propertyIds.rootId &&
    String(inspected.rootFolder.getName() || '') === HOTSPOT_FOLDER_NAME &&
    String(inspected.photoFolder.getId() || '').trim() === propertyIds.photoId &&
    String(inspected.photoFolder.getName() || '') === HOTSPOT_PHOTO_FOLDER_NAME &&
    getFileParentFolderIds_(inspected.photoFolder).join(',') === rootId &&
    String(inspected.audioFolder.getId() || '').trim() === propertyIds.audioId &&
    String(inspected.audioFolder.getName() || '') === HOTSPOT_AUDIO_FOLDER_NAME &&
    getFileParentFolderIds_(inspected.audioFolder).join(',') === rootId;
}

function createHotspotFolderMigrationState_(properties, configSheet, containerContext) {
  const oldProperties = getHotspotFolderPropertyIds_(properties);
  const inspected = inspectHotspotFolderStructure_(oldProperties, containerContext, true);
  if (!inspected.rootFolder &&
      findDirectChildFoldersByName_(containerContext.parentFolder, HOTSPOT_FOLDER_NAME, '').length > 0) {
    throw new Error('正式な子フォルダIDから確認できない同名の「' + HOTSPOT_FOLDER_NAME + '」があるため自動採用を停止しました。');
  }
  const transactionId = String(Utilities.getUuid() || '').replace(/[^A-Za-z0-9_-]/g, '') ||
    String(new Date().getTime());
  function childState(folder, oldId, targetName) {
    const parents = folder ? getFolderParentObjects_(folder) : [];
    if (folder && parents.length !== 1) {
      throw createHotspotFolderMigrationError_('正式な添付子フォルダの親を一意に記録できません。', true);
    }
    return {
      id: folder ? String(folder.getId() || '').trim() : '',
      oldName: folder ? String(folder.getName() || '') : '',
      oldParentId: folder ? String(parents[0].getId() || '').trim() : '',
      created: !folder,
      moved: false,
      renamed: false,
      temporaryName: buildHotspotFolderPendingName_(targetName, transactionId)
    };
  }
  const state = {
    version: HOTSPOT_FOLDER_MIGRATION_VERSION,
    transactionId: transactionId,
    mode: 'forward',
    phase: 'started',
    oldProperties: oldProperties,
    oldConfig: captureHotspotFolderConfigState_(configSheet),
    root: {
      id: inspected.rootFolder ? String(inspected.rootFolder.getId() || '').trim() : '',
      temporaryName: buildHotspotFolderPendingName_(HOTSPOT_FOLDER_NAME, transactionId),
      created: !inspected.rootFolder,
      renamed: false
    },
    photo: childState(inspected.photoFolder, oldProperties.photoId, HOTSPOT_PHOTO_FOLDER_NAME),
    audio: childState(inspected.audioFolder, oldProperties.audioId, HOTSPOT_AUDIO_FOLDER_NAME),
    configWarnings: [],
    configSynced: false
  };
  writeHotspotFolderMigrationState_(properties, state, 'started');
  return state;
}

function restoreHotspotFolderProperty_(properties, key, value) {
  if (value) properties.setProperty(key, value);
  else properties.deleteProperty(key);
}

function isHotspotFolderEmpty_(folder) {
  return !folder.getFiles().hasNext() && !folder.getFolders().hasNext();
}

function hasDirectChildFolderId_(parentFolder, folderId) {
  if (!parentFolder || !folderId) return false;
  const folders = parentFolder.getFolders();
  while (folders.hasNext()) {
    if (String(folders.next().getId() || '').trim() === String(folderId || '').trim()) return true;
  }
  return false;
}

function findMigrationFolderForRollback_(component, parentFolder, failures, label) {
  if (component.id) {
    try { return DriveApp.getFolderById(component.id); } catch (error) {
      failures.push(label + 'フォルダの再取得');
      return null;
    }
  }
  if (!parentFolder || !component.temporaryName) return null;
  const matches = findDirectChildFoldersByName_(parentFolder, component.temporaryName, '');
  if (matches.length > 1) {
    failures.push(label + '一時フォルダ候補の重複');
    return null;
  }
  return matches.length === 1 ? matches[0] : null;
}

function rollbackHotspotFolderTransaction_(transaction) {
  const failures = [];
  const state = transaction.state;
  const properties = transaction.properties;
  const previousMode = state.mode;
  const previousPhase = state.phase;
  try {
    state.mode = 'rollback';
    writeHotspotFolderMigrationState_(properties, state, 'rollback_started');
  } catch (error) {
    state.mode = previousMode;
    state.phase = previousPhase;
    failures.push('移行ジャーナルのrollback状態保存');
    console.error('Hotspotフォルダjournal rollback開始エラー:', error && error.message ? error.message : error);
    return failures;
  }

  ['audio', 'photo'].forEach(function(key) {
    const component = state[key];
    if (component.created || !component.id) return;
    let folder;
    try { folder = DriveApp.getFolderById(component.id); } catch (error) {
      failures.push(key + 'フォルダの再取得');
      return;
    }
    if (component.oldName && String(folder.getName() || '') !== component.oldName) {
      try { folder.setName(component.oldName); } catch (error) {
        failures.push(key + 'フォルダ名の復元');
        console.error('Hotspotフォルダ名rollbackエラー:', error && error.message ? error.message : error);
      }
    }
    const parentIds = getFileParentFolderIds_(folder);
    if (component.oldParentId && (parentIds.length !== 1 || parentIds[0] !== component.oldParentId)) {
      try { folder.moveTo(DriveApp.getFolderById(component.oldParentId)); } catch (error) {
        failures.push(key + '親フォルダの復元');
        console.error('Hotspotフォルダ親rollbackエラー:', error && error.message ? error.message : error);
      }
    }
  });

  const rootFolder = findMigrationFolderForRollback_(
    state.root,
    transaction.containerContext.parentFolder,
    failures,
    'ルート'
  );
  ['audio', 'photo'].forEach(function(key) {
    const component = state[key];
    if (!component.created) return;
    const folder = findMigrationFolderForRollback_(component, rootFolder, failures, key);
    if (!folder) return;
    try {
      if (!isHotspotFolderEmpty_(folder)) throw new Error('作成した子フォルダが空ではありません。');
      folder.setTrashed(true);
    } catch (error) {
      failures.push('作成した' + key + 'フォルダの破棄');
      console.error('Hotspot子フォルダrollbackエラー:', error && error.message ? error.message : error);
    }
  });

  const oldValueByKey = {};
  oldValueByKey[HOTSPOT_FOLDER_ID_KEY] = state.oldProperties.rootId;
  oldValueByKey[HOTSPOT_PHOTO_FOLDER_ID_KEY] = state.oldProperties.photoId;
  oldValueByKey[HOTSPOT_AUDIO_FOLDER_ID_KEY] = state.oldProperties.audioId;
  Object.keys(oldValueByKey).forEach(function(key) {
    try { restoreHotspotFolderProperty_(properties, key, oldValueByKey[key]); } catch (error) {
      failures.push('ScriptPropertiesの復元');
      console.error('HotspotフォルダScriptProperties rollbackエラー:', error && error.message ? error.message : error);
    }
  });
  try { restoreHotspotFolderConfigState_(transaction.configSheet, state.oldConfig); } catch (error) {
    failures.push('configの復元');
    console.error('Hotspotフォルダconfig rollbackエラー:', error && error.message ? error.message : error);
  }

  if (state.root.created && rootFolder) {
    try {
      if (!isHotspotFolderEmpty_(rootFolder)) throw new Error('作成したルートフォルダが空ではありません。');
      rootFolder.setTrashed(true);
    } catch (error) {
      failures.push('作成したルートフォルダの破棄');
      console.error('Hotspotルートフォルダrollbackエラー:', error && error.message ? error.message : error);
    }
  }

  try {
    const restored = getHotspotFolderPropertyIds_(properties);
    if (JSON.stringify(restored) !== JSON.stringify(state.oldProperties)) {
      throw new Error('ScriptPropertiesが旧状態と一致しません。');
    }
    if (!hotspotFolderConfigStateMatches_(transaction.configSheet, state.oldConfig)) {
      throw new Error('configが旧状態と一致しません。');
    }
    ['photo', 'audio'].forEach(function(key) {
      const component = state[key];
      if (component.created || !component.id) return;
      const folder = DriveApp.getFolderById(component.id);
      if (component.oldName && String(folder.getName() || '') !== component.oldName) {
        throw new Error(key + 'フォルダ名が旧状態と一致しません。');
      }
      const parentIds = getFileParentFolderIds_(folder);
      if (component.oldParentId &&
          (parentIds.length !== 1 || parentIds[0] !== component.oldParentId)) {
        throw new Error(key + 'フォルダの親が旧状態と一致しません。');
      }
    });
    ['photo', 'audio'].forEach(function(key) {
      const component = state[key];
      if (!component.created || !component.id || !rootFolder) return;
      if (hasDirectChildFolderId_(rootFolder, component.id)) {
        throw new Error('作成した' + key + 'フォルダが移行ルート直下に残っています。');
      }
    });
    if (state.root.created && state.root.id &&
        hasDirectChildFolderId_(transaction.containerContext.parentFolder, state.root.id)) {
      throw new Error('作成したHotspotルートが元の親直下に残っています。');
    }
  } catch (error) {
    failures.push('rollback結果の再検証');
    console.error('Hotspotフォルダrollback再検証エラー:', error && error.message ? error.message : error);
  }

  if (failures.length === 0) {
    try { properties.deleteProperty(HOTSPOT_FOLDER_MIGRATION_STATE_KEY); } catch (error) {
      failures.push('移行ジャーナルの削除');
      console.error('Hotspotフォルダjournal削除エラー:', error && error.message ? error.message : error);
    }
  }
  return failures;
}

function validateHotspotChildForRead_(folder, rootFolder, containerContext, label) {
  if (!folder) return null;
  const folderId = String(folder.getId() || '').trim();
  const parentIds = getFileParentFolderIds_(folder);
  const rootId = rootFolder ? String(rootFolder.getId() || '').trim() : '';
  const isRootChild = !!rootId && parentIds.length === 1 && parentIds[0] === rootId;
  const isLegacySibling = parentIds.length === 1 &&
    containerContext.spreadsheetParentIds.indexOf(parentIds[0]) !== -1;
  if (!isRootChild && !isLegacySibling) {
    throw new Error('正式な' + label + 'フォルダの親フォルダが不正です。');
  }
  if (containerContext.configuredImageRootId &&
      isDriveFolderWithinRoot_(folderId, containerContext.configuredImageRootId)) {
    throw new Error('正式な' + label + 'フォルダはIMAGE_DRIVE_URL配下に配置できません。');
  }
  return folder;
}

function migrateOrCreateHotspotChild_(options) {
  const state = options.state;
  const properties = options.properties;
  const rootFolder = options.rootFolder;
  const rootId = String(rootFolder.getId() || '').trim();
  let folder = state.id ? getMigrationFolderById_(state.id, options.label) : null;
  if (!folder) {
    if (!state.created) {
      throw createHotspotFolderMigrationError_('移行ジャーナルの' + options.label + 'フォルダIDがありません。', true);
    }
    const pendingMatches = findDirectChildFoldersByName_(rootFolder, state.temporaryName, '');
    if (pendingMatches.length > 1) {
      throw createHotspotFolderMigrationError_('同じ移行識別子の' + options.label + '一時フォルダが複数あります。', true);
    }
    if (pendingMatches.length === 1) {
      folder = pendingMatches[0];
    } else {
      if (findDirectChildFoldersByName_(rootFolder, options.targetName, '').length > 0) {
        throw createHotspotFolderMigrationError_('正式IDに紐付かない同名の' + options.label + 'フォルダがあります。', true);
      }
      writeHotspotFolderMigrationState_(properties, options.migrationState, options.phasePrefix + '_create_pending');
      folder = rootFolder.createFolder(state.temporaryName);
    }
    state.id = String(folder.getId() || '').trim();
    writeHotspotFolderMigrationState_(properties, options.migrationState, options.phasePrefix + '_created');
  }
  const folderId = String(folder.getId() || '').trim();
  if (findDirectChildFoldersByName_(rootFolder, state.temporaryName, folderId).length > 0) {
    throw createHotspotFolderMigrationError_('同じ移行識別子の' + options.label + '一時フォルダが複数あります。', true);
  }
  if (!folderId || folderId === rootId || folderId === String(options.otherFolderId || '').trim()) {
    throw createHotspotFolderMigrationError_('Hotspotルートと添付子フォルダのIDが衝突しています。', true);
  }
  const parents = getFolderParentObjects_(folder);
  const parentIds = parents.map(function(parent) { return String(parent.getId() || '').trim(); });
  const isDirectChild = parentIds.length === 1 && parentIds[0] === rootId;
  const isRecordedOldParent = parentIds.length === 1 && !!state.oldParentId && parentIds[0] === state.oldParentId;
  if (!isDirectChild && !isRecordedOldParent) {
    throw createHotspotFolderMigrationError_('移行中の' + options.label + 'フォルダの親がジャーナルと一致しません。', true);
  }
  if (options.containerContext.configuredImageRootId &&
      isDriveFolderWithinRoot_(folderId, options.containerContext.configuredImageRootId)) {
    throw createHotspotFolderMigrationError_('正式な' + options.label + 'フォルダはIMAGE_DRIVE_URL配下から移行できません。', true);
  }
  if (!isDirectChild) {
    writeHotspotFolderMigrationState_(properties, options.migrationState, options.phasePrefix + '_move_pending');
    folder.moveTo(rootFolder);
    state.moved = true;
    writeHotspotFolderMigrationState_(properties, options.migrationState, options.phasePrefix + '_moved');
  } else if (state.oldParentId && state.oldParentId !== rootId) {
    state.moved = true;
  }

  const currentPropertyId = String(properties.getProperty(options.propertyKey) || '').trim();
  if (currentPropertyId && currentPropertyId !== folderId) {
    throw createHotspotFolderMigrationError_('移行中の' + options.label + '正式IDがジャーナルと一致しません。', true);
  }
  if (!currentPropertyId) {
    writeHotspotFolderMigrationState_(properties, options.migrationState, options.phasePrefix + '_property_pending');
    properties.setProperty(options.propertyKey, folderId);
    writeHotspotFolderMigrationState_(properties, options.migrationState, options.phasePrefix + '_property_saved');
  }

  const currentName = String(folder.getName() || '');
  const allowedCurrentNames = [options.targetName, state.temporaryName];
  if (!state.created && state.oldName) allowedCurrentNames.push(state.oldName);
  if (allowedCurrentNames.indexOf(currentName) === -1) {
    throw createHotspotFolderMigrationError_('移行中の' + options.label + 'フォルダ名がジャーナルと一致しません。', true);
  }
  if (currentName !== options.targetName) {
    if (findDirectChildFoldersByName_(rootFolder, options.targetName, folderId).length > 0) {
      throw createHotspotFolderMigrationError_('移行先に別IDの同名' + options.label + 'フォルダがあります。', true);
    }
    writeHotspotFolderMigrationState_(properties, options.migrationState, options.phasePrefix + '_rename_pending');
    folder.setName(options.targetName);
    state.renamed = true;
    writeHotspotFolderMigrationState_(properties, options.migrationState, options.phasePrefix + '_ready');
  } else {
    if (state.oldName && state.oldName !== options.targetName) state.renamed = true;
    writeHotspotFolderMigrationState_(properties, options.migrationState, options.phasePrefix + '_ready');
  }
  return folder;
}

function resumeHotspotFolderMigration_(transaction) {
  const state = transaction.state;
  const properties = transaction.properties;
  const containerContext = transaction.containerContext;
  let rootFolder = state.root.id ? getMigrationFolderById_(state.root.id, 'ルート') : null;
  if (!rootFolder) {
    if (!state.root.created) {
      throw createHotspotFolderMigrationError_('移行ジャーナルのHotspotルートIDがありません。', true);
    }
    const pendingMatches = findDirectChildFoldersByName_(
      containerContext.parentFolder,
      state.root.temporaryName,
      ''
    );
    if (pendingMatches.length > 1) {
      throw createHotspotFolderMigrationError_('同じ移行識別子のHotspot一時ルートが複数あります。', true);
    }
    if (pendingMatches.length === 1) {
      rootFolder = pendingMatches[0];
    } else {
      if (findDirectChildFoldersByName_(containerContext.parentFolder, HOTSPOT_FOLDER_NAME, '').length > 0) {
        throw createHotspotFolderMigrationError_('正式な子IDで確認できない同名Hotspotルートがあります。', true);
      }
      writeHotspotFolderMigrationState_(properties, state, 'root_create_pending');
      rootFolder = containerContext.parentFolder.createFolder(state.root.temporaryName);
    }
    state.root.id = String(rootFolder.getId() || '').trim();
    writeHotspotFolderMigrationState_(properties, state, 'root_created');
  }
  if (findDirectChildFoldersByName_(
    containerContext.parentFolder,
    state.root.temporaryName,
    String(rootFolder.getId() || '').trim()
  ).length > 0) {
    throw createHotspotFolderMigrationError_('同じ移行識別子のHotspot一時ルートが複数あります。', true);
  }
  validateMigrationRootFolder_(
    rootFolder,
    containerContext,
    [HOTSPOT_FOLDER_NAME, state.root.temporaryName]
  );
  const rootId = String(rootFolder.getId() || '').trim();
  let officialRootId = String(properties.getProperty(HOTSPOT_FOLDER_ID_KEY) || '').trim();
  if (officialRootId && officialRootId !== rootId) {
    throw createHotspotFolderMigrationError_('正式なHotspotルートIDが移行ジャーナルと一致しません。', true);
  }
  if (!officialRootId) {
    writeHotspotFolderMigrationState_(properties, state, 'root_property_pending');
    properties.setProperty(HOTSPOT_FOLDER_ID_KEY, rootId);
    writeHotspotFolderMigrationState_(properties, state, 'root_property_saved');
    officialRootId = rootId;
  }
  const rootName = String(rootFolder.getName() || '');
  if (rootName === state.root.temporaryName) {
    if (findDirectChildFoldersByName_(containerContext.parentFolder, HOTSPOT_FOLDER_NAME, rootId).length > 0) {
      throw createHotspotFolderMigrationError_('移行先に別IDの同名Hotspotルートがあります。', true);
    }
    writeHotspotFolderMigrationState_(properties, state, 'root_rename_pending');
    rootFolder.setName(HOTSPOT_FOLDER_NAME);
    state.root.renamed = true;
    writeHotspotFolderMigrationState_(properties, state, 'root_ready');
  } else if (rootName === HOTSPOT_FOLDER_NAME) {
    if (state.root.created) state.root.renamed = true;
    writeHotspotFolderMigrationState_(properties, state, 'root_ready');
  } else {
    throw createHotspotFolderMigrationError_('移行中のHotspotルート名が一致しません。', true);
  }

  const photoFolder = migrateOrCreateHotspotChild_({
    state: state.photo,
    migrationState: state,
    properties: properties,
    rootFolder: rootFolder,
    targetName: HOTSPOT_PHOTO_FOLDER_NAME,
    label: 'photos',
    phasePrefix: 'photo',
    propertyKey: HOTSPOT_PHOTO_FOLDER_ID_KEY,
    otherFolderId: state.audio.id,
    containerContext: containerContext
  });
  const audioFolder = migrateOrCreateHotspotChild_({
    state: state.audio,
    migrationState: state,
    properties: properties,
    rootFolder: rootFolder,
    targetName: HOTSPOT_AUDIO_FOLDER_NAME,
    label: 'audio',
    phasePrefix: 'audio',
    propertyKey: HOTSPOT_AUDIO_FOLDER_ID_KEY,
    otherFolderId: photoFolder.getId(),
    containerContext: containerContext
  });
  const finalIds = [rootFolder.getId(), photoFolder.getId(), audioFolder.getId()].map(function(id) {
    return String(id || '').trim();
  });
  if (finalIds.some(function(id) { return !id; }) || new Set(finalIds).size !== 3 ||
      String(rootFolder.getName() || '') !== HOTSPOT_FOLDER_NAME ||
      String(photoFolder.getName() || '') !== HOTSPOT_PHOTO_FOLDER_NAME ||
      String(audioFolder.getName() || '') !== HOTSPOT_AUDIO_FOLDER_NAME ||
      getFileParentFolderIds_(photoFolder).join(',') !== finalIds[0] ||
      getFileParentFolderIds_(audioFolder).join(',') !== finalIds[0]) {
    throw createHotspotFolderMigrationError_('Hotspot添付フォルダの最終構成を検証できません。', true);
  }

  writeHotspotFolderMigrationState_(properties, state, 'final_properties_pending');
  const finalProperties = getHotspotFolderPropertyIds_(properties);
  if (finalProperties.rootId !== finalIds[0] || finalProperties.photoId !== finalIds[1] ||
      finalProperties.audioId !== finalIds[2]) {
    throw createHotspotFolderMigrationError_('Hotspot添付フォルダの正式IDを確定できません。', true);
  }
  writeHotspotFolderMigrationState_(properties, state, 'final_properties_saved');

  const structure = {
    rootFolder: rootFolder,
    photoFolder: photoFolder,
    audioFolder: audioFolder,
    warnings: state.configWarnings.slice()
  };
  if (!state.configSynced) {
    writeHotspotFolderMigrationState_(properties, state, 'config_sync_pending');
    const configSync = syncHotspotFolderUrlConfig_(finalIds[0], transaction.configSheet, structure);
    if (!configSync.success) {
      throw new Error(configSync.warning || 'configのHotspotフォルダURLを保存できませんでした。');
    }
    state.configWarnings = configSync.warnings || [];
    state.configSynced = true;
    structure.warnings = state.configWarnings.slice();
    structure.configSync = configSync;
    writeHotspotFolderMigrationState_(properties, state, 'config_synced');
  } else {
    const config = getAppConfig_();
    if (String(config[HOTSPOT_FOLDER_URL_CONFIG_KEY] || '').trim() !== buildHotspotFolderUrl_(finalIds[0])) {
      throw createHotspotFolderMigrationError_('移行済みconfigとHotspotルートIDが一致しません。', true);
    }
  }
  properties.deleteProperty(HOTSPOT_FOLDER_MIGRATION_STATE_KEY);
  return structure;
}

/**
 * ルート/photos/audioを正式ID・移行ジャーナル・限定的な旧構造復旧条件で検証し、
 * 必要時は再開可能な同一トランザクションで作成・移行する。
 * createIfMissing=true の呼び出し元はLockService内で実行する。
 */
function getHotspotFolderStructure_(createIfMissing, configSheet) {
  const properties = PropertiesService.getScriptProperties();
  const propertyIds = getHotspotFolderPropertyIds_(properties);
  const distinctIds = [propertyIds.rootId, propertyIds.photoId, propertyIds.audioId].filter(Boolean);
  if (!createIfMissing && distinctIds.length === 0) {
    return { rootFolder: null, photoFolder: null, audioFolder: null, warnings: [] };
  }
  const containerContext = getHotspotFolderContainerContext_();
  if (!createIfMissing) {
    const readOnly = inspectHotspotFolderStructure_(propertyIds, containerContext, false);
    return {
      rootFolder: readOnly.rootFolder,
      photoFolder: readOnly.photoFolder,
      audioFolder: readOnly.audioFolder,
      warnings: []
    };
  }

  const effectiveConfigSheet = configSheet || getOrCreateConfigSheet_();
  let state = readHotspotFolderMigrationState_(properties);
  if (!state) {
    const inspected = inspectHotspotFolderStructure_(propertyIds, containerContext, true);
    if (isCompleteHotspotFolderStructure_(propertyIds, inspected)) {
      const completeStructure = {
        rootFolder: inspected.rootFolder,
        photoFolder: inspected.photoFolder,
        audioFolder: inspected.audioFolder,
        warnings: []
      };
      const configSync = syncHotspotFolderUrlConfig_(propertyIds.rootId, effectiveConfigSheet, completeStructure);
      if (!configSync.success) throw new Error(configSync.warning || 'configのHotspotフォルダURLを保存できませんでした。');
      completeStructure.warnings = configSync.warnings || [];
      completeStructure.configSync = configSync;
      return completeStructure;
    }
    try {
      state = createHotspotFolderMigrationState_(properties, effectiveConfigSheet, containerContext);
    } catch (error) {
      if (error && error.hotspotFolderMigrationUnsafe) throw error;
      throw new Error(
        'Hotspot添付フォルダの移行ジャーナルを保存できませんでした。Drive構造は変更していません: ' +
        String(error && error.message ? error.message : error)
      );
    }
  }
  const transaction = {
    properties: properties,
    state: state,
    configSheet: effectiveConfigSheet,
    containerContext: containerContext
  };
  if (state.mode === 'rollback') {
    const pendingRollbackFailures = rollbackHotspotFolderTransaction_(transaction);
    if (pendingRollbackFailures.length > 0) {
      throw new Error('Hotspot添付フォルダのロールバックを再開できず、構造不整合が残りました。管理者による確認が必要です。');
    }
    return getHotspotFolderStructure_(true, effectiveConfigSheet);
  }
  try {
    return resumeHotspotFolderMigration_(transaction);
  } catch (error) {
    if (error && (error.hotspotFolderMigrationUnsafe || state.configSynced)) {
      throw new Error('Hotspot添付フォルダの移行ジャーナルとDrive構造が一致しません。既存データは変更せず、管理者による確認が必要です。');
    }
    const rollbackFailures = rollbackHotspotFolderTransaction_(transaction);
    if (rollbackFailures.length > 0) {
      throw new Error('Hotspot添付フォルダのロールバックに失敗し、構造不整合が残りました。管理者による確認が必要です。');
    }
    throw new Error(
      'Hotspot添付フォルダ構成を保存・移行できませんでした: ' +
      String(error && error.message ? error.message : error)
    );
  }
}

function getHotspotRootFolder_(createIfMissing) {
  return getHotspotFolderStructure_(!!createIfMissing).rootFolder;
}

function getHotspotPhotoFolder_(createIfMissing) {
  return getHotspotFolderStructure_(!!createIfMissing).photoFolder;
}

function getHotspotAudioFolder_(createIfMissing) {
  return getHotspotFolderStructure_(!!createIfMissing).audioFolder;
}

/** 編集画面から共通Hotspotルートを開くためのURLだけを返す。 */
function getHotspotFolderUrlForEdit(payload) {
  let lock = null;
  try {
    assertEditToken_(payload);
    lock = acquireLock_();
    const structure = getHotspotFolderStructure_(true);
    const result = { success: true, url: buildHotspotFolderUrl_(structure.rootFolder.getId()) };
    if (structure.warnings && structure.warnings.length > 0) {
      result.warnings = structure.warnings.slice();
      result.warning = structure.warnings.join(' ');
    }
    return result;
  } catch (e) {
    console.error('Hotspotフォルダ取得エラー:', e && e.message ? e.message : e);
    return { success: false, error: 'Hotspotフォルダを開けませんでした。管理者に設定を確認してください。' };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/** 旧クライアント互換: 子フォルダURLを返すが正式configは共通ルートだけを使用する。 */
function getHotspotPhotoFolderUrlForEdit(payload) {
  let lock = null;
  try {
    assertEditToken_(payload);
    lock = acquireLock_();
    const structure = getHotspotFolderStructure_(true);
    return { success: true, url: buildHotspotFolderUrl_(structure.photoFolder.getId()) };
  } catch (e) {
    console.error('写真フォルダ取得エラー:', e && e.message ? e.message : e);
    return { success: false, error: '写真フォルダを開けませんでした。管理者に設定を確認してください。' };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * 検証済み添付を安全な一意名で正式フォルダへ保存する。
 * 共通フォルダ構成とconfig同期が完了してから添付ファイルを作成する。
 */
function createHotspotPhotoFile_(upload) {
  const structure = getHotspotFolderStructure_(true);
  const folder = structure.photoFolder;
  const timestampDigits = String(
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') || ''
  ).replace(/[^0-9]/g, '').slice(0, 14) || String(new Date().getTime());
  const timestamp = timestampDigits.length >= 14
    ? timestampDigits.slice(0, 8) + '_' + timestampDigits.slice(8, 14)
    : timestampDigits;
  const uniqueId = String(Utilities.getUuid() || '').replace(/[^A-Za-z0-9]/g, '') || String(new Date().getTime());
  const safeName = 'hotspot_' + timestamp + '_' + uniqueId + '.' + upload.extension;
  const blob = Utilities.newBlob(upload.bytes, upload.mimeType, safeName);
  return {
    file: folder.createFile(blob),
    configSync: structure.configSync
  };
}

/** 正式添付フォルダ直下のJPEG/PNG/WebPならDriveファイルを返す。 */
function getManagedHotspotPhotoFile_(photoId) {
  const targetId = String(photoId || '').trim();
  if (!targetId) return null;
  const folder = getHotspotPhotoFolder_(false);
  if (!folder) return null;
  const file = DriveApp.getFileById(targetId);
  const mimeType = String(file.getMimeType() || '').trim().toLowerCase();
  if (!HOTSPOT_PHOTO_MIME_EXTENSIONS[mimeType]) return null;
  const parentIds = getFileParentFolderIds_(file);
  return parentIds.indexOf(String(folder.getId() || '').trim()) !== -1 ? file : null;
}

/** MP3の先頭（任意のID3v2タグ直後）に有効なMPEG Layer IIIフレームがあるかを返す。 */
function hasHotspotMp3Frame_(bytes) {
  const data = bytes || [];
  const byteAt = function(index) { return Number(data[index]) & 0xff; };
  let offset = 0;
  if (data.length >= 10 &&
      byteAt(0) === 0x49 && byteAt(1) === 0x44 && byteAt(2) === 0x33) {
    const version = byteAt(3);
    if (version < 2 || version > 4) return false;
    for (let i = 6; i <= 9; i++) {
      if ((byteAt(i) & 0x80) !== 0) return false;
    }
    const tagSize = (byteAt(6) << 21) | (byteAt(7) << 14) | (byteAt(8) << 7) | byteAt(9);
    const hasFooter = version === 4 && (byteAt(5) & 0x10) !== 0;
    offset = 10 + tagSize + (hasFooter ? 10 : 0);
  }
  if (offset + 4 > data.length) return false;

  const first = byteAt(offset);
  const second = byteAt(offset + 1);
  const third = byteAt(offset + 2);
  const fourth = byteAt(offset + 3);
  const versionBits = (second >> 3) & 0x03;
  const layerBits = (second >> 1) & 0x03;
  const bitrateIndex = (third >> 4) & 0x0f;
  const sampleRateIndex = (third >> 2) & 0x03;
  const emphasis = fourth & 0x03;
  return first === 0xff && (second & 0xe0) === 0xe0 &&
    versionBits !== 0x01 && layerBits === 0x01 &&
    bitrateIndex !== 0x00 && bitrateIndex !== 0x0f &&
    sampleRateIndex !== 0x03 && emphasis !== 0x02;
}

/** 音声添付payloadを復号し、MP3・サイズ・時間・実バイトを一致検証する。 */
function normalizeHotspotAudioUpload_(audioUpload) {
  if (!audioUpload || typeof audioUpload !== 'object') {
    throw new Error('音声アップロードデータが不正です。');
  }
  const mimeType = String(audioUpload.mimeType || '').trim().toLowerCase();
  if (mimeType !== HOTSPOT_AUDIO_MIME_TYPE) {
    throw new Error('音声はMP3（audio/mpeg）形式だけアップロードできます。');
  }
  const originalFileName = String(audioUpload.fileName || '').trim();
  if (!originalFileName || originalFileName.length > 180 ||
      /[\u0000-\u001f\u007f-\u009f\\/]/.test(originalFileName)) {
    throw new Error('音声ファイル名が不正です。');
  }
  if (!/\.mp3$/i.test(originalFileName)) {
    throw new Error('音声のMIMEと拡張子が一致しません。MP3を指定してください。');
  }

  const declaredSizeBytes = audioUpload.sizeBytes;
  if (typeof declaredSizeBytes !== 'number' || !isFinite(declaredSizeBytes) ||
      declaredSizeBytes <= 0 || Math.floor(declaredSizeBytes) !== declaredSizeBytes) {
    throw new Error('音声のサイズが不正です。');
  }
  if (declaredSizeBytes > HOTSPOT_AUDIO_FINAL_MAX_BYTES) {
    throw new Error('音声は4MB以下にしてください。');
  }
  const durationSeconds = audioUpload.durationSeconds;
  if (typeof durationSeconds !== 'number' || !isFinite(durationSeconds) ||
      durationSeconds < HOTSPOT_AUDIO_MIN_DURATION_SECONDS ||
      durationSeconds > HOTSPOT_AUDIO_MAX_DURATION_SECONDS) {
    throw new Error('音声の時間は0.5秒以上120秒以下にしてください。');
  }

  const base64 = String(audioUpload.base64 || '');
  const maximumBase64Length = Math.ceil(HOTSPOT_AUDIO_FINAL_MAX_BYTES / 3) * 4 + 4;
  if (!base64 || base64.length > maximumBase64Length || base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || /=/.test(base64.slice(0, -2))) {
    throw new Error('音声のBase64データが不正です。');
  }
  let bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (decodeError) {
    throw new Error('音声のBase64データを復号できません。');
  }
  if (!bytes || bytes.length === 0 || bytes.length !== declaredSizeBytes) {
    throw new Error('音声の申告サイズと実データのサイズが一致しません。');
  }
  if (bytes.length > HOTSPOT_AUDIO_FINAL_MAX_BYTES) {
    throw new Error('音声は4MB以下にしてください。');
  }
  if (!hasHotspotMp3Frame_(bytes)) {
    throw new Error('音声の実データに有効なMP3 Layer IIIフレームがありません。');
  }
  return {
    bytes: bytes,
    mimeType: mimeType,
    extension: 'mp3',
    originalFileName: originalFileName,
    sizeBytes: bytes.length,
    durationSeconds: durationSeconds
  };
}

/** 編集画面から正式な音声フォルダを開くためのURLだけを返す。 */
function getHotspotAudioFolderUrlForEdit(payload) {
  let lock = null;
  try {
    assertEditToken_(payload);
    lock = acquireLock_();
    const structure = getHotspotFolderStructure_(true);
    return { success: true, url: buildHotspotFolderUrl_(structure.audioFolder.getId()) };
  } catch (e) {
    console.error('音声フォルダ取得エラー:', e && e.message ? e.message : e);
    return {
      success: false,
      error: '音声フォルダを開けませんでした。管理者に設定を確認してください。'
    };
  } finally {
    if (lock) lock.releaseLock();
  }
}

function sanitizeHotspotAudioBaseName_(fileName) {
  const withoutExtension = String(fileName || '').replace(/\.mp3$/i, '');
  const safe = withoutExtension
    .replace(/[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._\-\u3040-\u30ff\u3400-\u9fff]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.\-]+|[_\.\-]+$/g, '')
    .slice(0, 60);
  return safe || 'audio';
}

/** 検証済みMP3を安全な一意名で正式音声フォルダへ保存する。 */
function createHotspotAudioFile_(upload) {
  const structure = getHotspotFolderStructure_(true);
  const folder = structure.audioFolder;
  const timestampDigits = String(
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') || ''
  ).replace(/[^0-9]/g, '').slice(0, 14) || String(new Date().getTime());
  const timestamp = timestampDigits.length >= 14
    ? timestampDigits.slice(0, 8) + '_' + timestampDigits.slice(8, 14)
    : timestampDigits;
  const uniqueId = String(Utilities.getUuid() || '').replace(/[^A-Za-z0-9]/g, '') || String(new Date().getTime());
  const safeName = 'hotspot_audio_' + timestamp + '_' + uniqueId + '_' +
    sanitizeHotspotAudioBaseName_(upload.originalFileName) + '.mp3';
  const blob = Utilities.newBlob(upload.bytes, HOTSPOT_AUDIO_MIME_TYPE, safeName);
  return {
    file: folder.createFile(blob),
    configSync: structure.configSync
  };
}

/** 正式音声フォルダ直下の未削除・上限内MP3ならDriveファイルを返す。 */
function getManagedHotspotAudioFile_(audioId) {
  const targetId = String(audioId || '').trim();
  if (!targetId) return null;
  const folder = getHotspotAudioFolder_(false);
  if (!folder) return null;
  const file = DriveApp.getFileById(targetId);
  if (String(file.getMimeType() || '').trim().toLowerCase() !== HOTSPOT_AUDIO_MIME_TYPE) return null;
  if (typeof file.isTrashed === 'function' && file.isTrashed()) return null;
  const sizeBytes = Number(file.getSize());
  if (!isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > HOTSPOT_AUDIO_FINAL_MAX_BYTES) return null;
  const parentIds = getFileParentFolderIds_(file);
  return parentIds.indexOf(String(folder.getId() || '').trim()) !== -1 ? file : null;
}

/** 13列旧版または14列現行版だけを公開読取で許可し、未知列を音声IDとして誤読しない。 */
function hasReadableInfoSheetSchema_(sheet) {
  if (!sheet) return false;
  const columns = sheet.getLastColumn();
  if (columns < ID_COL_INDEX + 1 || columns > INFO_HEADERS.length) return false;
  const header = sheet.getRange(1, 1, 1, columns).getValues()[0];
  for (let i = 0; i < columns; i++) {
    if (String(header[i] || '').trim() !== INFO_HEADERS[i]) return false;
  }
  return true;
}

/** 公開中のinfo関連付けと正式保存先が一致する音声だけをData URIで返す。 */
function getHotspotAudioData(request) {
  try {
    const req = request && typeof request === 'object' ? request : {};
    const fileId = String(req.fileId || '').trim();
    const hotspotId = String(req.hotspotId || '').trim();
    const audioId = String(req.audioId || '').trim();
    if (!fileId || !hotspotId || !audioId) {
      return { success: false, error: '音声の関連付け情報が不足しています。' };
    }
    const hotspotContext = getHotspotStorageContext_(fileId);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INFO_SHEET_NAME);
    if (!sheet || sheet.getLastRow() <= 1 || !hasReadableInfoSheetSchema_(sheet)) {
      return { success: false, error: '音声は公開中のホットスポットに関連付けられていません。' };
    }
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, INFO_HEADERS.length).getValues();
    const allowedStorageIds = [String(hotspotContext.storageFileId || '')];
    if (!hotspotContext.rootFolderId && allowedStorageIds.indexOf('') === -1) allowedStorageIds.push('');
    const isAssociated = data.some(function(row) {
      return allowedStorageIds.indexOf(String(row[1] || '').trim()) !== -1 &&
        String(row[ID_COL_INDEX] || '').trim() === hotspotId &&
        String(row[AUDIO_ID_COL_INDEX] || '').trim() === audioId;
    });
    if (!isAssociated) {
      return { success: false, error: '音声は公開中のホットスポットに関連付けられていません。' };
    }
    const audioFile = getManagedHotspotAudioFile_(audioId);
    if (!audioFile) {
      return { success: false, error: '音声は公開可能な保存先にありません。' };
    }
    const blob = audioFile.getBlob();
    const bytes = blob.getBytes();
    if (!bytes || bytes.length === 0 || bytes.length > HOTSPOT_AUDIO_FINAL_MAX_BYTES ||
        !hasHotspotMp3Frame_(bytes)) {
      return { success: false, error: '音声ファイルを確認できません。' };
    }
    return {
      success: true,
      dataUri: 'data:' + HOTSPOT_AUDIO_MIME_TYPE + ';base64,' + Utilities.base64Encode(bytes),
      mimeType: HOTSPOT_AUDIO_MIME_TYPE,
      sizeBytes: bytes.length
    };
  } catch (e) {
    console.error('getHotspotAudioData エラー:', e && e.message ? e.message : e);
    return { success: false, error: '音声の取得に失敗しました。' };
  }
}

/** 複数親の一覧キャッシュを重複なく無効化し、すべて成功したか返す。 */
function invalidateFolderListCaches_(folderIds) {
  const seen = {};
  let allInvalidated = true;
  (folderIds || []).forEach(function(folderId) {
    const targetId = String(folderId || '');
    if (!targetId || seen[targetId]) return;
    seen[targetId] = true;
    if (!invalidateFolderListCache_(targetId)) allInvalidated = false;
  });
  return allInvalidated;
}

/**
 * 指定した画像ファイルのプロパティを返す。
 *
 * @param {{fileId:string,__editToken:string}} payload 編集トークン付きリクエスト
 * @returns {{ success: boolean, properties?: Object, error?: string }}
 */
function getImageFileProperties(payload) {
  assertEditToken_(payload);
  const fileId = payload && typeof payload === 'object' ? String(payload.fileId || '').trim() : '';
  try {
    if (!fileId) return { success: false, error: 'ファイルIDが指定されていません。' };

    const targetContext = getEditableSceneContext_(fileId);
    const file = targetContext.file;

    // scenesキャッシュを優先し、未取得のJPEGだけXMPを解析する。
    var northOffset = null;
    try {
      northOffset = getOrExtractNorthOffset_(fileId, file);
    } catch (headingErr) {
      console.warn('northOffset 取得スキップ (properties):', headingErr.message);
    }

    // Advanced Drive API で imageMediaMetadata を取得する
    var width = null, height = null, cameraMake = null, cameraModel = null, exifDate = null;
    try {
      var advancedFile = Drive.Files.get(fileId, { fields: 'imageMediaMetadata' });
      var meta = advancedFile.imageMediaMetadata;
      if (meta) {
        width       = meta.width       != null ? meta.width       : null;
        height      = meta.height      != null ? meta.height      : null;
        cameraMake  = meta.cameraMake  || null;
        cameraModel = meta.cameraModel || null;
        exifDate    = meta.time        || null; // EXIF の撮影日時
      }
    } catch (metaErr) {
      console.warn('imageMediaMetadata 取得スキップ:', metaErr.message);
    }

    return {
      success: true,
      properties: {
        id:          file.getId(),
        name:        file.getName(),
        mimeType:    file.getMimeType(),
        sizeBytes:   file.getSize(),
        lastUpdated: file.getLastUpdated() ? file.getLastUpdated().toISOString() : '',
        url:         file.getUrl(),
        northOffset: northOffset,
        width:       width,
        height:      height,
        cameraMake:  cameraMake,
        cameraModel: cameraModel,
        exifDate:    exifDate
      }
    };
  } catch (e) {
    console.error('getImageFileProperties エラー:', e.message);
    return { success: false, error: 'プロパティの取得に失敗しました。' };
  }
}

/** 明示削除時にだけ、対象画像のinfo行を一括除去する。 */
function deleteInfoRowsForImage_(fileId, sheet) {
  const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INFO_SHEET_NAME);
  if (!targetSheet) return 0;
  ensureInfoSheetSchema_(targetSheet);
  const lastRow = targetSheet.getLastRow();
  if (lastRow <= 1) return 0;

  const data = targetSheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues();
  const rowNumbers = [];
  data.forEach(function(row, index) {
    if (String(row[1]) === String(fileId)) rowNumbers.push(index + 2);
  });
  rowNumbers.sort(function(left, right) { return right - left; });
  rowNumbers.forEach(function(rowNumber) {
    targetSheet.deleteRows(rowNumber, 1);
  });
  return rowNumbers.length;
}

/** シーン削除前に、そのinfo行が参照する写真IDを重複なく収集する。 */
function collectHotspotPhotoIdsForImage_(fileId, sheet) {
  const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INFO_SHEET_NAME);
  if (!targetSheet) return [];
  if (!hasReadableInfoSheetSchema_(targetSheet)) {
    throw new Error('infoシートに未知または想定外のヘッダーがあるため、添付写真を確認できません。');
  }
  const lastRow = targetSheet.getLastRow();
  if (lastRow <= 1) return [];
  const targetId = String(fileId || '');
  const seen = {};
  const photoIds = [];
  targetSheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues().forEach(function(row) {
    if (String(row[1]) !== targetId) return;
    const photoId = String(row[10] || '').trim();
    if (!photoId || seen[photoId]) return;
    seen[photoId] = true;
    photoIds.push(photoId);
  });
  return photoIds;
}

/** シーン削除前に、そのinfo行が参照する音声IDを重複なく収集する。 */
function collectHotspotAudioIdsForImage_(fileId, sheet) {
  const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INFO_SHEET_NAME);
  if (!targetSheet) return [];
  if (!hasReadableInfoSheetSchema_(targetSheet)) {
    throw new Error('infoシートに未知または想定外のヘッダーがあるため、添付音声を確認できません。');
  }
  const lastRow = targetSheet.getLastRow();
  if (lastRow <= 1) return [];
  const targetId = String(fileId || '');
  const seen = {};
  const audioIds = [];
  targetSheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues().forEach(function(row) {
    if (String(row[1]) !== targetId) return;
    const audioId = String(row[AUDIO_ID_COL_INDEX] || '').trim();
    if (!audioId || seen[audioId]) return;
    seen[audioId] = true;
    audioIds.push(audioId);
  });
  return audioIds;
}

/** 明示削除時にだけ、対象ファイルIDのscenes行をすべて除去する。 */
function deleteSceneRowsForFileId_(fileId, sheet) {
  const targetSheet = sheet || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCENES_SHEET_NAME);
  if (!targetSheet) return 0;
  const snapshot = readSceneRows_(targetSheet);
  const rowNumbers = snapshot.rows.filter(function(row) {
    return row.fileId === String(fileId);
  }).map(function(row) {
    return row.rowNumber;
  }).sort(function(left, right) {
    return right - left;
  });
  rowNumbers.forEach(function(rowNumber) { targetSheet.deleteRows(rowNumber, 1); });
  return rowNumbers.length;
}

/**
 * 指定した画像ファイルを削除（ゴミ箱移動）し、関連ホットスポットを一括削除する。
 *
 * @param {string} fileId Google Drive ファイルID
 * @returns {{ success: boolean, deletedHotspots?: number, error?: string }}
 */
function deleteImageFile(payload) {
  assertEditToken_(payload);
  let lock = null;
  let targetId = '';
  let driveDeleted = false;
  try {
    lock = acquireLock_();
    const fileId = payload && typeof payload === 'object' ? payload.fileId : payload;
    targetId = String(fileId || '').trim();
    if (!targetId) return { success: false, error: 'ファイルIDが指定されていません。' };

    const targetContext = getEditableSceneContext_(targetId);
    targetId = targetContext.fileId;
    const file = targetContext.file;
    const parentFolderIds = targetContext.parentFolderIds.slice();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const infoSheet = ss.getSheetByName(INFO_SHEET_NAME);
    // Driveを変更する前にinfoスキーマと整理候補を確定し、未知N列を音声IDとして誤読しない。
    const attachmentCleanupCandidates = collectHotspotPhotoIdsForImage_(targetId, infoSheet);
    const audioCleanupCandidates = collectHotspotAudioIdsForImage_(targetId, infoSheet);
    file.setTrashed(true);
    driveDeleted = true;

    let deletedHotspots = 0;
    let deletedScenes = 0;
    let infoDeleted = false;
    let sceneDeleted = false;
    const warnings = [];
    try {
      deletedHotspots = deleteInfoRowsForImage_(targetId, infoSheet);
      infoDeleted = true;
    } catch (infoError) {
      const warning = 'Driveファイルは削除済みですが、infoの関連ホットスポット削除に失敗しました。';
      warnings.push(warning);
      console.error(
        '[scene-mutation] fileId=' + targetId + ' stage=delete-info:',
        infoError && infoError.message ? infoError.message : infoError
      );
    }

    if (infoDeleted && infoSheet) {
      attachmentCleanupCandidates.forEach(function(photoId) {
        try {
          cleanupOrphanedHotspotPhoto_(photoId, infoSheet);
        } catch (cleanupError) {
          const warning = '関連ホットスポットは削除済みですが、孤立した添付写真の整理に失敗しました。';
          warnings.push(warning);
          console.error(
            '[scene-mutation] fileId=' + targetId + ' stage=delete-hotspot-photo-cleanup:',
            cleanupError && cleanupError.message ? cleanupError.message : cleanupError
          );
        }
      });
      audioCleanupCandidates.forEach(function(audioId) {
        try {
          cleanupOrphanedHotspotAudio_(audioId, infoSheet);
        } catch (cleanupError) {
          const warning = '関連ホットスポットは削除済みですが、孤立した添付音声の整理に失敗しました。';
          warnings.push(warning);
          console.error(
            '[scene-mutation] fileId=' + targetId + ' stage=delete-hotspot-audio-cleanup:',
            cleanupError && cleanupError.message ? cleanupError.message : cleanupError
          );
        }
      });
    }

    try {
      deletedScenes = deleteSceneRowsForFileId_(targetId, ss.getSheetByName(SCENES_SHEET_NAME));
      sceneDeleted = true;
    } catch (sceneError) {
      const warning = 'Driveファイルは削除済みですが、scenes行の削除に失敗しました。';
      warnings.push(warning);
      console.error(
        '[scene-mutation] fileId=' + targetId + ' stage=delete-scenes:',
        sceneError && sceneError.message ? sceneError.message : sceneError
      );
    }

    const cacheInvalidated = invalidateFolderListCaches_(parentFolderIds);
    if (!cacheInvalidated) {
      warnings.push('Driveファイルと関連シートは更新済みですが、フォルダ一覧キャッシュの無効化に失敗しました。');
      console.error(
        '[scene-mutation] fileId=' + targetId + ' stage=delete-cache:',
        'folder list cache invalidation failed'
      );
    }
    return {
      success: true,
      partialSuccess: warnings.length > 0,
      driveDeleted: true,
      infoDeleted: infoDeleted,
      sceneDeleted: sceneDeleted,
      cacheInvalidated: cacheInvalidated,
      deletedHotspots: deletedHotspots,
      deletedScenes: deletedScenes,
      warning: warnings.join('\n'),
      warnings: warnings
    };
  } catch (e) {
    console.error(
      '[scene-mutation] fileId=' + targetId + ' stage=delete-drive:',
      e && e.message ? e.message : e
    );
    return {
      success: false,
      partialSuccess: false,
      driveDeleted: driveDeleted,
      infoDeleted: false,
      sceneDeleted: false,
      error: '写真の削除に失敗しました。'
    };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * infoシートの画像キーを、現在のIMAGE_DRIVE_URLと実Driveの両方で検証する。
 * フォルダモードは登録scene IDだけ、単一画像モードは設定ファイルIDまたは
 * 後方互換の空文字キーだけを許可する。
 *
 * @param {*} storageFileId
 * @returns {{storageFileId:string,actualFileId:string,rootFolderId:string,scene:Object|null,sceneType:string,file:Object}}
 */
function getHotspotStorageContext_(storageFileId) {
  const storageId = String(storageFileId || '').trim();
  const config = getAppConfig_();
  const configuredUrl = config[IMAGE_DRIVE_URL_CONFIG_KEY] || '';
  const rootFolderId = extractDriveFolderId_(configuredUrl) || '';

  if (rootFolderId) {
    if (!storageId) throw new Error('対象シーンIDが指定されていません。');
    const editable = getEditableSceneContext_(storageId);
    return {
      storageFileId: storageId,
      actualFileId: editable.fileId,
      rootFolderId: editable.rootFolderId,
      scene: editable.scene,
      sceneType: normalizeSceneType_(editable.scene && editable.scene.type) || SCENE_TYPE_360,
      file: editable.file
    };
  }

  const configuredFileId = extractDriveFileId_(configuredUrl) || '';
  if (!configuredFileId) {
    throw new Error('IMAGE_DRIVE_URLに有効な画像またはフォルダが設定されていません。');
  }
  if (storageId && storageId !== configuredFileId) {
    throw new Error('対象シーンは設定済み単一画像と一致しません。');
  }
  const readable = getReadableImageContext_(configuredFileId);
  return {
    storageFileId: storageId,
    actualFileId: configuredFileId,
    rootFolderId: '',
    scene: readable.scene || null,
    sceneType: readable.scene
      ? (normalizeSceneType_(readable.scene.type) || SCENE_TYPE_360)
      : SCENE_TYPE_360,
    file: readable.file
  };
}

/** 公開loadHotspotsのnorthOffset対象とinfo格納キーの組み合わせを検証する。 */
function getHotspotReadContext_(fileId, hotspotFileId) {
  const northFileId = String(fileId || '').trim();
  const storage = getHotspotStorageContext_(hotspotFileId);
  if (northFileId !== storage.actualFileId) {
    throw new Error('northOffset対象とホットスポット対象が一致しません。');
  }
  return storage;
}

/** scene種別に応じてホットスポット座標を有限数・許可範囲へ限定する。 */
function normalizeHotspotCoordinates_(pitch, yaw, sceneType) {
  if (typeof pitch !== 'number' || typeof yaw !== 'number' ||
      !isFinite(pitch) || !isFinite(yaw)) {
    return null;
  }
  const normalizedType = normalizeSceneType_(sceneType) || SCENE_TYPE_360;
  if (normalizedType === SCENE_TYPE_2D) {
    if (pitch < 0 || pitch > 100 || yaw < 0 || yaw > 100) return null;
  } else if (pitch < -90 || pitch > 90 || yaw < -180 || yaw > 180) {
    return null;
  }
  return { pitch: pitch, yaw: yaw };
}

/** クライアントで座標を取得した時点の種別が、Lock内の正式種別と一致することを確認する。 */
function assertHotspotSceneTypeUnchanged_(data, currentSceneType) {
  if (!data || !Object.prototype.hasOwnProperty.call(data, 'sceneType')) return;
  const requestedType = normalizeSceneType_(data.sceneType);
  const currentType = normalizeSceneType_(currentSceneType) || SCENE_TYPE_360;
  if (!requestedType || requestedType !== currentType) {
    throw new Error('シーン種別が変更されました。再読み込み後に座標を指定し直してください。');
  }
}

/** 写真・ジャンプ参照が同じ設定ルート内の登録画像を指すことを検証する。 */
function validateHotspotRelatedIds_(data, storageContext, allowedExistingPhotoId, allowedExistingAudioId) {
  const photoId = String(data && data.photoId || '').trim();
  const audioIdWasSpecified = !!(data && Object.prototype.hasOwnProperty.call(data, 'audioId'));
  const audioId = String(
    audioIdWasSpecified ? (data.audioId || '') : (allowedExistingAudioId || '')
  ).trim();
  const jumpSceneId = String(data && data.jumpSceneId || '').trim();
  const hasPhotoUpload = !!(data && data.photoUpload);
  const hasAudioUpload = !!(data && data.audioUpload);
  if (photoId && hasPhotoUpload) {
    throw new Error('既存のphotoIdと写真アップロードは同時に指定できません。');
  }
  if (audioId && hasAudioUpload) {
    throw new Error('既存のaudioIdと音声アップロードは同時に指定できません。');
  }
  if (jumpSceneId && (audioId || hasAudioUpload)) {
    throw new Error('ジャンプ用ホットスポットには音声を添付できません。');
  }
  if (!storageContext.rootFolderId && jumpSceneId) {
    throw new Error('単一画像モードではジャンプ先を指定できません。');
  }
  if (photoId) {
    let registeredScenePhoto = false;
    if (storageContext.rootFolderId) {
      try {
        getReadableImageContext_(photoId);
        registeredScenePhoto = true;
      } catch (scenePhotoError) {
        registeredScenePhoto = false;
      }
    }
    if (!registeredScenePhoto) {
      if (photoId !== String(allowedExistingPhotoId || '').trim()) {
        throw new Error('写真IDは登録済みシーンまたは現在の管理添付と一致しません。');
      }
      if (!getManagedHotspotPhotoFile_(photoId)) {
        throw new Error('現在の添付写真を正式な保存先で確認できません。');
      }
    }
  }
  if (audioId) {
    if (audioId !== String(allowedExistingAudioId || '').trim()) {
      throw new Error('音声IDは現在の管理添付と一致しません。');
    }
    if (!getManagedHotspotAudioFile_(audioId)) {
      throw new Error('現在の添付音声を正式な保存先で確認できません。');
    }
  }
  if (jumpSceneId) getEditableSceneContext_(jumpSceneId);
  return { photoId: photoId, audioId: audioId, jumpSceneId: jumpSceneId };
}

/** 保存・更新応答と実マーカー描画で共有する正規化ホットスポットを構築する。 */
function buildNormalizedHotspot_(fileId, hotspotId, fields) {
  const data = fields || {};
  return {
    id: String(hotspotId || ''),
    fileId: String(fileId || ''),
    label: String(data.label || ''),
    description: String(data.description || ''),
    linkUrl: String(data.linkUrl || ''),
    pitch: data.pitch,
    yaw: data.yaw,
    markerShape: normalizeMarkerShape_(data.markerShape),
    markerColor: normalizeMarkerColor_(data.markerColor),
    markerIcon: normalizeMarkerIcon_(data.markerIcon),
    photoId: String(data.photoId || ''),
    jumpSceneId: String(data.jumpSceneId || ''),
    audioId: String(data.audioId || '')
  };
}

/** infoに同じ写真IDの参照が残っているかを返す。 */
function isHotspotPhotoReferenced_(photoId, sheet) {
  const targetId = String(photoId || '').trim();
  if (!targetId || !sheet || sheet.getLastRow() <= 1) return false;
  const values = sheet.getRange(2, 11, sheet.getLastRow() - 1, 1).getValues();
  return values.some(function(row) {
    return String(row[0] || '').trim() === targetId;
  });
}

/** 未参照かつ正式添付フォルダ直下の写真だけをゴミ箱へ移す。 */
function cleanupOrphanedHotspotPhoto_(photoId, sheet) {
  const targetId = String(photoId || '').trim();
  if (!targetId) return { cleaned: false, reason: 'blank' };
  if (isHotspotPhotoReferenced_(targetId, sheet)) {
    return { cleaned: false, reason: 'referenced' };
  }
  if (findSceneRowsByFileId_(targetId).length > 0) {
    return { cleaned: false, reason: 'registered-scene' };
  }
  const managedFile = getManagedHotspotPhotoFile_(targetId);
  if (!managedFile) return { cleaned: false, reason: 'unmanaged' };
  managedFile.setTrashed(true);
  return { cleaned: true, fileId: targetId };
}

/** infoに同じ音声IDの参照が残っているかを返す。 */
function isHotspotAudioReferenced_(audioId, sheet) {
  const targetId = String(audioId || '').trim();
  if (!targetId || !sheet || sheet.getLastRow() <= 1) return false;
  const values = sheet.getRange(2, AUDIO_ID_COL_INDEX + 1, sheet.getLastRow() - 1, 1).getValues();
  return values.some(function(row) {
    return String(row[0] || '').trim() === targetId;
  });
}

/** 未参照かつ正式音声フォルダ直下の音声だけをゴミ箱へ移す。 */
function cleanupOrphanedHotspotAudio_(audioId, sheet) {
  const targetId = String(audioId || '').trim();
  if (!targetId) return { cleaned: false, reason: 'blank' };
  if (isHotspotAudioReferenced_(targetId, sheet)) {
    return { cleaned: false, reason: 'referenced' };
  }
  const managedFile = getManagedHotspotAudioFile_(targetId);
  if (!managedFile) return { cleaned: false, reason: 'unmanaged' };
  managedFile.setTrashed(true);
  return { cleaned: true, fileId: targetId };
}

/** 成功済み処理へ、破壊を伴わない後処理警告を重複なく追記する。 */
function addPartialSuccessWarning_(result, warning) {
  const normalizedWarning = String(warning || '').trim();
  if (!normalizedWarning) return result;
  const warnings = Array.isArray(result.warnings) ? result.warnings.slice() : [];
  if (result.warning && warnings.indexOf(result.warning) === -1) warnings.push(result.warning);
  if (warnings.indexOf(normalizedWarning) === -1) warnings.push(normalizedWarning);
  result.partialSuccess = true;
  result.warnings = warnings;
  result.warning = warnings.join(' ');
  return result;
}

/** 添付フォルダconfigの保持警告を、保存成功応答へ重複なく引き継ぐ。 */
function addHotspotFolderConfigWarnings_(result, configSync) {
  if (!configSync) return result;
  if (!configSync.success) addPartialSuccessWarning_(result, configSync.warning);
  (Array.isArray(configSync.warnings) ? configSync.warnings : []).forEach(function(warning) {
    addPartialSuccessWarning_(result, warning);
  });
  return result;
}

/** info確定後の整理失敗をpartial successとして応答へ追記する。 */
function addHotspotCleanupWarning_(result, error, action, attachmentType) {
  const attachmentLabel = attachmentType === 'audio' ? '添付音声' : '添付写真';
  const warning = action === 'delete'
    ? 'ホットスポットは削除されましたが、古い' + attachmentLabel + 'の整理に失敗しました。'
    : 'ホットスポットは保存されましたが、古い' + attachmentLabel + 'の整理に失敗しました。';
  addPartialSuccessWarning_(result, warning);
  console.error('ホットスポット' + attachmentLabel + '整理エラー:', error && error.message ? error.message : error);
  return result;
}

/** info保存前に作成した添付を種別付きログで補償削除する。 */
function rollbackCreatedHotspotAttachment_(file, attachmentLabel) {
  if (!file) return true;
  const label = String(attachmentLabel || '添付ファイル');
  try {
    file.setTrashed(true);
    return true;
  } catch (rollbackError) {
    let fileId = '';
    try { fileId = String(file.getId() || ''); } catch (idError) { fileId = ''; }
    console.error(
      'ホットスポット' + label + 'rollbackエラー fileId=' + fileId + ':',
      rollbackError.message
    );
    return false;
  }
}

function rollbackCreatedHotspotPhoto_(file) {
  return rollbackCreatedHotspotAttachment_(file, '添付写真');
}

function rollbackCreatedHotspotAudio_(file) {
  return rollbackCreatedHotspotAttachment_(file, '添付音声');
}

/** info保存前に作成した写真・音声をすべて補償削除し、全件成功したか返す。 */
function rollbackCreatedHotspotAttachments_(photoFile, audioFile) {
  let allRolledBack = true;
  if (photoFile && !rollbackCreatedHotspotPhoto_(photoFile)) allRolledBack = false;
  if (audioFile && !rollbackCreatedHotspotAudio_(audioFile)) allRolledBack = false;
  return allRolledBack;
}

/**
 * スプレッドシートに保存されている指定画像のホットスポットを返す。
 * シートが存在しない場合は空配列を返す。
 * 公開ビューからも呼ばれる。ホットスポットやDriveは変更しない。
 * northOffset はscenes/旧configを読み、未取得JPEGのXMP結果だけをscenesへキャッシュする。
 *
 * @param {string|{fileId?:string,hotspotFileId?:string}} request 取得対象。単一画像ではnorthOffset対象と従来の空ホットスポットキーを分離できる。
 * @returns {{ hotspots: Array, northOffset: number|null }}
 */
function loadHotspots(request) {
  const isPayload = request && typeof request === 'object';
  const fileId = String(isPayload ? (request.fileId || '') : (request || '')).trim();
  const hotspotFileId = String(
    isPayload && Object.prototype.hasOwnProperty.call(request, 'hotspotFileId')
      ? (request.hotspotFileId || '')
      : fileId
  );
  var accessContext = null;
  try {
    accessContext = getHotspotReadContext_(fileId, hotspotFileId);
  } catch (accessError) {
    console.warn('loadHotspots: 対象範囲外のため取得スキップ:', accessError.message);
    return { hotspots: [], northOffset: null };
  }

  var northOffset = null;
  if (fileId) {
    try {
      northOffset = getOrExtractNorthOffset_(fileId);
    } catch (metaErr) {
      console.warn('loadHotspots: northOffset 取得スキップ:', metaErr.message);
    }
  }

  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!sheet) return { hotspots: [], northOffset: northOffset };
    if (!hasReadableInfoSheetSchema_(sheet)) {
      console.warn('loadHotspots: infoシートの未知ヘッダーを検出したため取得をスキップしました。');
      return { hotspots: [], northOffset: northOffset };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { hotspots: [], northOffset: northOffset };

    const data     = sheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues();
    const targetId = hotspotFileId;

    const hotspots = data
      .filter(function(row) {
        return String(row[1]) === targetId && hasHotspotLabelOrJump_({
          label: row[2],
          jumpSceneId: row[11]
        });
      })
      .map(function(row) {
        const coordinates = normalizeHotspotCoordinates_(
          row[5],
          row[6],
          accessContext.sceneType
        );
        if (!coordinates) return null;
        return {
          id:          String(row[ID_COL_INDEX] || ''),
          fileId:      String(accessContext.actualFileId || targetId || ''),
          label:       String(row[2]),
          description: String(row[3]),
          linkUrl:     normalizeLinkUrl_(row[4]),
          pitch:       coordinates.pitch,
          yaw:         coordinates.yaw,
          markerShape: normalizeMarkerShape_(row[7]),
          markerColor: normalizeMarkerColor_(row[8]),
          markerIcon:  normalizeMarkerIcon_(row[9]),
          photoId:     String(row[10] || ''),
          jumpSceneId: String(row[11] || ''),
          audioId:     String(row[AUDIO_ID_COL_INDEX] || '')
        };
      })
      .filter(function(hotspot) { return !!hotspot; });

    return { hotspots: hotspots, northOffset: northOffset };

  } catch (e) {
    console.error('loadHotspots エラー:', e.message);
    return { hotspots: [], northOffset: northOffset };
  }
}

/**
 * ホットスポットをスプレッドシートの最終行に追記保存する。
 * UUID を自動生成し、排他制御を行う。
 *
 * @param {{ fileId:string, label:string, description:string, linkUrl?:string, pitch:number, yaw:number, markerShape?:string, markerColor?:string, markerIcon?:string, photoId?:string, jumpSceneId?:string }} data
 * @returns {{ success:boolean, id?:string, error?:string }}
 */
function saveHotspot(data) {
  assertEditToken_(data);
  const lock = acquireLock_();
  let createdPhotoFile = null;
  let createdAudioFile = null;
  let photoFolderConfigSync = null;
  let audioFolderConfigSync = null;
  let infoSaved = false;
  try {
    data = data && typeof data === 'object' ? data : {};
    if (!hasHotspotLabelOrJump_(data)) {
      return { success: false, error: 'ラベルが空です。' };
    }
    const storageContext = getHotspotStorageContext_(data.fileId);
    assertHotspotSceneTypeUnchanged_(data, storageContext.sceneType);
    const coordinates = normalizeHotspotCoordinates_(data.pitch, data.yaw, storageContext.sceneType);
    if (!coordinates) {
      return { success: false, error: '座標データが不正です。' };
    }
    const relatedIds = validateHotspotRelatedIds_(data, storageContext);
    const normalizedUpload = data.photoUpload
      ? normalizeHotspotPhotoUpload_(data.photoUpload)
      : null;
    const normalizedAudioUpload = data.audioUpload
      ? normalizeHotspotAudioUpload_(data.audioUpload)
      : null;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(INFO_SHEET_NAME);
    const label = String(data.label || '').trim();
    const jumpSceneId = String(data.jumpSceneId || '').trim();
    const markerShape = normalizeMarkerShape_(data.markerShape);
    const markerColor = normalizeMarkerColor_(data.markerColor);
    const markerIcon = normalizeMarkerIcon_(data.markerIcon);
    const linkUrl = normalizeLinkUrl_(data.linkUrl);
    const description = String(data.description || '').trim();

    if (!sheet) {
      sheet = ss.insertSheet(INFO_SHEET_NAME);
      applyInfoSheetSchema_(sheet);
    } else {
      ensureInfoSheetSchema_(sheet);
    }

    const id = Utilities.getUuid();
    let photoId = relatedIds.photoId;
    if (normalizedUpload) {
      const createdPhoto = createHotspotPhotoFile_(normalizedUpload);
      createdPhotoFile = createdPhoto.file;
      photoFolderConfigSync = createdPhoto.configSync;
      photoId = String(createdPhotoFile.getId() || '').trim();
      if (!photoId) throw new Error('作成した添付写真のDrive IDを取得できませんでした。');
    }
    let audioId = relatedIds.audioId;
    if (normalizedAudioUpload) {
      const createdAudio = createHotspotAudioFile_(normalizedAudioUpload);
      createdAudioFile = createdAudio.file;
      audioFolderConfigSync = createdAudio.configSync;
      audioId = String(createdAudioFile.getId() || '').trim();
      if (!audioId) throw new Error('作成した添付音声のDrive IDを取得できませんでした。');
    }
    const normalizedHotspot = buildNormalizedHotspot_(storageContext.actualFileId, id, {
      label: label,
      description: description,
      linkUrl: linkUrl,
      pitch: coordinates.pitch,
      yaw: coordinates.yaw,
      markerShape: markerShape,
      markerColor: markerColor,
      markerIcon: markerIcon,
      photoId: photoId,
      jumpSceneId: relatedIds.jumpSceneId,
      audioId: audioId
    });

    sheet.appendRow([
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss'),
      storageContext.storageFileId,
      label,
      description,
      linkUrl,
      coordinates.pitch,
      coordinates.yaw,
      markerShape,
      markerColor,
      markerIcon,
      photoId,
      relatedIds.jumpSceneId,
      id,
      audioId
    ]);
    infoSaved = true;

    const result = {
      success: true,
      id: id,
      photoId: photoId,
      audioId: audioId,
      hotspot: normalizedHotspot
    };
    addHotspotFolderConfigWarnings_(result, photoFolderConfigSync);
    addHotspotFolderConfigWarnings_(result, audioFolderConfigSync);
    return result;

  } catch (e) {
    const hasCreatedFiles = !!(createdPhotoFile || createdAudioFile);
    const rollbackFailed = hasCreatedFiles && !infoSaved &&
      !rollbackCreatedHotspotAttachments_(createdPhotoFile, createdAudioFile);
    console.error('saveHotspot エラー:', e.message);
    const failure = { success: false, error: e.message };
    if (rollbackFailed) {
      failure.cleanupRequired = true;
      failure.warning = '保存に失敗し、作成済み添付ファイルの取り消しにも失敗しました。管理者へ連絡してください。';
    }
    return failure;
  } finally {
    lock.releaseLock();
  }
}


/**
 * ホットスポットをスプレッドシートから削除する（UUID ベース）。
 *
 * @param {{ id:string, fileId?:string }} payload
 * @returns {{ success: boolean, error?: string }}
 */
function deleteHotspot(payload) {
  assertEditToken_(payload);
  const lock = acquireLock_();
  try {
    let hotspotId = '';
    let storageFileId = '';
    if (payload && typeof payload === 'object') {
      hotspotId = String(payload.id || '');
      storageFileId = String(payload.fileId || '').trim();
    }
    if (!hotspotId) {
      return { success: false, error: 'ホットスポットIDが指定されていません。' };
    }
    const storageContext = getHotspotStorageContext_(storageFileId);

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!sheet) return { success: false, error: 'シートが見つかりません。' };

    ensureInfoSheetSchema_(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: '削除対象が見つかりません。' };

    const data = sheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][ID_COL_INDEX]) === hotspotId &&
          String(data[i][1]) === storageContext.storageFileId) {
        const previousPhotoId = String(data[i][10] || '').trim();
        const previousAudioId = String(data[i][AUDIO_ID_COL_INDEX] || '').trim();
        sheet.deleteRow(i + 2);
        const result = { success: true };
        if (previousPhotoId) {
          try {
            cleanupOrphanedHotspotPhoto_(previousPhotoId, sheet);
          } catch (cleanupError) {
            addHotspotCleanupWarning_(result, cleanupError, 'delete');
          }
        }
        if (previousAudioId) {
          try {
            cleanupOrphanedHotspotAudio_(previousAudioId, sheet);
          } catch (cleanupError) {
            addHotspotCleanupWarning_(result, cleanupError, 'delete', 'audio');
          }
        }
        return result;
      }
    }

    return { success: false, error: '削除対象が見つかりません。再読み込みしてください。' };
  } catch (e) {
    console.error('deleteHotspot エラー:', e.message);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 指定UUIDのホットスポットをスプレッドシートで更新する。
 *
 * @param {{ fileId:string, label:string, description:string, linkUrl?:string, pitch:number, yaw:number, markerShape?:string, markerColor?:string, markerIcon?:string, photoId?:string, jumpSceneId?:string }} data
 * @param {string} hotspotId  更新対象のホットスポット UUID
 * @returns {{ success: boolean, error?: string }}
 */
function updateHotspot(data, hotspotId) {
  assertEditToken_(data);
  const lock = acquireLock_();
  let createdPhotoFile = null;
  let createdAudioFile = null;
  let photoFolderConfigSync = null;
  let audioFolderConfigSync = null;
  let infoSaved = false;
  try {
    data = data && typeof data === 'object' ? data : {};
    if (!hasHotspotLabelOrJump_(data)) {
      return { success: false, error: 'ラベルが空です。' };
    }
    if (!hotspotId) {
      return { success: false, error: 'ホットスポットIDが不正です。' };
    }

    const storageContext = getHotspotStorageContext_(data.fileId);
    assertHotspotSceneTypeUnchanged_(data, storageContext.sceneType);
    const coordinates = normalizeHotspotCoordinates_(data.pitch, data.yaw, storageContext.sceneType);
    if (!coordinates) {
      return { success: false, error: '座標データが不正です。' };
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!sheet) return { success: false, error: 'シートが見つかりません。' };

    ensureInfoSheetSchema_(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: '更新対象が見つかりません。' };

    const allData = sheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues();
    let targetRowIndex = -1;
    for (let i = 0; i < allData.length; i++) {
      if (String(allData[i][ID_COL_INDEX]) === hotspotId &&
          String(allData[i][1]) === storageContext.storageFileId) {
        targetRowIndex = i + 2;
        break;
      }
    }

    if (targetRowIndex < 0) {
      return { success: false, error: '更新対象が見つかりません。再読み込みしてください。' };
    }

    const previousRow = allData[targetRowIndex - 2];
    const previousPhotoId = String(previousRow[10] || '').trim();
    const previousAudioId = String(previousRow[AUDIO_ID_COL_INDEX] || '').trim();
    const relatedIds = validateHotspotRelatedIds_(data, storageContext, previousPhotoId, previousAudioId);
    const normalizedUpload = data.photoUpload
      ? normalizeHotspotPhotoUpload_(data.photoUpload)
      : null;
    const normalizedAudioUpload = data.audioUpload
      ? normalizeHotspotAudioUpload_(data.audioUpload)
      : null;

    const label       = String(data.label || '').trim();
    const description = String(data.description || '').trim();
    const markerShape = normalizeMarkerShape_(data.markerShape);
    const markerColor = normalizeMarkerColor_(data.markerColor);
    const markerIcon  = normalizeMarkerIcon_(data.markerIcon);
    const linkUrl     = normalizeLinkUrl_(data.linkUrl);
    let photoId = relatedIds.photoId;
    if (normalizedUpload) {
      const createdPhoto = createHotspotPhotoFile_(normalizedUpload);
      createdPhotoFile = createdPhoto.file;
      photoFolderConfigSync = createdPhoto.configSync;
      photoId = String(createdPhotoFile.getId() || '').trim();
      if (!photoId) throw new Error('作成した添付写真のDrive IDを取得できませんでした。');
    }
    let audioId = relatedIds.audioId;
    if (normalizedAudioUpload) {
      const createdAudio = createHotspotAudioFile_(normalizedAudioUpload);
      createdAudioFile = createdAudio.file;
      audioFolderConfigSync = createdAudio.configSync;
      audioId = String(createdAudioFile.getId() || '').trim();
      if (!audioId) throw new Error('作成した添付音声のDrive IDを取得できませんでした。');
    }
    const normalizedHotspot = buildNormalizedHotspot_(storageContext.actualFileId, hotspotId, {
      label: label,
      description: description,
      linkUrl: linkUrl,
      pitch: coordinates.pitch,
      yaw: coordinates.yaw,
      markerShape: markerShape,
      markerColor: markerColor,
      markerIcon: markerIcon,
      photoId: photoId,
      jumpSceneId: relatedIds.jumpSceneId,
      audioId: audioId
    });

    sheet.getRange(targetRowIndex, 1, 1, INFO_HEADERS.length).setValues([[
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss'),
      storageContext.storageFileId,
      label,
      description,
      linkUrl,
      coordinates.pitch,
      coordinates.yaw,
      markerShape,
      markerColor,
      markerIcon,
      photoId,
      relatedIds.jumpSceneId,
      hotspotId,
      audioId
    ]]);
    infoSaved = true;

    const result = {
      success: true,
      id: String(hotspotId),
      photoId: photoId,
      audioId: audioId,
      hotspot: normalizedHotspot
    };
    addHotspotFolderConfigWarnings_(result, photoFolderConfigSync);
    addHotspotFolderConfigWarnings_(result, audioFolderConfigSync);
    if (previousPhotoId && previousPhotoId !== photoId) {
      try {
        cleanupOrphanedHotspotPhoto_(previousPhotoId, sheet);
      } catch (cleanupError) {
        addHotspotCleanupWarning_(result, cleanupError);
      }
    }
    if (previousAudioId && previousAudioId !== audioId) {
      try {
        cleanupOrphanedHotspotAudio_(previousAudioId, sheet);
      } catch (cleanupError) {
        addHotspotCleanupWarning_(result, cleanupError, '', 'audio');
      }
    }
    return result;
  } catch (e) {
    const hasCreatedFiles = !!(createdPhotoFile || createdAudioFile);
    const rollbackFailed = hasCreatedFiles && !infoSaved &&
      !rollbackCreatedHotspotAttachments_(createdPhotoFile, createdAudioFile);
    console.error('updateHotspot エラー:', e.message);
    const failure = { success: false, error: e.message };
    if (rollbackFailed) {
      failure.cleanupRequired = true;
      failure.warning = '更新に失敗し、作成済み添付ファイルの取り消しにも失敗しました。管理者へ連絡してください。';
    }
    return failure;
  } finally {
    lock.releaseLock();
  }
}


// ============================================================
//  内部ユーティリティ（クライアントから直接呼び出し不可）
// ============================================================

/**
 * 旧スキーマから現行スキーマへのマイグレーション。
 * ヘッダー行の列数に応じて必要な列を自動追加する。
 * ID 列が空の既存行には UUID を自動付与する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function migrateSheetIfNeeded_(sheet) {
  const originalColumns = sheet.getLastColumn();
  const targetColumns = INFO_HEADERS.length;
  if (originalColumns === 0) {
    applyInfoSheetSchema_(sheet);
    return { migrated: true, idsAdded: 0 };
  }

  if (originalColumns > targetColumns) {
    return { migrated: false, warning: 'infoシートの列数が想定より多いため、自動補修しませんでした。' };
  }

  const originalHeader = sheet.getRange(1, 1, 1, originalColumns).getValues()[0].map(function(value) {
    return String(value || '').trim();
  });
  let migrated = false;

  // v2→v3: [保存日時,画像ID,ラベル,説明,Pitch,Yaw,形状,色,アイコン] に
  // 「リンクURL」列（5列目）を追加し、既存データを右へシフトする
  if (originalColumns === 9) {
    const headerRow = originalHeader;
    const looksLikeOldSchema =
      headerRow[0] === '保存日時' &&
      headerRow[1] === '画像ID' &&
      headerRow[2] === 'ラベル' &&
      headerRow[3] === '説明' &&
      headerRow[4] === 'Pitch' &&
      headerRow[8] === 'アイコン';
    if (looksLikeOldSchema) {
      sheet.insertColumnAfter(4); // 5列目に「リンクURL」用の空列を挿入
      migrated = true;
    }
  }

  // 最初期5列: [保存日時,ラベル,説明,Pitch,Yaw]
  // 画像ID列とリンクURL列の両方を挿入し、Pitch/Yawの位置を維持する。
  const looksLikeFiveColumnSchema = originalColumns === 5 &&
    originalHeader[0] === '保存日時' &&
    originalHeader[1] === 'ラベル' &&
    originalHeader[2] === '説明' &&
    originalHeader[3] === 'Pitch' &&
    originalHeader[4] === 'Yaw';
  if (looksLikeFiveColumnSchema) {
    sheet.insertColumnAfter(1); // 2列目: 画像ID
    sheet.insertColumnAfter(4); // 5列目: リンクURL
    migrated = true;

    const lastRow = sheet.getLastRow();
    const appConfig = getAppConfig_();
    const legacyFileId = extractDriveFileId_(appConfig['IMAGE_DRIVE_URL'] || '') || '';

    if (lastRow > 1 && legacyFileId) {
      const imageIdRange = sheet.getRange(2, 2, lastRow - 1, 1);
      const values = imageIdRange.getValues().map(function() {
        return [legacyFileId];
      });
      imageIdRange.setValues(values);
    }
  }

  // 既知旧スキーマでない場合は、現在の列位置と矛盾する非空ヘッダーを変更しない。
  if (!migrated) {
    for (let i = 0; i < originalHeader.length; i++) {
      if (originalHeader[i] && originalHeader[i] !== INFO_HEADERS[i]) {
        return {
          migrated: false,
          warning: 'infoシートに未知または想定外のヘッダーがあるため、自動補修しませんでした（' + (i + 1) + '列目）。'
        };
      }
    }
  }

  if (sheet.getLastColumn() < targetColumns) {
    sheet.insertColumnsAfter(sheet.getLastColumn(), targetColumns - sheet.getLastColumn());
    migrated = true;
  }

  // ID列（13列目）が空の既存行に UUID を自動付与
  const lastRow = sheet.getLastRow();
  let idsAdded = 0;
  if (lastRow > 1) {
    const idRange = sheet.getRange(2, ID_COL_INDEX + 1, lastRow - 1, 1);
    const idValues = idRange.getValues();
    let needsUpdate = false;
    for (let i = 0; i < idValues.length; i++) {
      if (!idValues[i][0]) {
        idValues[i][0] = Utilities.getUuid();
        needsUpdate = true;
        idsAdded++;
      }
    }
    if (needsUpdate) {
      idRange.setValues(idValues);
    }
  }

  applyInfoSheetSchema_(sheet);
  return { migrated: migrated, idsAdded: idsAdded };
}

/**
 * infoスキーマを安全に補修できない場合、呼び出し元の更新を停止する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {{migrated:boolean,idsAdded?:number}}
 */
function ensureInfoSheetSchema_(sheet) {
  const result = migrateSheetIfNeeded_(sheet);
  if (result && result.warning) throw new Error(result.warning);
  return result;
}

function applyInfoSheetSchema_(sheet) {
  sheet.getRange(1, 1, 1, INFO_HEADERS.length)
    .setValues([INFO_HEADERS])
    .setFontWeight('bold')
    .setBackground('#E8F0FE');
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 160);
  sheet.setColumnWidth(4, 280);
  sheet.setColumnWidth(5, 320);
  sheet.setColumnWidth(6, 80);
  sheet.setColumnWidth(7, 80);
  sheet.setColumnWidth(8, 110);
  sheet.setColumnWidth(9, 110);
  sheet.setColumnWidth(10, 110);
  sheet.setColumnWidth(11, 220);
  sheet.setColumnWidth(12, 220);
  sheet.setColumnWidth(13, 280);
  sheet.setColumnWidth(14, 280);
  sheet.setFrozenRows(1);
}

function hasHotspotLabelOrJump_(data) {
  return !!(
    String(data && data.label || '').trim() ||
    String(data && data.jumpSceneId || '').trim()
  );
}

function normalizeMarkerShape_(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_MARKER_SHAPES.indexOf(normalized) >= 0 ? normalized : DEFAULT_MARKER_SHAPE;
}

function normalizeMarkerColor_(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_MARKER_COLORS.indexOf(normalized) >= 0 ? normalized : DEFAULT_MARKER_COLOR;
}

function normalizeMarkerIcon_(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SUPPORTED_MARKER_ICONS.indexOf(normalized) >= 0 ? normalized : DEFAULT_MARKER_ICON;
}

function normalizeLinkUrl_(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : '';
}


// ============================================================
//  XMP メタデータ抽出
// ============================================================

/**
 * JPEG Blob から XMP の PoseHeadingDegrees（撮影方位）を抽出する。
 * 取得に失敗した場合は null を返す。
 *
 * @param {GoogleAppsScript.Base.Blob} blob
 * @returns {number|null}
 */
function extractHeadingFromBlob_(blob) {
  try {
    var bytes = blob.getBytes();
    // XMP パケットは通常先頭付近に存在するため、最初の 128 KB のみ対象にする
    var limit = Math.min(bytes.length, 131072);
    var chunk = bytes.slice(0, limit);

    // バイト配列を文字列に変換（8 KB ずつ処理してスタックオーバーフローを防ぐ）
    var str = '';
    var blockSize = 8192;
    for (var i = 0; i < chunk.length; i += blockSize) {
      str += String.fromCharCode.apply(null, chunk.slice(i, Math.min(i + blockSize, chunk.length)));
    }

    // 形式 1: <gpano:PoseHeadingDegrees>数値</gpano:PoseHeadingDegrees>
    var tagMatch = str.match(/<gpano:PoseHeadingDegrees>([\d.+\-]+)<\/gpano:PoseHeadingDegrees>/i);
    if (tagMatch) {
      var val = parseFloat(tagMatch[1]);
      if (!isNaN(val)) return val;
    }

    // 形式 2: gpano:PoseHeadingDegrees="数値"
    var attrMatch = str.match(/gpano:PoseHeadingDegrees="([\d.+\-]+)"/i);
    if (attrMatch) {
      var val2 = parseFloat(attrMatch[1]);
      if (!isNaN(val2)) return val2;
    }

    return null;
  } catch (e) {
    console.warn('extractHeadingFromBlob_ エラー:', e.message);
    return null;
  }
}


// ============================================================
//  画像アップロード（クライアントから呼び出し）
// ============================================================

/**
 * Base64 画像データを受け取り、IMAGE_DRIVE_URL で指定されたフォルダに保存する。
 * UIで選ばれた種別はファイル名へ付けず、作成後のscenes同期へ明示的に渡す。
 *
 * @param {{ base64?: string, dataUrl?: string, fileName?: string, mimeType?: string, is2D?: boolean, setAsHome?:boolean }|string} payload
 * @param {string=} fileName
 * @param {string=} mimeType
 * @param {boolean=} is2D
 * @returns {{ success: boolean, partialSuccess?:boolean, file?:Object, sceneRegistered?:boolean, warning?:string, error?:string }}
 */
function uploadImageToDrive(payload, fileName, mimeType, is2D) {
  assertEditToken_(payload);
  let createdFile = null;
  let uploadFolderId = '';
  let rootFolderId = '';
  let req = null;
  let cacheInvalidated = true;
  const mutationWarnings = [];
  try {
    req = normalizeUploadPayload_(payload, fileName, mimeType, is2D);
    const config = getAppConfig_();
    const folderUrl = config['IMAGE_DRIVE_URL'] || '';
    if (!folderUrl) throw new Error('IMAGE_DRIVE_URL が設定されていません。config シートを確認してください。');

    rootFolderId = extractDriveFolderId_(folderUrl);
    if (!rootFolderId) throw new Error('IMAGE_DRIVE_URL にはフォルダのURLを設定してください（ファイルURLは不可）。');

    // targetFolderId が指定されている場合はそのフォルダへ、なければルートフォルダへ
    uploadFolderId = req.targetFolderId || rootFolderId;
    if (!isDriveFolderWithinRoot_(uploadFolderId, rootFolderId)) {
      throw new Error('アップロード先は設定済みルートフォルダの配下を指定してください。');
    }
    if (req.setAsHome && uploadFolderId !== rootFolderId) {
      throw new Error('ホームに設定できるのはルートフォルダへアップロードする画像だけです。');
    }
    const folder = DriveApp.getFolderById(uploadFolderId);

    // data URI プレフィックス（"data:image/jpeg;base64,"）を除去
    let base64Data = req.base64;
    const commaIdx = base64Data.indexOf(',');
    if (commaIdx !== -1) base64Data = base64Data.slice(commaIdx + 1);
    if (!base64Data) throw new Error('画像データが空です。');

    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      req.mimeType,
      req.fileName
    );

    createdFile = folder.createFile(blob);
    try {
      createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingErr) {
      console.warn('setSharing スキップ（権限制限の可能性）:', sharingErr.message);
    }
  } catch (e) {
    console.error(
      '[scene-mutation] fileId=' + (createdFile ? createdFile.getId() : '') + ' stage=upload-drive:',
      e && e.message ? e.message : e
    );
    return { success: false, driveUpdated: !!createdFile, error: e.message };
  }

  const fileId = createdFile.getId();
  cacheInvalidated = invalidateFolderListCaches_([rootFolderId, uploadFolderId]);
  if (!cacheInvalidated) {
    mutationWarnings.push('Driveへの保存は完了しましたが、フォルダ一覧キャッシュの無効化に失敗しました。');
    console.error(
      '[scene-mutation] fileId=' + fileId + ' stage=upload-cache:',
      'folder list cache invalidation failed'
    );
  }
  const explicitType = req.is2D ? SCENE_TYPE_2D : SCENE_TYPE_360;
  const fallbackFile = {
    id: fileId,
    name: createdFile.getName(),
    driveName: createdFile.getName(),
    displayName: createdFile.getName(),
    parentFolderId: uploadFolderId,
    type: explicitType,
    sceneType: explicitType,
    isHome: false,
    displayOrder: null,
    order: null,
    northOffset: null,
    northOffsetSource: ''
  };

  try {
    const overrides = {};
    overrides[fileId] = {
      type: explicitType,
      displayName: createdFile.getName(),
      isHome: false
    };
    const synced = getConfigFromFolder_(uploadFolderId, {
      forceRefresh: true,
      rootFolderId: rootFolderId,
      newSceneOverridesByFileId: overrides
    });
    if (!synced || synced.error) {
      const warning = 'Driveへの保存は完了しましたが、scenes同期に失敗しました。次回の一覧同期で再登録してください。';
      const warnings = mutationWarnings.concat([warning]);
      console.error(
        '[scene-mutation] fileId=' + fileId + ' stage=upload-scenes:',
        synced && synced.error ? synced.error : 'unknown scenes sync error'
      );
      return {
        success: true,
        partialSuccess: true,
        driveUpdated: true,
        sceneRegistered: false,
        homeSet: false,
        cacheInvalidated: cacheInvalidated,
        file: fallbackFile,
        warning: warnings.join('\n'),
        warnings: warnings,
        error: warning
      };
    }
    let joinedFile = (synced.images || []).filter(function(item) {
      return String(item.id || '') === fileId;
    })[0] || fallbackFile;
    let homeSet = false;
    if (req.setAsHome) {
      try {
        const homeResult = setHomeSceneInternal_(fileId);
        if (!homeResult || !homeResult.success) {
          throw new Error(homeResult && homeResult.error ? homeResult.error : 'ホーム設定に失敗しました。');
        }
        homeSet = true;
        joinedFile = Object.assign({}, joinedFile, homeResult.scene || {}, { id: fileId, fileId: fileId });
        if (homeResult.partialSuccess) {
          mutationWarnings.push(homeResult.warning || 'ホーム設定後のキャッシュ更新に失敗しました。');
          cacheInvalidated = false;
        }
      } catch (homeError) {
        mutationWarnings.push('Drive保存とscenes登録は完了しましたが、ホーム設定に失敗しました。右クリックメニューから再設定してください。');
        console.error(
          '[scene-mutation] fileId=' + fileId + ' stage=upload-home:',
          homeError && homeError.message ? homeError.message : homeError
        );
      }
    }
    return {
      success: true,
      partialSuccess: mutationWarnings.length > 0,
      driveUpdated: true,
      sceneRegistered: true,
      homeSet: homeSet,
      cacheInvalidated: cacheInvalidated,
      file: joinedFile,
      warning: mutationWarnings.join('\n'),
      warnings: mutationWarnings
    };
  } catch (sceneError) {
    const warning = 'Driveへの保存は完了しましたが、scenes同期に失敗しました。次回の一覧同期で再登録してください。';
    const warnings = mutationWarnings.concat([warning]);
    console.error(
      '[scene-mutation] fileId=' + fileId + ' stage=upload-scenes:',
      sceneError && sceneError.message ? sceneError.message : sceneError
    );
    return {
      success: true,
      partialSuccess: true,
      driveUpdated: true,
      sceneRegistered: false,
      homeSet: false,
      cacheInvalidated: cacheInvalidated,
      file: fallbackFile,
      warning: warnings.join('\n'),
      warnings: warnings,
      error: warning
    };
  }
}

/**
 * uploadImageToDrive の入力ペイロードを正規化する。
 * JPEG 以外の画像形式（PNG, GIF, WebP）もそのまま受け入れる。
 *
 * @param {{ base64?: string, dataUrl?: string, fileName?: string, mimeType?: string, is2D?: boolean, targetFolderId?: string, setAsHome?:boolean }|string|null|undefined} payload
 * @param {string=} fileName
 * @param {string=} mimeType
 * @param {boolean=} is2D
 * @returns {{ base64: string, fileName: string, mimeType: string, is2D: boolean, targetFolderId: string, setAsHome:boolean }}
 */
function normalizeUploadPayload_(payload, fileName, mimeType, is2D) {
  let base64 = '';
  let safeName = String(fileName || 'image.jpg');
  let safeMime = String(mimeType || 'image/jpeg');
  let safe2D = !!is2D;
  let targetFolderId = '';
  let setAsHome = false;

  if (payload && typeof payload === 'object') {
    base64 = String(payload.base64 || payload.dataUrl || '');
    safeName = String(payload.fileName || safeName);
    safeMime = String(payload.mimeType || safeMime);
    safe2D = payload.is2D != null ? !!payload.is2D : safe2D;
    targetFolderId = String(payload.targetFolderId || '');
    setAsHome = payload.setAsHome === true;
  } else if (typeof payload === 'string') {
    base64 = payload;
  }

  safeName = safeName.trim() || 'image.jpg';

  const ALLOWED_IMAGE_TYPES = {
    'image/jpeg': '.jpg',
    'image/png':  '.png',
    'image/gif':  '.gif',
    'image/webp': '.webp'
  };
  if (!ALLOWED_IMAGE_TYPES[safeMime]) {
    safeMime = 'image/jpeg';
  }
  const expectedExt = ALLOWED_IMAGE_TYPES[safeMime];
  const extMatch = safeName.match(/\.[^.]+$/);
  if (!extMatch || extMatch[0].toLowerCase() !== expectedExt) {
    safeName = safeName.replace(/\.[^.]+$/, '') + expectedExt;
  }

  return {
    base64: base64,
    fileName: safeName,
    mimeType: safeMime,
    is2D: safe2D,
    targetFolderId: targetFolderId,
    setAsHome: setAsHome
  };
}


// ============================================================
//  一括入力用スプレッドシート管理
// ============================================================

/**
 * GoogleスプレッドシートのURLまたは生IDからIDを安全に抽出する。
 *
 * @param {*} value
 * @returns {string|null}
 */
function extractSpreadsheetId_(value) {
  const input = String(value || '').trim();
  if (!input) return null;
  if (/^[A-Za-z0-9_-]{15,}$/.test(input)) return input;

  const pathMatch = input.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{15,})/i);
  if (pathMatch) return pathMatch[1];
  const queryMatch = input.match(/[?&]id=([A-Za-z0-9_-]{15,})/i);
  return queryMatch ? queryMatch[1] : null;
}

/**
 * 正式な一括入力用スプシIDをScriptPropertiesだけから返す。
 * configのSTUDENT_SHEET_URLは表示欄であり、紐づけには使用しない。
 *
 * @returns {string}
 */
function getStudentSheetId_() {
  const rawValue = PropertiesService.getScriptProperties().getProperty(STUDENT_SHEET_ID_KEY);
  const value = String(rawValue || '').trim();
  if (!value) return '';
  const id = extractSpreadsheetId_(value);
  if (!id) {
    throw new Error('ScriptProperties の STUDENT_SHEET_ID が不正です。');
  }
  return id;
}

/**
 * バウンドスプレッドシートのメニュー実行であることを確認する。
 * Webアプリからの google.script.run 直接呼び出しは、副作用より前に拒否する。
 *
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheetMenuContainer_() {
  SpreadsheetApp.getUi();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet || typeof spreadsheet.getId !== 'function' || !String(spreadsheet.getId() || '').trim()) {
    throw new Error('この操作は本体スプレッドシートのメニューから実行してください。');
  }
  return spreadsheet;
}

/**
 * 一括入力用シートのヘッダーを検証し、空セルだけを安全に補修する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {boolean} repair
 * @returns {{ repaired:boolean }}
 */
function ensureStudentSheetHeaders_(sheet, repair) {
  const current = sheet.getRange(1, 1, 1, STUDENT_SHEET_HEADERS.length).getValues()[0];
  let needsRepair = false;
  for (let i = 0; i < STUDENT_SHEET_HEADERS.length; i++) {
    const value = String(current[i] || '').trim();
    if (!value) {
      needsRepair = true;
      continue;
    }
    if (value !== STUDENT_SHEET_HEADERS[i]) {
      throw new Error('一括入力用シートのヘッダーが想定と異なります（' + (i + 1) + '列目）。');
    }
  }

  if (needsRepair) {
    if (!repair) throw new Error('一括入力用シートに必要なヘッダーがありません。');
    const repaired = current.slice();
    for (let i = 0; i < STUDENT_SHEET_HEADERS.length; i++) {
      if (!String(repaired[i] || '').trim()) repaired[i] = STUDENT_SHEET_HEADERS[i];
    }
    sheet.getRange(1, 1, 1, STUDENT_SHEET_HEADERS.length).setValues([repaired]);
  }
  return { repaired: needsRepair };
}

/**
 * 一括入力用スプレッドシートを開き、対象シートとヘッダーを検証する。
 *
 * 正式IDから取得したURLをconfigの表示欄へ必ず再出力する。
 *
 * @param {{repairHeaders?:boolean}=} options
 * @returns {{id:string,spreadsheet:GoogleAppsScript.Spreadsheet.Spreadsheet,sheet:GoogleAppsScript.Spreadsheet.Sheet,repairedHeaders:boolean}}
 */
function getStudentSheetContext_(options) {
  const id = getStudentSheetId_();
  if (!id) throw new Error('一括入力用スプシが紐づけられていません。');
  const spreadsheet = SpreadsheetApp.openById(id);
  const sheet = spreadsheet.getSheetByName(STUDENT_SHEET_NAME);
  if (!sheet) throw new Error('一括入力用シート「' + STUDENT_SHEET_NAME + '」が見つかりません。');
  const headerResult = ensureStudentSheetHeaders_(sheet, !!(options && options.repairHeaders));
  const url = String(spreadsheet.getUrl() || '').trim();
  setConfigValue_(STUDENT_SHEET_URL_CONFIG_KEY, url, STUDENT_SHEET_URL_CONFIG_DESCRIPTION);
  return {
    id: id,
    url: url,
    spreadsheet: spreadsheet,
    sheet: sheet,
    repairedHeaders: headerResult.repaired
  };
}

/**
 * 新規作成した一括入力用スプシを正式ID、表示URLの順に保存する。
 *
 * @param {string} id
 * @param {string} url
 */
function saveStudentSheetReference_(id, url) {
  const normalizedId = extractSpreadsheetId_(id || url);
  if (!normalizedId) throw new Error('一括入力用スプレッドシートIDを取得できません。');
  const normalizedUrl = String(url || '').trim() || ('https://docs.google.com/spreadsheets/d/' + normalizedId + '/edit');
  PropertiesService.getScriptProperties().setProperty(STUDENT_SHEET_ID_KEY, normalizedId);
  setConfigValue_(STUDENT_SHEET_URL_CONFIG_KEY, normalizedUrl, STUDENT_SHEET_URL_CONFIG_DESCRIPTION);
}

/**
 * ScriptPropertiesの正式IDを検証し、configの表示URLを修復する。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} configSheet
 * @param {Array<Object>=} configRows
 * @returns {{ repaired:boolean, warning?:string, repairedHeaders?:boolean }}
 */
function repairStudentSheetUrlConfigFromProperty_(configSheet, configRows) {
  const rows = configRows || readConfigRows_(configSheet);
  const configRow = findConfigSnapshotRow_(rows, STUDENT_SHEET_URL_CONFIG_KEY);

  try {
    const officialId = getStudentSheetId_();
    if (!officialId) return { repaired: false };
    const spreadsheet = SpreadsheetApp.openById(officialId);
    const studentSheet = spreadsheet.getSheetByName(STUDENT_SHEET_NAME);
    if (!studentSheet) throw new Error('一括入力用シート「' + STUDENT_SHEET_NAME + '」が見つかりません。');
    const headerResult = ensureStudentSheetHeaders_(studentSheet, true);
    setConfigValueInSheet_(
      configSheet,
      STUDENT_SHEET_URL_CONFIG_KEY,
      spreadsheet.getUrl(),
      STUDENT_SHEET_URL_CONFIG_DESCRIPTION
    );
    if (configRow) {
      configRow.value = spreadsheet.getUrl();
      configRow.cells[1] = spreadsheet.getUrl();
      configRow.description = STUDENT_SHEET_URL_CONFIG_DESCRIPTION;
      configRow.cells[2] = STUDENT_SHEET_URL_CONFIG_DESCRIPTION;
    } else {
      rows.push({
        rowNumber: configSheet.getLastRow(),
        key: STUDENT_SHEET_URL_CONFIG_KEY,
        value: spreadsheet.getUrl(),
        description: STUDENT_SHEET_URL_CONFIG_DESCRIPTION,
        cells: [STUDENT_SHEET_URL_CONFIG_KEY, spreadsheet.getUrl(), STUDENT_SHEET_URL_CONFIG_DESCRIPTION]
      });
    }
    return { repaired: true, repairedHeaders: headerResult.repaired };
  } catch (e) {
    return { repaired: false, warning: e.message };
  }
}

function createStudentSheetFromMenu() {
  let container = null;
  let officialId = '';
  let lock = null;
  try {
    container = getSpreadsheetMenuContainer_();
    lock = acquireLock_();
    let result;
    try {
      officialId = getStudentSheetId_();
      if (officialId) {
        const existing = getStudentSheetContext_({ repairHeaders: true });
        result = {
          success: true,
          alreadyExists: true,
          id: existing.id,
          url: existing.url,
          dropdownUpdated: false,
          warning: ''
        };
      } else {
        result = createStudentSheet_();
      }
    } finally {
      lock.releaseLock();
      lock = null;
    }

    // フォルダ同期が同じスクリプトロックを使うため、参照保存後に解放してから更新する。
    const dropdownResult = updateStudentSheetDropdowns_();
    const warning = dropdownResult.success
      ? ''
      : '入力規則は更新できませんでした: ' + dropdownResult.error;
    result.dropdownUpdated = !!dropdownResult.success;
    result.warning = warning;

    if (result.alreadyExists) {
      container.toast(
        '一括入力用スプシは作成済みです。正式IDとconfig URLを確認しました。' + (warning ? ' ' + warning : ''),
        '一括入力用スプシ',
        warning ? 8 : 5
      );
    } else {
      container.toast(
        '一括入力用スプシを作成し、正式IDとconfig URLを保存しました。' +
          (warning ? ' ' + warning : ''),
        '一括入力用スプシ',
        warning ? 8 : 5
      );
    }
    return result;
  } catch (e) {
    if (lock) lock.releaseLock();
    console.error('createStudentSheetFromMenu エラー:', e.message);
    if (container) {
      container.toast(
        '一括入力用スプシの確認または作成に失敗しました: ' + e.message,
        '一括入力用スプシ',
        8
      );
    }
    return { success: false, alreadyExists: !!officialId, error: e.message };
  }
}

/**
 * 正式IDがない場合だけ呼ぶ一括入力用スプレッドシート作成の内部実装。
 *
 * @returns {{success:boolean,alreadyExists:boolean,id:string,url:string,dropdownUpdated:boolean,warning:string}}
 */
function createStudentSheet_() {
  if (getStudentSheetId_()) {
    throw new Error('一括入力用スプシはすでに正式IDで紐づけられています。');
  }
  const ss = SpreadsheetApp.create('一括入力用スプシ');
  // コンテナスプシと同じ親フォルダに移動
  const containerFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const parentFolder = containerFile.getParents().next();
  DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
  const sheet = ss.getActiveSheet();
  sheet.setName(STUDENT_SHEET_NAME);

  // ヘッダー設定
  sheet.getRange(1, 1, 1, STUDENT_SHEET_HEADERS.length)
    .setValues([STUDENT_SHEET_HEADERS])
    .setFontWeight('bold')
    .setBackground('#E8F0FE');

  sheet.setColumnWidth(1,  60);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 160);
  sheet.setColumnWidth(4, 280);
  sheet.setColumnWidth(5, 320);
  sheet.setColumnWidth(6, 220);
  sheet.setColumnWidth(7, 220);
  sheet.setColumnWidth(8,  80);
  sheet.setFrozenRows(1);

  const id  = ss.getId();
  const url = ss.getUrl();

  saveStudentSheetReference_(id, url);

  return {
    success: true,
    alreadyExists: false,
    id: id,
    url: url,
    dropdownUpdated: false,
    warning: ''
  };
}

/**
 * メニューから「入力規則を更新」を呼び出すためのラッパー。
 * 結果をtoastで表示する。
 */
function updateStudentSheetDropdownsFromMenu() {
  let container = null;
  try {
    container = getSpreadsheetMenuContainer_();
    const result = updateStudentSheetDropdowns_();
    if (result.success) {
      container.toast('一括入力用スプシの入力規則を更新しました。', '一括入力用スプシ', 5);
    } else {
      container.toast('更新に失敗しました: ' + result.error, '一括入力用スプシ', 8);
    }
    return result;
  } catch (e) {
    console.error('updateStudentSheetDropdownsFromMenu エラー:', e.message);
    if (container) container.toast('予期しないエラーが発生しました: ' + e.message, '一括入力用スプシ', 8);
    return { success: false, error: e.message };
  }
}


// ============================================================
//  一括入力用スプレッドシート連携
// ============================================================

/**
 *一括入力用スプレッドシートの B列・F列・G列に、
 * config シートの画像名一覧を使ったプルダウン入力規則をセットする。
 *
 * @param {{ __editToken?: string }} payload
 * @returns {{ success: boolean, error?: string }}
 */
function updateStudentSheetDropdowns(payload) {
  assertEditToken_(payload);
  return updateStudentSheetDropdowns_();
}

/**
 * 一括入力用スプレッドシートの入力規則更新の内部実装。
 *
 * @returns {{ success: boolean, error?: string }}
 */
function updateStudentSheetDropdowns_() {
  try {
    // 1. 正式IDから外部シートを開き、URLと空ヘッダーを修復する
    const studentContext = getStudentSheetContext_({ repairHeaders: true });
    const studentSheet = studentContext.sheet;

    // 2. config から画像フォルダIDを取得
    const appConfig  = getAppConfig_();
    const folderUrl  = appConfig['IMAGE_DRIVE_URL'] || '';
    const folderId   = extractDriveFolderId_(folderUrl);
    if (!folderId) {
      return { success: false, error: 'config シートの IMAGE_DRIVE_URL にフォルダURLが設定されていません。' };
    }

    // 3. フォルダ内の画像名リストを取得
    const folderResult = getConfigFromFolder_(folderId, { rootFolderId: folderId });
    if (folderResult.error) return { success: false, error: folderResult.error };

    const imageNames = folderResult.images
      .filter(function(item) { return item.type !== 'folder' && item.name; })
      .map(function(item) { return item.name; });

    if (imageNames.length === 0) {
      return { success: false, error: 'フォルダ内に画像が見つかりません。' };
    }

    // 4. 入力規則を作成
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(imageNames, true)
      .build();

    // 5. B列 / F列 / G列 の 2行目以降に適用（最低100行確保）
    const applyRows = Math.max(studentSheet.getMaxRows() - 1, 100);
    studentSheet.getRange(2, 2, applyRows, 1).setDataValidation(rule); // B列
    studentSheet.getRange(2, 6, applyRows, 1).setDataValidation(rule); // F列
    studentSheet.getRange(2, 7, applyRows, 1).setDataValidation(rule); // G列

    return { success: true };

  } catch (e) {
    console.error('updateStudentSheetDropdowns エラー:', e.message);
    return { success: false, error: e.message };
  }
}


/**
 * 一括入力用スプレッドシートの未処理行（H列が「済」でない行）を読み込み、
 * info シートに一括追記する。追記後、対象行の H列を「済」に更新する。
 *
 * @param {{ __editToken?: string }} payload
 * @returns {{ success: boolean, count: number, error?: string }}
 */
function bulkImportStudentSheet(payload) {
  assertEditToken_(payload);
  return importDataFromStudentSheet_();
}

/**
 * スプレッドシートメニューから一括入力データを取り込む。
 */
function bulkImportStudentSheetFromMenu() {
  let container = null;
  try {
    container = getSpreadsheetMenuContainer_();
    const result = importDataFromStudentSheet_();
    if (result.success) {
      const skippedMessage = Number(result.skipped || 0) > 0
        ? ' ' + String(result.skipped) + '件は参照先・同名重複・ラベルを確認するため未処理のまま残しました。'
        : '';
      container.toast(
        String(result.count || 0) + '件の入力データを取り込みました。' + skippedMessage,
        '一括入力データ',
        skippedMessage ? 8 : 5
      );
    } else {
      container.toast('取り込みに失敗しました: ' + result.error, '一括入力データ', 8);
    }
    return result;
  } catch (e) {
    console.error('bulkImportStudentSheetFromMenu エラー:', e.message);
    if (container) container.toast('予期しないエラーが発生しました: ' + e.message, '一括入力データ', 8);
    return { success: false, count: 0, error: e.message };
  }
}

/**
 * 旧UI呼び出し名との互換用。編集トークンは必須。
 *
 * @param {{ __editToken?: string }} payload
 * @returns {{ success: boolean, count: number, error?: string }}
 */
function importDataFromStudentSheet(payload) {
  assertEditToken_(payload);
  return importDataFromStudentSheet_();
}

/**
 * 一括入力用スプレッドシート取り込みの内部実装。
 *
 * @returns {{ success: boolean, count: number, error?: string }}
 */
function importDataFromStudentSheet_() {
  const lock = acquireLock_();
  try {
    // 1. 正式IDから外部シートを開き、URLと空ヘッダーを修復する
    const studentContext = getStudentSheetContext_({ repairHeaders: true });
    const studentSheet = studentContext.sheet;

    // 2. config から画像名→IDのマッピング辞書を作成
    const appConfig  = getAppConfig_();
    const folderUrl  = appConfig['IMAGE_DRIVE_URL'] || '';
    const folderId   = extractDriveFolderId_(folderUrl);
    if (!folderId) {
      return { success: false, count: 0, error: 'config シートの IMAGE_DRIVE_URL にフォルダURLが設定されていません。' };
    }

    const folderResult = getConfigFromFolder_(folderId, {
      rootFolderId: folderId,
      lockAlreadyHeld: true
    });
    if (folderResult.error) return { success: false, count: 0, error: folderResult.error };

    /** @type {{ [name: string]: Array<string> }} */
    const nameToIds = {};
    folderResult.images
      .filter(function(item) { return item.type !== 'folder' && item.name; })
      .forEach(function(item) {
        const name = String(item.name || '').trim();
        if (!nameToIds[name]) nameToIds[name] = [];
        if (nameToIds[name].indexOf(String(item.id || '')) === -1) {
          nameToIds[name].push(String(item.id || ''));
        }
      });
    const resolveUniqueImageId = function(name) {
      const ids = nameToIds[String(name || '').trim()] || [];
      return ids.length === 1 ? ids[0] : '';
    };

    const lastRow = studentSheet.getLastRow();
    if (lastRow <= 1) return { success: true, count: 0 };

    // 3. A〜H列を一括取得
    const data = studentSheet.getRange(2, 1, lastRow - 1, 8).getValues();

    // 4. info シートを準備
    const ss        = SpreadsheetApp.getActiveSpreadsheet();
    let   infoSheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!infoSheet) {
      infoSheet = ss.insertSheet(INFO_SHEET_NAME);
      applyInfoSheetSchema_(infoSheet);
    } else {
      ensureInfoSheetSchema_(infoSheet);
    }

    const now        = new Date();
    const infoRows   = [];
    const targetIdxs = []; // 処理対象行の 0-based インデックス
    const skippedRows = [];

    // 5. フィルタリング＆info行配列の構築
    data.forEach(function(row, i) {
      const sceneName = String(row[1] || '').trim(); // B列: 対象シーン
      const status    = String(row[7] || '').trim(); // H列: 状態

      if (!sceneName || status === '済') return;

      const sceneId   = resolveUniqueImageId(sceneName);
      const label     = String(row[2] || '').trim();              // C列: ラベル
      const desc      = String(row[3] || '').trim();              // D列: 説明
      const linkUrl   = normalizeLinkUrl_(row[4]);                // E列: リンクURL
      const photoName = String(row[5] || '').trim();              // F列: 写真
      const jumpName  = String(row[6] || '').trim();              // G列: ジャンプ先
      const photoId   = photoName ? resolveUniqueImageId(photoName) : '';
      const jumpId    = jumpName  ? resolveUniqueImageId(jumpName) : '';

      const invalidReferences = !sceneId ||
        (photoName && !photoId) ||
        (jumpName && !jumpId);
      if (invalidReferences || (!label && !jumpId)) {
        skippedRows.push(i + 2);
        return;
      }

      infoRows.push([
        Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss'),
        sceneId,
        label,
        desc,
        linkUrl,
        0,                    // Pitch
        0,                    // Yaw
        DEFAULT_MARKER_SHAPE,
        DEFAULT_MARKER_COLOR,
        DEFAULT_MARKER_ICON,
        photoId,
        jumpId,
        Utilities.getUuid(),
        ''
      ]);
      targetIdxs.push(i);
    });

    if (infoRows.length === 0) {
      return {
        success: true,
        count: 0,
        skipped: skippedRows.length,
        warnings: skippedRows.length > 0
          ? ['参照先が存在しない、同名で曖昧、または通常ラベルが空の行を未処理のまま残しました: ' + skippedRows.join(', ')]
          : []
      };
    }

    // 6. info シート末尾に一括追記
    const insertRow = infoSheet.getLastRow() + 1;
    infoSheet.getRange(insertRow, 1, infoRows.length, INFO_HEADERS.length).setValues(infoRows);

    // 7. 外部シートのH列（状態）を「済」に一括更新
    //    既存の状態値を保持しつつ対象行のみ上書きする
    const statusCol = data.map(function(row) { return [String(row[7] || '')]; });
    targetIdxs.forEach(function(i) { statusCol[i] = ['済']; });
    studentSheet.getRange(2, 8, data.length, 1).setValues(statusCol);

    return {
      success: true,
      count: infoRows.length,
      skipped: skippedRows.length,
      warnings: skippedRows.length > 0
        ? ['参照先が存在しない、同名で曖昧、または通常ラベルが空の行を未処理のまま残しました: ' + skippedRows.join(', ')]
        : []
    };

  } catch (e) {
    console.error('importDataFromStudentSheet エラー:', e.message);
    return { success: false, count: 0, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
