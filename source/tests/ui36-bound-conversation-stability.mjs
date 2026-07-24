import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const manifest = JSON.parse(await readFile('dist/chrome-extension/manifest.json', 'utf8'));
if (manifest.version !== '1.2.37') throw new Error(`UI37 version mismatch: ${manifest.version}`);

class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } preventDefault() {} }
class FakeInputEvent extends FakeEvent {}
class FakeKeyboardEvent extends FakeEvent {}
class FakeMouseEvent extends FakeEvent {}
class FakePointerEvent extends FakeEvent {}
class FakeTextArea {}
class FakeInput {}
const editor = { value: '', focus() {}, getAttribute() { return ''; }, getBoundingClientRect() { return { width: 500, height: 80, left: 450, top: 700, right: 950, bottom: 780 }; } };
const document = {
  body: { innerText: '' },
  documentElement: { dataset: {} },
  activeElement: editor,
  querySelector: () => null,
  querySelectorAll: () => []
};
const sandbox = {
  __JOBCLAW_TEST_MODE__: true,
  document,
  innerWidth: 1200,
  innerHeight: 900,
  location: { href: 'https://app.zhipin.com/web/geek/chat', assign(value) { this.href = String(value); } },
  history: { back() {} },
  chrome: { runtime: { sendMessage: async () => ({ ok: true }), onMessage: { addListener() {} } } },
  getComputedStyle: () => ({ visibility: 'visible', display: 'block', backgroundColor: 'rgb(255,255,255)', boxShadow: 'none' }),
  setTimeout: () => 0,
  clearTimeout: () => {},
  URL,
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
vm.runInNewContext(content, sandbox, { filename: 'content-v37.js' });
const adapter = sandbox.__JOBCLAW_TEST_API__?.adapter;
if (!adapter) throw new Error('UI37 adapter not exposed');

const expected = { pendingId: 'pending-36', recruiterName: '张国举', company: '冠晟', jobTitle: '前端开发实习生' };
const confirmedContext = {
  key: 'hr:张国举|company:冠晟',
  url: 'https://app.zhipin.com/web/geek/chat',
  recruiterName: '张国举',
  companyName: '冠晟',
  headerText: '张国举 冠晟 招聘者',
  selectedText: '张国举 冠晟 招聘者',
  capturedAt: Date.now()
};
sandbox.__JOBCLAW_CONTENT_RUNTIME__.chatBinding = {
  pendingId: 'pending-36',
  key: confirmedContext.key,
  expected,
  context: confirmedContext,
  boundAt: Date.now()
};
adapter.chatContext = () => ({
  key: 'hr:张国举',
  url: 'https://app.zhipin.com/web/geek/chat',
  recruiterName: '',
  companyName: '',
  headerText: '',
  selectedText: '',
  capturedAt: Date.now()
});
adapter.activeConversationItem = () => null;
adapter.matchingConversationItem = () => null;
adapter.chatInput = () => editor;
adapter.resolveEditableChatInput = value => value || null;
adapter.emptyConversationPlaceholderVisible = () => false;
adapter.chatRouteActive = () => true;
const stable = adapter.assertConversationKey(confirmedContext.key, 'pending-36');
if (stable.key !== confirmedContext.key || !stable.bindingTrusted) {
  throw new Error('normal DOM rerender was incorrectly treated as a conversation change');
}

const compatible = adapter.conversationKeysCompatible('hr:张国举|company:冠晟', 'hr:张国举', expected, { recruiterName: '张国举' });
if (!compatible) throw new Error('same recruiter key with missing company was rejected');

adapter.chatContext = () => ({
  key: 'hr:王先生|company:字节跳动',
  url: 'https://app.zhipin.com/web/geek/chat',
  recruiterName: '王先生',
  companyName: '字节跳动',
  headerText: '王先生 字节跳动 HR',
  selectedText: '',
  capturedAt: Date.now()
});
let blocked = false;
try { adapter.assertConversationKey(confirmedContext.key, 'pending-36'); } catch (error) { blocked = /其他 HR/.test(String(error?.message || '')); }
if (!blocked) throw new Error('explicit different HR was not blocked');

for (const token of [
  '发送过程中页面标题、公司副标题、消息预览和时间都会变化',
  '这些 DOM 变化不等于换了 HR',
  '当前页面暂时未重复显示 HR 身份，但已保留刚刚确认的会话绑定',
  '检测到当前聊天已切换到其他 HR'
]) {
  if (!content.includes(token)) throw new Error(`UI37 stable binding token missing: ${token}`);
}
console.log('UI37_BOUND_CONVERSATION_STABILITY_OK');
