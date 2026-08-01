const data = {
  config: {
    model: {
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'test-key',
      model: 'deepseek-v4-flash'
    }
  },
  resumeText: `王鸿\n计算机科学本科在读，2027 年毕业\n求职方向：前端开发实习生、AI 应用开发实习生\n具备 React、TypeScript、Tauri、AI Agent、RAG、OCR 与 ECharts 项目经验。\n项目：独立维护桌面端 AI 工具并参与前端实习。`
};
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

let phase = 'retry-success';
let requestCount = 0;
let modelRequestCount = 0;
globalThis.fetch = async (_url, options = {}) => {
  requestCount += 1;
  const payload = options.body ? JSON.parse(options.body) : {};
  if (Array.isArray(payload.messages)) modelRequestCount += 1;
  if (phase === 'service-error') {
    return new Response(JSON.stringify({ error: { message: 'temporary outage' } }), { status: 503 });
  }
  if (modelRequestCount === 1) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"summary":"partial"' }, finish_reason: 'length' }]
    }), { status: 200 });
  }
  return new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: '计算机科学本科在读，具备 React、TypeScript、Tauri 与 AI Agent 项目经验，求职前端和 AI 应用开发实习岗位。',
          primaryDirections: ['前端开发实习生', 'AI 应用开发实习生'],
          searchKeywords: ['前端开发实习生', 'React 开发实习生', 'AI 应用开发实习生'],
          skills: ['React', 'TypeScript', 'Tauri', 'AI Agent', 'RAG'],
          locations: ['成都'],
          employmentTypes: ['实习'],
          salary: '不限',
          experience: '在校/应届',
          degree: '本科',
          excludeDirections: []
        })
      },
      finish_reason: 'stop'
    }]
  }), { status: 200 });
};

await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?test=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 20));
async function request(type) {
  return await new Promise((resolve, reject) => {
    const keepOpen = listeners.message({ type }, {}, resolve);
    if (!keepOpen) reject(new Error(`消息监听器未保持异步响应：${type}`));
    setTimeout(() => reject(new Error(`消息响应超时：${type}`)), 8000);
  });
}

const retry = await request('BUILD_PROFILE');
if (!retry.ok) throw new Error(retry.error || '精简重试失败');
if (retry.generation?.mode !== 'ai-compact-retry') throw new Error(`未采用 AI 精简重试结果：${retry.generation?.mode}`);
if (retry.generation?.aiStatus !== 'success-after-retry') throw new Error('AI 重试状态标记错误');
if (!retry.profile?.primaryDirections?.length || !retry.profile?.searchKeywords?.length) throw new Error('AI 精简重试核心字段为空');
if (modelRequestCount !== 2) throw new Error(`AI 模型请求次数应为 2，实际 ${modelRequestCount}`);

phase = 'service-error';
requestCount = 0;
modelRequestCount = 0;
const fallback = await request('BUILD_PROFILE');
if (!fallback.ok) throw new Error(fallback.error || '服务错误兜底失败');
if (fallback.generation?.mode !== 'local-fallback') throw new Error('服务错误没有进入本地兜底');
if (fallback.generation?.aiStatus !== 'service-error') throw new Error(`服务错误被误分类：${fallback.generation?.aiStatus}`);
if (/连接正常/.test(fallback.generation?.warning || '')) throw new Error('服务错误提示被误写为连接正常');

console.log(JSON.stringify({
  ok: true,
  truncatedOutputRetry: 'PASS',
  compactAiResultApplied: 'PASS',
  serviceFailureClassification: 'PASS'
}, null, 2));
