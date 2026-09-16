// Run with Node + Playwright and a static server on port 4173.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.CORETAB_TEST_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CORETAB_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
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
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click('[data-workspace-link="prompts"]');
    await page.waitForSelector('.prompt-card');
    assert.equal(await page.locator('.prompt-card').count(), 6);
    await page.click('[data-p-category="技术"]');
    assert.equal(await page.locator('.prompt-card').count(), 1);
    await page.click('[data-p-action="favorite"]');
    await page.click('[data-p-category="我的收藏"]');
    assert.equal(await page.locator('.prompt-card').count(), 1);
    await page.click('[data-p-category="全部"]');
    await page.fill('#workspaceSearch', 'React');
    assert.equal(await page.locator('.prompt-card').count(), 1);
    assert.equal(await page.inputValue('#promptSearch'), 'React');
    await page.fill('#promptSearch', 'not-a-match');
    assert.equal(await page.locator('.prompt-card').count(), 0);
    await page.fill('#promptSearch', '');
    await page.click('.ws-page-heading [data-p-action="new"]');
    await page.fill('#promptForm [name="title"]', '<img src=x onerror=alert(1)> 测试');
    await page.fill('#promptForm [name="description"]', '描述测试');
    await page.fill('#promptForm [name="tags"]', '测试,变量');
    await page.fill('#promptForm [name="content"]', '你好 {{name}}，请处理 {{project}}');
    await page.fill('[data-variable="name"]', 'CoreTab');
    await page.fill('[data-variable="project"]', '<script>safe</script>');
    assert.equal(await page.textContent('#promptPreview'), '你好 CoreTab，请处理 <script>safe</script>');
    await page.click('#promptForm button[type="submit"]');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    await page.fill('#promptSearch', '描述测试');
    assert.equal(await page.locator('.prompt-card').count(), 1);
    assert.equal(await page.locator('.prompt-card img').count(), 0);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('[data-p-action="copy"]');
    await page.waitForFunction(() => document.querySelector('.prompt-meta').textContent.includes('使用 1 次'));
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '你好 {{name}}，请处理 {{project}}');
    await page.click('[data-p-action="edit"]');
    await page.fill('#promptForm [name="title"]', '更新后的 Prompt');
    await page.click('#promptForm button[type="submit"]');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    await page.reload();
    await page.waitForSelector('.prompt-card');
    await page.fill('#promptSearch', '更新后的');
    assert.equal(await page.locator('.prompt-card').count(), 1);
    await page.click('[data-p-action="edit"]');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#deletePrompt');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    assert.equal(await page.locator('.prompt-card').count(), 0);
    await page.click('[data-p-category="回收站"]');
    assert.equal(await page.locator('.prompt-card').count(), 1);
    await page.click('[data-p-action="restore"]');
    await page.click('[data-p-category="全部"]');
    assert.equal(await page.locator('.prompt-card').count(), 1);
    await page.fill('#promptSearch', '');
    await page.selectOption('#promptTagFilter', 'GitHub');
    assert.equal(await page.locator('.prompt-card').count(), 1);
    await page.selectOption('#promptTagFilter', '');
    await page.click('[data-p-page="2"]');
    assert.equal(await page.locator('.prompt-card').count(), 1);
    await page.click('[data-p-page="1"]');
    await page.click('.ws-page-heading [data-p-action="new"]');
    await page.fill('#promptForm [name="title"]', '未保存草稿');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    await page.click('.ws-page-heading [data-p-action="new"]');
    assert.equal(await page.inputValue('#promptForm [name="title"]'), '未保存草稿');
    await page.fill('#promptForm [name="content"]', '存储失败测试');
    await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError'); }; });
    await page.click('#promptForm button[type="submit"]');
    assert.equal(await page.locator('#workspaceDialog').isVisible(), true);
    assert.match(await page.textContent('#wsDialogError'), /保存失败/);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    for (const width of [1440, 800, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Prompt no overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (process.env.CORETAB_SCREENSHOTS) await page.screenshot({ path: `${process.env.CORETAB_SCREENSHOTS}/coretab-prompts.png`, fullPage: true });

    // --- Meetings workspace ---
    await page.click('[data-workspace-link="meetings"]');
    await page.waitForFunction(() => document.body.dataset.workspace === 'meetings');
    assert.equal(await page.locator('#meetingEmpty').isVisible(), true);
    await page.click('[data-m-action="create"]');
    await page.fill('#meetingTitleInput', '产品评审会');
    await page.click('#meetingForm button[type="submit"]');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    await page.waitForSelector('#transcriptSpeaker');
    assert.equal(await page.locator('#meetingActive').isVisible(), true);
    assert.equal(await page.locator('#meetingEmpty').evaluate(el => el.hidden), true);
    await page.fill('#transcriptText', '大家好，今天我们讨论产品路线图');
    await page.fill('#transcriptSpeaker', 'Alice');
    await page.click('[data-m-action="add-transcript"]');
    assert.equal(await page.locator('.transcript-item').count(), 1);
    assert.match(await page.textContent('.transcript-speaker'), /Alice/);
    await page.fill('#transcriptText', '我们需要优先处理用户反馈');
    await page.fill('#transcriptSpeaker', 'Bob');
    await page.click('[data-m-action="add-transcript"]');
    assert.equal(await page.locator('.transcript-item').count(), 2);
    await page.fill('#summaryInput', '讨论产品优先级');
    await page.click('[data-m-action="add-summary"]');
    assert.equal(await page.locator('#summaryList li').count(), 1);
    await page.fill('#keyPointInput', '用户反馈优先');
    await page.click('[data-m-action="add-keypoint"]');
    assert.equal(await page.locator('#keyPointsList li').count(), 1);
    await page.fill('#actionItemInput', '整理用户反馈文档');
    await page.click('[data-m-action="add-action"]');
    assert.equal(await page.locator('#actionItemsList li').count(), 1);
    await page.click('#actionItemsList input[type="checkbox"]');
    assert.equal(await page.locator('#actionItemsList .completed').count(), 1);
    await page.click('[data-m-action="pause"]');
    assert.match(await page.textContent('#meetingStatus'), /已暂停/);
    await page.click('[data-m-action="pause"]');
    assert.match(await page.textContent('#meetingStatus'), /正在录音/);
    page.once('dialog', dialog => dialog.accept());
    await page.click('[data-m-action="end"]');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    assert.equal(await page.locator('#meetingEmpty').isVisible(), true);
    assert.equal(await page.locator('#meetingActive').isVisible(), false);
    assert.equal(await page.locator('.meeting-item').count(), 1);
    assert.match(await page.textContent('.meeting-item-head h2'), /产品评审会/);
    await page.click('[data-m-action="view"]');
    await page.waitForSelector('#workspaceDialog');
    assert.match(await page.textContent('#wsDialogTitle'), /产品评审会/);
    assert.equal(await page.locator('.meeting-detail .transcript-item').count(), 2);
    assert.equal(await page.locator('.meeting-detail .action-item').count(), 1);
    page.once('dialog', dialog => dialog.accept());
    await page.click('#deleteMeetingDetail');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    assert.equal(await page.locator('.meeting-item').count(), 0);
    await page.click('[data-m-action="create"]');
    await page.fill('#meetingTitleInput', '');
    await page.click('#meetingForm button[type="submit"]');
    assert.match(await page.textContent('#wsDialogError'), /不能为空/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    await page.click('[data-m-action="create"]');
    await page.fill('#meetingTitleInput', '测试存储失败');
    await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError'); }; });
    await page.click('#meetingForm button[type="submit"]');
    assert.match(await page.textContent('#wsDialogError'), /保存失败/);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    await page.click('[data-m-action="create"]');
    await page.fill('#meetingTitleInput', 'XSS 测试 <img src=x onerror=alert(1)>');
    await page.click('#meetingForm button[type="submit"]');
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    assert.equal(await page.locator('.meeting-item img').count(), 0);
    await page.click('[data-m-action="end"]');
    page.once('dialog', dialog => dialog.accept());
    await page.waitForFunction(() => !document.getElementById('workspaceDialog').open);
    for (const width of [1440, 800, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Meetings no overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (process.env.CORETAB_SCREENSHOTS) await page.screenshot({ path: `${process.env.CORETAB_SCREENSHOTS}/coretab-meetings.png`, fullPage: true });

    assert.deepEqual(errors, []);
    console.log('PASS: navigation, Tabs preservation, Prompt CRUD/search/filter/favorites/copy/pagination/variables/persistence/quota/XSS, Meetings create/pause/end/transcript/summary/actions/delete/quota/XSS, responsive layouts');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
