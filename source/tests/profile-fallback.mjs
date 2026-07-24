const data = {};
const listeners = {};
function clone(value) { return value === undefined ? undefined : structuredClone(value); }
function pick(keys) {
  if (keys == null) return clone(data);
  if (typeof keys === 'string') return { [keys]: clone(data[keys]) };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, clone(data[key])]));
  if (typeof keys === 'object') return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, data[key] === undefined ? fallback : clone(data[key])]));
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
  tabs: { query: async () => [], sendMessage: async () => ({}) },
  notifications: { create: async () => {} }
};
await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?test=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 20));
data.resumeText = `王鸿\n计算机科学本科在读，2027 年毕业\n求职意向：前端开发实习生\n具备 React、TypeScript、Tauri 桌面端、AI Agent、RAG、OCR 与 ECharts 项目经验。\n项目：独立维护 Chris Studio，覆盖模型路由、Coding Agent、Computer Use 与 macOS 开发。\n英语六级`;
async function request(type) {
  return await new Promise((resolve, reject) => {
    const keepOpen = listeners.message({ type }, {}, resolve);
    if (!keepOpen) reject(new Error(`消息监听器未保持异步响应：${type}`));
    setTimeout(() => reject(new Error(`消息响应超时：${type}`)), 5000);
  });
}
const local = await request('BUILD_LOCAL_PROFILE');
if (!local.ok) throw new Error(local.error || '本地画像生成失败');
for (const [name, value] of Object.entries({
  summary: local.profile?.summary,
  primaryDirections: local.profile?.primaryDirections?.length,
  searchKeywords: local.profile?.searchKeywords?.length,
  skills: local.profile?.facts?.skills?.length,
  degree: local.profile?.hardConstraints?.degree,
  employmentTypes: local.profile?.hardConstraints?.employmentTypes?.length
})) {
  if (!value) throw new Error(`本地画像字段为空：${name}`);
}
if (local.profile.generation?.mode !== 'local-recovery') throw new Error('自动恢复画像来源标记错误');
data.profile = null;
const fallback = await request('BUILD_PROFILE');
if (!fallback.ok) throw new Error(fallback.error || 'AI 失败兜底生成失败');
if (fallback.profile?.generation?.mode !== 'local-fallback') throw new Error('无 API Key 时没有进入本地兜底');
if (!fallback.profile?.primaryDirections?.length || !fallback.profile?.searchKeywords?.length) throw new Error('兜底画像核心字段为空');
console.log(JSON.stringify({
  ok: true,
  autoRecovery: 'PASS',
  aiEmptyFallback: 'PASS',
  editableFieldsPrefilled: 'PASS',
  directions: fallback.profile.primaryDirections.map(item => item.name),
  keywords: fallback.profile.searchKeywords,
  skills: fallback.profile.facts.skills
}, null, 2));
