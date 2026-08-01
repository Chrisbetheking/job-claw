#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const { execFile, execFileSync, spawn } = require('child_process');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const dataDir = path.join(os.homedir(), '.jobclaw');
const databasePath = path.join(dataDir, 'data.json');
const reportsDir = path.join(dataDir, 'reports');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

function emptyDatabase() {
  return { events: [], commands: [], snapshots: [], reports: [], meta: {} };
}

function loadDatabase() {
  try {
    const raw = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
    return {
      ...emptyDatabase(),
      ...raw,
      events: Array.isArray(raw.events) ? raw.events : [],
      commands: Array.isArray(raw.commands) ? raw.commands : [],
      snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
      reports: Array.isArray(raw.reports) ? raw.reports : [],
      meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {}
    };
  } catch {
    return emptyDatabase();
  }
}

function saveDatabase(database) {
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(database, null, 2));
  fs.renameSync(temporaryPath, databasePath);
}

function localDateKey(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function eventMatches(event, pattern) {
  return pattern.test(String(event?.message || ''));
}

function latestSnapshot(database, dateKey = localDateKey()) {
  return database.snapshots.find(entry => localDateKey(entry.ts || entry.payload?.ts || 0) === dateKey)?.payload
    || database.snapshots[0]?.payload
    || {};
}

function percentage(value, total) {
  if (!total) return '0%';
  return `${Math.round(Number(value || 0) / Number(total || 1) * 100)}%`;
}

function buildReport(database, requestedDate = localDateKey()) {
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(requestedDate || '')) ? String(requestedDate) : localDateKey();
  const events = database.events.filter(event => localDateKey(event.ts) === dateKey);
  const snapshot = latestSnapshot(database, dateKey);
  const stats = snapshot.stats || {};
  const successEvents = events.filter(event => eventMatches(event, /求职投递成功|投递成功|成功沟通/));
  const failedEvents = events.filter(event => eventMatches(event, /求职投递失败|投递失败|发送失败/));
  const analyzedEvents = events.filter(event => eventMatches(event, /^岗位分析完成|岗位 AI 分析完成/));
  const blockedEvents = events.filter(event => eventMatches(event, /风险.*跳过|安全预检已跳过|高风险|明确硬性冲突/));
  const duplicateEvents = events.filter(event => eventMatches(event, /重复岗位|去重/));
  const simulatedEvents = events.filter(event => eventMatches(event, /模拟投递已通过|模拟运行/));
  const sent = Math.max(Number(stats.sent || 0), successEvents.length);
  const failed = Math.max(Number(stats.failed || 0), failedEvents.length);
  const analyzed = Math.max(Number(stats.analyzed || 0), analyzedEvents.length);
  const discovered = Number(stats.discovered || 0);
  const blocked = Math.max(Number(stats.blocked || 0), blockedEvents.length);
  const duplicates = Math.max(Number(stats.duplicates || 0), duplicateEvents.length);
  const lowQuality = Number(stats.lowQuality || 0);
  const stagnantTasks = Number(stats.stagnantTasks || 0);
  const filterFailures = Number(stats.filterFailures || 0);
  const simulated = Math.max(Number(stats.simulated || 0), simulatedEvents.length);
  const jobs = successEvents
    .map(event => event.data?.job || {})
    .filter(job => job.title || job.company)
    .slice(0, 20);
  const companyCounts = new Map();
  for (const job of jobs) {
    const company = String(job.company || '未标注公司');
    companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
  }
  const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const strategy = snapshot.config?.batchStrategy === 'full-mass' ? '完全海投' : '安全海投';
  const pacing = { conservative: '保守', standard: '标准', efficient: '高效', custom: '自定义' }[snapshot.config?.pacingPreset] || '标准';
  const lines = [
    `JobClaw × OpenClaw 求职日报｜${dateKey}`,
    '',
    `投递策略：${strategy} · ${pacing}节奏`,
    `今日目标：${Number(snapshot.config?.dailyTarget || 0) || '未设置'}`,
    '',
    `采集岗位：${discovered}`,
    `AI分析：${analyzed}`,
    `成功沟通：${sent}`,
    `沟通失败：${failed}`,
    `风险拦截：${blocked}`,
    `重复跳过：${duplicates}`,
    `明显低质跳过：${lowQuality}`,
    `重复过多自动切换：${stagnantTasks}`,
    `页面筛选失败：${filterFailures}`,
    `模拟通过：${simulated}`,
    `投递成功率：${percentage(sent, sent + failed)}`,
    `当前待处理：${Number(snapshot.queue?.waiting || stats.pending || 0)}`,
    '',
    `当前状态：${snapshot.workflow?.statusText || '今日暂无运行状态'}`
  ];
  if (topCompanies.length) {
    lines.push('', '主要投递公司：', ...topCompanies.map(([company, count]) => `- ${company} ${count} 个岗位`));
  }
  if (jobs.length) {
    lines.push('', '成功沟通岗位：', ...jobs.slice(0, 12).map(job => `- ${job.title || '岗位'}${job.company ? ` · ${job.company}` : ''}`));
  } else {
    lines.push('', '成功沟通岗位：', '- 暂无成功沟通记录');
  }
  const errors = events.filter(event => event.level === 'error' || event.level === 'warning').slice(0, 5);
  if (errors.length) {
    lines.push('', '需要注意：', ...errors.map(event => `- ${event.message}`));
  }
  lines.push('', `报告文件：${path.join(reportsDir, `${dateKey}.md`)}`, '', 'ByChris');
  return lines.join('\n');
}

