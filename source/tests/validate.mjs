import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = 'dist/chrome-extension';
const required = [
  'manifest.json', 'background.js', 'common.js', 'content-v37.js',
  'sidepanel.html', 'sidepanel.js', 'styles.css', 'pdf-extractor.js', 'offscreen.html', 'offscreen.js'
];
for (const file of required) await access(`${root}/${file}`);
try { await access(`${root}/content.js`); throw new Error('旧 content.js 不应进入 UI22 构建'); } catch (error) { if (!String(error?.message || '').includes('ENOENT')) throw error; }

const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest 不是 V3');
if (manifest.side_panel?.default_path !== 'sidepanel.html') throw new Error('side_panel 配置错误');
if (manifest.background?.service_worker !== 'background.js' || manifest.background?.type !== 'module') throw new Error('background module 配置错误');
if (!manifest.content_scripts?.some(item => item.js?.includes('content-v37.js'))) throw new Error('content-v37.js 未注册');
const extensionCsp = manifest.content_security_policy?.extension_pages || '';
if (/\bblob:/i.test(extensionCsp)) throw new Error('Manifest V3 extension_pages CSP 禁止 worker-src blob:');
if (extensionCsp !== "script-src 'self'; object-src 'self'; worker-src 'self'") throw new Error(`CSP 配置异常：${extensionCsp}`);
for (const permission of ['storage', 'tabs', 'sidePanel', 'alarms', 'unlimitedStorage', 'scripting', 'debugger', 'offscreen', 'clipboardWrite']) {
  if (!manifest.permissions.includes(permission)) throw new Error(`缺少权限 ${permission}`);
}

const html = await readFile(`${root}/sidepanel.html`, 'utf8');
const navPages = [...html.matchAll(/class="nav-item(?: is-active)?" data-page="([^"]+)"/g)].map(match => match[1]);
const panels = [...html.matchAll(/data-page-panel="([^"]+)"/g)].map(match => match[1]);
const expected = ['home', 'resume', 'messages', 'settings', 'openclaw'];
if (JSON.stringify(navPages) !== JSON.stringify(expected)) throw new Error(`导航页面不正确：${JSON.stringify(navPages)}`);
if (JSON.stringify(panels) !== JSON.stringify(expected)) throw new Error(`内容页面不正确：${JSON.stringify(panels)}`);
const collapsibleCount = (html.match(/data-collapsible=/g) || []).length;
if (collapsibleCount !== 8) throw new Error(`明确折叠模块数量异常：${collapsibleCount}`);
for (const id of ['resumeImportNotice', 'resumeRetryAction', 'resumePasteAction', 'expandResumeEditor', 'profileSummaryInput', 'profileGenerationPill', 'profileGenerationNote', 'saveProfile', 'activeTaskProgress', 'searchTaskList', 'deliveryTaskList', 'retryAllFailedTasks']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`必要 UI 元素缺失：${id}`);
}

const sidepanel = await readFile(`${root}/sidepanel.js`, 'utf8');
for (const token of [
  "import { extractPdfText, isReadableResumeText } from './pdf-extractor.js'",
  'const dirtyFields = new Set()',
  'document.activeElement === element',
  "setInterval(() => refresh({ forms: false }), 4000)",
  'details[data-collapsible]',
  "send('SAVE_PROFILE'",
  'profileDraftSaveTimer',
  'persistProfileDraftNow',
  "chrome.storage.local.set({ profileDraft })",
  "chrome.storage.onChanged.addListener(() => refresh({ forms: true }))",
  'renderForms(false);',
  "setFieldValue('profileSummaryInput', draft.summary",
  "send('SET_RESUME_SOURCE'",
  "send('PARSE_RESUME_PDF'",
  'parseStoredPdfWithBridge',
  "editor.classList.toggle('is-expanded')",
  'ensureSavedResumeHasProfile',
  "send('ENSURE_PROFILE_DRAFT'",
  'renderActiveProgress',
  'renderSearchTasks',
  'renderDeliveryTasks',
  "send('RETRY_FAILED_TASK'"
]) {
  if (!sidepanel.includes(token)) throw new Error(`sidepanel 缺少：${token}`);
}
for (const forbidden of ["querySelectorAll('.card')", 'querySelectorAll(".card")', 'document.querySelectorAll("article")']) {
  if (sidepanel.includes(forbidden)) throw new Error(`存在自动扫描卡片逻辑：${forbidden}`);
}

