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

// Persistent guidance belongs in a wrapping block, outside the fixed-width action row.
for(const name of ['src/index.template.html','dist/index.html','dist/index.self-extract.html','test-data-generator.html']){
 const html=loadHtml(path.join(root,name)),stack=[],owners=new Map();
 for(const token of html.matchAll(/<div\b[^>]*>|<\/div>|<(?:p|button)\b[^>]*>/g)){
  const tag=token[0];if(tag.startsWith('</'))stack.pop();else if(/^<div\b/.test(tag))stack.push(tag.match(/class="([^"]*)"/)?.[1]||'');else{const id=tag.match(/id="([^"]*)"/)?.[1];if(id)owners.set(id,[...stack]);}
 }
 for(const id of ['exportPrefsStatus','retryExportPrefs','outputScope']){assert.ok(owners.get(id)?.includes('export-feedback'),name+': feedback owns '+id);assert.ok(!owners.get(id).includes('export-button-group'),name+': guidance cannot widen fixed action row');}
 for(const id of ['cancelExportButton','saveOutputButton'])assert.ok(owners.get(id)?.includes('export-button-group'),name+': existing action ownership retained');
 assert.match(html,/\.export-feedback\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;/);
}
console.log('Export feedback wraps independently of the unchanged fixed action row in every artifact.');
