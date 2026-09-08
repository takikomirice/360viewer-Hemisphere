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

test('compatible quality is sent to GAS and opt-in transfer diagnostics omit URLs and file IDs', async ({ page }) => {
  const logs = [];
  page.on('console', message => { if (message.text().startsWith('[image-delivery]')) logs.push(message.text()); });
  await page.goto('/?mode=public&sceneType=360&delivery=base64&quality=high&perf=1');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  const args = await page.evaluate(() => __HARNESS_CALLS__.find(c => c.method === 'getImageDataUri').args);
  expect(args[2]).toBe('high');
  expect(logs).toHaveLength(1);
  expect(logs[0]).not.toMatch(/data:|https:|fixture-scene/);
  expect(JSON.parse(logs[0].slice('[image-delivery] '.length))).toMatchObject({ requestedQuality: 'high', characters: expect.any(Number) });
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

test('scene and folder navigation use keyboard buttons and scene actions restore focus', async ({ page }) => {
  await page.goto('/?mode=edit&sceneType=360');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  const scene = page.locator('.scene-item').nth(1);
  const sceneId = await scene.getAttribute('data-id');
  await scene.locator('.scene-item-name').press('Enter');
  await expect(scene).toHaveClass(/active/);
  await page.waitForFunction(id => currentFileId === id && !isSwitching, sceneId);
  await page.locator('#mode-toggle').click();
  const actions = scene.getByRole('button', { name: /の操作$/ });
  await actions.press('Enter');
  await expect(page.locator('#scene-context-menu button:enabled').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(actions).toBeFocused();
  const folder = page.locator('.scene-folder-item').first();
  await expect(folder).toHaveAttribute('role', 'button');
  await folder.press('Space');
  await expect.poll(() => page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'navigateToFolder').length)).toBe(1);
});

test('editing a marker by keyboard offers a cancellable delete and sends only a confirmed delete', async ({ page }) => {
  await page.goto('/?mode=edit&sceneType=360');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  await page.evaluate(() => {
    const hotspot = { id: 'delete-test', fileId: currentFileId, _pannellumId: 'delete-test', markerIcon: 'info', label: '確認対象', description: '保持するデータ' };
    viewer.addHotSpot({ id: hotspot.id, pitch: 0, yaw: 0, cssClass: 'hs-marker', createTooltipFunc: buildMarkerElement, createTooltipArgs: hotspot, clickHandlerFunc: onMarkerClick, clickHandlerArgs: hotspot });
  });
  await page.locator('#mode-toggle').click();
  const marker = page.getByRole('button', { name: '確認対象を開く', exact: true });
  await marker.press('Enter');
  await expect(page.locator('#hs-ctx-edit-btn')).toBeFocused();
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('確認対象'); await dialog.dismiss(); });
  await page.locator('#hs-ctx-delete-btn').click();
  expect(await page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'deleteHotspot').length)).toBe(0);
  await expect(marker).toBeFocused();
  await marker.press('Space');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#hs-ctx-delete-btn').click();
  await expect.poll(() => page.evaluate(() => __HARNESS_CALLS__.filter(c => c.method === 'deleteHotspot').length)).toBe(1);
  await expect(marker).toHaveCount(0);
});

test('2D viewing hides the inactive gyro control', async ({ page }) => {
  await page.goto('/?mode=public&sceneType=2D');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  await expect(page.locator('#gyro-toggle-btn')).toBeHidden();
  await expect(page.locator('#gyro-toggle-btn')).toBeDisabled();
});

test('quiz attachments render, support photo enlargement, and discard delayed media after close', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=public&sceneType=360');
  await page.waitForFunction(() => document.body.dataset.harnessReady === 'true');
  await page.evaluate(() => onMarkerClick({ clientX: 190, clientY: 220 }, { id: 'media-quiz', fileId: currentFileId, markerIcon: 'quiz', label: '写真のクイズ', description: '何が見えますか？|校舎', photoId: 'quiz-photo', audioId: 'quiz-audio' }));
  const quiz = page.getByRole('dialog', { name: 'クイズ', exact: true });
  await expect(quiz.getByRole('button', { name: '写真を拡大表示', exact: true })).toBeVisible();
  await expect(quiz.locator('audio')).toHaveAttribute('src', /^data:audio\//);
  await quiz.getByRole('button', { name: '写真を拡大表示', exact: true }).click();
  await expect(page.locator('#photo-lightbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(quiz).toBeVisible();
  await page.getByRole('button', { name: 'クイズを閉じる' }).click();
  await expect(page.locator('#active-info-popup')).toHaveCount(0);
  await page.evaluate(() => {
    __HARNESS_BEHAVIOR__.getHotspotAudioData = { delay: 120 };
    __HARNESS_BEHAVIOR__.getHotspotPhotoDataUri = { delay: 120 };
    onMarkerClick({ clientX: 190, clientY: 220 }, { id: 'late-quiz', fileId: currentFileId, markerIcon: 'quiz', label: '遅いクイズ', description: '質問|答え', photoId: 'late-photo', audioId: 'late-audio' });
    closeQuizModal();
  });
  await page.waitForTimeout(180);
  await expect(page.locator('#active-info-popup')).toHaveCount(0);
  await expect(quiz).toBeHidden();
});
