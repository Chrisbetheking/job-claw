import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const code = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const greeting = '您好，我想应聘贵公司的前端开发实习生岗位，希望有机会进一步沟通，谢谢。';
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
let transcriptNodes = [];

const root = {
  parentElement: null,
  contains(node) { return node === input || transcriptNodes.includes(node); },
  querySelectorAll(selector) {
    if (/message|bubble|data-message-id|data-direction|data-from|div,span,p,li/.test(selector)) return transcriptNodes;
    return [];
  },
  getBoundingClientRect: () => rect(450, 100, 700, 760)
};
const input = {
  id: 'chat-input', tagName: 'TEXTAREA', className: 'chat-input', innerText: '', textContent: '', value: '',
  parentElement: root,
  getBoundingClientRect: () => rect(500, 710, 580, 110),
  getAttribute() { return null; },
  matches(selector) { return selector === '#chat-input'; },
  closest() { return null; },
  contains() { return false; }, querySelectorAll() { return []; }, querySelector() { return null; },
  focus() {}, scrollIntoView() {}, dispatchEvent() { return true; }
};
const node = (className, box) => ({
  className, innerText: greeting, textContent: greeting, parentElement: root,
  getBoundingClientRect: () => box,
  getAttribute(name) { if (name === 'data-direction') return /mine/.test(className) ? 'outgoing' : ''; return null; },
  matches() { return false; }, closest() { return null; }, contains() { return false; },
  querySelectorAll() { return []; }, querySelector() { return null; }
});
const leftPreview = node('conversation-item-preview', rect(40, 280, 300, 66));
const outgoingBubble = node('message-content message-mine outgoing', rect(720, 510, 350, 86));
transcriptNodes = [leftPreview];

const document = {
  body: { innerText: '', parentElement: null, querySelectorAll: () => [] },
  documentElement: { dataset: {} },
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === '#chat-input' || selector === 'textarea#chat-input' || selector === '[contenteditable="true"]#chat-input') return [input];
    if (/message|bubble|data-message-id|data-direction|data-from|div,span,p,li/.test(selector)) return transcriptNodes;
    return [];
  }
};
class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } preventDefault() {} }
class FakeTextArea {}
class FakeInput {}
const sandbox = {
  __JOBCLAW_TEST_MODE__: true, document, innerWidth: 1280, innerHeight: 900,
  location: { href: 'https://app.zhipin.com/web/geek/chat?conversationId=abc' }, history: { back() {} },
  chrome: { runtime: { sendMessage: async () => ({ ok: true }), onMessage: { addListener() {} } } },
  getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
  setTimeout: () => 0, clearTimeout() {},
  PointerEvent: FakeEvent, MouseEvent: FakeEvent, InputEvent: FakeEvent,
  Event: FakeEvent, KeyboardEvent: FakeEvent,
  HTMLTextAreaElement: FakeTextArea, HTMLInputElement: FakeInput,
  DataTransfer: class DataTransfer {}, File: class File {}, Uint8Array,
  atob: value => Buffer.from(value, 'base64').toString('binary'), console
};
sandbox.globalThis = sandbox; sandbox.window = sandbox;
vm.runInNewContext(code, sandbox, { filename: 'content-v37.js' });
const adapter = sandbox.__JOBCLAW_TEST_API__?.adapter;
if (!adapter) throw new Error('adapter missing');
if (adapter.greetingVisibleInChat(greeting)) throw new Error('左侧其他 HR 会话预览被误判为当前已发送消息');
transcriptNodes = [leftPreview, outgoingBubble];
if (!adapter.greetingVisibleInChat(greeting)) throw new Error('当前聊天右侧发出气泡未被识别');
console.log('UI22_LEFT_PREVIEW_GUARD_OK');
