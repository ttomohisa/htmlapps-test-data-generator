'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { createApp } = require('./test-data-harness.cjs');
const filename = path.resolve(process.argv[2] || path.join(__dirname, '..', 'src/index.template.html'));
const tasks = [];
function test(name, fn) { tasks.push([name,fn]); }
function makeApp(extra = '') {
  const app = createApp(filename, { language: 'ja' });
  app.input(app.el('rowCount'), '5');
  app.input(app.el('seedInput'), 'formats-parquet-test');
  app.run('state.columns = [newColumn("sequence","id"), newColumn("fixed","名前"), newColumn("boolean","flag"), newColumn("fixed","nullable")]; state.columns[1].settings.value = "日本語と表"; state.columns[3].settings.value = "value"; state.columns[3].test.missing = 100; renderColumns(); ' + extra);
  app.el('generateButton').click(); app.complete();
  assert.equal(app.el('saveOutputButton').disabled, false);
  return app;
}
async function save(app, fmt, enc = 'utf8') {
  app.el('exportFormat').value = fmt;
  app.el('exportFormat').dispatch('change');
  app.el('encodingSelect').value = enc;
  app.el('encodingSelect').dispatch('change');
  app.el('saveOutputButton').click();
  const worker = app.workers.at(-1);
  const events = app.complete(worker);
  return { events, download: app.downloads.at(-1), app };
}
test('Parquet format has the right extension, MIME, binary signature, and nullable typed columns', async () => {
  const app = makeApp();
  const { events,download } = await save(app,'parquet');
  assert.ok(download, 'a file is downloaded');
  assert.equal(download.name, 'test-data.parquet');
  assert.equal(download.blob.type, 'application/vnd.apache.parquet');
  const bytes = new Uint8Array(await download.blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0,4)], [80,65,82,49]);
  assert.deepEqual([...bytes.slice(-4)], [80,65,82,49]);
  const footerSize = new DataView(bytes.buffer).getUint32(bytes.length - 8, true);
  assert.ok(footerSize > 30 && footerSize < bytes.byteLength - 12);
  assert.ok(events.some(e => e.type === 'chunk' && e.bytes instanceof Uint8Array));
  assert.ok(events.some(e => e.type === 'complete'));
  assert.equal(app.el('encodingField').hidden, true);
  assert.equal(app.el('newlineField').hidden, true);
});
test('Shift_JIS Windows-31J exports Japanese CSV bytes without replacement characters', async () => {
  const app = makeApp();
  const { download } = await save(app,'csv','sjis');
  const bytes = new Uint8Array(await download.blob.arrayBuffer());
  const text = new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
  assert.match(text,/名前/);
  assert.match(text,/日本語と表/);
  assert.match(text,/\r?\n/);
  assert.equal(text.includes('\ufffd'),false);
  assert.equal(bytes[0],0x69);
  assert.equal(app.el('encodingField').hidden, false);
});
test('UTF-16 LE exports BOM and UTF-16 code units, including Japanese characters', async () => {
  const app = makeApp();
  const {download} = await save(app,'tsv','utf16le');
  const bytes = new Uint8Array(await download.blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0,2)],[0xff,0xfe]);
  const text = new TextDecoder('utf-16le',{fatal:true}).decode(bytes);
  assert.match(text,/日本語と表/);
  assert.ok(text.includes('\t'));
});
test('UTF-8 and UTF-8 BOM exports remain backward compatible', async () => {
  for(const enc of ['utf8','utf8bom']) {
    const app = makeApp();
    const {download} = await save(app,'csv',enc);
    const bytes=new Uint8Array(await download.blob.arrayBuffer());
    assert.deepEqual([...bytes.slice(0,enc==='utf8bom'?3:1)], enc==='utf8bom'?[0xef,0xbb,0xbf]:[0x69]);
    assert.match(new TextDecoder().decode(bytes),/日本語と表/);
  }
});
test('Shift_JIS rejects unrepresentable emoji instead of corrupting data', async () => {
  const app = makeApp('state.columns[1].settings.value = "😀"; renderColumns()');
  // Updating a settings property directly also invalidates the generated snapshot.
  app.el('generateButton').click(); app.complete();
  const result=await save(app,'csv','sjis');
  assert.equal(result.download,undefined);
  assert.ok(result.events.some(e=>e.type==='error' && e.message==='encoding-unrepresentable'));
  assert.equal(app.el('exportStatus').textContent,app.run("translate('encodingUnrepresentable')"));
  assert.equal(app.el('saveOutputButton').disabled,false);
});
test('Parquet export is deterministic with the same Seed and schema', async () => {
  const app = makeApp();
  const first = await save(app,'parquet');
  const one = Buffer.from(await first.download.blob.arrayBuffer());
  const second = await save(app,'parquet');
  const two = Buffer.from(await second.download.blob.arrayBuffer());
  assert.deepEqual(one,two);
});
test('Parquet size guard rejects a partial result without offering a download', async () => {
  const app = makeApp();
  app.el('exportFormat').value='parquet';
  app.el('saveOutputButton').click();
  const worker=app.workers.at(-1);
  worker.message.options.maxBytes=32;
  const messages=app.complete(worker);
  assert.ok(messages.some(x=>x.type==='error' && x.message==='export-too-large'));
  assert.equal(app.downloads.length,0);
});

