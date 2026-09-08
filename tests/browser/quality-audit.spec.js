const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');

let server;
test.beforeAll(async () => { server = await startHarnessServer(); });
test.afterAll(async () => { if (server) await server.close(); });

test('panorama starts still so markers remain available to point at and read', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  expect(await page.evaluate(() => createPannellumViewerConfig('fixture', [], null).autoRotate)).toBe(0);
});

test('default delivery automatically recovers when a Drive direct image is unavailable', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360&imageOutcome=failed');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length)).toBe(1);
});

test('quiz answer and close work by keyboard without leaking focus or the hidden answer link', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  await page.evaluate(() => {
    const hotspot = {
      markerIcon: 'quiz', label: '校内クイズ', description: '質問です|答えです', linkUrl: 'https://example.com/'
    };
    viewer.addHotSpot({
      id: 'quiz-test-marker', pitch: 0, yaw: 0, cssClass: 'hs-marker',
      createTooltipFunc: buildMarkerElement, createTooltipArgs: hotspot,
      clickHandlerFunc: onMarkerClick, clickHandlerArgs: hotspot
    });
  });
  const marker = page.getByRole('button', { name: '校内クイズを開く', exact: true });
  await marker.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'クイズ', exact: true });
  const flip = page.getByRole('button', { name: '答えを見る', exact: true });
  await expect(dialog).toBeVisible();
  await expect(flip).toBeFocused();
  await expect(page.getByRole('link', { name: 'さらに詳しく' })).toHaveCount(0);
  await flip.press('Enter');
  await expect(page.getByRole('link', { name: 'さらに詳しく' })).toBeVisible();
  await expect(page.getByRole('button', { name: '問題に戻る' })).toBeFocused();
  await page.getByRole('button', { name: '問題に戻る' }).press('Space');
  await expect(page.getByRole('link', { name: 'さらに詳しく' })).toHaveCount(0);
  await page.getByRole('button', { name: '答えを見る' }).press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'クイズを閉じる' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(marker).toBeFocused();
});

for (const storageMode of ['folder', 'single']) {
  test(`failed direct image has a one-click compatible retry without reloading config: ${storageMode}`, async ({ page }) => {
    await page.goto(`/?mode=public&sceneType=360&storageMode=${storageMode}&delivery=direct&viewerOutcome=failed`);
    const retry = page.getByRole('button', { name: '互換表示で再試行', exact: true });
    await expect(retry).toBeVisible();
    await page.evaluate(() => { window.__HARNESS_BEHAVIOR__.pannellum = { outcome: 'loaded' }; });
    await retry.click();
    await expect(page.locator('#loading')).toBeHidden();
    const calls = await page.evaluate(() => window.__HARNESS_CALLS__.map(call => call.method));
    expect(calls.filter(method => method === 'getConfig')).toHaveLength(1);
    expect(calls.filter(method => method === 'getImageDataUri')).toHaveLength(1);
  });
}

test('compatible images reuse recent visits and refresh invalidates them', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360&delivery=base64');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  await page.evaluate(async () => {
    const scenes = allImages.filter(item => item.type !== 'folder');
    const load = id => new Promise((resolve, reject) => loadBase64ImageForScene(id, resolve, reject));
    await load(scenes[1].id);
    await load(scenes[0].id);
  });
  expect(await page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length)).toBe(2);
  await page.getByRole('button', { name: 'シーン一覧を更新', exact: true }).click();
  await page.waitForFunction(() => !isRefreshingSceneList);
  await page.evaluate(() => new Promise((resolve, reject) => loadBase64ImageForScene(currentFileId, resolve, reject)));
  expect(await page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length)).toBe(3);
});

test('compatible image requests share in-flight work and failures allow retry', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360&delivery=direct');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  const result = await page.evaluate(async () => {
    const load = () => new Promise(resolve => loadBase64ImageForScene(currentFileId, () => resolve('loaded'), () => resolve('failed')));
    __HARNESS_BEHAVIOR__.getImageDataUri = { outcome: 'failure', delay: 50 };
    const failed = await Promise.all([load(), load()]);
    __HARNESS_BEHAVIOR__.getImageDataUri = { delay: 50 };
    const retried = await Promise.all([load(), load()]);
    return { failed, retried, calls: __HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length };
  });
  expect(result).toEqual({ failed: ['failed', 'failed'], retried: ['loaded', 'loaded'], calls: 2 });
});

test('compatible image cache expires, evicts least recently used entries and respects its size limit', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360&delivery=direct');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  const result = await page.evaluate(async () => {
    const load = id => new Promise((resolve, reject) => loadBase64ImageForScene(id, resolve, reject));
    BASE64_IMAGE_CACHE_MAX_ENTRIES = 2;
    await load('a'); await load('b'); await load('a'); await load('c'); await load('b');
    const afterEviction = __HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length;
    base64ImageCache.forEach(entry => { entry.expiresAt = 0; });
    await load('b');
    const afterExpiry = __HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length;
    clearBase64ImageCache();
    BASE64_IMAGE_CACHE_MAX_CHARS = 1;
    await load('large'); await load('large');
    return { afterEviction, afterExpiry, total: __HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length, retained: base64ImageCache.size };
  });
  expect(result).toEqual({ afterEviction: 4, afterExpiry: 5, total: 7, retained: 0 });
});
