const fs = require('node:fs');
const path = require('node:path');
const { chromium, defineConfig } = require('@playwright/test');

function findCachedChromium() {
  const configuredPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (configuredPath && fs.existsSync(configuredPath)) return configuredPath;
  if (fs.existsSync(chromium.executablePath())) return '';

  const cacheRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
    : '';
  if (!cacheRoot || !fs.existsSync(cacheRoot)) return null;
  const revisions = fs.readdirSync(cacheRoot)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((left, right) => Number(right.split('-')[1]) - Number(left.split('-')[1]));
  for (const revision of revisions) {
    const candidates = process.platform === 'win32'
      ? [path.join(cacheRoot, revision, 'chrome-win64', 'chrome.exe')]
      : process.platform === 'darwin'
        ? [path.join(cacheRoot, revision, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')]
        : [path.join(cacheRoot, revision, 'chrome-linux', 'chrome')];
    const executable = candidates.find((candidate) => fs.existsSync(candidate));
    if (executable) return executable;
  }
  return null;
}

const cachedChromium = findCachedChromium();
const harnessPort = Number(process.env.UI_HARNESS_PORT || 4173);
const browserSelection = cachedChromium === ''
  ? {}
  : cachedChromium
    ? { launchOptions: { executablePath: cachedChromium } }
    : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' };

module.exports = defineConfig({
  testDir: path.join(__dirname, 'tests', 'browser'),
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  outputDir: path.join(__dirname, 'output', 'playwright', 'test-results'),
  reporter: [
    ['line'],
    ['html', {
      outputFolder: path.join(__dirname, 'output', 'playwright', 'report'),
      open: 'never'
    }]
  ],
  use: {
    baseURL: `http://127.0.0.1:${harnessPort}`,
    browserName: 'chromium',
    ...browserSelection,
    colorScheme: 'light',
    locale: 'ja-JP',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off'
  }
});
