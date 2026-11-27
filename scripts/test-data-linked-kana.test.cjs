'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('./test-data-harness.cjs');
const filename = path.resolve(process.argv[2] || path.join(__dirname, '..', 'src/index.template.html'));

function column(type, name, settings = {}, test = {}) { return { type, name, settings, test }; }
function schema(columns, rows = 31, seed = 'linked-name-seed') {
  return { version: 1, app: 'test-data-generator', generator: 'xmur3-mulberry32-v1', rows, seed, columns };
}
function inputSchema(columns, rows, seed, language = 'en') {
  const app = createApp(filename, { language });
  const data = schema(columns, rows, seed);
  app.run(`state = parseSchemaFile(${JSON.stringify(JSON.stringify(data))}); renderColumns();`);
  app.input(app.el('rowCount'), String(data.rows));
  app.input(app.el('seedInput'), data.seed);
  return app;
}
function generate(app) {
  app.el('generateButton').click();
  const preview = app.complete().find(message => message.task === 'preview' && message.type === 'complete');
  assert.ok(preview, 'preview completed');
  return preview;
}
async function save(app, format) {
  app.el('exportFormat').value = format;
  app.el('exportFormat').dispatch('change');
  app.el('encodingSelect').value = 'utf8';
  app.el('saveOutputButton').click();
  const messages = app.complete();
  assert.ok(messages.some(message => message.type === 'complete'), 'export completed');
  return { blob: app.downloads.at(-1).blob, messages };
}
function row(app, index) { return app.el('columnList').querySelectorAll('.column-row')[index]; }
function sourceSelect(app, index) { return row(app, index).querySelector('[data-setting="sourceColumn"]'); }
function portable(app) { return JSON.parse(app.run('JSON.stringify(schemaPayload())')); }

test('linked readings match their source in either column order and in every export format', async () => {
  const app = inputSchema([
    column('ja_kana', 'reading', { sourceColumn: 2, script: 'katakana' }),
    column('ja_name', 'other'),
    column('ja_name', '__proto__'),
    column('ja_kana', 'first', { sourceColumn: 2, part: 'given' }),
    column('ja_kana', 'otherLast', { sourceColumn: 1, part: 'surname', script: 'katakana' })
  ]);
  const preview = generate(app);
  const dictionary = new Map(app.run('japaneseSurnames.concat(japaneseGivenNames)'));
  const hira = text => text.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 96));
  const records = JSON.parse(await (await save(app, 'json')).blob.text());
  assert.deepEqual(records.slice(0, 20), preview.previewRows);
  for (const record of records) {
    const [last, first] = record.__proto__.split(' ').map(part => dictionary.get(part));
    assert.equal(record.reading, last + ' ' + first);
    assert.equal(record.first, hira(first));
    assert.equal(record.otherLast, dictionary.get(record.other.split(' ')[0]));
  }
  assert.ok(records.some(record => record.other !== record.__proto__), 'separate source columns represent separate people');
  const jsonl = await (await save(app, 'jsonl')).blob.text();
  assert.deepEqual(jsonl.trim().split(/\r?\n/).map(line => JSON.parse(line)), records);
  const names = Object.keys(records[0]);
  for (const [format, separator] of [['csv', ','], ['tsv', '\t']]) {
    const output = await (await save(app, format)).blob.text();
    assert.deepEqual(output.trimEnd().split(/\r?\n/), [names.join(separator), ...records.map(record => names.map(name => record[name]).join(separator))]);
  }
  const { messages } = await save(app, 'parquet');
  const pages = messages.filter(message => message.type === 'chunk').slice(1, 1 + names.length);
  for (const [index, name] of names.entries()) {
    // In a PLAIN UTF-8 data page each non-null value is a 32-bit LE length followed by its UTF-8 bytes.
    const payload = Buffer.concat(records.flatMap(record => {
      const text = Buffer.from(record[name]), length = Buffer.alloc(4);
      length.writeUInt32LE(text.length);
      return [length, text];
    }));
    assert.deepEqual(Buffer.from(pages[index].bytes).subarray(-payload.length), payload);
  }
});

test('missing and invalid modes override their own cell while other readings keep their shared person', () => {
  const app = inputSchema([
    column('ja_name', 'name', {}, { missing: 50, invalid: 50 }),
    column('ja_kana', 'a', { sourceColumn: 0 }),
    column('ja_kana', 'b', { sourceColumn: 0 }),
    column('ja_kana', 'bad', { sourceColumn: 0 }, { invalid: 100 })
  ], 20);
  const { previewRows, previewMeta, counts } = generate(app);
  assert.deepEqual(counts, { missing: 10, boundary: 0, invalid: 30 });
  previewRows.forEach((record, i) => {
    assert.equal(record.a, record.b);
    assert.match(record.a, /^[ぁ-ゖ]+ [ぁ-ゖ]+$/u);
    assert.ok(['missing', 'invalid'].includes(previewMeta[i].name));
    assert.equal(record.name === null, previewMeta[i].name === 'missing');
    assert.equal(previewMeta[i].bad, 'invalid');
    assert.notEqual(record.bad, record.a);
  });
});

