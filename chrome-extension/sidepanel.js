import { extractPdfText, isReadableResumeText } from './pdf-extractor.js';

const $ = id => document.getElementById(id);
const PROFILE_FORM_IDS = [
  'profileSummaryInput', 'profileDirectionsInput', 'profileKeywordsInput', 'profileSkillsInput',
  'profileLocationsInput', 'profileTypesInput', 'profileExperienceInput', 'profileDegreeInput',
  'profileSalaryInput', 'profileExcludeInput'
];
const SETTINGS_FORM_IDS = [
  'locations', 'types', 'experience', 'degree', 'salary', 'minScore',
  'dailyTarget', 'betweenJobsSeconds', 'attachmentDelaySeconds', 'sendImage', 'sendOnline', 'baseUrl', 'modelName', 'apiKey'
];
const FORM_IDS = new Set(['resumeText', ...PROFILE_FORM_IDS, ...SETTINGS_FORM_IDS]);
const dirtyFields = new Set();
let state = {};
let toastTimer = null;
let refreshing = false;
let activateMainPage = () => {};
let activateResumeView = () => {};
let currentResumeSource = null;
let profileDraftSaveTimer = null;
let directionPlanDraft = null;
let directionPlanDirty = false;

const csv = value => String(value || '')
  .split(/[，,\n]/)
  .map(item => item.trim())
  .filter(Boolean);

const displayValue = value => typeof value === 'string' ? value : (value?.name || value?.title || String(value || ''));
const names = values => (Array.isArray(values) ? values : []).map(displayValue).filter(Boolean);

function autoGrowTextarea(element) {
  if (!(element instanceof HTMLTextAreaElement) || !element.dataset.autogrow) return;
  const maxHeight = Math.max(72, Number(element.dataset.autogrowMax || 220));
  element.style.height = 'auto';
  const targetHeight = Math.min(Math.max(element.scrollHeight, 58), maxHeight);
  element.style.height = `${targetHeight}px`;
  element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function autoGrowProfileFields() {
  requestAnimationFrame(() => {
    for (const id of PROFILE_FORM_IDS) autoGrowTextarea($(id));
  });
}


function profileToFormDraft(profile) {
  const hard = profile?.hardConstraints || {};
  return {
    summary: String(profile?.summary || ''),
    primaryDirections: names(profile?.primaryDirections),
    searchKeywords: names(profile?.searchKeywords),
    skills: names(profile?.facts?.skills),
    locations: names(hard.locations),
    employmentTypes: names(hard.employmentTypes),
    experience: String(hard.experience || ''),
    degree: String(hard.degree || ''),
    salary: String(hard.salary || ''),
    excludeDirections: names(profile?.excludeDirections),
    source: 'profile'
  };
}

function effectiveProfileDraft() {
  const stored = state.profileDraft && typeof state.profileDraft === 'object' ? state.profileDraft : null;
  if (stored) return stored;
  return profileToFormDraft(state.profile || {});
}

function profileDraftReady(draft = effectiveProfileDraft()) {
  return Boolean(names(draft?.primaryDirections).length && names(draft?.searchKeywords).length);
}

function collectProfileDraft() {
  return {
    summary: $('profileSummaryInput')?.value.trim() || '',
    primaryDirections: csv($('profileDirectionsInput')?.value),
    searchKeywords: csv($('profileKeywordsInput')?.value),
    skills: csv($('profileSkillsInput')?.value),
    locations: csv($('profileLocationsInput')?.value),
    employmentTypes: csv($('profileTypesInput')?.value),
    experience: $('profileExperienceInput')?.value.trim() || '',
    degree: $('profileDegreeInput')?.value.trim() || '',
    salary: $('profileSalaryInput')?.value.trim() || '',
    excludeDirections: csv($('profileExcludeInput')?.value),
    source: 'autosave',
    updatedAt: Date.now()
  };
}


function cloneDirectionPlan(plan) {
  return plan && typeof plan === 'object' ? structuredClone(plan) : { version: 1, items: [], confirmed: false };
}

function effectiveDirectionPlan() {
  return directionPlanDirty && directionPlanDraft ? directionPlanDraft : (state.directionPlan || directionPlanDraft || null);
}

function selectedDirectionItems(plan = effectiveDirectionPlan()) {
  return (Array.isArray(plan?.items) ? plan.items : [])
    .filter(item => item?.enabled && String(item?.name || '').trim() && names(item?.keywords).length)
    .sort((left, right) => Number(left.priority || 99) - Number(right.priority || 99) || Number(right.score || 0) - Number(left.score || 0));
}

function directionPlanReady(plan = state.directionPlan) {
  return Boolean(plan?.confirmed && selectedDirectionItems(plan).length);
}

function markDirectionPlanDirty() {
  directionPlanDirty = true;
  if (directionPlanDraft) directionPlanDraft.confirmed = false;
  setText('directionPlanPill', '修改未保存');
  $('directionPlanPill')?.classList.add('accent');
  updateDirectionPlanSummary();
}

function updateDirectionPlanSummary() {
  const plan = effectiveDirectionPlan();
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const selected = selectedDirectionItems(plan);
  const keywordCount = new Set(selected.flatMap(item => names(item.keywords))).size;
  const summary = $('directionPlanSummary');
  if (!summary) return;
  if (!items.length) {
    summary.textContent = '尚未生成岗位方向推荐';
    summary.classList.remove('is-ready');
    return;
  }
  summary.textContent = selected.length
    ? `已选择 ${selected.length} 个方向 · ${keywordCount} 个搜索词${plan?.confirmed && !directionPlanDirty ? ' · 已应用' : ' · 待保存'}`
    : '至少勾选一个要投递的岗位方向';
  summary.classList.toggle('is-ready', Boolean(selected.length && plan?.confirmed && !directionPlanDirty));
  setText('directionPlanPill', plan?.confirmed && !directionPlanDirty ? `已选 ${selected.length}` : `待确认 ${selected.length}`);
  $('directionPlanPill')?.classList.toggle('accent', !plan?.confirmed || directionPlanDirty);
}

function createDirectionTags(values, tone = '') {
  const wrap = document.createElement('div');
  wrap.className = `direction-tags ${tone}`.trim();
  for (const value of names(values).slice(0, 6)) {
    const tag = document.createElement('span');
    tag.textContent = value;
    wrap.append(tag);
  }
  return wrap;
}

function renderDirectionPlan(force = false, preserveDraft = false) {
  const list = $('directionPlanList');
  const empty = $('directionPlanEmpty');
  const card = $('directionPlanCard');
  if (!list || !empty || !card) return;
  if (!force && directionPlanDirty) {
    updateDirectionPlanSummary();
    return;
  }

  if (!preserveDraft || !directionPlanDraft) {
    directionPlanDraft = cloneDirectionPlan(state.directionPlan);
    directionPlanDirty = false;
  }
  const items = Array.isArray(directionPlanDraft?.items) ? directionPlanDraft.items : [];
  list.replaceChildren();
  empty.hidden = items.length > 0;
  card.classList.toggle('has-directions', items.length > 0);

  if (!items.length) {
    setText('directionPlanPill', profileDraftReady() ? '可以生成' : '等待画像');
    setText('directionPlanCaption', profileDraftReady()
      ? '点击“重新生成推荐”，系统会根据职业画像给出岗位方向。'
      : '先生成职业画像，再选择具体要投递的岗位。');
    updateDirectionPlanSummary();
    return;
  }

  const sorted = [...items].sort((left, right) => Number(left.priority || 99) - Number(right.priority || 99) || Number(right.score || 0) - Number(left.score || 0));
  for (const item of sorted) {
    const index = directionPlanDraft.items.findIndex(entry => entry.id === item.id);
    const row = document.createElement('article');
    row.className = `direction-item${item.enabled ? '' : ' is-disabled'}`;
    row.dataset.directionId = item.id;

    const header = document.createElement('div');
    header.className = 'direction-item-header';
    const toggle = document.createElement('label');
    toggle.className = 'direction-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.enabled !== false;
    const switcher = document.createElement('span');
    switcher.className = 'direction-toggle-ui';
    toggle.append(checkbox, switcher);

    const nameInput = document.createElement('input');
    nameInput.className = 'direction-name-input';
    nameInput.type = 'text';
    nameInput.value = item.name || '';
    nameInput.placeholder = '填写岗位方向，例如：前端开发实习生';
    nameInput.maxLength = 60;

    const score = document.createElement('span');
    score.className = 'direction-score';
    score.textContent = `${Math.round(Number(item.score || 0))} 分`;
    header.append(toggle, nameInput, score);

    const reason = document.createElement('p');
    reason.className = 'direction-reason';
    reason.textContent = item.reason || '根据职业画像推荐，可继续人工调整。';

    const evidence = document.createElement('div');
    evidence.className = 'direction-evidence';
    if (names(item.matchedSkills).length) {
      const block = document.createElement('div');
      const label = document.createElement('b');
      label.textContent = '匹配技能';
      block.append(label, createDirectionTags(item.matchedSkills, 'matched'));
      evidence.append(block);
    }
    if (names(item.gaps).length) {
      const block = document.createElement('div');
      const label = document.createElement('b');
      label.textContent = '可能缺口';
      block.append(label, createDirectionTags(item.gaps, 'gaps'));
      evidence.append(block);
    }

    const keywordsField = document.createElement('label');
    keywordsField.className = 'direction-keywords-field';
    const keywordsLabel = document.createElement('span');
    keywordsLabel.textContent = '搜索关键词';
    const keywordsInput = document.createElement('textarea');
    keywordsInput.rows = 2;
    keywordsInput.value = names(item.keywords).join('，');
    keywordsInput.placeholder = '每个关键词用逗号分隔';
    keywordsField.append(keywordsLabel, keywordsInput);

    const footer = document.createElement('div');
    footer.className = 'direction-item-footer';
    const priorityLabel = document.createElement('label');
    priorityLabel.innerHTML = '<span>投递优先级</span>';
    const priorityInput = document.createElement('input');
    priorityInput.type = 'number';
    priorityInput.min = '1';
    priorityInput.max = '99';
    priorityInput.value = String(item.priority || index + 1);
    priorityLabel.append(priorityInput);
    const source = document.createElement('span');
    source.className = 'direction-source';
    source.textContent = item.custom || item.source === 'custom' ? '自定义方向' : '画像推荐';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'direction-remove';
    remove.textContent = '删除';
    footer.append(priorityLabel, source, remove);

    checkbox.addEventListener('change', () => {
      directionPlanDraft.items[index].enabled = checkbox.checked;
      row.classList.toggle('is-disabled', !checkbox.checked);
      markDirectionPlanDirty();
    });
    nameInput.addEventListener('input', () => {
      directionPlanDraft.items[index].name = nameInput.value;
      markDirectionPlanDirty();
    });
    keywordsInput.addEventListener('input', () => {
      directionPlanDraft.items[index].keywords = csv(keywordsInput.value);
      markDirectionPlanDirty();
    });
    priorityInput.addEventListener('input', () => {
      directionPlanDraft.items[index].priority = Math.max(1, Math.min(99, Number(priorityInput.value || index + 1)));
      markDirectionPlanDirty();
    });
    remove.addEventListener('click', () => {
      directionPlanDraft.items = directionPlanDraft.items.filter(entry => entry.id !== item.id);
      directionPlanDirty = true;
      renderDirectionPlan(true, true);
      markDirectionPlanDirty();
    });

    row.append(header, reason);
    if (evidence.childElementCount) row.append(evidence);
    row.append(keywordsField, footer);
    list.append(row);
  }
  setText('directionPlanCaption', state.workflow?.running
    ? '当前任务继续使用启动时的方向；保存后的修改会应用到下一轮新任务。'
    : '系统默认勾选匹配度最高的 3 个方向，你可以修改名称、搜索词和优先级。');
  updateDirectionPlanSummary();
}

async function persistProfileDraftNow() {
  clearTimeout(profileDraftSaveTimer);
  profileDraftSaveTimer = null;
  const profileDraft = collectProfileDraft();
  state.profileDraft = profileDraft;
  try {
    await chrome.storage.local.set({ profileDraft });
  } catch {
    await send('SAVE_PROFILE_DRAFT', { profileDraft });
  }
}

function scheduleProfileDraftSave() {
  clearTimeout(profileDraftSaveTimer);
  profileDraftSaveTimer = setTimeout(() => persistProfileDraftNow(), 120);
}

async function send(type, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({ type, ...payload });
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function showToast(message, error = false) {
  const toast = $('toast');
  if (!toast || !message) return;
  toast.textContent = message;
  toast.classList.toggle('is-error', error);
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), error ? 4200 : 2400);
}

