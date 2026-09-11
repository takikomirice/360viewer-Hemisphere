const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');
let server;
test.beforeAll(async () => { server = await startHarnessServer(); });
test.afterAll(async () => { if (server) await server.close(); });

for (const enabled of [false, true]) test(`idle photo/audio preparation shares popup reads (${enabled})`, async ({ page }) => {
  await page.goto(`/?mode=public&sceneType=360&storageMode=folder&delivery=direct&hotspotPrefetch=${enabled ? 1 : 0}`);
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getHotspotPhotoDataUri = { delay: 700 };
    window.__HARNESS_BEHAVIOR__.getHotspotAudioData = { delay: 700 };
    window.__perfSpots = [
      { fileId: currentFileId, id: 'photo', label: '写真', photoId: 'photo-file' },
      { fileId: currentFileId, id: 'audio', label: '音楽', audioId: 'audio-file' }
    ];
    scheduleHotspotMediaPrefetch(window.__perfSpots);
  });
  if (enabled) await expect.poll(() => page.evaluate(() => Object.keys(photoCache).length + Object.keys(hotspotAudioCache).length)).toBe(2);
  else {
    await page.waitForTimeout(1300);
    expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter(c => /^getHotspot(Photo|Audio)/.test(c.method)).length)).toBe(0);
  }
  await page.evaluate(() => onMarkerClick({ clientX: 220, clientY: 200 }, window.__perfSpots[0]));
  await expect(page.locator('.info-popup-photo')).toBeVisible();
  await page.evaluate(() => onMarkerClick({ clientX: 220, clientY: 200 }, window.__perfSpots[1]));
  await expect(page.locator('#active-info-popup audio')).toHaveAttribute('src', /^data:audio/);
  expect(await page.locator('#active-info-popup audio').evaluate(el => el.paused && !el.autoplay)).toBe(true);
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter(c => /^getHotspot(Photo|Audio)/.test(c.method)).length)).toBe(2);
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});

test('photo focus and click coalesce, and a closed popup cannot receive a late photo', async ({ page }) => {
  await page.goto('/?mode=public&storageMode=single&hotspotPrefetch=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    window.__HARNESS_BEHAVIOR__.getHotspotPhotoDataUri = { delay: 800 };
    const marker = document.createElement('div'); marker.id = 'photo-intent';
    const args = { id: 'focus-photo', fileId: 'fixture-single-scene', label: '写真', photoId: 'photo-file' };
    buildMarkerElement(marker, args); marker.addEventListener('click', e => onMarkerClick(e, args));
    document.body.appendChild(marker); marker.focus(); marker.click();
    closeActiveInfoPopup({ restoreFocus: false });
  });
  await expect.poll(() => page.evaluate(() => Object.keys(photoCache).length)).toBe(1);
  await expect(page.locator('#active-info-popup')).toHaveCount(0);
  await page.evaluate(() => document.getElementById('photo-intent').click());
  await expect(page.locator('.info-popup-photo')).toBeVisible();
  expect(await page.evaluate(() => window.__HARNESS_CALLS__.filter(c => c.method === 'getHotspotPhotoDataUri').length)).toBe(1);
});

test('real scene completion starts idle media and prioritizes jump metadata', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=2D&delivery=direct&perf=1');
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => {
    clearHotspotCache();
    window.__HARNESS_BEHAVIOR__.loadHotspots = { response: { northOffset: 12, hotspots: [
      { id: 'photo', fileId: 'fixture-scene-2d', label: '写真', photoId: 'photo-file', pitch: 0, yaw: 0 },
      { id: 'jump', fileId: 'fixture-scene-2d', jumpSceneId: 'fixture-scene-360', pitch: 0, yaw: 45 }
    ] } };
    loadScene(allImages.find(item => item.id === 'fixture-scene-2d'));
  });
  await expect.poll(() => page.evaluate(() => Object.keys(photoCache).length)).toBe(1);
  await expect.poll(() => page.evaluate(() => !!hotspotCacheByFileId['fixture-scene-360'])).toBe(true);
  await page.evaluate(() => onMarkerClick({ clientX: 220, clientY: 200 }, { jumpSceneId: 'fixture-scene-360' }));
  await expect(page.locator('#loading')).toBeHidden();
  expect(await page.evaluate(() => scenePerformanceRecords.at(-1).hotspotSource)).toBe('cache');
  expect(await page.evaluate(() => window.__HARNESS_ERRORS__)).toEqual([]);
});
