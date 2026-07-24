import { readFile } from 'node:fs/promises';
const background = await readFile('dist/chrome-extension/background.js', 'utf8');
for (const token of [
  "storage.get(['taskRuns', 'pending', 'workflow'])",
  '该失败任务正在重试，请等待当前结果',
  '该任务刚刚提交过重试，请稍后查看结果',
  'retryRequestedAt: Date.now()',
  'Date.now() - 15000',
  '当前已有投递任务正在执行，请等待完成后再批量重试'
]) {
  if (!background.includes(token)) throw new Error(`UI37 retry lock missing: ${token}`);
}
console.log('UI37_RETRY_LOCK_OK');
