// ============================================================
//  360° ビューア — Google Apps Script バックエンド
//  コンテナバインド型スプレッドシート対応
// ============================================================

/** 設定シート名 */
const CONFIG_SHEET_NAME = 'config';
const IMAGE_DRIVE_URL_CONFIG_KEY = 'IMAGE_DRIVE_URL';
const WEB_APP_URL_CONFIG_KEY = 'WEB_APP_URL';
const WEB_APP_URL_CONFIG_DESCRIPTION = 'デプロイ済みWebアプリの /exec URL。編集URL・共有URL・QR生成に使います。';
const EDIT_KEY_CONFIG_KEY = 'EDIT_KEY';
const EDIT_KEY_CONFIG_DESCRIPTION = '編集URL用の共有キー。編集URLを知っている人は共同編集できます。';

/** ホットスポット保存シート名 */
const INFO_SHEET_NAME = 'info';
const INFO_HEADERS = ['保存日時', '画像ID', 'ラベル', '説明', 'リンクURL', 'Pitch', 'Yaw', '形状', '色', 'アイコン', '写真ID', 'ジャンプ先ID', 'ID'];
const DEFAULT_MARKER_SHAPE = 'circle';
const DEFAULT_MARKER_COLOR = 'blue';
const DEFAULT_MARKER_ICON = 'info';
const ALLOWED_MARKER_SHAPES = ['circle', 'square', 'diamond', 'star'];
const ALLOWED_MARKER_COLORS = ['blue', 'green', 'orange', 'purple', 'white', 'gray', 'yellow', 'red'];
const ALLOWED_MARKER_ICONS = ['info', 'photo', 'wifi', 'quiz'];

/** ID列のインデックス（0-based） */
const ID_COL_INDEX = 12;

/** 一括入力用スプレッドシートIDの PropertiesService キー */
const STUDENT_SHEET_ID_KEY = 'STUDENT_SHEET_ID';

/** 一括入力用スプレッドシートのシート名 */
const STUDENT_SHEET_NAME = 'シート1';

/** LockService のタイムアウト（ミリ秒） */
const LOCK_TIMEOUT_MS = 15000;

/** 編集画面だけが保持する一時トークンの有効期間（6時間） */
const EDIT_TOKEN_TTL_SECONDS = 6 * 60 * 60;
const EDIT_TOKEN_CACHE_PREFIX = 'EDIT_TOKEN_';
const FOLDER_LIST_CACHE_TTL_SECONDS = 300;
const FOLDER_LIST_CACHE_PREFIX = 'FOLDER_LIST_';


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
  if (cached !== '1') {
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
  sheet.getRange(1, 1, 1, 3)
    .setValues([['設定項目', '値', '説明']])
    .setFontWeight('bold')
    .setBackground('#E8F0FE');

  if (findConfigRow_(sheet, IMAGE_DRIVE_URL_CONFIG_KEY) === 0) {
    sheet.appendRow([
      IMAGE_DRIVE_URL_CONFIG_KEY,
      '',
      '360度画像のGoogleドライブURL（単一ファイルまたはフォルダ）。' +
      '共有設定を「リンクを知っている全員が閲覧可」にしてください。'
    ]);
  }

  if (findConfigRow_(sheet, WEB_APP_URL_CONFIG_KEY) === 0) {
    sheet.appendRow([WEB_APP_URL_CONFIG_KEY, '', WEB_APP_URL_CONFIG_DESCRIPTION]);
  }

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 420);
  sheet.setColumnWidth(3, 420);
  sheet.setFrozenRows(1);
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
 * config シートの値を設定する。
 *
 * @param {string} key
 * @param {string} value
 * @param {string} description
 */
function setConfigValue_(key, value, description) {
  const sheet = getOrCreateConfigSheet_();
  const row = findConfigRow_(sheet, key);
  if (row) {
    sheet.getRange(row, 2).setValue(value);
    if (description) sheet.getRange(row, 3).setValue(description);
    return;
  }
  sheet.appendRow([key, value, description || '']);
}

/**
 * config シートに WEB_APP_URL 行を用意する。既存値は上書きしない。
 */
function ensureWebAppUrlConfig_() {
  const sheet = getOrCreateConfigSheet_();
  const row = findConfigRow_(sheet, WEB_APP_URL_CONFIG_KEY);
  if (!row) {
    sheet.appendRow([WEB_APP_URL_CONFIG_KEY, '', WEB_APP_URL_CONFIG_DESCRIPTION]);
    return { created: true };
  }

  const rowValues = sheet.getRange(row, 1, 1, 3).getValues()[0];
  if (!String(rowValues[2] || '').trim()) {
    sheet.getRange(row, 3).setValue(WEB_APP_URL_CONFIG_DESCRIPTION);
  }
  return { created: false };
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

  return url;
}

/**
 * ScriptApp が返すWebアプリURLを取得する。取得不可の場合は空文字。
 *
 * @returns {string}
 */
function getScriptWebAppUrl_() {
  try {
    return normalizeWebAppUrl_(ScriptApp.getService().getUrl() || '');
  } catch (e) {
    return '';
  }
}

/**
 * WebアプリURLと取得元を返す。
 *
 * @returns {{ url: string, source: string }}
 */
function getConfiguredWebAppUrlDetails_() {
  try {
    const config = getAppConfig_();
    const configuredUrl = normalizeWebAppUrl_(config[WEB_APP_URL_CONFIG_KEY] || '');
    if (configuredUrl) return { url: configuredUrl, source: 'config' };
  } catch (e) {
    // fallback below
  }

  const fallbackUrl = getScriptWebAppUrl_();
  return { url: fallbackUrl, source: fallbackUrl ? 'script' : '' };
}

