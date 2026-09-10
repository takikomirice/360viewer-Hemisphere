const { test, expect } = require('@playwright/test');
const { startHarnessServer } = require('./harness-server');
let server;
test.beforeAll(async () => { server = await startHarnessServer(); });
test.afterAll(async () => { if (server) await server.close(); });

test('scene cards use the full photo with a centered translucent name band at its bottom', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/?mode=public&sceneType=360');
  const card = page.locator('.scene-item').first();
  await expect(card.locator('.scene-thumbnail')).toHaveClass(/loaded/);
  const geometry = await card.evaluate(n => {
    const photo = n.querySelector('.scene-thumbnail'), label = n.querySelector('.scene-item-name');
    const p = photo.getBoundingClientRect(), l = label.getBoundingClientRect(), c = n.getBoundingClientRect();
    const style = getComputedStyle(label);
    return { photoFraction:p.width/c.width, photoBottom:p.bottom, labelBottom:l.bottom, labelTop:l.top, photoTop:p.top,
      centered:style.textAlign, color:style.color, background:style.backgroundColor };
  });
  expect(geometry.photoFraction).toBeGreaterThan(.95);
  expect(Math.abs(geometry.photoBottom-geometry.labelBottom)).toBeLessThan(2);
  expect(geometry.labelTop).toBeGreaterThan(geometry.photoTop);
  expect(geometry.centered).toBe('center');
  expect(geometry.color).toBe('rgb(255, 255, 255)');
  expect(geometry.background).toMatch(/^rgba\(0, 0, 0, 0\./);
  await card.locator('.scene-item-name').press('Tab');
  await page.locator('.scene-item-name').nth(1).click();
  await expect(page.locator('.scene-item').nth(1)).toHaveClass(/active/);
});

test('mobile editing keeps the card menu above the caption and the card inside the strip', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width:390, height:844 }, isMobile:true, hasTouch:true });
  const page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4173/?mode=edit&sceneType=360');
    await expect(page.locator('#loading')).toBeHidden();
    await page.getByRole('button', { name:'編集モードに切り替える', exact:true }).click();
    const bounds = await page.locator('.scene-item').first().evaluate(n => {
      const menu=n.querySelector('.scene-menu-button').getBoundingClientRect(), caption=n.querySelector('.scene-item-name').getBoundingClientRect();
      const card=n.getBoundingClientRect(), strip=document.getElementById('scene-sidebar').getBoundingClientRect();
      return { menuBottom:menu.bottom, captionTop:caption.top, cardBottom:card.bottom, stripBottom:strip.bottom, captionHeight:caption.height };
    });
    expect(bounds.menuBottom).toBeLessThanOrEqual(bounds.captionTop);
    expect(bounds.cardBottom).toBeLessThanOrEqual(bounds.stripBottom);
    expect(bounds.captionHeight).toBeGreaterThanOrEqual(44);
  } finally { await context.close(); }
});

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
  await expect(handle).toHaveAttribute('aria-valuenow', '170');
  await expect.poll(() => page.locator('#panorama').evaluate(n => Math.round(n.getBoundingClientRect().left))).toBe(170);
  await page.getByRole('button', { name: 'シーン一覧を閉じる', exact: true }).click();
  await expect.poll(() => page.locator('#panorama').evaluate(n => Math.round(n.getBoundingClientRect().left))).toBe(0);
  await page.reload();
  await expect(handle).toHaveAttribute('aria-valuenow', '170');
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
