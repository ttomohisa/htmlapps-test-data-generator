'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadHtml } = require('./test-data-harness.cjs');
const root = path.join(__dirname, '..');
const readable = fs.readFileSync(path.join(root, 'dist/index.html'));
assert.deepEqual(fs.readFileSync(path.join(root, 'test-data-generator.html')), readable, 'root downloadable HTML must match this build');
assert.equal(loadHtml(path.join(root, 'dist/index.self-extract.html')), readable.toString('utf8'), 'self-extract payload must equal readable artifact');
const check = fs.readFileSync(path.join(root, 'scripts/check-repository.ps1'), 'utf8');
assert.match(check, /test-data-behavior\.test\.cjs/);
assert.match(check, /test-data-release\.test\.cjs/);
assert.match(check, /LASTEXITCODE/);
for (const workflow of ['build-standalone.yml', 'deploy-pages.yml', 'preview.yml']) {
  const yaml = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
  assert.match(yaml, /actions\/setup-node@/);
  assert.match(yaml, /node-version: 24/);
}
console.log('Release parity and CI behavior-test integration passed.');
