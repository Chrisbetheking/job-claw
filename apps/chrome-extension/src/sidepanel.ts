import {
  generateGreeting,
  matchJob,
  parsePreferencePrompt,
  validateGreeting,
  type GreetingResult,
  type JobPosting,
  type MatchResult,
  type ResumeProfile,
  type ResumeProject
} from '@jobclaw/core';

interface JobRecord {
  id: string;
  job: JobPosting;
  match: MatchResult;
  greeting: string;
  status: '已保存' | '已填入';
  createdAt: string;
}

const DEFAULT_PROFILE: ResumeProfile = {
  id: 'default',
  name: '',
  headline: '',
  education: [],
  targetRoles: ['前端开发', '前端实习生'],
  targetLocations: [],
  skills: [],
  projects: [],
  excludedKeywords: ['外包', '驻场', '销售'],
  maxRequiredExperienceYears: 1,
  greetingStyle: '简洁'
};

let profile: ResumeProfile = DEFAULT_PROFILE;
let currentJob: JobPosting | null = null;
let currentMatch: MatchResult | null = null;
let greetingResult: GreetingResult | null = null;

function element<T extends HTMLElement>(id: string): T {
  const target = document.getElementById(id);
  if (!target) throw new Error(`缺少元素：${id}`);
  return target as T;
}

function lines(value: string): string[] {
  return [...new Set(value.split(/[\n,，、;；]+/).map((item) => item.trim()).filter(Boolean))];
}

function parseProjects(value: string): ResumeProject[] {
  return value.split('\n').map((line, index) => {
    const [name = '', fact = '', keywords = ''] = line.split(/[|｜]/).map((item) => item.trim());
    return {
      id: `project-${index + 1}`,
      name,
      facts: fact ? [fact] : [],
      keywords: lines(keywords)
    };
  }).filter((project) => project.name && project.facts.length > 0);
}

function projectText(projects: ResumeProject[]): string {
  return projects.map((project) => `${project.name}｜${project.facts.join('；')}｜${project.keywords.join(',')}`).join('\n');
}

function setStatus(text: string, tone: 'info' | 'success' | 'warning' | 'danger' = 'info'): void {
  const status = element<HTMLDivElement>('status');
  status.className = `status ${tone}`;
  status.textContent = text;
}

interface BrowserTab { id?: number; url?: string; }

async function activeTab(): Promise<BrowserTab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }) as BrowserTab[];
  return tabs[0] ?? null;
}

async function sendToPage<T>(message: unknown): Promise<T> {
  const tab = await activeTab();
  if (!tab?.id || !tab.url?.startsWith('https://www.zhipin.com/')) {
    throw new Error('当前不是 BOSS 直聘页面，请先打开岗位详情页。');
  }
  return chrome.tabs.sendMessage(tab.id, message) as Promise<T>;
}

async function loadProfile(): Promise<void> {
  const stored = await chrome.storage.local.get(['jobclawProfile']);
  profile = { ...DEFAULT_PROFILE, ...(stored.jobclawProfile as Partial<ResumeProfile> | undefined) };
  renderProfile();
}

function renderProfile(): void {
  element<HTMLInputElement>('profileName').value = profile.name;
  element<HTMLTextAreaElement>('profileHeadline').value = profile.headline;
  element<HTMLTextAreaElement>('profileEducation').value = profile.education.join('\n');
  element<HTMLTextAreaElement>('profileRoles').value = profile.targetRoles.join('\n');
  element<HTMLTextAreaElement>('profileLocations').value = profile.targetLocations.join('\n');
  element<HTMLTextAreaElement>('profileSkills').value = profile.skills.join('\n');
  element<HTMLTextAreaElement>('profileProjects').value = projectText(profile.projects);
  element<HTMLTextAreaElement>('profileExcluded').value = profile.excludedKeywords.join('\n');
  element<HTMLInputElement>('profileExperience').value = String(profile.maxRequiredExperienceYears);
  element<HTMLSelectElement>('profileStyle').value = profile.greetingStyle;
}

function readProfileForm(): ResumeProfile {
  return {
    id: 'default',
    name: element<HTMLInputElement>('profileName').value.trim(),
    headline: element<HTMLTextAreaElement>('profileHeadline').value.trim(),
    education: lines(element<HTMLTextAreaElement>('profileEducation').value),
    targetRoles: lines(element<HTMLTextAreaElement>('profileRoles').value),
    targetLocations: lines(element<HTMLTextAreaElement>('profileLocations').value),
    skills: lines(element<HTMLTextAreaElement>('profileSkills').value),
    projects: parseProjects(element<HTMLTextAreaElement>('profileProjects').value),
    excludedKeywords: lines(element<HTMLTextAreaElement>('profileExcluded').value),
    maxRequiredExperienceYears: Number(element<HTMLInputElement>('profileExperience').value || 0),
    greetingStyle: element<HTMLSelectElement>('profileStyle').value as ResumeProfile['greetingStyle']
  };
}

