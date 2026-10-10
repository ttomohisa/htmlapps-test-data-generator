'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { createApp } = require('./test-data-harness.cjs');
const filename = path.resolve(process.argv[2] || path.join(__dirname, '..', 'src/index.template.html'));
const tests = [];
const test = (name, body) => tests.push({ name, body });
const setup = (language = 'en') => { const app = createApp(filename, { language }); app.input(app.el('rowCount'), '3'); app.input(app.el('seedInput'), 'edit-save-42'); return app; };

for (const initialLanguage of ['ja', 'en']) test(`${initialLanguage}: header target-language labels, hints, privacy and version survive repeated toggles and reload`, () => {
  const app = createApp(filename, { language: initialLanguage });
  const config = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', 'app.config.json'), 'utf8'));
  const button = app.el('languageButton');
  for (let count = 0; count < 4; count++) {
    const language = count % 2 ? (initialLanguage === 'ja' ? 'en' : 'ja') : initialLanguage;
    const hint = language === 'ja' ? '英語に切り替え' : 'Switch to Japanese';
    assert.equal(button.textContent, language === 'ja' ? 'EN' : 'JA');
    assert.equal(button.getAttribute('aria-label'), hint);
    assert.equal(button.title, hint);
    assert.equal(app.document.documentElement.lang, language);
    assert.equal(app.document.querySelector('[data-i18n="localBadge"]').textContent, language === 'ja' ? '完全ローカル処理' : 'Fully local processing');
    assert.equal(app.el('versionBadge').textContent, `v${config.version}`);
    button.click();
  }
  button.click();
  const restored = createApp(filename, { language: initialLanguage, storage: [...app.storage] });
  assert.equal(restored.document.documentElement.lang, initialLanguage === 'ja' ? 'en' : 'ja');
  assert.equal(restored.el('languageButton').textContent, initialLanguage === 'ja' ? 'JA' : 'EN');
});
test('initial header matches Japanese markup and canonical version before runtime starts', () => {
  const { loadHtml } = require('./test-data-harness.cjs');
  const html = loadHtml(filename), config = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', 'app.config.json'), 'utf8'));
  assert.equal(html.match(/id="versionBadge">([^<]+)</)[1], `v${config.version}`);
  const button = html.match(/<button[^>]*id="languageButton"[^>]*>[^<]*<\/button>/)[0];
  assert.match(button, />EN<\/button>/);
  assert.match(button, /aria-label="英語に切り替え"/);
  assert.match(button, /title="英語に切り替え"/);
});

for (const language of ['ja', 'en']) test(`${language}: Help locks the page, resets reading position and restores state after every dismissal`, () => {
  const app = setup(language), help = app.el('helpDialog'), trigger = app.el('helpButton');
  const scroller = help.querySelector('.dialog-body');
  assert.equal(scroller.getAttribute('tabindex'), '0', 'help reading area is keyboard accessible');
  assert.equal(scroller.getAttribute('aria-labelledby'), 'helpDialogTitle');
  // A display:none dialog has no layout box: browsers ignore writes until showModal().
  let readingOffset = 300;
  Object.defineProperty(scroller, 'scrollTop', { get: () => readingOffset, set: value => { if (help.open) readingOffset = value; } });
  const before = app.run('JSON.stringify(state)');
  app.window.scrollX = 0; app.window.scrollY = 640;
  let restored;
  app.window.scrollTo = options => { restored = options; };
  app.document.body.style.position = 'relative';
  app.document.body.style.top = '3px';
  for (const method of ['button', 'escape', 'backdrop', 'native']) {
    readingOffset = 300; trigger.focus(); trigger.click();
    assert.equal(help.open, true);
    assert.equal(scroller.scrollTop, 0, 'every opening starts with the first instructions');
    assert.equal(app.document.body.style.position, 'fixed', 'mobile-safe background scroll lock');
    assert.equal(app.document.body.style.top, '-640px');
    assert.equal(app.document.activeElement, app.el('closeHelpButton'));
    // A delayed close event from a previous opening must not release the current lock.
    help.dispatch('close');
    assert.equal(app.document.body.style.position, 'fixed');
    help.dispatch('click', {clientX: 100, clientY: 100});
    assert.equal(help.open, true, 'clicking inside does not dismiss Help');
    if (method === 'button') app.el('closeHelpButton').click();
    if (method === 'escape') { const event = help.dispatch('cancel'); assert.equal(event.defaultPrevented, true); }
    if (method === 'backdrop') help.dispatch('click', {clientX: -1, clientY: -1});
    if (method === 'native') help.close();
    assert.equal(help.open, false);
    assert.equal(app.document.body.style.position, 'relative');
    assert.equal(app.document.body.style.top, '3px');
    assert.equal(restored.top, 640); assert.equal(restored.left, 0);
    assert.equal(restored.behavior, 'instant', 'restoration does not animate from the top');
    assert.equal(app.document.activeElement, trigger);
    assert.equal(app.run('JSON.stringify(state)'), before, 'Help does not alter the dataset settings');
  }
});

