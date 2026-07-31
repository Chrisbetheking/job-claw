import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const content = await readFile('src/content-v37.js', 'utf8');
const panelJs = await readFile('src/sidepanel.js', 'utf8');
const panelHtml = await readFile('public/sidepanel.html', 'utf8');

assert.match(content, /2\.0\.0-strategy-filters\.1/);
assert.match(content, /async ensureSearchRoute\(task, workflow = \{\}\)/);
assert.match(content, /async applyHeaderCityFilter\(value\)/);
assert.match(content, /headerCityTrigger\(\)/);
assert.match(content, /currentHeaderCity\(\)/);
assert.match(content, /async submitKeywordSearch\(keyword/);

const applyStart = content.indexOf('async applySearchTask(task, workflow = {})');
const routeIndex = content.indexOf('ensureSearchRoute(task, workflow)', applyStart);
const fallbackIndex = content.indexOf('applyHeaderCityFilter(task.location)', applyStart);
const searchIndex = content.indexOf('submitKeywordSearch(task.keyword', applyStart);
const filterIndex = content.indexOf("['求职类型', task.employmentType", applyStart);
assert.ok(routeIndex > applyStart, 'city-code route should be attempted first');
assert.ok(fallbackIndex > routeIndex, 'header city selector should remain as fallback');
assert.ok(searchIndex > fallbackIndex, 'keyword search must happen after city route/fallback');
assert.ok(filterIndex > searchIndex, 'result filters must happen after keyword search');

assert.doesNotMatch(panelHtml, /data-collapsible="[^"]+"\s+open/);
assert.match(panelJs, /2\.0\.0-collapsed-defaults\.1/);
assert.match(panelJs, /detail\.open = false/);
assert.match(panelJs, /localStorage\.removeItem\(key\)/);

console.log('UI181_CITY_SEQUENCE_COLLAPSED_DEFAULTS_OK');
