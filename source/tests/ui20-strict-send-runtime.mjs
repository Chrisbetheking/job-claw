import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const code = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
let inputValue = '';
let now = 0;
const listeners = {};

function makeElement({ id = '', label = '', className = '', top = 700 } = {}) {
  const element = {
    id, tagName: id === 'chat-input' ? 'TEXTAREA' : 'BUTTON', className, innerText: label, textContent: label, disabled: false, readOnly: false,
    getBoundingClientRect: () => ({ width: 180, height: 44, top, left: 700, right: 880, bottom: top + 44 }),
    getAttribute(name) { if (name === 'aria-disabled') return 'false'; return null; },
    matches(selector) { return selector === '#chat-input' && id === 'chat-input'; },
    closest() { return null; }, contains() { return false; }, querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, focus() {}, dispatchEvent(event) {
      if (id === 'chat-input' && event?.type === 'keyup' && event.key === 'Enter') inputValue = '';
      return true;
    },
    click() { if (/发送/.test(label)) inputValue = ''; }
  };
  Object.defineProperty(element, 'value', {
    get() { return id === 'chat-input' ? inputValue : ''; },
    set(value) { if (id === 'chat-input') inputValue = String(value); }
  });
  return element;
}
const chatInput = makeElement({ id: 'chat-input', className: 'chat-editor' });
const sendButton = makeElement({ label: '发送', className: 'send-btn', top: 820 });
const document = {
  body: { innerText: '' }, documentElement: { dataset: {} },
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === '#chat-input' || selector === 'textarea#chat-input' || selector === '[contenteditable="true"]#chat-input') return [chatInput];
    if (selector === 'button[type="submit"]' || selector === '[class*="send-btn"]') return [sendButton];
    if (selector === 'button,a,span,div,li') return [sendButton];
    return [];
  },
  execCommand() { return false; }
};
class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }
class FakeInputEvent extends FakeEvent {}
class FakeKeyboardEvent extends FakeEvent {}
class FakeMouseEvent extends FakeEvent {}
class FakePointerEvent extends FakeEvent {}
class FakeTextArea {}
class FakeInput {}
class FakeDate extends Date { static now() { now += 1000; return now; } }
const sandbox = {
  __JOBCLAW_TEST_MODE__: true, document, innerWidth: 1200, innerHeight: 900,
  location: { href: 'https://app.zhipin.com/' }, history: { back() {} },
  chrome: { runtime: { sendMessage: async message => {
    if (message?.type === 'TRUSTED_CHAT_INPUT' && message.action === 'replaceText') { inputValue = String(message.text || ''); return { ok: true }; }
    if (message?.type === 'TRUSTED_CHAT_INPUT' && message.action === 'pressEnter') { inputValue = ''; return { ok: true }; }
    return { ok: true };
  }, onMessage: { addListener: listener => { listeners.message = listener; } } } },
  getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
  setTimeout: fn => { fn(); return 0; }, clearTimeout: () => {},
  Date: FakeDate, PointerEvent: FakePointerEvent, MouseEvent: FakeMouseEvent,
  InputEvent: FakeInputEvent, Event: FakeEvent, KeyboardEvent: FakeKeyboardEvent,
  HTMLTextAreaElement: FakeTextArea, HTMLInputElement: FakeInput,
  DataTransfer: class DataTransfer {}, File: class File {}, Uint8Array,
  atob: value => Buffer.from(value, 'base64').toString('binary'), console
};
sandbox.globalThis = sandbox; sandbox.window = sandbox;
vm.runInNewContext(code, sandbox, { filename: 'content-v37.js' });
const adapter = sandbox.__JOBCLAW_TEST_API__?.adapter;
if (!adapter) throw new Error('test adapter missing');
let failedSafely = false;
try {
  await adapter.sendGreeting('您好，我想应聘贵公司的前端开发实习生岗位，希望有机会进一步沟通。', {
    chatReadyDelayMs: 100, beforeSendDelayMs: 100, confirmTimeoutMs: 9000
  });
} catch (error) {
  failedSafely = /已暂停|未继续发送简历图片/.test(String(error.message || ''));
}
if (!failedSafely) throw new Error('输入框清空但聊天记录无文字时，必须判定失败并停止附件');
console.log(JSON.stringify({ ok: true, inputClearIsNotSuccess: true, noTextNoAttachment: true }, null, 2));
