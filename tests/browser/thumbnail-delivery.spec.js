const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');
let server;
test.beforeAll(async () => { server = await startHarnessServer(); });
test.afterAll(async () => { if (server) await server.close(); });

test('focusing a visited direct scene never switches its revisit to a pending Base64 request', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360&perf=1&imageDelay=10&base64Delay=5000');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: '避難経路図', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => { window.__HARNESS_IMAGE_BEHAVIOR__ = { delay: 1500 }; });
  await page.getByRole('button', { name: '中庭パノラマ', exact: true }).hover();
  await expect.poll(() => page.evaluate(() => scenePrefetchActive)).toBe(true);
  await page.getByRole('button', { name: '中庭パノラマ', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  const state = await page.evaluate(() => ({
    calls: window.__HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length,
    record: window.__SCENE_PERF_RECORDS__.at(-1)
  }));
  expect(state.calls).toBe(0);
  expect(state.record.marks.imagePreloadComplete).toBeDefined();
  expect(state.record.marks.imagePreparationComplete).toBeUndefined();
});

for (const setting of ['direct', 'default']) test(`public thumbnails use small direct images without thumbnail GAS calls (${setting})`, async ({ page }) => {
  await page.route('https://lh3.googleusercontent.com/d/*=w320', route => route.fulfill({
    contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="teal"/></svg>'
  }));
  await page.goto('/?mode=public&sceneType=360' + (setting === 'default' ? '' : '&thumbnailDelivery=direct'));
  await expect(page.locator('.scene-thumbnail.loaded')).toHaveCount(2);
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter(c => /SceneThumbnail$/.test(c.method)).length)).toBe(0);
  expect(await page.locator('.scene-thumbnail').first().evaluate(n => n.naturalWidth)).toBe(320);
  await expect(page.locator('.scene-thumbnail').first()).toHaveAttribute('crossorigin', 'anonymous');
});

test('inaccessible direct thumbnails fall back while scene and metadata caches remain usable', async ({ page }) => {
  await page.route('https://lh3.googleusercontent.com/d/*=w320', route => route.abort());
  await page.goto('/?mode=public&sceneType=360&perf=1&thumbnailDelivery=direct');
  await expect(page.locator('.scene-thumbnail.loaded')).toHaveCount(2);
  expect(await page.locator('.scene-thumbnail').first().getAttribute('src')).toMatch(/^data:image\/jpeg;base64,/);
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter(c => c.method === 'getSceneThumbnail').length)).toBe(2);
  await page.getByRole('button', { name: '避難経路図', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: '中庭パノラマ', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__SCENE_PERF_RECORDS__.at(-1).hotspotSource)).toBe('cache');
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});
