import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const manifest = JSON.parse(await readFile('dist/chrome-extension/manifest.json', 'utf8'));
if (manifest.version !== '2.0.1') throw new Error(`UI37 version mismatch: ${manifest.version}`);

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

const expected = {
  pendingId: 'pending-1',
  recruiterName: '张国举',
  company: '岗位采集时误识别出的公司名',
  jobTitle: '岗位采集时被截断的岗位标题',
  targetUrl: 'https://www.zhipin.com/web/geek/chat?jobId=job-1&securityId=sec-1'
};
const selectedCorrectHr = {
  key: 'hr:张国举冠晟',
  url: 'https://app.zhipin.com/web/geek/chat?conversationId=conv-88',
  recruiterName: '张国举',
  companyName: '冠晟',
  headerText: '张国举 冠晟 招聘者',
  selectedText: '张国举 冠晟 招聘者 您正在与Boss张国举沟通',
  selectedEvidence: true,
  jobText: '前端开发实习生 100-150元/天 成都'
};
const accepted = adapter.validateChatContext(expected, selectedCorrectHr, null, null);
if (!accepted.ok) throw new Error(`selected correct HR rejected because of weak company/job signals: ${accepted.reason}`);


const inferredCandidate = {
  innerText: '张国举 冠晟 招聘者',
  textContent: '张国举 冠晟 招聘者',
  getAttribute: () => '',
  className: '',
  matches: () => false
};
const inferredContext = {
  ...selectedCorrectHr,
  selectedText: '',
  selectedEvidence: false,
  editorReady: true,
  emptyPlaceholder: false,
  selectionInferred: true
};
const inferredAccepted = adapter.validateChatContext(expected, inferredContext, null, inferredCandidate);
if (!inferredAccepted.ok) throw new Error(`clicked matching HR + ready editor was not accepted: ${inferredAccepted.reason}`);
if (!inferredAccepted.evidence?.selectionInferred) throw new Error('inferred selection evidence was not recorded');

const wrongHr = {
  ...selectedCorrectHr,
  key: 'hr:王先生字节跳动',
  recruiterName: '王先生',
  headerText: '王先生 字节跳动 HR',
  selectedText: '王先生 字节跳动 HR',
  selectedEvidence: true
};
if (adapter.validateChatContext(expected, wrongHr, null, null).ok) throw new Error('wrong selected HR was accepted');

for (const token of [
  '公司与岗位作为增强证据',
  '目标 HR 已识别，但左侧会话尚未稳定选中',
  '公司和岗位仅作辅助核对',
  'selectionInferred',
  'candidateRecruiterMatch'
]) {
  if (!content.includes(token)) throw new Error(`UI37 weak evidence guard missing: ${token}`);
}
console.log('UI37_WEAK_CHAT_EVIDENCE_OK');
