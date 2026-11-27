'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('./test-data-harness.cjs');

const filename = path.resolve(process.argv[2] || path.join(__dirname, '..', 'src/index.template.html'));

function generate(configure) {
  const app = createApp(filename, { language: 'en' });
  app.input(app.el('rowCount'), '100');
  app.input(app.el('seedInput'), 'examples');
  app.run(configure + '; renderColumns()');
  app.el('generateButton').click();
  const result = app.complete().at(-1);
  return { app, result };
}

function category(app, mode) {
  const button = app.el('testSummary').querySelector(`button[data-example-mode="${mode}"]`);
  assert.ok(button, `${mode} total opens its examples`);
  return button;
}

const rareMix = "state.columns = [newColumn('integer', '__proto__')]; state.columns[0].test = { missing: 1, boundary: 1, invalid: 1 }";

test('rare cells after the first 20 rows are inspectable, while copy and full JSON retain their scopes', async () => {
  const { app, result } = generate(rareMix);
  assert.deepEqual(result.examples, {
    missing: [{ row: 73, column: '__proto__', value: null }],
    boundary: [{ row: 21, column: '__proto__', value: 1 }],
    invalid: [{ row: 17, column: '__proto__', value: 101 }]
  });
  for (const [mode, row, value] of [['missing', '73', 'null'], ['boundary', '21', '1'], ['invalid', '17', '101']]) {
    const button = category(app, mode);
    assert.match(button.textContent, /1/);
    button.click();
    const panel = app.el(button.getAttribute('aria-controls'));
    assert.equal(panel.hidden, false);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(panel.querySelectorAll('td').map(cell => cell.textContent), [row, '__proto__', value]);
  }
  assert.equal(app.workers.length, 1);
  assert.equal(app.el('previewBodyRows').querySelectorAll('tr').length, 20);
  app.el('copyPreviewButton').click();
  await app.settle();
  const preview = JSON.parse(app.globals.clipboard);
  assert.equal(preview.length, 20);
  app.el('exportFormat').value = 'json';
  app.el('saveOutputButton').click();
  app.complete();
  const rows = JSON.parse(await app.downloads.at(-1).blob.text());
  assert.equal(rows.length, 100);
  assert.deepEqual(rows.slice(0, 20), preview);
  for (const [example] of Object.values(result.examples)) {
    assert.deepEqual(Object.keys(rows[example.row - 1]), ['__proto__']);
    assert.equal(rows[example.row - 1][example.column], example.value);
  }
});

test('examples are bounded per category, including multiple special cells within the same row', () => {
  const { app, result } = generate(`
    state.columns = ['missing', 'boundary', 'invalid'].flatMap(mode =>
      ['a','b'].map(suffix => {
        const c = newColumn('integer', mode + suffix);
        c.test[mode] = 100;
        return c;
      })
    )`);
  assert.ok(result.examples, 'preview worker returns examples');
  for (const mode of ['missing', 'boundary', 'invalid']) {
    assert.equal(result.counts[mode], 200);
    assert.deepEqual(result.examples[mode].map(e => [e.row, e.column]), [
      [1, mode + 'a'], [1, mode + 'b'], [2, mode + 'a'], [2, mode + 'b'], [3, mode + 'a']
    ]);
    const button = category(app, mode);
    assert.match(button.textContent, /200/);
    button.click();
    assert.equal(app.el(button.getAttribute('aria-controls')).querySelectorAll('td').length, 15);
  }
});

test('category selection relocalizes, collapses, and clears on edits before an old result can reappear', () => {
  const { app } = generate(`state.columns = [newColumn('fixed', '<sample>')]; state.columns[0].settings.value = '<b>value</b>'; state.columns[0].test.invalid = 100`);
  const invalid = category(app, 'invalid');
  const panel = app.el(invalid.getAttribute('aria-controls'));
  assert.equal(category(app, 'missing').disabled, true);
  assert.equal(panel.hidden, true);
  invalid.click();
  assert.equal(panel.querySelectorAll('td')[2].textContent, '"<b>value</b>__invalid__"');
  assert.equal(panel.querySelector('b'), null);
  assert.match(panel.textContent, /Row/);
  app.el('languageButton').click();
  assert.match(category(app, 'invalid').textContent, /異常/);
  assert.match(panel.textContent, /行/);
  assert.equal(category(app, 'invalid').getAttribute('aria-expanded'), 'true');
  category(app, 'invalid').click();
  assert.equal(panel.hidden, true);
  category(app, 'invalid').click();
  app.el('generateButton').click();
  const staleWorker = app.workers.at(-1);
  app.input(app.el('seedInput'), 'new');
  app.complete(staleWorker);
  assert.equal(app.el('previewResult').hidden, true);
  assert.equal(panel.hidden, true);
  assert.equal(panel.querySelectorAll('td').length, 0);
  app.run('state.columns[0].test.invalid = 0');
  app.el('generateButton').click();
  app.complete();
  assert.equal(app.el('testSummary').hidden, true);
  assert.equal(panel.hidden, true);
});
