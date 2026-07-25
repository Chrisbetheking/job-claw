import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const conversationIdentity = await readFile('dist/chrome-extension/lib/conversation-identity.js', 'utf8');
const background = await readFile('dist/chrome-extension/background.js', 'utf8');
const manifest = JSON.parse(await readFile('dist/chrome-extension/manifest.json', 'utf8'));
if (manifest.version !== '1.3.0') throw new Error(`UI37 version mismatch: ${manifest.version}`);

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
  activeElement: null,
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

const expected = {
  pendingId: 'pending-35',
  recruiterName: '张国举',
  company: '冠晟',
  jobTitle: '前端开发实习生'
};
const emptyPageContext = {
  key: '',
  url: 'https://app.zhipin.com/web/geek/chat',
  recruiterName: '',
  companyName: '',
  headerText: '',
  selectedText: '张国举 冠晟 招聘者 您正在与Boss张国举沟通'
};
const fallbackKey = adapter.deriveConversationKey(emptyPageContext, expected, expected.pendingId);
if (fallbackKey !== 'hr:张国举|company:冠晟') {
  throw new Error(`expected HR/company fallback key, got ${fallbackKey}`);
}
const wrongKey = adapter.deriveConversationKey({ ...emptyPageContext, recruiterName: '王先生', companyName: '字节跳动' }, expected, expected.pendingId);
if (wrongKey === fallbackKey) throw new Error('wrong HR produced same conversation key');
const urlKey = adapter.deriveConversationKey({ url: 'https://app.zhipin.com/web/geek/chat?conversationId=conv-35' }, {}, '');
if (!urlKey.includes('conversationid=conv-35')) throw new Error(`explicit chat token fallback missing: ${urlKey}`);

for (const token of ['deriveConversationReservationKey', 'sameRecruiterReservation']) {
  if (!conversationIdentity.includes(token)) throw new Error(`conversation identity module missing: ${token}`);
}
for (const token of [
  'ui35ConversationKeyMigration',
  'conversationKey: key',
  '目标 HR 已核验，但无法建立安全投递锁'
]) {
  if (!background.includes(token)) throw new Error(`UI37 background fallback missing: ${token}`);
}
if (background.includes('无法生成当前 HR 会话唯一标识，已禁止发送')) {
  throw new Error('old hard failure still present');
}
for (const token of [
  'deriveConversationKey(current = {}, expected = {}, pendingId = \'\')',
  'ledger?.reservation?.conversationKey',
  '当前 HR 会话已确认，但无法建立安全投递锁',
  'HR + 公司生成稳定键'
]) {
  if (!content.includes(token)) throw new Error(`UI37 content fallback missing: ${token}`);
}
console.log('UI37_CONVERSATION_KEY_FALLBACK_OK');