test('header and embedded favicon reproduce the canonical asset SVG', () => {
  const { loadHtml } = require('./test-data-harness.cjs');
  const html = loadHtml(filename);
  const asset = require('node:fs').readFileSync(path.join(__dirname, '..', 'assets/favicon.svg'), 'utf8');
  const normalize = svg => svg.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  const header = html.match(/<div class="brand-mark"[^>]*>\s*(<svg[\s\S]*?<\/svg>)/)[1];
  const favicon = decodeURIComponent(html.match(/<link rel="icon" href="data:image\/svg\+xml,([^"]+)"/)[1]);
  assert.equal(normalize(header), normalize(asset));
  assert.equal(normalize(favicon), normalize(asset));
});

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

// Removing the literal-key worker maps or the own-metadata check must fail these cases.
for (const mode of ['normal', 'missing', 'boundary', 'invalid']) test(`literal prototype names survive structured clone, ${mode} badges, and every format`, async () => {
  const app = setup();
  app.run(`state.columns = ['__proto__','constructor','toString','hasOwnProperty','ordinary'].map(name => newColumn('integer', name)); state.columns.forEach(c => c.test = { missing: 0, boundary: 0, invalid: 0, ${mode === 'normal' ? 'missing' : mode}: ${mode === 'normal' ? 0 : 100} }); renderColumns()`);
  app.el('generateButton').click(); app.complete();
  const expected = JSON.parse(app.run('JSON.stringify(generatedPreviewRows)'));
  assert.deepEqual(Object.keys(expected[0]), ['__proto__','constructor','toString','hasOwnProperty','ordinary']);
  assert.equal(app.run('Object.prototype.hasOwnProperty.call(generatedPreviewRows[0], "__proto__")'), true);
  const cells = app.el('previewBodyRows').querySelectorAll('td');
  assert.equal(cells.length, 15);
  assert.equal(app.el('previewBodyRows').querySelectorAll('.value-status').length, mode === 'normal' ? 0 : 15);
  for (let i = 0; i < cells.length; i++) assert.equal(cells[i].textContent, mode === 'normal' ? String(expected[Math.floor(i/5)][Object.keys(expected[0])[i%5]]) : app.run(`translate('status${mode[0].toUpperCase()+mode.slice(1)}')`) + (mode === 'missing' ? '(empty)' : String(expected[Math.floor(i/5)][Object.keys(expected[0])[i%5]])));
  for (const format of ['csv','tsv','json','jsonl']) {
    app.el('exportFormat').value = format; app.el('saveOutputButton').click(); app.complete(); const text = await app.downloads.at(-1).blob.text();
    if (format === 'json') assert.deepEqual(JSON.parse(text), expected);
    else if (format === 'jsonl') assert.deepEqual(text.split('\n').map(JSON.parse), expected);
    else assert.deepEqual(parseDelimited(text, format === 'csv' ? ',' : '\t'), [Object.keys(expected[0]), ...expected.map(row => Object.keys(row).map(name => String(row[name] ?? '')))]);
  }
});
test('ordinary strict-mix seeded exports keep upstream bytes for all 23 types and four formats', async () => {
  const app = setup(); app.input(app.el('rowCount'), '21'); app.input(app.el('seedInput'), 'preview-copy-42');
  app.run('state.columns = supportedTypes.map(type => newColumn(type, type)); state.columns.forEach(c => c.test = normalizeTestSettings(c.type, testPresets.strict)); renderColumns()');
  app.el('generateButton').click(); app.complete();
  const hashes = { csv: '45f79f28bdae864e1c72fd1f5e347b680e3d850105ce3be82a7a5d6da58eaa60', tsv: 'ac23be84c5262408ad5e74086df1f787b60b6080bcebfd6d223e19a6096998e5', json: '01aaf2d4dca4b22baf91853eac3043956fc1e67c0c99c268393419d2669ec2d4', jsonl: '3f1f54c29bf0ae4cf909664cf8fbe4da648d9a47a3f8ec8d257cb07200801f49' };
  for (const format of Object.keys(hashes)) { app.el('exportFormat').value = format; app.el('saveOutputButton').click(); app.complete(); assert.equal(require('node:crypto').createHash('sha256').update(Buffer.from(await app.downloads.at(-1).blob.arrayBuffer())).digest('hex'), hashes[format]); }
});
for (const language of ['en','ja']) for (const count of [1, 20, 21]) test(`${language}: explicit copy includes first ${Math.min(count,20)} of ${count} rows as raw JSON`, async () => {
  const app = setup(language); app.input(app.el('rowCount'), String(count));
  app.run(`state.columns = [newColumn('sequence','number'),newColumn('fixed','__proto__'),newColumn('fixed','missing')]; state.columns[1].settings.value = 'a,b"c\\t日本語\\n<script>synthetic</script>'; state.columns[2].test.missing = 100; renderColumns()`);
  assert.ok(app.el('copyPreviewButton'), 'copy action must exist'); assert.equal(app.el('copyPreviewButton').disabled, true);
  app.el('generateButton').click(); assert.equal(app.el('copyPreviewButton').disabled, true); app.complete();
  assert.equal(app.globals.clipboard, undefined, 'generation must not touch clipboard');
  assert.equal(app.el('copyPreviewButton').disabled, false);
  assert.equal(app.el('copyPreviewScope').textContent, language === 'ja' ? `全${count}件のうち先頭${Math.min(count,20)}件のみ（JSON）` : `First ${Math.min(count,20)} of ${count} rows only (JSON)`);
  const expected = JSON.parse(app.run('JSON.stringify(generatedPreviewRows)')); const workers = app.workers.length, storage = [...app.storage];
  app.el('copyPreviewButton').click(); await app.settle();
  assert.deepEqual(JSON.parse(app.globals.clipboard), expected); assert.equal(typeof expected[0].number, 'number'); assert.equal(expected[0].missing, null); assert.equal(Object.hasOwn(expected[0], '__proto__'), true);
  assert.equal(app.workers.length, workers); assert.deepEqual([...app.storage], storage); assert.equal(app.downloads.length, 0);
  assert.match(app.el('copyPreviewStatus').textContent, language === 'ja' ? /コピーしました/ : /Copied/);
});
for (const method of ['unavailable','denied','throw']) test(`${method} clipboard opens complete selectable JSON without legacy copy and restores focus`, async () => {
  const app = setup(); app.el('generateButton').click(); app.complete();
  app.document.execCommand = () => { throw Error('legacy copy must not run'); };
  if (method === 'unavailable') delete app.globals.navigator.clipboard;
  else app.globals.navigator.clipboard.writeText = method === 'throw' ? () => { throw Error('blocked'); } : async () => { throw Error('denied'); };
  const button = app.el('copyPreviewButton'); assert.ok(button, 'copy action must exist'); button.focus(); button.click(); await app.settle();
  const dialog = app.el('copyPreviewDialog'), input = app.el('copyPreviewText');
  assert.equal(dialog.open, true); assert.equal(input.hasAttribute('readonly'), true); assert.deepEqual(JSON.parse(input.value), JSON.parse(app.run('JSON.stringify(generatedPreviewRows)')));
  assert.equal(app.document.activeElement, input); assert.equal(input.selectionEnd, input.value.length);
  app.el('closeCopyPreviewButton').click(); assert.equal(dialog.open, false); assert.equal(input.value, ''); assert.equal(app.document.activeElement, button);
  button.click(); await app.settle(); dialog.dispatch('cancel'); assert.equal(dialog.open, false); assert.equal(app.document.activeElement, button);
  button.click(); await app.settle(); dialog.dispatch('click', {clientX:-1,clientY:-1}); assert.equal(dialog.open, false); assert.equal(app.document.activeElement, button);
});
for (const outcome of ['resolve','reject']) for (const action of ['edit','regenerate','export','pagehide']) test(`pending clipboard ${outcome} after ${action} cannot change current UI`, async () => {
  const app = setup(); app.el('generateButton').click(); app.complete(); let finish, calls = 0;
  app.globals.navigator.clipboard.writeText = () => { calls++; return new Promise((resolve,reject) => { finish = outcome === 'resolve' ? resolve : () => reject(Error('denied')); }); };
  const button = app.el('copyPreviewButton'); assert.ok(button, 'copy action must exist'); button.click(); button.click(); assert.equal(calls,1);
  if (action === 'edit') app.input(app.el('seedInput'),'new');
  if (action === 'regenerate') app.el('generateButton').click();
  if (action === 'export') app.el('saveOutputButton').click();
  if (action === 'pagehide') app.window.dispatch('pagehide');
  const status = app.el('copyPreviewStatus').textContent; finish(); await app.settle();
  assert.equal(Boolean(app.el('copyPreviewDialog').open),false); assert.equal(app.el('copyPreviewText').value,''); assert.equal(app.el('copyPreviewStatus').textContent,status);
});
test('manual JSON is cleared on settings replacement and never restores focus into stale preview', async () => {
  const app = setup(); app.el('generateButton').click(); app.complete(); delete app.globals.navigator.clipboard;
  assert.ok(app.el('copyPreviewButton'), 'copy action must exist'); app.el('copyPreviewButton').click(); await app.settle();
  app.el('seedInput').focus(); app.input(app.el('seedInput'),'changed');
  assert.equal(app.el('copyPreviewDialog').open,false); assert.equal(app.el('copyPreviewText').value,''); assert.equal(app.el('copyPreviewButton').disabled,true); assert.equal(app.document.activeElement,app.el('seedInput'));
});
test('copy budget is inclusive 1 MiB UTF-8 and refuses larger JSON without truncation', async () => {
  const app = setup(); app.el('generateButton').click(); app.complete(); assert.ok(app.el('copyPreviewButton'), 'copy action must exist');
  let calls=0; app.globals.navigator.clipboard.writeText=async text=>{calls++;app.globals.clipboard=text;};
  // The string is synthetic; byte accounting includes JSON punctuation and indentation.
  const empty = JSON.stringify([{value:''}],null,2), bytes = 1024*1024, capacity=bytes-Buffer.byteLength(empty);
  for (const extra of [0,1]) { const value='界'.repeat(Math.floor(capacity/3))+'a'.repeat(capacity%3+extra); app.run(`generatedPreviewRows = JSON.parse(${JSON.stringify(JSON.stringify([{value}]))})`); app.el('copyPreviewButton').click(); await app.settle(); if(!extra) assert.equal(Buffer.byteLength(app.globals.clipboard),bytes); else {assert.equal(calls,1);assert.match(app.el('copyPreviewStatus').textContent,/1 MiB/);assert.equal(Boolean(app.el('copyPreviewDialog').open),false);} }
});


