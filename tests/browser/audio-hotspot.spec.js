const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');
const { createWavBuffer } = require('../helpers/create-wav-fixture');

let harnessServer;

async function chooseAudio(page, trigger = page.locator('#hotspot-audio-open-editor-btn')) {
  const chosen = page.waitForEvent('filechooser');
  await trigger.click();
  await (await chosen).setFiles({ name: 'direct-choice.wav', mimeType: 'audio/wav',
    buffer: createWavBuffer({ duration: 2.5, sampleRate: 8000 }) });
}

test('opens the file picker directly and skips the empty editor screen', async ({ page }) => {
  await openHarness(page);
  await openInfoForm(page);
  const picker = page.waitForEvent('filechooser', { timeout: 2000 }).catch(() => null);
  await page.locator('#hotspot-audio-open-editor-btn').click();
  const chooser = await picker;
  expect(chooser, 'attachment button must open the native file picker').not.toBeNull();
  await expect(page.locator('#hotspot-audio-editor-dialog')).not.toBeVisible();
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter(c => c.method === 'getAudioVendorBundle').length)).toBe(0);
  await chooser.setFiles({ name: 'direct.wav', mimeType: 'audio/wav', buffer: createWavBuffer({ duration: 2 }) });
  await expect(page.locator('#hotspot-audio-editor-dialog')).toBeVisible();
  await expect(page.locator('[data-hae-editor]')).toBeVisible();
  await expect(page.locator('[data-hae-empty]')).not.toBeVisible();
  await expect(page.locator('[data-hae-file-name]')).toHaveText('direct.wav');
});

test('canceling the picker keeps the existing attachment and allows selecting again', async ({ page }) => {
  await openHarness(page);
  const existing = await openExistingAudioForm(page, 'picker-cancel');
  await page.locator('#input-label').fill('入力を保持');
  const chosen = page.waitForEvent('filechooser');
  await page.locator('#hotspot-audio-change-btn').click();
  await (await chosen).setFiles([]);
  await expect(page.locator('#hotspot-audio-editor-dialog')).not.toBeVisible();
  await expect(page.locator('#input-label')).toHaveValue('入力を保持');
  expect(await page.evaluate(() => ({ id: hotspotAudioAttachmentState.existingAudioId,
    operation: hotspotAudioAttachmentState.operation,
    requests: window.__HARNESS_CALLS__.filter(c => c.method === 'getAudioVendorBundle').length
  }))).toEqual({ id: existing.audioId, operation: 'keep', requests: 0 });
  await chooseAudio(page, page.locator('#hotspot-audio-change-btn'));
  await expect(page.locator('[data-hae-editor]')).toBeVisible();
});

test('ignores a file chosen for a form that has already closed', async ({ page }) => {
  await openHarness(page);
  await openInfoForm(page);
  const chosen = page.waitForEvent('filechooser');
  await page.locator('#hotspot-audio-open-editor-btn').click();
  const chooser = await chosen;
  await page.evaluate(() => closePopup({ silent: true }));
  await openInfoForm(page);
  await chooser.setFiles({ name: 'stale.wav', mimeType: 'audio/wav', buffer: createWavBuffer({ duration: 2 }) });
  await expect(page.locator('#hotspot-audio-editor-dialog')).not.toBeVisible();
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter(c => c.method === 'getAudioVendorBundle').length)).toBe(0);
});

test.beforeAll(async () => {
  harnessServer = await startHarnessServer();
});

test.afterAll(async () => {
  if (harnessServer) await harnessServer.close();
});

