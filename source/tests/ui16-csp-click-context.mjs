import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const listeners = {};

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.defaultPrevented = false;
    Object.assign(this, init);
  }
  preventDefault() {
    if (this.cancelable !== false) this.defaultPrevented = true;
  }
}
class FakeMouseEvent extends FakeEvent {}
class FakeInputEvent extends FakeEvent {}
class FakeKeyboardEvent extends FakeEvent {}
class FakeTextArea {}
class FakeInput {}

const document = {
  body: { innerText: '' },
  documentElement: {},
  querySelector: () => null,
  querySelectorAll: () => []
};

let runtimeMode = 'ok';
const sandbox = {
  __JOBCLAW_TEST_MODE__: true,
  document,
  innerWidth: 1200,
  innerHeight: 900,
  location: { href: 'https://www.zhipin.com/web/geek/job' },
  history: { back() {} },
  chrome: {
    runtime: {
      sendMessage: async () => {
        if (runtimeMode === 'invalidated') throw new Error('Extension context invalidated.');
        return { ok: true };
      },
      onMessage: { addListener: fn => { listeners.message = fn; } }
    }
  },
  getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout: () => {},
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

const api = sandbox.__JOBCLAW_TEST_API__;
if (!api?.clickElement || !api?.sanitizeUnsafeActivation || !api?.send) {
  throw new Error('内容脚本未暴露 UI18 测试接口');
}

function makeNode(attrs = {}, parent = null) {
  const map = new Map(Object.entries(attrs));
  const eventListeners = new Map();
  const dispatched = [];
  let nativeClicks = 0;
  let attrsDuringDispatch = null;
  const node = {
    parentElement: parent,
    parentNode: parent,
    disabled: false,
    className: '',
    scrollIntoView() {},
    getBoundingClientRect: () => ({ width: 100, height: 30, top: 10, left: 10 }),
    getAttribute: name => map.has(name) ? map.get(name) : null,
    setAttribute: (name, value) => map.set(name, String(value)),
    removeAttribute: name => map.delete(name),
    matches: selector => selector.includes('a') && map.has('href'),
    closest(selector) {
      if (selector.includes('button') || selector.includes('a') || selector.includes('[role="button"]')) return node;
      if (selector === 'a') return map.has('href') ? node : parent?.closest?.('a') || null;
      if (selector === 'form') return null;
      return null;
    },
    contains: other => other === node,
    addEventListener(type, fn, options) {
      const list = eventListeners.get(type) || [];
      list.push({ fn, options });
      eventListeners.set(type, list);
    },
    removeEventListener(type, fn) {
      eventListeners.set(type, (eventListeners.get(type) || []).filter(item => item.fn !== fn));
    },
    click() { nativeClicks += 1; },
    dispatchEvent(event) {
      attrsDuringDispatch = Object.fromEntries(map);
      for (const item of [...(eventListeners.get(event.type) || [])]) item.fn(event);
      dispatched.push({ type: event.type, defaultPrevented: event.defaultPrevented });
      return !event.defaultPrevented;
    }
  };
  return {
    node,
    map,
    dispatched,
    get nativeClicks() { return nativeClicks; },
    get attrsDuringDispatch() { return attrsDuringDispatch; }
  };
}

const unsafe = makeNode({ href: ' javascript:void(0) ', target: '_blank', onclick: 'return false' });
if (api.unsafeJavascriptAnchor(unsafe.node) !== unsafe.node) throw new Error('javascript: 链接未识别');
await api.clickElement(unsafe.node);
if (unsafe.nativeClicks !== 0) throw new Error('危险链接仍调用了 HTMLElement.click()');
if (unsafe.dispatched.length !== 1 || unsafe.dispatched[0].type !== 'click') throw new Error('危险链接没有只派发一次 click');
if (!unsafe.dispatched[0].defaultPrevented) throw new Error('危险链接 click 默认行为未阻止');
if ('href' in unsafe.attrsDuringDispatch || 'onclick' in unsafe.attrsDuringDispatch) throw new Error('派发期间危险属性没有移除');
if (unsafe.map.get('href') !== ' javascript:void(0) ' || unsafe.map.get('onclick') !== 'return false') throw new Error('危险属性未恢复');

const ancestor = makeNode({ href: 'javascript:;', onclick: 'doSomething()' });
const child = makeNode({}, ancestor.node);
child.node.closest = selector => {
  if (selector.includes('button') || selector.includes('[role="button"]')) return child.node;
  if (selector === 'a') return ancestor.node;
  if (selector === 'form') return null;
  return null;
};
await api.clickElement(child.node);
if (child.nativeClicks !== 0 || child.dispatched.length !== 1 || !child.dispatched[0].defaultPrevented) {
  throw new Error('祖先 javascript: 链接没有走安全派发');
}
if (ancestor.map.get('href') !== 'javascript:;' || ancestor.map.get('onclick') !== 'doSomething()') {
  throw new Error('祖先危险属性未恢复');
}

const safe = makeNode({ href: 'https://app.zhipin.com/web/geek/chat' });
await api.clickElement(safe.node);
if (safe.nativeClicks !== 1) throw new Error('正常 HTTPS 链接未保留单次原生点击');
if (safe.dispatched.length !== 0) throw new Error('正常 HTTPS 链接不应走危险派发');

runtimeMode = 'invalidated';
const invalidated = await api.send('CONTENT_STATE');
if (!invalidated?.contextInvalidated || !api.contextInvalidated()) throw new Error('扩展上下文失效未静默标记');
const second = await api.send('CONTENT_STATE');
if (!second?.contextInvalidated) throw new Error('上下文失效后仍继续调用 runtime');
if (!api.isExtensionContextError(new Error('Extension context invalidated.'))) throw new Error('上下文错误识别失败');

if (/target\.click\(\)[\s\S]{0,300}javascript/i.test(content)) {
  throw new Error('危险点击实现仍可能直接调用原生 click');
}
if (!content.includes("event => event.preventDefault?.()")) throw new Error('缺少危险链接默认行为阻止');
if (!content.includes('extensionContextInvalidated')) throw new Error('缺少扩展上下文失效保护');

console.log(JSON.stringify({
  ok: true,
  unsafeJavascriptNavigationBlocked: true,
  inlineActivationAttributesSanitized: true,
  ancestorJavascriptHrefHandled: true,
  oneSyntheticClickOnly: true,
  normalHttpsNativeClickPreserved: true,
  extensionContextInvalidationSilenced: true
}, null, 2));
