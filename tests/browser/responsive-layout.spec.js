const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');

const rootDir = path.resolve(__dirname, '..', '..');
const artifactRoot = path.join(rootDir, 'output', 'playwright');
const viewports = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1024x768', width: 1024, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-360x800', width: 360, height: 800 },
  { name: 'landscape-800x360', width: 800, height: 360 }
];
const selectableMarkerIcons = [
  'info', 'photo', 'audio', 'link', 'wifi', 'quiz', 'eye', 'warning', 'flag',
  'animal', 'leaf', 'flower', 'historic'
];
const legacyMarkerIcons = ['video'];
const supportedMarkerIcons = selectableMarkerIcons.concat(legacyMarkerIcons);
const hotspotPhotoUploadOption = '__hotspot_photo_upload__';
const tinyPngFile = {
  name: 'camera-photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
};

let harnessServer;

test.beforeAll(async () => {
  harnessServer = await startHarnessServer();
});

test.afterAll(async () => {
  if (harnessServer) await harnessServer.close();
});

test.beforeEach(async ({ page }) => {
  // Fixture scene IDs do not exist on Drive. Keep layout checks independent of Google responses.
  // Direct delivery and fallback behavior are covered separately in thumbnail-delivery.spec.js.
  await page.route(/^https:\/\/lh3\.googleusercontent\.com\/d\/fixture-[^/?]+=w320$/, route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#0f766e"/><rect x="30" y="25" width="120" height="100" fill="#67e8f9"/></svg>'
  }));
});

async function openHarness(page, viewport, options) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const params = new URLSearchParams({
    mode: options.mode,
    sceneType: options.sceneType
  });
  if (options.storageMode) params.set('storageMode', options.storageMode);
  await page.goto(`/?${params.toString()}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  if (options.storageMode === 'single') {
    await expect(page.locator('#scene-sidebar')).toHaveClass(/hidden/);
  } else {
    await expect(page.locator('#scene-sidebar')).not.toHaveClass(/hidden/);
  }
}

async function activateEditing(page) {
  if (await page.locator('body').evaluate((body) => body.classList.contains('edit-mode-active'))) return;
  await page.locator('#mode-toggle').click();
  await expect(page.locator('#edit-banner')).toHaveClass(/visible/);
}

async function openNewHotspotForm(page, sceneType) {
  await activateEditing(page);
  const target = page.locator(sceneType === '2D' ? '#flat-map-img' : activeContentSelector(sceneType));
  await expect(target).toBeVisible();
  const rect = await target.boundingBox();
  expect(rect).not.toBeNull();
  const point = {
    x: rect.x + Math.max(36, rect.width * 0.42),
    y: rect.y + Math.max(36, rect.height * 0.28)
  };
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#hotspot-popup')).toHaveClass(/visible/);
  if (await page.locator('#hs-type-selector').isVisible()) {
    await page.locator('#hs-type-selector .hs-type-btn').first().click();
  }
  await expect(page.locator('#hs-form')).toBeVisible();
  return { target, rect, point };
}

async function openNewHotspotFormDirect(page, offset = 0) {
  await activateEditing(page);
  const opened = await page.evaluate((value) => {
    pendingPitch = 12 + value;
    pendingYaw = 24 + value;
    return openPopup(220, 180);
  }, offset);
  expect(opened).toBe(true);
  await expect(page.locator('#hotspot-popup')).toHaveClass(/visible/);
  if (await page.locator('#hs-type-selector').isVisible()) {
    await page.locator('#hs-type-selector .hs-type-btn').first().click();
  }
  await expect(page.locator('#hs-form')).toBeVisible();
}

async function chooseHotspotPhoto(page, options = {}) {
  const file = {
    ...tinyPngFile,
    name: options.name || tinyPngFile.name
  };
  const fileChooserPromise = page.waitForEvent('filechooser');
  if (options.changeExisting) {
    await page.locator('#hotspot-photo-change-btn').click();
  } else {
    await page.locator('#input-photo-id').selectOption(hotspotPhotoUploadOption);
  }
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(file);
  await page.waitForFunction(() => !hotspotPhotoUploadState.processing && !!hotspotPhotoUploadState.blob);
  await expect(page.locator('#hotspot-photo-upload-card')).toBeVisible();
  await expect(page.locator('#hotspot-photo-error')).toBeHidden();
}

async function cancelHotspotPhotoChooser(page) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('#input-photo-id').selectOption(hotspotPhotoUploadOption);
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles([]);
  await page.locator('#hotspot-photo-file-input').dispatchEvent('cancel');
}

async function readPhotoUploadGeometry(page) {
  return page.evaluate(() => {
    function rect(id) {
      const element = document.getElementById(id);
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height
      };
    }
    return {
      popup: rect('hotspot-popup'),
      content: rect('hotspot-popup-content'),
      card: rect('hotspot-photo-upload-card'),
      change: rect('hotspot-photo-change-btn'),
      clear: rect('hotspot-photo-clear-btn'),
      save: rect('btn-save'),
      cancel: rect('hs-back-btn'),
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth
    };
  });
}

async function readDraftState(page) {
  return page.evaluate(() => ({
    active: hotspotDraftState.active,
    startSceneId: hotspotDraftState.startSceneId,
    sceneType: hotspotDraftState.sceneType,
    coordinates: hotspotDraftState.coordinates && { ...hotspotDraftState.coordinates },
    initialCoordinates: hotspotDraftState.initialCoordinates && { ...hotspotDraftState.initialCoordinates },
    positionBeforeChange: hotspotDraftState.positionBeforeChange && { ...hotspotDraftState.positionBeforeChange },
    repositioning: hotspotDraftState.repositioning,
    formStartSceneId: hotspotFormSessionState.startSceneId,
    currentFileId
  }));
}

async function readPopupGeometry(page) {
  return page.evaluate(() => {
    const popup = document.getElementById('hotspot-popup');
    const content = document.getElementById('hotspot-popup-content');
    const footer = document.getElementById('hotspot-popup-footer');
    const save = document.getElementById('btn-save');
    const cancel = document.getElementById('hs-back-btn');
    const visual = window.visualViewport;
    function rect(element) {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height
      };
    }
    return {
      popup: rect(popup),
      content: rect(content),
      footer: rect(footer),
      save: rect(save),
      cancel: rect(cancel),
      contentClientHeight: content.clientHeight,
      contentScrollHeight: content.scrollHeight,
      popupBackground: getComputedStyle(popup).backgroundColor,
      popupBorderTopLeftRadius: getComputedStyle(popup).borderTopLeftRadius,
      popupBorderBottomLeftRadius: getComputedStyle(popup).borderBottomLeftRadius,
      viewport: visual
        ? { left: visual.offsetLeft, top: visual.offsetTop, right: visual.offsetLeft + visual.width, bottom: visual.offsetTop + visual.height, width: visual.width, height: visual.height }
        : { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight },
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth
    };
  });
}

async function collectLayout(page) {
  return page.evaluate(() => {
    function snapshot(element) {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        visibility: style.visibility,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        backgroundColor: style.backgroundColor,
        color: style.color,
        filter: style.filter,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      };
    }
    const selectors = [
      'body',
      '#topbar',
      '#edit-banner',
      '#panorama',
      '#flat-map-container',
      '#flat-map-img',
      '#scene-sidebar',
      '#loading',
      '#scene-transition-overlay',
      '#sidebar-expand-tab',
      '#toast',
      '#hint-bar',
      '#mobile-scene-sheet-toggle',
      '#bulk-input-trigger',
      '#embed-btn',
      '#mode-badge',
      '#mode-toggle',
      '#toolbar-theme-toggle',
      '#floating-theme-toggle',
      '#scene-refresh-btn',
      '#sidebar-collapse-btn',
      '#upload-btn',
      '#open-folder-btn',
      '#open-hotspot-folder-btn',
      '#open-hotspot-folder-topbar-btn',
      '#scene-list .scene-item',
      '#fullscreen-btn',
      '#btn-home',
      '#quality-toggle-btn',
      '#gyro-toggle-btn'
    ];
    const elements = {};
    selectors.forEach((selector) => {
      elements[selector] = snapshot(document.querySelector(selector));
    });
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      theme: document.documentElement.getAttribute('data-theme'),
      colorScheme: rootStyle.colorScheme,
      scroll: {
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth
      },
      cssVariables: {
        topOffset: bodyStyle.getPropertyValue('--app-top-offset').trim(),
        viewportHeight: bodyStyle.getPropertyValue('--app-viewport-height').trim(),
        toolbarHeight: rootStyle.getPropertyValue('--app-toolbar-height').trim(),
        editBannerHeight: rootStyle.getPropertyValue('--app-edit-banner-height').trim()
      },
      bodyClasses: Array.from(document.body.classList),
      harnessErrors: window.__HARNESS_ERRORS__.slice(),
      elements
    };
  });
}

function activeContentSelector(sceneType) {
  return sceneType === '2D' ? '#flat-map-container' : '#panorama';
}

function assertNear(actual, expected, tolerance, message) {
  expect(Math.abs(actual - expected), message).toBeLessThanOrEqual(tolerance);
}

function assertInsideViewport(rect, viewport, label) {
  expect(rect.visible, `${label} should be visible`).toBe(true);
  expect(rect.left, `${label} left`).toBeGreaterThanOrEqual(-1);
  expect(rect.top, `${label} top`).toBeGreaterThanOrEqual(-1);
  expect(rect.right, `${label} right`).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.bottom, `${label} bottom`).toBeLessThanOrEqual(viewport.height + 1);
}

function overlapArea(left, right) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function parseRgb(color) {
  const match = String(color).match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unsupported computed color: ${color}`);
  return match.slice(1, 4).map(Number);
}

function relativeLuminance(color) {
  const channels = parseRgb(color).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function seedStoredTheme(page, theme) {
  await page.addInitScript(({ storageKey, storedTheme }) => {
    window.localStorage.setItem(storageKey, storedTheme);
  }, { storageKey: 'hemisphereTheme', storedTheme: theme });
}

async function readThemeState(page) {
  return page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    storedTheme: window.localStorage.getItem('hemisphereTheme'),
    controls: Array.from(document.querySelectorAll('.theme-toggle')).map((control) => {
      const style = getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      return {
        id: control.id,
        label: control.getAttribute('aria-label'),
        title: control.getAttribute('title'),
        pressed: control.getAttribute('aria-pressed'),
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      };
    })
  }));
}

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

async function focusWithKeyboard(page, selector) {
  await page.evaluate(() => {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  });
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate((element) => document.activeElement === element)) return;
  }
  throw new Error(`${selector} was not reachable with the Tab key`);
}

for (const mode of ['public', 'internal', 'edit']) {
  test(`theme mode visibility ${mode}`, async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await openHarness(page, viewports[1], { mode, sceneType: '360' });

    const layout = await collectLayout(page);
    const toolbarToggle = layout.elements['#toolbar-theme-toggle'];
    const floatingToggle = layout.elements['#floating-theme-toggle'];
    const visibleCount = [toolbarToggle, floatingToggle].filter((control) => control && control.visible).length;

    expect(visibleCount).toBe(1);
    if (mode === 'edit') {
      expect(layout.elements['#topbar'].visible).toBe(true);
      expect(toolbarToggle.visible).toBe(true);
      expect(floatingToggle.visible).toBe(false);
    } else {
      expect(layout.elements['#topbar'].visible).toBe(false);
      expect(toolbarToggle.visible).toBe(false);
      expect(floatingToggle.visible).toBe(true);
    }
    expect(runtimeErrors).toEqual([]);
  });
}

