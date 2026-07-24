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

if (!/^1\.2\.(?:1[0-9]|[2-9][0-9])$/.test(manifest.version)) throw new Error(`版本错误：${manifest.version}`);
if (!common.includes('discoveryLimit: 0')) throw new Error('默认采集配置不是无限制');
if (!common.includes('aiLimit: 0')) throw new Error('仍存在隐藏 AI 数量上限默认值');
if (!common.includes("model: 'deepseek-v4-pro'")) throw new Error('默认模型不是 deepseek-v4-pro');
if (html.includes('id="discoveryLimit"')) throw new Error('设置页仍暴露采集上限输入框');
for (const token of ['岗位采集数量', '不设置采集上限', 'deepseek-v4-pro', 'deepseek-v4-flash']) {
  if (!html.includes(token)) throw new Error(`设置页缺少：${token}`);
}
if (sidepanel.includes("$('discoveryLimit')")) throw new Error('sidepanel 仍读取采集上限输入框');
if (!sidepanel.includes('discoveryLimit: 0')) throw new Error('保存设置时没有固定无限制');
if (content.includes('activeConfig.discoveryLimit') || content.includes('达到岗位采集上限')) throw new Error('执行链路仍存在采集停止上限');
if (content.includes('.slice(-1200)')) throw new Error('已处理岗位键仍被 1200 条截断');
if (background.includes('.slice(0, 500)')) throw new Error('待确认岗位仍被 500 条截断');
for (const token of ['ui10UnlimitedV4Migration', "model.model || 'deepseek-v4-pro'", 'incoming.discoveryLimit = 0']) {
  if (!background.includes(token)) throw new Error(`迁移/保存逻辑缺少：${token}`);
}

// 验证旧版 DeepSeek 配置会自动迁移，不要求用户重新填写 API Key。
const data = {
  config: {
    executionMode: 'review',
    discoveryLimit: 160,
    dailyTarget: 150,
    model: {
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'preserve-me',
      model: 'deepseek-chat',
      temperature: 0.1
    }
  },
  ui9ModeMigration: true
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
    onInstalled: { addListener: listener => { listeners.installed = listener; } },
    onStartup: { addListener: listener => { listeners.startup = listener; } },
    onMessage: { addListener: listener => { listeners.message = listener; } }
  },
  tabs: { query: async () => [] },
  scripting: { executeScript: async () => [] },
  notifications: { create: async () => {} }
};
await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?ui10=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 30));
if (data.config.discoveryLimit !== 0) throw new Error(`旧采集上限未迁移为无限制：${data.config.discoveryLimit}`);
if (data.config.model.model !== 'deepseek-v4-pro') throw new Error(`旧模型未迁移到 V4 Pro：${data.config.model.model}`);
if (data.config.model.apiKey !== 'preserve-me') throw new Error('迁移时丢失了 API Key');

console.log(JSON.stringify({
  ok: true,
  collection: 'NO_HARD_LIMIT',
  queue: 'NO_500_ITEM_TRUNCATION',
  processedKeys: 'NO_1200_ITEM_TRUNCATION',
  defaultModel: 'deepseek-v4-pro',
  alternateModel: 'deepseek-v4-flash',
  legacyMigration: 'deepseek-chat -> deepseek-v4-pro',
  apiKeyPreserved: true
}, null, 2));
