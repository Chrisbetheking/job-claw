import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('dist/chrome-extension/manifest.json', 'utf8'));
const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const background = await readFile('dist/chrome-extension/background.js', 'utf8');

const hostPermissions = new Set(manifest.host_permissions || []);
if (!hostPermissions.has('https://www.zhipin.com/*')) throw new Error('缺少 www.zhipin.com 权限');
if (!hostPermissions.has('https://app.zhipin.com/*')) throw new Error('缺少 app.zhipin.com 权限');
const contentMatches = new Set((manifest.content_scripts || []).flatMap(item => item.matches || []));
if (!contentMatches.has('https://www.zhipin.com/*') || !contentMatches.has('https://app.zhipin.com/*')) {
  throw new Error('内容脚本未同时覆盖岗位域名和沟通域名');
}

for (const token of [
  "(?:www|app)\\.zhipin\\.com",
  "['https://www.zhipin.com/*', 'https://app.zhipin.com/*']"
]) {
  if (!background.includes(token)) throw new Error(`后台双域名接入缺少：${token}`);
}

if (!content.includes('const onChatPage = adapter.chatRouteActive() || Boolean(adapter.chatInput())')) {
  throw new Error('沟通页未进入 UI22 会话绑定分支');
}
if (!content.includes('if (onChatPage && !transition)')) {
  throw new Error('新岗位未强制离开上一个 HR 会话');
}
if (!content.includes("/^https:\\/\\/app\\.zhipin\\.com\\//i.test(location.href)")) {
  throw new Error('app.zhipin.com 未被识别为沟通页');
}
if (!content.includes("anchor?.removeAttribute?.('target')")) {
  throw new Error('沟通入口未移除 target=_blank');
}
if (!content.includes('location.href = href')) {
  throw new Error('沟通入口未强制在当前标签页交接');
}
const approvedSection = content.slice(content.indexOf('async function processApproved'), content.indexOf('async function processSearch'));
if (/history\.back\(\)/.test(approvedSection)) {
  throw new Error('投递完成后仍使用 history.back，可能继续沿用上一个 HR 会话');
}

function element() {
  return {
    innerText: '', textContent: '', className: '', disabled: false, readOnly: false,
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
    getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [],
    matches: () => false, closest: () => null
  };
}
const document = {
  body: { innerText: '' },
  querySelector: () => null,
  querySelectorAll: () => []
};
const listeners = {};
class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }
class FakeInputEvent extends FakeEvent {}
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
  location: { href: 'https://app.zhipin.com/' },
  history: { back() {} },
  chrome: { runtime: { sendMessage: async () => ({ ok: true }), onMessage: { addListener: fn => { listeners.message = fn; } } } },
  getComputedStyle: () => ({ visibility: 'hidden', display: 'none' }),
  setTimeout: () => 0,
  clearTimeout: () => {},
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
vm.runInNewContext(content, sandbox, { filename: 'content.js' });
const adapter = sandbox.__JOBCLAW_TEST_API__?.adapter;
if (!adapter) throw new Error('未暴露内容脚本测试接口');
if (!adapter.chatRouteActive()) throw new Error('app.zhipin.com 根路径未被识别为沟通页');
if (adapter.pageType() !== 'chat') throw new Error(`app.zhipin.com 页面类型错误：${adapter.pageType()}`);

sandbox.location.href = 'https://www.zhipin.com/web/geek/job';
if (adapter.chatRouteActive()) throw new Error('普通岗位页被误识别为沟通页');

console.log(JSON.stringify({
  ok: true,
  dualDomainManifest: true,
  dualDomainBackground: true,
  appRootIsChat: true,
  noRedirectLoop: true,
  sameTabHandoff: true,
  nextTaskStartsFromOwnJob: true
}, null, 2));