/**
 * 編集URL・共有URL生成で使うWebアプリURLを返す。
 * 優先順位: config シートの WEB_APP_URL → ScriptApp.getService().getUrl() → 空文字。
 *
 * @returns {string}
 */
function getConfiguredWebAppUrl_() {
  return getConfiguredWebAppUrlDetails_().url;
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
 * フォルダ一覧キャッシュを削除する。失敗しても編集処理は止めない。
 *
 * @param {string} folderId
 */
function invalidateFolderListCache_(folderId) {
  if (!folderId) return;
  try {
    CacheService.getScriptCache().remove(getFolderListCacheKey_(folderId));
  } catch (e) {
    // ignore
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
 * @returns {{ key: string, created: boolean, generated: boolean }}
 */
function ensureEditKeyConfig_() {
  const sheet = getOrCreateConfigSheet_();
  const row = findConfigRow_(sheet, EDIT_KEY_CONFIG_KEY);
  if (!row) {
    const newKey = generateEditKey_();
    sheet.appendRow([EDIT_KEY_CONFIG_KEY, newKey, EDIT_KEY_CONFIG_DESCRIPTION]);
    return { key: newKey, created: true, generated: true };
  }

  const rowValues = sheet.getRange(row, 1, 1, 3).getValues()[0];
  const currentKey = String(rowValues[1] || '').trim();
  if (currentKey) {
    if (!String(rowValues[2] || '').trim()) {
      sheet.getRange(row, 3).setValue(EDIT_KEY_CONFIG_DESCRIPTION);
    }
    return { key: currentKey, created: false, generated: false };
  }

  const generatedKey = generateEditKey_();
  sheet.getRange(row, 2).setValue(generatedKey);
  if (!String(rowValues[2] || '').trim()) {
    sheet.getRange(row, 3).setValue(EDIT_KEY_CONFIG_DESCRIPTION);
  }
  return { key: generatedKey, created: false, generated: true };
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

/**
 * 編集URL用の共有キーを返す。
 * 優先順位: ScriptProperties の EDIT_KEY → config シートの EDIT_KEY → 空文字。
 *
 * @returns {string}
 */
function getConfiguredEditKey_() {
  const scriptKey = getScriptEditKey_();
  if (scriptKey) return scriptKey;

  try {
    const config = getAppConfig_();
    return String(config[EDIT_KEY_CONFIG_KEY] || '').trim();
  } catch (e) {
    return '';
  }
}

/**
 * HTMLダイアログに埋め込む文字列をエスケープする。
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtmlForDialog_(value) {
  return String(value || '').replace(/[&<>"']/g, function(ch) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch];
  });
}

/**
 * config シートから northOffset のキャッシュを取得する。
 *
 * @param {string} fileId
 * @returns {{ cached: boolean, value: number|null }}
 */
function getCachedNorthOffset_(fileId) {
  if (!fileId) return { cached: false, value: null };
  const config = getAppConfig_();
  const key = 'NORTH_' + fileId;
  const val = config[key];
  if (val === undefined || val === '') return { cached: false, value: null };
  if (val === 'NONE') return { cached: true, value: null };
  const num = parseFloat(val);
  return { cached: true, value: isNaN(num) ? null : num };
}

/**
 * config シートに northOffset のキャッシュを保存する。
 * XMP情報がなかった場合は 'NONE' を保存して再取得を防ぐ。
 *
 * @param {string} fileId
 * @param {number|null} northOffset
 */
function setCachedNorthOffset_(fileId, northOffset) {
  if (!fileId) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) return;

  const key = 'NORTH_' + fileId;
  const value = northOffset != null ? String(northOffset) : 'NONE';

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]).trim() === key) {
        sheet.getRange(i + 2, 2).setValue(value);
        return;
      }
    }
  }
  sheet.appendRow([key, value, 'northOffset キャッシュ（自動生成）']);
}


// ============================================================
//  スプレッドシートメニュー（onOpen トリガー）
// ============================================================

/**
 * スプレッドシートを開いたときにカスタムメニューを追加する。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('初期設定')
    .addItem('初期設定シートを生成', 'setupSheets')
    .addItem('WebアプリURLを設定', 'setWebAppUrl')
    .addItem('編集URLを表示', 'showEditUrl')
    .addItem('編集キーを再生成', 'regenerateEditKey')
    .addSeparator()
    .addItem('一括入力用スプシを新規作成・紐づけ', 'createStudentSheetFromMenu')
    .addItem('一括入力用スプシの入力規則を更新', 'updateStudentSheetDropdownsFromMenu')
    .addItem('紐づき中のスプシIDを確認', 'showLinkedStudentSheetId')
    .addToUi();
}


// ============================================================
//  初期設定シート生成
// ============================================================

/**
 * 「config」シートと「info」シートを生成し、ヘッダーと初期値を設定する。
 * 既存シートの値は保持し、EDIT_KEY がなければ追加・生成する。
 */
