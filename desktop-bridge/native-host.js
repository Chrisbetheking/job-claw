#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const base = `http://127.0.0.1:${config.port || 17899}`;
const allowedPaths = new Set([
  '/status', '/commands', '/report', '/report/generate', '/report/status',
  '/parse-resume', '/company/verify', '/sync', '/command'
]);

function send(message) {
  const data = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(data.length, 0);
  process.stdout.write(Buffer.concat([header, data]));
}

async function request(pathname, body) {
  const controller = new AbortController();
  const timeoutMs = pathname === '/parse-resume' ? 190000 : 10000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${pathname}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function isRunning() {
  try {
    await request('/status');
    return true;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isRunning()) return;
  const logDir = path.join(process.env.HOME || __dirname, '.jobclaw');
  fs.mkdirSync(logDir, { recursive: true });
  const stdout = fs.openSync(path.join(logDir, 'bridge.log'), 'a');
  const stderr = fs.openSync(path.join(logDir, 'bridge-error.log'), 'a');
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore', stdout, stderr],
    env: { ...process.env, HOME: process.env.HOME || '' }
  });
  child.unref();
  fs.closeSync(stdout);
  fs.closeSync(stderr);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 250));
    if (await isRunning()) return;
  }
  throw new Error('本地桥接自动启动失败 请重新运行安装脚本并查看 ~/.jobclaw/bridge-error.log');
}

async function handle(message = {}) {
  const pathname = String(message.path || '');
  if (!allowedPaths.has(pathname)) throw new Error('unsupported native bridge path');
  await ensureServer();
  const payload = await request(pathname, message.body || null);
  return { ok: true, payload };
}

let buffer = Buffer.alloc(0);
let queue = Promise.resolve();
process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (length > 64 * 1024 * 1024) {
      send({ ok: false, error: 'native message too large' });
      process.exit(1);
    }
    if (buffer.length < 4 + length) break;
    const body = buffer.subarray(4, 4 + length);
    buffer = buffer.subarray(4 + length);
    queue = queue.then(async () => {
      try {
        send(await handle(JSON.parse(body.toString('utf8'))));
      } catch (error) {
        send({ ok: false, error: error?.name === 'AbortError' ? '本地桥接请求超时' : String(error?.message || error) });
      }
    });
  }
});

process.stdin.on('end', () => {
  queue.finally(() => process.exit(0));
});