for (const theme of ['light', 'dark']) {
  test(`theme component surfaces and contrast ${theme}`, async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);
    await seedStoredTheme(page, theme);
    await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
    await activateEditing(page);

    const controlSurfaces = await page.evaluate(() => {
      const sidebarBackground = getComputedStyle(document.getElementById('scene-sidebar')).backgroundColor;
      return [
        { selector: '#topbar' },
        { selector: '#toolbar-theme-toggle' },
        { selector: '#bulk-input-trigger' },
        { selector: '#embed-btn' },
        { selector: '#mode-toggle' },
        { selector: '#upload-btn' },
        { selector: '#open-folder-btn', inheritedBackground: sidebarBackground },
        { selector: '#open-hotspot-folder-btn', inheritedBackground: sidebarBackground }
      ].map((item) => {
        const style = getComputedStyle(document.querySelector(item.selector));
        return {
          selector: item.selector,
          foreground: style.color,
          background: item.inheritedBackground || style.backgroundColor
        };
      });
    });
    for (const surface of controlSurfaces) {
      expect(contrastRatio(surface.foreground, surface.background), `${surface.selector} text contrast`).toBeGreaterThanOrEqual(4.5);
    }

    await page.locator('#embed-btn').click();
    await expect(page.locator('#embed-modal')).toHaveClass(/visible/);
    const shareSurfaces = await page.locator('#embed-modal, #share-output').evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return { id: element.id, foreground: style.color, background: style.backgroundColor };
    }));
    for (const surface of shareSurfaces) {
      expect(contrastRatio(surface.foreground, surface.background), `${surface.id} text contrast`).toBeGreaterThanOrEqual(4.5);
    }
    await page.locator('.embed-modal-close').click();

    await page.locator('#upload-btn').click();
    await expect(page.locator('#upload-modal')).toBeVisible();
    const uploadSurface = await page.locator('#upload-modal-inner').evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundColor };
    });
    expect(contrastRatio(uploadSurface.foreground, uploadSurface.background), 'upload modal text contrast').toBeGreaterThanOrEqual(4.5);
    await page.evaluate(() => closeUploadModal());

    const panorama = await page.locator('#panorama').boundingBox();
    await page.mouse.click(panorama.x + panorama.width * 0.55, panorama.y + panorama.height * 0.5);
    await expect(page.locator('#hotspot-popup')).toHaveClass(/visible/);
    const popupSurface = await page.locator('#hotspot-popup').evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundColor, accent: style.borderTopColor };
    });
    expect(contrastRatio(popupSurface.foreground, popupSurface.background), 'hotspot popup text contrast').toBeGreaterThanOrEqual(4.5);
    if (theme === 'dark') {
      const background = parseRgb(popupSurface.background);
      const accent = parseRgb(popupSurface.accent);
      expect(Math.max(...background) - Math.min(...background), 'dark popup should use a neutral charcoal surface').toBeLessThanOrEqual(8);
      expect(Math.max(...background), 'dark popup should stay dark').toBeLessThanOrEqual(40);
      expect(accent[2] - accent[0], 'dark popup accent should be cool blue rather than amber').toBeGreaterThanOrEqual(80);

      await page.locator('#hs-type-selector .hs-type-btn').first().click();
      const saveBackground = await page.locator('#btn-save').evaluate((element) => getComputedStyle(element).backgroundColor);
      const saveAccent = parseRgb(saveBackground);
      expect(saveAccent[2] - saveAccent[0], 'dark save action should use the cool accent').toBeGreaterThanOrEqual(40);
    }
    await page.evaluate(() => closePopup());

    await page.evaluate(() => showToast('テーマのコントラスト確認', 'success'));
    await expect(page.locator('#toast')).toHaveClass(/show/);
    const toastSurface = await page.locator('#toast').evaluate((element) => {
      const style = getComputedStyle(element);
      return { foreground: style.color, background: style.backgroundColor };
    });
    expect(contrastRatio(toastSurface.foreground, toastSurface.background), 'toast text contrast').toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('#hint-bar')).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  });
}

test('theme initial state uses a valid saved preference before OS preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await seedStoredTheme(page, 'light');
  await openHarness(page, viewports[2], { mode: 'public', sceneType: '360' });

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect((await readThemeState(page)).storedTheme).toBe('light');
});

for (const colorScheme of ['light', 'dark']) {
  test(`theme initial state falls back to ${colorScheme} OS preference`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openHarness(page, viewports[2], { mode: 'internal', sceneType: '2D' });

    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    expect((await readThemeState(page)).storedTheme).toBeNull();
  });
}

test('theme persistence synchronizes both controls and survives reload', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await openHarness(page, viewports[3], { mode: 'public', sceneType: '360' });

  const before = await readThemeState(page);
  expect(before.theme).toBe('light');
  expect(before.storedTheme).toBeNull();
  await page.locator('#floating-theme-toggle').click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const after = await readThemeState(page);
  expect(after.storedTheme).toBe('dark');
  expect(after.controls).toHaveLength(2);
  for (const control of after.controls) {
    expect(control.label).toBe('ライトテーマに切り替える');
    expect(control.title).toBe('ライトテーマに切り替える');
    expect(control.pressed).toBe('true');
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await readThemeState(page)).storedTheme).toBe('dark');
  expect(runtimeErrors).toEqual([]);
});

for (const viewport of viewports) {
  for (const mode of ['public', 'internal', 'edit']) {
    for (const sceneType of ['360', '2D']) {
      for (const theme of ['light', 'dark']) {
        test(`theme responsive layout and image integrity ${theme} ${mode} ${sceneType} ${viewport.name}`, async ({ page }) => {
          const runtimeErrors = collectRuntimeErrors(page);
          await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' });
          await seedStoredTheme(page, theme);
          await openHarness(page, viewport, { mode, sceneType });
          if (mode === 'edit') await activateEditing(page);

          const layout = await collectLayout(page);
          const contentSelector = activeContentSelector(sceneType);
          const content = layout.elements[contentSelector];
          const activeThemeSelector = mode === 'edit' ? '#toolbar-theme-toggle' : '#floating-theme-toggle';
          const inactiveThemeSelector = mode === 'edit' ? '#floating-theme-toggle' : '#toolbar-theme-toggle';
          const activeThemeButton = layout.elements[activeThemeSelector];

          expect(layout.theme).toBe(theme);
          expect(layout.colorScheme).toContain(theme);
          expect(layout.elements[inactiveThemeSelector].visible).toBe(false);
          assertInsideViewport(activeThemeButton, layout.viewport, activeThemeSelector);
          expect(activeThemeButton.width, `${activeThemeSelector} tap width`).toBeGreaterThanOrEqual(44);
          expect(activeThemeButton.height, `${activeThemeSelector} tap height`).toBeGreaterThanOrEqual(44);
          assertInsideViewport(content, layout.viewport, contentSelector);
          expect(content.width).toBeGreaterThan(100);
          expect(content.height).toBeGreaterThan(80);
          expect(layout.scroll.documentScrollWidth).toBeLessThanOrEqual(layout.scroll.documentClientWidth + 1);
          expect(layout.scroll.bodyScrollWidth).toBeLessThanOrEqual(layout.scroll.bodyClientWidth + 1);

          if (mode !== 'edit') {
            for (const selector of ['#fullscreen-btn', '#btn-home', '#quality-toggle-btn', '#gyro-toggle-btn']) {
              const control = layout.elements[selector];
              if (control && control.visible) {
                expect(overlapArea(activeThemeButton, control), `${activeThemeSelector} overlaps ${selector}`).toBe(0);
              }
            }
            const sidebar = layout.elements['#scene-sidebar'];
            if (sidebar && sidebar.visible) {
              expect(overlapArea(activeThemeButton, sidebar), `${activeThemeSelector} overlaps scene list`).toBe(0);
            }
          }

          const imageSelectors = sceneType === '2D'
            ? ['#flat-map-container', '#flat-map-img']
            : ['#panorama'];
          for (const selector of imageSelectors) {
            const imageSurface = layout.elements[selector];
            expect(imageSurface, `${selector} should exist`).not.toBeNull();
            expect(imageSurface.filter, `${selector} theme filter`).toBe('none');
          }

          await focusWithKeyboard(page, activeThemeSelector);
          const focusStyle = await page.locator(activeThemeSelector).evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              outlineStyle: style.outlineStyle,
              outlineWidth: parseFloat(style.outlineWidth) || 0,
              boxShadow: style.boxShadow
            };
          });
          expect(
            (focusStyle.outlineStyle !== 'none' && focusStyle.outlineWidth > 0) || focusStyle.boxShadow !== 'none',
            `${activeThemeSelector} should have a visible focus ring`
          ).toBe(true);

          expect(layout.harnessErrors).toEqual([]);
          expect(runtimeErrors).toEqual([]);
        });
      }
    }
  }
}

for (const viewport of viewports) {
  for (const mode of ['public', 'internal']) {
    for (const theme of ['light', 'dark']) {
      test(`theme fullscreen layout ${theme} ${mode} ${viewport.name}`, async ({ page }) => {
        const runtimeErrors = collectRuntimeErrors(page);
        await seedStoredTheme(page, theme);
        await openHarness(page, viewport, { mode, sceneType: '360' });
        await page.evaluate(() => enterCssFullscreen_());
        await expect(page.locator('body')).toHaveClass(/is-fullscreen/);

        const layout = await collectLayout(page);
        const floatingTheme = layout.elements['#floating-theme-toggle'];
        expect(layout.elements['#topbar'].visible).toBe(false);
        expect(layout.elements['#toolbar-theme-toggle'].visible).toBe(false);
        assertInsideViewport(floatingTheme, layout.viewport, '#floating-theme-toggle fullscreen');
        for (const selector of ['#fullscreen-btn', '#btn-home', '#quality-toggle-btn', '#gyro-toggle-btn']) {
          const control = layout.elements[selector];
          if (control && control.visible) {
            expect(overlapArea(floatingTheme, control), `fullscreen theme button overlaps ${selector}`).toBe(0);
          }
        }

        await page.locator('#floating-theme-toggle').click();
        const expectedTheme = theme === 'dark' ? 'light' : 'dark';
        await expect(page.locator('html')).toHaveAttribute('data-theme', expectedTheme);
        expect((await readThemeState(page)).storedTheme).toBe(expectedTheme);
        expect(runtimeErrors).toEqual([]);
      });
    }
  }
}

for (const viewport of viewports) {
  for (const mode of ['public', 'internal', 'edit']) {
    for (const theme of ['light', 'dark']) {
      test(`theme scene list stability ${theme} ${mode} ${viewport.name}`, async ({ page }) => {
        await seedStoredTheme(page, theme);
        await openHarness(page, viewport, { mode, sceneType: '360' });
        if (mode === 'edit') await activateEditing(page);

        const themeSelector = mode === 'edit' ? '#toolbar-theme-toggle' : '#floating-theme-toggle';
        const before = await collectLayout(page);
        const initialButton = before.elements[themeSelector];
        const initialContentTop = before.elements['#panorama'].top;

        if (viewport.width > 600) {
          await page.locator('#sidebar-collapse-btn').click();
          await page.waitForTimeout(340);
          const closed = await collectLayout(page);
          assertNear(closed.elements[themeSelector].top, initialButton.top, 1, 'theme button top after closing scene list');
          assertNear(closed.elements[themeSelector].right, initialButton.right, 1, 'theme button right after closing scene list');
          assertNear(closed.elements['#panorama'].top, initialContentTop, 1, 'content top after closing scene list');

          await page.locator('#sidebar-expand-tab').click();
          await page.waitForTimeout(320);
        } else if (mode !== 'edit') {
          await page.locator('#mobile-scene-sheet-toggle').click();
          await expect(page.locator('#mobile-scene-sheet-toggle')).toHaveAttribute('aria-expanded', 'true');
          const expanded = await collectLayout(page);
          assertNear(expanded.elements[themeSelector].top, initialButton.top, 1, 'theme button top with scene sheet open');
          assertNear(expanded.elements[themeSelector].right, initialButton.right, 1, 'theme button right with scene sheet open');
          expect(overlapArea(expanded.elements[themeSelector], expanded.elements['#scene-sidebar'])).toBe(0);

          await page.locator('#mobile-scene-sheet-toggle').click();
          await expect(page.locator('#mobile-scene-sheet-toggle')).toHaveAttribute('aria-expanded', 'false');
        } else {
          await page.locator('#scene-list .scene-item').first().click();
        }

        const after = await collectLayout(page);
        assertNear(after.elements[themeSelector].top, initialButton.top, 1, 'theme button top after scene list interaction');
        assertNear(after.elements[themeSelector].right, initialButton.right, 1, 'theme button right after scene list interaction');
        assertNear(after.elements['#panorama'].top, initialContentTop, 1, 'content top after scene list interaction');
        expect(after.scroll.documentScrollWidth).toBeLessThanOrEqual(after.scroll.documentClientWidth + 1);
        expect(after.harnessErrors).toEqual([]);
      });
    }
  }
}

