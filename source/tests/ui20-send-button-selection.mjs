import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const code = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
let inputValue = '';
let valueWrites = 0;
let unrelatedClicks = 0;
let sendClicks = 0;
const bubbles = [];
let now = 0;

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const composer = {
  parentElement: null,
  contains(node) { return node === chatInput || node === actualSend; },
  querySelectorAll(selector) {
    if (selector === 'div,span,p,li' || /message|bubble|data-message-id|data-direction|data-from/.test(selector)) return bubbles.map(makeBubble);
    return [];
  },
  getBoundingClientRect: () => rect(470, 120, 650, 740)
};

function baseElement({ label = '', className = '', box = rect(0, 0, 100, 40) } = {}) {
  const element = {
    tagName: 'BUTTON', className, innerText: label, textContent: label, disabled: false, readOnly: false,
    parentElement: null,
    getBoundingClientRect: () => box,
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      if (name === 'aria-label') return '';
      if (name === 'ka') return '';
      return null;
    },
    matches(selector) { return selector === 'button' || selector === 'button,input[type="submit"]'; },
    closest(selector) {
      if (/button|\[role="button"\]|\[tabindex\]/.test(selector)) return this;
      if (selector === 'form') return null;
      return null;
    },
    contains() { return false; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, focus() {}, dispatchEvent() { return true; }
  };
  return element;
}

const chatInput = baseElement({ className: 'chat-input', box: rect(500, 710, 530, 120) });
chatInput.id = 'chat-input';
chatInput.tagName = 'TEXTAREA';
chatInput.parentElement = composer;
chatInput.matches = selector => selector === '#chat-input';
chatInput.closest = selector => selector === 'form' ? null : null;
chatInput._valueTracker = { setValue() {} };
Object.defineProperty(chatInput, 'value', {
  get() { return inputValue; },
  set(value) { valueWrites += 1; inputValue = String(value); }
});

const unrelatedSubmit = baseElement({ label: '搜索', className: 'global-submit', box: rect(300, 90, 110, 44) });
unrelatedSubmit.click = () => { unrelatedClicks += 1; };
const actualSend = baseElement({ label: '发送', className: 'chat-send-btn', box: rect(1040, 830, 72, 42) });
actualSend.parentElement = composer;
actualSend.click = () => {
  sendClicks += 1;
  bubbles.push(inputValue);
  inputValue = '';
};

const makeBubble = label => ({
  className: 'message-content message-mine', innerText: label, textContent: label,
  parentElement: null,
  getBoundingClientRect: () => rect(650, 520, 420, 80),
  getAttribute() { return null; }, matches() { return false; }, closest() { return null; },
  contains() { return false; }, querySelector() { return null; }, querySelectorAll() { return []; }
});

const document = {
  body: { innerText: '', parentElement: null }, documentElement: { dataset: {} },
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === '#chat-input' || selector === 'textarea#chat-input' || selector === '[contenteditable="true"]#chat-input') return [chatInput];
    if (selector === 'button' || selector === 'button[type="submit"]') return [unrelatedSubmit, actualSend];
    if (/send-btn|sendBtn|send-message|sendMessage|chat-send|aria-label/.test(selector)) return [actualSend];
    if (selector === 'button,a,span,div,li') return [unrelatedSubmit, actualSend, ...bubbles.map(makeBubble)];
    if (selector === 'div,span,p,li' || /message|bubble|data-message-id|chat.*text/.test(selector)) return bubbles.map(makeBubble);
    return [];
  },
  execCommand() { return false; }
};

class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } preventDefault() {} }
class FakeInputEvent extends FakeEvent {}
class FakeKeyboardEvent extends FakeEvent {}
class FakeMouseEvent extends FakeEvent {}
class FakePointerEvent extends FakeEvent {}
class FakeTextArea {}
class FakeInput {}
class FakeDate extends Date { static now() { now += 1000; return now; } }
const listeners = {};
const sandbox = {
  __JOBCLAW_TEST_MODE__: true, document, innerWidth: 1280, innerHeight: 900,
  location: { href: 'https://app.zhipin.com/' }, history: { back() {} },
  chrome: { runtime: { sendMessage: async message => {
    if (message?.type === 'TRUSTED_CHAT_INPUT' && message.action === 'replaceText') { inputValue = String(message.text || ''); valueWrites += 1; return { ok: true }; }
    if (message?.type === 'TRUSTED_CHAT_INPUT' && message.action === 'pressEnter') return { ok: true };
    if (message?.type === 'TRUSTED_CHAT_INPUT' && message.action === 'click') { actualSend.click(); return { ok: true }; }
    return { ok: true };
  }, onMessage: { addListener: listener => { listeners.message = listener; } } } },
  getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
  setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, Date: FakeDate,
  PointerEvent: FakePointerEvent, MouseEvent: FakeMouseEvent, InputEvent: FakeInputEvent,
  Event: FakeEvent, KeyboardEvent: FakeKeyboardEvent,
  HTMLTextAreaElement: FakeTextArea, HTMLInputElement: FakeInput,
  DataTransfer: class DataTransfer {}, File: class File {}, Uint8Array,
  atob: value => Buffer.from(value, 'base64').toString('binary'), console
};
sandbox.globalThis = sandbox; sandbox.window = sandbox;
vm.runInNewContext(code, sandbox, { filename: 'content-v37.js' });
const adapter = sandbox.__JOBCLAW_TEST_API__?.adapter;
if (!adapter) throw new Error('test adapter missing');
const greeting = '您好，我想应聘贵公司的前端开发实习生岗位，希望有机会进一步沟通，谢谢。';
const result = await adapter.sendGreeting(greeting, { chatReadyDelayMs: 100, beforeSendDelayMs: 100, confirmTimeoutMs: 9000 });
if (!result?.ok || !result.confirmed) throw new Error('招呼语没有完成发送确认');
if (unrelatedClicks !== 0) throw new Error('误点了聊天输入区以外的全局 submit 按钮');
if (sendClicks !== 1) throw new Error(`聊天发送按钮点击次数异常：${sendClicks}`);
if (valueWrites !== 1) throw new Error(`同一招呼语被重复覆盖：${valueWrites}`);
if (bubbles[0] !== greeting) throw new Error('聊天记录没有收到锁定的招呼语');
console.log(JSON.stringify({ ok: true, exactComposerButton: true, unrelatedSubmitIgnored: true, singleWrite: true, confirmedBubble: true }, null, 2));
