#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const { execFile, execFileSync } = require('child_process');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const dataDir = path.join(os.homedir(), '.jobclaw');
const databasePath = path.join(dataDir, 'data.json');
fs.mkdirSync(dataDir, { recursive: true });

function emptyDatabase() {
  return { events: [], commands: [], snapshots: [] };
}

function loadDatabase() {
  try {
    return { ...emptyDatabase(), ...JSON.parse(fs.readFileSync(databasePath, 'utf8')) };
  } catch {
    return emptyDatabase();
  }
}

function saveDatabase(database) {
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(database, null, 2));
  fs.renameSync(temporaryPath, databasePath);
}

function buildReport(database) {
  const today = new Date().toLocaleDateString('zh-CN');
  const events = database.events.filter(event => new Date(event.ts).toLocaleDateString('zh-CN') === today);
  const sent = events.filter(event => event.message === '投递成功');
  const failed = events.filter(event => event.message === '投递失败');
  const analyzed = events.filter(event => String(event.message || '').startsWith('岗位分析完成'));
  const lines = sent.slice(0, 30).map(event => {
    const job = event.data?.job || {};
    return `- ${job.title || '岗位'}${job.company ? ` · ${job.company}` : ''}`;
  });
  return [
    `JobClaw 求职日报｜${today}`,
    '',
    `成功沟通：${sent.length}`,
    `沟通失败：${failed.length}`,
    `岗位分析：${analyzed.length}`,
    `运行事件：${events.length}`,
    '',
    ...(lines.length ? lines : ['- 暂无成功沟通记录']),
    '',
    'ByChris'
  ].join('\n');
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
          version: '1.2.37',
          parsers: {
            pdftotext: commandExists('pdftotext'),
            macosPdfKit: process.platform === 'darwin' && (fs.existsSync(path.join(__dirname, 'resume_parser')) || commandExists('xcrun'))
          },
          databasePath,
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
        return respond(response, 200, { ok: true, report: buildReport(database) }, origin);
      }
      if (requestUrl.pathname === '/parse-resume') {
        if (request.method !== 'POST') return respond(response, 405, { ok: false, error: 'method not allowed' }, origin);
        const result = await parseResumePdf(payload);
        return respond(response, result.ok ? 200 : 422, result, origin);
      }
      if (requestUrl.pathname === '/sync') {
        database.snapshots.unshift({ ts: Date.now(), payload });
        database.snapshots = database.snapshots.slice(0, 100);
        if (payload.event) {
          database.events.unshift(payload.event);
          database.events = database.events.slice(0, 1000);
        }
        saveDatabase(database);
        return respond(response, 200, { ok: true }, origin);
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
  console.log(`JobClaw Bridge 1.2.37 http://127.0.0.1:${config.port}`);
});
