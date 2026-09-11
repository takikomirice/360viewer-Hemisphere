const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');
let server;
test.beforeAll(async () => { server = await startHarnessServer(); });
test.afterAll(async () => { if (server) await server.close(); });

test('failed folder refresh retries fresh data and only successful refresh enables reuse', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'シーン一覧を更新', exact: true }).click();
  await page.waitForFunction(() => !isRefreshingSceneList);
  await page.evaluate(() => {
    __HARNESS_BEHAVIOR__.navigateToFolder = { queue: [{ outcome: 'failure' }, { outcome: 'success' }] };
    openSubfolder(allImages.find(item => item.type === 'folder'));
  });
  await expect.poll(() => page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder' && c.completedAt).length)).toBe(1);
  expect(await page.evaluate(() => folderStack.length)).toBe(0);
  await page.evaluate(() => openSubfolder(allImages.find(item => item.type === 'folder')));
  await expect.poll(() => page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder' && c.completedAt).length)).toBe(2);
  expect(await page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder').map(c => c.args[1]))).toEqual([true, true]);
  await page.evaluate(() => { goBackFolder(); openSubfolder(allImages.find(item => item.type === 'folder')); });
  await expect.poll(() => page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder' && c.completedAt).length)).toBe(3);
  expect(await page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder')[2].args[1])).toBe(false);
});

for (const mode of ['public', 'edit']) test(`folder navigation ${mode} uses cache and honors explicit refresh`, async ({ page }) => {
  await page.goto(`/?mode=${mode}&sceneType=360`);
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => openSubfolder(allImages.find(item => item.type === 'folder')));
  await expect.poll(() => page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder' && c.completedAt).length)).toBe(1);
  expect(await page.evaluate(() => __HARNESS_CALLS__.find(c => c.method === 'navigateToFolder').args[1])).toBe(mode === 'edit');
  await page.getByRole('button', { name: 'シーン一覧を更新', exact: true }).click();
  await expect.poll(() => page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'getConfig' && c.args[1] === true).length)).toBeGreaterThan(0);
  await page.waitForFunction(() => !isRefreshingSceneList);
  await page.evaluate(() => openSubfolder(allImages.find(item => item.type === 'folder')));
  await expect.poll(() => page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder' && c.completedAt).length)).toBe(2);
  expect(await page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder')[1].args[1])).toBe(true);
  await page.evaluate(() => { goBackFolder(); openSubfolder(allImages.find(item => item.type === 'folder')); });
  await expect.poll(() => page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder' && c.completedAt).length)).toBe(3);
  expect(await page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder')[2].args[1])).toBe(mode === 'edit');
});
