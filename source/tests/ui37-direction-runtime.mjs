const data = {
  profile: {
    summary: '前端与 AI 应用开发方向',
    primaryDirections: [
      { name: '前端开发实习生', confidence: 0.94, evidence: ['React 项目'] },
      { name: 'AI应用开发实习生', confidence: 0.88, evidence: ['RAG 与 AI Agent 项目'] },
      { name: '全栈开发实习生', confidence: 0.79, evidence: ['Node.js 项目'] },
      { name: '开发者工具实习生', confidence: 0.72, evidence: ['Tauri 桌面端'] }
    ],
    searchKeywords: ['前端开发', 'React开发', 'AI应用开发', 'RAG应用开发', '无关岗位'],
    facts: { skills: ['React', 'TypeScript', 'Tauri', 'RAG', 'AI Agent'] },
    hardConstraints: { locations: ['成都'], employmentTypes: ['实习'], experience: '在校/应届', degree: '本科', salary: '不限' }
  },
  profileDraft: {
    summary: '前端与 AI 应用开发方向',
    primaryDirections: ['前端开发实习生', 'AI应用开发实习生', '全栈开发实习生'],
    searchKeywords: ['前端开发', 'AI应用开发'],
    skills: ['React', 'TypeScript', 'Tauri', 'RAG', 'AI Agent'],
    locations: ['成都'], employmentTypes: ['实习'], experience: '在校/应届', degree: '本科', salary: '不限', excludeDirections: []
  },
  resumeText: '本科在读，具备 React、TypeScript、Tauri、RAG 和 AI Agent 项目经验。',
  config: {
    executionMode: 'review', dailyTarget: 150, minScore: 75,
    targetLocations: ['成都'], employmentTypes: ['实习'], experiences: ['在校/应届'], degrees: ['本科'], salary: '不限',
    discoveryLimit: 0, sendResumeImage: false, sendOnlineResume: false, betweenJobsSeconds: 12, attachmentDelaySeconds: 4,
    model: { baseUrl: 'https://api.deepseek.com', apiKey: 'x', model: 'deepseek-v4-pro', temperature: 0.1 }
  },
  workflow: { running: false, paused: true, phase: 'idle', tasks: [], taskIndex: 0, cardIndex: 0, processedKeys: [], retries: 0, currentJob: null, pendingApplyId: null, activeRunId: null },
  pending: [], taskRuns: [], events: [],
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
    query: async () => [{ id: 1, active: true, status: 'complete', url: 'https://www.zhipin.com/web/geek/job', title: 'BOSS' }],
    get: async () => ({ id: 1, active: true, status: 'complete', url: 'https://www.zhipin.com/web/geek/job', title: 'BOSS' }),
    sendMessage: async (_id, message) => message.type === 'PROBE'
      ? { ok: true, contentVersion: '1.2.37', contentFile: 'content-v37.js', pageType: 'jobs' }
      : { ok: true },
    reload: async () => {},
    onUpdated: { addListener: () => {}, removeListener: () => {} }
  },
  scripting: { executeScript: async () => [] },
  notifications: { create: async () => {} },
  debugger: { attach: async () => {}, detach: async () => {}, sendCommand: async () => ({}) },
  offscreen: { createDocument: async () => {} }
};

await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?ui37runtime=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 60));

const request = message => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`timeout: ${message.type}`)), 4000);
  const keepOpen = listeners.message(message, {}, response => {
    clearTimeout(timeout);
    resolve(response);
  });
  if (!keepOpen) {
    clearTimeout(timeout);
    reject(new Error(`listener closed: ${message.type}`));
  }
});

if (!data.directionPlan?.items?.length) throw new Error('migration did not generate direction recommendations');
if (data.directionPlan.confirmed) throw new Error('migrated plan must require user confirmation');
if (data.directionPlan.items.filter(item => item.enabled).length !== 3) throw new Error('top three directions should be enabled by default');

const blockedStart = await request({ type: 'START' });
if (blockedStart.ok || !/选择.*岗位方向/.test(blockedStart.error || '')) throw new Error('unconfirmed direction plan did not block START');

const aiDirection = data.directionPlan.items.find(item => /AI应用/.test(item.name));
if (!aiDirection) throw new Error('AI direction recommendation missing');
const editedPlan = structuredClone(data.directionPlan);
for (const item of editedPlan.items) item.enabled = item.id === aiDirection.id;
const selected = editedPlan.items.find(item => item.id === aiDirection.id);
selected.name = 'AI 应用开发实习生';
selected.keywords = ['AI应用开发实习生', 'RAG应用开发实习生'];
selected.priority = 1;

const saved = await request({ type: 'SAVE_DIRECTION_PLAN', directionPlan: editedPlan });
if (!saved.ok || saved.selectedCount !== 1) throw new Error(saved.error || 'direction plan save failed');
if (!data.directionPlan.confirmed) throw new Error('saved direction plan not confirmed');

const started = await request({ type: 'START' });
if (!started.ok) throw new Error(started.error || 'START failed after direction confirmation');
if (!data.workflow.tasks.length) throw new Error('no search tasks created');
if (data.workflow.tasks.some(task => task.directionId !== aiDirection.id || task.directionName !== 'AI 应用开发实习生')) {
  throw new Error('tasks include unselected direction');
}
const keywords = new Set(data.workflow.tasks.map(task => task.keyword));
if (!keywords.has('AI应用开发实习生') || !keywords.has('RAG应用开发实习生')) throw new Error('selected keywords missing from tasks');
if (keywords.has('无关岗位') || keywords.has('前端开发')) throw new Error('unselected profile keywords leaked into tasks');

console.log(JSON.stringify({
  ok: true,
  migration: 'TOP_3_UNCONFIRMED',
  startGuard: 'CONFIRMATION_REQUIRED',
  selectedDirection: selected.name,
  taskKeywords: [...keywords],
  unselectedLeak: false
}, null, 2));