function renderAnalysis(): void {
  if (!currentJob || !currentMatch || !greetingResult) return;
  element<HTMLElement>('jobCard').classList.remove('hidden');
  element<HTMLElement>('greetingCard').classList.remove('hidden');
  element<HTMLButtonElement>('saveJob').disabled = false;
  element<HTMLElement>('jobTitle').textContent = currentJob.title || '未识别到岗位名称';
  element<HTMLElement>('matchScore').textContent = String(currentMatch.score);
  element<HTMLElement>('jobMeta').innerHTML = [
    currentJob.company || '公司未知',
    currentJob.salary || '薪资未知',
    currentJob.location || '地点未知',
    currentJob.experience || '经验要求未知',
    currentJob.education || '学历要求未知'
  ].map((item) => `<span>${escapeHtml(item)}</span>`).join('');

  const block = element<HTMLElement>('blockNotice');
  if (currentMatch.blocked) {
    block.classList.remove('hidden');
    block.textContent = `不建议投递：${currentMatch.blockReasons.join('；')}`;
  } else {
    block.classList.add('hidden');
  }

  element<HTMLElement>('dimensions').innerHTML = currentMatch.dimensions.map((item) => `
    <div class="dimension">
      <div class="dimension-head"><span>${escapeHtml(item.label)}</span><span>${item.score}/${item.maxScore}</span></div>
      <div class="progress"><span style="width:${Math.round(item.score / item.maxScore * 100)}%"></span></div>
      <ul class="dimension-reasons">${item.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
    </div>
  `).join('');

  element<HTMLTextAreaElement>('greetingText').value = greetingResult.text;
  renderClaimChecks(greetingResult);
}

function renderClaimChecks(result: GreetingResult): void {
  greetingResult = result;
  const badge = element<HTMLElement>('greetingSafe');
  badge.textContent = result.safe ? '校验通过' : '禁止填入';
  badge.style.background = result.safe ? '#ecfdf3' : '#fef3f2';
  badge.style.color = result.safe ? '#027a48' : '#b42318';
  element<HTMLButtonElement>('fillGreeting').disabled = !result.safe || Boolean(currentMatch?.blocked);
  element<HTMLElement>('claimChecks').innerHTML = result.checks.map((check) => `
    <div class="claim ${check.status}">
      <strong>${escapeHtml(check.text)}</strong>：${escapeHtml(check.reason)}
      ${check.evidence.length ? `<div>证据：${escapeHtml(check.evidence.join('；'))}</div>` : ''}
    </div>
  `).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char] ?? char));
}

async function analyzeCurrentJob(): Promise<void> {
  setStatus('正在读取当前页面……');
  try {
    const response = await sendToPage<{
      ok: boolean;
      job: JobPosting;
      security: { blocked: boolean; reason: string };
    }>({ type: 'JOBCLAW_GET_JOB' });

    if (response.security.blocked) {
      setStatus(`已停止：${response.security.reason}。请人工完成平台验证后再继续。`, 'danger');
      return;
    }

    currentJob = response.job;
    if (!currentJob.title && !currentJob.description) {
      setStatus('没有识别到岗位详情。请确认当前已打开具体岗位，而不是首页或空白搜索页。', 'warning');
      return;
    }

    currentMatch = matchJob(currentJob, profile);
    greetingResult = generateGreeting(currentJob, profile, currentMatch);
    renderAnalysis();
    setStatus(currentMatch.blocked ? '分析完成，但该岗位命中排除规则。' : '岗位分析完成。', currentMatch.blocked ? 'warning' : 'success');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '读取岗位失败。', 'danger');
  }
}

async function getRecords(): Promise<JobRecord[]> {
  const stored = await chrome.storage.local.get(['jobclawRecords']);
  return (stored.jobclawRecords as JobRecord[] | undefined) ?? [];
}

