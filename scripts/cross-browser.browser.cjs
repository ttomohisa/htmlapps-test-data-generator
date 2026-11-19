'use strict';
// Cross-engine smoke tests for local file:// standalone builds; not deployed code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { firefox, webkit } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const entries = [
    ['Firefox', firefox],
    ['WebKit', webkit]
  ];
  for (const [name,engine] of entries) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const target of ['dist/index.html','dist/index.self-extract.html']) {
        for (const language of ['ja','en']) {
          const context = await browser.newContext({
            viewport:{width:375,height:812},locale:language,reducedMotion:'reduce',acceptDownloads:true
          });
          try {
            const page = await context.newPage(), errors = [], requests = [];
            page.on('pageerror', e => errors.push(e.message));
            page.on('request', r => { if(/^https?:/i.test(r.url())) requests.push(r.url()); });
            await page.goto(pathToFileURL(path.join(root,target)).href);
            if ((await page.locator('html').getAttribute('lang')) !== language) await page.locator('#languageButton').click();
            await page.locator('#rowCount').fill('4');
            await page.locator('#seedInput').fill('cross-engine-smoke');
            await page.locator('#generateButton').click();
            await page.waitForFunction(() => !document.querySelector('#saveOutputButton').disabled, { timeout: 20000 });
            assert.equal(await page.locator('#previewBodyRows tr').count(),4);
            await page.waitForFunction(() => {
              const el = document.querySelector('#previewSection');
              const t = el.getBoundingClientRect().top;
              const h = document.querySelector('.app-header').getBoundingClientRect().height;
              return t >= h - 4 && t <= h + 28;
            }, { timeout: 15000 });
            assert.equal(await page.locator('#heroTitle').count(),0);
            assert.equal(await page.locator('[data-i18n="previewBody"]').count(),0);
            assert.equal(await page.locator('#encodingField').isVisible(),true);
            await page.locator('#exportFormat').selectOption('parquet');
            assert.equal(await page.locator('#encodingField').isVisible(),false);
            assert.equal(await page.locator('#newlineField').isVisible(),false);
            const pending=page.waitForEvent('download');
            await page.locator('#saveOutputButton').click();
            const download=await pending;
            assert.equal(download.suggestedFilename(),'test-data.parquet');
            const tmp=path.join(root,'test-results','mobile-help',`cross-${name}-${target.includes('self-extract')?'loader':'normal'}-${language}.parquet`);
            await download.saveAs(tmp);
            const bytes=fs.readFileSync(tmp);
            assert.equal(bytes.subarray(0,4).toString('ascii'),'PAR1');
            assert.equal(bytes.subarray(-4).toString('ascii'),'PAR1');
            assert.deepEqual(errors,[],name+': runtime errors');
            assert.deepEqual(requests,[],name+': external requests');
            const overflow=await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            assert.ok(overflow<=1,name+': horizontal overflow '+overflow);
            console.log('PASS',name,target,language,'375px file:// generation, scroll, Parquet download and offline checks');
          } finally { await context.close(); }
        }
      }
    } finally { await browser.close(); }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
