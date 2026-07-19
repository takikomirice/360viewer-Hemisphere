# Hotspot Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan must be executed by one implementation agent; only the final read-only review may use A/B/C subagents.

**Goal:** Add deferred, validated hotspot photo uploads to the existing hotspot CRUD flow while preserving existing scene photos, failure recovery, and public access boundaries.

**Architecture:** The browser validates, resizes, and compresses one pending photo entirely in memory, then includes it only in `saveHotspot` or `updateHotspot`. The server validates ordinary hotspot data first, stores uploads in one ScriptProperties-authoritative sibling Drive folder, compensates failed info writes, removes only unreferenced managed attachments after successful mutations, and serves photos only for exact info associations.

**Tech Stack:** Google Apps Script, browser JavaScript, Canvas/File APIs, HTML/CSS, Node.js `node:test`, Playwright.

## Global Constraints

- Work on the existing `v2.0.0` branch with one implementation agent.
- Do not commit, push, create a PR, or deploy GAS.
- Run Node and Playwright full suites before changes and after all changes.
- Source files accept only JPEG, PNG, and WebP; original maximum is 20 MiB.
- Browser processing limits the long edge to 2560 px and final decoded bytes to 6 MiB.
- JPEG and WebP use approximately 0.85 initial quality; oversized PNG converts to WebP or JPEG.
- `HOTSPOT_PHOTO_FOLDER_ID` is the only authoritative attachment-folder reference.
- Never add attachment files to scenes or place them under `IMAGE_DRIVE_URL`.
- Only final read-only reviews A/B/C may use subagents, with at most three.

---

### Task 1: Lock the server upload validation and folder contract

**Files:**
- Modify: `Code.js`
- Modify: `tests/sheet-foundation.test.js`

**Interfaces:**
- Consumes: `PropertiesService`, `DriveApp`, `SpreadsheetApp`, `Utilities`, existing ScriptLock ownership.
- Produces: `HOTSPOT_PHOTO_FOLDER_ID_KEY`, byte-limit constants, `normalizeHotspotPhotoUpload_`, `detectHotspotPhotoMime_`, `getHotspotPhotoFolder_`, `createHotspotPhotoFile_`.

- [ ] **Step 1: Extend Drive test doubles and write failing validation/folder tests**

Add folder creation and active-spreadsheet-parent support to the existing test doubles, then assert:

```js
assert.throws(() => context.normalizeHotspotPhotoUpload_({
  fileName: 'fake.jpg', mimeType: 'image/jpeg', originalSizeBytes: 20,
  sizeBytes: gifBytes.length, base64: Buffer.from(gifBytes).toString('base64')
}), /形式|実データ|シグネチャ/);

const first = context.getHotspotPhotoFolder_(true);
const second = context.getHotspotPhotoFolder_(true);
assert.equal(first.getId(), second.getId());
assert.equal(parent.__folders.filter((folder) => folder.getName() === 'Hemisphere ホットスポット写真').length, 1);
assert.equal(context.__scriptProperties.HOTSPOT_PHOTO_FOLDER_ID, first.getId());
```

Also cover MIME/extension mismatch, SVG/GIF signatures, malformed Base64, decoded data over 6 MiB, original size over 20 MiB, and a configured unreadable folder ID that creates no replacement.

- [ ] **Step 2: Run the focused suite and confirm RED**

Run: `node --test tests/sheet-foundation.test.js`

Expected: failures identify the missing upload validators and folder resolver.

- [ ] **Step 3: Implement exact constants and byte-signature validation**

Add these contracts:

```js
const HOTSPOT_PHOTO_FOLDER_ID_KEY = 'HOTSPOT_PHOTO_FOLDER_ID';
const HOTSPOT_PHOTO_FOLDER_NAME = 'Hemisphere ホットスポット写真';
const HOTSPOT_PHOTO_ORIGINAL_MAX_BYTES = 20 * 1024 * 1024;
const HOTSPOT_PHOTO_FINAL_MAX_BYTES = 6 * 1024 * 1024;
const HOTSPOT_PHOTO_MIME_EXTENSIONS = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp']
};
```

`normalizeHotspotPhotoUpload_` must return `{ bytes, mimeType, extension, originalFileName, originalSizeBytes, sizeBytes }` only after strict Base64, size, extension, MIME, and signature checks.

- [ ] **Step 4: Implement authoritative sibling-folder resolution and safe file names**

`getHotspotPhotoFolder_(createIfMissing)` must validate a configured ID without fallback. When missing and creation is requested, resolve the active spreadsheet Drive file's parent and create exactly one folder under the already-held ScriptLock. `createHotspotPhotoFile_` must name files like:

