const data = {};
const listeners = {};
let receiverReady = false;
let injectionCount = 0;
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
    query: async () => [{ id: 42, active: true, url: 'https://www.zhipin.com/web/geek/job', title: 'BOSS直聘' }],
    sendMessage: async (_id, message) => {
      if (!receiverReady) throw new Error('Could not establish connection. Receiving end does not exist.');
      if (message.type === 'PROBE') return { ok: true, contentVersion: '1.3.0', contentFile: 'content-v37.js', pageType: 'jobs' };
      if (message.type === 'RUN') { runCount += 1; return { ok: true }; }
      return { ok: true };
    }
  },
  scripting: {
    executeScript: async ({ target, files }) => {
      if (target.tabId !== 42 || !files.includes('content-v37.js')) throw new Error('wrong injection');
      injectionCount += 1;
      receiverReady = true;
      return [{ result: true }];
    }
  },
  notifications: { create: async () => {} }
};
await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?receiver=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 20));
data.profile = {
  primaryDirections: [{ name: '前端开发实习生' }],
  searchKeywords: ['前端开发实习生'],
  hardConstraints: { locations: ['成都'], employmentTypes: ['实习'], experience: '在校/应届', degree: '本科', salary: '不限' }
};
data.directionPlan = { version: 1, confirmed: true, items: [{ id: 'direction_test', name: '前端开发实习生', enabled: true, priority: 1, score: 90, keywords: ['前端开发实习生'], source: 'profile' }] };
data.config = { targetLocations: ['成都'], employmentTypes: ['实习'], experiences: ['在校/应届'], degrees: ['本科'], salary: '不限' };
async function request(type) {
  return new Promise((resolve, reject) => {
    const keepOpen = listeners.message({ type }, {}, resolve);
    if (!keepOpen) reject(new Error(`listener closed: ${type}`));
    setTimeout(() => reject(new Error(`timeout: ${type}`)), 5000);
  });
}
const result = await request('START');
if (!result.ok) throw new Error(result.error || 'START failed');
if (injectionCount !== 1) throw new Error(`expected one injection, got ${injectionCount}`);
if (runCount !== 1) throw new Error(`expected one RUN, got ${runCount}`);
if (!data.workflow?.running || data.workflow?.paused) throw new Error('workflow did not start');
console.log(JSON.stringify({ ok: true, autoInjection: 'PASS', retryDelivery: 'PASS', workflowState: 'PASS' }, null, 2));