function saveReportFile(database, dateKey = localDateKey(), options = {}) {
  const report = buildReport(database, dateKey);
  const reportPath = path.join(reportsDir, `${dateKey}.md`);
  const latestPath = path.join(reportsDir, 'latest.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  fs.writeFileSync(latestPath, report, 'utf8');
  database.reports = [
    { date: dateKey, path: reportPath, generatedAt: Date.now(), automatic: Boolean(options.automatic) },
    ...database.reports.filter(item => item.date !== dateKey)
  ].slice(0, 90);
  database.meta.lastReportDate = dateKey;
  database.meta.lastReportAt = Date.now();
  saveDatabase(database);
  return { report, reportPath, latestPath, date: dateKey, generatedAt: database.meta.lastReportAt };
}

function notifyReport(result, database) {
  const snapshot = latestSnapshot(database, result.date);
  if (snapshot.config?.dailyReportNotification === false) return false;
  const stats = snapshot.stats || {};
  const summary = `成功沟通 ${Number(stats.sent || 0)} · 分析 ${Number(stats.analyzed || 0)} · 失败 ${Number(stats.failed || 0)}`;
  if (process.platform === 'darwin') {
    const script = `display notification ${JSON.stringify(summary)} with title ${JSON.stringify('JobClaw OpenClaw 日报')}`;
    spawn('/usr/bin/osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  return false;
}

function reportSchedule(snapshot = {}) {
  const enabled = snapshot.config?.dailyReportEnabled !== false;
  const time = /^\d{2}:\d{2}$/.test(String(snapshot.config?.dailyReportTime || '')) ? snapshot.config.dailyReportTime : '20:30';
  const [hour, minute] = time.split(':').map(Number);
  return { enabled, time, hour, minute };
}

function maybeGenerateScheduledReport() {
  const database = loadDatabase();
  const snapshot = latestSnapshot(database);
  const schedule = reportSchedule(snapshot);
  if (!schedule.enabled || !database.snapshots.length) return;
  const now = new Date();
  const dateKey = localDateKey(now);
  if (database.meta.lastReportDate === dateKey) return;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const scheduledMinutes = schedule.hour * 60 + schedule.minute;
  if (currentMinutes < scheduledMinutes) return;
  const result = saveReportFile(database, dateKey, { automatic: true });
  notifyReport(result, database);
}

function runFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      encoding: 'utf8',
      timeout: options.timeout || 30000,
      maxBuffer: options.maxBuffer || 12 * 1024 * 1024,
      env: { ...process.env, LANG: 'zh_CN.UTF-8', LC_ALL: 'zh_CN.UTF-8' }
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else resolve({ stdout, stderr });
    });
  });
}

