import { readFile } from 'node:fs/promises';

const root = 'dist/chrome-extension';
const [html, sidepanel, background, content, common, manifest] = await Promise.all([
  readFile(`${root}/sidepanel.html`, 'utf8'),
  readFile(`${root}/sidepanel.js`, 'utf8'),
  readFile(`${root}/background.js`, 'utf8'),
  readFile(`${root}/content-v37.js`, 'utf8'),
  readFile(`${root}/common.js`, 'utf8'),
  readFile(`${root}/manifest.json`, 'utf8').then(JSON.parse)
]);

if (manifest.version !== '2.1.0') throw new Error(`版本错误：${manifest.version}`);
for (const token of ['discoveryLimit: 150', 'dailyTarget: 30', "batchStrategy: 'safe-mass'", "massApplyAnalysis: 'auto-ai'", 'maxPerCompanyPerDay: 3', 'maxConsecutiveFailures: 3']) {
  if (!common.includes(token)) throw new Error(`安全默认配置缺少：${token}`);
}
for (const token of ['id="discoveryLimit"', 'id="maxPerCompanyPerDay"', 'id="batchStrategy"', 'id="dryRun"', '安全调度与企业核验']) {
  if (!html.includes(token)) throw new Error(`设置页缺少：${token}`);
}
for (const token of ["$('discoveryLimit')", "$('maxPerCompanyPerDay')", "$('batchStrategy')", "$('dryRun')"]) {
  if (!sidepanel.includes(token)) throw new Error(`sidepanel 未接入：${token}`);
}
for (const token of ['activeConfig.discoveryLimit', "send('JOB_PREFLIGHT'", "waitForRateLimit('discovery'", "send('EVALUATE_STRATEGY'"]) {
  if (!content.includes(token)) throw new Error(`执行链路缺少：${token}`);
}
for (const token of ['v170SafetyIntelligenceMigration', 'enforceRateLimit', 'verifyCompanyForJob', 'preflightJob', 'checkForUpdates']) {
  if (!background.includes(token)) throw new Error(`1.7 后台能力缺少：${token}`);
}

const data = {
  config: {
    executionMode: 'review',
    discoveryLimit: 0,
    dailyTarget: 150,
    model: { baseUrl: 'https://api.deepseek.com', apiKey: 'preserve-me', model: 'deepseek-chat', temperature: 0.1 }
  },
  ui9ModeMigration: true
};
const listeners = {};
const clone = value => value === undefined ? undefined : structuredClone(value);
const pick = keys => {
  if (keys == null) return clone(data);
  if (typeof keys === 'string') return { [keys]: clone(data[keys]) };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, clone(data[key]) ]));
  return {};
};
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
globalThis.chrome = {
  storage: { local: { get: async keys => pick(keys), set: async patch => Object.assign(data, clone(patch)) } },
  sidePanel: { setPanelBehavior: async () => {} },
  alarms: { create: () => {}, onAlarm: { addListener: listener => { listeners.alarm = listener; } } },
  runtime: {
    getManifest: () => ({ version: '2.1.0' }),
    onInstalled: { addListener: listener => { listeners.installed = listener; } },
    onStartup: { addListener: listener => { listeners.startup = listener; } },
    onMessage: { addListener: listener => { listeners.message = listener; } }
  },
  tabs: { query: async () => [] },
  scripting: { executeScript: async () => [] },
  notifications: { create: async () => {} }
};
await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?ui10=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 50));
if (data.config.discoveryLimit !== 150) throw new Error(`旧无限采集配置未迁移为正式版上限：${data.config.discoveryLimit}`);
if (data.config.dailyTarget !== 150) throw new Error(`合法的旧150目标未被保留：${data.config.dailyTarget}`);
if (data.config.model.model !== 'deepseek-v4-flash') throw new Error(`旧模型未迁移到 V4 Flash：${data.config.model.model}`);
if (data.config.model.apiKey !== 'preserve-me') throw new Error('迁移时丢失了 API Key');

console.log(JSON.stringify({ ok: true, collectionLimit: 150, dailyTarget: 150, companyLimit: 3, safetyMigration: true }, null, 2));