test('independent version-1 schemas retain their original seeded stream', () => {
  const app = inputSchema([column('ja_name', 'name'), column('ja_kana', 'kana'), column('integer', 'n')], 3, 'legacy-names');
  assert.deepEqual(generate(app).previewRows, [
    { name: '竹内 花子', kana: 'きむら いちろう', n: 54 },
    { name: '佐藤 結衣', kana: 'おかだ りく', n: 62 },
    { name: '遠藤 美咲', kana: 'なかじま めぐみ', n: 80 }
  ]);
  assert.ok(!Object.hasOwn(portable(app).columns[1].settings, 'sourceColumn'));
});

for (const language of ['en', 'ja']) test(language + ' editor maintains selected name across edits, storage, and schema round trips', () => {
  const app = inputSchema([column('ja_kana', 'kana'), column('ja_name', '名<&"'), column('fixed', 'status')], 4, 'portable', language);
  const select = sourceSelect(app, 0);
  assert.ok(select, 'kana source selector exists');
  assert.equal(select.value, '');
  assert.deepEqual(select.querySelectorAll('option').map(option => option.textContent), [language === 'ja' ? '独立して生成' : 'Generate independently', '名<&"']);
  const sourceId = row(app, 1).dataset.columnId;
  app.input(select, sourceId);
  app.input(row(app, 1).querySelector('[data-role="name"]'), ' renamed ');
  assert.equal(sourceSelect(app, 0).querySelectorAll('option')[1].textContent, 'renamed');
  row(app, 1).querySelector('[data-action="up"]').click();
  assert.equal(sourceSelect(app, 1).value, sourceId);
  row(app, 1).querySelector('[data-action="duplicate"]').click();
  assert.equal(sourceSelect(app, 2).value, sourceId);
  assert.deepEqual(portable(app).columns.slice(1, 3).map(c => c.settings.sourceColumn), [0, 0]);
  const restored = createApp(filename, { storage: [...app.storage] });
  assert.equal(sourceSelect(restored, 1).value, row(restored, 0).dataset.columnId);
  const imported = inputSchema(portable(app).columns);
  assert.equal(sourceSelect(imported, 2).value, row(imported, 0).dataset.columnId);
  row(app, 0).querySelector('[data-action="delete"]').click();
  assert.equal(sourceSelect(app, 0).value, '');
  assert.equal(portable(app).columns[0].settings.sourceColumn, undefined);
  app.el('appToastAction').click();
  assert.equal(sourceSelect(app, 1).value, sourceId);
  app.input(row(app, 0).querySelector('[data-role="type"]'), 'fixed');
  assert.equal(sourceSelect(app, 1).value, '');
  app.input(row(app, 0).querySelector('[data-role="type"]'), 'ja_name');
  assert.equal(sourceSelect(app, 1).value, '');
});

test('invalid imported relationships are rejected before replacing settings', () => {
  const app = createApp(filename);
  for (const [type, index] of [['ja_kana', 2], ['ja_kana', 1], ['ja_kana', -1], ['ja_kana', '0'], ['ja_kana', null], ['ja_name', 0]]) {
    const data = schema([column('ja_name', 'source'), column(type, 'other', { sourceColumn: index })]);
    assert.throws(() => app.run(`parseSchemaFile(${JSON.stringify(JSON.stringify(data))})`));
  }
});

test('editing two equal names cannot redirect a saved link, and Undo respects a newer selection', () => {
  const app = inputSchema([column('ja_name', 'first'), column('ja_name', 'second'), column('ja_kana', 'reading', { sourceColumn: 1 })]);
  app.input(row(app, 1).querySelector('[data-role="name"]'), 'first');
  const restored = createApp(filename, { storage: [...app.storage] });
  assert.equal(sourceSelect(restored, 2).value, row(restored, 1).dataset.columnId);
  app.input(row(app, 1).querySelector('[data-role="name"]'), 'second');
  const first = row(app, 0).dataset.columnId;
  row(app, 1).querySelector('[data-action="delete"]').click();
  app.input(sourceSelect(app, 1), first);
  app.el('appToastAction').click();
  assert.equal(sourceSelect(app, 2).value, first);
  assert.equal(portable(app).columns[2].settings.sourceColumn, 0);
});