for (const mode of ['public', 'internal', 'edit']) {
  test(`theme surfaces change without changing image pixels in ${mode}`, async ({ page }) => {
    await seedStoredTheme(page, 'light');
    await openHarness(page, viewports[1], { mode, sceneType: '2D' });
    if (mode === 'edit') await activateEditing(page);

    const themeSelector = mode === 'edit' ? '#toolbar-theme-toggle' : '#floating-theme-toggle';
    const surfaceSelector = mode === 'edit' ? '#topbar' : '#scene-sidebar';
    const before = await page.evaluate(({ surfaceSelector, themeSelector }) => {
      const surface = getComputedStyle(document.querySelector(surfaceSelector));
      const button = getComputedStyle(document.querySelector(themeSelector));
      const image = getComputedStyle(document.querySelector('#flat-map-img'));
      return {
        surfaceBackground: surface.backgroundColor,
        surfaceColor: surface.color,
        buttonBackground: button.backgroundColor,
        buttonColor: button.color,
        imageFilter: image.filter
      };
    }, { surfaceSelector, themeSelector });

    await page.locator(themeSelector).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const after = await page.evaluate(({ surfaceSelector, themeSelector }) => {
      const surface = getComputedStyle(document.querySelector(surfaceSelector));
      const button = getComputedStyle(document.querySelector(themeSelector));
      const image = getComputedStyle(document.querySelector('#flat-map-img'));
      return {
        surfaceBackground: surface.backgroundColor,
        surfaceColor: surface.color,
        buttonBackground: button.backgroundColor,
        buttonColor: button.color,
        imageFilter: image.filter
      };
    }, { surfaceSelector, themeSelector });

    expect(after.surfaceBackground).not.toBe(before.surfaceBackground);
    expect(after.surfaceColor).not.toBe(before.surfaceColor);
    expect(after.buttonBackground).not.toBe(before.buttonBackground);
    expect(after.buttonColor).not.toBe(before.buttonColor);
    expect(before.imageFilter).toBe('none');
    expect(after.imageFilter).toBe('none');
  });
}

for (const mode of ['public', 'internal']) {
  test(`Drive folder controls stay hidden and inoperable in ${mode} mode`, async ({ page }) => {
    await openHarness(page, viewports[1], { mode, sceneType: '360' });

    for (const selector of ['#open-folder-btn', '#open-hotspot-folder-btn', '#open-hotspot-folder-topbar-btn']) {
      await expect(page.locator(selector)).toBeHidden();
      await expect(page.locator(selector)).toBeDisabled();
    }
    const result = await page.evaluate(() => ({
      opened: openHotspotFolderInDrive(),
      calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit').length
    }));
    expect(result).toEqual({ opened: false, calls: 0 });
  });

  test(`single-image ${mode} mode hides every Drive control and rejects direct Hotspot-folder calls`, async ({ page }) => {
    await openHarness(page, viewports[1], { mode, sceneType: '360', storageMode: 'single' });

    for (const selector of ['#open-folder-btn', '#open-hotspot-folder-btn', '#open-hotspot-folder-topbar-btn']) {
      await expect(page.locator(selector)).toBeHidden();
      await expect(page.locator(selector)).toBeDisabled();
    }
    const result = await page.evaluate(() => ({
      opened: openHotspotFolderInDrive(),
      calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit').length
    }));
    expect(result).toEqual({ opened: false, calls: 0 });
  });
}

test('edit mode exposes both accessible Drive folder controls only after editing is activated', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await expect(page.locator('#open-folder-btn')).toBeHidden();
  await expect(page.locator('#open-hotspot-folder-btn')).toBeHidden();

  await activateEditing(page);

  const sceneDrive = page.locator('#open-folder-btn');
  const photoDrive = page.locator('#open-hotspot-folder-btn');
  const topbarPhotoDrive = page.locator('#open-hotspot-folder-topbar-btn');
  await expect(sceneDrive).toBeVisible();
  await expect(photoDrive).toBeVisible();
  await expect(topbarPhotoDrive).toBeHidden();
  await expect(topbarPhotoDrive).toBeDisabled();
  await expect(sceneDrive).toBeEnabled();
  await expect(photoDrive).toBeEnabled();
  await expect(sceneDrive.locator('.scene-action-label-full')).toHaveText('シーンDrive');
  await expect(photoDrive.locator('.scene-action-label-full')).toHaveText('Hotspotフォルダ');
  await expect(sceneDrive).toHaveAttribute('title', 'シーン画像フォルダをGoogle Driveで開く');
  await expect(sceneDrive).toHaveAttribute('aria-label', 'シーン画像フォルダをGoogle Driveで開く');
  await expect(photoDrive).toHaveAttribute('title', 'HotspotフォルダをGoogle Driveで開く');
  await expect(photoDrive).toHaveAttribute('aria-label', 'HotspotフォルダをGoogle Driveで開く');
});

test('single-image edit mode exposes only the accessible topbar Hotspot-folder control', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360', storageMode: 'single' });
  const sceneDrive = page.locator('#open-folder-btn');
  const sidebarPhotoDrive = page.locator('#open-hotspot-folder-btn');
  const topbarPhotoDrive = page.locator('#open-hotspot-folder-topbar-btn');

  for (const control of [sceneDrive, sidebarPhotoDrive, topbarPhotoDrive]) {
    await expect(control).toBeHidden();
    await expect(control).toBeDisabled();
  }

  await activateEditing(page);

  await expect(sceneDrive).toBeHidden();
  await expect(sceneDrive).toBeDisabled();
  await expect(sidebarPhotoDrive).toBeHidden();
  await expect(sidebarPhotoDrive).toBeDisabled();
  await expect(topbarPhotoDrive).toBeVisible();
  await expect(topbarPhotoDrive).toBeEnabled();
  await expect(topbarPhotoDrive).toContainText('Hotspotフォルダ');
  await expect(topbarPhotoDrive).toHaveAttribute('title', 'HotspotフォルダをGoogle Driveで開く');
  await expect(topbarPhotoDrive).toHaveAttribute('aria-label', 'HotspotフォルダをGoogle Driveで開く');

  await page.locator('#mode-toggle').click();
  await expect(topbarPhotoDrive).toBeHidden();
  await expect(topbarPhotoDrive).toBeDisabled();
});

test('single-image Hotspot-folder control shares busy state, opens one blank tab, and sends one tokenized API call', async ({ page }) => {
  const driveUrl = 'https://drive.google.com/drive/folders/fixture-hotspot-root-folder';
  await page.context().route('https://drive.google.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>Drive fixture</title>'
  }));
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360', storageMode: 'single' });
  await activateEditing(page);
  await page.evaluate((url) => {
    window.__HOTSPOT_FOLDER_OPEN_EVENTS__ = [];
    var originalOpen = window.open;
    window.open = function () {
      window.__HOTSPOT_FOLDER_OPEN_EVENTS__.push({
        apiCallsAtOpen: window.__HARNESS_CALLS__.filter(function (call) {
          return call.method === 'getHotspotFolderUrlForEdit';
        }).length
      });
      return originalOpen.apply(window, arguments);
    };
    window.__HARNESS_BEHAVIOR__.getHotspotFolderUrlForEdit = {
      delay: 120,
      response: { success: true, url: url }
    };
  }, driveUrl);

  const topbarPhotoDrive = page.locator('#open-hotspot-folder-topbar-btn');
  const sidebarPhotoDrive = page.locator('#open-hotspot-folder-btn');
  const popupPromise = page.waitForEvent('popup');
  await topbarPhotoDrive.click();
  const popup = await popupPromise;

  await expect(topbarPhotoDrive).toBeDisabled();
  await expect(topbarPhotoDrive).toHaveAttribute('aria-busy', 'true');
  await expect(sidebarPhotoDrive).toBeDisabled();
  await expect(sidebarPhotoDrive).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => openHotspotFolderInDrive());

  const requestState = await page.evaluate(() => ({
    calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit'),
    openEvents: window.__HOTSPOT_FOLDER_OPEN_EVENTS__.slice()
  }));
  expect(requestState.calls).toHaveLength(1);
  expect(requestState.calls[0].args).toEqual([{ __editToken: 'playwright-edit-token' }]);
  expect(requestState.openEvents).toEqual([{ apiCallsAtOpen: 0 }]);

  await popup.waitForURL(driveUrl);
  await expect(topbarPhotoDrive).toBeEnabled();
  await expect(topbarPhotoDrive).toHaveAttribute('aria-busy', 'false');
  await expect(sidebarPhotoDrive).toHaveAttribute('aria-busy', 'false');
});

test('single-image Hotspot-folder API failure closes the blank tab and restores the shared control state', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360', storageMode: 'single' });
  await activateEditing(page);
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getHotspotFolderUrlForEdit = {
      delay: 80,
      response: { success: false, error: 'Hotspotフォルダを開けませんでした。' }
    };
  });

  const popupPromise = page.waitForEvent('popup');
  await page.locator('#open-hotspot-folder-topbar-btn').click();
  const popup = await popupPromise;

  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator('#open-hotspot-folder-topbar-btn')).toBeEnabled();
  await expect(page.locator('#open-hotspot-folder-topbar-btn')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#toast-msg')).toContainText('Hotspotフォルダを開けませんでした');
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit'))).toHaveLength(1);
});

test('single-image popup blocker skips the Hotspot-folder API', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360', storageMode: 'single' });
  await activateEditing(page);
  await page.evaluate(() => { window.open = function () { return null; }; });

  await page.locator('#open-hotspot-folder-topbar-btn').click();

  await expect(page.locator('#toast-msg')).toContainText('ポップアップ');
  await expect(page.locator('#open-hotspot-folder-topbar-btn')).toBeEnabled();
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit'))).toHaveLength(0);
});

test('single-image hotspot form disables the topbar Hotspot-folder control before tab or API work', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360', storageMode: 'single' });
  await openNewHotspotForm(page, '360');
  await expect(page.locator('#open-hotspot-folder-topbar-btn')).toBeDisabled();
  const result = await page.evaluate(() => {
    var opens = 0;
    window.open = function () { opens += 1; return null; };
    return {
      returnValue: openHotspotFolderInDrive(),
      opens: opens,
      calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit').length
    };
  });

  expect(result).toEqual({ returnValue: false, opens: 0, calls: 0 });
  await expect(page.locator('#toast-msg')).toHaveText('ホットスポットの保存またはキャンセル後に操作してください。');
});

test('folder navigation keeps scene Drive on the current folder and Hotspot Drive on the official root API', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await activateEditing(page);
  await page.locator('#scene-list .scene-folder-item').click();
  await page.waitForFunction(() => folderStack.length === 1);
  const opened = await page.evaluate(() => {
    var urls = [];
    window.open = function (url) { urls.push(String(url || '')); return {}; };
    return {
      sceneOpened: openCurrentFolderInDrive(),
      urls: urls,
      currentFolderId: getCurrentFolderId()
    };
  });
  expect(opened).toEqual({
    sceneOpened: true,
    urls: ['https://drive.google.com/drive/folders/fixture-subfolder'],
    currentFolderId: 'fixture-subfolder'
  });
  await expect(page.locator('#open-hotspot-folder-btn')).toBeVisible();
  await expect(page.locator('#open-hotspot-folder-topbar-btn')).toBeHidden();
});

