import { readFile } from 'node:fs/promises';

const background = await readFile('src/background.js', 'utf8');
const panel = await readFile('src/sidepanel.js', 'utf8');
const html = await readFile('public/sidepanel.html', 'utf8');
const css = await readFile('public/styles.css', 'utf8');

if (!background.includes('validateGeneratedProfile')) throw new Error('missing complete AI profile validation');
if (!background.includes('maxTokens: 4200')) throw new Error('profile token budget not raised');
if (!background.includes('ai-compact-retry')) throw new Error('AI compact retry is missing');
if (!background.includes('AI 连接可用，但返回内容未通过完整性校验')) throw new Error('output failure classification is missing');
if (!html.includes('id="profileDirectionsInput"') || !html.includes('data-autogrow="profile"')) throw new Error('profile fields are not auto-growing');
if (!panel.includes('function autoGrowTextarea')) throw new Error('auto-grow runtime missing');
if (!panel.includes('profileGenerationSource')) throw new Error('profile source renderer missing');
if (panel.includes("result.warning ? 'AI 暂时不可用")) throw new Error('misleading AI unavailable toast still exists');
if (!css.includes('UI28 — profile source clarity')) throw new Error('UI28 profile CSS missing');
console.log('UI28_PROFILE_GENERATION_OK');