async function saveRecord(status: JobRecord['status']): Promise<void> {
  if (!currentJob || !currentMatch) return;
  const records = await getRecords();
  const id = btoa(unescape(encodeURIComponent(`${currentJob.url}|${currentJob.title}|${currentJob.company}`))).slice(0, 48);
  const record: JobRecord = {
    id,
    job: currentJob,
    match: currentMatch,
    greeting: element<HTMLTextAreaElement>('greetingText').value,
    status,
    createdAt: new Date().toISOString()
  };
  const next = [record, ...records.filter((item) => item.id !== id)].slice(0, 500);
  await chrome.storage.local.set({ jobclawRecords: next });
  await renderRecords();
}

async function renderRecords(): Promise<void> {
  const records = await getRecords();
  const list = element<HTMLElement>('recordList');
  if (!records.length) {
    list.innerHTML = '<div class="empty">暂时没有岗位记录。</div>';
    return;
  }
  list.innerHTML = records.map((record) => `
    <article class="record">
      <div class="record-title"><span>${escapeHtml(record.job.title || '未知岗位')}</span><span>${record.match.score}分</span></div>
      <div class="record-meta">
        ${escapeHtml(record.job.company || '公司未知')} · ${escapeHtml(record.job.location || '地点未知')} · ${escapeHtml(record.status)}<br />
        ${new Date(record.createdAt).toLocaleString('zh-CN')}
      </div>
    </article>
  `).join('');
}

function setupTabs(): void {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      element<HTMLElement>(`tab-${button.dataset.tab}`).classList.add('active');
    });
  });
}

function bindEvents(): void {
  element<HTMLButtonElement>('refreshJob').addEventListener('click', () => void analyzeCurrentJob());
  element<HTMLButtonElement>('saveJob').addEventListener('click', async () => {
    await saveRecord('已保存');
    setStatus('岗位已保存到本地记录。', 'success');
  });

  element<HTMLButtonElement>('applyPrompt').addEventListener('click', async () => {
    const prompt = element<HTMLTextAreaElement>('agentPrompt').value.trim();
    const patch = parsePreferencePrompt(prompt);
    profile = {
      ...profile,
      targetRoles: patch.targetRoles.length ? patch.targetRoles : profile.targetRoles,
      targetLocations: patch.targetLocations.length ? patch.targetLocations : profile.targetLocations,
      excludedKeywords: [...new Set([...profile.excludedKeywords, ...patch.excludedKeywords])]
    };
    await chrome.storage.local.set({ jobclawProfile: profile });
    renderProfile();
    setStatus(`已应用：岗位方向 ${profile.targetRoles.join('、') || '未设置'}；地区 ${profile.targetLocations.join('、') || '不限'}；排除 ${profile.excludedKeywords.join('、') || '无'}。`, 'success');
    if (currentJob) await analyzeCurrentJob();
  });

  element<HTMLFormElement>('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    profile = readProfileForm();
    await chrome.storage.local.set({ jobclawProfile: profile });
    const target = element<HTMLElement>('profileStatus');
    target.className = 'status success';
    target.textContent = '事实库已保存到浏览器本地。';
    if (currentJob) await analyzeCurrentJob();
  });

  element<HTMLButtonElement>('recheckGreeting').addEventListener('click', () => {
    renderClaimChecks(validateGreeting(element<HTMLTextAreaElement>('greetingText').value, profile));
  });

  element<HTMLTextAreaElement>('greetingText').addEventListener('input', () => {
    renderClaimChecks(validateGreeting(element<HTMLTextAreaElement>('greetingText').value, profile));
  });

  element<HTMLButtonElement>('fillGreeting').addEventListener('click', async () => {
    const text = element<HTMLTextAreaElement>('greetingText').value.trim();
    const checked = validateGreeting(text, profile);
    renderClaimChecks(checked);
    if (!checked.safe) {
      setStatus('招呼语包含无事实支持的高风险表达，已阻止填入。', 'danger');
      return;
    }
    try {
      const response = await sendToPage<{ ok: boolean; message: string }>({
        type: 'JOBCLAW_FILL_GREETING',
        payload: { text }
      });
      setStatus(response.message, response.ok ? 'success' : 'danger');
      if (response.ok) await saveRecord('已填入');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '填入失败。', 'danger');
    }
  });

  element<HTMLButtonElement>('exportRecords').addEventListener('click', async () => {
    const records = await getRecords();
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `jobclaw-records-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  element<HTMLButtonElement>('clearRecords').addEventListener('click', async () => {
    const confirmed = confirm('确定清空全部本地岗位记录吗？此操作不可恢复。');
    if (!confirmed) return;
    await chrome.storage.local.remove('jobclawRecords');
    await renderRecords();
  });
}

async function bootstrap(): Promise<void> {
  setupTabs();
  bindEvents();
  await loadProfile();
  await renderRecords();
}

void bootstrap();