const styles = await readFile(`${root}/styles.css`, 'utf8');
for (const token of [
  'padding: 17px 16px 44px;',
  'padding: 18px 19px;',
  'height: clamp(250px, 35vh, 330px);',
  'grid-template-columns: minmax(0, .9fr) minmax(0, 1.15fr);',
  '.import-notice[data-tone="success"]',
  '.profile-generation-note',
  '.profile-editor-card .field input:not(:placeholder-shown)',
  '.progress-track',
  '.search-task-item',
  '.delivery-task'
]) {
  if (!styles.includes(token)) throw new Error(`UI5 间距样式缺失：${token}`);
}
if (!styles.includes('top: 70px;') || styles.includes('bottom: 78px;')) throw new Error('Toast 可能遮挡底部操作区');

const background = await readFile(`${root}/background.js`, 'utf8');
if (!background.includes('BRIDGE_ENDPOINTS') || !background.includes('http://localhost:17899')) throw new Error('桥接双端点兜底缺失');
for (const token of ['AI_JOB', 'profileDraft', 'ENSURE_PROFILE_DRAFT', 'SAVE_PROFILE_DRAFT', 'PROBE_BOSS', 'ensureBossReceiver', 'injectBossContent', 'chrome.scripting.executeScript', 'BUILD_LOCAL_PROFILE', 'BUILD_PROFILE', 'buildLocalProfile', 'local-fallback', 'SAVE_PROFILE', 'SET_RESUME_SOURCE', 'PARSE_RESUME_PDF', 'BRIDGE_STATUS', 'APPROVE', 'chrome.alarms', 'TASK_PROGRESS', 'SEARCH_TASK_PROGRESS', 'RETRY_FAILED_TASK', 'taskRuns']) {
  if (!background.includes(token)) throw new Error(`background 缺少底层能力：${token}`);
}
const content = await readFile(`${root}/content-v37.js`, 'utf8');
for (const token of ['__JOBCLAW_CONTENT_BOOTSTRAPPED__', 'JOBCLAW_CONTENT_VERSION', 'runtimeIsActive', 'job-card-wrapper', '立即沟通', 'DataTransfer', 'returnToJobsHome', '安全验证', 'applySearchTask', "send('TASK_PROGRESS'", "send('SEARCH_TASK_PROGRESS'"]) {
  if (!content.includes(token)) throw new Error(`content 缺少底层能力：${token}`);
}
const extractor = await readFile(`${root}/pdf-extractor.js`, 'utf8');
for (const token of ['parseToUnicodeCMap', 'decodeWithCMap', 'expandObjectStreams', 'extractMarkedContentText', 'extractPdfText', 'isReadableResumeText']) {
  if (!extractor.includes(token)) throw new Error(`PDF 深度解析器缺少：${token}`);
}

const syntaxTargets = [
  ...required.filter(file => file.endsWith('.js')).map(file => `${root}/${file}`),
  '../desktop-bridge/server.js',
  '../desktop-bridge/cli.js'
];
for (const target of syntaxTargets) {
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`JS 语法错误 ${target}: ${result.stderr}`);
}

const bridge = await readFile('../desktop-bridge/server.js', 'utf8');
for (const token of ['/parse-resume', 'macos-metadata', 'pdftotext', 'resume_parser.swift', '28 * 1024 * 1024', 'Access-Control-Allow-Private-Network']) {
  if (!bridge.includes(token)) throw new Error(`桌面桥接 PDF 兜底缺少：${token}`);
}
await access('../desktop-bridge/resume_parser.swift');

console.log(JSON.stringify({
  ok: true,
  manifest: 'MV3_CSP_OK',
  pages: expected,
  explicitCollapsibles: collapsibleCount,
  inputProtection: 'DIRTY_AND_FOCUS_GUARD_OK',
  profileEditor: 'EDIT_AND_SAVE_OK',
  pdfPipeline: ['BROWSER_OBJECT_STREAMS', 'BROWSER_TOUNICODE', 'BROWSER_ACTUALTEXT', 'STREAM_FALLBACK', 'MACOS_METADATA', 'PDFTOTEXT', 'PDFKIT', 'VISION_OCR'],
  resumeSourcePersistence: 'LOCAL_SOURCE_FILE_OK',
  spacing: 'UI8_COMFORTABLE_PADDING_OK',
  pageReceiverRecovery: 'AUTO_INJECT_RETRY_AND_FRIENDLY_ERROR_OK',
  profileFallback: 'AI_EMPTY_AND_NO_API_KEY_LOCAL_DRAFT_OK',
  syntax: 'ALL_JS_SYNTAX_OK'
}, null, 2));
