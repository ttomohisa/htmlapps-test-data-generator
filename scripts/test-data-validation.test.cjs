'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { createApp } = require('./test-data-harness.cjs');
const target = path.resolve(process.argv[2] || path.join(__dirname, '..', 'src/index.template.html'));
function setup(rows = 3) {
  const app = createApp(target, { language: 'en' });
  app.input(app.el('rowCount'), String(rows));
  app.input(app.el('seedInput'), 'safe-boundaries-42');
  return app;
}
function configure(app, kind, settings) {
  app.run('state.columns = [newColumn(' + JSON.stringify(kind) + ', "value")]; renderColumns()');
  for (const [key, value] of Object.entries(settings)) {
    const input = app.document.querySelector('.column-row').querySelector('[data-setting="' + key + '"]');
    assert.ok(input, kind + '.' + key + ' input exists');
    app.input(input, String(value));
  }
}
function generate(app) {
  app.el('generateButton').click();
  assert.equal(app.workers.at(-1)?.terminated, undefined, 'generation must start');
  app.complete();
  assert.ok(!app.el('saveOutputButton').disabled, 'generated data can be saved');
}
function expectRejected(app) {
  app.el('generateButton').click();
  assert.equal(app.workers.length, 0, 'unsafe settings must not launch a worker');
  assert.ok(app.el('errorBanner').classList.contains('show'), 'invalid settings show a visible error');
}
test('fractional interval with zero decimal places cannot silently generate outside the limits', () => {
  const app = setup();
  configure(app, 'decimal', { min: 0.1, max: 0.2, decimals: 0 });
  expectRejected(app);
});
test('exact 0.29 decimal endpoints remain valid despite floating point rounding', () => {
  const app = setup();
  configure(app, 'decimal', { min: 0.29, max: 0.29, decimals: 2 });
  generate(app);
  const values = JSON.parse(app.run('JSON.stringify(generatedPreviewRows)')).map(row => row.value);
  assert.deepEqual(values, [0.29, 0.29, 0.29]);
});
test('integer ranges reject unsafe representable values and excessively wide ranges', () => {
  for (const settings of [
    { min: 9007199254740992, max: 9007199254740992 },
    { min: -9007199254740991, max: 9007199254740991 }
  ]) { const app = setup(); configure(app, 'integer', settings); expectRejected(app); }
});
test('sequence rejects row-count overflow before the worker serializes Infinity or duplicates', () => {
  const app = setup(4);
  configure(app, 'sequence', { start: 9007199254740990, step: 1 });
  expectRejected(app);
  const safe = setup(4);
  configure(safe, 'sequence', { start: 9007199254740987, step: 1 });
  generate(safe);
  assert.deepEqual(JSON.parse(safe.run('JSON.stringify(generatedPreviewRows)')).map(row => row.value),
    [9007199254740987, 9007199254740988, 9007199254740989, 9007199254740990]);
});
test('date and datetime parsers reject normalized impossible dates and accept leap days', () => {
  const app = setup();
  assert.ok(Number.isNaN(app.run('parseDateOnly("2026-02-30")')));
  assert.ok(Number.isNaN(app.run('parseDateOnly("2025-02-29")')));
  assert.equal(app.run('formatDateValue(parseDateOnly("2024-02-29"), "dash")'), '2024-02-29');
  assert.ok(Number.isNaN(app.run('parseDateTime("2026-02-30T12:30")')));
  assert.ok(Number.isNaN(app.run('parseDateTime("2026-01-01T24:00")')));
  assert.ok(Number.isNaN(app.run('parseDateTime("2026-01-01T12:00+09:00")')));
  assert.equal(app.run('formatDateTimeValue(parseDateTime("2024-02-29T12:30"), "space")'), '2024-02-29 12:30:00');
});
test('settings file rejects invalid dates and unsupported select values', () => {
  const app = setup();
  const base = JSON.parse(app.run('JSON.stringify(schemaPayload())'));
  for (const column of [
    { name: 'bad_day', type: 'date', settings: { start: '2026-02-30', end: '2026-03-03', format: 'dash' } },
    { name: 'bad_time', type: 'datetime', settings: { start: '2026-02-30T10:00', end: '2026-03-01T11:00', format: 'iso' } },
    { name: 'bad_percent', type: 'percent', settings: { range: 'bogus', decimals: 2 } },
    { name: 'bad_format', type: 'boolean', settings: { format: 'bogus' } },
    { name: 'bad_kana', type: 'ja_kana', settings: { part: 'full', script: 'bogus' } },
    { name: 'bad_phone', type: 'phone', settings: { kind: 'bogus' } }
  ]) {
    const payload = { ...base, columns: [{ ...column, test: { missing: 0, boundary: 0, invalid: 0 } }] };
    const quoted = JSON.stringify(JSON.stringify(payload));
    assert.throws(() => app.run('parseSchemaFile(' + quoted + ')'), column.name);
  }
});
test('money steps include the 0.3 endpoint when stepping by 0.1', async () => {
  const app = setup(100);
  configure(app, 'money', { min: 0, max: 0.3, step: 0.1 });
  generate(app);
  app.el('exportFormat').value = 'json';
  app.el('saveOutputButton').click(); app.complete();
  const result = JSON.parse(await app.downloads.at(-1).blob.text());
  assert.equal(result.length, 100);
  assert.ok(result.some(row => row.value === 0.3), 'upper endpoint is not lost to floating-point quotient rounding');
  assert.ok(result.every(row => [0, 0.1, 0.2, 0.3].includes(row.value)));
});
test('money rejects a step count that cannot be represented safely', () => {
  const app = setup();
  configure(app, 'money', { min: 0, max: 10000000, step: 1e-12 });
  expectRejected(app);
});
test('export byte guard is inclusive and blocks oversized Worker output without downloading', () => {
  const app = setup();
  assert.equal(app.run('canAppendExportBytes(100, 28, 128)'), true);
  assert.equal(app.run('canAppendExportBytes(100, 29, 128)'), false);
  app.run('state.columns = [newColumn("fixed","payload")]; state.columns[0].settings.value = "x".repeat(500); renderColumns()');
  generate(app);
  app.el('saveOutputButton').click();
  const worker = app.workers.at(-1);
  worker.message.options.maxBytes = 128; // Only the test worker uses a smaller cap.
  app.complete(worker);
  assert.equal(worker.terminated, true);
  assert.equal(app.downloads.length, 0);
  assert.equal(app.el('exportStatus').textContent, app.run("translate('exportTooLarge')"));
  assert.equal(app.el('saveOutputButton').disabled, false, 'users may reduce their data and retry');
});
test('Add column chooses a noncolliding default name', () => {
  const app = setup();
  app.run('state.columns[0].name = "column_5"; renderColumns()');
  app.el('addColumnButton').click();
  assert.equal(app.run('state.columns.at(-1).name'), 'column_6');
});
console.log('Numeric, date, imported-setting and export guard tests: ' + target);
