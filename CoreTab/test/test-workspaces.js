// Run with Node + Playwright and a static server on port 4173.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.CORETAB_TEST_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CORETAB_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // This test-only adapter never ships as an extension script.
    await page.addInitScript(() => {
      window.chrome = {
        storage: { local: { get: async () => ({}), set: async () => {} } },
        tabs: { query: async () => [], getCurrent: async () => ({ id: 1 }) },
        windows: { getCurrent: async () => ({ id: 1 }) },
        history: { search: async () => [] }
      };
    });
    await page.route('https://**/*', route => route.fulfill({ contentType: 'application/json', body: '{"items":[]}' }));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => document.body.dataset.workspace === 'tabs');
    await page.evaluate(() => { window.originalTabsPanel = document.getElementById('tabsWorkspace'); });
    await page.fill('#searchInput', 'keep this search');
    await page.click('[data-workspace-link="prompts"]');
    await page.waitForFunction(() => document.body.dataset.workspace === 'prompts');
    assert.equal(await page.locator('#tabsWorkspace').isVisible(), false);
    assert.equal(await page.locator('#promptsWorkspace').isVisible(), true);
    await page.click('[data-workspace-link="meetings"]');
    await page.waitForFunction(() => document.body.dataset.workspace === 'meetings');
    await page.goBack();
    await page.waitForFunction(() => document.body.dataset.workspace === 'prompts');
    await page.click('[data-workspace-link="tabs"]');
    await page.waitForFunction(() => document.body.dataset.workspace === 'tabs');
    assert.equal(await page.inputValue('#searchInput'), 'keep this search');
    assert.equal(await page.evaluate(() => originalTabsPanel === document.getElementById('tabsWorkspace')), true);
    await page.goto(`${base}/index.html#meetings`);
    await page.waitForFunction(() => document.body.dataset.workspace === 'meetings');
    for (const width of [1440, 800, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow at ${width}px`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: navigation, deep links, back, Tabs state/DOM retention, responsive shell, no runtime errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
