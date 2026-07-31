const data = {
  bossContentRuntimeVersion: '1.7.0',
  profile: {
    primaryDirections: [{ name: '前端开发实习生' }],
    searchKeywords: ['前端开发实习生'],
    hardConstraints: { locations: ['成都'], employmentTypes: ['实习'], experience: '在校/应届', degree: '本科', salary: '不限' }
  },
directionPlan: {
    version: 1,
    confirmed: true,
    items: [{ id: 'direction_test', name: '前端开发实习生', enabled: true, priority: 1, score: 90, keywords: ['前端开发实习生'], source: 'profile' }]
  },
  config: { targetLocations: ['成都'], employmentTypes: ['实习'], experiences: ['在校/应届'], degrees: ['本科'], salary: '不限', dailyTarget: 150 }
};
const listeners = {};
let reloaded = false;
let reloadCount = 0;
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
    query: async () => [{ id: 77, active: true, status: 'complete', url: 'https://www.zhipin.com/web/geek/job', title: 'BOSS直聘' }],
    get: async () => ({ id: 77, active: true, status: 'complete', url: 'https://www.zhipin.com/web/geek/job', title: 'BOSS直聘' }),
    reload: async id => { if (id !== 77) throw new Error('wrong tab'); reloaded = true; reloadCount += 1; },
    sendMessage: async (_id, message) => {
      if (message.type === 'PROBE') {
        return reloaded
          ? { ok: true, contentVersion: '1.7.0', contentFile: 'content-v37.js', pageType: 'jobs' }
          : { ok: true, pageType: 'jobs' }; // legacy UI16 receiver
      }
      if (message.type === 'RUN') { runCount += 1; return { ok: true, contentVersion: '1.7.0' }; }
      return { ok: true };
    }
  },
  scripting: { executeScript: async () => { throw new Error('stale receiver should be fixed by reload, not overlay injection'); } },
  notifications: { create: async () => {} }
};
await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?stale=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 20));
async function request(type) {
  return new Promise((resolve, reject) => {
    const keepOpen = listeners.message({ type }, {}, resolve);
    if (!keepOpen) reject(new Error(`listener closed: ${type}`));
    setTimeout(() => reject(new Error(`timeout: ${type}`)), 5000);
  });
}
const result = await request('START');
if (!result.ok) throw new Error(result.error || 'START failed');
if (reloadCount !== 1) throw new Error(`expected stale tab reload once, got ${reloadCount}`);
if (runCount !== 1) throw new Error(`expected RUN after refresh, got ${runCount}`);
console.log(JSON.stringify({ ok: true, legacyReceiverDetected: 'PASS', fullTabReload: 'PASS', overlayInjectionAvoided: 'PASS', runAfterVersionHandshake: 'PASS' }, null, 2));