```js
'hotspot_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') +
  '_' + Utilities.getUuid().replace(/[^A-Za-z0-9]/g, '') + '.' + upload.extension
```

- [ ] **Step 5: Run the focused suite GREEN**

Run: `node --test tests/sheet-foundation.test.js`

Expected: all folder and payload validation cases pass without scenes mutations.

### Task 2: Make save and update attachment-aware with compensation

**Files:**
- Modify: `Code.js`
- Modify: `tests/hotspot-data-integrity.test.js`
- Modify: `tests/sheet-foundation.test.js`

**Interfaces:**
- Consumes: Task 1 upload normalization/file creation and existing hotspot validators.
- Produces: `buildNormalizedHotspot_`, attachment-aware `validateHotspotRelatedIds_`, normalized `saveHotspot` and `updateHotspot` results.

- [ ] **Step 1: Write failing save/update ordering and rollback tests**

Cover missing edit token, invalid scene, invalid coordinates, invalid ordinary fields, and `photoId + photoUpload` together; each must leave Drive folder/file counts unchanged. Add an info append/setValues failure and assert the newly created file is trashed.

```js
assert.throws(() => context.saveHotspot({
  fileId: sceneId, label: 'No token', pitch: 0, yaw: 0, photoUpload: validUpload
}), /編集権限/);
assert.equal(photoParent.__folders.length, 0);

const failed = context.saveHotspot(withValidToken({
  fileId: sceneId, label: 'Fails info', pitch: 0, yaw: 0, photoUpload: validUpload
}));
assert.equal(failed.success, false);
assert.equal(createdAttachment.__trashed, true);
```

- [ ] **Step 2: Run focused RED**

Run: `node --test tests/hotspot-data-integrity.test.js tests/sheet-foundation.test.js`

Expected: missing compensation and normalized response assertions fail.

- [ ] **Step 3: Refactor save validation before attachment creation**

Preserve `assertEditToken_` as the first statement. Inside the lock, validate label/jump, storage scene, scene type, coordinates, related IDs, normalized marker/link data, and info schema before normalizing/creating `photoUpload`. Reject simultaneous `photoId` and `photoUpload`.

- [ ] **Step 4: Add compensated file creation and normalized save result**

Create the attachment only after all validations. Wrap the info write so any thrown failure calls `createdPhotoFile.setTrashed(true)` before returning failure. On success return:

```js
{
  success: true,
  id: id,
  photoId: effectivePhotoId,
  hotspot: buildNormalizedHotspot_(storageContext.storageFileId, id, normalizedFields, effectivePhotoId)
}
```

- [ ] **Step 5: Update existing-row lookup before replacement creation**

`updateHotspot` must locate and validate the owned row before any Drive mutation. Allow an unchanged old managed `photoId`, reject another hotspot's managed ID, create a new attachment only after row lookup, compensate `setValues` failure, and return the normalized updated hotspot.

- [ ] **Step 6: Run focused GREEN**

Run: `node --test tests/hotspot-data-integrity.test.js tests/sheet-foundation.test.js`

Expected: all save/update tests pass, including legacy scene-photo selection and single-image CRUD.

### Task 3: Add orphan cleanup and exact public association checks

**Files:**
- Modify: `Code.js`
- Modify: `tests/sheet-foundation.test.js`

**Interfaces:**
- Consumes: formal attachment folder, info schema, registered scene validation.
- Produces: `cleanupOrphanedHotspotPhoto_`, partial-success response helper, object-form `getHotspotPhotoDataUri`.

- [ ] **Step 1: Write failing replacement/deletion cleanup tests**

Assert that an unreferenced formal-folder attachment is trashed after successful update or delete, a shared attachment remains, and a scenes image or outside-folder file is never trashed. Force `setTrashed` to throw and assert the info mutation remains applied with `success: true`, `partialSuccess: true`, and a warning.

- [ ] **Step 2: Write failing public read tests**

Use `{ fileId, hotspotId, photoId }` and verify exact association success for a registered scene photo and a formal attachment. Reject a wrong scene, wrong hotspot, wrong photo, deleted row, arbitrary Drive ID, unmanaged root file, and attachment-folder ID leakage.

```js
assert.equal(context.getHotspotPhotoDataUri({ fileId: sceneId, hotspotId, photoId }).success, true);
assert.equal(context.getHotspotPhotoDataUri({ fileId: sceneId, hotspotId: 'other', photoId }).success, false);
assert.doesNotMatch(JSON.stringify(result), new RegExp(photoFolderId));
assert.match(result.dataUri, /^data:image\//);
```