function setResumeImportNotice({ visible = false, title = '', message = '', tone = 'info', actions = true } = {}) {
  const notice = $('resumeImportNotice');
  if (!notice) return;
  notice.hidden = !visible;
  notice.dataset.tone = tone;
  setText('resumeImportTitle', title);
  setText('resumeImportMessage', message);
  const icon = $('resumeImportIcon');
  if (icon) icon.textContent = tone === 'success' ? '✓' : tone === 'warning' ? '!' : tone === 'error' ? '×' : 'i';
  const actionRow = notice.querySelector('.import-notice-actions');
  if (actionRow) actionRow.hidden = !actions;
}

function resetResumeEditorNote(message = '系统会先自动识别；识别结果可修改，职业画像也能单独编辑。', warning = false) {
  const note = $('resumeEditorNote');
  if (!note) return;
  note.classList.toggle('is-warning', warning);
  note.replaceChildren(
    Object.assign(document.createElement('i'), {}),
    Object.assign(document.createElement('span'), { textContent: message })
  );
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value ?? '';
}

function setFieldValue(id, value, force = false) {
  const element = $(id);
  if (!element) return;
  if (!force && (dirtyFields.has(id) || document.activeElement === element)) return;
  if (element.type === 'checkbox') element.checked = Boolean(value);
  else element.value = value ?? '';
}

function clearDirty(...ids) {
  for (const id of ids.flat()) dirtyFields.delete(id);
  updateUnsavedIndicators();
}

function hasDirty(ids) {
  return ids.some(id => dirtyFields.has(id));
}

function updateUnsavedIndicators() {
  const resumeDirty = dirtyFields.has('resumeText');
  const profileDirty = hasDirty(PROFILE_FORM_IDS);
  const settingsDirty = hasDirty(SETTINGS_FORM_IDS);

  if (resumeDirty) {
    setText('resumeStatePill', '原文未保存');
    $('resumeStatePill')?.classList.add('accent');
  } else {
    $('resumeStatePill')?.classList.remove('accent');
  }

  if (profileDirty) {
    setText('profileEditState', '修改已自动保留 · 待应用');
    $('profileEditState')?.classList.add('accent');
  }

  const saveButton = $('saveSettings');
  if (saveButton) saveButton.textContent = settingsDirty ? '保存修改' : '保存设置';
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function formatDateTime(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(timestamp));
}

function renderEvents(containerId, events) {
  const container = $(containerId);
  if (!container) return;
  container.replaceChildren();
  const list = (events || []).slice(0, containerId === 'homeEvents' ? 5 : 60);
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'queue-empty';
    empty.textContent = '暂无运行记录';
    container.append(empty);
    return;
  }
  for (const event of list) {
    const row = document.createElement('div');
    row.className = `event ${event.level || 'info'}`;
    const dot = document.createElement('i');
    dot.className = 'event-dot';
    const copy = document.createElement('div');
    copy.className = 'event-copy';
    const title = document.createElement('strong');
    title.textContent = event.message || '运行记录';
    const detail = document.createElement('span');
    const job = event.data?.job;
    detail.textContent = job ? [job.title, job.company].filter(Boolean).join(' · ') : (event.data?.error || '');
    copy.append(title, detail);
    const time = document.createElement('time');
    time.textContent = formatTime(event.ts);
    row.append(dot, copy, time);
    container.append(row);
  }
}

const TASK_STATUS_LABELS = {
  pending: '等待开始',
  running: '进行中',
  waiting_review: '待确认',
  queued: '排队中',
  success: '已投递',
  failed: '失败',
  ignored: '已忽略',
  skipped: '未推荐',
  completed: '已完成',
  paused: '已暂停'
};

function setProgressState(track, status, progress) {
  if (!track) return;
  const normalized = Math.max(0, Math.min(100, Number(progress || 0)));
  track.setAttribute('aria-valuenow', String(normalized));
  track.classList.toggle('is-running', status === 'running');
  track.classList.toggle('is-failed', status === 'failed');
  track.classList.toggle('is-success', status === 'success' || status === 'completed');
  track.classList.toggle('is-waiting', status === 'waiting_review' || status === 'queued' || status === 'paused');
  const bar = track.querySelector('i');
  if (bar) bar.style.width = `${normalized}%`;
}

function renderActiveProgress() {
  const workflow = state.workflow || {};
  const runs = state.taskRuns || [];
  const referencedRun = runs.find(run => run.id === workflow.activeRunId);
  const activeRun = (referencedRun && ['running', 'queued'].includes(referencedRun.status) ? referencedRun : null)
    || runs.find(run => run.status === 'running')
    || runs.find(run => run.status === 'queued');
  const currentSearch = (workflow.tasks || [])[workflow.taskIndex || 0] || null;
  const usingRun = Boolean(activeRun);
  const progress = usingRun ? Number(activeRun.progress || 0) : Number(currentSearch?.progress || 0);
  const rawStatus = usingRun ? activeRun.status : (currentSearch?.status || (workflow.running ? 'running' : 'pending'));
  const status = workflow.paused && rawStatus === 'running' ? 'paused' : rawStatus;
  const baseStage = usingRun
    ? (activeRun.stageLabel || '处理中')
    : (currentSearch?.stageLabel || workflow.statusText || '尚未开始');
  const stage = workflow.paused && rawStatus === 'running' ? `已暂停 · ${baseStage}` : baseStage;
  const name = usingRun
    ? [activeRun.job?.title, activeRun.job?.company].filter(Boolean).join(' · ')
    : currentSearch
      ? [currentSearch.keyword, currentSearch.location, currentSearch.employmentType].filter(Boolean).join(' · ')
      : '暂无正在处理的岗位';
  setText('activeTaskStage', stage);
  setText('activeTaskPercent', `${Math.round(progress)}%`);
  setText('activeTaskName', name || '暂无正在处理的岗位');
  setText('activeTaskUpdated', formatTime(activeRun?.updatedAt || currentSearch?.updatedAt));
  setProgressState($('activeTaskProgress'), status, progress);
}