test('Hotspot folder control opens a blank tab synchronously, calls the token API once, and navigates the tab', async ({ page }) => {
  const driveUrl = 'https://drive.google.com/drive/folders/fixture-hotspot-root-folder';
  await page.context().route('https://drive.google.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>Drive fixture</title>'
  }));
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await activateEditing(page);
  await page.evaluate((url) => {
    window.__HOTSPOT_FOLDER_OPEN_EVENTS__ = [];
    var originalOpen = window.open;
    window.open = function () {
      window.__HOTSPOT_FOLDER_OPEN_EVENTS__.push({
        apiCallsAtOpen: window.__HARNESS_CALLS__.filter(function (call) {
          return call.method === 'getHotspotFolderUrlForEdit';
        }).length
      });
      return originalOpen.apply(window, arguments);
    };
    window.__HARNESS_BEHAVIOR__.getHotspotFolderUrlForEdit = {
      delay: 120,
      response: { success: true, url: url }
    };
  }, driveUrl);

  const popupPromise = page.waitForEvent('popup');
  await page.locator('#open-hotspot-folder-btn').click();
  const popup = await popupPromise;
  await expect(page.locator('#open-hotspot-folder-btn')).toBeDisabled();
  await expect(page.locator('#open-hotspot-folder-btn')).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => openHotspotFolderInDrive());

  const requestState = await page.evaluate(() => ({
    calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit'),
    openEvents: window.__HOTSPOT_FOLDER_OPEN_EVENTS__.slice()
  }));
  expect(requestState.calls).toHaveLength(1);
  expect(requestState.calls[0].args).toEqual([{ __editToken: 'playwright-edit-token' }]);
  expect(requestState.openEvents).toEqual([{ apiCallsAtOpen: 0 }]);

  await popup.waitForURL(driveUrl);
  await expect(page.locator('#open-hotspot-folder-btn')).toBeEnabled();
  await expect(page.locator('#open-hotspot-folder-btn')).toHaveAttribute('aria-busy', 'false');
});

test('Hotspot folder API failure closes its blank tab, restores the control, and shows an error toast', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await activateEditing(page);
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getHotspotFolderUrlForEdit = {
      delay: 80,
      response: { success: false, error: 'Hotspotフォルダを開けませんでした。' }
    };
  });

  const popupPromise = page.waitForEvent('popup');
  await page.locator('#open-hotspot-folder-btn').click();
  const popup = await popupPromise;

  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator('#open-hotspot-folder-btn')).toBeEnabled();
  await expect(page.locator('#open-hotspot-folder-btn')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#toast-msg')).toContainText('Hotspotフォルダを開けませんでした');
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit'))).toHaveLength(1);
});

test('popup blocker guidance skips the Hotspot folder API entirely', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await activateEditing(page);
  await page.evaluate(() => { window.open = function () { return null; }; });

  await page.locator('#open-hotspot-folder-btn').click();

  await expect(page.locator('#toast-msg')).toContainText('ポップアップ');
  await expect(page.locator('#open-hotspot-folder-btn')).toBeEnabled();
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit'))).toHaveLength(0);
});

test('active hotspot form guards the Hotspot folder control before opening a tab or calling GAS', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await openNewHotspotForm(page, '360');
  await expect(page.locator('#open-hotspot-folder-btn')).toBeDisabled();
  const result = await page.evaluate(() => {
    var opens = 0;
    window.open = function () { opens += 1; return null; };
    return {
      returnValue: openHotspotFolderInDrive(),
      opens: opens,
      calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotFolderUrlForEdit').length
    };
  });

  expect(result).toEqual({ returnValue: false, opens: 0, calls: 0 });
  await expect(page.locator('#toast-msg')).toHaveText('ホットスポットの保存またはキャンセル後に操作してください。');
});

for (const viewport of viewports) {
  for (const theme of ['light', 'dark']) {
    test(`Drive folder controls remain touch-sized and non-overlapping ${theme} ${viewport.name}`, async ({ page }) => {
      await seedStoredTheme(page, theme);
      await openHarness(page, viewport, { mode: 'edit', sceneType: '360' });
      await activateEditing(page);

      const layout = await collectLayout(page);
      const selectors = ['#upload-btn', '#open-folder-btn', '#open-hotspot-folder-btn', '#scene-list .scene-item'];
      const controls = selectors.map((selector) => ({ selector, rect: layout.elements[selector] }));
      for (const control of controls) {
        assertInsideViewport(control.rect, layout.viewport, control.selector);
        expect(control.rect.width, `${control.selector} tap width`).toBeGreaterThanOrEqual(44);
        expect(control.rect.height, `${control.selector} tap height`).toBeGreaterThanOrEqual(44);
      }
      for (let index = 0; index < controls.length; index += 1) {
        for (let other = index + 1; other < controls.length; other += 1) {
          expect(overlapArea(controls[index].rect, controls[other].rect), `${controls[index].selector} overlaps ${controls[other].selector}`).toBe(0);
        }
      }
      expect(layout.scroll.documentScrollWidth).toBeLessThanOrEqual(layout.scroll.documentClientWidth + 1);
      expect(layout.scroll.bodyScrollWidth).toBeLessThanOrEqual(layout.scroll.bodyClientWidth + 1);
      expect(layout.harnessErrors).toEqual([]);
    });
  }
}

for (const viewport of viewports) {
  for (const theme of ['light', 'dark']) {
    test(`single-image attachment-folder topbar controls are touch-sized and non-overlapping ${theme} ${viewport.name}`, async ({ page }) => {
      await seedStoredTheme(page, theme);
      await openHarness(page, viewport, { mode: 'edit', sceneType: '360', storageMode: 'single' });
      await activateEditing(page);

      const layout = await collectLayout(page);
      const topbarPhotoDrive = layout.elements['#open-hotspot-folder-topbar-btn'];
      assertInsideViewport(topbarPhotoDrive, layout.viewport, '#open-hotspot-folder-topbar-btn');
      expect(topbarPhotoDrive.width).toBeGreaterThanOrEqual(44);
      expect(topbarPhotoDrive.height).toBeGreaterThanOrEqual(44);
      expect(layout.elements['#open-folder-btn'].visible).toBe(false);
      expect(layout.elements['#open-hotspot-folder-btn'].visible).toBe(false);

      const topbarControls = await page.locator('#topbar .topbar-right > button:visible, #topbar .topbar-right > #mode-badge:visible, #bulk-input-trigger:visible').evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.id,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      }));
      for (const control of topbarControls) {
        assertInsideViewport({ ...control, visible: true }, layout.viewport, `#${control.id}`);
      }
      for (let index = 0; index < topbarControls.length; index += 1) {
        for (let other = index + 1; other < topbarControls.length; other += 1) {
          expect(overlapArea(topbarControls[index], topbarControls[other]), `#${topbarControls[index].id} overlaps #${topbarControls[other].id}`).toBe(0);
        }
      }
      const contrast = await page.locator('#open-hotspot-folder-topbar-btn').evaluate((element) => {
        const style = getComputedStyle(element);
        return { foreground: style.color, background: style.backgroundColor };
      });
      expect(contrastRatio(contrast.foreground, contrast.background), 'topbar Hotspot-folder text contrast').toBeGreaterThanOrEqual(4.5);
      expect(layout.scroll.documentScrollWidth).toBeLessThanOrEqual(layout.scroll.documentClientWidth + 1);
      expect(layout.scroll.bodyScrollWidth).toBeLessThanOrEqual(layout.scroll.bodyClientWidth + 1);
      expect(layout.harnessErrors).toEqual([]);
    });
  }
}

for (const viewport of viewports) {
  test(`before diagnostics ${viewport.name}`, async ({ page }) => {
    test.skip(process.env.UI_CAPTURE_PHASE !== 'before', 'Run with UI_CAPTURE_PHASE=before');
    const outputDir = path.join(artifactRoot, 'before', viewport.name);
    fs.mkdirSync(outputDir, { recursive: true });

    for (const mode of ['public', 'internal', 'edit']) {
      for (const sceneType of ['360', '2D']) {
        await openHarness(page, viewport, { mode, sceneType });
        if (mode === 'edit') await page.locator('#mode-toggle').click();
        const layout = await collectLayout(page);
        const stem = `${mode}-${sceneType.toLowerCase()}-open`;
        fs.writeFileSync(path.join(outputDir, `${stem}.json`), `${JSON.stringify(layout, null, 2)}\n`);
        await page.screenshot({ path: path.join(outputDir, `${stem}.png`), fullPage: false });

        if (viewport.width > 600) {
          await page.locator('#sidebar-collapse-btn').click();
          await page.waitForTimeout(340);
          const closedLayout = await collectLayout(page);
          fs.writeFileSync(path.join(outputDir, `${mode}-${sceneType.toLowerCase()}-closed.json`), `${JSON.stringify(closedLayout, null, 2)}\n`);
        } else if (mode !== 'edit') {
          await page.locator('#mobile-scene-sheet-toggle').click();
          const expandedLayout = await collectLayout(page);
          fs.writeFileSync(path.join(outputDir, `${mode}-${sceneType.toLowerCase()}-sheet-open.json`), `${JSON.stringify(expandedLayout, null, 2)}\n`);
        }
      }
    }
  });
}

for (const viewport of viewports) {
  for (const mode of ['public', 'internal']) {
    for (const sceneType of ['360', '2D']) {
      test(`top offset contract ${mode} ${sceneType} ${viewport.name}`, async ({ page }) => {
        await openHarness(page, viewport, { mode, sceneType });
        const contentSelector = activeContentSelector(sceneType);
        const layout = await collectLayout(page);
        const content = layout.elements[contentSelector];

        expect(layout.elements['#topbar'].visible).toBe(false);
        expect(layout.elements['#edit-banner'].visible).toBe(false);
        assertNear(content.top, 0, 1, `${contentSelector} should start at the viewport top`);
        expect(content.height).toBeGreaterThan(100);
        assertNear(layout.elements['#scene-transition-overlay'].top, 0, 1, 'transition overlay top');

        const loadingTop = await page.locator('#loading').evaluate((loading) => {
          loading.classList.remove('hidden');
          const top = loading.getBoundingClientRect().top;
          loading.classList.add('hidden');
          return top;
        });
        assertNear(loadingTop, 0, 1, 'loading overlay top');

        if (viewport.width > 700) {
          assertNear(layout.elements['#scene-sidebar'].top, 0, 1, 'desktop public sidebar top');
        }
        expect(layout.scroll.documentScrollWidth).toBeLessThanOrEqual(layout.scroll.documentClientWidth + 1);
        expect(layout.scroll.bodyScrollWidth).toBeLessThanOrEqual(layout.scroll.bodyClientWidth + 1);
        expect(layout.harnessErrors).toEqual([]);
      });
    }
  }
}