- [ ] **Step 3: Run focused RED**

Run: `node --test tests/sheet-foundation.test.js`

Expected: cleanup classification, partial success, and three-key public access tests fail.

- [ ] **Step 4: Implement post-commit orphan classification**

After the info mutation, scan remaining photo references first. If none remain, resolve the formal folder without creating it, load the candidate file, and trash it only when one of its direct parent IDs equals the formal folder ID. Return structured cleanup status; convert thrown cleanup errors to warnings without rolling back info.

- [ ] **Step 5: Replace public photo lookup with exact association authorization**

Require a request object and exact info row. Validate the hotspot scene. Permit the photo only through `getEditableSceneContext_` or formal-folder direct-parent validation, then return `fileToDataUri_(file)`. Do not return URLs or folder IDs.

- [ ] **Step 6: Run focused GREEN**

Run: `node --test tests/sheet-foundation.test.js`

Expected: all cleanup and public-access tests pass.

### Task 4: Add client upload state, processing, and accessible UI

**Files:**
- Modify: `index.html`
- Modify: `app.html`
- Modify: `styles.html`
- Modify: `tests/responsive-hotspot-form.test.js`

**Interfaces:**
- Consumes: File, Blob, FileReader, URL, Image/createImageBitmap, Canvas APIs.
- Produces: `hotspotPhotoUploadState`, `processHotspotPhotoFile`, `openHotspotPhotoPicker`, `handleHotspotPhotoFileChange`, `cancelHotspotPhotoPicker`, `clearHotspotPhotoUpload`, `disposeHotspotPhotoUploadState`.

- [ ] **Step 1: Add failing structural and lifecycle tests**

Assert the hidden input has JPEG/PNG/WebP `accept` and no `capture`, the preview region has filename/size/image/error/change/clear controls, and `closePopup` plus page-exit teardown call disposal. Assert `buildPhotoSelect` appends upload, none, then existing options and wires selection changes.

- [ ] **Step 2: Run client unit RED**

Run: `node --test tests/responsive-hotspot-form.test.js`

Expected: missing state, markup, and lifecycle assertions fail.

- [ ] **Step 3: Add markup and responsive theme styles**

Add one hidden file input and one preview card under `photo-select-group`. Keep action buttons at least 44 px high, wrap metadata/action rows, constrain preview height, and use theme variables for light/dark borders, surfaces, text, and error state. The card must not widen the 340 px popup or the mobile bottom sheet.

- [ ] **Step 4: Implement selection rollback and Object URL ownership**

Track `selectValueBeforePicker`, `pickerGeneration`, `processing`, processed Blob/data, and one owned `previewUrl`. Selecting upload opens the picker; cancellation restores the previous selection and upload card. Disposal revokes only the owned URL and resets the input.

- [ ] **Step 5: Implement browser signature checks and image processing**

Validate real file size, MIME, extension, and first bytes. Decode dimensions, cap the long edge at 2560, retain eligible PNG, otherwise canvas-encode at initial quality 0.85 and retry with lower quality/scale only when needed to reach 6 MiB. Convert the final Blob to raw Base64 and render its Object URL.

- [ ] **Step 6: Run client unit GREEN**

Run: `node --test tests/responsive-hotspot-form.test.js`

Expected: all structure, processing contract, cleanup, and responsive style tests pass.

### Task 5: Send uploads only on save and consume server-normalized hotspots

**Files:**
- Modify: `app.html`
- Modify: `tests/responsive-hotspot-form.test.js`
- Modify: `tests/marker-style-move.test.js`

**Interfaces:**
- Consumes: Task 4 state and Task 2 normalized server response.
- Produces: attachment-aware `onSaveClick`, `addSpotToViewer`, `updateSpotInViewer`, and object-form public photo request.

- [ ] **Step 1: Write failing payload/response tests**

Assert upload selection produces `photoUpload` and an empty `photoId`, existing selection produces only `photoId`, and no upload helper calls GAS before save. Assert success handlers pass `result.hotspot` to marker updates and show warning text for `partialSuccess`.

- [ ] **Step 2: Run focused RED**

Run: `node --test tests/responsive-hotspot-form.test.js tests/marker-style-move.test.js`

Expected: current save code still uses local `saveData` and legacy photo lookup.

- [ ] **Step 3: Build mutually exclusive save fields**

