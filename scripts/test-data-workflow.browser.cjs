'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function generate(page, button = '#generateButton') {
  await page.locator(button).press('Enter');
  await page.locator('#previewResult').waitFor({ state: 'visible' });
}

async function downloadJson(page) {
  await page.locator('#exportFormat').selectOption('json');
  await page.locator('#outputNameInput').fill('workflow');
  const pending = page.waitForEvent('download');
  await page.locator('#saveOutputButton').click();
  const file = await pending;
  assert.equal(file.suggestedFilename(), 'workflow.json');
  return JSON.parse(await fs.readFile(await file.path(), 'utf8'));
}

async function exercise(browser, target, language, viewport) {
  const context = await browser.newContext({ locale: language, viewport, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    const errors = [], network = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('request', req => { if (/^https?:/i.test(req.url())) network.push(req.url()); });
    await page.goto(pathToFileURL(path.resolve(__dirname, '..', target)).href);
    await page.locator('#columnList .column-row').first().waitFor();
    const columns = page.locator('#columnList .column-row');
    const email = columns.nth(2);
    const missing = email.locator('[data-test-setting="missing"]');
    await page.locator('#seedInput').fill('42');
    await email.locator('[data-test-setting="invalid"]').fill('1');
    await missing.fill('100');
    await page.locator('#generateButton').press('Enter');
    assert.equal(await missing.evaluate(el => el === document.activeElement), true);
    assert.match(await email.innerText(), /101\s*%/);

    await missing.fill('0');
    await generate(page);
    assert.equal(await page.locator('#previewBodyRows tr').count(), 20);
    await page.locator('button[data-example-mode="invalid"]').press('Enter');
    const sample = await page.locator('#testExampleRows td').allTextContents();
    const rowNumber = Number(sample[0]);
    assert.ok(rowNumber > 20);
    assert.equal(sample[1], 'email');
    const records = await downloadJson(page);
    assert.equal(records.length, 100);
    assert.equal(JSON.parse(sample[2]), records[rowNumber - 1].email);

    await page.locator('#templateSelect').selectOption('order');
    await page.locator('#applyTemplateButton').click();
    await page.locator('#appConfirmOk').click();
    await page.locator('#rowCount').fill('3');
    assert.match(await page.locator('#templateSummary').innerText(), /7.*3/);
    await generate(page, '#templateGenerateButton');
    assert.equal(await page.locator('#previewBodyRows tr').count(), 3);
    assert.equal(await page.locator('#previewHead th').first().textContent(), 'order_id');

    await page.locator('#templateSelect').selectOption('user');
    await page.locator('#applyTemplateButton').click();
    await page.locator('#appConfirmOk').click();
    await page.locator('#addColumnButton').click();
    const kana = columns.last();
    await kana.locator('[data-role="type"]').selectOption('ja_kana');
    await kana.locator('[data-role="name"]').fill('reading');
    await kana.locator('[data-setting="sourceColumn"]').selectOption({ label: 'name' });
    await generate(page);
    const linked = await downloadJson(page);
    assert.match(linked[0].reading, /^[ぁ-ゖ]+ [ぁ-ゖ]+$/u);
    await page.reload();
    const sourceSelect = page.locator('[data-setting="sourceColumn"]');
    await sourceSelect.waitFor();
    assert.equal(await sourceSelect.locator('option:checked').textContent(), 'name');
    await generate(page);
    assert.deepEqual(await downloadJson(page), linked);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    console.log('PASS', target, language, viewport.width + 'px', 'email sample matches JSON at row', rowNumber, '· validation focus · quick template · persisted readings · offline');
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    await exercise(browser, 'dist/index.html', 'ja', { width: 360, height: 800 });
    await exercise(browser, 'dist/index.self-extract.html', 'en', { width: 1360, height: 900 });
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