function renderSearchTasks(tasks = []) {
  const container = $('searchTaskList');
  if (!container) return;
  container.replaceChildren();
  const completed = tasks.filter(task => task.status === 'completed').length;
  setText('searchTaskSummary', `${completed} / ${tasks.length}`);
  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'queue-empty';
    empty.textContent = '启动任务后，这里会逐条显示每个搜索关键词和地区任务的进度。';
    container.append(empty);
    return;
  }
  const workflow = state.workflow || {};
  for (const [index, task] of tasks.entries()) {
    const effectiveStatus = workflow.paused && index === Number(workflow.taskIndex || 0) && task.status === 'running' ? 'paused' : (task.status || 'pending');
    const item = document.createElement('article');
    item.className = `search-task-item is-${effectiveStatus}`;
    const head = document.createElement('div');
    head.className = 'search-task-item-head';
    const title = document.createElement('div');
    title.className = 'search-task-item-title';
    const strong = document.createElement('b');
    strong.textContent = `${index + 1}. ${task.keyword || '岗位搜索'}`;
    const sub = document.createElement('small');
    sub.textContent = [task.location || '不限地区', task.employmentType || '不限类型', task.stageLabel || '等待开始'].join(' · ');
    title.append(strong, sub);
    const statePill = document.createElement('span');
    statePill.className = 'search-task-state';
    statePill.textContent = TASK_STATUS_LABELS[effectiveStatus] || effectiveStatus || '等待开始';
    head.append(title, statePill);
    const track = document.createElement('div');
    track.className = 'progress-track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.append(document.createElement('i'));
    setProgressState(track, effectiveStatus, task.progress);
    const counts = document.createElement('div');
    counts.className = 'search-task-counts';
    counts.innerHTML = `<span>处理 <b>${Number(task.processed || 0)}</b></span><span>发现 <b>${Number(task.discovered || 0)}</b></span><span>分析 <b>${Number(task.analyzed || 0)}</b></span><span>异常 <b>${Number(task.failed || 0)}</b></span>`;
    item.append(head, track, counts);
    container.append(item);
  }
}

function createDeliveryTask(run) {
  const card = document.createElement('article');
  card.className = `delivery-task is-${run.status || 'pending'}`;
  const head = document.createElement('div');
  head.className = 'delivery-task-head';
  const title = document.createElement('div');
  title.className = 'delivery-task-title';
  const strong = document.createElement('strong');
  strong.textContent = run.job?.title || '岗位任务';
  const company = document.createElement('span');
  company.textContent = [run.job?.company, run.job?.location, run.job?.salary].filter(Boolean).join(' · ') || '岗位信息处理中';
  title.append(strong, company);
  const pill = document.createElement('span');
  pill.className = 'delivery-status-pill';
  pill.textContent = TASK_STATUS_LABELS[run.status] || run.status || '处理中';
  head.append(title, pill);

  const track = document.createElement('div');
  track.className = 'progress-track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.append(document.createElement('i'));
  setProgressState(track, run.status, run.progress);

  const meta = document.createElement('div');
  meta.className = 'delivery-task-meta';
  const stage = document.createElement('span');
  stage.textContent = `${run.stageLabel || '处理中'} · ${Math.round(Number(run.progress || 0))}%${run.retryCount ? ` · 已重试 ${run.retryCount} 次` : ''}`;
  const time = document.createElement('time');
  time.textContent = formatDateTime(run.updatedAt || run.createdAt);
  meta.append(stage, time);
  card.append(head, track, meta);

  if (run.error) {
    const error = document.createElement('div');
    error.className = 'delivery-error';
    error.textContent = run.error;
    card.append(error);
  }

  const hasOpen = /^https:\/\/(?:www|app)\.zhipin\.com\//i.test(String(run.job?.url || ''));
  const retryable = run.status === 'failed' && run.retryable !== false;
  if (hasOpen || retryable || run.status === 'failed') {
    const actions = document.createElement('div');
    actions.className = 'delivery-task-actions';
    if (hasOpen) {
      const open = document.createElement('button');
      open.className = 'button button-ghost';
      open.type = 'button';
      open.textContent = '打开岗位';
      open.addEventListener('click', async () => {
        const result = await send('OPEN_TASK_JOB', { url: run.job.url });
        if (!result.ok) showToast(result.error || '岗位打开失败', true);
      });
      actions.append(open);
    }
    if (run.status === 'failed') {
      const ignore = document.createElement('button');
      ignore.className = 'button button-secondary';
      ignore.type = 'button';
      ignore.textContent = '忽略';
      ignore.addEventListener('click', async () => {
        ignore.disabled = true;
        const result = await send('IGNORE_FAILED_TASK', { runId: run.id });
        if (!result.ok) showToast(result.error || '忽略失败', true);
        await refresh({ forms: false });
      });
      actions.append(ignore);
    }
    if (retryable) {
      const retry = document.createElement('button');
      retry.className = 'button button-primary';
      retry.type = 'button';
      retry.textContent = '重新投递';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        retry.textContent = '正在重启…';
        const result = await send('RETRY_FAILED_TASK', { runId: run.id });
        if (!result.ok) {
          retry.disabled = false;
          retry.textContent = '重新投递';
          showToast(result.error || '重试失败', true);
          return;
        }
        showToast('失败任务已重新启动');
        await refresh({ forms: false });
      });
      actions.append(retry);
    }
    card.append(actions);
  }
  return card;
}

function renderDeliveryTasks(runs = []) {
  const container = $('deliveryTaskList');
  if (!container) return;
  const priority = { running: 0, queued: 1, waiting_review: 2, failed: 3, success: 4, skipped: 5, ignored: 6 };
  const list = [...runs].sort((a, b) => {
    const statusDiff = (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
    return statusDiff || Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
  });
  const runningCount = list.filter(run => run.status === 'running').length;
  const queuedCount = list.filter(run => run.status === 'queued').length;
  const activeCount = runningCount + queuedCount;
  const failedCount = list.filter(run => run.status === 'failed').length;
  const reviewCount = list.filter(run => run.status === 'waiting_review').length;
  setText('deliveryTaskPill', runningCount
    ? `${runningCount} 投递中${queuedCount ? ` · ${queuedCount} 排队` : ''}`
    : queuedCount ? `${queuedCount} 排队` : failedCount ? `${failedCount} 失败` : `${list.length} 个任务`);
  setText('deliverySummary', activeCount
    ? `${runningCount || 0} 个岗位正在实际投递，${queuedCount || 0} 个岗位排队等待；同一时间只处理一个聊天窗口。`
    : failedCount
      ? `${failedCount} 个任务失败，可单条或全部重新投递。`
      : reviewCount
        ? `${reviewCount} 个岗位正在等待你的人工确认。`
        : list.length ? '所有任务均已完成或结束。' : '启动采集后，这里会显示每个岗位从分析到发送的完整进度。');
  const retryAll = $('retryAllFailedTasks');
  if (retryAll) retryAll.hidden = failedCount === 0;
  container.replaceChildren();
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'delivery-task-empty';
    empty.textContent = '暂无投递任务。开始采集后，每个岗位都会显示“读取详情 → AI 分析 → 等待确认/自动投递 → 发送结果”的独立进度条。';
    container.append(empty);
    return;
  }
  for (const run of list) container.append(createDeliveryTask(run));
}

function createQueueItem(item) {
  const card = document.createElement('article');
  card.className = 'queue-item';

  const head = document.createElement('div');
  head.className = 'queue-head';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'queue-title';
  const title = document.createElement('strong');
  title.textContent = item.job?.title || '岗位';
  const meta = document.createElement('span');
  meta.textContent = [item.job?.company, item.job?.salary, item.job?.location].filter(Boolean).join(' · ') || formatDateTime(item.createdAt);
  titleWrap.append(title, meta);
  const score = document.createElement('div');
  score.className = 'score';
  score.textContent = item.priorityRank ? `#${item.priorityRank} · ${item.analysis?.score ?? 0}` : String(item.analysis?.score ?? 0);
  head.append(titleWrap, score);

  const reason = document.createElement('div');
  reason.className = 'queue-reason';
  reason.textContent = item.analysis?.reason || 'AI 已判定为推荐岗位。';
  const greetingWrap = document.createElement('label');
  greetingWrap.className = 'queue-greeting-wrap';
  const greetingLabel = document.createElement('span');
  greetingLabel.textContent = '将以求职者身份发送，可直接修改';
  const greeting = document.createElement('textarea');
  greeting.className = 'queue-greeting-editor';
  greeting.rows = 5;
  greeting.value = item.analysis?.greeting || '';
  greeting.placeholder = '请输入你希望发送给招聘方的求职招呼语';
  greetingWrap.append(greetingLabel, greeting);

  const actions = document.createElement('div');
  actions.className = 'queue-actions';
  const reject = document.createElement('button');
  reject.className = 'button button-ghost danger';
  reject.textContent = '忽略';
  reject.addEventListener('click', async () => {
    reject.disabled = true;
    const result = await send('REJECT', { id: item.id });
    if (!result.ok) showToast(result.error || '忽略失败', true);
    await refresh({ forms: false });
  });
  const approve = document.createElement('button');
  approve.className = 'button button-primary';
  approve.textContent = '确认沟通';
  approve.addEventListener('click', async () => {
    approve.disabled = true;
    const result = await send('APPROVE', { id: item.id, greeting: greeting.value.trim() });
    if (!result.ok) {
      approve.disabled = false;
      showToast(result.error || '确认失败', true);
      return;
    }
    showToast('已确认，正在打开岗位并沟通');
    await refresh({ forms: false });
  });
  actions.append(reject, approve);
  card.append(head, reason, greetingWrap, actions);
  return card;
}