for (const viewport of viewports) {
  for (const sceneType of ['360', '2D']) {
    test(`responsive edit controls ${sceneType} ${viewport.name}`, async ({ page }) => {
      await openHarness(page, viewport, { mode: 'edit', sceneType });
      await activateEditing(page);
      await page.waitForTimeout(50);
      const contentSelector = activeContentSelector(sceneType);
      const layout = await collectLayout(page);
      const topbar = layout.elements['#topbar'];
      const banner = layout.elements['#edit-banner'];
      const content = layout.elements[contentSelector];

      assertInsideViewport(topbar, layout.viewport, 'edit topbar');
      assertInsideViewport(banner, layout.viewport, 'edit banner');
      assertNear(content.top, banner.bottom, 1, 'content should start below the measured edit UI');
      expect(content.width).toBeGreaterThan(100);
      expect(content.height).toBeGreaterThan(80);
      expect(layout.scroll.documentScrollWidth).toBeLessThanOrEqual(layout.scroll.documentClientWidth + 1);
      expect(layout.scroll.bodyScrollWidth).toBeLessThanOrEqual(layout.scroll.bodyClientWidth + 1);

      const controls = await page.locator('#topbar .topbar-right > *').evaluateAll((elements) => elements
        .map((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            id: element.id,
            visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          };
        })
        .filter((item) => item.visible));

      controls.forEach((control) => assertInsideViewport(control, layout.viewport, `#${control.id}`));
      for (let index = 0; index < controls.length; index += 1) {
        for (let other = index + 1; other < controls.length; other += 1) {
          expect(overlapArea(controls[index], controls[other]), `${controls[index].id} overlaps ${controls[other].id}`).toBe(0);
        }
      }
      if (viewport.width <= 600 || viewport.height <= 420) {
        for (const control of controls) {
          expect(control.height, `#${control.id} tap height`).toBeGreaterThanOrEqual(44);
        }
      }

      if (viewport.height <= 420) {
        const landscapeTapTargets = [
          '#scene-refresh-btn',
          '#sidebar-collapse-btn',
          '#upload-btn',
          '#open-folder-btn',
          '#open-hotspot-folder-btn',
          '#scene-list .scene-item',
          '#btn-home',
          '#quality-toggle-btn'
        ];
        for (const selector of landscapeTapTargets) {
          const target = page.locator(selector).first();
          await expect(target, `${selector} should be visible in short landscape edit`).toBeVisible();
          const rect = await target.boundingBox();
          expect(rect.width, `${selector} tap width`).toBeGreaterThanOrEqual(44);
          expect(rect.height, `${selector} tap height`).toBeGreaterThanOrEqual(44);
          assertInsideViewport({ ...rect, right: rect.x + rect.width, bottom: rect.y + rect.height, left: rect.x, top: rect.y, visible: true }, layout.viewport, selector);
        }
        await expect(page.locator('#fullscreen-btn')).toBeHidden();
        await expect(page.locator('#fullscreen-btn')).toBeDisabled();
        await expect(page.locator('#gyro-toggle-btn')).toBeHidden();
        await expect(page.locator('#gyro-toggle-btn')).toBeDisabled();
      }

      if (viewport.width <= 600) {
        const sceneList = await page.locator('#scene-list').evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height > 0
          };
        });
        assertInsideViewport(sceneList, layout.viewport, '#scene-list');
        expect(sceneList.width, 'mobile edit scene list keeps an operable width').toBeGreaterThanOrEqual(90);

        const firstScene = page.locator('#scene-list .scene-item').first();
        await expect(firstScene).toBeVisible();
        const firstSceneRect = await firstScene.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            visible: rect.width > 0 && rect.height > 0
          };
        });
        assertInsideViewport(firstSceneRect, layout.viewport, 'first mobile edit scene');
        expect(firstSceneRect.height, 'mobile scene tap height').toBeGreaterThanOrEqual(44);
        await firstScene.click();
        await page.waitForFunction((expectedSceneType) => {
          const loading = document.getElementById('loading');
          const displayReady = expectedSceneType === '2D'
            ? is2DMode && !!document.getElementById('flat-map-img')
            : !!viewer;
          return displayReady && !isSwitching && loading && loading.classList.contains('hidden');
        }, sceneType);
      }

      if (sceneType === '360') {
        const viewBeforeDrag = await page.evaluate(() => ({ yaw: viewer.getYaw(), pitch: viewer.getPitch() }));
        const point = {
          x: content.left + Math.max(30, content.width * 0.55),
          y: content.top + Math.max(30, content.height * 0.55)
        };
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(point.x + 24, point.y + 8, { steps: 4 });
        await page.mouse.up();
        const viewAfterDrag = await page.evaluate(() => ({ yaw: viewer.getYaw(), pitch: viewer.getPitch() }));
        expect(
          Math.abs(viewAfterDrag.yaw - viewBeforeDrag.yaw) + Math.abs(viewAfterDrag.pitch - viewBeforeDrag.pitch),
          '360 drag should change the harness view coordinates'
        ).toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
    });
  }
}

for (const viewport of viewports.filter((item) => item.width > 600)) {
  for (const mode of ['public', 'internal', 'edit']) {
    test(`scene list states ${mode} ${viewport.name}`, async ({ page }) => {
      await openHarness(page, viewport, { mode, sceneType: '360' });
      if (mode === 'edit') await activateEditing(page);
      const before = await collectLayout(page);
      const initialTop = before.elements['#panorama'].top;

      await page.locator('#sidebar-collapse-btn').click();
      await page.waitForTimeout(340);
      const closed = await collectLayout(page);
      assertNear(closed.elements['#panorama'].top, initialTop, 1, 'closing sidebar must not change the top offset');
      expect(closed.elements['#sidebar-expand-tab'].visible).toBe(true);
      expect(closed.scroll.documentScrollWidth).toBeLessThanOrEqual(closed.scroll.documentClientWidth + 1);

      await page.locator('#sidebar-expand-tab').click();
      await page.waitForTimeout(320);
      const reopened = await collectLayout(page);
      assertNear(reopened.elements['#panorama'].top, initialTop, 1, 'reopening sidebar must not change the top offset');
      expect(reopened.elements['#scene-sidebar'].visible).toBe(true);
      expect(reopened.harnessErrors).toEqual([]);
    });
  }
}

for (const viewport of viewports.filter((item) => item.width <= 600)) {
  for (const mode of ['public', 'internal']) {
    test(`scene list states ${mode} ${viewport.name}`, async ({ page }) => {
      await openHarness(page, viewport, { mode, sceneType: '360' });
      const before = await collectLayout(page);
      expect(await page.locator('#mobile-scene-sheet-toggle').getAttribute('aria-expanded')).toBe('false');
      await page.evaluate(() => showToast('モバイル操作案内', 'success'));
      const closedWithToast = await collectLayout(page);
      expect(overlapArea(closedWithToast.elements['#toast'], closedWithToast.elements['#scene-sidebar']), 'toast overlaps collapsed scene sheet').toBe(0);
      expect(overlapArea(closedWithToast.elements['#toast'], closedWithToast.elements['#hint-bar']), 'toast overlaps viewer hint').toBe(0);

      await page.locator('#mobile-scene-sheet-toggle').click();
      await expect(page.locator('#mobile-scene-sheet-toggle')).toHaveAttribute('aria-expanded', 'true');
      await page.evaluate(() => showToast('モバイル操作案内', 'success'));
      const open = await collectLayout(page);
      assertNear(open.elements['#panorama'].top, 0, 1, 'expanded mobile sheet must not create top whitespace');
      expect(open.elements['#scene-sidebar'].height).toBeGreaterThan(before.elements['#scene-sidebar'].height);
      expect(overlapArea(open.elements['#toast'], open.elements['#scene-sidebar']), 'toast overlaps expanded scene sheet').toBe(0);
      expect(overlapArea(open.elements['#toast'], open.elements['#hint-bar']), 'toast overlaps expanded viewer hint').toBe(0);
      expect(overlapArea(open.elements['#hint-bar'], open.elements['#scene-sidebar']), 'viewer hint overlaps expanded scene sheet').toBe(0);

      await page.locator('#mobile-scene-sheet-toggle').click();
      await expect(page.locator('#mobile-scene-sheet-toggle')).toHaveAttribute('aria-expanded', 'false');
      const closed = await collectLayout(page);
      assertNear(closed.elements['#panorama'].top, 0, 1, 'collapsed mobile sheet must not create top whitespace');
      expect(closed.harnessErrors).toEqual([]);
    });
  }
}

for (const viewport of viewports) {
  for (const sceneType of ['360', '2D']) {
    test(`hotspot draft and responsive form ${sceneType} ${viewport.name}`, async ({ page }) => {
      const runtimeErrors = collectRuntimeErrors(page);
      await openHarness(page, viewport, { mode: 'edit', sceneType });
      await page.evaluate(() => applyTheme('light', true));
      const { target } = await openNewHotspotForm(page, sceneType);

      const draft = page.locator('.hs-marker-draft');
      await expect(draft).toHaveCount(1);
      const draftStyle = await draft.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          opacity: Number(style.opacity),
          pointerEvents: style.pointerEvents
        };
      });
      expect(draftStyle.opacity).toBeGreaterThan(0);
      expect(draftStyle.opacity).toBeLessThan(1);
      expect(draftStyle.pointerEvents).toBe('none');

      const initialState = await readDraftState(page);
      expect(initialState.active).toBe(true);
      expect(initialState.startSceneId).toBe(initialState.currentFileId);
      expect(initialState.formStartSceneId).toBe(initialState.currentFileId);
      expect(initialState.sceneType).toBe(sceneType);
      expect(initialState.coordinates).toEqual(initialState.initialCoordinates);

      const beforeAppearanceBox = await draft.boundingBox();
      await page.locator('#marker-style-toggle').click();
      await page.locator('#marker-shape').selectOption('diamond');
      await page.locator('#marker-color').selectOption('pink');
      await page.locator('#marker-icon').selectOption('historic');
      await expect(draft).toHaveClass(/marker-shape-diamond/);
      await expect(draft).toHaveClass(/marker-color-pink/);
      await expect(draft.locator('.hs-marker-core')).toHaveClass(/marker-icon-historic/);
      expect(await draft.boundingBox()).not.toBeNull();
      expect(beforeAppearanceBox).not.toBeNull();

      await page.locator('#marker-icon').scrollIntoViewIfNeeded();
      const markerControlGeometry = await page.evaluate(() => {
        function rect(element) {
          const box = element.getBoundingClientRect();
          return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
        }
        const popup = document.getElementById('hotspot-popup');
        const select = document.getElementById('marker-icon');
        const preview = document.querySelector('#marker-style-preview .marker-icon-svg');
        return {
          popup: rect(popup),
          select: rect(select),
          preview: rect(preview),
          svgColor: getComputedStyle(preview).color,
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth
        };
      });
      expect(markerControlGeometry.select.left).toBeGreaterThanOrEqual(markerControlGeometry.popup.left - 1);
      expect(markerControlGeometry.select.right).toBeLessThanOrEqual(markerControlGeometry.popup.right + 1);
      expect(markerControlGeometry.preview.width).toBeGreaterThan(0);
      expect(markerControlGeometry.preview.height).toBeGreaterThan(0);
      expect(markerControlGeometry.svgColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(markerControlGeometry.documentScrollWidth).toBeLessThanOrEqual(markerControlGeometry.documentClientWidth + 1);

      const lightGeometry = await readPopupGeometry(page);
      await page.evaluate(() => applyTheme('dark', true));
      const darkGeometry = await readPopupGeometry(page);
      expect(darkGeometry.popupBackground).not.toBe(lightGeometry.popupBackground);
      await expect(draft).toHaveCount(1);

      const geometry = darkGeometry;
      await expect(page.locator('#hs-back-btn')).toHaveText('キャンセル');
      await expect(page.locator('#hs-type-back-btn')).toBeVisible();
      if (process.env.UI_CAPTURE_PHASE === 'hotspot') {
        const outputDir = path.join(artifactRoot, 'hotspot-form', viewport.name);
        fs.mkdirSync(outputDir, { recursive: true });
        await page.screenshot({ path: path.join(outputDir, `${sceneType.toLowerCase()}-dark-expanded.png`), fullPage: false });
      }
      expect(geometry.popup.left).toBeGreaterThanOrEqual(geometry.viewport.left - 1);
      expect(geometry.popup.top).toBeGreaterThanOrEqual(geometry.viewport.top - 1);
      expect(geometry.popup.right).toBeLessThanOrEqual(geometry.viewport.right + 1);
      expect(geometry.popup.bottom).toBeLessThanOrEqual(geometry.viewport.bottom + 1);
      expect(geometry.footer.top).toBeGreaterThanOrEqual(geometry.popup.top);
      expect(geometry.footer.bottom).toBeLessThanOrEqual(geometry.popup.bottom + 1);
      expect(geometry.save.height).toBeGreaterThanOrEqual(44);
      expect(geometry.cancel.height).toBeGreaterThanOrEqual(44);
      expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.documentClientWidth + 1);
      expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.bodyClientWidth + 1);

      if (viewport.width <= 600) {
        expect(geometry.popup.width).toBeGreaterThanOrEqual(geometry.viewport.width * 0.9);
        expect(geometry.popup.height).toBeLessThanOrEqual(geometry.viewport.height * 0.86 + 1);
        expect(parseFloat(geometry.popupBorderTopLeftRadius)).toBeGreaterThan(0);
        expect(parseFloat(geometry.popupBorderBottomLeftRadius)).toBe(0);
      }

      if (viewport.height <= 360) {
        await page.locator('#marker-icon').selectOption('quiz');
        const longForm = await readPopupGeometry(page);
        expect(longForm.contentScrollHeight).toBeGreaterThan(longForm.contentClientHeight);
        await page.locator('#hotspot-popup-content').evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await expect(page.locator('#btn-save')).toBeVisible();
        await expect(page.locator('#hs-back-btn')).toBeVisible();
      }

      const targetRect = sceneType === '2D'
        ? await page.locator('#flat-map-img').boundingBox()
        : await target.boundingBox();
      const popupRect = await page.locator('#hotspot-popup').boundingBox();
      expect(targetRect).not.toBeNull();
      expect(popupRect).not.toBeNull();
      const availableTop = Math.max(targetRect.y + 6, Math.min(targetRect.y + targetRect.height - 12, popupRect.y - 18));
      const moveStart = {
        x: Math.max(targetRect.x + 12, Math.min(targetRect.x + targetRect.width - 52, targetRect.x + targetRect.width * 0.2)),
        y: availableTop
      };
      const dragEnd = {
        x: Math.min(targetRect.x + targetRect.width - 12, moveStart.x + 28),
        y: Math.min(targetRect.y + targetRect.height - 12, moveStart.y + 8)
      };

      await page.locator('#hs-change-position-btn').click();
      await expect(page.locator('#hotspot-popup')).toHaveClass(/is-repositioning/);
      await page.mouse.move(moveStart.x, moveStart.y);
      const followedState = await readDraftState(page);
      expect(followedState.repositioning).toBe(true);
      expect(followedState.coordinates).not.toEqual(initialState.coordinates);

      await page.mouse.down();
      await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 4 });
      await page.mouse.up();
      expect((await readDraftState(page)).repositioning, 'a panorama drag must not confirm the draft position').toBe(true);
      await expect(draft).toHaveCount(1);

      await page.mouse.click(moveStart.x + 4, moveStart.y + 2);
      const confirmed = await readDraftState(page);
      expect(confirmed.repositioning).toBe(false);
      expect(confirmed.coordinates).not.toEqual(initialState.coordinates);
      await expect(page.locator('#hotspot-popup')).toHaveClass(/visible/);

      if (sceneType === '2D') {
        const expectedX = ((moveStart.x + 4 - targetRect.x) / targetRect.width) * 100;
        const expectedY = ((moveStart.y + 2 - targetRect.y) / targetRect.height) * 100;
        expect(confirmed.coordinates.yaw).toBeCloseTo(expectedX, 2);
        expect(confirmed.coordinates.pitch).toBeCloseTo(expectedY, 2);
      } else {
        const viewBeforeDrag = await page.evaluate(() => ({ yaw: viewer.getYaw(), pitch: viewer.getPitch() }));
        await page.mouse.move(moveStart.x, moveStart.y);
        await page.mouse.down();
        await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 4 });
        await page.mouse.up();
        const viewAfterDrag = await page.evaluate(() => ({ yaw: viewer.getYaw(), pitch: viewer.getPitch() }));
        expect(Math.abs(viewAfterDrag.yaw - viewBeforeDrag.yaw) + Math.abs(viewAfterDrag.pitch - viewBeforeDrag.pitch)).toBeGreaterThan(0);
        await expect(draft).toHaveCount(1);
      }

      const beforeEscape = (await readDraftState(page)).coordinates;
      await page.locator('#hs-change-position-btn').click();
      await page.mouse.move(dragEnd.x, dragEnd.y);
      expect((await readDraftState(page)).coordinates).not.toEqual(beforeEscape);
      await page.keyboard.press('Escape');
      const restored = await readDraftState(page);
      expect(restored.repositioning).toBe(false);
      expect(restored.coordinates).toEqual(beforeEscape);
      await expect(page.locator('#hotspot-popup')).toHaveClass(/visible/);

      await page.keyboard.press('Escape');
      await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
      await expect(draft).toHaveCount(0);
      await expect(page.locator('#mode-toggle')).toBeEnabled();
      const mutationCalls = await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) =>
        call.method === 'saveHotspot' || call.method === 'updateHotspot'
      ));
      expect(mutationCalls).toHaveLength(0);
      expect(runtimeErrors).toEqual([]);
      expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
    });
  }
}

