const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(rootDir, 'app.html'), 'utf8');
const index = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(rootDir, 'styles.html'), 'utf8');

function getFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let offset = bodyStart; offset < source.length; offset += 1) {
    if (source[offset] === '{') depth += 1;
    if (source[offset] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, offset + 1);
  }
  throw new Error(`Could not parse ${functionName}`);
}

function readVarObject(name) {
  const match = app.match(new RegExp(`var\\s+${name}\\s*=\\s*(\\{[\\s\\S]*?\\n\\});`));
  assert.ok(match, `${name} should exist`);
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${match[1]})`)));
}

test('new hotspot drafts use a dedicated state separate from existing marker moves', () => {
  const draft = readVarObject('hotspotDraftState');
  const move = readVarObject('hotspotMoveState');

  assert.deepEqual(Object.keys(draft).sort(), [
    'active',
    'coordinates',
    'draftElement',
    'initialCoordinates',
    'listenersAttached',
    'mode2D',
    'pannellumHotspotId',
    'pointerDown',
    'pointerPosition',
    'positionBeforeChange',
    'rafId',
    'repositioning',
    'sceneType',
    'startSceneId'
  ].sort());
  assert.equal(draft.active, false);
  assert.equal(draft.repositioning, false);
  assert.equal(move.target, null);
  assert.equal(Object.hasOwn(move, 'coordinates'), false);
});

test('hotspot popup is split into fixed header, scrollable content, and fixed footer', () => {
  const popupStart = index.indexOf('<div id="hotspot-popup"');
  const popupEnd = index.indexOf('<!-- トースト通知 -->', popupStart);
  const popup = index.slice(popupStart, popupEnd);

  const header = popup.indexOf('class="popup-header"');
  const content = popup.indexOf('id="hotspot-popup-content"');
  const footer = popup.indexOf('id="hotspot-popup-footer"');
  assert.ok(header >= 0 && content > header && footer > content);
  assert.match(popup, /id="hs-change-position-btn"[^>]*onclick="startHotspotDraftReposition\(\)"/);
  assert.match(popup, /id="hs-position-status"[^>]*aria-live="polite"/);
  assert.match(popup, /id="hs-type-back-btn"[^>]*>← 種類<\/button>/);
  assert.match(popup, /id="hs-back-btn"[^>]*>キャンセル<\/button>/);

  assert.match(styles, /#hotspot-popup\s*\{[\s\S]*display:\s*none;[\s\S]*flex-direction:\s*column;/);
  assert.match(styles, /#hotspot-popup-content\s*\{[\s\S]*overflow-y:\s*auto;/);
  assert.match(styles, /#hotspot-popup-footer\s*\{[\s\S]*flex-shrink:\s*0;/);
  assert.match(styles, /max-height:\s*calc\(100dvh\s*-\s*20px\)/);

  const popupMode = getFunctionSource(app, 'setPopupMode');
  assert.match(popupMode, /document\.activeElement/);
  assert.match(popupMode, /popup\.contains\(document\.activeElement\)/);
});

test('smartphone hotspot editor is a safe-area bottom sheet driven by the visual viewport', () => {
  assert.match(styles, /@media\s*\(max-width:\s*600px\)[\s\S]*#hotspot-popup\s*\{[\s\S]*border-radius:\s*[^;]*[^0]\s+[^;]*[^0]\s+0\s+0/);
  assert.match(styles, /#hotspot-popup\s*\{[\s\S]*--hotspot-visual-left/);
  assert.match(styles, /env\(safe-area-inset-left/);
  assert.match(styles, /env\(safe-area-inset-right/);
  assert.match(styles, /85dvh/);
  assert.match(styles, /calc\(var\(--hotspot-visual-height\)\s*-\s*8px\)/);

  const layout = getFunctionSource(app, 'positionHotspotPopup');
  const listeners = getFunctionSource(app, 'initializeHotspotPopupViewportTracking');
  assert.match(layout, /window\.visualViewport/);
  assert.match(listeners, /visualViewport\.addEventListener\('resize'/);
  assert.match(listeners, /visualViewport\.addEventListener\('scroll'/);
});

test('one central form guard protects every scene-changing and hotspot-conflicting entry point', () => {
  const guard = getFunctionSource(app, 'guardHotspotFormOperation');
  assert.match(app, /HOTSPOT_FORM_GUARD_MESSAGE\s*=\s*'ホットスポットの保存またはキャンセル後に操作してください。'/);
  assert.match(guard, /showToast\(HOTSPOT_FORM_GUARD_MESSAGE/);

  [
    'openSubfolder',
    'goBackFolder',
    'refreshSceneList',
    'openSceneContextMenu',
    'openHotspotContextMenu',
    'openSceneSettingsModal',
    'openSceneProperties',
    'requestSceneDelete',
    'requestSetHomeScene',
    'goHome',
    'loadScene',
    'toggleQuality',
    'toggleMode',
    'openUploadModal',
    'openHotspotFolderInDrive',
    'onBulkInputDropdownClick'
  ].forEach((functionName) => {
    assert.match(
      getFunctionSource(app, functionName),
      /guardHotspotFormOperation\(/,
      `${functionName} should call the central guard`
    );
  });
});

test('edit-only scene and hotspot attachment Drive controls are accessible and use guarded popup-safe API flows', () => {
  assert.match(index, /id="open-folder-btn"[^>]*title="シーン画像フォルダをGoogle Driveで開く"[^>]*aria-label="シーン画像フォルダをGoogle Driveで開く"/);
  assert.match(index, /id="open-folder-btn"[\s\S]*?<span class="scene-action-label-full">シーンDrive<\/span>/);
  assert.match(index, /id="open-hotspot-folder-btn"[^>]*title="HotspotフォルダをGoogle Driveで開く"[^>]*aria-label="HotspotフォルダをGoogle Driveで開く"/);
  assert.match(index, /id="open-hotspot-folder-btn"[\s\S]*?<svg[\s\S]*?<span class="scene-action-label-full">Hotspotフォルダ<\/span>/);
  assert.match(index, /id="open-hotspot-folder-topbar-btn"[^>]*title="HotspotフォルダをGoogle Driveで開く"[^>]*aria-label="HotspotフォルダをGoogle Driveで開く"/);
  assert.match(index, /id="open-hotspot-folder-topbar-btn"[\s\S]*?<svg[\s\S]*?<span[^>]*>Hotspotフォルダ<\/span>/);
  assert.doesNotMatch(index, /id="open-hotspot-(?:photo|audio)-folder/);
  assert.doesNotMatch(index, />写真フォルダ<|>音声フォルダ</);

  const open = getFunctionSource(app, 'openHotspotFolderInDrive');
  assert.match(open, /!canEdit\s*\|\|\s*!isEditMode/);
  assert.match(open, /guardHotspotFormOperation\(/);
  assert.match(open, /hotspotFolderOpenPending/);
  assert.match(open, /window\.open\(/);
  assert.ok(open.indexOf('window.open(') < open.indexOf('google.script.run'), 'blank tab must open before the asynchronous GAS API call');
  assert.match(open, /if\s*\(!popupTab\)[\s\S]*showToast[\s\S]*return false/);
  assert.match(open, /getHotspotFolderUrlForEdit\(withEditToken\(\{\}\)\)/);
  assert.match(open, /popupTab\.close\(\)/);
  assert.match(open, /setHotspotFolderButtonBusy\(false\)/);

  const lockControls = getFunctionSource(app, 'getHotspotFormLockControls');
  assert.match(lockControls, /#open-hotspot-folder-btn/);
  assert.match(lockControls, /#open-hotspot-folder-topbar-btn/);
  assert.doesNotMatch(lockControls, /open-hotspot-(?:photo|audio)-folder/);
  const toggleMode = getFunctionSource(app, 'toggleMode');
  assert.match(toggleMode, /open-hotspot-folder-btn/);
  assert.match(toggleMode, /open-hotspot-folder-topbar-btn/);

  const getFolderButtons = getFunctionSource(app, 'getHotspotFolderButtons');
  assert.match(getFolderButtons, /querySelectorAll\('\.hotspot-folder-button'\)/);
  const syncDriveButtons = getFunctionSource(app, 'syncDriveFolderButtons');
  assert.match(syncDriveButtons, /canEdit\s*&&\s*isEditMode\s*&&\s*!!rootFolderId/);
  assert.match(syncDriveButtons, /canEdit\s*&&\s*isEditMode\s*&&\s*!rootFolderId/);
  const setBusy = getFunctionSource(app, 'setHotspotFolderButtonBusy');
  assert.match(setBusy, /getHotspotFolderButtons\(\)/);
  assert.match(setBusy, /setAttribute\('aria-busy'/);

  assert.match(styles, /#open-folder-btn,\s*#open-hotspot-folder-btn\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(styles, /html\[data-theme="dark"\]\s*#open-folder-btn,\s*html\[data-theme="dark"\]\s*#open-hotspot-folder-btn/);
  assert.match(styles, /#open-hotspot-folder-topbar-btn\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(styles, /#open-hotspot-folder-topbar-btn\.loading,\s*#open-hotspot-folder-topbar-btn:disabled/);
});

test('form lock reflects disabled state in the DOM and restores the previous state', () => {
  const sync = getFunctionSource(app, 'syncHotspotFormInteractionLock');
  assert.match(sync, /lockedControls/);
  assert.match(sync, /control\.disabled\s*=\s*true/);
  assert.match(sync, /setAttribute\('aria-disabled',\s*'true'\)/);
  assert.match(sync, /previousDisabled/);
  assert.match(sync, /previousAriaDisabled/);
  assert.match(styles, /\[aria-disabled="true"\][\s\S]*pointer-events:\s*none/);
});

test('draft reposition supports pointer following, drag discrimination, Escape restore, and cleanup', () => {
  const start = getFunctionSource(app, 'startHotspotDraftReposition');
  const move = getFunctionSource(app, 'onHotspotDraftPointerMove');
  const up = getFunctionSource(app, 'onHotspotDraftPointerUp');
  const restore = getFunctionSource(app, 'cancelHotspotDraftReposition');
  const cleanup = getFunctionSource(app, 'cleanupHotspotDraft');

  assert.match(start, /positionBeforeChange/);
  assert.match(move, /scheduleHotspotDraftRender/);
  assert.match(up, /isHotspotDraftPointerDrag/);
  assert.match(up, /finishHotspotDraftReposition/);
  assert.match(restore, /positionBeforeChange/);
  assert.match(cleanup, /removeHotSpot/);
  assert.match(cleanup, /detachHotspotDraftListeners/);
  assert.match(cleanup, /hotspotDraftState\.active\s*=\s*false/);
});

test('new save validates the captured scene and keeps draft state on save failure paths', () => {
  const save = getFunctionSource(app, 'onSaveClick');
  assert.match(save, /validateHotspotFormScene\(/);
  assert.match(save, /hotspotDraftState\.coordinates/);
  assert.match(save, /sceneType:\s*hotspotFormSessionState\.sceneType/);
  assert.match(save, /completeHotspotDraftSave\(/);

  const close = getFunctionSource(app, 'closePopup');
  assert.match(close, /cleanupHotspotDraft\(/);
  assert.match(close, /endHotspotFormSession\(/);

  const failureBranches = Array.from(save.matchAll(/withFailureHandler/g));
  assert.equal(failureBranches.length, 2);
  assert.doesNotMatch(save, /withFailureHandler\([\s\S]{0,500}cleanupHotspotDraft/);
});

test('all terminal lifecycle paths tear down drafts, listeners, and operation locks', () => {
  const keydown = getFunctionSource(app, 'onGlobalKeyDown');
  assert.match(keydown, /cancelHotspotDraftReposition/);
  assert.match(keydown, /closePopup/);

  const sceneChange = getFunctionSource(app, 'handleUnexpectedHotspotSceneChange');
  assert.match(sceneChange, /closePopup/);

  const toggleMode = getFunctionSource(app, 'toggleMode');
  assert.match(toggleMode, /opts\.forceExit[\s\S]*closePopup/);

  assert.match(app, /window\.addEventListener\('pagehide',[\s\S]*teardownHotspotFormForPageExit/);
  assert.match(app, /window\.addEventListener\('beforeunload',[\s\S]*teardownHotspotFormForPageExit/);
});

test('hotspot photo UI exposes an unconstrained mobile picker and upload preview controls', () => {
  const photoGroupStart = index.indexOf('id="photo-select-group"');
  const photoGroupEnd = index.indexOf('</div>\n      </div>', photoGroupStart);
  const photoGroup = index.slice(photoGroupStart, photoGroupEnd);

  assert.match(photoGroup, /id="hotspot-photo-file-input"/);
  assert.match(photoGroup, /type="file"/);
  assert.match(photoGroup, /accept="[^"]*(?:image\/jpeg|\.jpe?g)[^"]*(?:image\/png|\.png)[^"]*(?:image\/webp|\.webp)[^"]*"/i);
  assert.doesNotMatch(photoGroup, /\bcapture(?:=|\s|>)/i);
  assert.match(photoGroup, /id="hotspot-photo-upload-card"/);
  assert.match(photoGroup, /id="hotspot-photo-preview"/);
  assert.match(photoGroup, /id="hotspot-photo-file-name"/);
  assert.match(photoGroup, /id="hotspot-photo-file-size"/);
  assert.match(photoGroup, /id="hotspot-photo-change-btn"[^>]*>変更</);
  assert.match(photoGroup, /id="hotspot-photo-clear-btn"[^>]*>解除</);
  assert.match(photoGroup, /id="hotspot-photo-error"[^>]*role="alert"/);
});

test('hotspot photo select is ordered upload, none, existing and retains a managed current photo', () => {
  const build = getFunctionSource(app, 'buildPhotoSelect');
  const uploadIndex = build.indexOf("textContent = '写真をアップロード…'");
  const noneIndex = build.indexOf("textContent = '（なし）'");
  const existingIndex = build.indexOf('allImages.forEach');

  assert.ok(uploadIndex >= 0 && noneIndex > uploadIndex && existingIndex > noneIndex);
  assert.match(build, /HOTSPOT_PHOTO_UPLOAD_OPTION/);
  assert.match(build, /現在のアップロード写真/);
  assert.match(build, /hotspotPhotoUploadState\.selectedValue/);
  assert.match(getFunctionSource(app, 'onHotspotPhotoSelectChange'), /openHotspotPhotoPicker/);
  assert.match(getFunctionSource(app, 'cancelHotspotPhotoPicker'), /selectedValue/);
});

test('hotspot photo processing enforces limits, signatures, compression, and Object URL cleanup', () => {
  assert.match(app, /HOTSPOT_PHOTO_ORIGINAL_MAX_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/);
  assert.match(app, /HOTSPOT_PHOTO_FINAL_MAX_BYTES\s*=\s*6\s*\*\s*1024\s*\*\s*1024/);
  assert.match(app, /HOTSPOT_PHOTO_MAX_EDGE\s*=\s*2560/);
  assert.match(app, /HOTSPOT_PHOTO_INITIAL_QUALITY\s*=\s*0\.85/);

  const process = getFunctionSource(app, 'processHotspotPhotoFile');
  assert.match(process, /detectHotspotPhotoMime/);
  assert.match(process, /image\/jpeg/);
  assert.match(process, /image\/png/);
  assert.match(process, /image\/webp/);
  assert.match(process, /resizeAndEncodeHotspotPhoto/);
  assert.match(process, /HOTSPOT_PHOTO_FINAL_MAX_BYTES/);

  const resize = getFunctionSource(app, 'resizeAndEncodeHotspotPhoto');
  assert.match(resize, /HOTSPOT_PHOTO_MAX_EDGE/);
  assert.match(resize, /HOTSPOT_PHOTO_INITIAL_QUALITY/);
  assert.match(getFunctionSource(app, 'hotspotPhotoCanvasToBlob'), /toBlob/);
  assert.match(resize, /image\/webp/);
  assert.match(resize, /image\/jpeg/);

  const dispose = getFunctionSource(app, 'disposeHotspotPhotoUploadState');
  assert.match(dispose, /releaseHotspotPhotoProcessedData/);
  assert.match(dispose, /decodeObjectUrls/);
  assert.match(getFunctionSource(app, 'releaseHotspotPhotoProcessedData'), /URL\.revokeObjectURL/);
  assert.match(getFunctionSource(app, 'loadHotspotPhotoImage'), /decodeObjectUrls/);
  assert.match(getFunctionSource(app, 'closePopup'), /disposeHotspotPhotoUploadState/);
  assert.match(getFunctionSource(app, 'teardownHotspotFormForPageExit'), /disposeHotspotPhotoUploadState/);
});

test('hotspot photo upload is available in single-image as well as folder mode', () => {
  const open = getFunctionSource(app, 'openPopup');
  const popupMode = getFunctionSource(app, 'setPopupMode');
  const save = getFunctionSource(app, 'onSaveClick');

  assert.match(open, /buildPhotoSelect\(editArgs\s*\?\s*\(editArgs\.photoId/);
  assert.doesNotMatch(open, /if\s*\(inFolderMode\)\s*\{\s*buildPhotoSelect/);
  assert.match(popupMode, /photoGroup\.style\.display\s*=\s*mode\s*===\s*'info'/);
  assert.doesNotMatch(popupMode, /inFolderMode\s*&&\s*mode\s*===\s*'info'/);
  assert.match(save, /currentPopupMode\s*===\s*'info'/);
  assert.doesNotMatch(save, /inFolderMode\s*&&\s*currentPopupMode\s*===\s*'info'/);
});

test('hotspot photo data is sent only with CRUD save and server-normalized hotspots drive markers', () => {
  const save = getFunctionSource(app, 'onSaveClick');
  assert.match(save, /photoUpload/);
  assert.match(save, /HOTSPOT_PHOTO_UPLOAD_OPTION/);
  assert.match(save, /result\.hotspot/);
  assert.match(save, /partialSuccess/);
  assert.doesNotMatch(getFunctionSource(app, 'handleHotspotPhotoFileChange'), /google\.script\.run/);
  assert.doesNotMatch(save, /withFailureHandler\([\s\S]{0,500}disposeHotspotPhotoUploadState/);

  const render = getFunctionSource(app, 'renderPhotoInPopup');
  assert.match(render, /fileId/);
  assert.match(render, /hotspotId/);
  assert.match(render, /photoId/);
  assert.match(render, /getHotspotPhotoDataUri\(\{/);
});

test('hotspot delete surfaces attachment cleanup partial success as a warning', () => {
  const remove = getFunctionSource(app, 'onHotspotDeleteClick');
  assert.match(remove, /result\.partialSuccess/);
  assert.match(remove, /result\.warning/);
  assert.match(remove, /result\.partialSuccess[\s\S]*?'warning'/);
});

test('hotspot photo styles stay responsive and theme-aware with touch-sized actions', () => {
  assert.match(styles, /\.hotspot-photo-upload-card\s*\{[\s\S]*min-width:\s*0/);
  assert.match(styles, /\.hotspot-photo-preview\s*\{[\s\S]*max-width:\s*100%/);
  assert.match(styles, /\.hotspot-photo-action[^}]*min-height:\s*44px/);
  assert.match(styles, /html\[data-theme="dark"\][\s\S]*\.hotspot-photo-upload-card/);
  assert.match(styles, /@media\s*\(max-width:\s*600px\)[\s\S]*\.hotspot-photo-actions/);
});