function commandExists(command) {
  try {
    execFileSync('/usr/bin/which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function normalizeResumeText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\(null\)$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readableResumeText(text) {
  const compact = String(text || '').replace(/\s/g, '');
  if (compact.length < 40) return false;
  const readable = (compact.match(/[\u3400-\u9fffA-Za-z0-9]/g) || []).length;
  const bad = (compact.match(/[\x00-\x08\x0b\x0c\x0e-\x1f�]/g) || []).length;
  const hints = (String(text).match(/简历|教育|经历|项目|技能|电话|邮箱|GitHub|工作|实习|resume|education|experience|skills/gi) || []).length;
  return (readable - bad) / compact.length >= .5 && (hints > 0 || compact.length >= 220);
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/s);
  if (!match) throw new Error('PDF 数据格式无效');
  return Buffer.from(match[2], 'base64');
}

async function parseResumePdf(payload) {
  const bytes = decodeDataUrl(payload.dataUrl);
  if (!bytes.length || bytes.length > 18 * 1024 * 1024) throw new Error('PDF 文件大小无效');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobclaw-resume-'));
  const filePath = path.join(tempDir, 'resume.pdf');
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  const candidates = [];
  const diagnostics = [];
  const record = (method, ok, detail = '') => diagnostics.push({ method, ok, detail: String(detail || '').slice(0, 240) });
  try {
    if (process.platform === 'darwin') {
      try { await runFile('/usr/bin/mdimport', ['-i', filePath], { timeout: 20000 }); } catch {}
      try {
        const { stdout } = await runFile('/usr/bin/mdls', ['-raw', '-name', 'kMDItemTextContent', filePath], { timeout: 20000 });
        const text = normalizeResumeText(stdout);
        const ok = readableResumeText(text);
        record('macos-metadata', ok, ok ? `${text.length} 字` : '无可靠正文');
        if (ok) candidates.push({ ok: true, text, method: 'macos-metadata' });
      } catch (error) { record('macos-metadata', false, error.message); }
    }

    if (commandExists('pdftotext')) {
      try {
        const { stdout } = await runFile('pdftotext', ['-layout', '-enc', 'UTF-8', filePath, '-'], { timeout: 50000 });
        const text = normalizeResumeText(stdout);
        const ok = readableResumeText(text);
        record('pdftotext', ok, ok ? `${text.length} 字` : '无可靠正文');
        if (ok) candidates.push({ ok: true, text, method: 'pdftotext' });
      } catch (error) { record('pdftotext', false, error.message); }
    } else record('pdftotext', false, '未安装');

    if (!candidates.length && process.platform === 'darwin') {
      const compiledParser = path.join(__dirname, 'resume_parser');
      try {
        let stdout = '';
        if (fs.existsSync(compiledParser)) {
          ({ stdout } = await runFile(compiledParser, [filePath], { timeout: 180000, maxBuffer: 20 * 1024 * 1024 }));
        } else if (commandExists('xcrun')) {
          const script = path.join(__dirname, 'resume_parser.swift');
          ({ stdout } = await runFile('/usr/bin/xcrun', ['swift', script, filePath], { timeout: 180000, maxBuffer: 20 * 1024 * 1024 }));
        } else {
          throw new Error('系统 OCR 组件不可用');
        }
        const lastLine = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || '{}';
        const result = JSON.parse(lastLine);
        const text = normalizeResumeText(result.text);
        const ok = Boolean(result.ok && readableResumeText(text));
        record(result.method || 'macos-vision-ocr', ok, ok ? `${text.length} 字` : result.error || '无可靠正文');
        if (ok) candidates.push({ ...result, text });
      } catch (error) { record('macos-vision-ocr', false, error.message); }
    }

    if (!candidates.length) {
      return { ok: false, text: '', method: 'none', error: '本机解析与 OCR 均未识别到可靠正文', diagnostics };
    }
    candidates.sort((a, b) => b.text.length - a.text.length);
    return { ...candidates[0], pageCount: candidates[0].pageCount || 0, diagnostics };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}


function normalizeCompanyName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/有限责任公司|股份有限公司|有限公司|集团|分公司|公司/g, '')
    .replace(/[\s·•｜|()（）【】\[\]<>《》,，。.:：;；_\-—]/g, '')
    .trim();
}