test('new marker selector exposes thirteen grouped choices and saves every new nature icon', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360', storageMode: 'single' });
  await openNewHotspotFormDirect(page);
  await page.locator('#marker-style-toggle').click();

  const catalog = await page.locator('#marker-icon').evaluate((select) => ({
    value: select.value,
    options: Array.from(select.options).map((option) => ({ value: option.value, label: option.textContent })),
    groups: Array.from(select.children).filter((child) => child.tagName === 'OPTGROUP').map((group) => ({
      label: group.label,
      hidden: group.hidden,
      options: Array.from(group.children).map((option) => option.value)
    }))
  }));
  expect(catalog.value).toBe('info');
  expect(catalog.options).toEqual([
    { value: 'info', label: '情報' },
    { value: 'photo', label: '写真' },
    { value: 'audio', label: '音声' },
    { value: 'link', label: 'リンク' },
    { value: 'wifi', label: 'Wi-Fi' },
    { value: 'quiz', label: 'クイズ' },
    { value: 'eye', label: '観察' },
    { value: 'warning', label: '注意' },
    { value: 'flag', label: '目的地' },
    { value: 'animal', label: '動物' },
    { value: 'leaf', label: '葉っぱ' },
    { value: 'flower', label: '花' },
    { value: 'historic', label: '史跡' }
  ]);
  expect(catalog.groups).toEqual([
    { label: '基本', hidden: false, options: selectableMarkerIcons.slice(0, 9) },
    { label: '自然・地域学習', hidden: false, options: selectableMarkerIcons.slice(9) },
    { label: '旧アイコン', hidden: true, options: [] }
  ]);

  for (const icon of ['eye', 'warning', 'animal', 'leaf', 'flower', 'historic']) {
    await page.locator('#marker-icon').selectOption(icon);
    const previewCore = page.locator('#marker-style-preview .hs-marker-core');
    await expect(previewCore).toHaveClass(new RegExp(`marker-icon-${icon}`));
    await expect(previewCore.locator('svg.marker-icon-svg')).toBeVisible();
  }

  const natureIcons = ['animal', 'leaf', 'flower', 'historic'];
  for (let index = 0; index < natureIcons.length; index += 1) {
    const icon = natureIcons[index];
    if (index > 0) {
      await openNewHotspotFormDirect(page, index);
      if (!(await page.locator('#marker-icon').isVisible())) await page.locator('#marker-style-toggle').click();
      await expect(page.locator('#marker-icon')).toHaveValue(natureIcons[index - 1]);
    }
    await page.locator('#marker-icon').selectOption(icon);
    await page.locator('#input-label').fill(`新規 ${icon}`);
    await page.locator('#btn-save').click();
    await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);

    const saveCalls = await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot'));
    expect(saveCalls).toHaveLength(index + 1);
    expect(saveCalls[index].args[0].markerIcon).toBe(icon);
    expect(saveCalls[index].args[0].__editToken).toBe('playwright-edit-token');
    await expect(page.locator(`[data-pannellum-hotspot-id] .marker-icon-${icon}`)).toHaveCount(1);
  }

  expect(await page.evaluate(() => window.localStorage.getItem('hsMarkerIcon'))).toBe('historic');
  expect(runtimeErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('audio marker can be selected, saved, and restored from localStorage', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360', storageMode: 'single' });
  await openNewHotspotFormDirect(page);
  await page.locator('#marker-style-toggle').click();
  await page.locator('#marker-icon').selectOption('audio');
  await expect(page.locator('#marker-style-preview .hs-marker-core')).toHaveClass(/marker-icon-audio/);
  await page.locator('#input-label').fill('音声アイコン');
  await page.locator('#btn-save').click();

  const saveCall = await page.evaluate(() => window.__HARNESS_CALLS__.find((call) => call.method === 'saveHotspot'));
  expect(saveCall.args[0].markerIcon).toBe('audio');
  expect(await page.evaluate(() => window.localStorage.getItem('hsMarkerIcon'))).toBe('audio');
  await expect(page.locator('[data-pannellum-hotspot-id] .marker-icon-audio')).toHaveCount(1);

  await openNewHotspotFormDirect(page, 1);
  if (!(await page.locator('#marker-icon').isVisible())) await page.locator('#marker-style-toggle').click();
  await expect(page.locator('#marker-icon')).toHaveValue('audio');
  await page.keyboard.press('Escape');
  expect(runtimeErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('legacy video edits preserve the old value until a current icon is selected', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  for (const legacyIcon of legacyMarkerIcons) {
    await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360', storageMode: 'single' });
    await activateEditing(page);
    const opened = await page.evaluate((icon) => {
      var target = {
        _pannellumId: 'legacy-' + icon,
        id: 'legacy-' + icon,
        fileId: currentFileId,
        label: icon + ' marker',
        description: 'legacy description',
        linkUrl: '',
        markerShape: 'circle',
        markerColor: 'blue',
        markerIcon: icon,
        pitch: 10,
        yaw: 20,
        photoId: '',
        jumpSceneId: ''
      };
      window.__LEGACY_MARKER_TARGET__ = target;
      return openPopup(240, 180, target);
    }, legacyIcon);
    expect(opened).toBe(true);

    const legacySelection = await page.locator('#marker-icon').evaluate((select) => ({
      value: select.value,
      values: Array.from(select.options).map((option) => option.value),
      selectedLabel: select.selectedOptions[0].textContent,
      legacyGroupHidden: document.getElementById('marker-icon-legacy-group').hidden
    }));
    expect(legacySelection.value).toBe(legacyIcon);
    expect(legacySelection.values).toEqual(selectableMarkerIcons.concat(legacyIcon));
    expect(legacySelection.selectedLabel).toBe('動画（旧アイコン）');
    expect(legacySelection.legacyGroupHidden).toBe(false);

    await page.locator('#input-label').fill(`${legacyIcon} renamed`);
    await page.locator('#input-desc').fill('description changed only');
    await page.locator('#btn-save').click();
    await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);

    let updateCalls = await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'updateHotspot'));
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].args[0].markerIcon).toBe(legacyIcon);
    expect(updateCalls[0].args[0].__editToken).toBe('playwright-edit-token');
    expect(updateCalls[0].args[1]).toBe(`legacy-${legacyIcon}`);
    expect(await page.evaluate(() => window.__LEGACY_MARKER_TARGET__.markerIcon)).toBe(legacyIcon);
    expect(await page.evaluate(() => window.localStorage.getItem('hsMarkerIcon'))).toBe('info');

    await page.evaluate(() => openPopup(240, 180, window.__LEGACY_MARKER_TARGET__));
    if (!(await page.locator('#marker-icon').isVisible())) await page.locator('#marker-style-toggle').click();
    await page.locator('#marker-icon').selectOption('leaf');
    await page.locator('#btn-save').click();
    await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);

    updateCalls = await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'updateHotspot'));
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1].args[0].markerIcon).toBe('leaf');
    expect(await page.evaluate(() => window.__LEGACY_MARKER_TARGET__.markerIcon)).toBe('leaf');

    await openNewHotspotFormDirect(page, 4);
    const newSelection = await page.locator('#marker-icon').evaluate((select) => ({
      value: select.value,
      values: Array.from(select.options).map((option) => option.value),
      legacyGroupHidden: document.getElementById('marker-icon-legacy-group').hidden
    }));
    expect(newSelection).toEqual({
      value: 'leaf',
      values: selectableMarkerIcons,
      legacyGroupHidden: true
    });
    await page.keyboard.press('Escape');
  }

  expect(runtimeErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('all current and legacy icons render in public, internal, and edit views for 360 and 2D', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  for (const mode of ['public', 'internal', 'edit']) {
    for (const sceneType of ['360', '2D']) {
      await openHarness(page, viewports[1], { mode, sceneType });
      await page.evaluate(({ icons, type }) => {
        var hotspots = icons.map(function (icon, index) {
          return {
            id: 'compat-' + icon,
            fileId: currentFileId,
            label: icon + ' marker',
            description: icon === 'quiz' ? 'question|answer' : 'description',
            linkUrl: icon === 'link' ? 'https://example.com/' : '',
            markerShape: ['circle', 'square', 'diamond'][index % 3],
            markerColor: ['blue', 'yellow', 'white'][index % 3],
            markerIcon: icon,
            pitch: type === '2D' ? 12 + (index % 5) * 14 : -15 + index * 2,
            yaw: type === '2D' ? 10 + (index % 7) * 12 : -40 + index * 6,
            photoId: '',
            jumpSceneId: ''
          };
        });
        if (type === '2D') {
          render2DHotspots(hotspots);
        } else {
          hotspots.forEach(function (hotspot) {
            viewer.addHotSpot({
              id: hotspot.id,
              pitch: hotspot.pitch,
              yaw: hotspot.yaw,
              type: 'custom',
              cssClass: 'hs-marker',
              createTooltipFunc: buildMarkerElement,
              createTooltipArgs: hotspot,
              clickHandlerFunc: onMarkerClick,
              clickHandlerArgs: hotspot
            });
          });
        }
      }, { icons: supportedMarkerIcons, type: sceneType });

      const markerRoots = sceneType === '2D'
        ? page.locator('#flat-map-inner .flat-hs-marker')
        : page.locator('[data-pannellum-hotspot-id^="compat-"]');
      await expect(markerRoots).toHaveCount(supportedMarkerIcons.length);
      await expect(markerRoots.locator('svg.marker-icon-svg')).toHaveCount(supportedMarkerIcons.length);
      for (const icon of supportedMarkerIcons) {
        await expect(markerRoots.locator(`.marker-icon-${icon}`)).toHaveCount(1);
      }

      await markerRoots.locator('.marker-icon-video').click({ force: true });
      await expect(page.locator('#active-info-popup')).toBeVisible();
      await expect(page.locator('#quiz-modal-overlay')).toHaveClass(/hidden/);
      expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
    }
  }

  expect(runtimeErrors).toEqual([]);
});

