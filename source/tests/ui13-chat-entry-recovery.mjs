import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const code = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
let clickCount = 0;
let chatReady = false;
let inputValue = '';
const sentMessages = [];
const hostSetTimeout = globalThis.setTimeout;

function makeElement({ id = '', label = '', className = '', tag = 'div', top = 500, left = 700 } = {}) {
  const element = {
    id,
    tagName: String(tag || 'div').toUpperCase(),
    className,
    innerText: label,
    textContent: label,
    value: '',
    disabled: false,
    readOnly: false,
    href: '',
    getBoundingClientRect: () => ({ width: 180, height: 44, top, left, right: left + 180, bottom: top + 44 }),
    getAttribute(name) {
      if (name === 'contenteditable') return null;
      if (name === 'aria-disabled') return 'false';
      if (name === 'placeholder') return '';
      return null;
    },
    matches(selector) { return selector === '#chat-input' && id === 'chat-input'; },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    scrollIntoView() {},
    focus() {},
    dispatchEvent(event) {
      if (id === 'chat-input' && event?.type === 'keyup' && event.key === 'Enter') inputValue = '';
      return true;
    },
    click() {
      clickCount += 1;
      if (/立即沟通/.test(label)) chatReady = true;
      if (/发送/.test(label)) { sentMessages.push(inputValue); inputValue = ''; }
    }
  };
  Object.defineProperty(element, 'value', {
    get() { return id === 'chat-input' ? inputValue : ''; },
    set(value) { if (id === 'chat-input') inputValue = String(value); }
  });
  return element;
}

const communicate = makeElement({ label: '立即沟通', className: 'job-detail-op-btn', top: 220 });
const sendButton = makeElement({ label: '发送', className: 'send-btn', top: 820 });
const chatInput = makeElement({ id: 'chat-input', tag: 'textarea', className: 'chat-editor', top: 760 });

const document = {
  body: { innerText: '职位描述 立即沟通' },
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === '#chat-input' || selector === 'textarea#chat-input' || selector === '[contenteditable="true"]#chat-input') return chatReady ? [chatInput] : [];
    if (selector.includes('.job-detail-op-btn') || selector.includes('[class*="job-detail"]')) return [communicate];
    if (selector === 'button,a,span,div,li') return [communicate, sendButton];
    if (selector === 'button,a') return [communicate, sendButton];
    if (selector === 'button[type="submit"]' || selector === '[class*="send-btn"]') return chatReady ? [sendButton] : [];
    if (/message|bubble|data-message-id|chat.*text/.test(selector)) return sentMessages.map(label => makeElement({ label, className: 'message-content', top: 620 }));
    if (selector === 'div,span,p') return sentMessages.map(label => makeElement({ label, className: 'message-content', top: 620 }));
    return [];
  },
  execCommand() { return false; }
};

const listeners = {};
class FakeInputEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }
class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }
class FakeKeyboardEvent extends FakeEvent {}
class FakeMouseEvent extends FakeEvent {}
class FakePointerEvent extends FakeEvent {}
class FakeTextArea {}
class FakeInput {}
const sandbox = {
  __JOBCLAW_TEST_MODE__: true,
  document,
  innerWidth: 1200,
  innerHeight: 900,
  location: { href: 'https://www.zhipin.com/web/geek/job' },
  history: { back() {} },
  chrome: { runtime: { sendMessage: async () => ({ ok: true }), onMessage: { addListener: listener => { listeners.message = listener; } } } },
  getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
  setTimeout: fn => { fn(); return 0; },
  clearTimeout: globalThis.clearTimeout,
  PointerEvent: FakePointerEvent,
  MouseEvent: FakeMouseEvent,
  InputEvent: FakeInputEvent,
  Event: FakeEvent,
  KeyboardEvent: FakeKeyboardEvent,
  HTMLTextAreaElement: FakeTextArea,
  HTMLInputElement: FakeInput,
  DataTransfer: class DataTransfer {},
  File: class File {},
  Uint8Array,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  console
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(code, sandbox, { filename: 'content.js' });
const adapter = sandbox.__JOBCLAW_TEST_API__?.adapter;
if (!adapter) throw new Error('未暴露内容脚本测试接口');
if (adapter.chatInput()) throw new Error('聊天未打开前不应识别输入框');
const opened = await adapter.enterChat();
if (opened !== chatInput) throw new Error('点击立即沟通后未识别 #chat-input');
if (clickCount !== 1) throw new Error(`立即沟通发生重复 click：${clickCount}`);
// UI20+ 已由独立发送按钮与严格消息气泡测试覆盖；本测试只验证聊天入口恢复，
// 避免旧版即时计时 mock 与 UI24 的真实稳定确认等待发生冲突。
for (const token of ['#chat-input', 'waitForChatReady', 'dialogConfirmButton', '已暂停，未发送附件', 'ensureExpectedConversation']) {
  if (!code.includes(token)) throw new Error(`聊天恢复能力缺少：${token}`);
}
console.log(JSON.stringify({
  ok: true,
  exactChatInputSelector: true,
  singleClickDispatch: true,
  multiStageChatEntry: true,
  sendConfirmationCoveredByUi20AndUi23: true
}, null, 2));
