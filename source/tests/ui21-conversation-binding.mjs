import { readFile } from 'node:fs/promises';

const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const background = await readFile('dist/chrome-extension/background.js', 'utf8');
const taskState = await readFile('dist/chrome-extension/lib/task-state.js', 'utf8');

const requiredContent = [
  'expectedChatContext(job = {}, pendingId = \'\')',
  'chatContext()',
  'validateChatContext(expected = {}, current = {}, previous = null, candidate = null)',
  'assertConversationKey(expectedKey, pendingId = \'\')',
  "send('CHAT_BINDING_PREPARE'",
  "send('CHAT_BINDING_CHECK'",
  "send('CHAT_BINDING_CONFIRMED'",
  '当前仍在上一个 HR 会话',
  '聊天窗口没有切换，仍是上一个 HR 会话',
  'returnToJobsHome()',
  'homeNavigationButton()',
  '正在返回 BOSS 主页继续搜索',
  '下一轮只能从主页重新进入目标岗位'
];
for (const token of requiredContent) {
  if (!content.includes(token)) throw new Error(`UI22 content missing: ${token}`);
}
const requiredBackground = [
  "case 'CHAT_BINDING_PREPARE'",
  "case 'CHAT_BINDING_CHECK'",
  "case 'CHAT_BINDING_CONFIRMED'",
  'chatDeliveryLedger',
  '当前 HR 会话已绑定其他岗位任务'
];
for (const token of requiredBackground) {
  if (!background.includes(token)) throw new Error(`UI22 background missing: ${token}`);
}
if (!taskState.includes("verify_chat_target: ['核对 HR 与岗位', 82]")) throw new Error('UI22 task stage missing');
if (/history\.back\(\)/.test(content.slice(content.indexOf('async function processApproved'), content.indexOf('async function processSearch')))) {
  throw new Error('processApproved must not return to previous HR with history.back');
}
console.log('UI22_CONVERSATION_BINDING_OK');

import vm from 'node:vm';
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
  location: { href: 'https://app.zhipin.com/web/geek/chat?conversationId=abc', assign(value) { this.href = String(value); } },
  history: { back() {} },
  chrome: { runtime: { sendMessage: async () => ({ ok: true }), onMessage: { addListener: fn => { listeners.message = fn; } } } },
  getComputedStyle: () => ({ visibility: 'hidden', display: 'none' }),
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
if (!adapter) throw new Error('UI22 adapter not exposed');
const expected = { pendingId: 'new-task', recruiterName: '惠园妮', company: '瑞月科技', jobTitle: 'web前端开发实习', targetToken: 'app.zhipin.com|conversationid=abc' };
const correct = { key: 'app.zhipin.com|conversationid=abc', urlToken: 'app.zhipin.com|conversationid=abc', recruiterName: '惠园妮', headerText: '惠园妮 瑞月科技 人事', selectedText: '', jobText: 'web前端开发实习' };
if (!adapter.validateChatContext(expected, correct, null).ok) throw new Error('correct HR/job binding rejected');
const wrong = { key: 'app.zhipin.com|conversationid=xyz', urlToken: 'app.zhipin.com|conversationid=xyz', recruiterName: '李女士', headerText: '李女士 云梯科技 HRBP', selectedText: '', jobText: 'Java开发实习' };
if (adapter.validateChatContext(expected, wrong, null).ok) throw new Error('wrong HR conversation accepted');
const stale = { ...correct, key: 'same-conversation' };
if (adapter.validateChatContext({ ...expected, targetToken: '' }, stale, { key: 'same-conversation', pendingId: 'old-task' }).ok) throw new Error('stale previous HR conversation accepted');
console.log('UI22_CONVERSATION_RUNTIME_OK');
await adapter.returnToJobsHome();
if (sandbox.location.href !== 'https://www.zhipin.com/web/geek/job') throw new Error('chat page did not return to BOSS jobs home');
console.log('UI22_RETURN_HOME_OK');