test('all thirteen selectable icons render across three shapes, key colors, and both themes', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'public', sceneType: '2D' });

  for (const theme of ['light', 'dark']) {
    const rendered = await page.evaluate(({ icons, nextTheme }) => {
      applyTheme(nextTheme, false);
      var shapes = ['circle', 'square', 'diamond'];
      var colors = ['blue', 'yellow', 'white'];
      var results = [];
      icons.forEach(function (icon) {
        shapes.forEach(function (shape) {
          colors.forEach(function (color) {
            var marker = createStandaloneMarkerElement({ markerIcon: icon, markerShape: shape, markerColor: color });
            marker.style.position = 'fixed';
            marker.style.left = '20px';
            marker.style.top = '100px';
            document.body.appendChild(marker);
            var core = marker.querySelector('.hs-marker-core');
            var svg = marker.querySelector('svg.marker-icon-svg');
            var box = svg.getBoundingClientRect();
            results.push({
              icon: icon,
              shape: shape,
              color: color,
              markerClass: marker.className,
              coreClass: core.className,
              viewBox: svg.getAttribute('viewBox'),
              width: box.width,
              height: box.height,
              computedColor: getComputedStyle(svg).color
            });
            marker.remove();
          });
        });
      });
      return results;
    }, { icons: selectableMarkerIcons, nextTheme: theme });

    expect(rendered).toHaveLength(selectableMarkerIcons.length * 3 * 3);
    for (const result of rendered) {
      expect(result.markerClass).toContain(`marker-shape-${result.shape}`);
      expect(result.markerClass).toContain(`marker-color-${result.color}`);
      expect(result.coreClass).toContain(`marker-icon-${result.icon}`);
      expect(result.viewBox).toBe('0 0 24 24');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.computedColor).not.toBe('rgba(0, 0, 0, 0)');
    }
  }

  const scroll = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    errors: window.__HARNESS_ERRORS__.slice()
  }));
  expect(scroll.documentWidth).toBeLessThanOrEqual(scroll.documentClientWidth + 1);
  expect(scroll.errors).toEqual([]);
});

test('hotspot photo select orders upload, none, and existing photos and preserves picker state', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await openNewHotspotForm(page, '360');

  const options = await page.locator('#input-photo-id option').evaluateAll((items) => items.map((item) => ({
    value: item.value,
    text: item.textContent
  })));
  expect(options.slice(0, 2)).toEqual([
    { value: hotspotPhotoUploadOption, text: '写真をアップロード…' },
    { value: '', text: '（なし）' }
  ]);
  expect(options.slice(2).map((item) => item.value)).toEqual(['fixture-scene-360', 'fixture-scene-2d']);

  await page.locator('#input-photo-id').selectOption('fixture-scene-360');
  await cancelHotspotPhotoChooser(page);
  await expect(page.locator('#input-photo-id')).toHaveValue('fixture-scene-360');
  await expect(page.locator('#hotspot-photo-upload-card')).toBeHidden();

  await chooseHotspotPhoto(page);
  await expect(page.locator('#hotspot-photo-file-name')).toHaveText('camera-photo.png');
  await expect(page.locator('#hotspot-photo-file-size')).toContainText('元');
  await expect(page.locator('#hotspot-photo-preview')).toHaveAttribute('src', /^blob:/);
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) =>
    call.method === 'saveHotspot' || call.method === 'updateHotspot'
  ))).toHaveLength(0);

  await chooseHotspotPhoto(page, { changeExisting: true, name: 'replacement.png' });
  await expect(page.locator('#hotspot-photo-file-name')).toHaveText('replacement.png');
  await page.locator('#hotspot-photo-clear-btn').click();
  await expect(page.locator('#input-photo-id')).toHaveValue('');
  await expect(page.locator('#hotspot-photo-upload-card')).toBeHidden();
  expect(await page.evaluate(() => ({
    hasBlob: !!hotspotPhotoUploadState.blob,
    calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot' || call.method === 'updateHotspot').length
  }))).toEqual({ hasBlob: false, calls: 0 });
  expect(runtimeErrors).toEqual([]);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('hotspot photo processing failure preserves the previous upload and shows an inline error', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await openNewHotspotForm(page, '360');
  await chooseHotspotPhoto(page);
  const previousPreviewUrl = await page.locator('#hotspot-photo-preview').getAttribute('src');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('#hotspot-photo-change-btn').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'spoof.png',
    mimeType: 'image/png',
    buffer: Buffer.from('GIF89a', 'ascii')
  });
  await page.waitForFunction(() => !hotspotPhotoUploadState.processing);

  await expect(page.locator('#hotspot-photo-error')).toBeVisible();
  await expect(page.locator('#hotspot-photo-error')).toContainText('一致');
  await expect(page.locator('#input-photo-id')).toHaveValue(hotspotPhotoUploadOption);
  await expect(page.locator('#hotspot-photo-file-name')).toHaveText('camera-photo.png');
  await expect(page.locator('#hotspot-photo-preview')).toHaveAttribute('src', previousPreviewUrl);
  expect(await page.evaluate(() => ({
    hasBlob: !!hotspotPhotoUploadState.blob,
    mutations: window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot' || call.method === 'updateHotspot').length
  }))).toEqual({ hasBlob: true, mutations: 0 });
});

test('closing during photo decode immediately revokes every owned object URL', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await openNewHotspotForm(page, '360');
  await page.evaluate(() => {
    window.__HARNESS_REVOKED_URLS__ = [];
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = function(url) {
      window.__HARNESS_REVOKED_URLS__.push(String(url));
      originalRevoke(url);
    };
    window.Image = function() {
      this.naturalWidth = 0;
      this.naturalHeight = 0;
    };
  });

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('#input-photo-id').selectOption(hotspotPhotoUploadOption);
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(tinyPngFile);
  await page.waitForFunction(() => hotspotPhotoUploadState.decodeObjectUrls.length === 1);
  const decodeUrl = await page.evaluate(() => hotspotPhotoUploadState.decodeObjectUrls[0]);

  await page.locator('#hotspot-popup .popup-close-btn').click();

  expect(await page.evaluate(() => ({
    decodeUrls: hotspotPhotoUploadState.decodeObjectUrls.slice(),
    processing: hotspotPhotoUploadState.processing,
    revoked: window.__HARNESS_REVOKED_URLS__.slice()
  }))).toEqual({ decodeUrls: [], processing: false, revoked: [decodeUrl] });
});

test('single-image mode supports pending hotspot photo upload and confirmed public rendering', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360', storageMode: 'single' });
  await openNewHotspotForm(page, '360');
  await expect(page.locator('#photo-select-group')).toBeVisible();
  expect(await page.locator('#input-photo-id option').allTextContents()).toEqual([
    '写真をアップロード…',
    '（なし）'
  ]);
  await page.locator('#input-label').fill('単一画像の写真付きスポット');
  await chooseHotspotPhoto(page);
  await page.locator('#btn-save').click();

  await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
  const saveCall = await page.evaluate(() => window.__HARNESS_CALLS__.find((call) => call.method === 'saveHotspot'));
  expect(saveCall.args[0].fileId).toBe('');
  expect(saveCall.args[0].photoUpload).toBeTruthy();
  await page.evaluate(() => {
    isEditMode = false;
    document.querySelector('.hs-marker:not(.hs-marker-draft)').click();
  });
  await page.waitForFunction(() => window.__HARNESS_CALLS__.some((call) => call.method === 'getHotspotPhotoDataUri'));
  const photoCall = await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotPhotoDataUri').pop());
  expect(photoCall.args[0]).toEqual({
    fileId: 'fixture-single-scene',
    hotspotId: 'fixture-hotspot-1',
    photoId: 'fixture-upload-photo-1'
  });
});

test('closing a hotspot form releases the pending photo without uploading it', async ({ page }) => {
  await openHarness(page, viewports[2], { mode: 'edit', sceneType: '2D' });
  await openNewHotspotForm(page, '2D');
  await chooseHotspotPhoto(page);
  const previewUrl = await page.locator('#hotspot-photo-preview').getAttribute('src');

  await page.locator('#hotspot-popup .popup-close-btn').click();

  await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
  expect(await page.evaluate(() => ({
    blob: hotspotPhotoUploadState.blob,
    previewUrl: hotspotPhotoUploadState.previewUrl,
    mutations: window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot' || call.method === 'updateHotspot').length
  }))).toEqual({ blob: null, previewUrl: '', mutations: 0 });
  expect(previewUrl).toMatch(/^blob:/);
});

for (const sceneType of ['360', '2D']) {
  test(`hotspot photo save uses the server-confirmed photo id in the real ${sceneType} marker`, async ({ page }) => {
    await openHarness(page, viewports[1], { mode: 'edit', sceneType });
    await openNewHotspotForm(page, sceneType);
    await page.locator('#input-label').fill('写真付きスポット');
    await chooseHotspotPhoto(page);
    await page.locator('#btn-save').click();

    await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
    await expect(page.locator('.hs-marker-draft')).toHaveCount(0);
    await expect(page.locator('.hs-marker:not(.hs-marker-draft)')).toHaveCount(1);
    const saveCalls = await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot'));
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].args[0].photoId).toBe('');
    expect(saveCalls[0].args[0].photoUpload).toMatchObject({
      fileName: 'camera-photo.png',
      mimeType: 'image/png'
    });
    expect(saveCalls[0].args[0].photoUpload.base64.length).toBeGreaterThan(0);

    await page.evaluate(() => {
      isEditMode = false;
      document.querySelector('.hs-marker:not(.hs-marker-draft)').click();
    });
    await page.waitForFunction(() => window.__HARNESS_CALLS__.some((call) => call.method === 'getHotspotPhotoDataUri'));
    const photoCall = await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'getHotspotPhotoDataUri').pop());
    expect(photoCall.args[0]).toEqual({
      fileId: sceneType === '2D' ? 'fixture-scene-2d' : 'fixture-scene-360',
      hotspotId: 'fixture-hotspot-1',
      photoId: 'fixture-upload-photo-1'
    });
    await expect(page.locator('#active-info-popup .info-popup-photo')).toBeVisible();
  });
}

for (const failureMode of ['error', 'failure']) {
  test(`hotspot photo save ${failureMode} preserves the form, draft, and selected file`, async ({ page }) => {
    const sceneType = failureMode === 'error' ? '360' : '2D';
    await openHarness(page, viewports[1], { mode: 'edit', sceneType });
    await page.evaluate((mode) => { window.__HARNESS_BEHAVIOR__.saveHotspot = mode; }, failureMode);
    await openNewHotspotForm(page, sceneType);
    await page.locator('#input-label').fill('写真保存失敗');
    await page.locator('#input-desc').fill('写真と入力を維持');
    await chooseHotspotPhoto(page);
    await page.locator('#btn-save').click();

    await expect(page.locator('#hotspot-popup')).toHaveClass(/visible/);
    await expect(page.locator('.hs-marker-draft')).toHaveCount(1);
    await expect(page.locator('#input-label')).toHaveValue('写真保存失敗');
    await expect(page.locator('#input-desc')).toHaveValue('写真と入力を維持');
    await expect(page.locator('#input-photo-id')).toHaveValue(hotspotPhotoUploadOption);
    await expect(page.locator('#hotspot-photo-upload-card')).toBeVisible();
    await expect(page.locator('#hotspot-photo-file-name')).toHaveText('camera-photo.png');
    await expect(page.locator('#btn-save')).toBeEnabled();
    expect(await page.evaluate(() => !!hotspotPhotoUploadState.blob)).toBe(true);
  });
}

