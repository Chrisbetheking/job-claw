const data = {
  resumeText: `王鸿\n计算机科学本科在读，2027 年毕业\n求职意向：前端开发实习生\nReact TypeScript Tauri RAG AI Agent OCR ECharts 项目经验`,
  profile: {
    summary: '本科在读，具备 React、TypeScript 项目经验，主要关注前端开发实习方向。',
    primaryDirections: [{ name: '前端开发实习生', confidence: 0.9, evidence: ['简历求职意向'] }],
    searchKeywords: ['前端开发实习生', 'React 开发'],
    excludeDirections: [],
    facts: { education: [], experiences: [], projects: [], skills: ['React', 'TypeScript'], certificates: [] },
    hardConstraints: { locations: ['成都'], employmentTypes: ['实习'], experience: '在校/应届', degree: '本科', salary: '不限' },
    generation: { mode: 'local-fallback', label: '本地初稿' }
  },
  profileDraft: null
};
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
  tabs: { query: async () => [], sendMessage: async () => ({}) },
  notifications: { create: async () => {} }
};
await import(new URL('../dist/chrome-extension/background.js', import.meta.url).href + `?test=${Date.now()}`);
await new Promise(resolve => setTimeout(resolve, 40));

if (!data.ui12ProfileDraftMigration) throw new Error('UI11 -> UI12 迁移标记缺失');
if (!data.profileDraft?.primaryDirections?.length || !data.profileDraft?.searchKeywords?.length) {
  throw new Error('旧版画像没有迁移成可编辑初稿');
}
if (data.profileDraft.summary !== data.profile.summary) throw new Error('迁移后摘要不一致');

async function request(type, extra = {}) {
  return await new Promise((resolve, reject) => {
    const keepOpen = listeners.message({ type, ...extra }, {}, resolve);
    if (!keepOpen) reject(new Error(`消息监听器未保持异步响应：${type}`));
    setTimeout(() => reject(new Error(`消息响应超时：${type}`)), 5000);
  });
}

const editedDraft = {
  ...data.profileDraft,
  summary: '用户手动修改后的定位摘要',
  primaryDirections: ['前端开发实习生', 'AI 应用开发实习生'],
  searchKeywords: ['前端开发', 'React 开发'],
  updatedAt: Date.now()
};
const savedDraft = await request('SAVE_PROFILE_DRAFT', { profileDraft: editedDraft });
if (!savedDraft.ok) throw new Error(savedDraft.error || '草稿自动保存失败');
if (data.profileDraft.summary !== '用户手动修改后的定位摘要') throw new Error('草稿修改未持久化');

// Simulate a new side-panel session: ensure must not rebuild or clear a user-edited draft.
const secondEnsure = await request('ENSURE_PROFILE_DRAFT');
if (!secondEnsure.ok) throw new Error(secondEnsure.error || '第二次恢复失败');
if (data.profileDraft.summary !== '用户手动修改后的定位摘要') throw new Error('重新打开后草稿被覆盖');
if (!data.profileDraft.primaryDirections.includes('AI 应用开发实习生')) throw new Error('重新打开后用户方向丢失');

const applied = await request('SAVE_PROFILE', {
  profile: {
    ...data.profile,
    summary: data.profileDraft.summary,
    primaryDirections: data.profileDraft.primaryDirections,
    searchKeywords: data.profileDraft.searchKeywords,
    facts: { ...(data.profile?.facts || {}), skills: data.profileDraft.skills || [] },
    hardConstraints: {
      ...(data.profile?.hardConstraints || {}),
      locations: data.profileDraft.locations || [],
      employmentTypes: data.profileDraft.employmentTypes || [],
      experience: data.profileDraft.experience || '',
      degree: data.profileDraft.degree || '',
      salary: data.profileDraft.salary || ''
    }
  }
});
if (!applied.ok) throw new Error(applied.error || '画像应用失败');
if (data.profileDraft.summary !== data.profile.summary) throw new Error('正式画像和草稿不同步');

// Remove both profile objects but keep the saved resume: the local self-healing path must repopulate both.
data.profile = null;
data.profileDraft = null;
const repaired = await request('ENSURE_PROFILE_DRAFT');
if (!repaired.ok) throw new Error(repaired.error || '简历自恢复失败');
if (!data.profile?.primaryDirections?.length || !data.profileDraft?.primaryDirections?.length) {
  throw new Error('简历自恢复没有同时写入正式画像和初稿');
}

console.log(JSON.stringify({
  ok: true,
  legacyProfileMigratedToDraft: true,
  profileDraftPersisted: true,
  userEditsSurviveReload: true,
  draftAndAppliedProfileSynced: true,
  resumeSelfHealing: true
}, null, 2));
