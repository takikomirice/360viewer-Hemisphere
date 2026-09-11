const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');

let server;
test.beforeAll(async () => { server = await startHarnessServer(); });
test.afterAll(async () => { if (server) await server.close(); });

// Catch controls disappearing, being covered by loading, or accepting actions
// against an unfinished scene. Only the external GAS response is delayed.
for (const viewport of [{ width: 1200, height: 800 }, { width: 390, height: 844 }]) {
  for (const sceneType of ['360', '2D']) {
    test(`controls stay in place during ${sceneType} transition at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/?mode=public&delivery=direct&sceneType=${sceneType}`);
      await expect(page.locator('#loading')).toBeHidden();
      const ids = ['floating-theme-toggle', 'fullscreen-btn', 'btn-home', 'quality-toggle-btn'];
      const before = await page.evaluate(ids => ids.map(id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { id, x: r.x, y: r.y, width: r.width, height: r.height };
      }), ids);
      if (viewport.width <= 600) await page.locator('#mobile-scene-sheet-toggle').click();
      await page.evaluate(() => { window.__HARNESS_BEHAVIOR__.loadHotspots = { delay: 6000 }; });
      await page.getByRole('button', { name: sceneType === '360' ? '避難経路図' : '体育館パノラマ', exact: true }).click();
      await expect(page.locator('#loading')).toBeVisible();
      const during = await page.evaluate(ids => ids.map(id => {
        const el = document.getElementById(id), r = el.getBoundingClientRect();
        return { id, x: r.x, y: r.y, width: r.width, height: r.height,
          hidden: el.hidden, disabled: el.disabled,
          onTop: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      }), ids);
      for (let i = 0; i < ids.length; i++) {
        expect(during[i].hidden, ids[i]).toBe(false);
        expect(during[i].onTop, `${ids[i]} must not be covered`).toBe(true);
        expect(during[i].disabled, ids[i]).toBe(i !== 0);
        for (const key of ['x', 'y', 'width', 'height']) expect(during[i][key], `${ids[i]} ${key}`).toBeCloseTo(before[i][key], 0);
      }
      const theme = await page.locator('html').getAttribute('data-theme');
      await page.locator('#floating-theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'dark' ? 'light' : 'dark');
      await expect(page.locator('#loading')).toBeVisible();
      await expect(page.locator('#loading')).toBeHidden({ timeout: 10000 });
      for (const id of ids) await expect(page.locator(`#${id}`)).toBeEnabled();
      expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
    });
  }
}

test('failed scene keeps disabled controls and theme usable, and retry restores controls', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=2D&delivery=direct');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => { window.__HARNESS_BEHAVIOR__.pannellum = { outcome: 'failed' }; });
  await page.getByRole('button', { name: '体育館パノラマ', exact: true }).click();
  await expect(page.getByRole('button', { name: '互換表示で再試行', exact: true })).toBeVisible();
  for (const id of ['fullscreen-btn', 'btn-home', 'quality-toggle-btn']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.locator('#floating-theme-toggle').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', theme);
  await page.evaluate(() => { window.__HARNESS_BEHAVIOR__.pannellum = { outcome: 'loaded' }; });
  await page.getByRole('button', { name: '互換表示で再試行', exact: true }).click();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#fullscreen-btn')).toBeEnabled();
});

test('editing still hides viewing-only controls during a scene transition', async ({ page }) => {
  await page.goto('/?mode=edit&sceneType=360&delivery=direct');
  await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: '編集モードに切り替える', exact: true }).click();
  await page.evaluate(() => { window.__HARNESS_BEHAVIOR__.loadHotspots = { delay: 6000 }; });
  await page.getByRole('button', { name: '避難経路図', exact: true }).click();
  await expect(page.locator('#loading')).toBeVisible();
  for (const id of ['fullscreen-btn', 'gyro-toggle-btn']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  for (const id of ['btn-home', 'quality-toggle-btn']) {
    expect(await page.locator(`#${id}`).isVisible()).toBe(true);
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  await page.locator('#toolbar-theme-toggle').click();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 10000 });
  await expect(page.locator('#quality-toggle-btn')).toBeEnabled();
});

test('supported gyro stays visible but disabled while the panorama viewer is being replaced', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360&delivery=direct');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    window.DeviceOrientationEvent = function () {};
    viewer.isOrientationSupported = () => true;
    syncSceneActionButtons();
    window.__HARNESS_BEHAVIOR__.loadHotspots = { delay: 6000 };
    clearHotspotCache();
  });
  await expect(page.locator('#gyro-toggle-btn')).toBeEnabled();
  await page.locator('#quality-toggle-btn').click();
  await expect(page.locator('#loading')).toBeVisible();
  expect(await page.locator('#gyro-toggle-btn').isVisible()).toBe(true);
  await expect(page.locator('#gyro-toggle-btn')).toBeDisabled();
  expect(await page.evaluate(() => toggleGyro())).toBe(false);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 10000 });
  await expect(page.locator('#quality-toggle-btn')).toBeEnabled();
});

test('empty scene clears previous scene controls while leaving the theme usable', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=360');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => showSceneEmptyState('写真がありません'));
  for (const id of ['fullscreen-btn', 'btn-home', 'quality-toggle-btn', 'gyro-toggle-btn']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  await page.locator('#floating-theme-toggle').click();
  await expect(page.getByText('写真がありません', { exact: true })).toBeVisible();
});
