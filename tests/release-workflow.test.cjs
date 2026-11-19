'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const release = fs.readFileSync(path.join(root, '.github/workflows/release-after-merge.yml'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');

test('post-merge release triggers from main without granting more than content write', () => {
  assert.match(release, /on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(release, /contents:\s*write/);
  assert.doesNotMatch(release, /pull_request_target:/);
  assert.match(release, /cancel-in-progress:\s*false/);
});

test('release version comes from config and tags are checked before creation', () => {
  assert.match(config.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.match(release, /Get-Content -Raw -Encoding UTF8 app\.config\.json/);
  assert.match(release, /git ls-remote --tags --refs origin/);
  assert.match(release, /gh release view/);
  assert.match(release, /git tag \$tag/);
  assert.match(release, /git push origin/);
  assert.match(release, /--verify-tag/);
});

test('release builds and verifies before pushing tags, then includes both standalone downloads', () => {
  const verify = release.indexOf('./scripts/check-repository.ps1');
  const push = release.indexOf('git push origin');
  assert.ok(verify >= 0 && push > verify);
  assert.match(release, /dist\/test-data-generator\.html/);
  assert.match(release, /dist\/test-data-generator\.self-extract\.html/);
  assert.match(release, /gh release create/);
  assert.match(release, /--generate-notes/);
});

test('editing help removes instructions about closing and clipboard sync while retaining privacy facts', () => {
  const helpStart = source.indexOf('<!-- APP:HELP:BEGIN -->');
  const helpEnd = source.indexOf('<!-- APP:HELP:END -->');
  assert.ok(helpStart !== -1 && helpEnd > helpStart);
  const help = source.slice(helpStart, helpEnd);
  assert.doesNotMatch(help, /data-i18n="helpReading"/);
  assert.doesNotMatch(source, /クリップボードは他のアプリや端末の同期機能から利用される場合があります/);
  assert.match(source, /helpPrivacyBody: '設定と生成処理はブラウザー内で完結/);
  assert.match(source, /helpPrivacyBody: 'Settings and generation stay in your browser/);
  assert.doesNotMatch(source, /v1\.0\.0では最大1,000,000件/);
  assert.match(source, /@media \(max-width: 520px\) \{\s*footer, \.local-badge \{ display: none; \}/);
});
