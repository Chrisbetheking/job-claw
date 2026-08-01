import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const common = await readFile('src/common.js', 'utf8');
const background = await readFile('src/background.js', 'utf8');
const content = await readFile('src/content-v37.js', 'utf8');
const panelHtml = await readFile('public/sidepanel.html', 'utf8');
const panelJs = await readFile('src/sidepanel.js', 'utf8');
const aiRouting = await readFile('src/lib/ai-routing.js', 'utf8');

assert.equal(manifest.version, '2.1.0');
assert.match(manifest.version_name, /AI Routing/);
assert.ok(manifest.host_permissions.includes('http://127.0.0.1:11434/*'));
assert.match(common, /massApplyAnalysis: 'auto-ai'/);
assert.match(common, /aiProviderMode: 'auto'/);
assert.match(common, /model: 'deepseek-v4-flash'/);
assert.match(common, /model: 'qwen3:1\.7b'/);
assert.match(aiRouting, /chooseAiRoute/);
assert.match(background, /abortActiveAiRequests\('user-pause'\)/);
assert.match(background, /broadcastBossControl\('PAUSE_NOW'/);
assert.match(background, /broadcastBossControl\('STOP_NOW'/);
assert.match(content, /2\.1\.0-ai-pause\.2/);
assert.match(content, /message\?\.type === 'PAUSE_NOW'/);
assert.match(content, /message\?\.type === 'STOP_NOW'/);
assert.match(content, /assertControlActive\(\)/);
assert.match(panelHtml, /id="aiWarningModal"/);
assert.match(panelHtml, /value="deepseek-v4-flash"/);
assert.match(panelHtml, /value="qwen3:1\.7b"/);
assert.match(panelJs, /confirmStartWithoutAi/);
assert.match(panelJs, /正在暂停/);

console.log('UI210_AI_ROUTING_IMMEDIATE_PAUSE_OK');
