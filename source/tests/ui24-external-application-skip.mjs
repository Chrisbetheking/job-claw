import { readFile } from 'node:fs/promises';

const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const background = await readFile('dist/chrome-extension/background.js', 'utf8');

for (const token of [
  'externalApplicationInfo(root = this.detailRoot())',
  '立即网申',
  '前往网申',
  "type: 'external_application'",
  "stageLabel: '外部网申岗位已跳过'",
  "message: `外部网申岗位已跳过：${job.title}`",
  "send('SKIP_PENDING'",
  'await adapter.returnToJobsHome()'
]) {
  if (!content.includes(token)) throw new Error(`外部网申跳过逻辑缺失：${token}`);
}

const extractionIndex = content.indexOf('const job = adapter.extractJob(card);');
const externalIndex = content.indexOf('const externalApplication = adapter.externalApplicationInfo();', extractionIndex);
const aiIndex = content.indexOf("const ai = await send('AI_JOB'", extractionIndex);
if (!(extractionIndex >= 0 && externalIndex > extractionIndex && aiIndex > externalIndex)) {
  throw new Error('外部网申岗位必须在 AI 分析和投递前被跳过');
}

for (const token of [
  'async function skipPendingTask',
  "case 'SKIP_PENDING':",
  "status: 'skipped'",
  "phase: 'search'",
  '继续搜索可直接沟通岗位'
]) {
  if (!background.includes(token)) throw new Error(`后台外部网申队列处理缺失：${token}`);
}

console.log('UI24_EXTERNAL_APPLICATION_SKIP_OK');