function renderPending(items) {
  const mode = state.config?.executionMode === 'auto' ? 'auto' : 'review';
  const pending = (items || [])
    .filter(item => item.status === 'pending')
    .sort((a, b) => Number(b.priorityScore || b.analysis?.score || 0) - Number(a.priorityScore || a.analysis?.score || 0));
  const container = $('pendingList');
  if (!container) return;
  container.replaceChildren();
  if (!pending.length) {
    const empty = document.createElement('div');
    empty.className = 'queue-empty';
    empty.textContent = mode === 'auto'
      ? '全自动投递已开启。达到推荐分数的岗位会直接以你的求职者身份联系招聘方，结果会记录在运行日志中。'
      : '暂无待确认岗位。启动筛选后，AI 推荐岗位会出现在这里，你可以修改招呼语后逐条或批量确认。';
    container.append(empty);
  } else {
    for (const item of pending) container.append(createQueueItem(item));
  }
  const batch = $('queueBatchActions');
  if (batch) batch.hidden = mode !== 'review' || pending.length === 0;
  const failedCount = (state.taskRuns || []).filter(run => run.status === 'failed').length;
  setText('pendingCountPill', mode === 'auto'
    ? (failedCount ? `${failedCount} 失败` : '全自动')
    : failedCount ? `${pending.length} 待确认 · ${failedCount} 失败` : `${pending.length} 待确认`);
  const badge = $('messageBadge');
  const attentionCount = pending.length + failedCount;
  badge.hidden = attentionCount === 0;
  badge.textContent = attentionCount > 99 ? '99+' : String(attentionCount);
}

function renderProfileFacts(profile) {
  const facts = profile?.facts || null;
  setText('profileFactsJson', facts ? JSON.stringify(facts, null, 2) : '尚未生成职业画像。');
}

function profileGenerationSource(generation = {}) {
  const mode = String(generation.mode || '');
  const aiStatus = String(generation.aiStatus || '');
  if (mode === 'ai-compact-retry') {
    return {
      local: false,
      title: 'AI 画像已生成，并完成自动重试',
      label: generation.label || 'AI 精简重试结果',
      caption: 'AI 连接正常；首次输出未完成后，系统已自动精简重试成功',
      note: generation.warning || '本次最终采用 AI 精简重试结果，可继续人工修改。'
    };
  }
  if (!mode.startsWith('local-')) {
    return {
      local: false,
      title: 'AI 画像已生成，下面每一项都可以直接修改',
      label: generation.label || 'AI 完整画像',
      caption: 'AI 完整结果已通过校验；可选空字段才由本地规则补齐',
      note: generation.warning || '已根据简历填充主方向、搜索词、技能和求职条件。请逐项检查后保存。'
    };
  }
  const service = aiStatus === 'service-error';
  const configMissing = aiStatus === 'config-missing';
  return {
    local: true,
    title: configMissing
      ? 'AI 尚未配置，本次使用本地规则初稿'
      : service
        ? 'AI 请求未成功，本次使用本地规则初稿'
        : 'AI 连接可用，但输出未完成，本次使用本地规则初稿',
    label: generation.label || '本地规则初稿',
    caption: configMissing
      ? '本次没有调用 AI；当前字段全部来自本地规则'
      : service
        ? 'AI 请求没有成功；当前字段全部来自本地规则'
        : 'AI 首次输出和自动精简重试均未通过校验；当前字段全部来自本地规则',
    note: generation.warning || '当前初稿全部来自本地规则，可以直接修改并保存。'
  };
}

function profileGenerationToast(generation = {}) {
  const source = profileGenerationSource(generation);
  if (!source.local) {
    return generation.mode === 'ai-compact-retry'
      ? 'AI 首次输出未完成，已自动精简重试并成功生成画像'
      : 'AI 画像已生成，所有字段都可以直接修改';
  }
  if (generation.aiStatus === 'config-missing') return 'AI 尚未配置，已生成本地可编辑初稿';
  if (generation.aiStatus === 'service-error') return 'AI 请求失败，已生成本地可编辑初稿';
  return 'AI 连接正常，但输出未完成；自动重试后已生成本地初稿';
}

function renderProfileGeneration(profile) {
  const generation = profile?.generation || {};
  const draft = effectiveProfileDraft();
  const ready = profileDraftReady(draft);
  if (!ready) {
    const hasResume = Boolean(String(state.resumeText || '').trim());
    setText('profileBannerTitle', hasResume ? '简历已识别，可以生成可编辑初稿' : '先导入简历，再生成职业画像');
    setText('profileBannerMessage', hasResume
      ? '点击“从简历重建初稿”。系统会优先使用 AI，AI 输出不完整时会自动精简重试。'
      : '识别简历后，画像字段会出现真实内容；所有字段都能直接修改。');
    setText('profileGenerationPill', hasResume ? '可以生成' : '等待简历');
    setText('profileGenerationCaption', '生成后会明确显示最终采用的是 AI 结果还是本地初稿');
    setText('profileGenerationNote', hasResume
      ? '当前还没有有效画像。点击下方按钮即可生成。'
      : '先在“简历原文”导入或粘贴简历，再点击“保存并生成画像”。');
    $('profileGenerationNote')?.classList.remove('is-warning', 'is-success');
    return;
  }

  const source = profileGenerationSource(generation);
  setText('profileBannerTitle', source.title);
  setText('profileBannerMessage', '输入修改会自动保留；点击“保存职业画像”后正式用于搜索、匹配和招呼语。');
  setText('profileGenerationPill', source.label);
  setText('profileGenerationCaption', source.caption);
  setText('profileGenerationNote', source.note);
  $('profileGenerationNote')?.classList.toggle('is-warning', source.local);
  $('profileGenerationNote')?.classList.toggle('is-success', !source.local);
}