If a processed upload exists in info mode, set `saveData.photoId = ''` and `saveData.photoUpload` to its serializable metadata/Base64. Otherwise use the selected existing ID and omit `photoUpload`. Keep the state unchanged in both server and transport failure handlers.

- [ ] **Step 4: Apply the normalized server hotspot**

For create, call `completeHotspotDraftSave()` then `addSpotToViewer(result.hotspot || legacyFallback, result.id)`. For update, call `updateSpotInViewer(targetArgs, result.hotspot || legacyFallback)`. Close/dispose only on successful current requests. Show a warning toast after successful marker update when `partialSuccess` is true.

- [ ] **Step 5: Send all three public photo identifiers**

Change popup photo rendering to pass the marker args and call:

```js
.getHotspotPhotoDataUri({
  fileId: String(args.fileId || currentFileId || ''),
  hotspotId: String(args.id || ''),
  photoId: String(args.photoId || '')
});
```

Cache by all three values, not by photo ID alone.

- [ ] **Step 6: Run focused GREEN**

Run: `node --test tests/responsive-hotspot-form.test.js tests/marker-style-move.test.js`

Expected: payload mutual exclusion, normalized marker updates, public request, and legacy move preservation pass.

### Task 6: Extend the browser harness and Playwright coverage

**Files:**
- Modify: `tests/browser/harness-server.js`
- Modify: `tests/browser/responsive-layout.spec.js`

**Interfaces:**
- Consumes: browser UI and normalized server contract.
- Produces: harness responses with confirmed photo IDs and Playwright upload/recovery matrix.

- [ ] **Step 1: Make the harness return server-confirmed hotspots**

Pass method args into `responseFor`. For save/update, clone the submitted hotspot fields, replace an uploaded photo with a deterministic `fixture-upload-photo-N`, remove `photoUpload`, and return `{ success, id, photoId, hotspot }`. Add `getHotspotPhotoDataUri` Data URI support.

- [ ] **Step 2: Write the core failing browser flows**

Add tests for option order, picker cancel rollback, selection/preview/change/clear, no save/update call before Save, cancel with no mutation, confirmed photo ID on the real marker, server/transport failures preserving upload/input/draft, and editing an existing hotspot to replace its photo.

- [ ] **Step 3: Run the focused browser tests RED**

Run: `npx playwright test tests/browser/responsive-layout.spec.js --grep "hotspot photo"`

Expected: missing controls and upload behavior fail.

- [ ] **Step 4: Add the visual matrix**

For desktop 1024×768, mobile 390×844, and landscape 800×360, run light/dark × 360/2D. Upload a valid fixture and assert preview visibility, Save/Cancel reachability, document/body horizontal widths, popup/footer containment, no harmful overlap, no page errors, and no unhandled rejections.

- [ ] **Step 5: Run focused browser GREEN**

Run: `npx playwright test tests/browser/responsive-layout.spec.js --grep "hotspot photo"`

Expected: all photo flows and visual combinations pass.

### Task 7: Full regression, final read-only review, and fresh verification

**Files:**
- Modify only if a reproduced review finding requires a test-first correction.

**Interfaces:**
- Consumes: complete implementation and test suites.
- Produces: final evidence and A/B/C review findings.

- [ ] **Step 1: Run the required pre-review verification**

Run: `node --check Code.js`

Run: `node --test tests/*.test.js`

Run: `npm run test:browser`

Run: `git diff --check`

Expected: every command exits 0; Node and Playwright report zero failures.

- [ ] **Step 2: Dispatch only the three allowed read-only final reviewers**

Reviewer A checks Drive permissions, public retrieval, and input validation. Reviewer B checks save/replace/delete/rollback/orphan behavior. Reviewer C checks PC/mobile UI, selection, image processing, and recovery. They must cite concrete file/function/line evidence and make no edits.

- [ ] **Step 3: Reproduce accepted findings with a failing test and fix sequentially**

For each valid finding, add the smallest regression test, observe RED, implement the correction, and observe GREEN. Do not accept speculative findings without reproduction or source evidence.

- [ ] **Step 4: Repeat the complete verification after all review fixes**

Run: `node --check Code.js`

Run: `node --test tests/*.test.js`

Run: `npm run test:browser`

Run: `git diff --check`

Expected: every command exits 0 with zero test failures and no whitespace errors.

- [ ] **Step 5: Confirm scope and report without publishing**

Run: `git status --short`

Run: `git diff --stat`

Confirm no commit, push, PR, or GAS deployment occurred. Report storage location, upload timing, image limits, failure recovery, orphan cleanup, reviewer disposition, and exact final test counts.
