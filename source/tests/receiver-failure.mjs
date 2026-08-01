const data = {};
const listeners = {};
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
    query: async () => [{ id: 52, active: true, url: 'https://www.zhipin.com/web/geek/job', title: 'BOSS直聘' }],
    sendMessage: async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); }
  },
  scripting: {
    executeScript: async () => { throw new Error('Cannot access contents of url "https://www.zhipin.com/web/geek/job".'); }
  },
  notifications: { create: async () => {} }
};
await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?failure=${Date.now()}`);
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
if (result.ok) throw new Error('START should fail');
if (/Could not establish|Receiving end|Cannot access contents/i.test(result.error || '')) throw new Error(`raw browser error leaked: ${result.error}`);
if (!/当前页面无法接入|BOSS 页面/.test(result.error || '')) throw new Error(`friendly error missing: ${result.error}`);
if (!result.autoRecovering) throw new Error('startup failure should enter automatic recovery');
if (!data.workflow?.running || !data.workflow?.paused || data.workflow?.phase !== 'auto_recovery') throw new Error('workflow automatic recovery state missing');
console.log(JSON.stringify({ ok: true, friendlyError: 'PASS', noRawEnglish: 'PASS', autoRecoveryScheduled: 'PASS' }, null, 2));