function revealGeneratedProfile() {
  activateResumeView('profile');
  requestAnimationFrame(() => {
    const target = $('directionPlanCard') || $('profileSummaryInput');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function setReadiness(id, ready) {
  const icon = $(id);
  if (!icon) return;
  const step = { setupResumeIcon: '1', setupProfileIcon: '2', setupSettingsIcon: '3', setupValidationIcon: '4' }[id] || '';
  icon.classList.toggle('is-ready', ready);
  icon.textContent = ready ? '✓' : step;
}

function renderReadiness() {
  const config = state.config || {};
  const resumeReady = Boolean(String(state.resumeText || '').trim());
  const draft = effectiveProfileDraft();
  const profileGenerated = profileDraftReady(draft);
  const plan = state.directionPlan || {};
  const enabledDirections = selectedDirectionItems(plan).length;
  const profileReady = Boolean(profileGenerated && plan.confirmed && enabledDirections);
  const settingsReady = Boolean(config.model?.apiKey);
  const validationRequired = config.requireSingleJobValidation !== false;
  const validationReady = !validationRequired || Number(config.singleJobValidationCompletedAt || 0) > 0;
  const readyCount = [resumeReady, profileReady, settingsReady, validationReady].filter(Boolean).length;

  setReadiness('setupResumeIcon', resumeReady);
  setReadiness('setupProfileIcon', profileReady);
  setReadiness('setupSettingsIcon', settingsReady);
  setReadiness('setupValidationIcon', validationReady);
  setText('setupResumeStatus', resumeReady ? `已保存 ${state.resumeText.length} 字` : '尚未保存');
  setText('setupProfileStatus', profileReady ? `${enabledDirections} 个投递方向已应用` : profileGenerated ? '画像已生成 · 待选择投递方向' : '尚未生成');
  setText('setupSettingsStatus', settingsReady ? 'AI 已配置，搜索条件可用' : '请填写 AI API Key');
  setText('setupValidationStatus', !validationRequired
    ? '已关闭首次单条验收'
    : validationReady
      ? `已通过 · ${new Date(Number(config.singleJobValidationCompletedAt)).toLocaleString('zh-CN', { hour12: false })}`
      : '首次全自动成功后自动暂停，确认无误再继续批量');
  $('setupValidationRow')?.classList.toggle('is-warning', validationRequired && !validationReady);
  setText('readinessPill', `${readyCount} / 4`);
  $('readinessPill')?.classList.toggle('accent', readyCount === 4);
}

function renderExecutionMode() {
  const mode = state.config?.executionMode === 'auto' ? 'auto' : 'review';
  const auto = mode === 'auto';
  for (const button of document.querySelectorAll('[data-execution-mode]')) {
    const active = button.dataset.executionMode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  setText('modeChip', auto ? '全自动投递' : '人工确认');
  setText('settingsModePill', auto ? '全自动投递' : '人工确认');
  setText('modePolicyText', auto
    ? '达到推荐分数的岗位会自动以你的应聘者身份发送求职招呼语；验证、异常或事实不确定时自动暂停。'
    : 'AI 负责筛选和生成求职招呼语，发送前由你逐条或批量确认。');
  setText('messageEyebrow', auto ? '自动投递记录' : '人工确认');
  setText('messageHeading', auto ? '投递与消息' : '待确认岗位');
  setText('messageSubtitle', auto ? '达标岗位自动联系招聘方，异常岗位仍会保留给你处理' : 'AI 推荐后由你决定是否以应聘者身份沟通');
  setText('messageNoticeTitle', auto ? '当前为全自动投递' : '人工确认后再投递');
  setText('messageNoticeText', auto
    ? 'JobClaw 会以求职者口吻联系招聘方，只使用简历真实事实；遇到验证或页面异常会立即暂停。'
    : '你可以修改求职招呼语，确认后 JobClaw 才会以应聘者身份联系招聘方。');
  setText('pendingSectionTitle', auto ? '需要你处理的岗位' : '待确认岗位');
  setText('pendingSectionSubtitle', auto ? '仅展示自动流程中需要人工处理的项目' : '按 AI 匹配分从高到低排列');
  setText('attachmentPolicyText', auto
    ? '全自动模式会按设置随求职招呼语发送附件；关闭开关即可只发送文字。'
    : '人工确认模式下，只有你确认岗位后才会发送附件。');
  setText('sendImagePolicyText', auto ? '招呼语确认发送后再延迟发送图片' : '人工确认后先发文字，确认成功再发图片');
  setText('sendOnlinePolicyText', auto ? '全自动投递时，页面存在入口就发送' : '确认投递后，页面存在入口时发送');
  return mode;
}

function renderDynamic() {
  const workflow = state.workflow || {};
  const stats = state.stats || {};
  const pendingCount = (state.pending || []).filter(item => item.status === 'pending').length;
  const running = Boolean(workflow.running && !workflow.paused);
  const paused = Boolean(workflow.running && workflow.paused);
  const mode = renderExecutionMode();
  const auto = mode === 'auto';

  const top = $('topStatus');
  top.classList.toggle('is-running', running);
  top.classList.toggle('is-paused', paused);
  top.querySelector('span').textContent = workflow.statusText || '未开始';

  setText('homeHeadline', running
    ? (auto ? '正在全自动筛选并投递' : '正在筛选岗位，等待你的确认')
    : paused ? '任务已暂停'
      : (auto ? '准备开始全自动投递' : '准备开始人工确认筛选'));
  const directionsReady = directionPlanReady();
  const validationPending = auto
    && state.config?.requireSingleJobValidation !== false
    && !Number(state.config?.singleJobValidationCompletedAt || 0);
  setText('homeSubline', workflow.statusText || (validationPending
    ? '首次全自动只执行 1 个岗位并自动暂停；确认文字和附件无误后再继续批量。'
    : directionsReady
      ? (auto ? '只会投递你已勾选的岗位方向，达标后自动联系招聘方。' : '只会筛选你已勾选的岗位方向，AI 推荐后由你确认。')
      : profileDraftReady()
        ? '职业画像已生成，请先选择并保存要投递的岗位方向。'
        : '完成简历画像和搜索条件后即可启动。'));
  setText('statDiscovered', stats.discovered || 0);
  setText('statAnalyzed', stats.analyzed || 0);
  setText('statPending', pendingCount);
  setText('statSent', stats.sent || 0);
  setText('workflowStatus', workflow.statusText || '未开始');
  setText('workflowPhase', workflow.phase || 'idle');
  const activeRun = (state.taskRuns || []).find(run => run.id === workflow.activeRunId)
    || (state.taskRuns || []).find(run => run.status === 'running');
  setText('taskProgress', `${Math.min((workflow.taskIndex || 0) + (workflow.tasks?.length ? 1 : 0), workflow.tasks?.length || 0)} / ${workflow.tasks?.length || 0}`);
  setText('currentJob', [activeRun?.job?.title || workflow.currentJob?.title, activeRun?.job?.company || workflow.currentJob?.company].filter(Boolean).join(' · ') || '—');

  $('startTask').disabled = running;
  $('pauseTask').disabled = !workflow.running || workflow.paused;
  $('stopTask').disabled = !workflow.running && workflow.phase === 'idle';

  if (!dirtyFields.has('resumeText')) {
    setText('resumeStatePill', state.resumeText ? `已保存 ${state.resumeText.length} 字` : '未保存');
    $('resumeStatePill')?.classList.remove('accent');
  }
  setText('resumeImagePill', state.resumeImage ? '已上传' : '未上传');
  if (!currentResumeSource && state.resumeSourceFile?.name) {
    currentResumeSource = { ...state.resumeSourceFile };
    setText('resumeFileName', `${state.resumeSourceFile.name} · 已安全保留`);
    setText('resumeParsePill', state.resumeText ? '已保存' : '可重新识别');
  }
  if (!hasDirty(PROFILE_FORM_IDS)) {
    const hasDraft = profileDraftReady();
    setText('profileEditState', hasDraft ? '初稿已保留 · 可编辑' : '未生成');
    $('profileEditState')?.classList.toggle('accent', hasDraft);
  }

  renderProfileFacts(state.profile);
  renderProfileGeneration(state.profile);
  renderDirectionPlan(false);
  renderReadiness();
  renderActiveProgress();
  renderSearchTasks(workflow.tasks || []);
  renderDeliveryTasks(state.taskRuns || []);
  renderPending(state.pending);
  renderEvents('homeEvents', state.events);
  renderEvents('messageEvents', state.events);
  updateUnsavedIndicators();
}

function renderForms(force = false) {
  const config = state.config || {};
  const model = config.model || {};
  const draft = effectiveProfileDraft();

  setFieldValue('resumeText', state.resumeText || '', force);
  setFieldValue('profileSummaryInput', draft.summary || '', force);
  setFieldValue('profileDirectionsInput', names(draft.primaryDirections).join('，'), force);
  setFieldValue('profileKeywordsInput', names(draft.searchKeywords).join('，'), force);
  setFieldValue('profileSkillsInput', names(draft.skills).join('，'), force);
  setFieldValue('profileLocationsInput', names(draft.locations).join('，'), force);
  setFieldValue('profileTypesInput', names(draft.employmentTypes).join('，'), force);
  setFieldValue('profileExperienceInput', draft.experience || '', force);
  setFieldValue('profileDegreeInput', draft.degree || '', force);
  setFieldValue('profileSalaryInput', draft.salary || '', force);
  setFieldValue('profileExcludeInput', names(draft.excludeDirections).join('，'), force);
  autoGrowProfileFields();

  setFieldValue('locations', (config.targetLocations || []).join('，'), force);
  setFieldValue('types', (config.employmentTypes || []).join('，'), force);
  setFieldValue('experience', (config.experiences || []).join('，'), force);
  setFieldValue('degree', (config.degrees || []).join('，'), force);
  setFieldValue('salary', config.salary || '不限', force);
  setFieldValue('minScore', config.minScore ?? 75, force);
  setFieldValue('dailyTarget', config.dailyTarget ?? 150, force);
  setFieldValue('betweenJobsSeconds', config.betweenJobsSeconds ?? 12, force);
  setFieldValue('attachmentDelaySeconds', config.attachmentDelaySeconds ?? 4, force);
  setFieldValue('sendImage', config.sendResumeImage !== false, force);
  setFieldValue('sendOnline', Boolean(config.sendOnlineResume), force);
  setFieldValue('baseUrl', model.baseUrl || 'https://api.deepseek.com', force);
  setFieldValue('modelName', model.model || 'deepseek-v4-pro', force);
  setFieldValue('apiKey', model.apiKey || '', force);
  renderDirectionPlan(force);
}

async function refresh({ forms = false, forceForms = false } = {}) {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await send('GET_STATE');
    if (!response.ok) throw new Error(response.error || '读取状态失败');
    state = response.state || {};
    renderDynamic();
    if (forms) renderForms(forceForms);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    refreshing = false;
  }
}

function decodeXmlEntities(value) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

async function inflateBytes(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findZipEndOfCentralDirectory(bytes) {
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
  }
  return -1;
}

async function extractDocxXml(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocd = findZipEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error('DOCX ZIP 目录损坏');
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('DOCX 中央目录损坏');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    if (name === 'word/document.xml') {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('DOCX 本地文件头损坏');
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      const output = method === 0 ? compressed : method === 8 ? await inflateBytes(compressed, 'deflate-raw') : null;
      if (!output) throw new Error(`不支持的 DOCX 压缩方法：${method}`);
      return new TextDecoder('utf-8').decode(output);
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  throw new Error('DOCX 中未找到 document.xml');
}

async function parseDocx(file) {
  const xml = await extractDocxXml(await file.arrayBuffer());
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\s*\/>/g, '\t')
      .replace(/<w:br\s*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/\n{3,}/g, '\n\n').trim();
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[char]))
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\\r?\n/g, '');
}

function decodePdfHex(value) {
  const normalized = value.replace(/\s+/g, '');
  const padded = normalized.length % 2 ? `${normalized}0` : normalized;
  const bytes = new Uint8Array(padded.length / 2);
  for (let index = 0; index < padded.length; index += 2) bytes[index / 2] = parseInt(padded.slice(index, index + 2), 16);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    return text;
  }
  return new TextDecoder('latin1').decode(bytes);
}

