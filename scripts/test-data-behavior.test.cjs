'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { createApp } = require('./test-data-harness.cjs');
const filename = path.resolve(process.argv[2] || path.join(__dirname, '..', 'src/index.template.html'));
const tests = [];
const test = (name, body) => tests.push({ name, body });
const setup = (language = 'en') => { const app = createApp(filename, { language }); app.input(app.el('rowCount'), '3'); app.input(app.el('seedInput'), 'edit-save-42'); return app; };
const rows = app => app.document.querySelectorAll('.column-row');
const control = (app, index, selector) => rows(app)[index].querySelector(selector);
const type = (app, index, value) => { const input = control(app, index, '[data-role="type"]'); input.value = value; input.focus(); input.dispatch('change'); };
const numberFields = { sequence: ['start', 'step'], integer: ['min', 'max'], decimal: ['min', 'max', 'decimals'], string: ['length'], money: ['min', 'max', 'step'], percent: ['decimals'] };
const allowZero = (type, key) => !(type === 'string' || type === 'money' && key === 'step');
for (const [kind, fields] of Object.entries(numberFields)) for (const field of fields) test(`${kind}.${field}: blank rejected, explicit zero respects range, corrected value recovers`, () => {
  const app = setup(); type(app, 0, kind);
  const target = control(app, 0, `[data-setting="${field}"]`), original = target.value;
  app.input(target, ''); app.el('generateButton').click();
  assert.equal(app.workers.length, 0, 'blank numeric setting must not start generation');
  assert.ok(app.el('errorBanner').classList.contains('show'));
  assert.equal(control(app, 0, `[data-setting="${field}"]`).value, '');
  app.input(control(app, 0, `[data-setting="${field}"]`), '0'); app.el('generateButton').click();
  assert.equal(app.workers.length, allowZero(kind, field) ? 1 : 0);
  if (app.workers.length) app.complete();
  app.input(control(app, 0, `[data-setting="${field}"]`), original); app.el('generateButton').click(); app.complete();
  assert.equal(app.el('saveOutputButton').disabled, false);
});
for (const field of ['missing', 'boundary', 'invalid']) test(`test rate ${field} blank rejected and zero recovers after rerender`, () => {
  const app = setup(); const target = control(app, 0, `[data-test-setting="${field}"]`);
  app.input(target, ''); app.el('generateButton').click(); assert.equal(app.workers.length, 0);
  assert.equal(control(app, 0, `[data-test-setting="${field}"]`).value, '');
  app.input(control(app, 0, `[data-test-setting="${field}"]`), '0'); app.el('generateButton').click(); app.complete(); assert.equal(app.el('saveOutputButton').disabled, false);
});
for (const language of ['en', 'ja']) {
  test(`${language}: column name and type have explicit localized accessible names`, () => {
    const app = setup(language); for (const row of rows(app)) {
      assert.equal(row.querySelector('[data-role="name"]').getAttribute('aria-label'), language === 'ja' ? '列名' : 'Column name');
      assert.equal(row.querySelector('[data-role="type"]').getAttribute('aria-label'), language === 'ja' ? 'データの種類' : 'Data type');
    }
  });
  test(`${language}: move keeps stable column focus and uses opposite arrow at edge`, () => {
    const app = setup(language), id = rows(app)[0].dataset.columnId;
    for (let index = 0; index < 3; index++) { const button = control(app, index, '[data-action="down"]'); button.focus(); button.click(); assert.equal(app.document.activeElement.closest('.column-row')?.dataset.columnId, id); assert.equal(app.document.activeElement.dataset.action, index === 2 ? 'up' : 'down'); }
    app.document.activeElement.click(); assert.equal(app.document.activeElement.closest('.column-row')?.dataset.columnId, id);
  });
  test(`${language}: repeated type selection and text selection survive rerender`, () => {
    const app = setup(language); for (const kind of ['integer', 'decimal', 'boolean']) { type(app, 0, kind); assert.ok(app.document.activeElement === control(app, 0, '[data-role="type"]'), "expected focused control"); }
    const name = control(app, 0, '[data-role="name"]'); name.focus(); name.setSelectionRange(0, 1, 'forward'); app.run('renderColumns()');
    assert.ok(app.document.activeElement === control(app, 0, '[data-role="name"]'), "expected focused control"); assert.equal(app.document.activeElement.selectionEnd, 1);
  });
  test(`${language}: deletion focuses next/previous column; Undo focuses restored name; final deletion focuses Add`, () => {
    const app = setup(language); const restored = rows(app)[1].dataset.columnId, next = rows(app)[2].dataset.columnId;
    const remove = control(app, 1, '[data-action="delete"]'); remove.focus(); remove.click();
    assert.equal(app.document.activeElement.closest('.column-row')?.dataset.columnId, next);
    assert.equal(app.document.activeElement.dataset.role, 'name');
    app.el('appToastAction').click(); assert.equal(app.document.activeElement.closest('.column-row')?.dataset.columnId, restored); assert.equal(app.document.activeElement.dataset.role, 'name');
    while (rows(app).length) { const button = control(app, rows(app).length - 1, '[data-action="delete"]'); button.focus(); button.click(); }
    assert.ok(app.document.activeElement === app.el('emptyAddColumnButton'), "expected focused control");
  });
}
for (const [entered, base] of [['foo.csv', 'foo'], ['foo.CSV.jsonl', 'foo'], ['report.v2', 'report.v2'], ['', 'test-data'], [' ... ', 'test-data'], ['a/b\\c:*?"<>|\u0001.csv', 'a-b-c--------'], [' .csv ', 'test-data']]) test(`filename ${JSON.stringify(entered)} produces one current extension`, async () => {
  const app = setup(); app.el('generateButton').click(); app.complete();
  for (const format of ['csv', 'tsv', 'json', 'jsonl']) {
    app.input(app.el('outputNameInput'), entered); app.el('exportFormat').value = format; app.el('exportFormat').dispatch('change');
    app.el('saveOutputButton').click(); app.complete();
    assert.equal(app.downloads.at(-1)?.name, base + '.' + format);
    assert.equal(app.el('outputNameInput').value, base);
  }
});
for (const phase of ['generation', 'export']) for (const edit of ['name', 'setting', 'seed', 'randomSeed', 'rowCount', 'delete', 'type']) test(`${edit} during ${phase} rejects stale worker completion and requires regeneration`, () => {
  const app = setup(); app.el('generateButton').click(); if (phase === 'export') { app.complete(); app.el('saveOutputButton').click(); }
  const worker = app.workers.at(-1);
  if (edit === 'name') app.input(control(app, 0, '[data-role="name"]'), 'new_id');
  if (edit === 'setting') app.input(control(app, 0, '[data-setting="start"]'), '5');
  if (edit === 'seed') app.input(app.el('seedInput'), 'new-seed');
  if (edit === 'randomSeed') app.el('randomSeedButton').click();
  if (edit === 'rowCount') app.input(app.el('rowCount'), '5');
  if (edit === 'delete') control(app, 0, '[data-action="delete"]').click();
  if (edit === 'type') type(app, 0, 'integer');
  assert.equal(worker.terminated, true); app.complete(worker); assert.equal(app.el('saveOutputButton').disabled, true); assert.equal(app.downloads.length, 0);
  assert.equal(app.el('generateStatus').textContent, app.run("translate('" + (['seed', 'randomSeed'].includes(edit) ? 'seedChanged' : 'settingsChanged') + "')"));
  app.el('generateButton').click(); app.complete(); assert.equal(app.el('saveOutputButton').disabled, false);
});
for (const phase of ['generation', 'export']) for (const action of ['reset', 'schemaLoad', 'template']) test(`${action} during ${phase} cancels old work before replacing results`, async () => {
  const app = setup(); app.el('generateButton').click(); if (phase === 'export') { app.complete(); app.el('saveOutputButton').click(); }
  const worker = app.workers.at(-1);
  if (action === 'reset') app.el('resetButton').click();
  if (action === 'schemaLoad') { app.run("globalThis.pendingLoad = loadSchemaFile({ size: 300, text: async () => JSON.stringify(schemaPayload()) })"); await app.settle(); }
  if (action === 'template') { app.el('templateSelect').value = 'product'; app.el('applyTemplateButton').disabled = false; app.el('applyTemplateButton').click(); }
  app.el('appConfirmOk').click(); await app.settle();
  assert.equal(worker.terminated, true); app.complete(worker); assert.equal(app.el('saveOutputButton').disabled, true); assert.equal(app.downloads.length, 0);
});
function parseDelimited(text, separator) {
  const result = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; } else if (!quoted && c === separator) { row.push(field); field = ''; } else if (!quoted && c === '\n') { row.push(field.replace(/\r$/, '')); result.push(row); row = []; field = ''; } else field += c; }
  if (field || row.length) result.push([...row, field]); return result;
}
test('23 generators retain seeded four-format round trips with commas, quotes, TAB, BOM and line endings', async () => {
  const app = setup(); app.run("state.columns = supportedTypes.map(type => newColumn(type, type)); state.columns.push(newColumn('fixed', 'punctuation')); state.columns.at(-1).settings.value = 'a,b\\\"c\\td\\nline'; renderColumns()");
  app.el('generateButton').click(); app.complete(); assert.equal(app.run('supportedTypes.length'), 23);
  const expected = JSON.parse(app.run('JSON.stringify(generatedPreviewRows)'));
  for (const format of ['csv', 'tsv', 'json', 'jsonl']) for (const line of ['lf', 'crlf']) for (const encoding of ['utf8', 'utf8bom']) {
    app.el('exportFormat').value = format; app.el('newlineSelect').value = line; app.el('encodingSelect').value = encoding;
    app.el('saveOutputButton').click(); app.complete(); const blob = app.downloads.at(-1).blob, bytes = new Uint8Array(await blob.arrayBuffer()), text = await blob.text();
    const hasBom = ['csv', 'tsv'].includes(format) && encoding === 'utf8bom'; assert.equal(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, hasBom);
    if (format === 'json') assert.deepEqual(JSON.parse(text), expected);
    else if (format === 'jsonl') assert.deepEqual(text.trim().split(/\r?\n/).map(JSON.parse), expected);
    else { const parsed = parseDelimited(text, format === 'csv' ? ',' : '\t'); const names = Object.keys(expected[0]); assert.deepEqual(parsed[0], names); assert.deepEqual(parsed.slice(1), expected.map(row => names.map(name => String(row[name] ?? '')))); }
    assert.ok(text.includes(line === 'crlf' ? '\r\n' : '\n'));
    app.el('saveOutputButton').click(); app.complete(); assert.deepEqual(new Uint8Array(await app.downloads.at(-1).blob.arrayBuffer()), bytes);
  }
});
(async () => { let failed = 0; console.log('Behavior target: ' + filename); for (const item of tests) { try { await item.body(); console.log('PASS ' + item.name); } catch (error) { failed++; console.error('FAIL ' + item.name + '\n' + (error.stack || error)); } } console.log(`${tests.length - failed}/${tests.length} behavior tests passed`); process.exitCode = failed ? 1 : 0; })();
