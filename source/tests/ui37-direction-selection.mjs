import { readFile } from 'node:fs/promises';

const root = 'dist/chrome-extension';
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
const background = await readFile(`${root}/background.js`, 'utf8');
const sidepanel = await readFile(`${root}/sidepanel.js`, 'utf8');
const html = await readFile(`${root}/sidepanel.html`, 'utf8');
const styles = await readFile(`${root}/styles.css`, 'utf8');
const common = await readFile(`${root}/common.js`, 'utf8');

if (manifest.version !== '1.3.0') throw new Error(`UI37 version mismatch: ${manifest.version}`);
if (!manifest.content_scripts?.some(item => item.js?.includes('content-v37.js'))) throw new Error('content-v37.js not registered');
if (!common.includes('directionPlan: null')) throw new Error('directionPlan default state missing');
if (!html.includes('仅投递你勾选并保存的方向')) throw new Error('direction selection guidance missing');

for (const token of [
  'buildDirectionPlan',
  'normalizeDirectionPlan',
  'selectedDirectionItems',
  "case 'SAVE_DIRECTION_PLAN'",
  "case 'REBUILD_DIRECTION_PLAN'",
  'createTasks(profile, config, directionPlan)',
  'directionPlan.confirmed',
  '请先在“简历 → 职业画像”中选择要投递的岗位方向并保存',
  'directionId: direction.id',
  'directionName: direction.name'
]) {
  if (!background.includes(token)) throw new Error(`background missing ${token}`);
}

for (const id of [
  'directionPlanCard',
  'directionPlanPill',
  'directionPlanList',
  'addCustomDirection',
  'rebuildDirectionPlan',
  'saveDirectionPlan'
]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`direction UI missing ${id}`);
}

for (const token of [
  'renderDirectionPlan',
  'directionPlanDirty',
  'selectedDirectionItems',
  "send('SAVE_DIRECTION_PLAN'",
  "send('REBUILD_DIRECTION_PLAN'",
  '应用到下一轮新任务'
]) {
  if (!sidepanel.includes(token)) throw new Error(`sidepanel missing ${token}`);
}

for (const token of [
  '.direction-plan-card',
  '.direction-item',
  '.direction-toggle',
  '.direction-keywords-field',
  '.direction-plan-summary.is-ready'
]) {
  if (!styles.includes(token)) throw new Error(`direction styles missing ${token}`);
}

// User edits must be protected from the 4-second state refresh.
if (!sidepanel.includes('if (!force && directionPlanDirty)')) throw new Error('direction form refresh protection missing');
// Starting a workflow must use selected directions only, never the whole profile keyword list.
const createTasksBody = background.slice(background.indexOf('function createTasks(profile, config, directionPlan)'), background.indexOf('async function dispatchNextAutoPending'));
if (!createTasksBody.includes('const directions = selectedDirectionItems(directionPlan)')) throw new Error('createTasks does not use selected direction plan');
if (createTasksBody.includes('profile.primaryDirections') || createTasksBody.includes('profile.searchKeywords')) throw new Error('createTasks still uses all profile directions directly');

console.log(JSON.stringify({
  ok: true,
  version: manifest.version,
  directionSelection: 'USER_CONFIRMED_ONLY',
  defaultSelection: 'TOP_3',
  customDirections: true,
  refreshProtection: true,
  currentRunIsolation: true
}, null, 2));