function extractPdfTextOperators(content) {
  const output = [];
  for (const block of content.matchAll(/BT([\s\S]*?)ET/g)) {
    const body = block[1];
    for (const match of body.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj|\[(.*?)\]\s*TJ/g)) {
      const token = match[0];
      if (token.startsWith('(')) {
        output.push(decodePdfLiteral(token.slice(1, token.lastIndexOf(')'))));
      } else if (token.startsWith('<')) {
        output.push(decodePdfHex(match[1] || ''));
      } else {
        const arrayBody = match[2] || '';
        let line = '';
        for (const part of arrayBody.matchAll(/\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>/g)) {
          line += part[0].startsWith('(')
            ? decodePdfLiteral(part[0].slice(1, -1))
            : decodePdfHex(part[1] || '');
        }
        if (line) output.push(line);
      }
    }
  }
  return output.join('\n');
}

function isLikelyGarbledText(text) {
  const compact = String(text || '').replace(/\s/g, '');
  if (compact.length < 40) return true;
  const readable = (compact.match(/[\u3400-\u9fffA-Za-z0-9]/g) || []).length;
  const symbols = (compact.match(/[^\u3400-\u9fffA-Za-z0-9]/g) || []).length;
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  const tinyLines = lines.filter(line => line.trim().length <= 4).length;
  return readable / compact.length < .5 || symbols / compact.length > .42 || (lines.length > 12 && tinyLines / lines.length > .55);
}

async function parsePdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const deep = await extractPdfText(arrayBuffer);
  if (isReadableResumeText(deep.text)) return deep;

  // Keep the RC12 stream parser as a second browser-only fallback for unusual but unencrypted PDFs.
  const bytes = new Uint8Array(arrayBuffer);
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const chunks = [extractPdfTextOperators(latin1)];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n/gms;
  for (const match of latin1.matchAll(streamPattern)) {
    const dictionary = match[1];
    const dataStart = match.index + match[0].length;
    const end = latin1.indexOf('endstream', dataStart);
    if (end < 0) continue;
    const raw = bytes.slice(dataStart, end > dataStart && bytes[end - 1] === 10 ? end - 1 : end);
    try {
      const decoded = /FlateDecode/.test(dictionary) ? await inflateBytes(raw, 'deflate') : raw;
      chunks.push(extractPdfTextOperators(new TextDecoder('latin1').decode(decoded)));
    } catch {
      // Continue with the streams that can be decoded.
    }
  }
  const legacyText = chunks.join('\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (isReadableResumeText(legacyText)) {
    return { text: legacyText, method: 'pdf-stream-fallback', confidence: .58, pageCount: deep.pageCount || 0 };
  }
  throw new Error('浏览器深度解析未识别到可靠文本');
}

async function parseResumeFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return parsePdf(file);
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
    return { text: await parseDocx(file), method: 'docx-local', confidence: 1 };
  }
  if (name.endsWith('.txt') || file.type === 'text/plain') {
    return { text: await file.text(), method: 'text-local', confidence: 1 };
  }
  throw new Error('仅支持 PDF、DOCX、TXT');
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}


function applyResumeText(text, { fileName = '简历文件', method = '本地解析' } = {}) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!isReadableResumeText(normalized)) throw new Error('识别结果仍不完整');
  setFieldValue('resumeText', normalized, true);
  dirtyFields.add('resumeText');
  setText('resumeFileName', `${fileName} · 已识别 ${normalized.length} 字`);
  setText('resumeParsePill', '待检查');
  setResumeImportNotice({
    visible: true,
    tone: 'success',
    title: '简历文字已自动识别',
    message: `${method}完成。请快速检查姓名、联系方式和项目经历，确认后再保存。`,
    actions: false
  });
  resetResumeEditorNote('识别结果已放入编辑区；你可以直接修改，定时刷新不会覆盖。');
  updateUnsavedIndicators();
}

async function parseStoredPdfWithBridge({ quiet = false } = {}) {
  setResumeImportNotice({
    visible: true,
    tone: 'progress',
    title: '正在进行本机深度识别',
    message: '正在调用本机增强识别。文本型 PDF 会优先提取文字，扫描件会自动转入系统 OCR。',
    actions: false
  });
  setText('resumeParsePill', '深度识别中');
  const result = await send('PARSE_RESUME_PDF');
  if (result.ok && isReadableResumeText(result.result?.text)) {
    const methodLabels = {
      'macos-metadata': 'macOS 文档识别',
      'pdftotext': '本机 PDF 引擎',
      'macos-pdfkit': 'macOS PDFKit',
      'macos-vision-ocr': 'macOS Vision OCR'
    };
    applyResumeText(result.result.text, {
      fileName: currentResumeSource?.name || state.resumeSourceFile?.name || 'PDF 简历',
      method: methodLabels[result.result.method] || '本机深度识别'
    });
    if (!quiet) showToast('PDF 已通过本机深度识别');
    return true;
  }
  const rawMessage = result.error || result.result?.error || '';
  const bridgeUnavailable = /未启动|Failed to fetch|fetch|连接超时|ECONNREFUSED/i.test(rawMessage);
  setText('resumeParsePill', bridgeUnavailable ? '需启用增强识别' : '等待处理');
  setResumeImportNotice({
    visible: true,
    tone: 'warning',
    title: bridgeUnavailable ? '这份 PDF 需要增强识别' : '没有识别到可靠正文',
    message: bridgeUnavailable
      ? '原文件已经保留。运行完整包根目录里的“安装桌面桥接-mac.command”一次，再点“重新识别”；普通文本型 PDF 不需要这一步。'
      : '这可能是一份扫描版或受保护 PDF。可以再次识别，也可以直接在下方编辑区输入内容。',
    actions: true
  });
  resetResumeEditorNote(bridgeUnavailable
    ? '启用增强识别后可自动处理扫描件；当前不会生成乱码画像。'
    : '原 PDF 已保留，识别成功前不会生成错误画像。', true);
  return false;
}

function bindNavigation() {
  const buttons = [...document.querySelectorAll('.nav-item[data-page]')];
  const panels = [...document.querySelectorAll('.page[data-page-panel]')];
  const pageStack = $('pageStack');
  const pageLabels = {
    home: '首页 · 应聘者求职工作台',
    resume: '简历 · 原文与职业画像',
    messages: '消息 · 投递与确认',
    settings: '设置 · 搜索与 AI',
    openclaw: 'OpenClaw · 本地桥接'
  };
  activateMainPage = (page, resetScroll = true) => {
    const validPage = buttons.some(button => button.dataset.page === page) ? page : 'home';
    for (const button of buttons) {
      const active = button.dataset.page === validPage;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    }
    for (const panel of panels) panel.classList.toggle('is-active', panel.dataset.pagePanel === validPage);
    setText('pageContext', pageLabels[validPage]);
    if (resetScroll && pageStack) pageStack.scrollTop = 0;
    localStorage.setItem('jobclaw.activePage', validPage);
  };
  for (const button of buttons) button.addEventListener('click', () => activateMainPage(button.dataset.page));
  activateMainPage(localStorage.getItem('jobclaw.activePage') || 'home', false);

  for (const jump of document.querySelectorAll('[data-jump-page]')) {
    jump.addEventListener('click', () => {
      activateMainPage(jump.dataset.jumpPage);
      if (jump.dataset.resumeView) activateResumeView(jump.dataset.resumeView);
    });
  }
}

