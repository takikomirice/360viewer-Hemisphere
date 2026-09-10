const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');
let server;
test.beforeAll(async () => { server = await startHarnessServer(); });
test.afterAll(async () => { if (server) await server.close(); });

test('sidebar shows decoded thumbnails with names and preserves width through collapse and reload', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/?mode=public&sceneType=360');
  const thumb = page.locator('.scene-thumbnail').first();
  await expect(thumb).toHaveClass(/loaded/);
  await expect.poll(() => thumb.evaluate(n => n.naturalWidth)).toBe(320);
  await expect(page.locator('.scene-item-name').first()).toHaveText('中庭パノラマ');
  const handle = page.getByRole('separator', { name: 'シーン一覧の幅を調整' });
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '290');
  await expect.poll(() => page.locator('#panorama').evaluate(n => Math.round(n.getBoundingClientRect().left))).toBe(290);
  await page.getByRole('button', { name: 'シーン一覧を閉じる', exact: true }).click();
  await expect.poll(() => page.locator('#panorama').evaluate(n => Math.round(n.getBoundingClientRect().left))).toBe(0);
  await page.reload();
  await expect(handle).toHaveAttribute('aria-valuenow', '290');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down(); await page.mouse.move(380, box.y + 200); await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '380');
  await expect.poll(() => page.locator('#panorama').evaluate(n => Math.round(n.getBoundingClientRect().left))).toBe(380);
});

test('failed thumbnail leaves scene selection usable and another thumbnail can complete', async ({ page }) => {
  await page.goto('/?mode=edit&sceneType=2D');
  await page.evaluate(() => { window.__HARNESS_BEHAVIOR__.prepareSceneThumbnail = { queue: [{ outcome: 'failure' }, { outcome: 'success' }] }; });
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('.scene-thumbnail').nth(1)).toHaveClass(/loaded/);
  await expect(page.locator('.scene-thumbnail').first()).not.toHaveClass(/loaded/);
  await page.locator('.scene-item-name').nth(1).click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('.scene-item').nth(1)).toHaveClass(/active/);
});

test('mobile viewer retains its scene sheet and does not expose desktop resizing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=public&sceneType=360');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#scene-sidebar-resize')).toBeHidden();
  await expect.poll(() => page.locator('#panorama').evaluate(n => Math.round(n.getBoundingClientRect().width))).toBe(390);
});

test('intent prefetch is reused on selection without another image RPC', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360');
  await expect(page.locator('#loading')).toBeHidden();
  const next = page.locator('.scene-item-name').nth(1);
  await next.hover();
  await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length)).toBe(1);
  await next.click();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length)).toBe(1);
});