function localCompanyRisk(job = {}) {
  const companyName = String(job.company || job.companyName || '').trim();
  const source = [job.title, companyName, job.description, job.cardText].filter(Boolean).join('\n');
  const signals = [];
  let score = 0;
  const checks = [
    [/培训费|入职费|报名费|押金|保证金|服装费|工牌费|材料费/, 55, '岗位描述出现入职前收费'],
    [/培训贷|贷款培训|先转账|私人收款码|个人收款码/, 55, '岗位描述出现高风险支付要求'],
    [/刷单|代充|跑分|资金盘/, 70, '岗位描述包含高风险业务关键词'],
    [/加微信详聊|下载不明APP|扫码进群/, 25, '沟通方式偏离正常招聘流程'],
    [/高薪日结|轻松月入|无门槛高薪/, 25, '薪资宣传明显夸张']
  ];
  for (const [pattern, points, label] of checks) {
    if (pattern.test(source)) { score += points; signals.push(label); }
  }
  if (!companyName) { score += 35; signals.push('公司名称缺失'); }
  const riskLevel = score >= 55 ? 'high' : score >= 25 ? 'medium' : companyName ? 'low' : 'unknown';
  return {
    provider: 'openclaw-local-rules',
    companyName,
    normalizedName: normalizeCompanyName(companyName),
    status: companyName ? 'unverified' : 'unknown',
    verified: false,
    riskLevel,
    confidence: companyName ? 0.58 : 0.2,
    signals: signals.length ? signals : ['本地规则未发现明显风险关键词'],
    evidence: [],
    checkedAt: Date.now()
  };
}

async function verifyCompany(payload = {}) {
  const job = payload.job || {};
  const companyName = String(payload.companyName || job.company || '').trim();
  const fallback = localCompanyRisk({ ...job, company: companyName });
  const provider = config.companyProvider || {};
  if (!provider.endpoint || provider.mode === 'local') return fallback;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(provider.timeoutMs || 8000)));
  try {
    const apiKey = provider.apiKeyEnv ? String(process.env[provider.apiKeyEnv] || '') : '';
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ companyName, job, source: 'jobclaw-openclaw' }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `企业Provider HTTP ${response.status}`);
    const raw = result.result || result;
    return {
      ...fallback,
      ...raw,
      provider: raw.provider || provider.mode || 'mcp-http',
      companyName: raw.companyName || companyName,
      normalizedName: raw.normalizedName || normalizeCompanyName(raw.companyName || companyName),
      verified: Boolean(raw.verified || raw.status === 'active'),
      signals: [...new Set([...(Array.isArray(raw.signals) ? raw.signals : []), ...fallback.signals])].slice(0, 12),
      evidence: Array.isArray(raw.evidence) ? raw.evidence.slice(0, 12) : [],
      checkedAt: Date.now()
    };
  } catch (error) {
    return {
      ...fallback,
      provider: 'provider-fallback',
      signals: [`企业Provider不可用 已降级本地规则 ${error.name === 'AbortError' ? '请求超时' : error.message}`, ...fallback.signals]
    };
  } finally {
    clearTimeout(timeout);
  }
}

