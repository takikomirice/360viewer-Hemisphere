const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');

const desktop = { width: 1024, height: 768 };
let harnessServer;

test.beforeAll(async () => {
  harnessServer = await startHarnessServer();
});

test.afterAll(async () => {
  if (harnessServer) await harnessServer.close();
});

async function openHarness(page, options = {}) {
  await page.setViewportSize(options.viewport || desktop);
  const params = new URLSearchParams({
    mode: options.mode || 'edit',
    sceneType: options.sceneType || '360'
  });
  if (options.delivery) params.set('delivery', options.delivery);
  if (options.storageMode) params.set('storageMode', options.storageMode);
  if (options.perf) params.set('perf', '1');
  for (const key of ['hotspotDelay', 'imageDelay', 'base64Delay', 'viewerDelay', 'imageOutcome', 'viewerOutcome']) {
    if (options[key] !== undefined) params.set(key, String(options[key]));
  }
  await page.goto(`/?${params}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
}

async function enterEditMode(page) {
  await page.locator('#mode-toggle').click();
  await expect(page.locator('body')).toHaveClass(/edit-mode-active/);
}

async function openHotspotPhotoPopup(page, label = '校庭の写真') {
  await page.evaluate((hotspotLabel) => {
    onMarkerClick({ clientX: 420, clientY: 280 }, {
      id: 'photo-hotspot',
      fileId: currentFileId || 'fixture-scene-360',
      label: hotspotLabel,
      description: '拡大表示の確認',
      photoId: 'fixture-photo'
    });
  }, label);
  await expect(page.locator('#active-info-popup')).toBeVisible();
  await expect(page.locator('#active-info-popup .info-popup-photo-button')).toBeVisible();
  return page.locator('#active-info-popup .info-popup-photo-button');
}

async function photoReadCallCount(page) {
  return page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotPhotoDataUri').length);
}

test('scene drag handles reorder only photos, preserve selection, and save one complete folder order', async ({ page }) => {
  await openHarness(page);
  await expect(page.locator('#scene-list .scene-item')).toHaveCount(2);
  await expect(page.locator('#scene-list .scene-folder-item')).toHaveCount(1);
  await expect(page.locator('#scene-list .scene-drag-handle')).toHaveCount(2);
  await expect(page.locator('#scene-list .scene-folder-item .scene-drag-handle')).toHaveCount(0);
  await expect(page.locator('#scene-list .scene-item').first()).not.toHaveAttribute('draggable', 'true');
  await expect(page.locator('#scene-list .scene-drag-handle').first()).toBeHidden();
  await expect(page.locator('#scene-list .scene-drag-handle').first()).toHaveAttribute('draggable', 'false');

  await enterEditMode(page);
  await expect(page.locator('#scene-list .scene-drag-handle').first()).toBeVisible();
  await expect(page.locator('#scene-list .scene-drag-handle').first()).toHaveAttribute('draggable', 'true');

  const selectedBefore = await page.evaluate(() => currentFileId);
  await page.locator('#scene-list .scene-drag-handle').first()
    .dragTo(page.locator('#scene-list .scene-drop-zone').last());

  await expect.poll(() => page.evaluate(() =>
    window.__HARNESS_CALLS__.filter((call) => call.method === 'reorderScenes').length
  )).toBe(1);
  expect(await page.locator('#scene-list .scene-item').evaluateAll((items) => items.map((item) => item.dataset.id)))
    .toEqual(['fixture-scene-2d', 'fixture-scene-360']);
  expect(await page.evaluate(() => currentFileId)).toBe(selectedBefore);
  await expect(page.locator(`.scene-item[data-id="${selectedBefore}"]`)).toHaveClass(/active/);

  const call = await page.evaluate(() =>
    window.__HARNESS_CALLS__.filter((entry) => entry.method === 'reorderScenes')[0]
  );
  expect(call.args[0]).toMatchObject({
    folderId: 'fixture-root-folder',
    orderedFileIds: ['fixture-scene-2d', 'fixture-scene-360']
  });
  expect(call.args[0].__editToken).toBeTruthy();

  await page.waitForTimeout(850);
  await page.locator('#scene-list .scene-item').first().click();
  await expect.poll(() => page.evaluate(() => currentFileId)).toBe('fixture-scene-2d');
  await page.locator('#scene-list .scene-item').first().click({ button: 'right' });
  await expect(page.locator('#scene-context-menu')).toBeVisible();

  await page.locator('#mode-toggle').click();
  await expect(page.locator('#scene-list .scene-drag-handle').first()).toBeHidden();
  await expect(page.locator('#scene-list .scene-drag-handle').first()).toHaveAttribute('draggable', 'false');
});

test('scene reorder rolls back on save failure and blocks a second drag while saving', async ({ page }) => {
  await openHarness(page);
  await enterEditMode(page);
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.reorderScenes = { outcome: 'error', delay: 1500 };
  });
  const originalIds = await page.locator('#scene-list .scene-item')
    .evaluateAll((items) => items.map((item) => item.dataset.id));

  await page.locator('#scene-list .scene-drag-handle').first()
    .dragTo(page.locator('#scene-list .scene-drop-zone').last());
  await expect(page.locator('#scene-list .scene-drag-handle').first()).toHaveAttribute('aria-disabled', 'true');
  expect(await page.locator('#scene-list .scene-item').evaluateAll((items) => items.map((item) => item.dataset.id)))
    .toEqual(originalIds.slice().reverse());

  await page.locator('#scene-list .scene-drag-handle').first()
    .dragTo(page.locator('#scene-list .scene-drop-zone').last());
  expect(await page.evaluate(() =>
    window.__HARNESS_CALLS__.filter((call) => call.method === 'reorderScenes').length
  )).toBe(1);

  await expect.poll(() => page.locator('#scene-list .scene-item')
    .evaluateAll((items) => items.map((item) => item.dataset.id))).toEqual(originalIds);
  await expect(page.locator('#toast')).toContainText(/保存|並び順|失敗/);
});

test('read-only scene list keeps normal selection and exposes no reorder handles', async ({ page }) => {
  await openHarness(page, { mode: 'public' });
  await expect(page.locator('#scene-list .scene-drag-handle')).toHaveCount(0);
  await page.locator('#scene-list .scene-item').nth(1).click();
  await expect.poll(() => page.evaluate(() => currentFileId)).toBe('fixture-scene-2d');
});

test('fullscreen control is hidden and inert throughout edit mode, then reusable in view mode', async ({ page }) => {
  await openHarness(page);
  const fullscreen = page.locator('#fullscreen-btn');
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen).toBeEnabled();

  await enterEditMode(page);
  await expect(fullscreen).toBeHidden();
  await expect(fullscreen).toBeDisabled();

  const rejected = await page.evaluate(() => {
    window.__FULLSCREEN_TEST__ = { request: 0, opened: 0, css: 0 };
    document.documentElement.requestFullscreen = function () {
      window.__FULLSCREEN_TEST__.request += 1;
      return Promise.reject(new Error('must not be called'));
    };
    window.open = function () {
      window.__FULLSCREEN_TEST__.opened += 1;
      return null;
    };
    const originalCssEntry = enterCssFullscreen_;
    window.enterCssFullscreen_ = function () {
      window.__FULLSCREEN_TEST__.css += 1;
      return originalCssEntry();
    };
    const result = toggleFullscreen();
    setSceneDisplayReady(false);
    setSceneDisplayReady(true);
    return { result, calls: { ...window.__FULLSCREEN_TEST__ } };
  });
  expect(rejected.result).toBe(false);
  expect(rejected.calls).toEqual({ request: 0, opened: 0, css: 0 });
  await expect(fullscreen).toBeHidden();

  await page.locator('#mode-toggle').click();
  await expect(page.locator('body')).not.toHaveClass(/edit-mode-active/);
  await expect(fullscreen).toBeVisible();
  await expect(fullscreen).toBeEnabled();

  await page.evaluate(() => enterCssFullscreen_());
  await expect(page.locator('body')).toHaveClass(/is-fullscreen/);
  await page.evaluate(() => toggleMode());
  await expect(page.locator('body')).toHaveClass(/edit-mode-active/);
  await expect(page.locator('body')).not.toHaveClass(/is-fullscreen|css-fullscreen/);
  await expect(fullscreen).toBeHidden();
});

test('native fullscreen exits before edit UI becomes active', async ({ page }) => {
  await openHarness(page);
  const immediate = await page.evaluate(() => {
    window.__NATIVE_FULLSCREEN_ACTIVE__ = true;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: function () {
        return window.__NATIVE_FULLSCREEN_ACTIVE__ ? document.documentElement : null;
      }
    });
    document.exitFullscreen = function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          window.__NATIVE_FULLSCREEN_ACTIVE__ = false;
          document.dispatchEvent(new Event('fullscreenchange'));
          resolve();
        }, 120);
      });
    };
    document.dispatchEvent(new Event('fullscreenchange'));
    document.getElementById('mode-toggle').click();
    return {
      edit: isEditMode,
      bannerVisible: document.getElementById('edit-banner').classList.contains('visible')
    };
  });

  expect(immediate).toEqual({ edit: false, bannerVisible: false });
  await expect(page.locator('body')).toHaveClass(/edit-mode-active/);
  await expect(page.locator('body')).not.toHaveClass(/is-fullscreen/);
  expect(await page.evaluate(() => window.__NATIVE_FULLSCREEN_ACTIVE__)).toBe(false);
});

test('fullscreen request is single-flight and edit waits for promise or void native entry', async ({ page }) => {
  await openHarness(page);
  let immediate = await page.evaluate(() => {
    window.__FULLSCREEN_RACE__ = { active: false, requests: 0, exits: 0, opened: 0 };
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: function () { return window.__FULLSCREEN_RACE__.active ? document.documentElement : null; }
    });
    document.documentElement.requestFullscreen = function () {
      window.__FULLSCREEN_RACE__.requests += 1;
      return new Promise(function (resolve) {
        setTimeout(function () {
          window.__FULLSCREEN_RACE__.active = true;
          document.dispatchEvent(new Event('fullscreenchange'));
          resolve();
        }, 90);
      });
    };
    document.exitFullscreen = function () {
      window.__FULLSCREEN_RACE__.exits += 1;
      return new Promise(function (resolve) {
        setTimeout(function () {
          window.__FULLSCREEN_RACE__.active = false;
          document.dispatchEvent(new Event('fullscreenchange'));
          resolve();
        }, 70);
      });
    };
    window.open = function () { window.__FULLSCREEN_RACE__.opened += 1; };
    const first = toggleFullscreen();
    const second = toggleFullscreen();
    document.getElementById('mode-toggle').click();
    return {
      first,
      second,
      requests: window.__FULLSCREEN_RACE__.requests,
      edit: isEditMode,
      pending: !!fullscreenEntryPromise
    };
  });
  expect(immediate).toEqual({ first: true, second: false, requests: 1, edit: false, pending: true });
  await expect(page.locator('body')).toHaveClass(/edit-mode-active/);
  expect(await page.evaluate(() => ({ ...window.__FULLSCREEN_RACE__, pending: !!fullscreenEntryPromise })))
    .toEqual({ active: false, requests: 1, exits: 1, opened: 0, pending: false });

  await openHarness(page);
  immediate = await page.evaluate(() => {
    window.__FULLSCREEN_VOID__ = { active: false, requests: 0, exits: 0 };
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: function () { return window.__FULLSCREEN_VOID__.active ? document.documentElement : null; }
    });
    document.documentElement.requestFullscreen = function () {
      window.__FULLSCREEN_VOID__.requests += 1;
      setTimeout(function () {
        window.__FULLSCREEN_VOID__.active = true;
        document.dispatchEvent(new Event('fullscreenchange'));
      }, 90);
    };
    document.exitFullscreen = function () {
      window.__FULLSCREEN_VOID__.exits += 1;
      window.__FULLSCREEN_VOID__.active = false;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    const started = toggleFullscreen();
    document.getElementById('mode-toggle').click();
    return { started, edit: isEditMode, pending: !!fullscreenEntryPromise };
  });
  expect(immediate).toEqual({ started: true, edit: false, pending: true });
  await expect(page.locator('body')).toHaveClass(/edit-mode-active/);
  expect(await page.evaluate(() => ({ ...window.__FULLSCREEN_VOID__, pending: !!fullscreenEntryPromise })))
    .toEqual({ active: false, requests: 1, exits: 1, pending: false });

  await openHarness(page);
  immediate = await page.evaluate(() => {
    FULLSCREEN_REQUEST_SETTLE_TIMEOUT_MS = 60;
    window.__FULLSCREEN_STALLED__ = { requests: 0, opened: 0 };
    document.documentElement.requestFullscreen = function () {
      window.__FULLSCREEN_STALLED__.requests += 1;
      return new Promise(function () {});
    };
    window.open = function () { window.__FULLSCREEN_STALLED__.opened += 1; };
    const started = toggleFullscreen();
    document.getElementById('mode-toggle').click();
    return { started, edit: isEditMode, pending: !!fullscreenEntryPromise };
  });
  expect(immediate).toEqual({ started: true, edit: false, pending: true });
  await expect(page.locator('body')).toHaveClass(/edit-mode-active/);
  expect(await page.evaluate(() => ({ ...window.__FULLSCREEN_STALLED__, pending: !!fullscreenEntryPromise })))
    .toEqual({ requests: 1, opened: 0, pending: false });
});

test('photo lightbox reuses the popup Data URI and supports all close, focus, zoom, and drag controls', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await openHarness(page, { mode: 'public' });
  const source = await openHotspotPhotoPopup(page);
  expect(await photoReadCallCount(page)).toBe(1);

  await source.click();
  const dialog = page.locator('#photo-lightbox');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#photo-lightbox-close')).toBeFocused();
  expect(await photoReadCallCount(page)).toBe(1);

  await page.locator('#photo-lightbox-zoom-in').click();
  expect(await page.evaluate(() => photoLightboxState.scale)).toBeGreaterThan(1);
  await page.locator('#photo-lightbox-zoom-out').click();
  expect(await page.evaluate(() => photoLightboxState.scale)).toBe(1);

  const stage = page.locator('#photo-lightbox-stage');
  await stage.hover();
  await page.mouse.wheel(0, -500);
  expect(await page.evaluate(() => photoLightboxState.scale)).toBeGreaterThan(1);
  await page.locator('#photo-lightbox-reset').click();
  expect(await page.evaluate(() => ({ scale: photoLightboxState.scale, x: photoLightboxState.x, y: photoLightboxState.y })))
    .toEqual({ scale: 1, x: 0, y: 0 });

  await page.locator('#photo-lightbox-zoom-in').click();
  await page.locator('#photo-lightbox-zoom-in').click();
  await page.locator('#photo-lightbox-zoom-in').click();
  const stageBox = await stage.boundingBox();
  const yawBefore = await page.evaluate(() => viewer.getYaw());
  await page.mouse.move(stageBox.x + stageBox.width * 0.52, stageBox.y + stageBox.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + stageBox.width * 0.68, stageBox.y + stageBox.height * 0.64, { steps: 4 });
  await page.mouse.up();
  const dragged = await page.evaluate(() => ({ x: photoLightboxState.x, y: photoLightboxState.y }));
  expect(Math.abs(dragged.x) + Math.abs(dragged.y)).toBeGreaterThan(0);
  expect(await page.evaluate(() => viewer.getYaw())).toBe(yawBefore);

  const overlap = await page.evaluate(() => {
    const stageRect = document.getElementById('photo-lightbox-stage').getBoundingClientRect();
    const imageRect = document.getElementById('photo-lightbox-image').getBoundingClientRect();
    return {
      width: Math.max(0, Math.min(stageRect.right, imageRect.right) - Math.max(stageRect.left, imageRect.left)),
      height: Math.max(0, Math.min(stageRect.bottom, imageRect.bottom) - Math.max(stageRect.top, imageRect.top))
    };
  });
  expect(overlap.width).toBeGreaterThan(0);
  expect(overlap.height).toBeGreaterThan(0);

  await page.locator('#photo-lightbox-close').click();
  await expect(dialog).toBeHidden();
  await expect(source).toBeFocused();
  expect(await page.evaluate(() => ({ scale: photoLightboxState.scale, x: photoLightboxState.x, y: photoLightboxState.y })))
    .toEqual({ scale: 1, x: 0, y: 0 });

  await source.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(source).toBeFocused();

  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  await page.locator('#photo-lightbox-image').click();
  await expect(dialog).toBeVisible();
  const backgroundStageBox = await stage.boundingBox();
  await stage.click({ position: { x: backgroundStageBox.width / 2, y: backgroundStageBox.height - 3 } });
  await expect(dialog).toBeHidden();
  await expect(source).toBeFocused();

  await source.click();
  await expect(dialog).toBeVisible();
  await page.locator('#photo-lightbox-backdrop').click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();
  expect(await photoReadCallCount(page)).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

const lightboxViewports = [
  { name: 'pc', width: 1024, height: 768 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
  { name: '800x360', width: 800, height: 360 }
];

for (const viewport of lightboxViewports) {
  for (const theme of ['light', 'dark']) {
    test(`photo lightbox is overflow-safe in ${viewport.name} ${theme}`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const mode = viewport.name === 'pc' ? 'internal' : 'public';
      await openHarness(page, { mode, viewport });
      await page.evaluate((nextTheme) => applyTheme(nextTheme, false), theme);
      const source = await openHotspotPhotoPopup(page, `${viewport.name} ${theme}`);
      await source.click();
      await expect(page.locator('#photo-lightbox')).toBeVisible();

      const layout = await page.evaluate(() => {
        const dialog = document.getElementById('photo-lightbox').getBoundingClientRect();
        const stage = document.getElementById('photo-lightbox-stage').getBoundingClientRect();
        const image = document.getElementById('photo-lightbox-image').getBoundingClientRect();
        const toolbar = document.querySelector('.photo-lightbox-toolbar').getBoundingClientRect();
        return {
          dialog: { left: dialog.left, top: dialog.top, right: dialog.right, bottom: dialog.bottom },
          stage: { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom },
          image: { left: image.left, top: image.top, right: image.right, bottom: image.bottom },
          toolbar: { left: toolbar.left, top: toolbar.top, right: toolbar.right, bottom: toolbar.bottom },
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          bodyWidth: document.body.scrollWidth,
          bodyClientWidth: document.body.clientWidth,
          theme: document.documentElement.getAttribute('data-theme')
        };
      });

      expect(layout.theme).toBe(theme);
      expect(layout.dialog.left).toBeGreaterThanOrEqual(0);
      expect(layout.dialog.top).toBeGreaterThanOrEqual(0);
      expect(layout.dialog.right).toBeLessThanOrEqual(viewport.width);
      expect(layout.dialog.bottom).toBeLessThanOrEqual(viewport.height);
      for (const rect of [layout.stage, layout.image, layout.toolbar]) {
        expect(rect.left).toBeGreaterThanOrEqual(-1);
        expect(rect.top).toBeGreaterThanOrEqual(-1);
        expect(rect.right).toBeLessThanOrEqual(viewport.width + 1);
        expect(rect.bottom).toBeLessThanOrEqual(viewport.height + 1);
      }
      expect(layout.documentWidth).toBe(layout.viewportWidth);
      expect(layout.bodyWidth).toBe(layout.bodyClientWidth);
      expect(errors).toEqual([]);
    });
  }
}

const parallelCases = [
  { name: 'direct image first 360', delivery: 'direct', sceneType: '360', hotspotDelay: 360, imageDelay: 80 },
  { name: 'direct GAS first 2D', delivery: 'direct', sceneType: '2D', hotspotDelay: 80, imageDelay: 360 },
  { name: 'auto image first 2D', delivery: 'auto', sceneType: '2D', hotspotDelay: 360, imageDelay: 80 },
  { name: 'auto GAS first 360', delivery: 'auto', sceneType: '360', hotspotDelay: 80, imageDelay: 360 },
  { name: 'base64 image first 360', delivery: 'base64', sceneType: '360', hotspotDelay: 360, base64Delay: 80 },
  { name: 'base64 GAS first 2D', delivery: 'base64', sceneType: '2D', hotspotDelay: 80, base64Delay: 360 }
];

for (const scenario of parallelCases) {
  test(`scene preparation runs in parallel: ${scenario.name}`, async ({ page }) => {
    await openHarness(page, { mode: 'edit', perf: true, ...scenario });
    const trace = await page.evaluate(() => {
      const hotspot = window.__HARNESS_CALLS__.find((call) => call.method === 'loadHotspots');
      const base64 = window.__HARNESS_CALLS__.find((call) => call.method === 'getImageDataUri');
      const image = window.__HARNESS_IMAGE_REQUESTS__[0] || null;
      const performanceRecord = (window.__SCENE_PERF_RECORDS__ || []).slice(-1)[0] || null;
      return {
        hotspot,
        image,
        base64,
        viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.slice(),
        viewerLoads: window.__HARNESS_VIEWER_LOADS__.slice(),
        performanceRecord,
        errors: window.__HARNESS_ERRORS__.slice()
      };
    });

    const imageWork = scenario.delivery === 'base64' ? trace.base64 : trace.image;
    expect(trace.hotspot).toBeTruthy();
    expect(imageWork).toBeTruthy();
    expect(Math.abs(trace.hotspot.startedAt - imageWork.startedAt)).toBeLessThan(40);
    expect(trace.hotspot.completedAt).toBeGreaterThan(trace.hotspot.startedAt);
    expect(imageWork.completedAt).toBeGreaterThan(imageWork.startedAt);
    if (scenario.delivery !== 'base64') {
      expect(trace.image.crossOriginAtSrc).toBe('anonymous');
    }

    const marks = trace.performanceRecord && trace.performanceRecord.marks;
    expect(marks).toBeTruthy();
    expect(marks.hotspotsStart).toBeGreaterThanOrEqual(marks.sceneStart);
    expect(marks.imagePreparationStart).toBeGreaterThanOrEqual(marks.sceneStart);
    expect(marks.hotspotsEnd).toBeGreaterThanOrEqual(marks.hotspotsStart);
    expect(marks.total - marks.sceneStart).toBeLessThan(430);

    if (scenario.sceneType === '360') {
      expect(trace.viewerCreations).toHaveLength(1);
      expect(trace.viewerCreations[0].createdAt).toBeGreaterThanOrEqual(Math.max(trace.hotspot.completedAt, imageWork.completedAt) - 15);
      expect(marks.pannellumCreateStart).toBeTruthy();
      expect(marks.pannellumLoad).toBeGreaterThanOrEqual(marks.pannellumCreateStart);
    } else {
      expect(trace.viewerCreations).toHaveLength(0);
    }
    expect(trace.errors).toEqual([]);
  });
}

test('single-image base64 starts GAS image and hotspot requests together', async ({ page }) => {
  await openHarness(page, {
    mode: 'public',
    storageMode: 'single',
    delivery: 'base64',
    perf: true,
    hotspotDelay: 260,
    base64Delay: 70
  });
  const result = await page.evaluate(() => {
    const hotspot = window.__HARNESS_CALLS__.find((call) => call.method === 'loadHotspots');
    const image = window.__HARNESS_CALLS__.find((call) => call.method === 'getImageDataUri');
    return {
      startDelta: Math.abs(hotspot.startedAt - image.startedAt),
      viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
      errors: window.__HARNESS_ERRORS__.slice()
    };
  });
  expect(result.startDelta).toBeLessThan(40);
  expect(result.viewerCreations).toBe(1);
  expect(result.errors).toEqual([]);
});

test('fixed direct still tries display after preload failure or timeout, while auto falls back on clear failure', async ({ page }) => {
  await openHarness(page, {
    mode: 'edit',
    delivery: 'direct',
    imageDelay: 30,
    imageOutcome: 'failed',
    hotspotDelay: 80
  });
  let result = await page.evaluate(() => ({
    viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
    base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length,
    errors: window.__HARNESS_ERRORS__.slice()
  }));
  expect(result).toEqual({ viewerCreations: 1, base64Calls: 0, errors: [] });

  const timeoutStartedAt = Date.now();
  await page.goto('/?mode=edit&sceneType=360&delivery=direct&imageOutcome=timeout&hotspotDelay=30', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  const timeoutElapsed = Date.now() - timeoutStartedAt;
  result = await page.evaluate(() => ({
    viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
    imageOutcomes: window.__HARNESS_IMAGE_REQUESTS__.map((request) => request.outcome),
    base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length,
    errors: window.__HARNESS_ERRORS__.slice()
  }));
  expect(timeoutElapsed).toBeGreaterThanOrEqual(3500);
  expect(timeoutElapsed).toBeLessThan(7500);
  expect(result).toEqual({ viewerCreations: 1, imageOutcomes: ['timeout'], base64Calls: 0, errors: [] });

  await page.goto('/?mode=edit&sceneType=360&delivery=auto&imageDelay=30&imageOutcome=failed&hotspotDelay=80&base64Delay=60', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  await page.waitForTimeout(180);
  result = await page.evaluate(() => ({
    viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
    viewerLoads: window.__HARNESS_VIEWER_LOADS__.length,
    base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length,
    errors: window.__HARNESS_ERRORS__.slice()
  }));
  expect(result).toEqual({ viewerCreations: 1, viewerLoads: 1, base64Calls: 1, errors: [] });
});

for (const scenario of [
  { name: 'folder 2D', storageMode: 'folder', sceneType: '2D' },
  { name: 'single-image 360', storageMode: 'single', sceneType: '360' }
]) {
  test(`auto preload failure starts Base64 promptly: ${scenario.name}`, async ({ page }) => {
    await openHarness(page, {
      mode: 'edit',
      delivery: 'auto',
      storageMode: scenario.storageMode,
      sceneType: scenario.sceneType,
      imageDelay: 1,
      hotspotDelay: 1
    });
    const baseline = await page.evaluate((currentScenario) => {
      DIRECT_FALLBACK_TIMEOUT_MS = 140;
      window.__HARNESS_IMAGE_BEHAVIOR__ = { queue: [{ delay: 5, outcome: 'failed' }] };
      window.__HARNESS_BEHAVIOR__.loadHotspots = {
        queue: [{ delay: 110, response: { hotspots: [], northOffset: 0 } }]
      };
      window.__HARNESS_BEHAVIOR__.getImageDataUri = { queue: [{ delay: 5 }] };
      window.__HARNESS_BEHAVIOR__.pannellum = { queue: [{ delay: 250, outcome: 'loaded' }] };
      const snapshot = {
        startedAt: performance.now(),
        base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length,
        viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length
      };
      if (currentScenario.storageMode === 'single') {
        loadSingleImageScene({
          fileId: 'fixture-single-scene',
          imageUrl: 'https://lh3.googleusercontent.com/d/fixture-single-scene=s0'
        });
      } else {
        loadScene(allImages.find((item) => item && item.type !== 'folder'));
      }
      return snapshot;
    }, scenario);
    await page.waitForTimeout(130);
    const result = await page.evaluate((snapshot) => {
      const base64Calls = window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri');
      const fallbackCall = base64Calls[snapshot.base64Calls] || null;
      return {
        base64Calls: base64Calls.length - snapshot.base64Calls,
        fallbackStartDelta: fallbackCall ? fallbackCall.startedAt - snapshot.startedAt : null,
        viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length - snapshot.viewerCreations,
        errors: window.__HARNESS_ERRORS__.slice()
      };
    }, baseline);
    expect(result.base64Calls).toBe(1);
    expect(result.fallbackStartDelta).toBeGreaterThanOrEqual(0);
    expect(result.fallbackStartDelta).toBeLessThan(70);
    expect(result.viewerCreations).toBe(scenario.sceneType === '360' ? 1 : 0);
    expect(result.errors).toEqual([]);
  });
}

test('auto preload hang starts Base64 from the folder scene deadline instead of adding a second timeout', async ({ page }) => {
  await openHarness(page, {
    mode: 'edit',
    delivery: 'auto',
    sceneType: '360',
    perf: true,
    imageDelay: 1,
    hotspotDelay: 1
  });
  const baseline = await page.evaluate(() => {
    DIRECT_FALLBACK_TIMEOUT_MS = 100;
    const originalDestroy = viewer.destroy.bind(viewer);
    viewer.destroy = function () {
      const blockedUntil = performance.now() + 80;
      while (performance.now() < blockedUntil) {}
      return originalDestroy();
    };
    window.__HARNESS_IMAGE_BEHAVIOR__ = { queue: [{ outcome: 'timeout' }] };
    window.__HARNESS_BEHAVIOR__.loadHotspots = {
      queue: [{ delay: 10, response: { hotspots: [], northOffset: 0 } }]
    };
    window.__HARNESS_BEHAVIOR__.getImageDataUri = { queue: [{ delay: 5 }] };
    window.__HARNESS_BEHAVIOR__.pannellum = {
      queue: [
        { delay: 250, outcome: 'loaded' },
        { delay: 20, outcome: 'loaded' }
      ]
    };
    const snapshot = {
      startedAt: performance.now(),
      base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length,
      viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
      viewerLoads: window.__HARNESS_VIEWER_LOADS__.length
    };
    loadScene(allImages.find((item) => item && item.type !== 'folder'));
    return snapshot;
  });
  await page.waitForFunction((snapshot) => (
    window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length > snapshot.base64Calls
  ), baseline);
  await page.waitForTimeout(20);
  const result = await page.evaluate((snapshot) => {
    const base64Calls = window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri');
    const fallbackCall = base64Calls[snapshot.base64Calls];
    const performanceRecord = (window.__SCENE_PERF_RECORDS__ || []).slice(-1)[0] || null;
    return {
      fallbackStartDelta: fallbackCall.startedAt - snapshot.startedAt,
      base64Calls: base64Calls.length - snapshot.base64Calls,
      viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length - snapshot.viewerCreations,
      viewerLoads: window.__HARNESS_VIEWER_LOADS__.length - snapshot.viewerLoads,
      marks: performanceRecord && performanceRecord.marks,
      errors: window.__HARNESS_ERRORS__.slice()
    };
  }, baseline);
  expect(result.fallbackStartDelta).toBeGreaterThanOrEqual(70);
  expect(result.fallbackStartDelta).toBeLessThan(150);
  expect(result.base64Calls).toBe(1);
  expect(result.viewerCreations).toBe(1);
  expect(result.viewerLoads).toBe(1);
  expect(result.marks.autoFallbackDeadline - result.marks.sceneStart).toBeGreaterThanOrEqual(90);
  expect(result.marks.autoFallbackDeadline - result.marks.sceneStart).toBeLessThan(130);
  expect(result.marks.autoFallbackStart).toBeGreaterThanOrEqual(result.marks.autoFallbackDeadline - 5);
  expect(result.marks.directDisplayStart).toBeUndefined();
  expect(result.errors).toEqual([]);
});

test('auto keeps only the scene-start remainder after preload succeeds and Pannellum stays slow', async ({ page }) => {
  await openHarness(page, { mode: 'edit', delivery: 'auto', sceneType: '360', perf: true, imageDelay: 1, hotspotDelay: 1 });
  const baseline = await page.evaluate(() => {
    DIRECT_FALLBACK_TIMEOUT_MS = 100;
    window.__HARNESS_IMAGE_BEHAVIOR__ = { queue: [{ delay: 70, outcome: 'loaded' }] };
    window.__HARNESS_BEHAVIOR__.loadHotspots = {
      queue: [{ delay: 10, response: { hotspots: [], northOffset: 0 } }]
    };
    window.__HARNESS_BEHAVIOR__.getImageDataUri = { queue: [{ delay: 5 }] };
    window.__HARNESS_BEHAVIOR__.pannellum = {
      queue: [
        { delay: 240, outcome: 'loaded' },
        { delay: 20, outcome: 'loaded' }
      ]
    };
    const snapshot = {
      startedAt: performance.now(),
      base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length,
      viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length
    };
    loadScene(allImages.find((item) => item && item.type !== 'folder'));
    return snapshot;
  });
  await page.waitForFunction((snapshot) => (
    window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length > snapshot.base64Calls
  ), baseline);
  const result = await page.evaluate((snapshot) => {
    const base64Calls = window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri');
    const record = (window.__SCENE_PERF_RECORDS__ || []).slice(-1)[0] || null;
    return {
      fallbackStartDelta: base64Calls[snapshot.base64Calls].startedAt - snapshot.startedAt,
      base64Calls: base64Calls.length - snapshot.base64Calls,
      viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length - snapshot.viewerCreations,
      marks: record && record.marks,
      errors: window.__HARNESS_ERRORS__.slice()
    };
  }, baseline);
  expect(result.fallbackStartDelta).toBeGreaterThanOrEqual(70);
  expect(result.fallbackStartDelta).toBeLessThan(150);
  expect(result.base64Calls).toBe(1);
  expect(result.viewerCreations).toBe(1);
  expect(result.marks.directDisplayStart).toBeGreaterThanOrEqual(result.marks.sceneStart);
  expect(result.marks.autoFallbackStart).toBeGreaterThanOrEqual(result.marks.autoFallbackDeadline - 5);
  expect(result.errors).toEqual([]);
});

for (const scenario of [
  { name: 'folder 360', storageMode: 'folder', sceneType: '360' },
  { name: 'folder 2D', storageMode: 'folder', sceneType: '2D' },
  { name: 'single-image 360', storageMode: 'single', sceneType: '360' }
]) {
  test(`auto direct success before the deadline cancels Base64: ${scenario.name}`, async ({ page }) => {
    await openHarness(page, {
      mode: 'edit',
      delivery: 'auto',
      storageMode: scenario.storageMode,
      sceneType: scenario.sceneType,
      perf: true,
      imageDelay: 1,
      hotspotDelay: 1
    });
    const baseline = await page.evaluate((currentScenario) => {
      DIRECT_FALLBACK_TIMEOUT_MS = 100;
      window.__HARNESS_IMAGE_BEHAVIOR__ = { queue: [{ delay: 5, outcome: 'loaded' }] };
      window.__HARNESS_BEHAVIOR__.loadHotspots = {
        queue: [{ delay: 5, response: { hotspots: [], northOffset: 0 } }]
      };
      window.__HARNESS_BEHAVIOR__.pannellum = { queue: [{ delay: 10, outcome: 'loaded' }] };
      const snapshot = {
        base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length,
        viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length
      };
      if (currentScenario.storageMode === 'single') {
        loadSingleImageScene({
          fileId: 'fixture-single-scene',
          imageUrl: 'https://lh3.googleusercontent.com/d/fixture-single-scene=s0'
        });
      } else {
        loadScene(allImages.find((item) => item && item.type !== 'folder'));
      }
      return snapshot;
    }, scenario);
    await page.waitForFunction(() => !isSwitching);
    await page.waitForTimeout(130);
    const result = await page.evaluate((snapshot) => {
      const record = (window.__SCENE_PERF_RECORDS__ || []).slice(-1)[0] || null;
      return {
        base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length - snapshot.base64Calls,
        viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length - snapshot.viewerCreations,
        marks: record && record.marks,
        errors: window.__HARNESS_ERRORS__.slice()
      };
    }, baseline);
    expect(result.base64Calls).toBe(0);
    expect(result.viewerCreations).toBe(scenario.sceneType === '360' ? 1 : 0);
    expect(result.marks.directDisplayStart).toBeGreaterThanOrEqual(result.marks.sceneStart);
    expect(result.marks.autoFallbackStart).toBeUndefined();
    expect(result.errors).toEqual([]);
  });
}

test('auto fallback queues until a loading Pannellum 2.5.6 viewer can change scenes', async ({ page }) => {
  await openHarness(page, { mode: 'edit', delivery: 'auto', imageDelay: 20, hotspotDelay: 20 });
  const initial = await page.evaluate(() => ({
    viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
    viewerLoads: window.__HARNESS_VIEWER_LOADS__.length,
    base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length
  }));
  await page.evaluate(() => {
    DIRECT_FALLBACK_TIMEOUT_MS = 70;
    window.__HARNESS_BEHAVIOR__.pannellum = {
      queue: [
        { delay: 180, outcome: 'loaded' },
        { delay: 20, outcome: 'loaded' }
      ]
    };
    window.__HARNESS_BEHAVIOR__.getImageDataUri = {
      queue: [{
        delay: 10,
        response: {
          success: true,
          imageUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%20data-route%3D%22fallback-route%22%3E%3C%2Fsvg%3E'
        }
      }]
    };
    loadScene(allImages.find((item) => item && item.type !== 'folder'));
  });
  await page.waitForFunction((baseline) => (
    !isSwitching &&
    window.__HARNESS_VIEWER_LOADS__.length - baseline.viewerLoads === 2 &&
    window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length - baseline.base64Calls === 1
  ), initial);
  const result = await page.evaluate((baseline) => ({
    viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length - baseline.viewerCreations,
    viewerLoads: window.__HARNESS_VIEWER_LOADS__.length - baseline.viewerLoads,
    base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length - baseline.base64Calls,
    currentScene: viewer && typeof viewer.getScene === 'function' ? viewer.getScene() : '',
    panoramas: window.__HARNESS_VIEWER_LOADS__.slice(baseline.viewerLoads).map((load) => load.panorama),
    errors: window.__HARNESS_ERRORS__.slice()
  }), initial);
  expect(result.viewerCreations).toBe(1);
  expect(result.viewerLoads).toBe(2);
  expect(result.base64Calls).toBe(1);
  expect(result.currentScene).toMatch(/^__delivery_/);
  expect(result.panoramas).toHaveLength(2);
  expect(result.panoramas[0]).not.toContain('fallback-route');
  expect(result.panoramas[1]).toContain('fallback-route');
  expect(result.errors).toEqual([]);
});

test('an auto fallback response from an older generation never creates or replaces the newer viewer', async ({ page }) => {
  await openHarness(page, { mode: 'edit', delivery: 'auto', sceneType: '360', imageDelay: 1, hotspotDelay: 1 });
  const baseline = await page.evaluate(() => {
    DIRECT_FALLBACK_TIMEOUT_MS = 50;
    window.__HARNESS_IMAGE_BEHAVIOR__ = {
      queue: [
        { outcome: 'timeout' },
        { delay: 5, outcome: 'loaded' }
      ]
    };
    window.__HARNESS_BEHAVIOR__.loadHotspots = {
      queue: [
        { delay: 10, response: { hotspots: [{ id: 'old', label: 'OLD', pitch: 0, yaw: 0 }], northOffset: 0 } },
        { delay: 5, response: { hotspots: [{ id: 'new', label: 'NEW', pitch: 1, yaw: 1 }], northOffset: 0 } }
      ]
    };
    window.__HARNESS_BEHAVIOR__.getImageDataUri = {
      queue: [{
        delay: 180,
        response: {
          success: true,
          imageUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%20data-route%3D%22old-fallback%22%3E%3C%2Fsvg%3E'
        }
      }]
    };
    window.__HARNESS_BEHAVIOR__.pannellum = { queue: [{ delay: 15, outcome: 'loaded' }] };
    const snapshot = {
      viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
      viewerLoads: window.__HARNESS_VIEWER_LOADS__.length,
      base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length
    };
    const scenes = allImages.filter((item) => item && item.type !== 'folder');
    loadScene(scenes[1]);
    setTimeout(function () { loadScene(scenes[0]); }, 70);
    return snapshot;
  });
  await page.waitForFunction(() => !isSwitching && currentFileId === 'fixture-scene-360');
  await page.waitForTimeout(220);
  const result = await page.evaluate((snapshot) => ({
    currentFileId,
    viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length - snapshot.viewerCreations,
    viewerLoads: window.__HARNESS_VIEWER_LOADS__.slice(snapshot.viewerLoads).map((load) => ({
      panorama: load.panorama,
      hotspotLabels: load.hotspotLabels
    })),
    base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length - snapshot.base64Calls,
    errors: window.__HARNESS_ERRORS__.slice()
  }), baseline);
  expect(result.currentFileId).toBe('fixture-scene-360');
  expect(result.viewerCreations).toBe(1);
  expect(result.viewerLoads).toHaveLength(1);
  expect(result.viewerLoads[0].panorama).not.toContain('old-fallback');
  expect(result.viewerLoads[0].hotspotLabels).toEqual(['NEW']);
  expect(result.base64Calls).toBe(1);
  expect(result.errors).toEqual([]);
});

test('new scene generation discards older image and GAS completions', async ({ page }) => {
  await openHarness(page, { mode: 'edit', delivery: 'direct', imageDelay: 20, hotspotDelay: 20, perf: true });
  const initialViewerCount = await page.evaluate(() => window.__HARNESS_VIEWER_CREATIONS__.length);
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.loadHotspots = {
      queue: [
        {
          delay: 240,
          response: { hotspots: [{ id: 'old', label: 'OLD', pitch: 0, yaw: 0, markerShape: 'circle', markerColor: 'red', markerIcon: 'info' }], northOffset: 0 }
        },
        {
          delay: 35,
          response: { hotspots: [{ id: 'new', label: 'NEW', pitch: 1, yaw: 1, markerShape: 'circle', markerColor: 'blue', markerIcon: 'info' }], northOffset: 0 }
        }
      ]
    };
    window.__HARNESS_IMAGE_BEHAVIOR__ = {
      queue: [
        { delay: 220, outcome: 'loaded' },
        { delay: 20, outcome: 'loaded' }
      ]
    };
    const scenes = allImages.filter((item) => item.type !== 'folder');
    loadScene(scenes[1]);
    setTimeout(function () { loadScene(scenes[0]); }, 10);
  });
  await page.waitForFunction(() => !isSwitching && currentFileId === 'fixture-scene-360');
  await page.waitForTimeout(280);
  const result = await page.evaluate(() => ({
    currentFileId,
    viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
    lastLabels: (window.__HARNESS_VIEWER_CREATIONS__.slice(-1)[0] || {}).hotspotLabels || [],
    discardedLoads: window.__HARNESS_VIEWER_LOADS__.filter((load) => load.discarded).length,
    perfRecords: (window.__SCENE_PERF_RECORDS__ || []).map((record) => ({
      status: record.status,
      finished: !!record.finished,
      hasTotal: !!(record.marks && Object.prototype.hasOwnProperty.call(record.marks, 'total'))
    })),
    errors: window.__HARNESS_ERRORS__.slice()
  }));
  expect(result.currentFileId).toBe('fixture-scene-360');
  expect(result.viewerCreations - initialViewerCount).toBe(1);
  expect(result.lastLabels).toEqual(['NEW']);
  expect(result.perfRecords.some((record) => record.status === 'superseded')).toBe(true);
  expect(result.perfRecords.every((record) => record.finished && record.hasTotal)).toBe(true);
  expect(result.errors).toEqual([]);
});

test('base64 generation discards older GAS image and hotspot responses before 2D display', async ({ page }) => {
  await openHarness(page, { mode: 'edit', sceneType: '2D', delivery: 'base64', base64Delay: 20, hotspotDelay: 20 });
  const initial = await page.evaluate(() => ({
    viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
    base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length
  }));
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.loadHotspots = {
      queue: [
        {
          delay: 240,
          response: { hotspots: [{ id: 'old', label: 'OLD', pitch: 0, yaw: 0, markerShape: 'circle', markerColor: 'red', markerIcon: 'info' }], northOffset: 0 }
        },
        {
          delay: 35,
          response: { hotspots: [{ id: 'new', label: 'NEW', pitch: 1, yaw: 1, markerShape: 'circle', markerColor: 'blue', markerIcon: 'info' }], northOffset: 0 }
        }
      ]
    };
    window.__HARNESS_BEHAVIOR__.getImageDataUri = {
      queue: [
        { delay: 220 },
        { delay: 25 }
      ]
    };
    const scenes = allImages.filter((item) => item.type !== 'folder');
    loadScene(scenes[1]);
    setTimeout(function () { loadScene(scenes[0]); }, 10);
  });
  await page.waitForFunction(() => !isSwitching && currentFileId === 'fixture-scene-2d');
  await page.waitForTimeout(280);
  const result = await page.evaluate(() => ({
    currentFileId,
    current2DLabels: current2DHotspots.map((hotspot) => hotspot.label),
    viewerCreations: window.__HARNESS_VIEWER_CREATIONS__.length,
    base64Calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getImageDataUri').length,
    flatMapVisible: getComputedStyle(document.getElementById('flat-map-container')).display !== 'none',
    errors: window.__HARNESS_ERRORS__.slice()
  }));
  expect(result.currentFileId).toBe('fixture-scene-2d');
  expect(result.current2DLabels).toEqual(['NEW']);
  expect(result.viewerCreations - initial.viewerCreations).toBe(0);
  expect(result.base64Calls - initial.base64Calls).toBe(2);
  expect(result.flatMapVisible).toBe(true);
  expect(result.errors).toEqual([]);
});

test('performance records are absent unless perf=1 and contain no URLs or scene IDs', async ({ page }) => {
  const performanceLogs = [];
  page.on('console', (message) => {
    if (message.text().startsWith('[scene-perf]')) performanceLogs.push(message.text());
  });
  await openHarness(page, { mode: 'public', delivery: 'direct' });
  expect(await page.evaluate(() => (window.__SCENE_PERF_RECORDS__ || []).length)).toBe(0);
  expect(performanceLogs).toHaveLength(0);

  await page.goto('/?mode=public&sceneType=360&delivery=direct&perf=1&imageDelay=20&hotspotDelay=20', { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  const serialized = await page.evaluate(() => JSON.stringify((window.__SCENE_PERF_RECORDS__ || []).slice(-1)[0] || null));
  for (const mark of [
    'sceneStart',
    'imagePreparationStart',
    'hotspotsStart',
    'hotspotsEnd',
    'imagePreloadComplete',
    'pannellumCreateStart',
    'pannellumLoad',
    'total'
  ]) {
    expect(serialized).toContain(mark);
  }
  expect(serialized).not.toContain('fixture-scene');
  expect(serialized).not.toContain('googleusercontent');
  expect(serialized).not.toContain('data:image');
  expect(performanceLogs).toHaveLength(1);
});