test('a delayed close event from the previous manual dialog cannot dismiss a reopened dialog', async () => {
  const app = setup(); app.el('generateButton').click(); app.complete(); delete app.globals.navigator.clipboard;
  app.el('copyPreviewButton').click(); await app.settle(); app.el('closeCopyPreviewButton').click();
  app.el('copyPreviewButton').click(); await app.settle(); const text = app.el('copyPreviewText').value;
  app.el('copyPreviewDialog').dispatch('close');
  assert.equal(app.el('copyPreviewDialog').open,true); assert.equal(app.el('copyPreviewText').value,text);
});
test('late clipboard denial does not cover another dialog or steal focus', async () => {
  const app = setup(); app.el('generateButton').click(); app.complete(); let reject;
  app.globals.navigator.clipboard.writeText = () => new Promise((resolve, deny) => reject=deny);
  app.el('copyPreviewButton').click(); app.el('helpButton').click(); app.el('closeHelpButton').focus(); reject(Error('denied')); await app.settle();
  assert.equal(Boolean(app.el('copyPreviewDialog').open),false); assert.equal(app.el('helpDialog').open,true); assert.equal(app.document.activeElement,app.el('closeHelpButton'));
  assert.match(app.el('copyPreviewStatus').textContent,/Close the open dialog/);
});

(async () => { let failed = 0; console.log('Behavior target: ' + filename); for (const item of tests) { try { await item.body(); console.log('PASS ' + item.name); } catch (error) { failed++; console.error('FAIL ' + item.name + '\n' + (error.stack || error)); } } console.log(`${tests.length - failed}/${tests.length} behavior tests passed`); process.exitCode = failed ? 1 : 0; })();