async function openHarness(page, options = {}) {
  const params = new URLSearchParams({
    mode: options.mode || 'edit',
    sceneType: options.sceneType || '2D',
    storageMode: options.storageMode || 'single'
  });
  await page.goto(`/?${params.toString()}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
}

async function openInfoForm(page) {
  if (!await page.locator('body').evaluate((body) => body.classList.contains('edit-mode-active'))) {
    await page.locator('#mode-toggle').click();
  }
  const opened = await page.evaluate(() => {
    pendingPitch = 25;
    pendingYaw = 40;
    return openPopup(220, 180);
  });
  expect(opened).toBe(true);
  await expect(page.locator('#hs-form')).toBeVisible();
}

async function openExistingAudioForm(page, suffix) {
  if (!await page.locator('body').evaluate((body) => body.classList.contains('edit-mode-active'))) {
    await page.locator('#mode-toggle').click();
  }
  const idSuffix = suffix || 'fixture';
  const editArgs = {
    id: `existing-audio-${idSuffix}`,
    fileId: 'fixture-single-scene',
    label: `既存音声 ${idSuffix}`,
    description: '保持する説明',
    linkUrl: 'https://example.com/preserved',
    markerShape: 'circle',
    markerColor: 'blue',
    markerIcon: 'audio',
    pitch: 12,
    yaw: 24,
    photoId: '',
    audioId: `existing-audio-file-${idSuffix}`,
    jumpSceneId: ''
  };
  expect(await page.evaluate((args) => openPopup(260, 180, args), editArgs)).toBe(true);
  await expect(page.locator('#hotspot-audio-attachment-card')).toBeVisible();
  return editArgs;
}

test('edits real WAV audio to MP3, keeps it client-only, and sends it with hotspot save', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewportSize({ width: 375, height: 812 });
  await openHarness(page);
  expect(await page.evaluate(() => ({
    mediabunny: typeof window.Mediabunny,
    mp3Encoder: typeof window.MediabunnyMp3Encoder,
    audioEditor: typeof window.HemisphereAudioEditor
  }))).toEqual({ mediabunny: 'undefined', mp3Encoder: 'undefined', audioEditor: 'object' });
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length)).toBe(0);
  await openInfoForm(page);
  await page.locator('#input-label').fill('音声案内');
  await page.locator('#marker-style-toggle').click();
  await page.locator('#marker-icon').selectOption('warning');

  await chooseAudio(page);
  const dialog = page.locator('#hotspot-audio-editor-dialog');
  await expect(dialog).toHaveAttribute('open', '');
  expect(await page.evaluate(() => ({
    mediabunny: typeof window.Mediabunny,
    mp3Encoder: typeof window.MediabunnyMp3Encoder,
    vendorRequests: window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length,
    token: window.__HARNESS_CALLS__.find((call) => call.method === 'getAudioVendorBundle').args[0].__editToken
  }))).toEqual({
    mediabunny: 'object',
    mp3Encoder: 'object',
    vendorRequests: 1,
    token: 'playwright-edit-token'
  });
  await expect(dialog.locator('.hae-modal-footer')).toHaveCount(0);
  await expect(dialog.locator('[data-hae-download]')).toHaveCount(0);
  await expect(dialog.locator('[data-hae-adjust]')).toHaveCount(1);
  const attachResult = dialog.locator('[data-hae-result] #hotspot-audio-attach-result');
  await expect(attachResult).toHaveCount(1);
  await expect(attachResult).toBeDisabled();
  await expect(attachResult).toHaveAttribute('data-hae-attach', '');

  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(375);
  expect(geometry.bottom).toBeLessThanOrEqual(812);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.documentClientWidth);

  await page.locator('#hae-audio-file').setInputFiles({
    name: 'school-guide.wav',
    mimeType: 'audio/wav',
    buffer: createWavBuffer({ duration: 2.5, sampleRate: 8000 })
  });
  await expect.poll(() => page.evaluate(() => window.HemisphereAudioEditor.getState().mode)).toBe('editing');
  await page.evaluate(() => window.HemisphereAudioEditor.setSelection(0.5, 1.5));
  await page.locator('[data-hae-confirm]').click();
  await expect.poll(() => page.evaluate(() => window.HemisphereAudioEditor.getState().mode), { timeout: 15_000 }).toBe('ready');
  await expect(attachResult).toBeVisible();
  await expect(attachResult).toBeEnabled();
  await expect(attachResult).toContainText('この音声を添付');

  const encoded = await page.evaluate(async () => {
    const result = window.HemisphereAudioEditor.getResult();
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    return {
      mimeType: result.mimeType,
      sampleRate: result.sampleRate,
      bitrate: result.bitrate,
      durationSeconds: result.durationSeconds,
      sizeBytes: result.sizeBytes,
      mp3Header: (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    };
  });
  expect(encoded).toMatchObject({
    mimeType: 'audio/mpeg',
    sampleRate: 48000,
    bitrate: 192000,
    mp3Header: true
  });
  expect(encoded.durationSeconds).toBeGreaterThanOrEqual(0.5);
  expect(encoded.durationSeconds).toBeLessThanOrEqual(120);
  expect(encoded.sizeBytes).toBeGreaterThan(0);

  await page.locator('#hotspot-audio-attach-result').click();
  await expect(dialog).not.toHaveAttribute('open', '');
  await expect(page.locator('#hotspot-audio-attachment-card')).toBeVisible();
  await expect(page.locator('#hotspot-audio-file-name')).toHaveText('添付予定の音声');
  await expect(page.locator('#hotspot-audio-file-meta')).toContainText('/');
  await page.waitForFunction(() => !hotspotAudioAttachmentState.base64Converting && !!hotspotAudioAttachmentState.base64);
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot').length)).toBe(0);

  const pendingBeforeCancel = await page.evaluate(() => ({
    operation: hotspotAudioAttachmentState.operation,
    fileName: hotspotAudioAttachmentState.fileName,
    base64Length: hotspotAudioAttachmentState.base64.length
  }));
  await chooseAudio(page, page.locator('#hotspot-audio-change-btn'));
  await expect(dialog).toHaveAttribute('open', '');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await dialog.evaluate((element) => getComputedStyle(element).getPropertyValue('--hae-bg').trim())).toBe('#27272A');
  await page.locator('#hae-audio-file').setInputFiles({
    name: 'unconfirmed-replacement.wav',
    mimeType: 'audio/wav',
    buffer: createWavBuffer({ duration: 1.5, sampleRate: 8000 })
  });
  await expect.poll(() => page.evaluate(() => window.HemisphereAudioEditor.getState().mode)).toBe('editing');
  await page.locator('[data-hae-confirm]').click();
  await expect.poll(() => page.evaluate(() => window.HemisphereAudioEditor.getState().mode), { timeout: 15_000 }).toBe('ready');
  await expect(page.locator('#hotspot-audio-attach-result')).toBeEnabled();
  await dialog.getByRole('button', { name: '音声編集を閉じる' }).click();
  await expect(dialog).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => ({
    operation: hotspotAudioAttachmentState.operation,
    fileName: hotspotAudioAttachmentState.fileName,
    base64Length: hotspotAudioAttachmentState.base64.length
  }))).toEqual(pendingBeforeCancel);

  await page.locator('#btn-save').click();
  await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot').length)).toBe(1);
  const submitted = await page.evaluate(() => {
    const call = window.__HARNESS_CALLS__.find((item) => item.method === 'saveHotspot');
    const payload = call.args[0];
    return {
      audioId: payload.audioId,
      markerIcon: payload.markerIcon,
      mimeType: payload.audioUpload && payload.audioUpload.mimeType,
      fileName: payload.audioUpload && payload.audioUpload.fileName,
      sizeBytes: payload.audioUpload && payload.audioUpload.sizeBytes,
      durationSeconds: payload.audioUpload && payload.audioUpload.durationSeconds,
      hasBase64: Boolean(payload.audioUpload && payload.audioUpload.base64),
      hasBlob: Boolean(payload.audioUpload && payload.audioUpload.blob),
      hasEditToken: Boolean(payload.__editToken)
    };
  });
  expect(submitted).toMatchObject({
    audioId: '',
    mimeType: 'audio/mpeg',
    markerIcon: 'warning',
    hasBase64: true,
    hasBlob: false,
    hasEditToken: true
  });
  expect(submitted.fileName).toMatch(/\.mp3$/i);
  expect(submitted.sizeBytes).toBe(encoded.sizeBytes);
  expect(submitted.durationSeconds).toBeGreaterThanOrEqual(0.5);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('fits a tablet viewport and canceling an uncommitted edit leaves no pending audio', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewportSize({ width: 768, height: 1024 });
  await openHarness(page);
  await openInfoForm(page);
  await chooseAudio(page);

  const dialog = page.locator('#hotspot-audio-editor-dialog');
  await expect(dialog).toHaveAttribute('open', '');
  expect(await dialog.evaluate((element) => getComputedStyle(element).getPropertyValue('--hae-bg').trim())).toBe('#F8FAFC');
  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(768);
  expect(geometry.bottom).toBeLessThanOrEqual(1024);
  expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.documentClientWidth);

  await page.locator('#hae-audio-file').setInputFiles({
    name: 'cancel-me.wav',
    mimeType: 'audio/wav',
    buffer: createWavBuffer({ duration: 1.5, sampleRate: 8000 })
  });
  await expect.poll(() => page.evaluate(() => window.HemisphereAudioEditor.getState().mode)).toBe('editing');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => ({
    operation: hotspotAudioAttachmentState.operation,
    hasBlob: Boolean(hotspotAudioAttachmentState.blob),
    base64: hotspotAudioAttachmentState.base64,
    cardHidden: document.getElementById('hotspot-audio-attachment-card').hidden
  }))).toEqual({ operation: 'keep', hasBlob: false, base64: '', cardHidden: true });
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('keeps an existing single-image attachment unchanged or explicitly removes it on update', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openHarness(page);
  if (!await page.locator('body').evaluate((body) => body.classList.contains('edit-mode-active'))) {
    await page.locator('#mode-toggle').click();
  }
  const editArgs = {
    id: 'existing-hotspot',
    fileId: 'fixture-single-scene',
    label: '既存音声',
    description: '',
    linkUrl: '',
    markerShape: 'circle',
    markerColor: 'blue',
    markerIcon: 'info',
    pitch: 12,
    yaw: 24,
    photoId: '',
    audioId: 'existing-audio-file',
    jumpSceneId: ''
  };
  expect(await page.evaluate((args) => openPopup(260, 180, args), editArgs)).toBe(true);
  await expect(page.locator('#hotspot-audio-preview')).toBeVisible();
  await expect(page.locator('#hotspot-audio-file-name')).toHaveText('添付済み音声');
  const previewRequest = await page.evaluate(() => {
    const call = window.__HARNESS_CALLS__.find((item) => item.method === 'getHotspotAudioData');
    return call && call.args[0];
  });
  expect(previewRequest).toEqual({
    fileId: 'fixture-single-scene',
    hotspotId: 'existing-hotspot',
    audioId: 'existing-audio-file'
  });

  await page.locator('#btn-save').click();
  await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'updateHotspot').length)).toBe(1);
  const kept = await page.evaluate(() => {
    const call = window.__HARNESS_CALLS__.filter((item) => item.method === 'updateHotspot')[0];
    return call.args[0];
  });
  expect(kept.audioId).toBe('existing-audio-file');
  expect(kept.audioUpload).toBeUndefined();

  expect(await page.evaluate((args) => openPopup(260, 180, args), editArgs)).toBe(true);
  await expect(page.locator('#hotspot-audio-preview')).toBeVisible();
  await page.locator('#hotspot-audio-remove-btn').click();
  await expect(page.locator('#hotspot-audio-file-name')).toHaveText('保存時に音声添付を解除します');
  await page.locator('#btn-save').click();
  await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'updateHotspot').length)).toBe(2);
  const removed = await page.evaluate(() => {
    const call = window.__HARNESS_CALLS__.filter((item) => item.method === 'updateHotspot')[1];
    return call.args[0];
  });
  expect(removed.audioId).toBe('');
  expect(removed.audioUpload).toBeUndefined();

  expect(await page.evaluate((args) => openPopup(260, 180, args), editArgs)).toBe(true);
  await chooseAudio(page, page.locator('#hotspot-audio-change-btn'));
  await page.locator('#hae-audio-file').setInputFiles({
    name: 'replacement.wav',
    mimeType: 'audio/wav',
    buffer: createWavBuffer({ duration: 1.5, sampleRate: 8000 })
  });
  await expect.poll(() => page.evaluate(() => window.HemisphereAudioEditor.getState().mode)).toBe('editing');
  await page.locator('[data-hae-confirm]').click();
  await expect.poll(() => page.evaluate(() => window.HemisphereAudioEditor.getState().mode), { timeout: 15_000 }).toBe('ready');
  await page.locator('#hotspot-audio-attach-result').click();
  await page.waitForFunction(() => !hotspotAudioAttachmentState.base64Converting && !!hotspotAudioAttachmentState.base64);
  await page.locator('#btn-save').click();
  await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'updateHotspot').length)).toBe(3);
  const replaced = await page.evaluate(() => {
    const call = window.__HARNESS_CALLS__.filter((item) => item.method === 'updateHotspot')[2];
    return call.args[0];
  });
  expect(replaced.audioId).toBe('');
  expect(replaced.audioUpload).toMatchObject({ mimeType: 'audio/mpeg' });
  expect(replaced.audioUpload.fileName).toMatch(/\.mp3$/i);
  expect(replaced.audioUpload.base64).toBeTruthy();
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('loads associated public audio lazily without autoplay and discards a late closed-popup response', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewportSize({ width: 1024, height: 768 });
  await openHarness(page, { mode: 'public' });

  expect(await page.evaluate(() => window.__HARNESS_CALLS__.some((call) => call.method === 'getHotspotAudioData'))).toBe(false);
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getHotspotAudioData = { outcome: 'success', delay: 100 };
    onMarkerClick({ clientX: 200, clientY: 180, currentTarget: null }, {
      id: 'audio-hotspot-1',
      fileId: 'fixture-single-scene',
      label: '遅延音声',
      description: '閉じた後には表示しない',
      audioId: 'audio-file-1'
    });
    closeActiveInfoPopup({ restoreFocus: false });
  });
  await page.waitForTimeout(150);
  await expect(page.locator('#active-info-popup')).toHaveCount(0);

  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getHotspotAudioData = { outcome: 'error', delay: 100 };
    onMarkerClick({ clientX: 210, clientY: 190, currentTarget: null }, {
      id: 'audio-hotspot-error',
      fileId: 'fixture-single-scene',
      label: '取得失敗',
      audioId: 'audio-file-error'
    });
  });
  const failureArea = page.locator('#popup-audio-area');
  const failureAudio = failureArea.locator('audio');
  await expect(failureAudio).toBeVisible();
  await expect(failureAudio).not.toHaveAttribute('src', /.+/);
  await expect(failureAudio).toHaveAttribute('aria-disabled', 'true');
  await expect(failureArea.locator('.info-popup-audio-status')).toHaveText('音声を準備しています…');
  await expect(failureArea).toHaveClass(/info-popup-audio-error/);
  await expect(failureArea.locator('.info-popup-audio-status')).toHaveText('音声を読み込めませんでした');
  await page.evaluate(() => closeActiveInfoPopup({ restoreFocus: false }));

  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getHotspotAudioData = {
      outcome: 'success',
      delay: 100,
      response: {
        success: true,
        dataUri: 'data:audio/mpeg;base64,SUQzBAAAAAAAAP/7tAAAAAAA',
        mimeType: 'audio/mpeg',
        fileName: 'hotspot_audio_20260721_uuid_internal.mp3',
        sizeBytes: 24
      }
    };
    onMarkerClick({ clientX: 220, clientY: 200, currentTarget: null }, {
      id: 'audio-hotspot-2',
      fileId: 'fixture-single-scene',
      label: '校内放送',
      audioId: 'audio-file-2'
    });
    window.__immediatePopupAudio = document.querySelector('#active-info-popup audio');
  });
  const audio = page.locator('#active-info-popup audio');
  await expect(audio).toBeVisible();
  await expect(audio).toHaveAttribute('controls', '');
  await expect(audio).toHaveAttribute('controlslist', 'nodownload');
  await expect(audio).toHaveAttribute('preload', 'none');
  expect(await audio.evaluate((element) => element.controlsList.contains('nodownload'))).toBe(true);
  await expect(audio).not.toHaveAttribute('src', /.+/);
  await expect(page.locator('.info-popup-audio-status')).toHaveText('音声を準備しています…');
  await expect(audio).toHaveAttribute('src', /^data:audio\/mpeg;base64,/);
  expect(await page.evaluate(() => window.__immediatePopupAudio === document.querySelector('#active-info-popup audio'))).toBe(true);
  await expect(page.locator('.info-popup-audio-status')).toBeHidden();
  await expect(page.locator('.info-popup-audio-name')).toHaveCount(0);
  await expect(page.locator('#active-info-popup')).not.toContainText('hotspot_audio_');
  await expect(page.locator('#active-info-popup')).not.toContainText('uuid_internal');
  expect(await audio.evaluate((element) => ({ paused: element.paused, autoplay: element.autoplay }))).toEqual({
    paused: true,
    autoplay: false
  });
  const request = await page.evaluate(() => {
    const call = window.__HARNESS_CALLS__.filter((item) => item.method === 'getHotspotAudioData').at(-1);
    return call.args[0];
  });
  expect(request).toMatchObject({
    hotspotId: 'audio-hotspot-2',
    audioId: 'audio-file-2'
  });
  expect(request.fileId).toBe('fixture-single-scene');

  await page.evaluate(() => closeActiveInfoPopup({ restoreFocus: false }));
  await expect(page.locator('#active-info-popup')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('loads the audio vendor once, joins concurrent opens, and reuses it after closing', async ({ page }) => {
  const pageErrors = [];
  const vendorEndpointRequests = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('request', (request) => {
    if (request.url().includes('/__audio-vendor-bundle')) vendorEndpointRequests.push(request.url());
  });
  await openHarness(page);

  const initial = await page.evaluate(() => ({
    mediabunny: typeof window.Mediabunny,
    mp3Encoder: typeof window.MediabunnyMp3Encoder,
    vendorCalls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length,
    hasVendorMarker: document.documentElement.outerHTML.includes('AUDIO_VENDOR_BUNDLE_START'),
    hasVendorAssignment: document.documentElement.outerHTML.includes('globalThis.Mediabunny=')
  }));
  expect(initial).toEqual({
    mediabunny: 'undefined',
    mp3Encoder: 'undefined',
    vendorCalls: 0,
    hasVendorMarker: false,
    hasVendorAssignment: false
  });
  expect(vendorEndpointRequests).toHaveLength(0);

  await openInfoForm(page);
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getAudioVendorBundle = { delay: 200 };
    const trigger = document.getElementById('hotspot-audio-open-editor-btn');
    window.__concurrentAudioOpens = [
      openHotspotAudioEditor(trigger),
      openHotspotAudioEditor(trigger)
    ];
  });
  await expect(page.locator('#hotspot-audio-status')).toHaveText('音声エディターを準備しています…');
  await expect(page.locator('#hotspot-audio-open-editor-btn')).toBeDisabled();
  await expect(page.locator('#hotspot-audio-change-btn')).toBeDisabled();
  expect(await page.evaluate(() => window.__concurrentAudioOpens[0] === window.__concurrentAudioOpens[1])).toBe(true);
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length)).toBe(1);

  const dialog = page.locator('#hotspot-audio-editor-dialog');
  await expect(dialog).toHaveAttribute('open', '');
  expect(vendorEndpointRequests).toHaveLength(1);
  expect(await page.evaluate(() => ({
    mediabunny: typeof window.Mediabunny,
    mp3Encoder: typeof window.MediabunnyMp3Encoder
  }))).toEqual({ mediabunny: 'object', mp3Encoder: 'object' });

  await dialog.getByRole('button', { name: '音声編集を閉じる' }).click();
  await chooseAudio(page);
  await expect(dialog).toHaveAttribute('open', '');
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length)).toBe(1);
  expect(vendorEndpointRequests).toHaveLength(1);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('does not open a stale form after loading and never requests the editor vendor in public mode', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await openHarness(page);
  await openInfoForm(page);
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getAudioVendorBundle = { delay: 250 };
    openHotspotAudioEditor(document.getElementById('hotspot-audio-open-editor-btn'));
    closePopup({ silent: true });
  });
  await page.waitForTimeout(350);
  await expect(page.locator('#hotspot-audio-editor-dialog')).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => ({
    formActive: isHotspotFormSessionActive(),
    editorOpen: hotspotAudioAttachmentState.editorOpen,
    operation: hotspotAudioAttachmentState.operation,
    vendorCalls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length
  }))).toEqual({ formActive: false, editorOpen: false, operation: 'keep', vendorCalls: 1 });
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);

  await openHarness(page, { mode: 'public' });
  const publicResult = await page.evaluate(async () => {
    const result = await openHotspotAudioEditor(document.getElementById('hotspot-audio-open-editor-btn'));
    return {
      result,
      mediabunny: typeof window.Mediabunny,
      vendorCalls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length
    };
  });
  expect(publicResult).toEqual({ result: false, mediabunny: 'undefined', vendorCalls: 0 });
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('preserves form and audio state after vendor failure, then retries once and opens', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await openHarness(page);
  if (!await page.locator('body').evaluate((body) => body.classList.contains('edit-mode-active'))) {
    await page.locator('#mode-toggle').click();
  }
  const editArgs = {
    id: 'vendor-retry-hotspot',
    fileId: 'fixture-single-scene',
    label: '既存ラベル',
    description: '既存説明',
    linkUrl: 'https://example.com/before',
    markerShape: 'circle',
    markerColor: 'blue',
    markerIcon: 'audio',
    pitch: 12,
    yaw: 24,
    photoId: '',
    audioId: 'existing-audio-file',
    jumpSceneId: ''
  };
  expect(await page.evaluate((args) => openPopup(260, 180, args), editArgs)).toBe(true);
  await page.locator('#input-label').fill('失敗後も残すラベル');
  await page.locator('#input-desc').fill('失敗後も残す説明');
  await page.locator('#input-link-url').fill('https://example.com/preserved');
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getAudioVendorBundle = {
      queue: [
        { outcome: 'failure', delay: 100 },
        { outcome: 'success', delay: 100 }
      ]
    };
  });

  await chooseAudio(page, page.locator('#hotspot-audio-change-btn'));
  await expect(page.locator('#hotspot-audio-error')).toHaveText('音声エディターを準備できませんでした。もう一度お試しください。');
  await expect(page.locator('#hotspot-audio-editor-dialog')).not.toHaveAttribute('open', '');
  await expect(page.locator('#hotspot-audio-open-editor-btn')).toBeEnabled();
  await expect(page.locator('#hotspot-audio-change-btn')).toBeEnabled();
  expect(await page.evaluate(() => ({
    label: document.getElementById('input-label').value,
    description: document.getElementById('input-desc').value,
    linkUrl: document.getElementById('input-link-url').value,
    operation: hotspotAudioAttachmentState.operation,
    existingAudioId: hotspotAudioAttachmentState.existingAudioId,
    hasBlob: Boolean(hotspotAudioAttachmentState.blob),
    vendorCalls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length
  }))).toEqual({
    label: '失敗後も残すラベル',
    description: '失敗後も残す説明',
    linkUrl: 'https://example.com/preserved',
    operation: 'keep',
    existingAudioId: 'existing-audio-file',
    hasBlob: false,
    vendorCalls: 1
  });

  await chooseAudio(page, page.locator('#hotspot-audio-change-btn'));
  await expect(page.locator('#hotspot-audio-editor-dialog')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length)).toBe(2);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('rolls back a failed editor initialization and retries without reloading the vendor', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await openHarness(page);
  const editArgs = await openExistingAudioForm(page, 'init-failure');
  await page.locator('#input-label').fill('初期化失敗後も保持するラベル');
  await page.locator('#input-desc').fill('初期化失敗後も保持する説明');
  await page.evaluate(() => {
    window.__originalHotspotAudioEditorInit = window.HemisphereAudioEditor.init;
    window.HemisphereAudioEditor.init = function () {
      throw new Error('fixture editor init failure');
    };
  });

  const trigger = page.locator('#hotspot-audio-change-btn');
  await chooseAudio(page, trigger);
  await expect.poll(() => page.evaluate(() =>
    window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length
  )).toBe(1);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => ({
    dialogOpen: document.getElementById('hotspot-audio-editor-dialog').open,
    editorOpen: hotspotAudioAttachmentState.editorOpen,
    vendorLoading: hotspotAudioAttachmentState.vendorLoading,
    hasOpeningPromise: Boolean(hotspotAudioAttachmentState.editorOpeningPromise),
    error: document.getElementById('hotspot-audio-error').textContent,
    label: document.getElementById('input-label').value,
    description: document.getElementById('input-desc').value,
    operation: hotspotAudioAttachmentState.operation,
    existingAudioId: hotspotAudioAttachmentState.existingAudioId
  }))).toEqual({
    dialogOpen: false,
    editorOpen: false,
    vendorLoading: false,
    hasOpeningPromise: false,
    error: '音声エディターを準備できませんでした。もう一度お試しください。',
    label: '初期化失敗後も保持するラベル',
    description: '初期化失敗後も保持する説明',
    operation: 'keep',
    existingAudioId: editArgs.audioId
  });
  await expect(trigger).toBeEnabled();
  await expect(trigger).toBeFocused();
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);

  await page.evaluate(() => {
    window.HemisphereAudioEditor.init = window.__originalHotspotAudioEditorInit;
    delete window.__originalHotspotAudioEditorInit;
  });
  await chooseAudio(page, trigger);
  await expect(page.locator('#hotspot-audio-editor-dialog')).toHaveAttribute('open', '');
  expect(await page.evaluate(() =>
    window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length
  )).toBe(1);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('rejects invalid vendor responses, resets the loader, and restores the real runtime on retry', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  const scenarios = [
    {
      name: 'version-mismatch',
      response: {
        version: '1.50.7',
        source: 'window.__wrongAudioVendorExecuted = true;'
      }
    },
    {
      name: 'missing-runtime-api',
      response: {
        version: '1.50.8',
        source: 'window.Mediabunny={canEncodeAudio:function(){}};window.MediabunnyMp3Encoder={};'
      }
    }
  ];

  for (const scenario of scenarios) {
    await openHarness(page);
    await openInfoForm(page);
    const preservedLabel = `保持する入力 ${scenario.name}`;
    await page.locator('#input-label').fill(preservedLabel);
    await page.evaluate((response) => {
      window.__HARNESS_BEHAVIOR__.getAudioVendorBundle = {
        queue: [
          { outcome: 'success', response },
          { outcome: 'success' }
        ]
      };
    }, scenario.response);

    const trigger = page.locator('#hotspot-audio-open-editor-btn');
    await chooseAudio(page, trigger);
    await expect(page.locator('#hotspot-audio-error')).toHaveText('音声エディターを準備できませんでした。もう一度お試しください。');
    await expect(page.locator('#hotspot-audio-editor-dialog')).not.toHaveAttribute('open', '');
    await expect(trigger).toBeEnabled();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => ({
      label: document.getElementById('input-label').value,
      operation: hotspotAudioAttachmentState.operation,
      hasBlob: Boolean(hotspotAudioAttachmentState.blob),
      editorOpen: hotspotAudioAttachmentState.editorOpen,
      vendorLoading: hotspotAudioAttachmentState.vendorLoading,
      hasOpeningPromise: Boolean(hotspotAudioAttachmentState.editorOpeningPromise),
      vendorCalls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length
    }))).toEqual({
      label: preservedLabel,
      operation: 'keep',
      hasBlob: false,
      editorOpen: false,
      vendorLoading: false,
      hasOpeningPromise: false,
      vendorCalls: 1
    });
    if (scenario.name === 'version-mismatch') {
      expect(await page.evaluate(() => window.__wrongAudioVendorExecuted)).toBeUndefined();
    }

    await chooseAudio(page, trigger);
    await expect(page.locator('#hotspot-audio-editor-dialog')).toHaveAttribute('open', '');
    expect(await page.evaluate(() => ({
      vendorCalls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length,
      canEncodeAudio: typeof window.Mediabunny.canEncodeAudio,
      BufferTarget: typeof window.Mediabunny.BufferTarget,
      Output: typeof window.Mediabunny.Output,
      Mp3OutputFormat: typeof window.Mediabunny.Mp3OutputFormat,
      AudioBufferSource: typeof window.Mediabunny.AudioBufferSource,
      registerMp3Encoder: typeof window.MediabunnyMp3Encoder.registerMp3Encoder
    }))).toEqual({
      vendorCalls: 2,
      canEncodeAudio: 'function',
      BufferTarget: 'function',
      Output: 'function',
      Mp3OutputFormat: 'function',
      AudioBufferSource: 'function',
      registerMp3Encoder: 'function'
    });
    expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
  }
  expect(pageErrors).toEqual([]);
});

test('releases the current vendor opening attempt when the form leaves info mode', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  const scenarios = [
    { name: 'success', behavior: { outcome: 'success', delay: 200 }, expectedRequests: 1 },
    { name: 'failure', behavior: { outcome: 'failure', delay: 200 }, expectedRequests: 2 }
  ];

  for (const scenario of scenarios) {
    await openHarness(page);
    const editArgs = await openExistingAudioForm(page, `mode-change-${scenario.name}`);
    const preservedLabel = `モード変更後も保持 ${scenario.name}`;
    await page.locator('#input-label').fill(preservedLabel);
    await page.evaluate((behavior) => {
      window.__HARNESS_BEHAVIOR__.getAudioVendorBundle = behavior;
    }, scenario.behavior);

    const trigger = page.locator('#hotspot-audio-change-btn');
    await chooseAudio(page, trigger);
    await expect.poll(() => page.evaluate(() =>
      window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length
    )).toBe(1);
    await page.evaluate(() => setPopupMode('type'));
    await expect.poll(() => page.evaluate(() => {
      const call = window.__HARNESS_CALLS__.find((item) => item.method === 'getAudioVendorBundle');
      return Boolean(call && call.completedAt);
    })).toBe(true);
    if (scenario.name === 'success') {
      await expect.poll(() => page.evaluate(() => typeof window.Mediabunny)).toBe('object');
    }

    expect(await page.evaluate(() => ({
      mode: currentPopupMode,
      vendorLoading: hotspotAudioAttachmentState.vendorLoading,
      hasOpeningPromise: Boolean(hotspotAudioAttachmentState.editorOpeningPromise),
      editorOpen: hotspotAudioAttachmentState.editorOpen,
      label: document.getElementById('input-label').value,
      operation: hotspotAudioAttachmentState.operation,
      existingAudioId: hotspotAudioAttachmentState.existingAudioId
    }))).toEqual({
      mode: 'type',
      vendorLoading: false,
      hasOpeningPromise: false,
      editorOpen: false,
      label: preservedLabel,
      operation: 'keep',
      existingAudioId: editArgs.audioId
    });

    await page.evaluate(() => setPopupMode('info'));
    if (scenario.name === 'failure') {
      await page.evaluate(() => {
        window.__HARNESS_BEHAVIOR__.getAudioVendorBundle = { outcome: 'success' };
      });
    }
    await expect(trigger).toBeEnabled();
    await chooseAudio(page, trigger);
    await expect(page.locator('#hotspot-audio-editor-dialog')).toHaveAttribute('open', '');
    expect(await page.evaluate(() =>
      window.__HARNESS_CALLS__.filter((call) => call.method === 'getAudioVendorBundle').length
    )).toBe(scenario.expectedRequests);
    expect(await page.evaluate(() => ({
      label: document.getElementById('input-label').value,
      operation: hotspotAudioAttachmentState.operation,
      existingAudioId: hotspotAudioAttachmentState.existingAudioId
    }))).toEqual({
      label: preservedLabel,
      operation: 'keep',
      existingAudioId: editArgs.audioId
    });
    expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
  }
  expect(pageErrors).toEqual([]);
});

test('debounces pointer prefetch, starts focus prefetch immediately, and joins click requests in flight', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewportSize({ width: 1024, height: 768 });
  await openHarness(page, { mode: 'public' });

  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getHotspotAudioData = { outcome: 'success', delay: 800 };
    const marker = document.createElement('div');
    marker.id = 'prefetch-audio-marker';
    marker.style.cssText = 'position:fixed;left:40px;top:80px;width:44px;height:44px;z-index:9999';
    const args = {
      id: 'prefetch-hotspot',
      fileId: 'fixture-single-scene',
      label: '先行取得',
      audioId: 'prefetch-audio-file'
    };
    buildMarkerElement(marker, args);
    marker.addEventListener('click', (event) => onMarkerClick(event, args));
    document.body.appendChild(marker);
  });

  const marker = page.locator('#prefetch-audio-marker');
  await marker.hover();
  await page.waitForTimeout(50);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotAudioData').length)).toBe(0);

  await marker.hover();
  await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotAudioData').length)).toBe(1);
  await marker.click();
  await expect(page.locator('#active-info-popup audio')).toBeVisible();
  await expect(page.locator('.info-popup-audio-status')).toHaveText('音声を準備しています…');
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotAudioData').length)).toBe(1);
  await expect(page.locator('#active-info-popup audio')).toHaveAttribute('src', /^data:audio\/mpeg;base64,/);
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotAudioData').length)).toBe(1);
  await page.evaluate(() => closeActiveInfoPopup({ restoreFocus: false }));

  await marker.click();
  await expect(page.locator('#active-info-popup audio')).toHaveAttribute('src', /^data:audio\/mpeg;base64,/);
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotAudioData').length)).toBe(1);
  await page.evaluate(() => closeActiveInfoPopup({ restoreFocus: false }));

  await page.evaluate(() => {
    const marker = document.createElement('div');
    marker.id = 'focus-prefetch-audio-marker';
    marker.style.cssText = 'position:fixed;left:100px;top:80px;width:44px;height:44px;z-index:9999';
    buildMarkerElement(marker, {
      id: 'focus-prefetch-hotspot',
      fileId: 'fixture-single-scene',
      label: 'フォーカス先行取得',
      audioId: 'focus-prefetch-audio-file'
    });
    document.body.appendChild(marker);
  });
  await page.locator('#focus-prefetch-audio-marker').focus();
  await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotAudioData').length)).toBe(2);

  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('a response from the previous scene generation never fills the current popup', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openHarness(page, { mode: 'public' });
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getHotspotAudioData = { outcome: 'success', delay: 150 };
    onMarkerClick({ clientX: 200, clientY: 180, currentTarget: null }, {
      id: 'old-scene-hotspot',
      fileId: 'fixture-single-scene',
      label: '古いシーン',
      audioId: 'old-scene-audio'
    });
    sceneLoadGeneration += 1;
    currentFileId = 'fixture-next-scene';
    closeActiveInfoPopup({ restoreFocus: false });
    clearHotspotAudioCache();
    window.__HARNESS_BEHAVIOR__.getHotspotAudioData = { outcome: 'success', delay: 300 };
    onMarkerClick({ clientX: 220, clientY: 200, currentTarget: null }, {
      id: 'new-scene-hotspot',
      fileId: 'fixture-next-scene',
      label: '新しいシーン',
      audioId: 'new-scene-audio'
    });
  });

  await page.waitForTimeout(200);
  await expect(page.locator('#active-info-popup')).toContainText('新しいシーン');
  await expect(page.locator('#active-info-popup audio')).not.toHaveAttribute('src', /old-scene-audio/);
  await expect(page.locator('#active-info-popup audio')).toHaveAttribute('src', /^data:audio\/mpeg;base64,/);
});

test('shows a managed photo and lazy audio together in a 360-degree public hotspot', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setViewportSize({ width: 1024, height: 768 });
  await openHarness(page, { mode: 'public', sceneType: '360', storageMode: 'folder' });
  expect(await page.evaluate(() => window.__HARNESS_OPTIONS__.sceneType)).toBe('360');

  await page.evaluate(() => {
    onMarkerClick({ clientX: 220, clientY: 200, currentTarget: null }, {
      id: 'photo-audio-hotspot',
      fileId: currentFileId,
      label: '校庭の音声写真案内',
      description: '写真と音声を同時に表示',
      photoId: 'managed-photo-file',
      audioId: 'managed-audio-file'
    });
  });

  const popup = page.locator('#active-info-popup');
  await expect(popup).toBeVisible();
  await expect(popup.locator('.info-popup-photo-button')).toBeVisible();
  const audio = popup.locator('audio');
  await expect(audio).toBeVisible();
  await expect(audio).toHaveAttribute('preload', 'none');
  expect(await audio.evaluate((element) => ({ paused: element.paused, autoplay: element.autoplay }))).toEqual({
    paused: true,
    autoplay: false
  });

  const requests = await page.evaluate(() => ({
    photo: window.__HARNESS_CALLS__.find((call) => call.method === 'getHotspotPhotoDataUri').args[0],
    audio: window.__HARNESS_CALLS__.find((call) => call.method === 'getHotspotAudioData').args[0]
  }));
  expect(requests.photo).toMatchObject({
    hotspotId: 'photo-audio-hotspot',
    photoId: 'managed-photo-file'
  });
  expect(requests.audio).toMatchObject({
    hotspotId: 'photo-audio-hotspot',
    audioId: 'managed-audio-file'
  });
  expect(requests.photo.fileId).toBe(requests.audio.fileId);
  expect(requests.photo.fileId).toBeTruthy();
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});