function respond(response, status, payload, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://127.0.0.1:${config.port}`);
  const origin = request.headers.origin || '';
  if (request.method === 'OPTIONS') return respond(response, 200, {}, origin);
  const allowedOrigin = config.extensionId ? `chrome-extension://${config.extensionId}` : '';
  if (origin && origin !== allowedOrigin) {
    return respond(response, 403, { ok: false, error: 'origin denied' }, origin);
  }

  let body = '';
  let tooLarge = false;
  request.on('data', chunk => {
    body += chunk;
    if (body.length > 28 * 1024 * 1024) tooLarge = true;
  });
  request.on('end', async () => {
    if (tooLarge) return respond(response, 413, { ok: false, error: 'request too large' }, origin);
    try {
      const database = loadDatabase();
      const payload = body ? JSON.parse(body) : {};
      if (requestUrl.pathname === '/status') {
        return respond(response, 200, {
          ok: true,
          name: 'jobclaw-bridge',
          version: '2.0.1',
          transport: 'http',
          extensionId: config.extensionId || '',
          companyProvider: { mode: config.companyProvider?.mode || 'local', configured: Boolean(config.companyProvider?.endpoint) },
          parsers: {
            pdftotext: commandExists('pdftotext'),
            macosPdfKit: process.platform === 'darwin' && (fs.existsSync(path.join(__dirname, 'resume_parser')) || commandExists('xcrun'))
          },
          databasePath,
          reportsDir,
          reporting: reportSchedule(latestSnapshot(database)),
          lastReportAt: Number(database.meta?.lastReportAt || 0),
          pendingCommands: database.commands.length,
          events: database.events.length
        }, origin);
      }
      if (requestUrl.pathname === '/commands') {
        const commands = database.commands.splice(0);
        saveDatabase(database);
        return respond(response, 200, { ok: true, commands }, origin);
      }
      if (requestUrl.pathname === '/report') {
        const date = requestUrl.searchParams.get('date') || localDateKey();
        return respond(response, 200, { ok: true, report: buildReport(database, date), date, reportsDir }, origin);
      }
      if (requestUrl.pathname === '/report/generate') {
        if (request.method !== 'POST') return respond(response, 405, { ok: false, error: 'method not allowed' }, origin);
        const date = String(payload.date || localDateKey());
        const result = saveReportFile(database, date, { automatic: false });
        if (payload.notify !== false) notifyReport(result, database);
        return respond(response, 200, { ok: true, ...result }, origin);
      }
      if (requestUrl.pathname === '/report/status') {
        return respond(response, 200, { ok: true, reportsDir, latest: database.reports[0] || null, schedule: reportSchedule(latestSnapshot(database)) }, origin);
      }
      if (requestUrl.pathname === '/parse-resume') {
        if (request.method !== 'POST') return respond(response, 405, { ok: false, error: 'method not allowed' }, origin);
        const result = await parseResumePdf(payload);
        return respond(response, result.ok ? 200 : 422, result, origin);
      }
      if (requestUrl.pathname === '/company/verify') {
        if (request.method !== 'POST') return respond(response, 405, { ok: false, error: 'method not allowed' }, origin);
        const result = await verifyCompany(payload);
        return respond(response, 200, { ok: true, result }, origin);
      }
      if (requestUrl.pathname === '/sync') {
        if (payload.snapshot) {
          database.snapshots.unshift({ ts: Date.now(), payload: payload.snapshot });
          database.snapshots = database.snapshots.slice(0, 500);
        }
        if (payload.event) {
          database.events.unshift(payload.event);
          database.events = database.events.slice(0, 3000);
        }
        saveDatabase(database);
        return respond(response, 200, { ok: true, syncedAt: Date.now() }, origin);
      }
      if (requestUrl.pathname === '/command') {
        const allowed = new Set(['start', 'pause', 'stop']);
        if (!allowed.has(payload.type)) {
          return respond(response, 400, { ok: false, error: 'unsupported command' }, origin);
        }
        const command = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ts: Date.now(), type: payload.type };
        database.commands.push(command);
        database.commands = database.commands.slice(-100);
        saveDatabase(database);
        return respond(response, 200, { ok: true, command }, origin);
      }
      return respond(response, 404, { ok: false, error: 'not found' }, origin);
    } catch (error) {
      return respond(response, 500, { ok: false, error: error.message }, origin);
    }
  });
});

server.on('clientError', (error, socket) => {
  console.error('[clientError]', error.message);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.on('error', error => {
  console.error('[serverError]', error.stack || error.message);
  process.exitCode = 1;
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`JobClaw Bridge 2.0.1 Formal http://127.0.0.1:${config.port}`);
  maybeGenerateScheduledReport();
});

const reportTimer = setInterval(() => { try { maybeGenerateScheduledReport(); } catch (error) { console.error('[dailyReport]', error.message); } }, 60 * 1000);
reportTimer.unref?.();
