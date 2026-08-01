import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = fs.readFileSync(path.join(root, 'src', 'content-v37.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8');

assert.match(content, /2\.0\.1-greeting-hotfix\.1/);
assert.match(background, /2\.0\.1-greeting-hotfix\.1/);
assert.match(content, /BOSS_SEARCH_ROUTE/);
assert.match(content, /NAVIGATE_BOSS_SEARCH/);
assert.match(content, /pendingSearchNavigation/);
assert.match(content, /城市地址切换未生效，正在使用顶部城市选择器/);
assert.match(content, /if \(filterResult\?\.navigating\) return;/);
assert.match(background, /wapi\/zpgeek\/common\/data\/citysites\.json/);
assert.match(background, /wapi\/zpCommon\/data\/city\.json/);
assert.match(background, /chrome\.tabs\.update\(tabId, \{ url: target\.toString\(\), active: true \}\)/);

console.log('ui191 city route navigation regression checks passed');
