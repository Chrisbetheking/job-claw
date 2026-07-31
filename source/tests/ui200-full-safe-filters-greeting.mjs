import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const [background, content, sidepanel, html, safety] = await Promise.all([
  readFile(new URL('../src/background.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/content-v37.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/sidepanel.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/sidepanel.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/safety-control.js', import.meta.url), 'utf8')
]);
for (const token of ['完全海投','安全海投','data-batch-strategy="full-mass"','data-batch-strategy="safe-mass"']) assert.ok(html.includes(token), token);
for (const token of ['setBatchStrategy','normalizedBatchStrategy','settingsStrategyPill']) assert.ok(sidepanel.includes(token), token);
for (const token of ["normalized === 'full-mass'","ignoredHardBlocks","normalizeStrategy"]) assert.ok(safety.includes(token), token);
for (const token of ['BOSS_RESULT_FILTERS','filterPopupRoot','readFilterValue','confirmed: true','actualValue']) assert.ok(content.includes(token), token);
for (const token of ['humanGreetingTemplate','cleanGreetingJobTitle','splitProjectEvidence','最多出现2项真实技术','不能把“某某开发实习生']) assert.ok(background.includes(token), token);
assert.match(content, /2\.0\.0-strategy-filters\.1/);
assert.match(background, /2\.0\.0-strategy-filters\.1/);
console.log('UI200_FULL_SAFE_FILTERS_GREETING_OK');
