import { readFile } from 'node:fs/promises';

const root = 'dist/chrome-extension';
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
const background = await readFile(`${root}/background.js`, 'utf8');
const content = await readFile(`${root}/content-v37.js`, 'utf8');
const sidepanel = await readFile(`${root}/sidepanel.js`, 'utf8');

if (manifest.version !== '1.2.37') throw new Error(`UI37 version mismatch: ${manifest.version}`);
if (!manifest.content_scripts?.some(item => item.js?.includes('content-v37.js'))) throw new Error('content-v37.js not registered');
for (const permission of ['offscreen', 'clipboardWrite', 'debugger']) {
  if (!manifest.permissions.includes(permission)) throw new Error(`missing permission ${permission}`);
}
for (const token of [
  'ensureClipboardOffscreen',
  'writeClipboardText',
  'debuggerPasteClipboard',
  'DOM.getNodeForLocation',
  'cdp-clipboard-paste',
  'computeJobPriority',
  'rerankPending',
  'dispatchNextAutoPending',
  "case 'AUTO_DISPATCH_NEXT'"
]) {
  if (!background.includes(token)) throw new Error(`background missing ${token}`);
}
for (const token of [
  'deepRoots',
  'deepAll',
  'composerHintNode',
  'composerEditableCandidates',
  "trustedEditorAction('replaceTextAndEnter'",
  "send('AUTO_DISPATCH_NEXT')",
  '已进入自动排序队列'
]) {
  if (!content.includes(token)) throw new Error(`content missing ${token}`);
}
if (content.includes("trustedEditorAction('replaceText', input, { text: safeGreeting })")) {
  throw new Error('sendGreeting must use atomic replaceTextAndEnter');
}
if (!sidepanel.includes('priorityRank')) throw new Error('queue priority rank not rendered');

// Runtime ranking test: later-discovered higher-quality job must move ahead automatically.
const data = {
  config: {
    executionMode: 'auto',
    dailyTarget: 150,
    minScore: 75,
    targetLocations: [],
    employmentTypes: ['不限'],
    experiences: [],
    degrees: [],
    salary: '不限',
    discoveryLimit: 0,
    sendResumeImage: true,
    sendOnlineResume: false,
    betweenJobsSeconds: 12,
    attachmentDelaySeconds: 4,
    model: { baseUrl: 'https://api.deepseek.com', apiKey: 'x', model: 'deepseek-v4-pro', temperature: 0.1 }
  },
  workflow: { running: false, paused: true, phase: 'idle', tasks: [], taskIndex: 0, cardIndex: 0, processedKeys: [], pendingApplyId: null, activeRunId: null },
  pending: [],
  taskRuns: [],
  events: [],
  stats: { date: new Date().toISOString().slice(0, 10), sent: 0, discovered: 0, analyzed: 0, pending: 0, failed: 0 },
  ui9ModeMigration: true,
  ui10UnlimitedV4Migration: true,
  ui20ReliableSendMigration: true,
  ui21ConversationBindingMigration: true,
  ui22StrictTranscriptMigration: true,
  ui24VerifiedConversationMigration: true,
  ui27TrustedInputMigration: true,
  ui12ProfileDraftMigration: true,
  ui18TaskProgressMigration: true,
  ui20GreetingLockMigration: true,
  ui30AtomicSendSortMigration: true
};
const listeners = {};
const clone = value => value === undefined ? undefined : structuredClone(value);
const pick = keys => {
  if (keys == null) return clone(data);
  if (typeof keys === 'string') return { [keys]: clone(data[keys]) };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, clone(data[key])]));
  return {};
};
globalThis.chrome = {
  storage: { local: { get: async keys => pick(keys), set: async patch => Object.assign(data, clone(patch)) } },
  sidePanel: { setPanelBehavior: async () => {} },
  alarms: { create: () => {}, onAlarm: { addListener: listener => { listeners.alarm = listener; } } },
  runtime: {
    getURL: path => `chrome-extension://test/${path}`,
    getContexts: async () => [],
    sendMessage: async () => ({ ok: true }),
    onInstalled: { addListener: listener => { listeners.installed = listener; } },
    onStartup: { addListener: listener => { listeners.startup = listener; } },
    onMessage: { addListener: listener => { listeners.message = listener; } }
  },
  tabs: {
    query: async () => [{ id: 1, url: 'https://www.zhipin.com/web/geek/job', status: 'complete', title: 'BOSS' }],
    sendMessage: async (tabId, message) => message.type === 'PROBE'
      ? { ok: true, contentVersion: '1.2.37', contentFile: 'content-v37.js', pageType: 'jobs' }
      : { ok: true },
    reload: async () => {},
    get: async () => ({ id: 1, url: 'https://www.zhipin.com/web/geek/job', status: 'complete' }),
    onUpdated: { addListener: () => {}, removeListener: () => {} }
  },
  scripting: { executeScript: async () => [] },
  notifications: { create: async () => {} },
  debugger: { attach: async () => {}, detach: async () => {}, sendCommand: async () => ({}) },
  offscreen: { createDocument: async () => {} }
};
await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?ui30=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 30));

const sendMessage = message => new Promise((resolve, reject) => {
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) reject(new Error(`message timeout: ${message.type}`));
  }, 2000);
  listeners.message(message, { tab: { id: 1, url: 'https://www.zhipin.com/web/geek/job' } }, response => {
    settled = true;
    clearTimeout(timeout);
    resolve(response);
  });
});

await sendMessage({
  type: 'PENDING',
  item: {
    job: { title: '普通前端实习生', company: 'A公司', salary: '2-3K', cardText: '3天前' },
    analysis: { score: 78, decision: 'recommend', hardBlocks: [], gaps: ['Vue'], risks: [], greeting: '您好，我想应聘贵公司的普通前端实习生岗位。' },
    task: {}
  }
});
await sendMessage({
  type: 'PENDING',
  item: {
    job: { title: '高匹配前端实习生', company: 'B公司', salary: '300-400元/天', cardText: '刚刚发布' },
    analysis: { score: 92, decision: 'recommend', hardBlocks: [], gaps: [], risks: [], greeting: '您好，我想应聘贵公司的高匹配前端实习生岗位。' },
    task: {}
  }
});
if (data.pending[0]?.job?.company !== 'B公司') throw new Error('higher-priority job was not automatically moved to queue front');
if (!(Number(data.pending[0]?.priorityScore) > Number(data.pending[1]?.priorityScore))) throw new Error('priority score ordering invalid');
const dispatch = await sendMessage({ type: 'AUTO_DISPATCH_NEXT' });
if (!dispatch?.started) throw new Error('auto dispatch did not start');
if (data.workflow.pendingApplyId !== data.pending.find(item => item.job?.company === 'B公司')?.id) {
  throw new Error('auto dispatch did not choose highest-priority job');
}

console.log(JSON.stringify({
  ok: true,
  chatWrite: 'CLIPBOARD_MAIN_CDP_ATOMIC',
  ranking: 'AI_HARD_SALARY_FRESHNESS',
  runtimeRanking: 'HIGHER_PRIORITY_MOVED_FIRST',
  contentFile: 'content-v37.js'
}, null, 2));
