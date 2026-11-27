'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { createApp } = require('./test-data-harness.cjs');

const target = path.resolve(process.argv[2] || path.join(__dirname, '..', 'src/index.template.html'));
const rows = app => app.document.querySelectorAll('.column-row');
function field(app, index, attribute, key) {
  return rows(app)[index].querySelector(`[data-${attribute}="${key}"]`);
}
function feedback(app, input) {
  assert.equal(input.getAttribute('aria-invalid'), 'true', 'the affected control is marked invalid');
  const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/);
  const messages = ids.map(id => app.el(id)).filter(Boolean);
  const local = messages.find(el => input.closest('.column-row').contains(el) && !el.hidden);
  assert.ok(local, 'the control describes its error in the same column');
  return local;
}

for (const language of ['en', 'ja']) {
  test(`${language}: reports a 101% mix next to its rates, focuses the field and clears on correction`, () => {
    const app = createApp(target, { language });
    app.run('state.columns = Array.from({ length: 12 }, (_, i) => newColumn("integer", "field_" + i)); renderColumns()');
    const rate = key => field(app, 11, 'test-setting', key);
    app.input(rate('missing'), '60');
    app.input(rate('invalid'), '41');
    app.el('generateButton').click();
    const message = feedback(app, rate('missing'));
    assert.ok(rate('missing').closest('.test-settings').contains(message));
    assert.match(message.textContent, /field_11/);
    assert.match(message.textContent, /101\s*%/);
    assert.match(message.textContent, language === 'en' ? /1 percentage point\b/i : /1\s*ポイント/);
    assert.ok(feedback(app, rate('invalid')) === message, 'contributing rates share the explanation');
    assert.ok(app.document.activeElement === rate('missing'), 'Generate focuses the first contributing rate');
    assert.ok(app.document.lastScrollIntoView?.target === rate('missing'), 'the focused rate is brought into view');
    assert.equal(app.workers.length, 0);
    app.input(rate('invalid'), '40');
    assert.notEqual(rate('missing').getAttribute('aria-invalid'), 'true');
    assert.ok(!rows(app)[11].classList.contains('invalid'));
    assert.ok(!app.el('errorBanner').classList.contains('show'));
    app.el('generateButton').click();
    assert.equal(app.workers.length, 1);
  });
}

test('multiple errors follow column order and focus the particular invalid setting', () => {
  const app = createApp(target, { language: 'en' });
  app.input(field(app, 0, 'setting', 'step'), '');
  app.input(field(app, 2, 'role', 'name'), 'status');
  app.el('generateButton').click();
  const step = field(app, 0, 'setting', 'step');
  assert.ok(app.document.activeElement === step, 'a later duplicate should not take priority over an invalid first row');
  assert.ok(step.closest('.type-settings').contains(feedback(app, step)));
  assert.ok(!field(app, 0, 'setting', 'start').hasAttribute('aria-invalid'));
  const duplicate = field(app, 2, 'role', 'name');
  assert.match(feedback(app, duplicate).textContent, /status/);
  assert.match(feedback(app, field(app, 3, 'role', 'name')).textContent, /status/);
  app.input(step, '2');
  assert.match(app.el('errorText').textContent, /status/);
  app.el('generateButton').click();
  assert.ok(app.document.activeElement === duplicate, 'Generate focuses the duplicate name after the earlier error is fixed');
  app.input(duplicate, '');
  assert.match(feedback(app, duplicate).textContent, /Column 3/i);
  assert.ok(!field(app, 3, 'role', 'name').hasAttribute('aria-invalid'));
  app.input(duplicate, 'email');
  assert.ok(!duplicate.hasAttribute('aria-invalid'));
  assert.ok(!app.el('errorBanner').classList.contains('show'));
});

test('individual bad rates retain field-specific feedback across a language change', () => {
  const app = createApp(target, { language: 'en' });
  app.input(field(app, 0, 'test-setting', 'boundary'), '-1');
  app.el('generateButton').click();
  const boundary = field(app, 0, 'test-setting', 'boundary');
  assert.ok(app.document.activeElement === boundary, 'only the out-of-range field receives focus');
  assert.match(feedback(app, boundary).textContent, /0.*100/);
  assert.ok(!field(app, 0, 'test-setting', 'missing').hasAttribute('aria-invalid'));
  app.el('languageButton').click();
  const message = feedback(app, field(app, 0, 'test-setting', 'boundary')).textContent;
  assert.match(message, /整数/);
  assert.equal(app.el('errorText').textContent, message);
  app.input(field(app, 0, 'role', 'name'), 'column $& {detail}');
  app.input(field(app, 0, 'test-setting', 'boundary'), '101');
  const excessive = feedback(app, field(app, 0, 'test-setting', 'boundary')).textContent;
  assert.ok(excessive.includes('column $& {detail}'), 'column names remain literal text');
  assert.match(excessive, /101\s*%/);
  assert.match(excessive, /1\s*ポイント/);
});

const numericErrors = [
  { type: 'integer', values: { min: '1.5' }, field: 'min', en: /Min.*whole number/i, ja: /最小値.*整数/ },
  { type: 'integer', values: { max: '9007199254740992' }, field: 'max', en: /Max.*9,007,199,254,740,991/i, ja: /最大値.*9,007,199,254,740,991/ },
  { type: 'integer', values: { min: '-9007199254740991', max: '1' }, field: 'min', en: /narrow.*range/i, ja: /範囲を狭/ },
  { type: 'integer', values: { min: '10', max: '1' }, field: 'min', en: /min.*greater than max/i, ja: /最小値が最大値を超/ },
  { type: 'decimal', values: { min: '0.1', max: '0.2', decimals: '0' }, field: 'min', en: /widen the range/i, ja: /範囲を広/ },
  { type: 'decimal', values: { min: '10', max: '1' }, field: 'min', en: /min.*greater than max/i, ja: /最小値が最大値を超/ },
  { type: 'decimal', values: { max: '' }, field: 'max', en: /number for Max/i, ja: /最大値.*数値/ },
  { type: 'decimal', values: { decimals: '2.5' }, field: 'decimals', en: /whole number.*0.*10/i, ja: /0.*10.*整数/ },
  { type: 'decimal', values: { max: '1e25' }, field: 'max', en: /closer to zero/i, ja: /0に近/ },
];
for (const language of ['en', 'ja']) {
  test(`${language}: integer and decimal errors explain how to fix the particular failed constraint`, () => {
    const app = createApp(target, { language });
    for (const example of numericErrors) {
      app.run(`state.columns = [newColumn(${JSON.stringify(example.type)}, "price")]; renderColumns()`);
      for (const [key, value] of Object.entries(example.values)) app.input(field(app, 0, 'setting', key), value);
      app.el('generateButton').click();
      const first = field(app, 0, 'setting', example.field);
      assert.ok(app.document.activeElement === first, `focus ${example.type}.${example.field}`);
      assert.match(feedback(app, first).textContent, example[language], JSON.stringify(example.values));
      assert.equal(app.workers.length, 0);
    }
  });
}