test('editing an existing hotspot can replace its photo with a pending upload', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await activateEditing(page);
  await page.evaluate(() => {
    window.__EDIT_TARGET__ = {
      id: 'existing-hotspot-photo',
      fileId: currentFileId,
      label: '既存写真スポット',
      description: '置換前',
      linkUrl: '',
      markerShape: 'circle',
      markerColor: 'amber',
      markerIcon: 'info',
      pitch: 3,
      yaw: 7,
      photoId: 'fixture-scene-360',
      jumpSceneId: ''
    };
    openPopup(520, 300, window.__EDIT_TARGET__);
  });
  await expect(page.locator('#input-photo-id')).toHaveValue('fixture-scene-360');
  await chooseHotspotPhoto(page, { name: 'replacement.png' });
  await page.locator('#btn-save').click();

  await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
  const result = await page.evaluate(() => ({
    targetPhotoId: window.__EDIT_TARGET__.photoId,
    calls: window.__HARNESS_CALLS__.filter((call) => call.method === 'updateHotspot')
  }));
  expect(result.calls).toHaveLength(1);
  expect(result.calls[0].args[0].photoId).toBe('');
  expect(result.calls[0].args[0].photoUpload.fileName).toBe('replacement.png');
  expect(result.calls[0].args[1]).toBe('existing-hotspot-photo');
  expect(result.targetPhotoId).toBe('fixture-upload-photo-1');
});

test('existing hotspot photo replacement failure preserves the old marker and pending preview', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await activateEditing(page);
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.updateHotspot = 'failure';
    window.__EDIT_TARGET__ = {
      id: 'existing-hotspot-photo-failure',
      fileId: currentFileId,
      label: '既存写真スポット',
      description: '置換前',
      linkUrl: '',
      markerShape: 'circle',
      markerColor: 'amber',
      markerIcon: 'info',
      pitch: 3,
      yaw: 7,
      photoId: 'fixture-scene-360',
      jumpSceneId: ''
    };
    openPopup(520, 300, window.__EDIT_TARGET__);
  });
  await chooseHotspotPhoto(page, { name: 'pending-replacement.png' });
  await page.locator('#input-desc').fill('失敗後も入力保持');
  await page.locator('#btn-save').click();

  await expect(page.locator('#hotspot-popup')).toHaveClass(/visible/);
  await expect(page.locator('#hotspot-photo-file-name')).toHaveText('pending-replacement.png');
  await expect(page.locator('#input-desc')).toHaveValue('失敗後も入力保持');
  await expect(page.locator('#btn-save')).toBeEnabled();
  expect(await page.evaluate(() => ({
    targetPhotoId: window.__EDIT_TARGET__.photoId,
    hasBlob: !!hotspotPhotoUploadState.blob
  }))).toEqual({ targetPhotoId: 'fixture-scene-360', hasBlob: true });
});

for (const viewport of [viewports[0], viewports[2], viewports[4]]) {
  for (const sceneType of ['360', '2D']) {
    for (const theme of ['light', 'dark']) {
      test(`hotspot photo form layout ${viewport.name} ${sceneType} ${theme}`, async ({ page }) => {
        const runtimeErrors = collectRuntimeErrors(page);
        await openHarness(page, viewport, { mode: 'edit', sceneType });
        await page.evaluate((nextTheme) => applyTheme(nextTheme, true), theme);
        await openNewHotspotForm(page, sceneType);
        await chooseHotspotPhoto(page);

        if (viewport.height <= 360) {
          await page.locator('#hotspot-popup-content').evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
        }
        await expect(page.locator('#btn-save')).toBeVisible();
        await expect(page.locator('#hs-back-btn')).toBeVisible();
        const geometry = await readPhotoUploadGeometry(page);
        expect(geometry.card.left).toBeGreaterThanOrEqual(geometry.content.left - 1);
        expect(geometry.card.right).toBeLessThanOrEqual(geometry.content.right + 1);
        expect(geometry.change.height).toBeGreaterThanOrEqual(44);
        expect(geometry.clear.height).toBeGreaterThanOrEqual(44);
        expect(geometry.save.height).toBeGreaterThanOrEqual(44);
        expect(geometry.cancel.height).toBeGreaterThanOrEqual(44);
        expect(overlapArea(geometry.change, geometry.clear)).toBe(0);
        expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.documentClientWidth + 1);
        expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.bodyClientWidth + 1);
        expect(runtimeErrors).toEqual([]);
        expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);

        if (viewport.name === 'landscape-800x360' && sceneType === '360' && theme === 'light') {
          await page.locator('#hs-back-btn').click();
          await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
          expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) =>
            call.method === 'saveHotspot' || call.method === 'updateHotspot'
          ))).toHaveLength(0);
        }
        if (viewport.name === 'landscape-800x360' && sceneType === '2D' && theme === 'dark') {
          await page.locator('#input-label').fill('800×360保存確認');
          await page.locator('#btn-save').click();
          await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
          expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot'))).toHaveLength(1);
        }
      });
    }
  }
}

for (const sceneType of ['360', '2D']) {
  test(`hotspot draft save success replaces the temporary marker in ${sceneType}`, async ({ page }) => {
    await openHarness(page, viewports[1], { mode: 'edit', sceneType });
    await openNewHotspotForm(page, sceneType);
    await page.locator('#input-label').fill('保存成功スポット');
    await page.locator('#btn-save').click();

    await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
    await expect(page.locator('.hs-marker-draft')).toHaveCount(0);
    await expect(page.locator('.hs-marker:not(.hs-marker-draft)')).toHaveCount(1);
    const calls = await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot'));
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].label).toBe('保存成功スポット');
  });
}

for (const failureMode of ['error', 'failure']) {
  test(`hotspot save ${failureMode} keeps inputs and draft`, async ({ page }) => {
    await openHarness(page, viewports[1], { mode: 'edit', sceneType: failureMode === 'error' ? '360' : '2D' });
    await page.evaluate((mode) => { window.__HARNESS_BEHAVIOR__.saveHotspot = mode; }, failureMode);
    await openNewHotspotForm(page, failureMode === 'error' ? '360' : '2D');
    const before = await readDraftState(page);
    await page.locator('#input-label').fill('失敗後も保持');
    await page.locator('#input-desc').fill('入力内容を消さない');
    await page.locator('#btn-save').click();

    await expect(page.locator('#hotspot-popup')).toHaveClass(/visible/);
    await expect(page.locator('.hs-marker-draft')).toHaveCount(1);
    await expect(page.locator('#input-label')).toHaveValue('失敗後も保持');
    await expect(page.locator('#input-desc')).toHaveValue('入力内容を消さない');
    await expect(page.locator('#btn-save')).toBeEnabled();
    expect((await readDraftState(page)).coordinates).toEqual(before.coordinates);

    await page.locator('#hotspot-popup .popup-close-btn').click();
    await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
    await expect(page.locator('.hs-marker-draft')).toHaveCount(0);
    await expect(page.locator('#mode-toggle')).toBeEnabled();
    expect(await page.evaluate(() => !document.getElementById('hotspot-popup').contains(document.activeElement))).toBe(true);
  });
}

test('forced edit-mode exit tears down the hotspot form, draft, and interaction lock', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await openNewHotspotForm(page, '360');

  await page.evaluate(() => toggleMode({ forceExit: true }));

  await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
  await expect(page.locator('.hs-marker-draft')).toHaveCount(0);
  expect(await page.evaluate(() => hotspotFormSessionState.active)).toBe(false);
  expect(await page.evaluate(() => isEditMode)).toBe(false);
  await expect(page.locator('#mode-toggle')).toBeEnabled();
});

test('hotspot form guard blocks scene and conflicting operations then restores them', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await openNewHotspotForm(page, '360');
  const initialScene = await page.evaluate(() => currentFileId);

  for (const selector of ['#mode-toggle', '#scene-refresh-btn', '#upload-btn', '#quality-toggle-btn', '#btn-home', '#bulk-input-trigger']) {
    await expect(page.locator(selector), `${selector} should be disabled while editing a hotspot`).toBeDisabled();
  }
  await expect(page.locator('#toolbar-theme-toggle')).toBeEnabled();
  await expect(page.locator('#fullscreen-btn')).toBeHidden();
  await expect(page.locator('#fullscreen-btn')).toBeDisabled();
  await expect(page.locator('#scene-list .scene-item').nth(1)).toHaveAttribute('aria-disabled', 'true');

  await page.locator('#scene-list .scene-item').nth(1).evaluate((element) => element.click());
  expect(await page.evaluate(() => currentFileId)).toBe(initialScene);
  await expect(page.locator('#toast-msg')).toHaveText('ホットスポットの保存またはキャンセル後に操作してください。');

  await page.locator('#hotspot-popup .popup-close-btn').click();
  await expect(page.locator('#mode-toggle')).toBeEnabled();
  await expect(page.locator('#scene-refresh-btn')).toBeEnabled();
  await expect(page.locator('#fullscreen-btn')).toBeHidden();
  await expect(page.locator('#fullscreen-btn')).toBeDisabled();
  await expect(page.locator('#scene-list .scene-item').nth(1)).not.toHaveAttribute('aria-disabled', 'true');

  await page.locator('#scene-list .scene-item').nth(1).click();
  await page.waitForFunction((previous) => currentFileId !== previous && !isSwitching, initialScene);
});

test('save refuses a scene identity mismatch before calling the server', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await openNewHotspotForm(page, '360');
  await page.locator('#input-label').fill('送信してはいけない');
  await page.evaluate(() => { currentFileId = 'unexpected-scene-change'; });
  await page.locator('#btn-save').click();

  const saveCalls = await page.evaluate(() => window.__HARNESS_CALLS__.filter((call) => call.method === 'saveHotspot'));
  expect(saveCalls).toHaveLength(0);
  await expect(page.locator('#hotspot-popup')).not.toHaveClass(/visible/);
  await expect(page.locator('.hs-marker-draft')).toHaveCount(0);
  await expect(page.locator('#toast-msg')).toContainText('シーン');
});

test('editing an existing hotspot locks its scene without creating a new draft', async ({ page }) => {
  await openHarness(page, viewports[1], { mode: 'edit', sceneType: '360' });
  await activateEditing(page);
  await page.evaluate(() => openPopup(520, 300, {
    id: 'existing-hotspot',
    fileId: currentFileId,
    label: '既存スポット',
    description: '既存説明',
    linkUrl: '',
    markerShape: 'square',
    markerColor: 'teal',
    markerIcon: 'eye',
    pitch: 4,
    yaw: 12,
    photoId: '',
    jumpSceneId: ''
  }));

  await expect(page.locator('#hotspot-popup')).toHaveClass(/visible/);
  await expect(page.locator('.hs-marker-draft')).toHaveCount(0);
  expect(await page.evaluate(() => hotspotFormSessionState.active && hotspotFormSessionState.editing)).toBe(true);
  await expect(page.locator('#scene-refresh-btn')).toBeDisabled();
  await page.locator('#hotspot-popup .popup-close-btn').click();
  await expect(page.locator('#scene-refresh-btn')).toBeEnabled();
});

for (const viewport of viewports) {
  test(`after screenshots ${viewport.name}`, async ({ page }) => {
    test.skip(process.env.UI_CAPTURE_PHASE !== 'after', 'Run with UI_CAPTURE_PHASE=after');
    const outputDir = path.join(artifactRoot, 'after', viewport.name);
    fs.mkdirSync(outputDir, { recursive: true });
    for (const theme of ['light', 'dark']) {
      for (const mode of ['public', 'internal', 'edit']) {
        for (const sceneType of ['360', '2D']) {
          await openHarness(page, viewport, { mode, sceneType });
          await page.evaluate((nextTheme) => applyTheme(nextTheme, true), theme);
          if (mode === 'edit') await activateEditing(page);
          const stem = `${theme}-${mode}-${sceneType.toLowerCase()}-open`;
          const layout = await collectLayout(page);
          fs.writeFileSync(path.join(outputDir, `${stem}.json`), `${JSON.stringify(layout, null, 2)}\n`);
          await page.screenshot({ path: path.join(outputDir, `${stem}.png`), fullPage: false });
        }
      }
    }
  });
}
