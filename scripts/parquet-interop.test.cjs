'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { createApp } = require('./test-data-harness.cjs');

// This test deliberately uses a separate upstream Parquet reader.
// Install its exact testing version in CI; it is not shipped to browsers.
(async () => {
  const { parquetReadObjects, parquetMetadataAsync } = await import('hyparquet');
  const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist/index.html'));
  const app = createApp(file, { language: 'ja' });
  app.input(app.el('rowCount'), '7000');
  app.input(app.el('seedInput'), 'independent-parquet-reader');
  app.run(`
    state.columns = [
      newColumn('sequence','row_id'), newColumn('decimal','price'),
      newColumn('boolean','enabled'), newColumn('fixed','日本語'),
      newColumn('fixed','missing')
    ];
    state.columns[1].settings.min = 12.5;
    state.columns[1].settings.max = 12.5;
    state.columns[1].settings.decimals = 1;
    state.columns[3].settings.value = '日本語と表';
    state.columns[4].settings.value = 'unused';
    state.columns[4].test.missing = 100;
    renderColumns();
  `);
  app.el('generateButton').click();
  app.complete();
  const expectedFirst = JSON.parse(app.run('JSON.stringify(generatedPreviewRows)'));
  app.el('exportFormat').value = 'parquet';
  app.el('exportFormat').dispatch('change');
  app.el('saveOutputButton').click();
  const messages = app.complete();
  if (messages.some(x => x.type === 'error')) {
    throw new Error('Export failed: ' + messages.find(x => x.type === 'error').message);
  }
  const download = app.downloads.at(-1);
  assert.ok(download, 'download exists');
  const bytes = await download.blob.arrayBuffer();
  const metadata = await parquetMetadataAsync(bytes);
  assert.equal(Number(metadata.num_rows), 7000);
  assert.ok(metadata.row_groups.length > 1, 'must cover multiple row groups');
  assert.equal(metadata.schema.length, 6, 'root schema and five columns');
  const records = await parquetReadObjects({ file: bytes });
  assert.equal(records.length, 7000);
  for (const i of [0,1,19,4095,4096,6999]) {
    const row = records[i];
    assert.equal(Number(row.row_id), i + 1);
    assert.equal(row.price, 12.5);
    assert.equal(typeof row.enabled, 'boolean');
    assert.equal(row['日本語'], '日本語と表');
    assert.equal(row.missing, null);
    if (i < expectedFirst.length) assert.equal(row.enabled, expectedFirst[i].enabled);
  }

  // Read every supported data type through the independent reader, including
  // UTF-8 strings, many simultaneous nullable columns, and boundary examples.
  const allTypes = createApp(file, { language: 'ja' });
  allTypes.input(allTypes.el('rowCount'), '513');
  allTypes.input(allTypes.el('seedInput'), 'parquet-all-23-types');
  allTypes.run(`
    state.columns = supportedTypes.map(type => newColumn(type, 'field_' + type));
    state.columns.forEach(column => { column.test.missing = 17; column.test.boundary = 10; });
    renderColumns();
  `);
  allTypes.el('generateButton').click();
  const previewMessages = allTypes.complete();
  assert.ok(previewMessages.some(x => x.type === 'complete' && x.task === 'preview'));
  const samples = JSON.parse(allTypes.run('JSON.stringify(generatedPreviewRows)'));
  allTypes.el('exportFormat').value = 'parquet';
  allTypes.el('exportFormat').dispatch('change');
  allTypes.el('saveOutputButton').click();
  const allMessages = allTypes.complete();
  assert.ok(!allMessages.some(x => x.type === 'error'), '23-column Parquet export succeeded');
  const allBytes = await allTypes.downloads.at(-1).blob.arrayBuffer();
  const allMetadata = await parquetMetadataAsync(allBytes);
  const allRecords = await parquetReadObjects({ file: allBytes });
  assert.equal(Number(allMetadata.num_rows), 513);
  assert.equal(allMetadata.schema.length, 24);
  assert.equal(allRecords.length, 513);
  const numericTypes = new Set(['sequence','integer','decimal','money','percent']);
  for (let index = 0; index < samples.length; index += 1) {
    for (const [key,value] of Object.entries(samples[index])) {
      const decoded = allRecords[index][key];
      if (value == null) assert.equal(decoded, null, key + '[' + index + '] missing');
      else if (numericTypes.has(key.slice(6))) assert.equal(Number(decoded), value, key + '[' + index + '] numeric');
      else assert.equal(decoded, value, key + '[' + index + '] value');
    }
  }
  for (const type of ['sequence','integer','boolean']) {
    assert.ok(allRecords.some(row => row['field_' + type] == null), type + ' preserves nulls');
  }
  console.log('PASS independent Parquet read of all 23 types, nulls, boundaries, and 513 rows');

  // Deliberately malformed values must not be silently coerced or dropped.
  const mixed = createApp(file, { language: 'ja' });
  mixed.input(mixed.el('rowCount'), '33');
  mixed.input(mixed.el('seedInput'), 'parquet-malformed-types');
  mixed.run(`
    state.columns = [newColumn('integer', 'numeric'), newColumn('boolean', 'flag')];
    state.columns[0].test.invalid = 100;
    state.columns[1].test.invalid = 100;
    renderColumns();
  `);
  mixed.el('generateButton').click(); mixed.complete();
  const expectedMixed = JSON.parse(mixed.run('JSON.stringify(generatedPreviewRows)'));
  mixed.el('exportFormat').value = 'parquet';
  mixed.el('exportFormat').dispatch('change');
  mixed.el('saveOutputButton').click(); mixed.complete();
  const decodedMixed = await parquetReadObjects({ file: await mixed.downloads.at(-1).blob.arrayBuffer() });
  assert.equal(decodedMixed.length, 33);
  for (let i = 0; i < expectedMixed.length; i += 1) {
    assert.equal(decodedMixed[i].numeric, expectedMixed[i].numeric);
    assert.equal(decodedMixed[i].flag, expectedMixed[i].flag);
  }
  console.log('PASS mixed invalid numeric and boolean values survive Parquet serialization');

  console.log('PASS independent hyparquet read of 7000 rows, native types, nulls, Japanese UTF-8 strings, and multiple row groups');
})().catch(err => { console.error(err); process.exitCode = 1; });