function setupSheets() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const ui   = SpreadsheetApp.getUi();
  const msgs = [];

  // ---- config シート ----
  let configSheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!configSheet) {
    configSheet = ss.insertSheet(CONFIG_SHEET_NAME);
    initializeConfigSheet_(configSheet);

    msgs.push('✅ 「config」シートを作成しました。');
  } else {
    msgs.push('⚠️ 「config」シートは既に存在します（既存設定は保持します）。');
  }
  const editKeyResult = ensureEditKeyConfig_();
  const webAppUrlResult = ensureWebAppUrlConfig_();
  if (editKeyResult.generated) {
    msgs.push('✅ config シートに EDIT_KEY を自動生成しました。');
  } else {
    msgs.push('ℹ️ config シートの EDIT_KEY は既存値を使います。');
  }
  if (webAppUrlResult.created) {
    msgs.push('✅ config シートに WEB_APP_URL 行を追加しました。');
  } else {
    msgs.push('ℹ️ config シートの WEB_APP_URL は既存値を使います。');
  }

  // ---- info シート ----
  let infoSheet = ss.getSheetByName(INFO_SHEET_NAME);
  if (!infoSheet) {
    infoSheet = ss.insertSheet(INFO_SHEET_NAME);

    applyInfoSheetSchema_(infoSheet);

    msgs.push('✅ 「info」シートを作成しました。');
  } else {
    msgs.push('⚠️ 「info」シートは既に存在します（変更しませんでした）。');
  }

  ui.alert(
    '初期設定',
    msgs.join('\n') + '\n\n' +
    '次のステップ:\n' +
    '① 「config」シートの B2 セルに画像のGoogleドライブURLを入力してください。\n' +
    '② ホットスポットは「info」シートに自動保存されます。',
    ui.ButtonSet.OK
  );
}

/**
 * スプレッドシートメニューから編集URLを表示する。
 */
function showEditUrl() {
  const ui = SpreadsheetApp.getUi();
  ensureWebAppUrlConfig_();
  const editKeyResult = ensureEditKeyConfig_();
  const editKey = getConfiguredEditKey_() || editKeyResult.key;
  const webAppUrl = getConfiguredWebAppUrlDetails_();
  const execUrl = getConfiguredWebAppUrl_();

  if (!execUrl) {
    ui.alert(
      '編集URL',
      'WebアプリURLを取得できませんでした。先にWebアプリとしてデプロイしてください。\n' +
      'デプロイ後にもう一度「編集URLを表示」を実行してください。',
      ui.ButtonSet.OK
    );
    return;
  }

  const separator = execUrl.indexOf('?') === -1 ? '?' : '&';
  const editUrl = execUrl + separator + 'mode=edit&editKey=' + encodeURIComponent(editKey);
  const fallbackNote = webAppUrl.source === 'script'
    ? '<p style="font-size:12px;color:#71717A;">WEB_APP_URL が未設定のため、Apps Script が返したURLを使用しています。<br>' +
      'URLが正しくない場合は、configシートの WEB_APP_URL にデプロイ済みWebアプリURLを貼り付けてください。</p>'
    : '';
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:16px;line-height:1.6;">' +
      '<p style="margin:0 0 8px;font-weight:bold;">編集URL:</p>' +
      '<textarea readonly style="box-sizing:border-box;width:100%;height:92px;font-size:13px;">' +
        escapeHtmlForDialog_(editUrl) +
      '</textarea>' +
      '<p>この編集URLは configシートの EDIT_KEY と WEB_APP_URL から生成しています。</p>' +
      '<p>このURLをClassroomなどで共同編集者に共有してください。</p>' +
      '<p>EDIT_KEYを変更しない限り、同じ編集URLを継続して使えます。</p>' +
      '<p>URLが実際のデプロイURLと異なる場合は、configシートの WEB_APP_URL を確認してください。</p>' +
      '<p>開きっぱなしで編集できなくなった場合は、このURLを再読み込みしてください。</p>' +
      fallbackNote +
    '</div>'
  ).setWidth(620).setHeight(300);

  ui.showModalDialog(html, '編集URLを表示');
}

/**
 * スプレッドシートメニューから WEB_APP_URL を設定する。
 */
function setWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  ensureWebAppUrlConfig_();

  const response = ui.prompt(
    'WebアプリURLを設定',
    'デプロイ済みWebアプリの /exec URL を貼り付けてください。\n' +
    '例:\n' +
    'https://script.google.com/a/macros/e.osakamanabi.jp/s/xxxxx/exec',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const url = normalizeWebAppUrl_(response.getResponseText());
  if (!url) {
    ui.alert('WebアプリURL', 'URLが入力されていません。', ui.ButtonSet.OK);
    return;
  }

  setConfigValue_(WEB_APP_URL_CONFIG_KEY, url, WEB_APP_URL_CONFIG_DESCRIPTION);
  ui.alert(
    'WebアプリURL',
    'WEB_APP_URL を保存しました。「編集URLを表示」から編集URLを確認してください。',
    ui.ButtonSet.OK
  );
}

/**
 * config シートの EDIT_KEY を再生成する。
 */
function regenerateEditKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '編集キーを再生成',
    '編集キーを再生成すると、これまで共有した編集URLは使えなくなります。続行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  const newKey = generateEditKey_();
  setConfigValue_(EDIT_KEY_CONFIG_KEY, newKey, EDIT_KEY_CONFIG_DESCRIPTION);

  let updatedScriptProperty = false;
  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    const currentScriptKey = String(scriptProperties.getProperty(EDIT_KEY_CONFIG_KEY) || '').trim();
    if (currentScriptKey) {
      scriptProperties.setProperty(EDIT_KEY_CONFIG_KEY, newKey);
      updatedScriptProperty = true;
    }
  } catch (e) {
    updatedScriptProperty = false;
  }

  ui.alert(
    '編集キーを再生成しました',
    'config シートの EDIT_KEY を新しい値に変更しました。\n' +
    (updatedScriptProperty ? '既存のスクリプト プロパティ EDIT_KEY も同じ値に更新しました。\n' : '') +
    '新しい編集URLは「編集URLを表示」から確認してください。',
    ui.ButtonSet.OK
  );
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

  template.editToken = '';
  const configuredEditKey = getConfiguredEditKey_();

  if (mode === 'edit' && configuredEditKey && requestedEditKey === configuredEditKey) {
    const editToken = Utilities.getUuid();
    CacheService.getScriptCache().put(getEditTokenCacheKey_(editToken), '1', EDIT_TOKEN_TTL_SECONDS);
    template.editToken = editToken;
  }

  return template
    .evaluate()
    .setTitle('360°Viewer - Hemisphere')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTML テンプレートで <?!= include('filename') ?> を使って
 * 別ファイルの内容を埋め込むためのヘルパー。
 *
 * @param {string} filename 拡張子なしのファイル名
 * @returns {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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
 * @returns {{ imageUrl?: string, fileId?: string, imageName?: string, images?: Array<{id:string,name:string}>, error?: string }}
 */
function getConfig(mode) {
  var execUrl = getConfiguredWebAppUrl_();

  const appConfig     = getAppConfig_();
  const imageDriveUrl = appConfig['IMAGE_DRIVE_URL'] || '';

  // URL未設定 → デモ画像
  if (!imageDriveUrl) {
    return { imageUrl: 'https://pannellum.org/images/alma.jpg', execUrl: execUrl };
  }

  const folderId = extractDriveFolderId_(imageDriveUrl);
  if (folderId) {
    const result = getConfigFromFolder_(folderId);
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
 * @returns {{ images: Array<{id:string,name:string,imageUrl:string}>, error?: string }}
 */
function getConfigFromFolder_(folderId) {
  try {
    const cached = getCachedFolderList_(folderId);
    if (cached) return cached;

    const folder = DriveApp.getFolderById(folderId);
    const items  = [];
    const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    // サブフォルダを列挙（type: 'folder' として先頭に追加）
    const subfolders = folder.getFolders();
    while (subfolders.hasNext()) {
      const sf = subfolders.next();
      items.push({
        id:       sf.getId(),
        name:     sf.getName(),
        type:     'folder'
      });
    }
    items.sort(function(a, b) { return a.name.localeCompare(b.name, 'ja'); });

    // 画像ファイルを列挙（northOffset は各シーン読み込み時に取得するため null）
    const imageItems = [];
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (IMAGE_MIME_TYPES.indexOf(file.getMimeType()) === -1) continue;
      var fileName = file.getName();
      imageItems.push({
        id:          file.getId(),
        name:        fileName,
        type:        'image',
        northOffset: null,
        isHome:      fileName.indexOf('[HOME]') !== -1
      });
    }
    imageItems.sort(function(a, b) { return a.name.localeCompare(b.name, 'ja'); });

    // フォルダ → 画像の順に結合
    const merged = items.concat(imageItems);
    const result = { images: merged };
    setCachedFolderList_(folderId, result);
    return result;

  } catch (e) {
    console.error('フォルダ取得エラー:', e.message);
    return { error: 'フォルダへのアクセスに失敗しました。フォルダIDまたは権限を確認してください。' };
  }
}

/**
 * 指定フォルダの中身（サブフォルダ＋画像）をクライアントから取得するための公開ラッパー。
 * サイドバーでサブフォルダをクリックしたとき等に呼ばれる。
 *
 * @param {string} folderId Google Drive フォルダID
 * @returns {{ images: Array, error?: string }}
 */
function navigateToFolder(folderId) {
  if (!folderId) return { error: 'フォルダIDが指定されていません。' };
  return getConfigFromFolder_(folderId);
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
 * 指定したファイルIDの画像URLを返す（遅延読み込み用）。
 * フォルダモードでシーン切替時にクライアントから呼ばれる。
 *
 * @param {string} fileId Google Drive ファイルID
 * @param {string} [mode] 'public' の場合は Base64 Data URI を返す。それ以外は lh3 直リンクを返す。
 * @returns {{ success: boolean, imageUrl?: string, error?: string }}
 */
function getImageDataUri(fileId, mode) {
  try {
    if (!fileId) return { success: false, error: 'ファイルIDが指定されていません。' };
    const file = DriveApp.getFileById(fileId);
    if (mode === 'public') {
      return { success: true, imageUrl: fileToDataUri_(file) };
    }
    return { success: true, imageUrl: 'https://lh3.googleusercontent.com/d/' + fileId + '=s0' };
  } catch (e) {
    console.error('getImageDataUri エラー:', e.message);
    return { success: false, error: '画像の取得に失敗しました。' };
  }
}

/**
 * ホットスポットに紐付けられた写真ファイルを Base64 Data URI として返す。
 *
 * @param {string} photoId Google Drive ファイルID
 * @returns {{ success: boolean, dataUri?: string, error?: string }}
 */
function getHotspotPhotoDataUri(photoId) {
  try {
    if (!photoId) return { success: false, error: 'ファイルIDが指定されていません。' };
    DriveApp.getFileById(photoId); // アクセス権チェックのみ
    return { success: true, dataUri: 'https://lh3.googleusercontent.com/d/' + photoId };
  } catch (e) {
    console.error('getHotspotPhotoDataUri エラー:', e.message);
    return { success: false, error: '写真の取得に失敗しました。' };
  }
}

/**
 * 指定した画像ファイルの名前を変更する。
 *
 * @param {string} fileId Google Drive ファイルID
 * @param {string} newName 新しいファイル名
 * @returns {{ success: boolean, name?: string, error?: string }}
 */
function renameImageFile(payload, newName) {
  assertEditToken_(payload);
  try {
    const fileId = payload && typeof payload === 'object' ? payload.fileId : payload;
    newName = payload && typeof payload === 'object' ? payload.newName : newName;
    const trimmedName = String(newName || '').trim();
    if (!fileId) return { success: false, error: 'ファイルIDが指定されていません。' };
    if (!trimmedName) return { success: false, error: '新しい名前が空です。' };

    const file = DriveApp.getFileById(fileId);
    file.setName(trimmedName);
    invalidateContainingFolderListCache_(file);

    return { success: true, name: file.getName() };
  } catch (e) {
    console.error('renameImageFile エラー:', e.message);
    return { success: false, error: '名前の変更に失敗しました。' };
  }
}

/**
 * 指定した画像ファイルのプロパティを返す。
 *
 * @param {string} fileId Google Drive ファイルID
 * @returns {{ success: boolean, properties?: Object, error?: string }}
 */
function getImageFileProperties(fileId) {
  try {
    if (!fileId) return { success: false, error: 'ファイルIDが指定されていません。' };

    const file = DriveApp.getFileById(fileId);

    // JPEG の場合は XMP から方位情報を抽出してマージする
    var northOffset = null;
    if (file.getMimeType() === 'image/jpeg') {
      try {
        northOffset = extractHeadingFromBlob_(file.getBlob());
      } catch (headingErr) {
        console.warn('northOffset 取得スキップ (properties):', headingErr.message);
      }
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

/**
 * 指定した画像ファイルを削除（ゴミ箱移動）し、関連ホットスポットを一括削除する。
 *
 * @param {string} fileId Google Drive ファイルID
 * @returns {{ success: boolean, deletedHotspots?: number, error?: string }}
 */
function deleteImageFile(payload) {
  assertEditToken_(payload);
  const lock = acquireLock_();
  try {
    const fileId = payload && typeof payload === 'object' ? payload.fileId : payload;
    const targetId = String(fileId || '').trim();
    if (!targetId) return { success: false, error: 'ファイルIDが指定されていません。' };

    const file = DriveApp.getFileById(targetId);
    invalidateContainingFolderListCache_(file);
    file.setTrashed(true);

    let deletedHotspots = 0;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (sheet) {
      migrateSheetIfNeeded_(sheet);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const data = sheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues();
        const keep = data.filter(function(row) { return String(row[1]) !== targetId; });
        deletedHotspots = data.length - keep.length;
        if (deletedHotspots > 0) {
          sheet.getRange(2, 1, data.length, INFO_HEADERS.length).clearContent();
          if (keep.length > 0) {
            sheet.getRange(2, 1, keep.length, INFO_HEADERS.length).setValues(keep);
          }
        }
      }
    }

    return { success: true, deletedHotspots: deletedHotspots };
  } catch (e) {
    console.error('deleteImageFile エラー:', e.message);
    return { success: false, error: '写真の削除に失敗しました。' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * スプレッドシートに保存されている指定画像のホットスポットを返す。
 * シートが存在しない場合は空配列を返す。
 * 公開ビューからも呼ばれるため、シート更新やDrive変更は行わない。
 * northOffset は既存キャッシュを読むか、JPEGから一時的に抽出して返す。
 *
 * @param {string} fileId 取得対象の画像ファイルID
 * @returns {{ hotspots: Array, northOffset: number|null }}
 */
function loadHotspots(fileId) {
  var northOffset = null;
  if (fileId) {
    const cached = getCachedNorthOffset_(fileId);
    if (cached.cached) {
      northOffset = cached.value;
    } else {
      try {
        const file = DriveApp.getFileById(fileId);
        if (file.getMimeType() === 'image/jpeg') {
          northOffset = extractHeadingFromBlob_(file.getBlob());
        }
      } catch (metaErr) {
        console.warn('loadHotspots: northOffset 取得スキップ:', metaErr.message);
      }
    }
  }

  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!sheet) return { hotspots: [], northOffset: northOffset };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { hotspots: [], northOffset: northOffset };

    const data     = sheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues();
    const targetId = fileId || '';

    const hotspots = data
      .filter(function(row) {
        return row[2] !== '' && String(row[1]) === targetId;
      })
      .map(function(row) {
        return {
          id:          String(row[ID_COL_INDEX] || ''),
          label:       String(row[2]),
          description: String(row[3]),
          linkUrl:     normalizeLinkUrl_(row[4]),
          pitch:       Number(row[5]),
          yaw:         Number(row[6]),
          markerShape: normalizeMarkerShape_(row[7]),
          markerColor: normalizeMarkerColor_(row[8]),
          markerIcon:  normalizeMarkerIcon_(row[9]),
          photoId:     String(row[10] || ''),
          jumpSceneId: String(row[11] || '')
        };
      });

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
  try {
    if (!data || !data.label || data.label.trim() === '') {
      return { success: false, error: 'ラベルが空です。' };
    }
    if (data.pitch == null || data.yaw == null) {
      return { success: false, error: '座標データが不正です。' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(INFO_SHEET_NAME);
    const markerShape = normalizeMarkerShape_(data.markerShape);
    const markerColor = normalizeMarkerColor_(data.markerColor);
    const markerIcon = normalizeMarkerIcon_(data.markerIcon);
    const linkUrl = normalizeLinkUrl_(data.linkUrl);

    if (!sheet) {
      sheet = ss.insertSheet(INFO_SHEET_NAME);
      applyInfoSheetSchema_(sheet);
    } else {
      migrateSheetIfNeeded_(sheet);
    }

    const id = Utilities.getUuid();

    sheet.appendRow([
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss'),
      data.fileId       || '',
      data.label.trim(),
      (data.description || '').trim(),
      linkUrl,
      data.pitch,
      data.yaw,
      markerShape,
      markerColor,
      markerIcon,
      data.photoId     || '',
      data.jumpSceneId || '',
      id
    ]);

    return { success: true, id: id };

  } catch (e) {
    console.error('saveHotspot エラー:', e.message);
    return { success: false, error: e.message };
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
    if (payload && typeof payload === 'object') {
      hotspotId = String(payload.id || '');
    }
    if (!hotspotId) {
      return { success: false, error: 'ホットスポットIDが指定されていません。' };
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!sheet) return { success: false, error: 'シートが見つかりません。' };

    migrateSheetIfNeeded_(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: '削除対象が見つかりません。' };

    const data = sheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][ID_COL_INDEX]) === hotspotId) {
        sheet.deleteRow(i + 2);
        return { success: true };
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
  try {
    if (!data || !data.label || data.label.trim() === '') {
      return { success: false, error: 'ラベルが空です。' };
    }
    if (!hotspotId) {
      return { success: false, error: 'ホットスポットIDが不正です。' };
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INFO_SHEET_NAME);
    if (!sheet) return { success: false, error: 'シートが見つかりません。' };

    migrateSheetIfNeeded_(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, error: '更新対象が見つかりません。' };

    const allData = sheet.getRange(2, 1, lastRow - 1, INFO_HEADERS.length).getValues();
    let targetRowIndex = -1;
    for (let i = 0; i < allData.length; i++) {
      if (String(allData[i][ID_COL_INDEX]) === hotspotId) {
        targetRowIndex = i + 2;
        break;
      }
    }

    if (targetRowIndex < 0) {
      return { success: false, error: '更新対象が見つかりません。再読み込みしてください。' };
    }

    const markerShape = normalizeMarkerShape_(data.markerShape);
    const markerColor = normalizeMarkerColor_(data.markerColor);
    const markerIcon  = normalizeMarkerIcon_(data.markerIcon);
    const linkUrl     = normalizeLinkUrl_(data.linkUrl);

    sheet.getRange(targetRowIndex, 1, 1, INFO_HEADERS.length).setValues([[
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss'),
      data.fileId || '',
      data.label.trim(),
      (data.description || '').trim(),
      linkUrl,
      data.pitch,
      data.yaw,
      markerShape,
      markerColor,
      markerIcon,
      data.photoId     || '',
      data.jumpSceneId || '',
      hotspotId
    ]]);

    return { success: true };
  } catch (e) {
    console.error('updateHotspot エラー:', e.message);
    return { success: false, error: e.message };
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
  const currentColumns = sheet.getLastColumn();
  const targetColumns = INFO_HEADERS.length;

  // v2→v3: [保存日時,画像ID,ラベル,説明,Pitch,Yaw,形状,色,アイコン] に
  // 「リンクURL」列（5列目）を追加し、既存データを右へシフトする
  if (currentColumns === 9) {
    const headerRow = sheet.getRange(1, 1, 1, 9).getValues()[0].map(String);
    const looksLikeOldSchema =
      headerRow[0] === '保存日時' &&
      headerRow[1] === '画像ID' &&
      headerRow[2] === 'ラベル' &&
      headerRow[3] === '説明' &&
      headerRow[4] === 'Pitch' &&
      headerRow[8] === 'アイコン';
    if (looksLikeOldSchema) {
      sheet.insertColumnAfter(4); // 5列目に「リンクURL」用の空列を挿入
    }
  }

  if (currentColumns <= 5) {
    sheet.insertColumnAfter(1);

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

  if (sheet.getLastColumn() < targetColumns) {
    sheet.insertColumnsAfter(sheet.getLastColumn(), targetColumns - sheet.getLastColumn());
  }

  // ID列（13列目）が空の既存行に UUID を自動付与
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const idRange = sheet.getRange(2, targetColumns, lastRow - 1, 1);
    const idValues = idRange.getValues();
    let needsUpdate = false;
    for (let i = 0; i < idValues.length; i++) {
      if (!idValues[i][0]) {
        idValues[i][0] = Utilities.getUuid();
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      idRange.setValues(idValues);
    }
  }

  applyInfoSheetSchema_(sheet);
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
  sheet.setFrozenRows(1);
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
  return ALLOWED_MARKER_ICONS.indexOf(normalized) >= 0 ? normalized : DEFAULT_MARKER_ICON;
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
 * is2D が true の場合、ファイル名の先頭に "[2D] " を付与する。
 *
 * @param {{ base64?: string, dataUrl?: string, fileName?: string, mimeType?: string, is2D?: boolean }|string} payload
 * @param {string=} fileName
 * @param {string=} mimeType
 * @param {boolean=} is2D
 * @returns {{ success: boolean, file?: { id: string, name: string }, error?: string }}
 */
function uploadImageToDrive(payload, fileName, mimeType, is2D) {
  assertEditToken_(payload);
  try {
    const req = normalizeUploadPayload_(payload, fileName, mimeType, is2D);
    const config = getAppConfig_();
    const folderUrl = config['IMAGE_DRIVE_URL'] || '';
    if (!folderUrl) throw new Error('IMAGE_DRIVE_URL が設定されていません。config シートを確認してください。');

    const folderId = extractDriveFolderId_(folderUrl);
    if (!folderId) throw new Error('IMAGE_DRIVE_URL にはフォルダのURLを設定してください（ファイルURLは不可）。');

    // targetFolderId が指定されている場合はそのフォルダへ、なければルートフォルダへ
    const uploadFolderId = req.targetFolderId || folderId;
    const folder = DriveApp.getFolderById(uploadFolderId);

    // data URI プレフィックス（"data:image/jpeg;base64,"）を除去
    let base64Data = req.base64;
    const commaIdx = base64Data.indexOf(',');
    if (commaIdx !== -1) base64Data = base64Data.slice(commaIdx + 1);
    if (!base64Data) throw new Error('画像データが空です。');

    const finalName = req.is2D ? '[2D] ' + req.fileName : req.fileName;

    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      req.mimeType,
      finalName
    );

    const file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingErr) {
      console.warn('setSharing スキップ（権限制限の可能性）:', sharingErr.message);
    }
    invalidateFolderListCache_(folderId);
    invalidateFolderListCache_(uploadFolderId);

    return { success: true, file: { id: file.getId(), name: file.getName() } };
  } catch (e) {
    console.error('uploadImageToDrive エラー:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * uploadImageToDrive の入力ペイロードを正規化する。
 * JPEG 以外の画像形式（PNG, GIF, WebP）もそのまま受け入れる。
 *
 * @param {{ base64?: string, dataUrl?: string, fileName?: string, mimeType?: string, is2D?: boolean, targetFolderId?: string }|string|null|undefined} payload
 * @param {string=} fileName
 * @param {string=} mimeType
 * @param {boolean=} is2D
 * @returns {{ base64: string, fileName: string, mimeType: string, is2D: boolean, targetFolderId: string }}
 */
function normalizeUploadPayload_(payload, fileName, mimeType, is2D) {
  let base64 = '';
  let safeName = String(fileName || 'image.jpg');
  let safeMime = String(mimeType || 'image/jpeg');
  let safe2D = !!is2D;
  let targetFolderId = '';

  if (payload && typeof payload === 'object') {
    base64 = String(payload.base64 || payload.dataUrl || '');
    safeName = String(payload.fileName || safeName);
    safeMime = String(payload.mimeType || safeMime);
    safe2D = payload.is2D != null ? !!payload.is2D : safe2D;
    targetFolderId = String(payload.targetFolderId || '');
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
    targetFolderId: targetFolderId
  };
}


// ============================================================
//  一括入力用スプレッドシート管理
// ============================================================

/**
 * PropertiesService に保存された一括入力用スプシIDを返す。
 * 未設定の場合は空文字を返す。
 *
 * @returns {string}
 */
function getStudentSheetId_() {
  return PropertiesService.getScriptProperties().getProperty(STUDENT_SHEET_ID_KEY) || '';
}

function createStudentSheetFromMenu() {
  return createStudentSheet_();
}

/**
 * 一括入力用スプレッドシートを新規作成し、IDを PropertiesService に保存する。
 * 複数回実行した場合は最後に作成したスプシが紐づく。
 *
 * @param {{ __editToken?: string }} payload
 */
function createStudentSheet(payload) {
  assertEditToken_(payload);
  return createStudentSheet_();
}

/**
 * 一括入力用スプレッドシート作成の内部実装。
 * メニュー操作と編集画面APIから共用する。
 */
function createStudentSheet_() {
  const ui = SpreadsheetApp.getUi();
  try {
    const ss = SpreadsheetApp.create('一括入力用スプシ');
    // コンテナスプシと同じ親フォルダに移動
    const containerFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
    const parentFolder = containerFile.getParents().next();
    DriveApp.getFileById(ss.getId()).moveTo(parentFolder);
    const sheet = ss.getActiveSheet();
    sheet.setName(STUDENT_SHEET_NAME);

    // ヘッダー設定
    const headers = ['No', '対象シーン', 'ラベル', '説明', 'リンクURL', '写真', 'ジャンプ先', '状態'];
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
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

    // IDを保存（上書き）→ 最後に作成したスプシが常に紐づく
    PropertiesService.getScriptProperties().setProperty(STUDENT_SHEET_ID_KEY, id);

    // 作成直後に入力規則を自動適用（IMAGE_DRIVE_URL 未設定の場合はスキップ）
    let dropdownMsg = '';
    try {
      const ddResult = updateStudentSheetDropdowns_();
      if (ddResult.success) {
        dropdownMsg = '\n✅ 入力規則（プルダウン）を自動設定しました。';
      } else {
        dropdownMsg = '\n⚠️ 入力規則の自動設定をスキップしました: ' + ddResult.error +
          '\n後でメニュー「一括入力用スプシの入力規則を更新」から手動で実行してください。';
      }
    } catch (ddErr) {
      console.warn('createStudentSheet: 入力規則の自動設定をスキップ:', ddErr.message);
      dropdownMsg = '\n⚠️ 入力規則の自動設定に失敗しました。後でメニューから手動実行してください。';
    }

    ui.alert(
      '一括入力用スプシを作成しました',
      'URL:\n' + url + '\n\nこのスプシがシステムに紐づけられました。' + dropdownMsg,
      ui.ButtonSet.OK
    );
  } catch (e) {
    console.error('createStudentSheet エラー:', e.message);
    ui.alert('エラー', '作成に失敗しました: ' + e.message, ui.ButtonSet.OK);
  }
}

/**
 * メニューから「入力規則を更新」を呼び出すためのラッパー。
 * 結果をダイアログで表示する。
 */
function updateStudentSheetDropdownsFromMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    const result = updateStudentSheetDropdowns_();
    if (result.success) {
      ui.alert('完了', '入力規則（プルダウン）を更新しました。', ui.ButtonSet.OK);
    } else {
      ui.alert('エラー', '更新に失敗しました:\n' + result.error, ui.ButtonSet.OK);
    }
  } catch (e) {
    console.error('updateStudentSheetDropdownsFromMenu エラー:', e.message);
    ui.alert('エラー', '予期しないエラーが発生しました: ' + e.message, ui.ButtonSet.OK);
  }
}

/**
 * 現在紐づいている一括入力用スプシのIDとURLをダイアログで表示する。
 * メニューから呼び出される。
 */
function showLinkedStudentSheetId() {
  const ui = SpreadsheetApp.getUi();
  const id = getStudentSheetId_();
  if (!id) {
    ui.alert('未紐づけ', '一括入力用スプシがまだ紐づけられていません。\n「一括入力用スプシを新規作成・紐づけ」を実行してください。', ui.ButtonSet.OK);
    return;
  }
  try {
    const url = SpreadsheetApp.openById(id).getUrl();
    ui.alert('紐づき中のスプシ', 'ID: ' + id + '\nURL:\n' + url, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('紐づき中のスプシ', 'ID: ' + id + '\n（URLの取得に失敗しました: ' + e.message + '）', ui.ButtonSet.OK);
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
    // 1. config から画像フォルダIDを取得
    const appConfig  = getAppConfig_();
    const folderUrl  = appConfig['IMAGE_DRIVE_URL'] || '';
    const folderId   = extractDriveFolderId_(folderUrl);
    if (!folderId) {
      return { success: false, error: 'config シートの IMAGE_DRIVE_URL にフォルダURLが設定されていません。' };
    }

    // 2. フォルダ内の画像名リストを取得
    const folderResult = getConfigFromFolder_(folderId);
    if (folderResult.error) return { success: false, error: folderResult.error };

    const imageNames = folderResult.images
      .filter(function(item) { return item.type === 'image' && item.name; })
      .map(function(item) { return item.name; });

    if (imageNames.length === 0) {
      return { success: false, error: 'フォルダ内に画像が見つかりません。' };
    }

    // 3. 外部シートを開く
    const linkedId = getStudentSheetId_();
    if (!linkedId) {
      return { success: false, error: '一括入力用スプシが紐づけられていません。メニューから「一括入力用スプシを新規作成・紐づけ」を実行してください。' };
    }
    const studentSs    = SpreadsheetApp.openById(linkedId);
    const studentSheet = studentSs.getSheetByName(STUDENT_SHEET_NAME);
    if (!studentSheet) {
      return { success: false, error: '一括入力用シート「' + STUDENT_SHEET_NAME + '」が見つかりません。' };
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
    // 1. config から画像名→IDのマッピング辞書を作成
    const appConfig  = getAppConfig_();
    const folderUrl  = appConfig['IMAGE_DRIVE_URL'] || '';
    const folderId   = extractDriveFolderId_(folderUrl);
    if (!folderId) {
      return { success: false, count: 0, error: 'config シートの IMAGE_DRIVE_URL にフォルダURLが設定されていません。' };
    }

    const folderResult = getConfigFromFolder_(folderId);
    if (folderResult.error) return { success: false, count: 0, error: folderResult.error };

    /** @type {{ [name: string]: string }} */
    const nameToId = {};
    folderResult.images
      .filter(function(item) { return item.type === 'image' && item.name; })
      .forEach(function(item) { nameToId[item.name] = item.id; });

    // 2. 外部シートを開く
    const linkedId = getStudentSheetId_();
    if (!linkedId) {
      return { success: false, count: 0, error: '一括入力用スプシが紐づけられていません。メニューから「一括入力用スプシを新規作成・紐づけ」を実行してください。' };
    }
    const studentSs    = SpreadsheetApp.openById(linkedId);
    const studentSheet = studentSs.getSheetByName(STUDENT_SHEET_NAME);
    if (!studentSheet) {
      return { success: false, count: 0, error: '一括入力用シート「' + STUDENT_SHEET_NAME + '」が見つかりません。' };
    }

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
      migrateSheetIfNeeded_(infoSheet);
    }

    const now        = new Date();
    const infoRows   = [];
    const targetIdxs = []; // 処理対象行の 0-based インデックス

    // 5. フィルタリング＆info行配列の構築
    data.forEach(function(row, i) {
      const sceneName = String(row[1] || '').trim(); // B列: 対象シーン
      const status    = String(row[7] || '').trim(); // H列: 状態

      if (!sceneName || status === '済') return;

      const sceneId   = nameToId[sceneName] || '';
      const label     = String(row[2] || '').trim() || '(無題)'; // C列: ラベル
      const desc      = String(row[3] || '').trim();              // D列: 説明
      const linkUrl   = normalizeLinkUrl_(row[4]);                // E列: リンクURL
      const photoName = String(row[5] || '').trim();              // F列: 写真
      const jumpName  = String(row[6] || '').trim();              // G列: ジャンプ先
      const photoId   = photoName ? (nameToId[photoName] || '') : '';
      const jumpId    = jumpName  ? (nameToId[jumpName]  || '') : '';

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
        Utilities.getUuid()
      ]);
      targetIdxs.push(i);
    });

    if (infoRows.length === 0) return { success: true, count: 0 };

    // 6. info シート末尾に一括追記
    const insertRow = infoSheet.getLastRow() + 1;
    infoSheet.getRange(insertRow, 1, infoRows.length, INFO_HEADERS.length).setValues(infoRows);

    // 7. 外部シートのH列（状態）を「済」に一括更新
    //    既存の状態値を保持しつつ対象行のみ上書きする
    const statusCol = data.map(function(row) { return [String(row[7] || '')]; });
    targetIdxs.forEach(function(i) { statusCol[i] = ['済']; });
    studentSheet.getRange(2, 8, data.length, 1).setValues(statusCol);

    return { success: true, count: infoRows.length };

  } catch (e) {
    console.error('importDataFromStudentSheet エラー:', e.message);
    return { success: false, count: 0, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
