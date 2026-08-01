import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const listeners = [];
const document = {
  body: { innerText: '' },
  documentElement: { dataset: {} },
  querySelector: () => null,
  querySelectorAll: () => []
};
const sandbox = {
  __JOBCLAW_TEST_MODE__: true,
  document,
  innerWidth: 1200,
  innerHeight: 900,
  location: { href: 'https://www.zhipin.com/web/geek/job' },
  history: { back() {} },
  chrome: {
    runtime: {
      id: 'test-extension',
      sendMessage: async () => ({ ok: true }),
      onMessage: { addListener: fn => listeners.push(fn) }
    }
  },
  getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
  setTimeout: () => 0,
  clearTimeout: () => {},
  MouseEvent: class MouseEvent {},
  InputEvent: class InputEvent {},
  Event: class Event {},
  KeyboardEvent: class KeyboardEvent {},
  HTMLTextAreaElement: class HTMLTextAreaElement {},
  HTMLInputElement: class HTMLInputElement {},
  DataTransfer: class DataTransfer {},
  File: class File {},
  Uint8Array,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  console
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(content, sandbox, { filename: 'content-v37.js' });
vm.runInNewContext(content, sandbox, { filename: 'content-v37.js' });
if (listeners.length !== 1) throw new Error(`same-version duplicate listener: ${listeners.length}`);
if (document.documentElement.dataset.jobclawContentVersion !== '2.1.0') throw new Error('DOM runtime stamp missing');
const probe = await new Promise(resolve => listeners[0]({ type: 'PROBE' }, {}, resolve));
if (!probe.ok || probe.contentVersion !== '2.1.0' || probe.contentFile !== 'content-v37.js') throw new Error('versioned probe failed');
if (!content.includes("const JOBCLAW_CONTENT_VERSION = '2.1.0'")) throw new Error('content version constant missing');
console.log(JSON.stringify({ ok: true, versionedFile: 'PASS', duplicateInjectionGuard: 'PASS', probeVersionHandshake: 'PASS' }, null, 2));