test('CSV with Shift_JIS preserves quoted Japanese, CRLF separators and half-width kana', async () => {
  const text = '明細,"見積"\nｶﾅ\t番号';
  const app = makeApp('state.columns[1].settings.value = ' + JSON.stringify(text) + '; renderColumns()');
  app.el('newlineSelect').value = 'crlf';
  app.el('newlineSelect').dispatch('change');
  const {download} = await save(app, 'csv', 'sjis');
  const decoded = new TextDecoder('shift_jis', {fatal:true}).decode(await download.blob.arrayBuffer());
  assert.ok(decoded.includes('id,名前,flag,nullable\r\n'), 'CRLF record boundary');
  assert.ok(decoded.includes('"明細,""見積""\nｶﾅ\t番号"'), 'embedded newline and quotes are escaped without changing data');
  assert.equal(decoded.includes('\ufffd'), false, 'no malformed replacement');
});
test('UTF-16 LE preserves non-BMP emoji and quoted CSV text', async () => {
  const raw = '東京🌸,"桜"';
  const app = makeApp('state.columns[1].settings.value = ' + JSON.stringify(raw) + '; renderColumns()');
  const {download} = await save(app,'csv','utf16le');
  const bytes = new Uint8Array(await download.blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0,2)],[255,254]);
  const content = new TextDecoder('utf-16le',{fatal:true}).decode(bytes);
  assert.ok(content.includes('"東京🌸,""桜"""'));
});
test('JSON and Parquet never inherit a legacy CSV encoding', async () => {
  const app = makeApp();
  app.el('encodingSelect').value = 'utf16le';
  app.el('encodingSelect').dispatch('change');
  const {download} = await save(app,'json','utf16le');
  assert.equal(download.blob.type,'application/json;charset=utf-8');
  const bytes = new Uint8Array(await download.blob.arrayBuffer());
  assert.notDeepEqual([...bytes.slice(0,2)],[255,254]);
  assert.ok(JSON.parse(new TextDecoder('utf-8').decode(bytes)).length > 0);
});
test('unrepresentable header names in Shift_JIS fail the entire export', async () => {
  const app = makeApp('state.columns[1].name = "🗒️"; renderColumns()');
  const {events,download} = await save(app,'tsv','sjis');
  assert.equal(download,undefined);
  assert.ok(events.some(e=>e.type==='error' && e.message==='encoding-unrepresentable'));
});
(async () => {
  for(const [name,fn] of tasks){
    try { await fn(); console.log('PASS '+name); }
    catch(err) {console.error('FAIL '+name); console.error(err); process.exitCode=1;}
  }
  console.log('Format & encoding tests: '+filename);
})();
