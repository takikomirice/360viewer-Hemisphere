const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');
let server;
test.beforeAll(async () => { server = await startHarnessServer(); });
test.afterAll(async () => { if (server) await server.close(); });

for (const setting of ['0', '1', 'default']) test(`first selection uses ${setting === '0' ? 'network' : 'prefetched'} metadata with direct images (${setting})`, async ({ page }) => {
  const enabled = setting !== '0';
  const query = setting === 'default' ? '' : `&metadataPrefetch=${setting}`;
  await page.goto(`/?mode=public&sceneType=2D&delivery=direct&perf=1&hotspotDelay=1000${query}`);
  await expect(page.locator('#loading')).toBeHidden();
  if (enabled) await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter(c => c.method === 'loadHotspots' && c.completedAt).length)).toBe(2);
  await page.getByRole('button', { name: '体育館パノラマ', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  const result = await page.evaluate(() => ({
    metadataCalls: window.__HARNESS_CALLS__.filter(c => c.method === 'loadHotspots').length,
    imageCalls: window.__HARNESS_CALLS__.filter(c => c.method === 'getImageDataUri').length,
    record: window.__SCENE_PERF_RECORDS__[1],
    errors: window.__HARNESS_ERRORS__
  }));
  expect(result.record.status).toBe('loaded');
  expect(result.record.hotspotSource).toBe(enabled ? 'cache' : 'network');
  expect(result.metadataCalls).toBe(2);
  expect(result.imageCalls).toBe(0);
  expect(result.errors).toEqual([]);
});

test('selecting a scene during its prefetch shares the request and keeps final view data', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=2D&delivery=direct&perf=1&hotspotDelay=1500&metadataPrefetch=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => { window.__HARNESS_BEHAVIOR__.loadHotspots = { delay: 1500, response: {
    northOffset: 73, hotspots: [{ id: 'prefetched-marker', fileId: 'fixture-scene-360', label: '先読みした案内',
      description: '保持確認', linkUrl: '', pitch: 10, yaw: 42, markerShape: 'circle', markerColor: '#fbbf24',
      markerIcon: 'info', photoId: '', jumpSceneId: '', audioId: '' }]
  } }; });
  await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter(c => c.method === 'loadHotspots').length)).toBe(2);
  await page.getByRole('button', { name: '体育館パノラマ', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  const state = await page.evaluate(() => ({ count: window.__HARNESS_CALLS__.filter(c => c.method === 'loadHotspots').length,
    record: window.__SCENE_PERF_RECORDS__[1], hotspots: window.__HARNESS_VIEWER_LOADS__.at(-1).hotspotLabels }));
  expect(state.count).toBe(2);
  expect(state.record.hotspotSource).toBe('pending');
  expect(state.record.status).toBe('loaded');
  expect(state.hotspots).toEqual(['先読みした案内']);
});

test('list refresh discards prefetched metadata so updated marker data is fetched', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=2D&delivery=direct&metadataPrefetch=1');
  await expect(page.locator('#loading')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__HARNESS_CALLS__.filter(c => c.method === 'loadHotspots' && c.completedAt).length)).toBe(2);
  await page.evaluate(() => { window.__HARNESS_BEHAVIOR__.loadHotspots = { response: { northOffset: 123,
    hotspots: [{ id: 'updated-marker', fileId: 'fixture-scene-360', label: '更新後の案内',
      description: '', linkUrl: '', pitch: 0, yaw: 0, markerShape: 'circle', markerColor: '#fbbf24',
      markerIcon: 'info', photoId: '', jumpSceneId: '', audioId: '' }]
  } }; });
  await page.getByRole('button', { name: 'シーン一覧を更新', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: '体育館パノラマ', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => window.__HARNESS_VIEWER_LOADS__.at(-1).hotspotLabels)).toEqual(['更新後の案内']);
});
