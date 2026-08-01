import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const background = await readFile('dist/chrome-extension/background.js', 'utf8');
const manifest = JSON.parse(await readFile('dist/chrome-extension/manifest.json', 'utf8'));

if (manifest.version !== '2.0.1') throw new Error('UI37 manifest version mismatch');
for (const token of [
  'conversationTokenDetails',
  'conversationTokenRelation',
  'conversationSelectionEvidence',
  "await this.trustedElementAction('click', candidate)",
  '目标 HR 会话未就绪：HR=',
  'jobId/securityId/lid 是岗位跳转参数'
]) {
  if (!content.includes(token)) throw new Error(`UI37 conversation selector missing: ${token}`);
}
if (!background.includes('ui31ConversationSelectionMigration')) throw new Error('UI37 migration missing');

const listeners = {};
class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } preventDefault() {} }
class FakeInputEvent extends FakeEvent {}
class FakeKeyboardEvent extends FakeEvent {}
class FakeMouseEvent extends FakeEvent {}
class FakePointerEvent extends FakeEvent {}
class FakeTextArea {}
class FakeInput {}
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
  location: { href: 'https://app.zhipin.com/web/geek/chat?conversationId=conv-88', assign(value) { this.href = String(value); } },
  history: { back() {} },
  chrome: { runtime: { sendMessage: async () => ({ ok: true }), onMessage: { addListener: fn => { listeners.message = fn; } } } },
  getComputedStyle: () => ({ visibility: 'hidden', display: 'none', backgroundColor: 'rgba(0,0,0,0)', boxShadow: 'none' }),
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

// 岗位页链接中的 jobId/securityId 与聊天页 conversationId 属于不同维度，
// 只要 HR/公司/岗位一致，就必须接受当前已选中的正确聊天会话。
const expected = {
  pendingId: 'pending-1',
  recruiterName: '张国举',
  company: '冠晟',
  jobTitle: '前端开发实习生',
  targetUrl: 'https://www.zhipin.com/web/geek/chat?jobId=job-1&securityId=sec-1',
  targetToken: 'www.zhipin.com|jobid=job-1&securityid=sec-1'
};
const correct = {
  key: 'hr:张国举冠晟',
  url: 'https://app.zhipin.com/web/geek/chat?conversationId=conv-88',
  urlToken: 'app.zhipin.com|conversationid=conv-88',
  recruiterName: '张国举',
  companyName: '冠晟',
  headerText: '张国举 冠晟 招聘者 在线',
  selectedText: '张国举 冠晟 招聘者 您正在与Boss张国举沟通',
  jobText: '前端开发实习生 100-150元/天 成都'
};
const accepted = adapter.validateChatContext(expected, correct, null, null);
if (!accepted.ok) throw new Error(`correct selected HR rejected: ${accepted.reason}`);

const wrong = {
  ...correct,
  key: 'hr:王先生字节跳动',
  recruiterName: '王先生',
  companyName: '字节跳动',
  headerText: '王先生 字节跳动 HR',
  selectedText: '王先生 字节跳动 HR',
  jobText: '后端开发实习生'
};
if (adapter.validateChatContext(expected, wrong, null, null).ok) throw new Error('wrong HR was accepted');

const sameConversationExpected = {
  ...expected,
  targetUrl: 'https://app.zhipin.com/web/geek/chat?conversationId=conv-99'
};
if (adapter.validateChatContext(sameConversationExpected, correct, null, null).ok) {
  throw new Error('different explicit conversationId was accepted');
}

console.log('UI37_CONVERSATION_SELECTION_OK');
