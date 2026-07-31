const now = Date.now();
const data = {
  ui9ModeMigration: true,
  ui10UnlimitedV4Migration: true,
  ui12ProfileDraftMigration: true,
  ui18TaskProgressMigration: true,
  bossContentRuntimeVersion: '1.7.0',
  config: { executionMode: 'auto', dailyTarget: 150, model: { baseUrl: 'https://api.deepseek.com', apiKey: 'x', model: 'deepseek-v4-pro' } },
  stats: { date: new Date().toISOString().slice(0, 10), sent: 0, discovered: 1, analyzed: 1, pending: 0, failed: 1, replied: 0, interviews: 0 },
  workflow: { running: false, paused: true, phase: 'idle', statusText: '未开始', tasks: [], taskIndex: 0, cardIndex: 0, processedKeys: [], retries: 0, currentJob: null, returnUrl: '', returnScrollY: 0, pendingApplyId: null, activeRunId: null },
  pending: [{ id: 'pending-1', runId: 'run-1', status: 'failed', job: { title: '前端实习生', company: '测试公司', url: 'https://www.zhipin.com/job_detail/abc' }, analysis: { score: 88, greeting: '您好，我想应聘贵公司的前端实习生岗位。' }, task: { keyword: '前端实习生' }, error: '等待聊天输入框超时', createdAt: now - 1000, completedAt: now }],
  taskRuns: [{ id: 'run-1', pendingId: 'pending-1', jobKey: 'https://www.zhipin.com/job_detail/abc', status: 'failed', stage: 'open_chat', stageLabel: '打开沟通窗口失败', progress: 100, retryable: true, retryCount: 0, job: { title: '前端实习生', company: '测试公司', url: 'https://www.zhipin.com/job_detail/abc' }, analysis: { score: 88, greeting: '您好，我想应聘贵公司的前端实习生岗位。' }, searchTask: { keyword: '前端实习生' }, error: '等待聊天输入框超时', createdAt: now - 1000, updatedAt: now, completedAt: now }],
  events: []
};
const listeners = {};
let runCount = 0;
function clone(value) { return value === undefined ? undefined : structuredClone(value); }
function pick(keys) {
  if (keys == null) return clone(data);
  if (typeof keys === 'string') return { [keys]: clone(data[keys]) };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, clone(data[key])]));
  return {};
}
globalThis.chrome = {
  storage: { local: { get: async keys => pick(keys), set: async patch => Object.assign(data, clone(patch)) } },
  sidePanel: { setPanelBehavior: async () => {} },
  alarms: { create: () => {}, onAlarm: { addListener: listener => { listeners.alarm = listener; } } },
  runtime: {
    onInstalled: { addListener: listener => { listeners.installed = listener; } },
    onStartup: { addListener: listener => { listeners.startup = listener; } },
    onMessage: { addListener: listener => { listeners.message = listener; } }
  },
  tabs: {
    query: async () => [{ id: 42, active: true, status: 'complete', url: 'https://www.zhipin.com/web/geek/jobs', title: 'BOSS直聘' }],
    get: async () => ({ id: 42, active: true, status: 'complete', url: 'https://www.zhipin.com/web/geek/jobs', title: 'BOSS直聘' }),
    reload: async () => {},
    create: async ({ url }) => ({ id: 88, url }),
    sendMessage: async (_id, message) => {
      if (message.type === 'PROBE') return { ok: true, contentVersion: '1.7.0', contentFile: 'content-v37.js', pageType: 'jobs' };
      if (message.type === 'RUN') { runCount += 1; return { ok: true }; }
      return { ok: true };
    }
  },
  scripting: { executeScript: async () => [{ result: true }] },
  notifications: { create: async () => {} }
};
await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?retry=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 20));
async function request(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const keepOpen = listeners.message({ type, ...payload }, {}, resolve);
    if (!keepOpen) reject(new Error(`listener closed: ${type}`));
    setTimeout(() => reject(new Error(`timeout: ${type}`)), 5000);
  });
}
const retry = await request('RETRY_FAILED_TASK', { runId: 'run-1' });
if (!retry.ok) throw new Error(retry.error || 'single retry failed');
if (data.pending[0].status !== 'approved') throw new Error('pending task not re-approved');
if (!data.workflow.running || data.workflow.pendingApplyId !== 'pending-1' || data.workflow.activeRunId !== 'run-1') throw new Error('workflow not restarted');
if (data.taskRuns[0].status !== 'running' || data.taskRuns[0].retryCount !== 1 || data.taskRuns[0].progress !== 66) throw new Error('task run retry progress incorrect');
if (runCount !== 1) throw new Error(`RUN was not delivered exactly once: ${runCount}`);

const failed = await request('APPLY_COMPLETE', { id: 'pending-1', ok: false, stage: 'open_chat', stageLabel: '打开沟通窗口', error: '再次超时', retryable: true });
if (!failed.ok) throw new Error(failed.error || 'apply complete failed');
if (data.taskRuns[0].status !== 'failed' || data.taskRuns[0].progress !== 100 || data.taskRuns[0].error !== '再次超时') throw new Error('failed task was not persisted');

const batch = await request('RETRY_ALL_FAILED_TASKS');
if (!batch.ok || batch.count !== 1) throw new Error(batch.error || 'batch retry failed');
if (data.taskRuns[0].retryCount !== 2) throw new Error('batch retry count not incremented');
if (runCount !== 2) throw new Error(`batch RUN was not delivered: ${runCount}`);

console.log(JSON.stringify({ ok: true, failedTaskPersistence: true, singleRetry: true, batchRetry: true, workflowResume: true }, null, 2));

process.exit(0);
