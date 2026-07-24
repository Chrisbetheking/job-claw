import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = 'dist/chrome-extension';
const common = await import(pathToFileURL(`${process.cwd()}/${root}/common.js`).href + `?t=${Date.now()}`);
if (!Array.isArray(common.DEFAULTS.taskRuns)) throw new Error('taskRuns default missing');
if (!Object.prototype.hasOwnProperty.call(common.DEFAULTS.workflow, 'activeRunId')) throw new Error('activeRunId default missing');

const [html, css, sidepanel, background, content] = await Promise.all([
  readFile(`${root}/sidepanel.html`, 'utf8'),
  readFile(`${root}/styles.css`, 'utf8'),
  readFile(`${root}/sidepanel.js`, 'utf8'),
  readFile(`${root}/background.js`, 'utf8'),
  readFile(`${root}/content-v37.js`, 'utf8')
]);

for (const id of ['activeTaskProgress', 'activeTaskBar', 'activeTaskPercent', 'searchTaskList', 'deliveryTaskList', 'retryAllFailedTasks']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`progress UI missing: ${id}`);
}
for (const token of ['.progress-track', '.search-task-item', '.delivery-task', '.delivery-task.is-failed', '@keyframes task-progress-stripes']) {
  if (!css.includes(token)) throw new Error(`progress CSS missing: ${token}`);
}
for (const token of ['renderActiveProgress', 'renderSearchTasks', 'renderDeliveryTasks', "send('RETRY_FAILED_TASK'", "send('RETRY_ALL_FAILED_TASKS'", "send('IGNORE_FAILED_TASK'"]) {
  if (!sidepanel.includes(token)) throw new Error(`sidepanel task monitor missing: ${token}`);
}
for (const token of ['TASK_STAGE_META', 'upsertTaskRun', 'updateTaskRunByPending', 'updateSearchTaskProgress', 'retryFailedTask', 'retryAllFailedTasks', "case 'TASK_PROGRESS'", "case 'SEARCH_TASK_PROGRESS'", "case 'RETRY_FAILED_TASK'", "case 'RETRY_ALL_FAILED_TASKS'", "case 'IGNORE_FAILED_TASK'"]) {
  if (!background.includes(token)) throw new Error(`background task runtime missing: ${token}`);
}
for (const token of ["currentStage = 'open_job'", "currentStage = 'open_chat'", "currentStage = 'fill_message'", "currentStage = 'send_message'", "currentStage = 'verify_result'", "send('TASK_PROGRESS'", "send('SEARCH_TASK_PROGRESS'", 'greetingVisibleInChat(greeting)']) {
  if (!content.includes(token)) throw new Error(`content progress stage missing: ${token}`);
}
if (background.includes('taskRuns.slice(0')) throw new Error('taskRuns must not be silently truncated');
if (!background.includes('id: crypto.randomUUID()') || !background.includes('keyword,')) throw new Error('search tasks do not have independent IDs');

console.log(JSON.stringify({
  ok: true,
  perSearchTaskProgress: true,
  perJobDeliveryProgress: true,
  persistentFailedTasks: true,
  singleAndBatchRetry: true,
  duplicateSendGuard: true
}, null, 2));