function bindResumeTabs() {
  const buttons = [...document.querySelectorAll('[data-resume-tab]')];
  const panels = [...document.querySelectorAll('[data-resume-panel]')];
  activateResumeView = (view, resetScroll = true) => {
    const validView = buttons.some(button => button.dataset.resumeTab === view) ? view : 'source';
    for (const button of buttons) {
      const active = button.dataset.resumeTab === validView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    for (const panel of panels) panel.classList.toggle('is-active', panel.dataset.resumePanel === validView);
    if (resetScroll && $('pageStack')) $('pageStack').scrollTop = 0;
    localStorage.setItem('jobclaw.resumeView', validView);
  };
  for (const button of buttons) button.addEventListener('click', async () => {
    activateResumeView(button.dataset.resumeTab);
    if (button.dataset.resumeTab === 'profile') {
      await ensureSavedResumeHasProfile();
      renderForms(false);
    }
  });
  activateResumeView(localStorage.getItem('jobclaw.resumeView') || 'source', false);
}

function bindExplicitCollapsibles() {
  for (const detail of document.querySelectorAll('details[data-collapsible]')) {
    const key = `jobclaw.collapse.${detail.dataset.collapsible}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) detail.open = saved === 'open';
    detail.addEventListener('toggle', () => localStorage.setItem(key, detail.open ? 'open' : 'closed'));
  }
}

function bindDirtyTracking() {
  for (const id of FORM_IDS) {
    const element = $(id);
    if (!element) continue;
    const eventName = element.type === 'checkbox' ? 'change' : 'input';
    element.addEventListener(eventName, () => {
      dirtyFields.add(id);
      if (PROFILE_FORM_IDS.includes(id)) {
        autoGrowTextarea(element);
        scheduleProfileDraftSave();
      }
      updateUnsavedIndicators();
    });
  }
}

function setBusy(button, busy, busyText, idleText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

async function saveResume({ build = false } = {}) {
  const text = $('resumeText').value.trim();
  if (!text) return showToast('请先填写简历文本', true);
  const button = build ? $('buildProfile') : $('saveResume');
  setBusy(button, true, build ? '正在生成…' : '正在保存…', build ? '保存并生成画像' : '只保存原文');
  try {
    const saved = await send('SET_RESUME', { text });
    if (!saved.ok) throw new Error(saved.error || '保存失败');
    clearDirty('resumeText');
    if (build) {
      const result = await send('BUILD_PROFILE');
      if (!result.ok) throw new Error(result.error || '画像生成失败');
      clearDirty(PROFILE_FORM_IDS);
      await refresh({ forms: true, forceForms: true });
      revealGeneratedProfile();
      showToast('职业画像已生成，下一步请选择要投递的岗位方向');
    } else {
      showToast('简历原文已保存');
      await refresh({ forms: false });
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(button, false, '', build ? '保存并生成画像' : '只保存原文');
  }
}

function collectProfile() {
  const current = state.profile || {};
  const draft = collectProfileDraft();
  return {
    ...current,
    summary: draft.summary,
    primaryDirections: draft.primaryDirections,
    searchKeywords: draft.searchKeywords,
    excludeDirections: draft.excludeDirections,
    facts: {
      ...(current.facts || {}),
      skills: draft.skills
    },
    hardConstraints: {
      ...(current.hardConstraints || {}),
      locations: draft.locations,
      employmentTypes: draft.employmentTypes,
      experience: draft.experience,
      degree: draft.degree,
      salary: draft.salary
    }
  };
}

async function saveProfile() {
  await persistProfileDraftNow();
  const profile = collectProfile();
  if (!profile.primaryDirections.length) return showToast('至少填写一个主要求职方向', true);
  if (!profile.searchKeywords.length) return showToast('至少填写一个岗位搜索词', true);
  const button = $('saveProfile');
  setBusy(button, true, '正在保存…', '保存职业画像');
  try {
    const result = await send('SAVE_PROFILE', { profile });
    if (!result.ok) throw new Error(result.error || '画像保存失败');
    clearDirty(PROFILE_FORM_IDS);
    await refresh({ forms: true, forceForms: true });
    showToast(result.directionPlan?.confirmed ? '职业画像已保存，当前投递方向继续有效' : '职业画像已保存；请在下方选择要投递的岗位方向');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(button, false, '', '保存职业画像');
  }
}

async function regenerateProfile() {
  const text = $('resumeText').value.trim() || String(state.resumeText || '').trim();
  if (!text) return showToast('请先在“简历原文”中填写内容', true);
  const button = $('regenerateProfile');
  setBusy(button, true, '正在生成初稿…', '从简历重建初稿');
  try {
    if (dirtyFields.has('resumeText') || text !== state.resumeText) {
      const saved = await send('SET_RESUME', { text });
      if (!saved.ok) throw new Error(saved.error || '简历保存失败');
      clearDirty('resumeText');
    }
    const result = await send('BUILD_PROFILE');
    if (!result.ok) throw new Error(result.error || '画像生成失败');
    clearDirty(PROFILE_FORM_IDS);
    await refresh({ forms: true, forceForms: true });
    revealGeneratedProfile();
    showToast('职业画像已生成，下一步请选择要投递的岗位方向');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(button, false, '', '从简历重建初稿');
  }
}


function addCustomDirection() {
  if (!directionPlanDraft) directionPlanDraft = cloneDirectionPlan(state.directionPlan);
  if (!Array.isArray(directionPlanDraft.items)) directionPlanDraft.items = [];
  if (directionPlanDraft.items.length >= 12) return showToast('最多保留 12 个岗位方向', true);
  const id = `direction_custom_${Date.now().toString(36)}`;
  directionPlanDraft.items.push({
    id,
    source: 'custom',
    custom: true,
    sourceName: '',
    name: '',
    enabled: true,
    priority: directionPlanDraft.items.length + 1,
    score: 70,
    reason: '用户自定义岗位方向。',
    matchedSkills: [],
    gaps: [],
    keywords: [],
    updatedAt: Date.now()
  });
  directionPlanDirty = true;
  renderDirectionPlan(true, true);
  markDirectionPlanDirty();
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-direction-id="${id}"]`);
    row?.querySelector('.direction-name-input')?.focus();
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

async function rebuildDirectionPlan() {
  const button = $('rebuildDirectionPlan');
  setBusy(button, true, '正在生成…', '重新生成推荐');
  try {
    const result = await send('REBUILD_DIRECTION_PLAN');
    if (!result.ok) throw new Error(result.error || '岗位方向生成失败');
    directionPlanDirty = false;
    directionPlanDraft = null;
    await refresh({ forms: true, forceForms: true });
    $('directionPlanCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('岗位方向推荐已更新，请勾选后保存');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(button, false, '', '重新生成推荐');
  }
}

async function saveDirectionPlan() {
  if (!directionPlanDraft?.items?.length) return showToast('请先生成或添加岗位方向', true);
  const enabled = directionPlanDraft.items.filter(item => item.enabled);
  if (!enabled.length) return showToast('至少勾选一个要投递的岗位方向', true);
  for (const item of enabled) {
    if (!String(item.name || '').trim()) return showToast('已勾选方向必须填写岗位名称', true);
    if (!names(item.keywords).length) return showToast(`请为“${item.name || '当前方向'}”填写至少一个搜索词`, true);
  }
  const button = $('saveDirectionPlan');
  setBusy(button, true, '正在应用…', '保存并应用到新搜索任务');
  try {
    const result = await send('SAVE_DIRECTION_PLAN', { directionPlan: directionPlanDraft });
    if (!result.ok) throw new Error(result.error || '岗位方向保存失败');
    directionPlanDirty = false;
    directionPlanDraft = null;
    await refresh({ forms: true, forceForms: true });
    showToast(result.appliesNextRun
      ? `已保存 ${result.selectedCount} 个方向，将从下一轮任务起应用`
      : `已保存 ${result.selectedCount} 个方向，将生成 ${result.taskCount} 个搜索任务`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(button, false, '', '保存并应用到新搜索任务');
  }
}

async function saveSettings() {
  const old = state.config || {};
  const config = {
    ...old,
    executionMode: old.executionMode === 'auto' ? 'auto' : 'review',
    dailyTarget: Number($('dailyTarget').value || 150),
    discoveryLimit: 0,
    minScore: Number($('minScore').value || 75),
    betweenJobsSeconds: Math.max(3, Math.min(30, Number($('betweenJobsSeconds').value || 12))),
    attachmentDelaySeconds: Math.max(1, Math.min(10, Number($('attachmentDelaySeconds').value || 4))),
    targetLocations: csv($('locations').value),
    employmentTypes: csv($('types').value),
    experiences: csv($('experience').value),
    degrees: csv($('degree').value),
    salary: $('salary').value.trim() || '不限',
    sendResumeImage: $('sendImage').checked,
    sendOnlineResume: $('sendOnline').checked,
    model: {
      ...(old.model || {}),
      baseUrl: $('baseUrl').value.trim() || 'https://api.deepseek.com',
      apiKey: $('apiKey').value.trim(),
      model: $('modelName').value.trim() || 'deepseek-v4-pro'
    }
  };
  const result = await send('SAVE_CONFIG', { config });
  if (!result.ok) return showToast(result.error || '设置保存失败', true);
  clearDirty(SETTINGS_FORM_IDS);
  showToast('设置已保存');
  await refresh({ forms: true, forceForms: true });
}

async function setExecutionMode(mode) {
  const normalized = mode === 'auto' ? 'auto' : 'review';
  const old = state.config || {};
  if ((old.executionMode === 'auto' ? 'auto' : 'review') === normalized) return;
  const result = await send('SAVE_CONFIG', { config: { ...old, executionMode: normalized } });
  if (!result.ok) return showToast(result.error || '执行模式切换失败', true);
  showToast(normalized === 'auto' ? '已切换为全自动投递' : '已切换为人工确认');
  await refresh({ forms: false });
}

function bindActions() {
  for (const button of document.querySelectorAll('[data-execution-mode]')) {
    button.addEventListener('click', () => setExecutionMode(button.dataset.executionMode));
  }
  $('startTask').addEventListener('click', async () => {
    const button = $('startTask');
    const label = button.querySelector('span');
    button.disabled = true;
    if (label) label.textContent = '正在连接…';
    try {
      const result = await send('START');
      if (!result.ok) {
        showToast(result.error || '启动失败', true);
        if (/投递.*方向|选择.*岗位方向/.test(String(result.error || ''))) {
          activateMainPage('resume');
          activateResumeView('profile');
          requestAnimationFrame(() => $('directionPlanCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
      } else showToast(state.config?.executionMode === 'auto' ? '全自动投递已启动' : '人工确认筛选已启动');
    } finally {
      button.disabled = false;
      if (label) label.textContent = '开始采集';
      await refresh({ forms: false });
    }
  });
  $('pauseTask').addEventListener('click', async () => {
    const result = await send('PAUSE');
    showToast(result.ok ? '任务已暂停' : result.error, !result.ok);
    await refresh({ forms: false });
  });
  $('stopTask').addEventListener('click', async () => {
    const result = await send('STOP');
    showToast(result.ok ? '任务已停止' : result.error, !result.ok);
    await refresh({ forms: false });
  });

  $('approveAllPending').addEventListener('click', async () => {
    const button = $('approveAllPending');
    button.disabled = true;
    const result = await send('APPROVE_ALL');
    showToast(result.ok ? `已批量确认 ${result.count || 0} 个岗位，将按顺序投递` : (result.error || '批量确认失败'), !result.ok);
    button.disabled = false;
    await refresh({ forms: false });
  });
  $('rejectAllPending').addEventListener('click', async () => {
    const button = $('rejectAllPending');
    button.disabled = true;
    const result = await send('REJECT_ALL');
    showToast(result.ok ? `已忽略 ${result.count || 0} 个岗位` : (result.error || '批量忽略失败'), !result.ok);
    button.disabled = false;
    await refresh({ forms: false });
  });

  $('retryAllFailedTasks').addEventListener('click', async () => {
    const button = $('retryAllFailedTasks');
    button.disabled = true;
    button.textContent = '正在重启失败任务…';
    const result = await send('RETRY_ALL_FAILED_TASKS');
    showToast(result.ok ? `已重新启动 ${result.count || 0} 个失败任务` : (result.error || '批量重试失败'), !result.ok);
    button.disabled = false;
    button.textContent = '全部重试失败任务';
    await refresh({ forms: false });
  });

  $('resumeFile').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) {
      showToast('简历文件不能超过 18MB', true);
      event.target.value = '';
      return;
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    currentResumeSource = { name: file.name, type: file.type, size: file.size };
    setText('resumeFileName', `${file.name} · 正在安全保存`);
    setText('resumeParsePill', '准备中');
    setResumeImportNotice({
      visible: true,
      tone: 'progress',
      title: '正在识别简历',
      message: isPdf
        ? '先在浏览器内完整解析文本和字体映射；只有扫描件才会调用本机增强识别。'
        : '文件只在本机处理，识别完成后可以继续编辑。',
      actions: false
    });

    try {
      const dataUrl = await readAsDataUrl(file);
      currentResumeSource.dataUrl = dataUrl;
      const stored = await send('SET_RESUME_SOURCE', {
        file: { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified, dataUrl }
      });
      if (!stored.ok) throw new Error(stored.error || '原文件保存失败');
      setText('resumeFileName', `${file.name} · 正在本地解析`);
      setText('resumeParsePill', '解析中');

      try {
        const parsed = await parseResumeFile(file);
        applyResumeText(parsed.text, {
          fileName: file.name,
          method: parsed.method === 'pdf-unicode-map' ? 'PDF 字体映射解析' : '本地文件解析'
        });
        showToast('简历识别完成，请检查后保存');
      } catch (browserError) {
        if (!isPdf) throw browserError;
        await parseStoredPdfWithBridge();
      }
    } catch (error) {
      setText('resumeFileName', `${file.name} · 文件已保留`);
      setText('resumeParsePill', '待处理');
      setResumeImportNotice({
        visible: true,
        tone: 'warning',
        title: '文件已保留，可以继续处理',
        message: error.message || '请重新识别，或直接粘贴正文。',
        actions: true
      });
      resetResumeEditorNote('文件没有丢失；识别成功前不会把乱码写入职业画像。', true);
    } finally {
      event.target.value = '';
    }
  });
  $('resumeRetryAction').addEventListener('click', async () => {
    const sourceName = currentResumeSource?.name || state.resumeSourceFile?.name || '';
    if (!sourceName.toLowerCase().endsWith('.pdf')) {
      showToast('请先选择一个 PDF 简历', true);
      return;
    }
    await parseStoredPdfWithBridge();
  });
  $('resumePasteAction').addEventListener('click', () => {
    const editor = $('resumeText');
    editor.focus();
    editor.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  $('expandResumeEditor').addEventListener('click', () => {
    const editor = $('resumeText');
    const expanded = editor.classList.toggle('is-expanded');
    $('expandResumeEditor').textContent = expanded ? '收起' : '扩大';
    editor.focus({ preventScroll: true });
  });
  $('resumeText').addEventListener('input', () => {
    if ($('resumeText').value.trim()) setResumeImportNotice({ visible: false });
  });
  $('clearResumeText').addEventListener('click', () => {
    $('resumeText').value = '';
    dirtyFields.add('resumeText');
    setResumeImportNotice({ visible: false });
    resetResumeEditorNote();
    updateUnsavedIndicators();
    $('resumeText').focus();
  });
  $('saveResume').addEventListener('click', () => saveResume({ build: false }));
  $('buildProfile').addEventListener('click', () => saveResume({ build: true }));
  $('saveProfile').addEventListener('click', saveProfile);
  $('regenerateProfile').addEventListener('click', regenerateProfile);
  $('addCustomDirection').addEventListener('click', addCustomDirection);
  $('rebuildDirectionPlan').addEventListener('click', rebuildDirectionPlan);
  $('saveDirectionPlan').addEventListener('click', saveDirectionPlan);

  $('resumeImage').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return showToast('简历图片不能超过 8MB', true);
    const result = await send('SET_IMAGE', { dataUrl: await readAsDataUrl(file) });
    showToast(result.ok ? '简历图片已保存' : result.error, !result.ok);
    await refresh({ forms: false });
  });
  $('removeResumeImage').addEventListener('click', async () => {
    const result = await send('SET_IMAGE', { dataUrl: null });
    showToast(result.ok ? '简历图片已移除' : result.error, !result.ok);
    await refresh({ forms: false });
  });

  $('saveSettings').addEventListener('click', saveSettings);
  $('testAi').addEventListener('click', async () => {
    await saveSettings();
    setText('aiTestResult', '测试中…');
    const result = await send('TEST_AI');
    setText('aiTestResult', result.ok ? result.text : result.error);
    showToast(result.ok ? 'AI 连接正常' : result.error, !result.ok);
  });

  $('probePage').addEventListener('click', async () => {
    const result = await send('PROBE_BOSS');
    setText('pageDiagnostic', JSON.stringify(result.ok ? result.result : { ok: false, error: result.error }, null, 2));
    showToast(result.ok ? 'BOSS 页面助手连接正常' : result.error, !result.ok);
  });

  $('exportDiagnostic').addEventListener('click', () => {
    const diagnostic = structuredClone(state);
    if (diagnostic.resumeText) diagnostic.resumeText = `[隐藏 ${diagnostic.resumeText.length} 字符]`;
    diagnostic.resumeImage = diagnostic.resumeImage ? '[隐藏]' : null;
    if (diagnostic.config?.model) diagnostic.config.model.apiKey = '***';
    const blob = new Blob([JSON.stringify(diagnostic, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `jobclaw-diagnostic-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  });

  $('checkBridge').addEventListener('click', checkBridge);
  $('loadBridgeReport').addEventListener('click', loadBridgeReport);
  for (const button of document.querySelectorAll('[data-bridge-command]')) {
    button.addEventListener('click', async () => {
      const result = await send('BRIDGE_COMMAND', { command: button.dataset.bridgeCommand });
      showToast(result.ok ? `OpenClaw 命令已发送：${button.dataset.bridgeCommand}` : result.error, !result.ok);
      await checkBridge();
    });
  }
}

async function ensureSavedResumeHasProfile() {
  const resume = String(state.resumeText || '').trim();
  if (resume.length < 30) return;
  const profileReady = Boolean(names(state.profile?.primaryDirections).length && names(state.profile?.searchKeywords).length);
  const draftReady = profileDraftReady();
  if (profileReady && draftReady) return;
  const result = await send('ENSURE_PROFILE_DRAFT');
  if (!result.ok) return;
  await refresh({ forms: true, forceForms: true });
  if (!result.skipped) showToast('职业画像初稿已恢复，后续修改会自动保留');
}

async function checkBridge() {
  const result = await send('BRIDGE_STATUS');
  setText('bridgeDiagnostic', JSON.stringify(result.ok ? result.result : { ok: false, error: result.error }, null, 2));
  const pill = $('bridgePill');
  pill.textContent = result.ok ? '已连接' : '未连接';
  pill.classList.toggle('accent', result.ok);
  return result;
}

async function loadBridgeReport() {
  const result = await send('BRIDGE_REPORT');
  setText('bridgeReport', result.ok ? (result.result?.report || JSON.stringify(result.result, null, 2)) : result.error);
  if (!result.ok) showToast(result.error || '读取日报失败', true);
}

async function init() {
  bindResumeTabs();
  bindNavigation();
  bindExplicitCollapsibles();
  bindDirtyTracking();
  bindActions();
  await refresh({ forms: true, forceForms: true });
  await ensureSavedResumeHasProfile();
  renderForms(false);
  autoGrowProfileFields();
  checkBridge();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasDirty(PROFILE_FORM_IDS)) persistProfileDraftNow();
  });
  window.addEventListener('pagehide', () => {
    if (hasDirty(PROFILE_FORM_IDS)) persistProfileDraftNow();
  });
  chrome.storage.onChanged.addListener(() => refresh({ forms: true }));
  setInterval(() => refresh({ forms: false }), 4000);
}

init();
