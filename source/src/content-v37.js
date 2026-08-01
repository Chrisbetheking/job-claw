(() => {
const JOBCLAW_CONTENT_VERSION = '2.0.1';
const JOBCLAW_CONTENT_BUILD = '2.0.1-greeting-hotfix.1';
const JOBCLAW_CONTENT_FILE = 'content-v37.js';
const BOSS_JOBS_HOME_URL = 'https://www.zhipin.com/web/geek/job';
const BOSS_CITY_NAMES = Object.freeze(['全国','北京','上海','广州','深圳','杭州','成都','南京','武汉','西安','苏州','重庆','长沙','天津','郑州','厦门','青岛','东莞','佛山','合肥','济南','福州','无锡','宁波','昆明','大连','沈阳','石家庄','南昌','南宁','贵阳','太原','哈尔滨','长春','海口','珠海','惠州','温州','嘉兴']);
const BOSS_CITY_PATTERN = new RegExp(`(${BOSS_CITY_NAMES.join('|')})`);
const BOSS_CITY_INITIALS = Object.freeze({
  全国: 'Q', 北京: 'B', 上海: 'S', 广州: 'G', 深圳: 'S', 杭州: 'H', 成都: 'C', 南京: 'N', 武汉: 'W', 西安: 'X', 苏州: 'S', 重庆: 'C', 长沙: 'C', 天津: 'T', 郑州: 'Z', 厦门: 'X', 青岛: 'Q', 东莞: 'D', 佛山: 'F', 合肥: 'H', 济南: 'J', 福州: 'F', 无锡: 'W', 宁波: 'N', 昆明: 'K', 大连: 'D', 沈阳: 'S', 石家庄: 'S', 南昌: 'N', 南宁: 'N', 贵阳: 'G', 太原: 'T', 哈尔滨: 'H', 长春: 'C', 海口: 'H', 珠海: 'Z', 惠州: 'H', 温州: 'W', 嘉兴: 'J'
});
const BOSS_CITY_TAB_GROUPS = Object.freeze(['ABCDE', 'FGHJ', 'KLMN', 'PQRST', 'WXYZ']);
const BOSS_RESULT_FILTERS = Object.freeze({
  求职类型: Object.freeze({ key: 'employmentType', values: ['不限','全职','兼职','实习'], meta: /job[-_ ]?type|position[-_ ]?type|employment|求职类型/i }),
  薪资待遇: Object.freeze({ key: 'salary', values: ['不限','3K以下','3-5K','5-10K','10-20K','20-50K','50K以上'], meta: /salary|pay|compensation|薪资/i }),
  工作经验: Object.freeze({ key: 'experience', values: ['不限','在校生','应届生','经验不限','1年以内','1-3年','3-5年','5-10年','10年以上'], meta: /experience|work[-_ ]?exp|经验/i }),
  学历要求: Object.freeze({ key: 'degree', values: ['不限','初中及以下','中专\/中技','高中','大专','本科','硕士','博士'], meta: /degree|education|学历/i })
});

const existingRuntime = globalThis.__JOBCLAW_CONTENT_RUNTIME__;
if (existingRuntime?.version === JOBCLAW_CONTENT_VERSION && existingRuntime?.build === JOBCLAW_CONTENT_BUILD && existingRuntime?.active) return;
if (existingRuntime) existingRuntime.active = false;
const contentRuntime = { version: JOBCLAW_CONTENT_VERSION, build: JOBCLAW_CONTENT_BUILD, file: JOBCLAW_CONTENT_FILE, active: true, startedAt: Date.now() };
globalThis.__JOBCLAW_CONTENT_RUNTIME__ = contentRuntime;
globalThis.__JOBCLAW_CONTENT_BOOTSTRAPPED__ = JOBCLAW_CONTENT_VERSION;
try {
  document.documentElement.dataset.jobclawContentVersion = JOBCLAW_CONTENT_VERSION;
  document.documentElement.dataset.jobclawContentBuild = JOBCLAW_CONTENT_BUILD;
  document.documentElement.dataset.jobclawContentFile = JOBCLAW_CONTENT_FILE;
} catch {}
function runtimeIsActive() {
  return globalThis.__JOBCLAW_CONTENT_RUNTIME__ === contentRuntime && contentRuntime.active === true;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitForDomMutation = (timeout = 420) => new Promise(resolve => {
  if (typeof MutationObserver !== 'function' || !document?.documentElement) {
    setTimeout(resolve, timeout);
    return;
  }
  let done = false;
  let timer = null;
  const finish = () => {
    if (done) return;
    done = true;
    try { observer.disconnect(); } catch {}
    if (timer) clearTimeout(timer);
    resolve();
  };
  const observer = new MutationObserver(finish);
  try { observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true }); }
  catch { setTimeout(resolve, timeout); return; }
  timer = setTimeout(finish, timeout);
});
function chatEntryError(message, code = 'CHAT_ENTRY_TIMEOUT', details = {}) {
  const error = new Error(message);
  error.code = code;
  error.recoverable = true;
  error.details = details;
  return error;
}
const visible = element => {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
};
const text = element => String(element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
const normalize = value => String(value || '').replace(/\s+/g, '').replace(/[·•｜|]/g, '').trim().toLowerCase();
const normalizeIdentity = value => normalize(value)
  .replace(/有限责任公司|股份有限公司|有限公司|招聘者|招聘方|人事行政|人事|hr|在线|刚刚活跃|活跃/g, '')
  .replace(/[()（）【】\[\]<>《》,，。.:：;；_\-—]/g, '');
function identityMatches(left, right, minLength = 2) {
  const a = normalizeIdentity(left);
  const b = normalizeIdentity(right);
  if (!a || !b || Math.min(a.length, b.length) < minLength) return false;
  return a.includes(b) || b.includes(a);
}
function urlConversationToken(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''), location.href);
    const preferred = ['conversationId', 'conversationid', 'chatId', 'chatid', 'relationId', 'relationid', 'securityId', 'securityid', 'bossId', 'bossid', 'uid', 'lid', 'jobId', 'jobid', 'expectId', 'expectid'];
    const values = [];
    for (const name of preferred) {
      const value = url.searchParams.get(name);
      if (value) values.push(`${name.toLowerCase()}=${value}`);
    }
    const hash = String(url.hash || '').replace(/^#/, '');
    for (const part of hash.split(/[?&/]/)) {
      if (!part || !/=/.test(part)) continue;
      const [name, value] = part.split('=', 2);
      if (preferred.includes(String(name || '').toLowerCase()) && value) values.push(`${String(name).toLowerCase()}=${value}`);
    }
    if (values.length) return `${url.host}|${values.sort().join('&')}`;
    const path = url.pathname.replace(/\/+$/, '');
    if (path && path !== '/' && !/\/web\/geek\/(?:job|jobs|chat)?$/i.test(path)) return `${url.host}|${path}|${hash.slice(0, 120)}`;
    return '';
  } catch {
    return '';
  }
}

function conversationTokenDetails(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''), location.href);
    const preferred = ['conversationid', 'chatid', 'relationid', 'securityid', 'bossid', 'uid', 'lid', 'jobid', 'expectid'];
    const values = {};
    for (const [name, value] of url.searchParams.entries()) {
      const key = String(name || '').toLowerCase();
      if (preferred.includes(key) && value) values[key] = String(value);
    }
    const hash = String(url.hash || '').replace(/^#/, '');
    for (const part of hash.split(/[?&/]/)) {
      if (!part || !/=/.test(part)) continue;
      const [name, value] = part.split('=', 2);
      const key = String(name || '').toLowerCase();
      if (preferred.includes(key) && value && !values[key]) values[key] = String(value);
    }
    return { host: url.host, path: url.pathname, values };
  } catch {
    return { host: '', path: '', values: {} };
  }
}

function conversationTokenRelation(expectedUrl, currentUrl) {
  const expected = conversationTokenDetails(expectedUrl);
  const current = conversationTokenDetails(currentUrl);
  const strongKeys = ['conversationid', 'chatid', 'relationid', 'bossid', 'uid'];
  const sharedStrong = strongKeys.filter(key => expected.values[key] && current.values[key]);
  if (sharedStrong.some(key => expected.values[key] !== current.values[key])) return 'mismatch';
  if (sharedStrong.length && sharedStrong.every(key => expected.values[key] === current.values[key])) return 'match';
  // jobId/securityId/lid 是岗位跳转参数，不等于聊天会话 ID。不同域名切换时
  // 不能拿它们与 conversationId 直接比较，否则会把已选中的正确 HR 误判为失败。
  return 'unknown';
}
function jobUrlToken(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''), location.href);
    const match = url.pathname.match(/\/job_detail\/([^/?#]+)/i);
    if (match?.[1]) return match[1].replace(/\.html$/i, '');
    for (const key of ['jobId', 'jobid', 'encryptJobId', 'securityId', 'lid']) {
      const value = url.searchParams.get(key);
      if (value) return `${key.toLowerCase()}=${value}`;
    }
    return '';
  } catch {
    return '';
  }
}
const all = (selector, root = document) => [...((root && typeof root.querySelectorAll === 'function') ? root.querySelectorAll(selector) : document.querySelectorAll(selector))];

function deepRoots(start = document) {
  const roots = [];
  const queue = [start];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    roots.push(current);
    const elements = current.querySelectorAll ? [...current.querySelectorAll('*')] : [];
    for (const element of elements) {
      if (element.shadowRoot) queue.push(element.shadowRoot);
      if (String(element.tagName || '').toLowerCase() === 'iframe') {
        try {
          if (element.contentDocument) queue.push(element.contentDocument);
        } catch {
          // 跨域 iframe 由 CDP 坐标输入兜底。
        }
      }
    }
  }
  return roots;
}

function deepAll(selector, start = document) {
  return [...new Set(deepRoots(start).flatMap(root => {
    try { return [...root.querySelectorAll(selector)]; }
    catch { return []; }
  }))];
}

const findByText = (pattern, root = document) => all('button,a,span,div,li', root).filter(element => visible(element) && pattern.test(text(element)));

let extensionContextInvalidated = false;

function isExtensionContextError(error) {
  const message = String(error?.message || error || '');
  return /Extension context invalidated|message port closed|Receiving end does not exist|Could not establish connection/i.test(message);
}

async function send(type, payload = {}) {
  if (!runtimeIsActive()) return { ok: false, staleRuntime: true, contentVersion: JOBCLAW_CONTENT_VERSION, contentBuild: JOBCLAW_CONTENT_BUILD };
  if (extensionContextInvalidated) return { ok: false, contextInvalidated: true, contentVersion: JOBCLAW_CONTENT_VERSION, contentBuild: JOBCLAW_CONTENT_BUILD };
  try {
    return await chrome.runtime.sendMessage({ type, contentVersion: JOBCLAW_CONTENT_VERSION, contentBuild: JOBCLAW_CONTENT_BUILD, ...payload });
  } catch (error) {
    if (isExtensionContextError(error)) {
      // 扩展在 chrome://extensions 中被重新加载后，旧页面里的 content script 会暂时残留。
      // 直接静默停机，等待用户刷新页面加载新上下文，避免产生未处理 Promise 错误。
      extensionContextInvalidated = true;
      return { ok: false, contextInvalidated: true };
    }
    throw error;
  }
}

async function waitForRateLimit(scope = 'discovery', label = '操作') {
  const result = await send('RATE_LIMIT', { scope });
  if (!result?.ok) throw new Error(result?.reason || `${label}已被安全限速器暂停`);
  const waitMs = Math.max(0, Number(result.waitMs || 0));
  if (waitMs > 0) {
    await send('WORKFLOW', { patch: { statusText: `${label}安全等待 ${Math.ceil(waitMs / 1000)} 秒` } });
    await sleep(waitMs);
  }
  return result;
}

async function waitFor(check, timeout = 12000, label = '页面条件') {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // 页面切换期间忽略短暂 DOM 错误。
    }
    await sleep(180);
  }
  throw new Error(`等待${label}超时`);
}

function resolveClickTarget(element) {
  if (!element) return null;
  return element.closest?.('button,a,[role="button"],label,[tabindex]') || element;
}

const UNSAFE_NAVIGATION_ATTRIBUTES = ['href', 'xlink:href', 'formaction', 'action'];
const INLINE_ACTIVATION_ATTRIBUTES = [
  'onclick', 'onmousedown', 'onmouseup', 'onpointerdown', 'onpointerup',
  'ontouchstart', 'ontouchend'
];

function isJavascriptUrl(value) {
  return /^\s*javascript\s*:/i.test(String(value || ''));
}

function activationPath(target) {
  const nodes = [];
  let current = target;
  for (let depth = 0; current && depth < 10; depth += 1) {
    nodes.push(current);
    current = current.parentElement || current.parentNode || null;
    if (current === document || current === document?.documentElement) {
      if (current && current !== document) nodes.push(current);
      break;
    }
  }
  const closestAnchor = target?.closest?.('a');
  const closestForm = target?.closest?.('form');
  for (const node of [closestAnchor, closestForm]) {
    if (node && !nodes.includes(node)) nodes.push(node);
  }
  return nodes;
}

function unsafeJavascriptAnchor(element) {
  const target = resolveClickTarget(element);
  return activationPath(target).find(node => {
    const href = node?.getAttribute?.('href') || node?.getAttribute?.('xlink:href');
    return isJavascriptUrl(href);
  }) || null;
}

function sanitizeUnsafeActivation(target) {
  const saved = [];
  for (const node of activationPath(target)) {
    for (const name of UNSAFE_NAVIGATION_ATTRIBUTES) {
      const value = node?.getAttribute?.(name);
      if (!isJavascriptUrl(value)) continue;
      saved.push({ node, name, value });
      node.removeAttribute?.(name);
    }
    for (const name of INLINE_ACTIVATION_ATTRIBUTES) {
      const value = node?.getAttribute?.(name);
      if (value === null || value === undefined) continue;
      saved.push({ node, name, value });
      node.removeAttribute?.(name);
    }
  }
  return {
    unsafe: saved.length > 0,
    restore() {
      for (const { node, name, value } of saved.reverse()) node?.setAttribute?.(name, value);
    }
  };
}

async function clickElement(element) {
  const target = resolveClickTarget(element);
  if (!target) throw new Error('目标元素不存在');
  if (target.disabled || target.getAttribute?.('aria-disabled') === 'true') {
    throw new Error('目标元素当前不可点击');
  }

  target.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  await sleep(120);

  // BOSS 部分按钮由 javascript: href 或内联 onclick 包裹。对这类入口不能调用
  // HTMLElement.click()，否则浏览器会执行默认导航并触发站点 CSP。这里临时移除
  // 所有危险激活属性，再派发一个可取消的单次 click；站点的 React/Vue 监听器仍会
  // 收到事件，但默认导航被明确阻止。
  const sanitized = sanitizeUnsafeActivation(target);
  try {
    if (sanitized.unsafe && typeof target.dispatchEvent === 'function') {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        buttons: 0
      });
      const preventUnsafeDefault = event => event.preventDefault?.();
      target.addEventListener?.('click', preventUnsafeDefault, { capture: true, once: true });
      try {
        target.dispatchEvent(clickEvent);
      } finally {
        target.removeEventListener?.('click', preventUnsafeDefault, { capture: true });
      }
    } else if (typeof target.click === 'function') {
      target.click();
    } else if (typeof target.dispatchEvent === 'function') {
      target.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        buttons: 0
      }));
    } else {
      throw new Error('目标元素不支持点击');
    }
    await sleep(90);
  } finally {
    sanitized.restore();
  }
  await sleep(130);
}

function setValue(input, value) {
  if (!input) throw new Error('输入框不存在');
  const nextValue = String(value ?? '');
  const previousValue = String(input.value ?? '');
  input.focus?.();
  try {
    input.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: 'insertText',
      data: nextValue
    }));
  } catch {}
  const proto = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) descriptor.set.call(input, nextValue);
  else input.value = nextValue;

  // React 会通过 _valueTracker 判断 value 是否真的变化。先把 tracker 恢复到旧值，
  // 再派发 input，确保 BOSS 的受控输入框同步到组件状态，而不只是视觉上出现文字。
  try { input._valueTracker?.setValue?.(previousValue); } catch {}
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    composed: true,
    inputType: 'insertText',
    data: nextValue
  }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

function hasVerification() {
  return /安全验证|访问过于频繁|请完成验证|验证码|异常请求/.test(document.body.innerText || '')
    || location.href.includes('security-check');
}

class BossAdapter {
  pageType() {
    if (hasVerification()) return 'verification';
    if (this.chatRouteActive() || this.chatInput()) return 'chat';
    if (this.searchInput() || this.cards().length) return 'jobs';
    return 'other';
  }

  searchInput() {
    return all('input').find(input => visible(input) && (
      /搜索职位|搜索.*公司|职位.*公司/.test(input.placeholder || '')
      || /query|search/i.test(input.name || '')
    )) || null;
  }

  searchButton() {
    return findByText(/^搜索$/).find(visible)
      || all('[class*="search-btn"],button[type="submit"]').find(visible)
      || null;
  }

  cards() {
    const selectors = [
      '.job-list-box .job-card-wrapper',
      'li.job-card-wrapper',
      '.search-job-result .job-card-wrapper',
      '.job-list-box li',
      'a[href*="/job_detail/"]'
    ];
    const candidates = selectors
      .flatMap(selector => all(selector))
      .map(element => element.closest('.job-card-wrapper,li') || element)
      .filter(visible);
    return [...new Set(candidates)].filter((element, index, items) => {
      const content = text(element);
      if (!content || content.length > 900) return false;
      return !items.some((other, otherIndex) => otherIndex !== index && other.contains(element) && text(other).length < content.length);
    });
  }


  async loadMoreCards(previousKeys = []) {
    const cards = this.cards();
    const last = cards.at(-1) || null;
    const previous = new Set((previousKeys || []).filter(Boolean));
    let scroller = last?.parentElement || null;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      const scrollable = /(auto|scroll)/.test(style.overflowY || '')
        && scroller.scrollHeight > scroller.clientHeight + 80;
      if (scrollable) break;
      scroller = scroller.parentElement;
    }
    if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
    if (scroller && scroller !== document.body) {
      scroller.scrollTop = Math.min(scroller.scrollHeight, scroller.scrollTop + Math.max(520, scroller.clientHeight * 0.82));
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    } else {
      window.scrollBy({ top: Math.max(620, Number(innerHeight || 800) * 0.72), behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    }
    await sleep(900);
    const refreshed = this.cards();
    const unseen = refreshed.filter(card => {
      const key = this.cardKey(card);
      return key && !previous.has(key);
    });
    return { count: refreshed.length, unseen: unseen.length };
  }

  detailRoot() {
    const selectors = [
      '.job-detail-box',
      '.job-detail',
      '.job-detail-container',
      '.job-detail-content',
      '.job-detail-panel',
      '.job-detail-wrapper',
      '.job-detail-main',
      '[class*="job-detail"]',
      '[class*="jobDetail"]'
    ];
    const direct = selectors
      .flatMap(selector => all(selector))
      .filter(visible)
      .sort((a, b) => text(b).length - text(a).length)
      .find(element => this.detailReady(element));
    if (direct) return direct;

    return all('main,section,article,div').find(element => {
      const rect = element.getBoundingClientRect();
      const content = text(element);
      return visible(element)
        && rect.left > innerWidth * 0.26
        && rect.width > 280
        && content.length > 100
        && /职位描述|职位要求|岗位职责|投递说明|公司文化|福利/.test(content);
    }) || null;
  }

  detailReady(root) {
    if (!root || !visible(root)) return false;
    const content = text(root);
    if (content.length < 60) return false;
    return /职位描述|职位要求|岗位职责|投递说明|工作内容|任职要求|公司文化|福利|立即沟通|继续沟通|立即网申|去网申|立即申请/.test(content)
      || Boolean(root.querySelector('h1,h2,[class*="job-name"],[class*="job-title"],[class*="jobName"]'));
  }

  cardIdentity(card) {
    const anchor = card?.querySelector?.('a[href*="job_detail"]');
    const title = text(card?.querySelector?.('[class*="job-name"],[class*="job-title"],[class*="jobName"],h3,h4'))
      || text(anchor)
      || text(card).split(/\s{2,}|\n/)[0]
      || '';
    const company = text(card?.querySelector?.('[class*="company-name"],[class*="companyName"],[class*="company"]')) || '';
    return {
      title: title.slice(0, 80),
      company: company.slice(0, 80),
      href: anchor?.href || '',
      raw: text(card).slice(0, 500)
    };
  }

  detailSignature(root = this.detailRoot()) {
    if (!root) return '';
    const title = text(root.querySelector('h1,h2,[class*="job-name"],[class*="job-title"],[class*="jobName"]'));
    const company = text(root.querySelector('[class*="company-name"],[class*="companyName"],[class*="company"]'));
    return normalize(`${title}|${company}|${text(root).slice(0, 700)}`);
  }

  isSelectedCard(card) {
    if (!card) return false;
    const className = String(card.className || '');
    if (/(^|[-_\s])(active|selected|checked|current)([-_\s]|$)/i.test(className)) return true;
    if (card.getAttribute('aria-selected') === 'true') return true;
    return Boolean(card.querySelector('[class*="active"],[class*="selected"],[aria-selected="true"]'));
  }

  detailMatchesCard(root, card) {
    if (!this.detailReady(root) || !card) return false;
    const detail = normalize(text(root));
    const identity = this.cardIdentity(card);
    const title = normalize(identity.title);
    const company = normalize(identity.company);
    const titleMatch = title.length >= 3 && detail.includes(title);
    const companyMatch = company.length >= 2 && detail.includes(company);
    if (titleMatch && companyMatch) return true;
    if (titleMatch && (!company || this.isSelectedCard(card))) return true;
    if (companyMatch && (!title || this.isSelectedCard(card))) return true;
    return false;
  }

  activeConversationItem() {
    const selectors = [
      '[class*="conversation-item"][class*="active"]', '[class*="conversationItem"][class*="active"]',
      '[class*="friend-item"][class*="active"]', '[class*="friendItem"][class*="active"]',
      '[class*="chat-item"][class*="active"]', '[class*="chatItem"][class*="active"]',
      '[class*="contact-item"][class*="active"]', '[class*="contactItem"][class*="active"]',
      '[aria-selected="true"]'
    ];
    return [...new Set(selectors.flatMap(selector => all(selector)))]
      .filter(node => {
        if (!visible(node)) return false;
        const rect = node.getBoundingClientRect();
        const value = text(node);
        return rect.left < Number(globalThis.innerWidth || 1400) * 0.48
          && value.length >= 2 && value.length <= 260;
      })
      .sort((a, b) => text(a).length - text(b).length)[0] || null;
  }

  emptyConversationPlaceholderVisible() {
    return all('div,section,main,p,span').some(node => {
      if (!visible(node)) return false;
      const value = text(node);
      if (!/与您进行过沟通的\s*Boss\s*都会在左侧列表中显示|请选择联系人|选择一个联系人开始沟通|暂无沟通/.test(value)) return false;
      const rect = node.getBoundingClientRect();
      return rect.left > Number(globalThis.innerWidth || 1400) * 0.24
        && rect.width > 260
        && rect.top < Number(globalThis.innerHeight || 900) * 0.78;
    });
  }

  conversationListRoot() {
    const search = all('input').find(node => /搜索30天内的联系人|搜索联系人/.test(String(node.placeholder || node.getAttribute?.('placeholder') || '')));
    let current = search?.parentElement || null;
    const viewportWidth = Number(globalThis.innerWidth || 1400);
    for (let depth = 0; current && depth < 8; depth += 1) {
      const rect = current.getBoundingClientRect?.();
      if (rect && rect.left < viewportWidth * 0.12 && rect.width >= 220 && rect.width <= viewportWidth * 0.48 && rect.height >= 360) return current;
      current = current.parentElement || null;
    }
    return null;
  }

  isVisuallySelectedConversation(node) {
    if (!node) return false;
    if (node.getAttribute?.('aria-selected') === 'true') return true;
    if (/(^|[-_\s])(active|selected|checked|current)([-_\s]|$)/i.test(String(node.className || ''))) return true;
    try {
      const style = getComputedStyle(node);
      const background = String(style.backgroundColor || '');
      const match = background.match(/rgba?\(([^)]+)\)/i);
      if (match) {
        const parts = match[1].split(',').map(value => Number.parseFloat(value.trim()));
        const [r = 255, g = 255, b = 255, a = 1] = parts;
        const nearWhite = r > 246 && g > 246 && b > 246;
        const transparent = parts.length > 3 && a < 0.04;
        if (!nearWhite && !transparent) return true;
      }
      if (style.boxShadow && style.boxShadow !== 'none') return true;
    } catch {}
    return false;
  }

  conversationListItems() {
    const selectors = [
      '[class*="conversation-item"]', '[class*="conversationItem"]',
      '[class*="friend-item"]', '[class*="friendItem"]',
      '[class*="chat-item"]', '[class*="chatItem"]',
      '[class*="contact-item"]', '[class*="contactItem"]',
      '[class*="user-item"]', '[class*="userItem"]',
      '[role="option"]', 'aside li', '[class*="conversation-list"] li', '[class*="friend-list"] li'
    ];
    const root = this.conversationListRoot();
    const generic = root ? all('li,[role="option"],[class*="item"],[class*="card"]', root) : [];
    const candidates = [...new Set([...selectors.flatMap(selector => all(selector)), ...generic])]
      .filter(node => {
        if (!visible(node)) return false;
        const rect = node.getBoundingClientRect();
        const value = text(node);
        const viewportWidth = Number(globalThis.innerWidth || 1400);
        if (rect.left > viewportWidth * 0.46) return false;
        if (rect.width < 180 || rect.height < 44 || rect.height > 150) return false;
        if (value.length < 2 || value.length > 300) return false;
        if (/全部|未读|新招呼|筛选|搜索30天内的联系人/.test(value) && value.length < 40) return false;
        return true;
      });
    // 保留最接近整行的节点，排除同一联系人卡片内部的姓名/预览子节点。
    return candidates.filter(node => !candidates.some(parent => parent !== node && parent.contains?.(node)
      && Math.abs(parent.getBoundingClientRect().height - node.getBoundingClientRect().height) < 12
      && parent.getBoundingClientRect().width > node.getBoundingClientRect().width + 40));
  }

  conversationItemScore(node, expected = {}) {
    const value = text(node);
    const anchor = node.matches?.('a') ? node : node.querySelector?.('a[href]');
    const href = String(anchor?.href || '');
    const relation = conversationTokenRelation(expected.targetUrl || '', href);
    let score = 0;
    if (relation === 'match') score += 320;
    if (relation === 'mismatch') score -= 260;
    if (expected.recruiterName && identityMatches(value, expected.recruiterName, 2)) score += 180;
    if (expected.company && identityMatches(value, expected.company, 2)) score += 120;
    if (expected.jobTitle && identityMatches(value, expected.jobTitle, 3)) score += 80;
    if (this.isVisuallySelectedConversation(node)) score += 45;
    if (node.querySelector?.('img,[class*="avatar"]')) score += 10;
    return score;
  }

  conversationSelectionEvidence(expected = {}, current = {}, candidate = null) {
    const header = `${current.recruiterName || ''} ${current.headerText || ''}`;
    const selected = `${current.selectedText || ''} ${candidate ? text(candidate) : ''}`;
    const jobArea = `${current.jobText || ''} ${current.headerText || ''} ${selected}`;
    const recruiterMatch = Boolean(expected.recruiterName && identityMatches(`${header} ${selected}`, expected.recruiterName, 2));
    const companyMatch = Boolean(expected.company && identityMatches(`${header} ${selected}`, expected.company, 2));
    const jobMatch = Boolean(expected.jobTitle && identityMatches(jobArea, expected.jobTitle, 3));
    const tokenRelation = conversationTokenRelation(expected.targetUrl || '', current.url || '');
    const candidateRecruiterMatch = Boolean(candidate && expected.recruiterName
      && identityMatches(text(candidate), expected.recruiterName, 2));
    const selectionInferred = Boolean(
      current.selectionInferred === true
      || (
        recruiterMatch
        && candidateRecruiterMatch
        && current.editorReady === true
        && current.emptyPlaceholder !== true
      )
    );
    const selectedEvidence = Boolean(
      (candidate && this.isVisuallySelectedConversation(candidate))
      || current.selectedEvidence === true
      || selectionInferred
    );
    const currentCompanyVisible = normalizeIdentity(`${current.companyName || ''} ${current.headerText || ''} ${selected}`).length >= 2;
    const currentJobVisible = normalizeIdentity(`${current.jobText || ''}`).length >= 3;
    let score = 0;
    if (tokenRelation === 'match') score += 8;
    if (recruiterMatch) score += 8;
    if (companyMatch) score += 3;
    if (jobMatch) score += 3;
    if (selectedEvidence) score += 5;

    const expectedRecruiter = Boolean(expected.recruiterName);
    const expectedCompany = Boolean(expected.company);
    const expectedJob = Boolean(expected.jobTitle);
    let identityConfirmed = false;

    // BOSS 聊天页经常只稳定展示 HR 姓名和左侧选中行，公司/岗位文本可能缺失、
    // 截断或沿用岗位页别名。只要目标 HR 匹配且会话行已明确选中，就允许进入发送；
    // 公司与岗位作为增强证据，而不是在页面未展示时作为硬阻断条件。
    if (expectedRecruiter) {
      identityConfirmed = recruiterMatch && (
        selectedEvidence
        || tokenRelation === 'match'
        || companyMatch
        || jobMatch
      );
    } else if (tokenRelation === 'match') {
      identityConfirmed = true;
    } else if (expectedCompany && expectedJob) {
      identityConfirmed = companyMatch && jobMatch && selectedEvidence;
    } else if (expectedCompany) {
      identityConfirmed = companyMatch && selectedEvidence;
    } else if (expectedJob) {
      identityConfirmed = jobMatch && selectedEvidence;
    }

    const companyConflict = Boolean(expectedCompany && currentCompanyVisible && !companyMatch && !recruiterMatch);
    const jobConflict = Boolean(expectedJob && currentJobVisible && !jobMatch && !recruiterMatch);
    if (companyConflict || jobConflict) identityConfirmed = false;

    return {
      ok: Boolean(identityConfirmed && score >= 8),
      score,
      recruiterMatch,
      companyMatch,
      jobMatch,
      selectedEvidence,
      selectionInferred,
      candidateRecruiterMatch,
      tokenRelation,
      currentCompanyVisible,
      currentJobVisible,
      companyConflict,
      jobConflict
    };
  }

  async ensureExpectedConversation(expected = {}, timeout = 30000) {
    const startedAt = Date.now();
    let lastCandidate = null;
    let lastClickAt = 0;
    while (Date.now() - startedAt < timeout) {
      if (hasVerification()) throw new Error('检测到安全验证，已暂停');
      const input = this.chatInput();
      const current = this.chatContext();
      const active = this.activeConversationItem();
      // BOSS 经常不在联系人行上暴露 active/aria-selected 样式。只要该行是本轮刚刚
      // 可信点击的目标、页头 HR 已匹配且真实编辑器已就绪，就把它作为稳定会话证据；
      // 绝不能因为缺少一个 CSS 选中类而阻断真正的发送。
      const evidenceCandidate = active || lastCandidate || null;
      const editorReadyNow = Boolean(input || this.resolveEditableChatInput(document.activeElement));
      const validation = this.validateChatContext(expected, {
        ...current,
        selectedText: current.selectedText || (evidenceCandidate ? text(evidenceCandidate) : ''),
        editorReady: editorReadyNow,
        emptyPlaceholder: this.emptyConversationPlaceholderVisible()
      }, null, evidenceCandidate);
      if (!this.emptyConversationPlaceholderVisible() && validation.ok) {
        const readyInput = input || await this.ensureChatEditorReady(5000);
        if (readyInput) {
          await sleep(900);
          const stable = this.chatContext();
          const stableActive = this.activeConversationItem() || lastCandidate || null;
          const stableEditor = this.chatInput() || this.resolveEditableChatInput(document.activeElement) || readyInput;
          const stableContext = {
            ...stable,
            selectedText: stable.selectedText || (stableActive ? text(stableActive) : ''),
            editorReady: Boolean(stableEditor),
            emptyPlaceholder: this.emptyConversationPlaceholderVisible(),
            selectionInferred: Boolean(
              stableActive
              && expected.recruiterName
              && identityMatches(text(stableActive), expected.recruiterName, 2)
              && stableEditor
            )
          };
          const stableValidation = this.validateChatContext(expected, stableContext, null, stableActive);
          const stableInput = stableEditor;
          if (stableInput && stableValidation.ok && !this.emptyConversationPlaceholderVisible()) {
            const keyedContext = {
              ...stableContext,
              key: this.deriveConversationKey(stableContext, expected, expected.pendingId || '')
            };
            return { input: stableInput, context: keyedContext, evidence: stableValidation.evidence };
          }
        }
      }

      const ranked = this.conversationListItems()
        .map(node => ({ node, score: this.conversationItemScore(node, expected) }))
        .filter(entry => entry.score >= 80)
        .sort((a, b) => b.score - a.score);
      const candidate = ranked[0]?.node || null;
      if (candidate && (candidate !== lastCandidate || Date.now() - lastClickAt > 3200)) {
        lastCandidate = candidate;
        lastClickAt = Date.now();
        try {
          await this.trustedElementAction('click', candidate);
        } catch {
          await clickElement(candidate);
        }
        await sleep(1500);
        continue;
      }
      await sleep(420);
    }
    const finalContext = this.chatContext();
    const finalActive = this.activeConversationItem() || lastCandidate || null;
    const editorReady = Boolean(this.chatInput() || this.resolveEditableChatInput(document.activeElement));
    const finalEvidence = this.conversationSelectionEvidence(expected, {
      ...finalContext,
      selectedText: finalContext.selectedText || (finalActive ? text(finalActive) : ''),
      editorReady,
      emptyPlaceholder: this.emptyConversationPlaceholderVisible(),
      selectionInferred: Boolean(
        finalActive
        && expected.recruiterName
        && identityMatches(text(finalActive), expected.recruiterName, 2)
        && editorReady
      )
    }, finalActive);
    throw new Error(`目标 HR 会话未就绪：HR=${finalEvidence.recruiterMatch ? '匹配' : '未匹配'}，会话=${finalEvidence.selectedEvidence ? '已选中' : '未选中'}，编辑器=${editorReady ? '已就绪' : '未就绪'}；公司和岗位仅作辅助核对。已停留在聊天页，未发送、未返回主页`);
  }

  resolveEditableChatInput(node) {
    if (!node) return null;
    const isEditable = candidate => {
      if (!candidate || typeof candidate.matches !== 'function') return false;
      const tag = String(candidate.tagName || '').toLowerCase();
      if (tag === 'textarea') return true;
      if (tag === 'input') {
        const type = String(candidate.getAttribute?.('type') || 'text').toLowerCase();
        return ['text', 'search', ''].includes(type);
      }
      const editableMode = String(candidate.getAttribute?.('contenteditable') || '').toLowerCase();
      return candidate.isContentEditable
        || Boolean(editableMode && !['false', 'inherit', 'off'].includes(editableMode))
        || candidate.getAttribute?.('role') === 'textbox'
        || candidate.getAttribute?.('data-slate-editor') === 'true'
        || candidate.getAttribute?.('data-lexical-editor') === 'true';
    };
    if (isEditable(node)) return node;
    const nested = all('textarea,input[type="text"],input:not([type]),[contenteditable]:not([contenteditable="false"]),[role="textbox"],[data-slate-editor="true"],[data-lexical-editor="true"]', node);
    return nested.find(isEditable) || null;
  }

  chatInputScore(element) {
    const editable = this.resolveEditableChatInput(element);
    if (!editable || !visible(editable)) return -Infinity;
    if (editable.disabled || editable.readOnly || editable.getAttribute?.('aria-disabled') === 'true') return -Infinity;
    const rect = editable.getBoundingClientRect?.();
    if (!rect || rect.width < 120 || rect.height < 18) return -Infinity;
    const viewportWidth = Number(globalThis.innerWidth || 1400);
    const viewportHeight = Number(globalThis.innerHeight || 900);
    const placeholder = `${editable.getAttribute?.('placeholder') || ''} ${editable.getAttribute?.('data-placeholder') || ''} ${editable.getAttribute?.('aria-label') || ''}`;
    const semantic = `${placeholder} ${editable.id || ''} ${String(editable.className || '')}`;
    const chatAncestor = editable.closest?.('[class*="chat"],[class*="message"],[class*="conversation"],[class*="dialog"],[role="dialog"]');
    const searchAncestor = editable.closest?.('[class*="search"],[class*="filter"],[class*="contact-search"]');
    let score = 0;
    if (editable.id === 'chat-input') score += 600;
    if (String(editable.tagName || '').toLowerCase() === 'textarea') score += 240;
    const editableMode = String(editable.getAttribute?.('contenteditable') || '').toLowerCase();
    if (editable.isContentEditable || (editableMode && !['false', 'inherit', 'off'].includes(editableMode))) score += 220;
    if (editableMode === 'plaintext-only') score += 180;
    if (editable.getAttribute?.('data-slate-editor') === 'true' || editable.getAttribute?.('data-lexical-editor') === 'true') score += 200;
    if (editable.getAttribute?.('role') === 'textbox') score += 140;
    if (/按enter键发送|ctrl\+enter|请输入|输入消息|发送消息|沟通|消息/i.test(semantic)) score += 260;
    if (/chat[-_]?input|message[-_]?input|editor/i.test(semantic)) score += 180;
    if (chatAncestor) score += 180;
    if (rect.top > viewportHeight * 0.52) score += 160;
    if (rect.left > viewportWidth * 0.24) score += 120;
    if (rect.right > viewportWidth * 0.55) score += 70;
    if (rect.width > 320) score += 60;
    if (searchAncestor && !chatAncestor && editable.id !== 'chat-input') score -= 520;
    if (rect.top < viewportHeight * 0.32 && editable.id !== 'chat-input') score -= 280;
    if (rect.left < viewportWidth * 0.22 && editable.id !== 'chat-input') score -= 240;
    return score;
  }

  composerHintNode() {
    const pattern = /按\s*Enter\s*键?发送|Ctrl\s*\+\s*Enter|输入消息|发送消息/i;
    return deepAll('span,div,p,label,small')
      .filter(node => visible(node) && pattern.test(text(node)))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.top - ar.top) || (br.right - ar.right);
      })[0] || null;
  }

  composerRoot() {
    const hint = this.composerHintNode();
    if (!hint) return null;
    const viewportWidth = Number(globalThis.innerWidth || 1400);
    const viewportHeight = Number(globalThis.innerHeight || 900);
    let current = hint.parentElement;
    let best = null;
    for (let depth = 0; current && depth < 8; depth += 1) {
      const rect = current.getBoundingClientRect?.();
      if (rect && rect.width > 280 && rect.height > 70
        && rect.top > viewportHeight * 0.48
        && rect.left > viewportWidth * 0.18
        && rect.width < viewportWidth * 0.82) {
        best = current;
      }
      current = current.parentElement || null;
    }
    return best || hint.parentElement || null;
  }

  composerEditableCandidates() {
    const root = this.composerRoot();
    const selectors = [
      '#chat-input',
      'textarea[placeholder*="Enter"]',
      'textarea[placeholder*="发送"]',
      'textarea[placeholder*="消息"]',
      '[contenteditable]:not([contenteditable="false"])',
      '[role="textbox"]',
      '[data-slate-editor="true"]',
      '[data-lexical-editor="true"]',
      'textarea',
      'input[type="text"]'
    ];
    const candidates = root
      ? selectors.flatMap(selector => deepAll(selector, root))
      : [];
    const active = document.activeElement;
    if (active && active !== document.body) candidates.unshift(active);
    return [...new Set(candidates
      .map(node => this.resolveEditableChatInput(node))
      .filter(Boolean))];
  }

  chatInput() {
    const selectors = [
      '#chat-input',
      'textarea#chat-input',
      '[contenteditable]:not([contenteditable="false"])#chat-input',
      'textarea[placeholder*="按Enter"]',
      'textarea[placeholder*="发送"]',
      'textarea[placeholder*="消息"]',
      'textarea[placeholder*="沟通"]',
      'textarea[placeholder*="输入"]',
      '[contenteditable]:not([contenteditable="false"])[data-placeholder]',
      '[contenteditable]:not([contenteditable="false"])[aria-label*="消息"]',
      '[contenteditable]:not([contenteditable="false"])[aria-label*="输入"]',
      '[contenteditable]:not([contenteditable="false"])',
      'div[role="textbox"]',
      '[data-slate-editor="true"]',
      '[data-lexical-editor="true"]',
      '[class*="chat-input"]',
      '[class*="chatInput"]',
      '[class*="message-input"]',
      '[class*="messageInput"]'
    ];
    const hintCandidates = this.composerEditableCandidates();
    const globalCandidates = selectors.flatMap(selector => deepAll(selector))
      .map(node => this.resolveEditableChatInput(node))
      .filter(Boolean);
    const candidates = [...new Set([...hintCandidates, ...globalCandidates])];
    const root = this.composerRoot();
    return candidates
      .map(element => {
        let score = this.chatInputScore(element);
        if (root?.contains?.(element)) score += 900;
        if (element === document.activeElement) score += 240;
        const rect = element.getBoundingClientRect?.();
        if (rect && rect.top > Number(globalThis.innerHeight || 900) * 0.68) score += 220;
        return { element, score };
      })
      .filter(entry => Number.isFinite(entry.score) && entry.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.element || null;
  }

  composerActivationPoint() {
    const root = this.composerRoot();
    if (!root) return null;
    const rect = root.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const hint = this.composerHintNode();
    const hintRect = hint?.getBoundingClientRect?.();
    const toolbarBottom = Math.max(rect.top + 34, hintRect ? Math.min(rect.bottom - 28, hintRect.top - 18) : rect.top + 46);
    return {
      x: Math.round(rect.left + Math.max(90, Math.min(rect.width - 90, rect.width * 0.58))),
      y: Math.round(Math.max(toolbarBottom, Math.min(rect.bottom - 26, rect.top + rect.height * 0.55)))
    };
  }

  async ensureChatEditorReady(timeout = 6500) {
    let input = this.chatInput();
    if (input) return input;
    const root = this.composerRoot();
    if (!root || this.emptyConversationPlaceholderVisible()) return null;
    const point = this.composerActivationPoint();
    if (point) {
      try {
        const response = await send('TRUSTED_CHAT_INPUT', { action: 'click', point });
        if (!response?.ok) throw new Error(response?.error || '可信点击失败');
      } catch {
        try {
          const eventTarget = document.elementFromPoint?.(point.x, point.y) || root;
          await clickElement(eventTarget);
        } catch {}
      }
      await sleep(420);
    }
    const active = this.resolveEditableChatInput(document.activeElement);
    if (active && root.contains?.(active)) return active;
    try {
      input = await waitFor(() => {
        const candidate = this.chatInput();
        if (candidate) return candidate;
        const focused = this.resolveEditableChatInput(document.activeElement);
        return focused && root.contains?.(focused) ? focused : null;
      }, timeout, '聊天编辑器激活');
      return input;
    } catch {
      return null;
    }
  }

  elementPoint(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('目标输入区域坐标无效');
    return {
      x: Math.round(rect.left + Math.min(rect.width - 4, Math.max(8, rect.width * 0.46))),
      y: Math.round(rect.top + Math.min(rect.height - 4, Math.max(8, rect.height * 0.52)))
    };
  }

  chatEditorDiagnostics(input = this.chatInput()) {
    const rect = input?.getBoundingClientRect?.();
    return {
      tag: String(input?.tagName || '').toLowerCase(),
      id: String(input?.id || ''),
      className: String(input?.className || '').slice(0, 180),
      contenteditable: String(input?.getAttribute?.('contenteditable') || ''),
      role: String(input?.getAttribute?.('role') || ''),
      valueLength: this.chatInputValue(input).length,
      active: input === document.activeElement,
      hintText: text(this.composerHintNode()).slice(0, 100),
      insideComposer: Boolean(this.composerRoot()?.contains?.(input)),
      rect: rect ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null
    };
  }

  chatRouteActive() {
    return /^https:\/\/app\.zhipin\.com\//i.test(location.href)
      || /web\/geek\/chat|\/chat(?:\/|\?|$)/.test(location.href);
  }

  currentJobMatches(job = {}) {
    const expectedToken = jobUrlToken(job.url || '');
    const currentToken = jobUrlToken(location.href);
    if (expectedToken && currentToken && expectedToken === currentToken) return true;
    const root = this.detailRoot();
    if (!root) return false;
    const detail = normalize(text(root));
    const titleMatch = job.title ? identityMatches(detail, job.title, 3) : false;
    const companyMatch = job.company ? identityMatches(detail, job.company, 2) : false;
    return Boolean(titleMatch && (!job.company || companyMatch));
  }

  detailRecruiterIdentity(root = this.detailRoot()) {
    if (!root) return { name: '', text: '' };
    const selectors = [
      '[class*="boss-name"]', '[class*="bossName"]', '[class*="recruiter-name"]',
      '[class*="recruiterName"]', '[class*="job-boss"] [class*="name"]',
      '[class*="jobBoss"] [class*="name"]', '[class*="boss-info"] [class*="name"]',
      '[class*="bossInfo"] [class*="name"]'
    ];
    const candidate = selectors.flatMap(selector => all(selector, root))
      .filter(visible)
      .map(node => ({ node, value: text(node) }))
      .find(entry => entry.value.length >= 2 && entry.value.length <= 36 && !/立即沟通|继续沟通|招聘中|职位/.test(entry.value));
    if (candidate) return { name: candidate.value.split(/[|｜·•\s]/)[0] || candidate.value, text: candidate.value };
    const blocks = all('div,section,aside', root).filter(node => {
      const value = text(node);
      return visible(node) && value.length >= 4 && value.length <= 100 && /人事|招聘者|HR|hr|刚刚活跃|在线/.test(value);
    });
    const value = text(blocks.sort((a, b) => text(a).length - text(b).length)[0]);
    return { name: value.split(/[|｜·•\s]/)[0] || '', text: value };
  }

  expectedChatContext(job = {}, pendingId = '') {
    const button = this.communicateButton();
    const anchor = button?.matches?.('a') ? button : button?.closest?.('a');
    const targetUrl = String(button?.href || anchor?.href || '').trim();
    const recruiter = this.detailRecruiterIdentity();
    return {
      pendingId,
      jobUrl: String(job.url || location.href),
      jobToken: jobUrlToken(job.url || location.href),
      jobTitle: String(job.title || ''),
      company: String(job.company || ''),
      recruiterName: recruiter.name || String(job.recruiterName || ''),
      recruiterText: recruiter.text || '',
      targetUrl,
      targetToken: urlConversationToken(targetUrl),
      preparedAt: Date.now()
    };
  }

  chatContext() {
    const headerSelectors = [
      '.chat-header', '.conversation-header', '.chat-conversation-header',
      '[class*="chat-header"]', '[class*="chatHeader"]',
      '[class*="conversation-header"]', '[class*="conversationHeader"]',
      '[class*="chat-title"]', '[class*="chatTitle"]',
      '[class*="friend-info"]', '[class*="friendInfo"]',
      '[class*="boss-info"]', '[class*="bossInfo"]'
    ];
    const headerCandidates = [...new Set(headerSelectors.flatMap(selector => all(selector)))]
      .filter(node => {
        if (!visible(node)) return false;
        const rect = node.getBoundingClientRect();
        const value = text(node);
        return rect.top < 300 && rect.width > 120 && value.length >= 2 && value.length <= 260;
      })
      .sort((a, b) => text(a).length - text(b).length);
    const header = headerCandidates[0] || null;
    const selectedSelectors = [
      '[class*="conversation-item"][class*="active"]', '[class*="conversationItem"][class*="active"]',
      '[class*="friend-item"][class*="active"]', '[class*="friendItem"][class*="active"]',
      '[class*="chat-item"][class*="active"]', '[class*="chatItem"][class*="active"]',
      '[aria-selected="true"]'
    ];
    const selected = [...new Set(selectedSelectors.flatMap(selector => all(selector)))]
      .filter(visible)
      .sort((a, b) => text(a).length - text(b).length)[0] || null;
    const headerText = text(header).slice(0, 260);
    const selectedText = text(selected).slice(0, 220);
    const combined = `${headerText} ${selectedText}`.trim();
    const nameSelectors = '[class*="name"],[class*="title"],h1,h2,h3,strong';
    const nameNodes = header ? all(nameSelectors, header) : [];
    const recruiterName = nameNodes.map(text)
      .find(value => value.length >= 2 && value.length <= 30 && !/消息|沟通|查看职位|更多|在线客服|发送/.test(value))
      || combined.split(/[|｜·•\s]/).find(value => value.length >= 2 && value.length <= 20 && !/消息|沟通|职位|招聘中/.test(value))
      || '';
    const companyNode = header ? all('[class*="company"],[class*="brand"],[class*="corp"]', header)
      .filter(visible)
      .find(node => {
        const value = text(node);
        return value.length >= 2 && value.length <= 60;
      }) : null;
    const companyFromSeparator = headerText.split(/[|｜·•]/).map(value => value.trim())
      .find(value => value && value !== recruiterName && value.length >= 2 && value.length <= 50 && !/人事|招聘者|HR|hr|在线|活跃/.test(value));
    const companyName = text(companyNode) || companyFromSeparator || '';
    const jobNode = [...(header ? all('[class*="job"],[class*="position"]', header) : []), ...all('[class*="chat-job"],[class*="job-card"]')]
      .filter(visible)
      .find(node => {
        const value = text(node);
        return value.length >= 2 && value.length <= 100;
      });
    const jobText = text(jobNode).slice(0, 120);
    const urlToken = urlConversationToken(location.href);
    // 只要页面能识别 HR/公司，就优先以 HR + 公司作为会话唯一键。
    // 不使用岗位标题，也不让 URL 中变化的 jobId 绕过同一 HR 会话保护。
    const identityCore = [recruiterName, companyName].filter(Boolean).join('|');
    const identityKey = normalizeIdentity(identityCore).slice(0, 180);
    const key = identityKey ? `hr:${identityKey}` : urlToken;
    return {
      key,
      url: location.href,
      urlToken,
      recruiterName,
      companyName,
      headerText,
      selectedText,
      jobText,
      combinedText: `${combined} ${jobText}`.trim(),
      capturedAt: Date.now()
    };
  }

  // UI35：会话锁不再要求页面必须暴露 conversationId。目标 HR 已经核验后，
  // 使用 HR + 公司生成稳定键；URL 会话 ID 和任务 ID 仅作后备。
  deriveConversationKey(current = {}, expected = {}, pendingId = '') {
    const recruiter = String(current.recruiterName || expected.recruiterName || '').trim();
    const company = String(current.companyName || expected.company || '').trim();
    const recruiterKey = normalizeIdentity(recruiter).slice(0, 80);
    const companyKey = normalizeIdentity(company).slice(0, 100);
    if (recruiterKey) return `hr:${recruiterKey}${companyKey ? `|company:${companyKey}` : ''}`;

    const details = conversationTokenDetails(current.url || location.href);
    const strongKeys = ['conversationid', 'chatid', 'relationid', 'bossid', 'uid'];
    const strongToken = strongKeys
      .filter(key => details.values[key])
      .map(key => `${key}=${details.values[key]}`)
      .join('&');
    if (strongToken) return `chat:${details.host}|${strongToken}`;

    const observed = normalizeIdentity(`${current.headerText || ''} ${current.selectedText || ''}`).slice(0, 160);
    if (observed) return `observed:${observed}`;
    return pendingId ? `task:${String(pendingId)}` : '';
  }

  validateChatContext(expected = {}, current = {}, previous = null, candidate = null) {
    if (!current?.key && !current?.headerText && !current?.selectedText) {
      return { ok: false, reason: '无法识别当前聊天会话，已禁止发送' };
    }
    if (previous?.key && current.key === previous.key && previous.pendingId && previous.pendingId !== expected.pendingId) {
      return { ok: false, reason: '聊天窗口没有切换，仍是上一个 HR 会话' };
    }
    const evidence = this.conversationSelectionEvidence(expected, current, candidate);
    if (evidence.tokenRelation === 'mismatch') {
      return { ok: false, reason: '当前聊天会话 ID 与目标 HR 不一致', evidence };
    }
    if (!evidence.ok) {
      if (expected.recruiterName && !evidence.recruiterMatch) {
        return { ok: false, reason: '当前聊天未能确认目标 HR', evidence };
      }
      if (!evidence.selectedEvidence && evidence.tokenRelation !== 'match') {
        return { ok: false, reason: '目标 HR 已识别，但左侧会话尚未稳定选中', evidence };
      }
      if (evidence.companyConflict || evidence.jobConflict) {
        return { ok: false, reason: '当前聊天明确显示为其他公司或岗位，已禁止发送', evidence };
      }
      return { ok: false, reason: '目标 HR 会话证据不足，已等待页面稳定', evidence };
    }
    return { ok: true, positiveMatches: evidence.score, evidence };
  }

  conversationKeyRecruiter(key = '') {
    const value = String(key || '');
    if (!value.startsWith('hr:')) return '';
    const raw = value.slice(3).split('|company:')[0] || '';
    return normalizeIdentity(raw);
  }

  conversationKeysCompatible(expectedKey = '', currentKey = '', expected = {}, current = {}) {
    const left = String(expectedKey || '');
    const right = String(currentKey || '');
    if (!left || !right || left === right) return true;
    const leftRecruiter = this.conversationKeyRecruiter(left);
    const rightRecruiter = this.conversationKeyRecruiter(right);
    if (leftRecruiter && rightRecruiter && identityMatches(leftRecruiter, rightRecruiter, 2)) return true;
    const expectedRecruiter = normalizeIdentity(expected.recruiterName || '');
    const currentRecruiter = normalizeIdentity(current.recruiterName || '');
    if (expectedRecruiter && currentRecruiter && identityMatches(expectedRecruiter, currentRecruiter, 2)) return true;
    return false;
  }

  matchingConversationItem(expected = {}) {
    const recruiter = String(expected.recruiterName || '').trim();
    if (!recruiter) return null;
    return this.conversationListItems()
      .filter(node => identityMatches(text(node), recruiter, 2))
      .sort((a, b) => this.conversationItemScore(b, expected) - this.conversationItemScore(a, expected))[0] || null;
  }

  boundConversationAssessment(expected = {}, current = {}, binding = {}, active = null, editor = null, pendingId = '') {
    const placeholder = this.emptyConversationPlaceholderVisible();
    const expectedRecruiter = String(expected.recruiterName || binding?.context?.recruiterName || '').trim();
    const activeText = active ? text(active) : '';
    const observed = `${current.recruiterName || ''} ${current.headerText || ''} ${current.selectedText || ''} ${activeText}`.trim();
    const recruiterMatch = Boolean(expectedRecruiter && identityMatches(observed, expectedRecruiter, 2));
    const currentNamedRecruiter = String(current.recruiterName || '').trim();
    const headerIdentityReliable = Boolean(
      current.headerText
      && String(current.headerText).length <= 140
      && /招聘者|招聘方|HR|hr|人事|在线|活跃/.test(String(current.headerText))
    );
    const explicitHeaderConflict = Boolean(
      expectedRecruiter
      && currentNamedRecruiter
      && headerIdentityReliable
      && !identityMatches(currentNamedRecruiter, expectedRecruiter, 2)
      && normalizeIdentity(currentNamedRecruiter).length >= 2
    );
    const explicitSelectedConflict = Boolean(
      expectedRecruiter
      && activeText
      && !identityMatches(activeText, expectedRecruiter, 2)
      && this.isVisuallySelectedConversation(active)
    );
    const tokenRelation = conversationTokenRelation(binding?.context?.url || expected.targetUrl || '', current.url || location.href);
    const explicitConflict = tokenRelation === 'mismatch' || explicitHeaderConflict || explicitSelectedConflict;
    const sameTask = !binding.pendingId || !pendingId || String(binding.pendingId) === String(pendingId);
    const routeReady = this.chatRouteActive() && !placeholder;
    const editorReady = Boolean(editor);
    const confirmedRecently = Boolean(binding.boundAt && Date.now() - Number(binding.boundAt) < 180000);
    const priorRecruiterMatch = Boolean(
      expectedRecruiter
      && identityMatches(`${binding?.context?.recruiterName || ''} ${binding?.context?.headerText || ''} ${binding?.context?.selectedText || ''}`, expectedRecruiter, 2)
    );
    const trustedBinding = sameTask && routeReady && editorReady && confirmedRecently && priorRecruiterMatch && !explicitConflict;
    return {
      ok: !explicitConflict && routeReady && editorReady && (recruiterMatch || tokenRelation === 'match' || trustedBinding),
      explicitConflict,
      recruiterMatch,
      tokenRelation,
      routeReady,
      editorReady,
      trustedBinding,
      reason: explicitConflict
        ? '检测到明确不同的 HR 会话'
        : (!routeReady ? '聊天页面尚未就绪' : (!editorReady ? '聊天输入框尚未就绪' : '当前页面暂时未重复显示 HR 身份，但已保留刚刚确认的会话绑定'))
    };
  }

  assertConversationKey(expectedKey, pendingId = '') {
    const current = this.chatContext();
    const binding = contentRuntime.chatBinding || {};
    const expected = binding.expected || {};
    const active = this.activeConversationItem();
    const matching = active || this.matchingConversationItem(expected);
    const editor = this.chatInput() || this.resolveEditableChatInput(document.activeElement);
    const selectedText = current.selectedText || (matching ? text(matching) : '');
    const enriched = {
      ...current,
      selectedText,
      editorReady: Boolean(editor),
      emptyPlaceholder: this.emptyConversationPlaceholderVisible()
    };
    const assessment = this.boundConversationAssessment(expected, enriched, binding, active, editor, pendingId);
    if (!assessment.ok) {
      if (assessment.explicitConflict) {
        throw new Error(`检测到当前聊天已切换到其他 HR，已停止发送${pendingId ? `（任务 ${pendingId.slice(0, 6)}）` : ''}`);
      }
      throw new Error(`${assessment.reason}，已停留在当前页面等待，不会发送或返回主页${pendingId ? `（任务 ${pendingId.slice(0, 6)}）` : ''}`);
    }
    const currentKey = this.deriveConversationKey(enriched, expected, pendingId);
    if (expectedKey && currentKey && !this.conversationKeysCompatible(expectedKey, currentKey, expected, enriched)) {
      const relation = conversationTokenRelation(binding?.context?.url || expected.targetUrl || '', enriched.url || location.href);
      if (relation === 'mismatch') {
        throw new Error(`检测到当前聊天会话 ID 已切换，已停止发送${pendingId ? `（任务 ${pendingId.slice(0, 6)}）` : ''}`);
      }
    }
    // 发送过程中页面标题、公司副标题、消息预览和时间都会变化，这些 DOM 变化不等于换了 HR。
    // 已确认的同一任务绑定继续沿用原 conversationKey，避免把正常消息渲染误报为“聊天窗口发生变化”。
    return { ...enriched, key: expectedKey || currentKey, bindingTrusted: assessment.trustedBinding };
  }

  chatInputValue(input = this.chatInput()) {
    if (!input) return '';
    if ('value' in input) return String(input.value || '');
    return String(input.innerText || input.textContent || '');
  }

  chatTranscriptRoot(input = this.chatInput()) {
    if (!input) return null;
    const explicitSelectors = [
      '.chat-conversation', '.chat-content', '.chat-main', '.conversation-content',
      '.message-panel', '.conversation-panel', '.chat-panel',
      '[class*="chat-conversation"]', '[class*="chatConversation"]',
      '[class*="conversation-content"]', '[class*="conversationContent"]',
      '[class*="chat-content"]', '[class*="chatContent"]',
      '[class*="chat-main"]', '[class*="chatMain"]',
      '[class*="message-panel"]', '[class*="messagePanel"]',
      '[class*="conversation-panel"]', '[class*="conversationPanel"]'
    ];
    for (const selector of explicitSelectors) {
      const node = input.closest?.(selector);
      if (node && visible(node)) return node;
    }

    const inputRect = input.getBoundingClientRect?.();
    if (!inputRect) return input.parentElement || document.body;
    const viewportWidth = Number(globalThis.innerWidth || 1400);
    let current = input.parentElement;
    let best = null;
    for (let depth = 0; current && depth < 12; depth += 1) {
      const rect = current.getBoundingClientRect?.();
      if (rect && rect.width > 0 && rect.height > 0) {
        const containsComposer = current.contains?.(input);
        const wideEnough = rect.width >= Math.max(420, inputRect.width * 0.92);
        const tallEnough = rect.height >= Math.max(360, inputRect.height * 4);
        const alignedWithInput = rect.right >= inputRect.right - 24
          && rect.left >= Math.max(0, inputRect.left - 260);
        const notWholePage = rect.width <= viewportWidth * 0.88;
        if (containsComposer && wideEnough && tallEnough && alignedWithInput && notWholePage) best = current;
      }
      current = current.parentElement || null;
    }
    return best || input.parentElement || document.body;
  }

  transcriptGeometry(node, input = this.chatInput()) {
    if (!node || !input || node === input || input.contains?.(node) || node.contains?.(input)) return null;
    if (!visible(node)) return null;
    const inputRect = input.getBoundingClientRect?.();
    const rect = node.getBoundingClientRect?.();
    if (!inputRect || !rect || rect.width <= 0 || rect.height <= 0) return null;
    if (rect.bottom >= inputRect.top - 3) return null;
    const overlap = Math.max(0, Math.min(rect.right, inputRect.right) - Math.max(rect.left, inputRect.left));
    const centerX = rect.left + rect.width / 2;
    const horizontallyInComposerPane = overlap >= Math.min(90, Math.max(28, rect.width * 0.35))
      || (centerX >= inputRect.left - 20 && centerX <= inputRect.right + 20);
    if (!horizontallyInComposerPane) return null;
    // BOSS 左侧联系人列表与聊天输入框通常没有水平重叠。该判断可排除
    // “其他 HR 的会话预览里出现相同招呼语”被误当成当前消息气泡。
    if (rect.right < inputRect.left + 24) return null;
    return { rect, inputRect, overlap };
  }

  hasExplicitOutgoingSemantics(node) {
    if (!node) return false;
    let current = node;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const semantic = `${String(current.className || '')} ${current.getAttribute?.('data-from') || ''} ${current.getAttribute?.('data-direction') || ''} ${current.getAttribute?.('aria-label') || ''}`;
      if (/self|mine|my[-_ ]?message|outgoing|message[-_ ]?right|right[-_ ]?message|from[-_ ]?me|item[-_ ]?myself/i.test(semantic)) return true;
      current = current.parentElement || null;
    }
    return false;
  }

  isOutgoingTranscriptNode(node, geometry = this.transcriptGeometry(node)) {
    if (!geometry) return false;
    if (this.hasExplicitOutgoingSemantics(node)) return true;
    const { rect, inputRect } = geometry;
    const semantic = `${String(node.className || '')} ${String(node.parentElement?.className || '')}`;
    if (!/message|bubble|chat-record|text-item|item-text/i.test(semantic)) return false;
    if (rect.width > inputRect.width * 0.82) return false;
    const centerX = rect.left + rect.width / 2;
    return centerX >= inputRect.left + inputRect.width * 0.58
      || rect.right >= inputRect.right - Math.max(110, inputRect.width * 0.12);
  }

  chatMessageNodes({ outgoingOnly = false } = {}) {
    const input = this.chatInput();
    const root = this.chatTranscriptRoot(input);
    if (!input || !root) return [];
    const selectors = [
      '.message-content', '.chat-message', '.message-item', '.message-text',
      '[class*="message-content"]', '[class*="messageContent"]',
      '[class*="chat-message"]', '[class*="chatMessage"]',
      '[class*="message-item"]', '[class*="messageItem"]',
      '[class*="message-text"]', '[class*="messageText"]',
      '[class*="bubble"]', '[class*="chat-record"]', '[class*="chatRecord"]',
      '[class*="item-myself"]', '[class*="itemMyself"]',
      '[data-message-id]', '[data-direction]', '[data-from]'
    ];
    const candidates = [...new Set(selectors.flatMap(selector => all(selector, root)))]
      .filter(node => {
        const content = text(node);
        if (content.length < 2 || content.length > 900) return false;
        if (/您正在与BOSS.*沟通|竞争者PK|查看详细分析|超过\d+位Boss新发布/.test(content)) return false;
        if (node === input || node.contains?.(input) || input.contains?.(node)) return false;
        const geometry = this.transcriptGeometry(node, input);
        if (!geometry) return false;
        if (outgoingOnly && !this.isOutgoingTranscriptNode(node, geometry)) return false;
        return true;
      });

    return candidates.filter(node => !candidates.some(other => {
      if (other === node || !node.contains?.(other)) return false;
      const a = normalize(text(node));
      const b = normalize(text(other));
      return b && a === b;
    }));
  }

  messageFingerprint(node) {
    const rect = node?.getBoundingClientRect?.();
    return normalize(`${String(node?.className || '')}|${text(node)}|${Math.round(rect?.left || 0)}|${Math.round(rect?.top || 0)}`);
  }

  chatMessageSnapshot() {
    return new Set(this.chatMessageNodes({ outgoingOnly: true }).map(node => this.messageFingerprint(node)).filter(Boolean));
  }

  greetingMessageNodes(greeting) {
    const normalizedGreeting = normalize(String(greeting || ''));
    if (!normalizedGreeting) return [];
    return this.chatMessageNodes({ outgoingOnly: true }).filter(node => {
      const content = normalize(text(node));
      if (!content) return false;
      // 必须匹配完整招呼语，而不是只匹配所有岗位都相同的开头。
      return content === normalizedGreeting
        || (content.includes(normalizedGreeting) && content.length <= normalizedGreeting.length + 32)
        || (normalizedGreeting.includes(content) && content.length >= normalizedGreeting.length - 12);
    });
  }

  greetingVisibleInChat(greeting) {
    return this.greetingMessageNodes(greeting).length > 0;
  }

  newGreetingVisibleInChat(greeting, before = new Set()) {
    return this.greetingMessageNodes(greeting).some(node => !before.has(this.messageFingerprint(node)));
  }

  async waitForStableOutgoingGreeting(greeting, before = new Set(), timeout = 26000, expectedConversationKey = '', pendingId = '') {
    const startedAt = Date.now();
    let stableCount = 0;
    let lastFingerprint = '';
    while (Date.now() - startedAt < timeout) {
      if (expectedConversationKey) this.assertConversationKey(expectedConversationKey, pendingId);
      const fresh = this.greetingMessageNodes(greeting)
        .filter(node => !before.has(this.messageFingerprint(node)));
      const fingerprint = fresh.map(node => this.messageFingerprint(node)).sort().join('||');
      if (fingerprint && Date.now() - startedAt >= 2200) {
        stableCount = fingerprint === lastFingerprint ? stableCount + 1 : 1;
        lastFingerprint = fingerprint;
        if (stableCount >= 3) return { ok: true, nodes: fresh, fingerprint };
      } else {
        stableCount = 0;
        lastFingerprint = '';
      }
      await sleep(420);
    }
    return null;
  }

  chatImageNodes() {
    const input = this.chatInput();
    const root = this.chatTranscriptRoot(input);
    if (!input || !root) return [];
    return all('img,[class*="image-message"],[class*="imageMessage"],[class*="picture-message"],[class*="upload-item"]', root)
      .filter(node => {
        const geometry = this.transcriptGeometry(node, input);
        return Boolean(geometry && this.isOutgoingTranscriptNode(node, geometry));
      });
  }

  homeNavigationButton() {
    const selectors = [
      'a[ka*="header-home"]',
      'a[ka*="geek-home"]',
      'a[href="https://www.zhipin.com/"]',
      'a[href="https://www.zhipin.com"]',
      'a[href*="/web/geek/job"]',
      'header a',
      'nav a'
    ];
    const explicit = selectors.flatMap(selector => all(selector));
    const byText = findByText(/^首页$/);
    const candidates = [...new Set([...explicit, ...byText])]
      .filter(element => {
        if (!visible(element)) return false;
        const rect = element.getBoundingClientRect();
        const label = text(element);
        const href = String(element.href || element.closest?.('a')?.href || '');
        const isHomeLabel = /^首页$/.test(label);
        const isHomeHref = /^https:\/\/(?:www\.)?zhipin\.com\/?(?:web\/geek\/job)?(?:[?#].*)?$/i.test(href)
          || /\/web\/geek\/job(?:[/?#]|$)/i.test(href);
        return rect.top < 130 && rect.left < Math.max(520, Number(globalThis.innerWidth || 1200) * 0.48) && (isHomeLabel || isHomeHref);
      });
    return candidates.sort((a, b) => {
      const score = element => {
        const rect = element.getBoundingClientRect();
        const label = text(element);
        const href = String(element.href || element.closest?.('a')?.href || '');
        return (/^首页$/.test(label) ? 100 : 0)
          + (/\/web\/geek\/job/i.test(href) ? 70 : 0)
          + (rect.top < 80 ? 25 : 0)
          + (rect.left < 260 ? 15 : 0);
      };
      return score(b) - score(a);
    })[0] || null;
  }

  async returnToJobsHome() {
    contentRuntime.chatBinding = null;
    if (this.pageType() === 'jobs' && !this.chatRouteActive()) return true;
    const beforeUrl = location.href;
    const home = this.homeNavigationButton();
    if (home) {
      const anchor = home.matches?.('a') ? home : home.closest?.('a');
      if (anchor) anchor.removeAttribute('target');
      try {
        await clickElement(home);
        await sleep(700);
        if (location.href !== beforeUrl || (this.pageType() === 'jobs' && !this.chatRouteActive())) return true;
      } catch {
        // 顶部首页按钮结构变化时使用固定岗位主页兜底。
      }
    }
    if (typeof location.assign === 'function') location.assign(BOSS_JOBS_HOME_URL);
    else location.href = BOSS_JOBS_HOME_URL;
    return false;
  }

  async ensureJobsPage() {
    if (this.pageType() === 'jobs') return true;
    const jobsTab = findByText(/^职位$|找工作|职位推荐/).find(element => visible(element) && element.getBoundingClientRect().top < 140);
    if (jobsTab) {
      await clickElement(jobsTab);
      await waitFor(() => this.searchInput() || this.cards().length, 12000, '职位页');
      return true;
    }
    if (typeof location.assign === 'function') location.assign(BOSS_JOBS_HOME_URL);
    else location.href = BOSS_JOBS_HOME_URL;
    return false;
  }

  searchUrlContext() {
    try {
      const url = new URL(location.href);
      return {
        cityCode: String(url.searchParams.get('city') || '').trim(),
        keyword: String(url.searchParams.get('query') || '').trim(),
        path: url.pathname
      };
    } catch {
      return { cityCode: '', keyword: '', path: '' };
    }
  }

  searchResultShowsCity(targetCity) {
    const city = String(targetCity || '').trim().replace(/市$/, '');
    if (!city) return false;
    const cards = this.cards().slice(0, 10);
    if (!cards.length) return false;
    let hits = 0;
    for (const card of cards) {
      const cardText = text(card);
      if (new RegExp(`(?:^|[\\s·｜|])${city}(?:[·｜|\\s]|$)`).test(cardText) || cardText.includes(`${city}·`)) hits += 1;
    }
    return hits >= Math.min(2, cards.length);
  }

  async clearPendingSearchNavigation() {
    await send('WORKFLOW', { patch: { pendingSearchNavigation: null } });
  }

  async ensureSearchRoute(task, workflow = {}) {
    const targetCity = String(task.location || '').trim().replace(/市$/, '');
    const targetKeyword = String(task.keyword || '').trim();
    if (!targetCity) return { ok: true, unchanged: true, keywordApplied: false, effectiveCity: '' };

    const route = await send('BOSS_SEARCH_ROUTE', {
      city: targetCity,
      keyword: targetKeyword,
      currentUrl: location.href
    });
    if (!route?.ok || !route.cityCode || !route.url) {
      return { ok: false, fallbackToUi: true, label: '地区', value: targetCity, reason: route?.error || `无法生成${targetCity}搜索地址` };
    }

    const urlContext = this.searchUrlContext();
    const headerCity = this.currentHeaderCity();
    const urlMatchesCity = urlContext.cityCode === route.cityCode;
    const urlMatchesKeyword = !targetKeyword || urlContext.keyword === targetKeyword;
    const inputMatchesKeyword = !targetKeyword || String(this.searchInput()?.value || '').trim() === targetKeyword;
    const resultMatchesCity = this.searchResultShowsCity(targetCity);
    if ((urlMatchesCity && (urlMatchesKeyword || inputMatchesKeyword)) || (headerCity === targetCity && (inputMatchesKeyword || this.cards().length > 0)) || resultMatchesCity) {
      if (workflow.pendingSearchNavigation) await this.clearPendingSearchNavigation();
      return {
        ok: true,
        routeConfirmed: true,
        effectiveCity: targetCity,
        cityCode: route.cityCode,
        keywordApplied: urlMatchesKeyword || inputMatchesKeyword,
        evidence: urlMatchesCity ? 'url' : headerCity === targetCity ? 'header' : 'results'
      };
    }

    const pending = workflow.pendingSearchNavigation || null;
    const samePending = pending
      && String(pending.city || '') === targetCity
      && String(pending.keyword || '') === targetKeyword;
    if (samePending) {
      try {
        await waitFor(() => {
          const current = this.searchUrlContext();
          return current.cityCode === route.cityCode
            || this.currentHeaderCity() === targetCity
            || this.searchResultShowsCity(targetCity);
        }, 5200, `${targetCity}搜索结果`);
        await this.clearPendingSearchNavigation();
        const current = this.searchUrlContext();
        return {
          ok: true,
          routeConfirmed: true,
          effectiveCity: targetCity,
          cityCode: route.cityCode,
          keywordApplied: !targetKeyword || current.keyword === targetKeyword || String(this.searchInput()?.value || '').trim() === targetKeyword,
          evidence: current.cityCode === route.cityCode ? 'url' : this.currentHeaderCity() === targetCity ? 'header' : 'results'
        };
      } catch {
        // 第一次直接地址导航没有生效时，换用另一个BOSS职位路由再试一次。
      }
    }

    const attempts = samePending ? Number(pending.attempts || 1) : 0;
    if (attempts >= 2) {
      await this.clearPendingSearchNavigation();
      return {
        ok: false,
        fallbackToUi: true,
        label: '地区',
        value: targetCity,
        reason: `城市链接切换未确认，改用页面城市选择器`
      };
    }

    const targetUrl = attempts === 1 ? (route.alternateUrl || route.url) : route.url;
    await send('WORKFLOW', {
      patch: {
        pendingSearchNavigation: {
          city: targetCity,
          cityCode: route.cityCode,
          keyword: targetKeyword,
          url: targetUrl,
          attempts: attempts + 1,
          startedAt: Date.now()
        },
        statusText: `正在通过城市搜索地址切换到：${targetCity}`,
        actualSearchContext: {
          configured: { location: targetCity, keyword: targetKeyword },
          actual: { location: headerCity || '', keyword: String(this.searchInput()?.value || '').trim() },
          stage: 'navigating-city-route',
          ok: false,
          updatedAt: Date.now()
        }
      }
    });
    const navigation = await send('NAVIGATE_BOSS_SEARCH', { url: targetUrl });
    if (!navigation?.ok) {
      await this.clearPendingSearchNavigation();
      return { ok: false, fallbackToUi: true, label: '地区', value: targetCity, reason: navigation?.error || '城市搜索地址导航失败' };
    }
    return { ok: true, navigating: true, label: '地区', value: targetCity, cityCode: route.cityCode, url: targetUrl };
  }

  async applySearchTask(task, workflow = {}) {
    const results = [];

    // 首选根据城市编码直接进入对应搜索地址。这与早期采集任务按城市编码构造搜索页的方式一致，
    // 不依赖顶部弹窗的合成点击；地址导航失败后才回退到页面城市选择器。
    let routeResult = { ok: true, unchanged: true, keywordApplied: false, effectiveCity: '' };
    if (task.location) {
      await send('WORKFLOW', { patch: { statusText: `正在准备城市搜索：${task.location}` } });
      routeResult = await this.ensureSearchRoute(task, workflow);
      if (routeResult?.navigating) return { ok: true, navigating: true, route: routeResult };
    }

    let cityResult = routeResult;
    if (routeResult?.fallbackToUi) {
      await send('WORKFLOW', { patch: { statusText: `城市地址切换未生效，正在使用顶部城市选择器：${task.location}` } });
      cityResult = await this.applyHeaderCityFilter(task.location);
    }
    results.push(cityResult);
    if (cityResult?.ok === false) {
      return { ok: false, failures: results.filter(result => result?.ok === false) };
    }

    if (!routeResult?.keywordApplied) {
      await send('WORKFLOW', { patch: { statusText: `正在搜索：${task.keyword || '岗位'}` } });
      const searchResult = await this.submitKeywordSearch(task.keyword || '', { force: Boolean(cityResult?.changed) });
      results.push(searchResult);
      if (searchResult?.ok === false) {
        return { ok: false, failures: results.filter(result => result?.ok === false) };
      }
    } else {
      results.push({ ok: true, label: '关键词', value: task.keyword || '', routeApplied: true });
    }

    await send('WORKFLOW', { patch: { statusText: '正在逐项设置并核验求职类型、薪资、经验和学历' } });
    const resultFilters = [
      ['求职类型', task.employmentType || '不限'],
      ['薪资待遇', task.salary || '不限'],
      ['工作经验', task.experience || '不限'],
      ['学历要求', task.degree || '不限']
    ];
    const filterResults = {};
    for (const [label, value] of resultFilters) {
      const result = await this.applyFilter(label, value, { retries: 2 });
      results.push(result);
      const definition = BOSS_RESULT_FILTERS[label];
      if (definition) filterResults[definition.key] = result;
    }
    const failures = results.filter(result => result?.ok === false);
    const effectiveCity = routeResult?.effectiveCity || this.currentHeaderCity() || task.location || '';
    const context = {
      configured: {
        location: task.location || '不限',
        keyword: task.keyword || '',
        employmentType: task.employmentType || '不限',
        salary: task.salary || '不限',
        experience: task.experience || '不限',
        degree: task.degree || '不限'
      },
      actual: {
        location: effectiveCity,
        keyword: String(this.searchInput()?.value || task.keyword || '').trim(),
        employmentType: filterResults.employmentType?.actualValue || '',
        salary: filterResults.salary?.actualValue || '',
        experience: filterResults.experience?.actualValue || '',
        degree: filterResults.degree?.actualValue || ''
      },
      cityEvidence: routeResult?.evidence || (this.currentHeaderCity() === effectiveCity ? 'header' : 'ui'),
      cityCode: routeResult?.cityCode || this.searchUrlContext().cityCode || '',
      filterEvidence: Object.fromEntries(Object.entries(filterResults).map(([key, result]) => [key, result?.evidence || 'unconfirmed'])),
      ok: failures.length === 0 && Object.values(filterResults).every(result => result?.confirmed === true),
      failures: failures.map(item => ({ label: item.label || '', value: item.value || '', error: item.error || item.reason || '' })),
      updatedAt: Date.now()
    };
    await send('WORKFLOW', { patch: { actualSearchContext: context, pendingSearchNavigation: null } });
    return { ok: failures.length === 0, failures, context };
  }

  headerCityElements() {
    return all('a,button,div,span,li')
      .filter(element => {
        if (!visible(element)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.top < -4 || rect.top > 96 || rect.left < 80 || rect.left > Math.min(520, innerWidth * 0.5)) return false;
        const label = text(element);
        if (!label || label.length > 28) return false;
        const hasCity = BOSS_CITY_PATTERN.test(label);
        const hasSwitch = /切换|城市/.test(label);
        const classHint = /city|location|address|switch/i.test(`${element.className || ''} ${element.id || ''} ${element.getAttribute?.('ka') || ''}`);
        return hasCity && (hasSwitch || classHint || /\[切换\]/.test(label));
      });
  }

  headerCityTrigger() {
    return this.headerCityElements()
      .map(element => resolveClickTarget(element))
      .filter(Boolean)
      .sort((a, b) => {
        const score = element => {
          const rect = element.getBoundingClientRect();
          const label = text(element);
          const meta = `${element.className || ''} ${element.id || ''} ${element.getAttribute?.('ka') || ''}`;
          return (/切换/.test(label) ? 120 : 0)
            + (/city|location|address/i.test(meta) ? 70 : 0)
            + (rect.top < 62 ? 35 : 0)
            + (rect.left < 360 ? 20 : 0)
            - Math.min(30, label.length);
        };
        return score(b) - score(a);
      })[0] || null;
  }

  currentHeaderCity() {
    const trigger = this.headerCityTrigger();
    const match = text(trigger).match(BOSS_CITY_PATTERN);
    return String(match?.[1] || '').replace(/市$/, '');
  }

  cityPickerRoot() {
    const title = findByText(/^(请选择城市|选择城市|切换城市)$/).find(visible);
    const explicit = title?.closest?.('[role="dialog"],[class*="dialog"],[class*="modal"],[class*="city-select"],[class*="citySelect"],[class*="city-picker"],[class*="cityPicker"]');
    if (explicit && visible(explicit)) return explicit;
    const candidates = all('[role="dialog"],[class*="dialog"],[class*="modal"],[class*="city-select"],[class*="citySelect"],[class*="city-picker"],[class*="cityPicker"]')
      .filter(element => visible(element) && BOSS_CITY_NAMES.filter(city => text(element).includes(city)).length >= 4)
      .sort((a, b) => text(a).length - text(b).length);
    return candidates[0] || title?.parentElement?.parentElement || null;
  }

  cityTabFor(targetCity) {
    const initial = BOSS_CITY_INITIALS[targetCity] || '';
    return BOSS_CITY_TAB_GROUPS.find(group => group.includes(initial)) || '';
  }

  cityOption(targetCity, root = document) {
    const escaped = targetCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return findByText(new RegExp(`^${escaped}(?:市)?$`), root)
      .map(element => resolveClickTarget(element))
      .filter(element => {
        if (!element || !visible(element)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.top < 92 || rect.top > innerHeight - 30) return false;
        if (/切换/.test(text(element))) return false;
        return true;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const aClickable = /^(BUTTON|A|LI)$/.test(a.tagName) || a.getAttribute('role') === 'button' || getComputedStyle(a).cursor === 'pointer';
        const bClickable = /^(BUTTON|A|LI)$/.test(b.tagName) || b.getAttribute('role') === 'button' || getComputedStyle(b).cursor === 'pointer';
        return Number(bClickable) - Number(aClickable) || ar.width - br.width || ar.top - br.top;
      })[0] || null;
  }

  async applyHeaderCityFilter(value) {
    const targetCity = String(value || '').trim().replace(/市$/, '');
    if (!targetCity) return { ok: true, label: '地区', value: '', unchanged: true };
    const currentCity = this.currentHeaderCity();
    if (currentCity === targetCity) return { ok: true, label: '地区', value: targetCity, unchanged: true };

    const trigger = this.headerCityTrigger();
    if (!trigger) return { ok: false, label: '地区', value: targetCity, reason: '未找到顶部城市切换入口' };
    const beforeUrl = location.href;
    await clickElement(trigger);

    const picker = await waitFor(() => this.cityPickerRoot(), 7000, '顶部城市选择器');
    let option = this.cityOption(targetCity, picker);
    if (!option) {
      const tabLabel = this.cityTabFor(targetCity);
      if (tabLabel) {
        const tab = findByText(new RegExp(`^${tabLabel}$`), picker)
          .map(element => resolveClickTarget(element))
          .find(element => visible(element));
        if (tab) {
          await clickElement(tab);
          await waitForDomMutation(450);
          option = this.cityOption(targetCity, this.cityPickerRoot() || picker);
        }
      }
    }
    if (!option) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      return { ok: false, label: '地区', value: targetCity, reason: `顶部城市列表中未找到 ${targetCity}` };
    }

    await clickElement(option);
    let navigationObserved = false;
    try {
      await waitFor(() => {
        if (this.currentHeaderCity() === targetCity) return true;
        if (location.href !== beforeUrl) {
          navigationObserved = true;
          return true;
        }
        return false;
      }, 12000, `切换到${targetCity}`);
    } catch {
      return { ok: false, label: '地区', value: targetCity, reason: `切换后未确认顶部城市为 ${targetCity}` };
    }

    if (navigationObserved) {
      await waitFor(() => this.searchInput() || this.cards().length, 12000, '城市切换后职位页');
      await sleep(450);
    }
    const confirmedCity = this.currentHeaderCity();
    if (confirmedCity && confirmedCity !== targetCity) {
      return { ok: false, label: '地区', value: targetCity, reason: `当前顶部城市仍为 ${confirmedCity}` };
    }
    return { ok: true, label: '地区', value: targetCity, changed: true, navigationObserved };
  }

  resultSignature() {
    const keys = this.cards().slice(0, 6).map(card => this.cardKey(card)).filter(Boolean);
    return `${location.href}|${keys.join('|')}`;
  }

  async submitKeywordSearch(keyword, { force = false } = {}) {
    const input = await waitFor(() => this.searchInput(), 12000, '搜索框');
    const targetKeyword = String(keyword || '').trim();
    const currentKeyword = String(input.value || '').trim();
    const beforeSignature = this.resultSignature();
    const beforeUrl = location.href;
    const beforeCardCount = this.cards().length;
    const beforeHadFilters = Boolean(this.filterTrigger('求职类型'));
    if (force || currentKeyword !== targetKeyword || !beforeCardCount) {
      setValue(input, targetKeyword);
      const button = this.searchButton();
      if (button) await clickElement(button);
      else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      try {
        await waitFor(() => {
          const currentInput = this.searchInput();
          const inputReady = String(currentInput?.value || '').trim() === targetKeyword;
          if (!inputReady) return false;
          const signatureChanged = this.resultSignature() !== beforeSignature;
          const urlChanged = location.href !== beforeUrl;
          const cardsNow = this.cards().length;
          const filtersAppeared = !beforeHadFilters && Boolean(this.filterTrigger('求职类型'));
          return urlChanged || signatureChanged || filtersAppeared || (beforeCardCount === 0 && cardsNow > 0);
        }, 12000, '关键词搜索结果');
      } catch {
        return { ok: false, label: '关键词', value: targetKeyword, reason: '提交关键词后未确认新搜索结果' };
      }
      await sleep(520);
    }
    return { ok: true, label: '关键词', value: targetKeyword, searched: force || currentKeyword !== targetKeyword };
  }

  topFilterElements() {
    return all('button,a,div,span,li,[role="button"]')
      .filter(element => {
        if (!visible(element)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.top < 112 || rect.top > 340 || rect.left < 80 || rect.left > Math.min(innerWidth * 0.9, 1380)) return false;
        const label = text(element);
        return label.length > 0 && label.length <= 18;
      });
  }

  filterDefinition(label) {
    return BOSS_RESULT_FILTERS[String(label || '').trim()] || null;
  }

  filterElementMeta(element) {
    if (!element) return '';
    return [
      element.id,
      element.className,
      element.getAttribute?.('ka'),
      element.getAttribute?.('data-ka'),
      element.getAttribute?.('data-filter'),
      element.getAttribute?.('data-type'),
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('name')
    ].filter(Boolean).join(' ');
  }

  filterTrigger(label) {
    const definition = this.filterDefinition(label);
    if (!definition) return null;
    const candidates = [...new Set(this.topFilterElements().map(element => resolveClickTarget(element)).filter(Boolean))];
    return candidates.map(element => {
      const labelText = text(element).trim();
      const meta = this.filterElementMeta(element);
      const rect = element.getBoundingClientRect();
      const clickable = /^(BUTTON|A|LI)$/.test(element.tagName)
        || element.getAttribute('role') === 'button'
        || getComputedStyle(element).cursor === 'pointer';
      const hasArrow = Boolean(element.querySelector?.('i,svg,[class*="arrow"],[class*="down"]')) || /dropdown|select|filter|condition/i.test(meta);
      const exactLabel = labelText === label;
      const currentValue = definition.values.find(value => value !== '不限' && labelText === value);
      let score = 0;
      if (definition.meta.test(meta)) score += 240;
      if (exactLabel) score += 190;
      if (currentValue && (clickable || hasArrow || definition.meta.test(meta))) score += 125;
      else if (currentValue) score -= 80;
      if (clickable) score += 55;
      if (hasArrow) score += 45;
      if (rect.width >= 54 && rect.width <= 180) score += 20;
      if (rect.height >= 24 && rect.height <= 60) score += 15;
      if (/清空|更多|公司行业|公司规模|融资阶段|工作区域|职位类型/.test(labelText)) score -= 180;
      return { element, score, left: rect.left, width: rect.width };
    }).filter(item => item.score >= 100)
      .sort((a, b) => b.score - a.score || a.width - b.width || a.left - b.left)[0]?.element || null;
  }

  readFilterValue(label, trigger = this.filterTrigger(label)) {
    const definition = this.filterDefinition(label);
    if (!definition || !trigger) return '';
    const valueText = text(trigger).replace(/\s+/g, '').trim();
    const direct = definition.values.find(value => value !== '不限' && valueText.includes(value.replace(/\s+/g, '')));
    if (direct) return direct;
    if (valueText === label || valueText.includes(label)) return '不限';
    const data = [
      trigger.getAttribute?.('data-value'),
      trigger.getAttribute?.('value'),
      trigger.getAttribute?.('title'),
      trigger.getAttribute?.('aria-label')
    ].filter(Boolean).join(' ');
    return definition.values.find(value => data.includes(value)) || '';
  }

  filterPopupRoot(trigger, definition) {
    const triggerRect = trigger?.getBoundingClientRect?.();
    const values = definition?.values || [];
    const candidates = all('[role="dialog"],[role="menu"],[role="listbox"],[class*="dropdown"],[class*="popover"],[class*="select"],[class*="filter"],[class*="condition"],ul')
      .filter(element => {
        if (!visible(element) || element === trigger || trigger?.contains?.(element) || element.contains?.(trigger)) return false;
        const body = text(element);
        const valueCount = values.filter(value => body.includes(value)).length;
        if (valueCount < 2) return false;
        const rect = element.getBoundingClientRect();
        if (triggerRect && rect.top < triggerRect.top - 12) return false;
        return rect.width > 80 && rect.height > 40;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect(); const br = b.getBoundingClientRect();
        const ad = triggerRect ? Math.abs(ar.left - triggerRect.left) + Math.abs(ar.top - triggerRect.bottom) : 0;
        const bd = triggerRect ? Math.abs(br.left - triggerRect.left) + Math.abs(br.top - triggerRect.bottom) : 0;
        return ad - bd || ar.width * ar.height - br.width * br.height;
      });
    return candidates[0] || document;
  }

  filterOption(targetValue, trigger, definition) {
    const escaped = targetValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const root = this.filterPopupRoot(trigger, definition);
    const triggerRect = trigger.getBoundingClientRect();
    return findByText(new RegExp(`^${escaped}$`), root)
      .map(element => resolveClickTarget(element))
      .filter(element => {
        if (!element || element === trigger || trigger.contains?.(element) || !visible(element)) return false;
        if (element.closest?.('[class*="job-card"],[class*="job-list"],[class*="job-detail"],[class*="job-primary"]')) return false;
        const rect = element.getBoundingClientRect();
        return rect.top >= triggerRect.top - 6
          && rect.top < Math.min(innerHeight - 20, triggerRect.bottom + 380)
          && Math.abs(rect.left - triggerRect.left) < 280;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect(); const br = b.getBoundingClientRect();
        const aSelected = a.getAttribute?.('aria-selected') === 'true' || /active|selected|checked/i.test(String(a.className || ''));
        const bSelected = b.getAttribute?.('aria-selected') === 'true' || /active|selected|checked/i.test(String(b.className || ''));
        const aClickable = /^(BUTTON|A|LI)$/.test(a.tagName) || a.getAttribute('role') === 'option' || getComputedStyle(a).cursor === 'pointer';
        const bClickable = /^(BUTTON|A|LI)$/.test(b.tagName) || b.getAttribute('role') === 'option' || getComputedStyle(b).cursor === 'pointer';
        return Number(bClickable) - Number(aClickable)
          || Number(bSelected) - Number(aSelected)
          || Math.abs(ar.left - triggerRect.left) - Math.abs(br.left - triggerRect.left)
          || ar.top - br.top;
      })[0] || null;
  }

  async applyFilter(label, value, { retries = 2 } = {}) {
    const definition = this.filterDefinition(label);
    const targetValue = String(value || '不限').trim() || '不限';
    if (!definition || !definition.values.includes(targetValue)) {
      return { ok: false, confirmed: false, label, value: targetValue, actualValue: '', reason: `${label}配置值不受支持` };
    }
    let lastReason = '';
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const trigger = await waitFor(() => this.filterTrigger(label), 9000, `${label}筛选入口`).catch(() => null);
      if (!trigger) {
        lastReason = `未找到${label}筛选入口`;
        await waitForDomMutation(420);
        continue;
      }
      const beforeValue = this.readFilterValue(label, trigger);
      if (beforeValue === targetValue) {
        return { ok: true, confirmed: true, unchanged: true, label, value: targetValue, actualValue: targetValue, evidence: 'trigger-text' };
      }
      const beforeSignature = this.resultSignature();
      await clickElement(trigger);
      await waitForDomMutation(360);
      const option = this.filterOption(targetValue, trigger, definition);
      if (!option) {
        lastReason = `${label}中未找到 ${targetValue}`;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        await sleep(240);
        continue;
      }
      await clickElement(option);
      let confirmed = false;
      try {
        await waitFor(() => {
          const nextTrigger = this.filterTrigger(label) || trigger;
          const actual = this.readFilterValue(label, nextTrigger);
          if (actual === targetValue) { confirmed = true; return true; }
          const selected = option.getAttribute?.('aria-selected') === 'true' || /active|selected|checked/i.test(String(option.className || ''));
          if (selected && this.resultSignature() !== beforeSignature) { confirmed = true; return true; }
          return false;
        }, 6500, `${label}生效确认`);
      } catch {}
      const nextTrigger = this.filterTrigger(label) || trigger;
      const actualValue = this.readFilterValue(label, nextTrigger);
      if (confirmed || actualValue === targetValue) {
        await sleep(320);
        return { ok: true, confirmed: true, changed: true, label, value: targetValue, actualValue: targetValue, evidence: actualValue === targetValue ? 'trigger-text' : 'selected-option-and-results' };
      }
      lastReason = `${label}点击后未确认生效（当前 ${actualValue || '未知'}）`;
      await waitForDomMutation(450);
    }
    return { ok: false, confirmed: false, label, value: targetValue, actualValue: '', reason: lastReason || `${label}未生效` };
  }

  cardKey(card) {
    const anchor = card.querySelector('a[href*="job_detail"]');
    const href = String(anchor?.href || card.getAttribute('data-jobid') || '');
    const token = jobUrlToken(href);
    if (token) return `job:${token}`;
    const identity = this.cardIdentity(card);
    const raw = normalize(`${identity.company}|${identity.title}|${identity.raw}`);
    return raw ? `card:${raw.slice(0, 260)}` : '';
  }

  async openCard(card) {
    if (!card) return null;
    const beforeRoot = this.detailRoot();
    const beforeSignature = this.detailSignature(beforeRoot);
    const beforeUrl = location.href;

    // BOSS 常会默认选中列表第一项。此时详情已经存在，重复点击不会改变文本，
    // 旧逻辑会把“同一详情”误判为超时。先匹配当前详情，匹配成功直接复用。
    if (beforeRoot && this.detailMatchesCard(beforeRoot, card)) return beforeRoot;

    const anchor = card.querySelector('a[href*="job_detail"]');
    const targets = [...new Set([anchor, card].filter(Boolean))];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const target = targets[Math.min(attempt, targets.length - 1)] || card;
      try {
        await clickElement(target);
      } catch {
        // 某些虚拟列表会在滚动后替换节点，下一轮重新尝试。
      }

      const timeout = attempt === 0 ? 6500 : 4500;
      try {
        const root = await waitFor(() => {
          const current = this.detailRoot();
          if (!this.detailReady(current)) return null;
          const signature = this.detailSignature(current);
          const changed = Boolean(signature && signature !== beforeSignature);
          const urlChanged = location.href !== beforeUrl;
          const matches = this.detailMatchesCard(current, card);
          const selected = this.isSelectedCard(card);
          return (matches || changed || urlChanged || selected) ? current : null;
        }, timeout, '岗位详情');
        if (root) return root;
      } catch {
        // 单次超时不终止任务，稍后重新点击或使用已加载详情。
      }

      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      await sleep(260 + attempt * 180);
    }

    const fallback = this.detailRoot();
    if (fallback && (this.detailMatchesCard(fallback, card) || this.isSelectedCard(card))) return fallback;
    return null;
  }

  cleanJobTitle(value = '') {
    const raw = String(value || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    return raw
      .replace(/\b\d+(?:\.\d+)?[-–~]\d+(?:\.\d+)?\s*(?:K|k|万|元\/天|元\/月).*$/i, '')
      .replace(/\s+(?:\d+个月|\d+年|本科|大专|硕士|博士|经验不限|在校\/应届).*$/i, '')
      .replace(/^(?:职位名称|岗位名称)[:：\s]*/i, '')
      .trim()
      .slice(0, 60);
  }

  plausibleJobTitle(value = '') {
    const title = this.cleanJobTitle(value);
    if (title.length < 2 || title.length > 60) return false;
    if (/女士|先生|HR|招聘者|月内活跃|刚刚活跃|人事|招聘经理|公司介绍|职位描述/i.test(title)) return false;
    return /实习|开发|工程|产品|运营|设计|算法|测试|销售|客服|助理|经理|顾问|研究|数据|前端|后端|全栈|Java|Python|AI|视觉|市场|财务|人力/i.test(title)
      || title.length <= 24;
  }

  cleanCompanyName(value = '') {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/(?:成立于|公司介绍|是一家|位于).*$/i, '')
      .replace(/^[·|｜\s]+|[·|｜\s]+$/g, '')
      .trim()
      .slice(0, 50);
  }

  extractJob(card) {
    const root = this.detailRoot();
    const cardText = text(card);
    const detailText = text(root);
    const identity = this.cardIdentity(card);
    const detailTitleCandidates = [
      'h1', 'h2', '[class*="job-name"]', '[class*="job-title"]', '[class*="jobName"]', '[class*="jobTitle"]'
    ].map(selector => text(root?.querySelector(selector))).filter(Boolean);
    const rawTitle = detailTitleCandidates.find(value => this.plausibleJobTitle(value))
      || (this.plausibleJobTitle(identity.title) ? identity.title : '')
      || cardText.split(/\n|\s{2,}/).map(value => this.cleanJobTitle(value)).find(value => this.plausibleJobTitle(value))
      || '岗位';
    const title = this.cleanJobTitle(rawTitle) || '岗位';

    const detailCompanyCandidates = [
      '[class*="company-name"]', '[class*="companyName"]', 'a[href*="gongsi"]', '[class*="company-info"] [class*="name"]'
    ].map(selector => text(root?.querySelector(selector))).filter(Boolean);
    const company = this.cleanCompanyName(detailCompanyCandidates[0] || identity.company || text(card.querySelector('[class*="company-name"],[class*="companyName"]')) || '');
    const salaryMatch = `${cardText} ${detailText}`.match(/\d+(?:\.\d+)?[-–~]\d+(?:\.\d+)?[Kk万]|\d+[Kk]以上|\d+[-–~]\d+元(?:\/天|\/月)?/);
    const locationMatch = `${cardText} ${detailText}`.match(/北京|上海|广州|深圳|杭州|成都|南京|武汉|西安|苏州|重庆|长沙|天津|郑州|厦门|青岛|宁波|合肥|福州|济南|大连|沈阳|昆明|南昌|无锡|佛山|东莞|珠海|海口|三亚|石家庄|太原|长春|哈尔滨|南宁|贵阳|乌鲁木齐|兰州|西宁|银川|呼和浩特|日本|东京|大阪/);
    const anchor = card.querySelector('a[href*="job_detail"]') || root?.querySelector('a[href*="job_detail"]');
    return {
      title,
      company,
      salary: salaryMatch?.[0] || '',
      location: locationMatch?.[0] || '',
      description: detailText.slice(0, 9000),
      cardText: cardText.slice(0, 1000),
      url: anchor?.href || location.href,
      jobId: jobUrlToken(anchor?.href || location.href),
      recruiterName: this.detailRecruiterIdentity(root).name || '',
      chatUrl: String((this.communicateButton()?.href || this.communicateButton()?.closest?.('a')?.href || '')),
      applicationMode: this.externalApplicationInfo(root)?.type || 'boss_chat',
      collectedAt: Date.now()
    };
  }

  communicateButton() {
    const detail = this.detailRoot();
    const selectors = [
      '.start-chat-btn',
      '.btn-startchat',
      '.job-detail-op-btn',
      '[class*="start-chat"]',
      '[class*="startChat"]',
      '[ka*="job-detail-chat"]',
      '[ka*="job_detail_chat"]',
      'a[href*="/web/geek/chat"]',
      'a[href*="/chat/"]'
    ];
    const explicit = selectors.flatMap(selector => all(selector));
    const byText = findByText(/^立即沟通$|^继续沟通$|^打招呼$|去沟通|开始沟通/);
    const candidates = [...new Set([...explicit, ...byText, ...all('button,a').filter(element => /立即沟通|继续沟通|打招呼|去沟通/.test(text(element)))])]
      .filter(element => visible(element) && element.getAttribute('aria-disabled') !== 'true' && !element.disabled);
    return candidates.sort((a, b) => {
      const score = element => {
        const label = text(element);
        const rect = element.getBoundingClientRect();
        return (detail?.contains?.(element) ? 100 : 0)
          + (/^立即沟通$/.test(label) ? 40 : 0)
          + (/^继续沟通$/.test(label) ? 30 : 0)
          + (rect.left > Number(globalThis.innerWidth || 1200) * 0.28 ? 20 : 0)
          + (/start-chat|startChat|job-detail/i.test(String(element.className || '')) ? 10 : 0);
      };
      return score(b) - score(a);
    })[0] || null;
  }


  externalApplicationInfo(root = this.detailRoot()) {
    const scope = root || document;
    const exactPattern = /^(立即网申|去网申|前往网申|立即申请|去申请|申请职位|立即投递|投递简历|前往申请)$/;
    const elements = [...new Set(all('button,a,[role="button"]', scope).map(resolveClickTarget).filter(Boolean))]
      .filter(element => visible(element) && !element.disabled && element.getAttribute?.('aria-disabled') !== 'true');
    const button = elements.find(element => exactPattern.test(text(element)));
    if (!button) return null;
    const label = text(button);
    const anchor = button.matches?.('a[href]') ? button : button.closest?.('a[href]');
    const href = String(anchor?.href || button.getAttribute?.('data-url') || button.getAttribute?.('data-href') || '');
    return {
      type: 'external_application',
      label,
      href,
      reason: '该岗位需要跳转网申，JobClaw 无法在 BOSS 聊天中自动投递'
    };
  }

  isExternalApplicationJob(root = this.detailRoot()) {
    return Boolean(this.externalApplicationInfo(root));
  }

  dialogConfirmButton() {
    const dialogs = all('[role="dialog"],[class*="dialog"],[class*="modal"],[class*="popup"]').filter(visible);
    for (const dialog of dialogs) {
      const button = all('button,a,span', dialog).find(element => visible(element) && /^(继续沟通|确认沟通|去沟通|确定|确认|我知道了|继续)$/.test(text(element)));
      if (button) return button;
    }
    return null;
  }

  composerRoots(input = this.chatInput()) {
    if (!input) return [];
    const roots = [];
    let current = input;
    for (let depth = 0; current && depth < 9; depth += 1) {
      if (!roots.includes(current)) roots.push(current);
      current = current.parentElement || null;
    }
    const form = input.closest?.('form');
    if (form && !roots.includes(form)) roots.unshift(form);
    return roots;
  }

  sendButton(input = this.chatInput()) {
    if (!input) return null;
    const selectors = [
      'button',
      '[role="button"]',
      '[class*="send-btn"]',
      '[class*="sendBtn"]',
      '[class*="send-message"]',
      '[class*="sendMessage"]',
      '[ka*="chat-send"]',
      '[ka*="send-message"]',
      '[aria-label*="发送"]'
    ];
    const candidates = [...new Set([
      ...selectors.flatMap(selector => all(selector)),
      ...findByText(/^发送$/)
    ])].map(resolveClickTarget).filter(Boolean);
    const inputRect = input.getBoundingClientRect();
    const roots = this.composerRoots(input);
    const form = input.closest?.('form');
    const scored = candidates
      .filter(element => {
        if (!visible(element) || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
        const label = text(element);
        const semantic = `${label} ${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('ka') || ''} ${String(element.className || '')}`;
        if (/发送简历|发送附件|发送在线简历|发简历|图片/.test(semantic)) return false;
        if (!/^发送$/.test(label) && !/(chat[-_]?send|send[-_]?message|sendbtn|send-btn|发送)/i.test(semantic)) return false;
        const rect = element.getBoundingClientRect();
        const verticalDistance = Math.min(Math.abs(rect.top - inputRect.bottom), Math.abs(rect.bottom - inputRect.top));
        return verticalDistance < 320 && rect.left > inputRect.left - 120;
      })
      .map(element => {
        const rect = element.getBoundingClientRect();
        const label = text(element);
        const semantic = `${element.getAttribute?.('aria-label') || ''} ${element.getAttribute?.('ka') || ''} ${String(element.className || '')}`;
        const sharedRootIndex = roots.findIndex(root => root !== input && root.contains?.(element));
        let score = 0;
        if (/^发送$/.test(label)) score += 180;
        if (/(chat[-_]?send|send[-_]?message|sendbtn|send-btn)/i.test(semantic)) score += 90;
        if (form && form.contains?.(element)) score += 160;
        if (sharedRootIndex >= 0) score += Math.max(20, 130 - sharedRootIndex * 12);
        if (rect.left >= inputRect.left + inputRect.width * 0.55) score += 70;
        if (rect.top >= inputRect.top - 80 && rect.top <= inputRect.bottom + 130) score += 70;
        score -= Math.min(160, Math.abs(rect.top - inputRect.bottom) * 0.5);
        score -= Math.min(100, Math.abs(rect.right - inputRect.right) * 0.08);
        return { element, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.element || null;
  }

  async activateSendButton(input, mode = 'native') {
    const button = await waitFor(() => this.sendButton(input), 5000, '可用发送按钮');
    const target = resolveClickTarget(button);
    if (!target) throw new Error('未找到聊天输入区旁的发送按钮');
    await waitFor(() => !target.disabled && target.getAttribute?.('aria-disabled') !== 'true' ? target : null, 4000, '发送按钮启用');
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    target.focus?.();
    await sleep(180);

    if (mode === 'submit') {
      const form = target.closest?.('form') || input.closest?.('form');
      if (form?.requestSubmit) {
        form.requestSubmit(target.matches?.('button,input[type="submit"]') ? target : undefined);
        return target;
      }
    }

    if (mode === 'events') {
      const sanitized = sanitizeUnsafeActivation(target);
      try {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          const EventType = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
          target.dispatchEvent(new EventType(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            button: 0,
            buttons: type.endsWith('down') ? 1 : 0
          }));
        }
      } finally {
        sanitized.restore();
      }
      return target;
    }

    // 发送按钮是已通过位置和语义筛选的聊天编辑器按钮，优先调用真实 DOM click。
    // 这里不再复用全局第一个 submit，避免误点搜索框或其他表单按钮。
    if (typeof target.click === 'function') target.click();
    else await clickElement(target);
    return target;
  }

  chatEntryDiagnostics() {
    const button = this.communicateButton();
    return {
      url: String(location.href || ''),
      pageType: this.pageType(),
      chatRoute: this.chatRouteActive(),
      buttonText: text(button),
      buttonHref: String(button?.href || button?.closest?.('a')?.href || ''),
      composerHint: text(this.composerHintNode()).slice(0, 120),
      composerFound: Boolean(this.composerRoot()),
      emptyConversation: this.emptyConversationPlaceholderVisible(),
      detailReady: Boolean(this.detailRoot())
    };
  }

  async waitForChatReady(timeout = 18000) {
    const startedAt = Date.now();
    let lastContinueClick = 0;
    let lastActivationAttempt = 0;
    while (Date.now() - startedAt < timeout) {
      if (hasVerification()) throw new Error('检测到安全验证，已暂停');
      const input = this.chatInput();
      if (input) return input;

      if ((this.chatRouteActive() || this.composerRoot()) && Date.now() - lastActivationAttempt > 1300) {
        lastActivationAttempt = Date.now();
        const activated = await this.ensureChatEditorReady(1800).catch(() => null);
        if (activated) return activated;
      }

      const confirm = this.dialogConfirmButton();
      if (confirm) {
        await clickElement(confirm);
        await waitForDomMutation(520);
        continue;
      }

      const continueButton = this.communicateButton();
      if (continueButton && /^继续沟通$|去沟通|开始沟通/.test(text(continueButton)) && Date.now() - lastContinueClick > 1700) {
        lastContinueClick = Date.now();
        await clickElement(continueButton);
        await waitForDomMutation(620);
        continue;
      }
      await waitForDomMutation(360);
    }
    return null;
  }

  async enterChat() {
    const existing = this.chatInput() || await this.ensureChatEditorReady(1800).catch(() => null);
    if (existing) return existing;

    if (this.chatRouteActive()) {
      const routeInput = await this.waitForChatReady(22000);
      if (routeInput) return routeInput;
    }

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const button = this.communicateButton();
      if (!button) {
        const routeInput = await this.waitForChatReady(attempt === 0 ? 12000 : 8000);
        if (routeInput) return routeInput;
        const diagnostics = this.chatEntryDiagnostics();
        lastError = chatEntryError(
          diagnostics.chatRoute ? '沟通页已打开，但消息输入区尚未就绪' : '未找到立即沟通入口',
          diagnostics.chatRoute ? 'CHAT_EDITOR_TIMEOUT' : 'CHAT_ENTRY_MISSING',
          diagnostics
        );
        continue;
      }

      const anchor = button.matches?.('a') ? button : button.closest?.('a');
      const href = button.href || anchor?.href || '';
      try {
        if (href && /^https:\/\/app\.zhipin\.com\//i.test(href) && !this.chatRouteActive()) {
          anchor?.removeAttribute?.('target');
          if (typeof location.assign === 'function') location.assign(href);
          else location.href = href;
          return { handoff: true, url: href };
        }
        await clickElement(button);
      } catch (error) {
        lastError = error;
        if (href && /zhipin\.com/.test(href)) {
          if (typeof location.assign === 'function') location.assign(href);
          else location.href = href;
          return { handoff: true, url: href };
        }
      }

      const input = await this.waitForChatReady(attempt === 0 ? 24000 : (attempt === 1 ? 16000 : 12000));
      if (input) return input;

      lastError = chatEntryError(
        '沟通关系已尝试建立，但消息输入区未出现',
        'CHAT_EDITOR_TIMEOUT',
        { ...this.chatEntryDiagnostics(), attempt: attempt + 1 }
      );
      await waitForDomMutation(700 + attempt * 300);
    }
    throw lastError || chatEntryError('未能进入沟通页面', 'CHAT_ENTRY_TIMEOUT', this.chatEntryDiagnostics());
  }

  setChatText(input, greeting) {
    const editor = this.resolveEditableChatInput(input) || input;
    if (!editor) throw new Error('未找到可编辑的聊天输入框');
    const desired = String(greeting || '').trim();
    const current = normalize(this.chatInputValue(editor));
    const target = normalize(desired);
    if (current === target || (target && current.includes(target) && current.length <= target.length + 8)) {
      editor.focus?.();
      return { changed: false, preserved: true, diagnostics: this.chatEditorDiagnostics(editor) };
    }

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement || ('value' in editor && !editor.isContentEditable)) {
      setValue(editor, desired);
      editor.focus?.();
      return { changed: true, preserved: false, diagnostics: this.chatEditorDiagnostics(editor) };
    }

    editor.focus?.();
    const selection = globalThis.getSelection?.();
    if (selection && globalThis.document?.createRange) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    try {
      editor.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType: 'deleteContentBackward',
        data: null
      }));
    } catch {}
    let inserted = false;
    try {
      inserted = Boolean(document.execCommand?.('insertText', false, desired));
    } catch {
      inserted = false;
    }
    if (!inserted || normalize(this.chatInputValue(editor)) !== target) {
      try {
        editor.replaceChildren(document.createTextNode(desired));
      } catch {
        editor.textContent = desired;
      }
    }
    try {
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: desired
      }));
    } catch {
      editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    editor.focus?.();
    return { changed: true, preserved: false, diagnostics: this.chatEditorDiagnostics(editor) };
  }

  trustedTarget(element, prefix = 'target') {
    if (!element?.setAttribute) throw new Error('可信输入目标不存在');
    const token = `jobclaw-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const attribute = 'data-jobclaw-trusted-target';
    element.setAttribute(attribute, token);
    return {
      selector: `[${attribute}="${token}"]`,
      cleanup: () => {
        try {
          if (element.getAttribute(attribute) === token) element.removeAttribute(attribute);
        } catch {}
      }
    };
  }

  async trustedEditorAction(action, input, payload = {}) {
    const editor = this.resolveEditableChatInput(input) || input;
    if (!editor) throw new Error('聊天输入框不存在');
    editor.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    await sleep(120);
    const tagged = this.trustedTarget(editor, 'editor');
    try {
      const response = await send('TRUSTED_CHAT_INPUT', {
        action,
        selector: tagged.selector,
        point: this.elementPoint(editor),
        ...payload
      });
      if (!response?.ok) throw new Error(response?.error || 'Chrome 可信输入通道不可用');
      return response;
    } finally {
      tagged.cleanup();
    }
  }

  async trustedElementAction(action, element, payload = {}) {
    if (!element) throw new Error('可信点击目标不存在');
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    await sleep(120);
    const tagged = this.trustedTarget(element, 'element');
    try {
      const response = await send('TRUSTED_CHAT_INPUT', {
        action,
        selector: tagged.selector,
        point: this.elementPoint(element),
        ...payload
      });
      if (!response?.ok) throw new Error(response?.error || 'Chrome 可信点击通道不可用');
      return response;
    } finally {
      tagged.cleanup();
    }
  }

  pressEnter(input) {
    const editor = this.resolveEditableChatInput(input) || input;
    editor?.focus?.();
    for (const type of ['keydown', 'keyup']) {
      editor?.dispatchEvent?.(new KeyboardEvent(type, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
        composed: true
      }));
    }
  }

  async waitForEditorGreeting(input, greeting, timeout = 9000) {
    const expected = normalize(String(greeting || ''));
    return waitFor(() => {
      const editor = this.resolveEditableChatInput(this.chatInput() || input) || input;
      const current = normalize(this.chatInputValue(editor));
      return current === expected
        || (current.includes(expected) && current.length <= expected.length + 8)
        ? editor
        : null;
    }, timeout, '招呼语完整写入真实聊天输入框');
  }

  async sendGreeting(greeting, options = {}) {
    const safeGreeting = String(greeting || '').trim();
    if (safeGreeting.length < 8) throw new Error('求职招呼语为空或过短，已停止发送附件');
    let input = this.resolveEditableChatInput(this.chatInput() || await this.enterChat());
    if (!input) throw new Error('未找到真实可编辑的聊天输入框，已暂停');
    const expectedConversationKey = String(options.expectedConversationKey || '');
    const pendingId = String(options.pendingId || '');
    if (expectedConversationKey) this.assertConversationKey(expectedConversationKey, pendingId);

    const beforeMessages = this.chatMessageSnapshot();
    const chatReadyDelay = Math.max(1800, Math.min(7000, Number(options.chatReadyDelayMs || 3000)));
    const beforeSendDelay = Math.max(900, Math.min(5000, Number(options.beforeSendDelayMs || 1800)));
    const confirmTimeout = Math.max(22000, Math.min(60000, Number(options.confirmTimeoutMs || 42000)));
    const normalizedGreeting = normalize(safeGreeting);
    await sleep(chatReadyDelay);

    const currentInput = () => this.resolveEditableChatInput(this.chatInput() || input) || input;
    const inputContainsGreeting = () => {
      const current = normalize(this.chatInputValue(currentInput()));
      return current === normalizedGreeting
        || (current.includes(normalizedGreeting) && current.length <= normalizedGreeting.length + 8);
    };
    const strictConfirm = timeout => this.waitForStableOutgoingGreeting(
      safeGreeting,
      beforeMessages,
      timeout,
      expectedConversationKey,
      pendingId
    );

    let writeMethod = 'preserved-draft';
    let sendMethod = 'trusted-enter';
    let writeResult = null;
    const alreadyInEditor = inputContainsGreeting();

    if (alreadyInEditor) {
      writeResult = { changed: false, preserved: true, diagnostics: this.chatEditorDiagnostics(currentInput()) };
      try {
        await this.trustedEditorAction('pressEnter', currentInput());
      } catch {
        sendMethod = 'dom-enter';
        this.pressEnter(currentInput());
      }
    } else {
      try {
        const trustedWrite = await this.trustedEditorAction('replaceTextAndEnter', input, { text: safeGreeting });
        writeMethod = trustedWrite?.writeMethod || 'clipboard/main-world/cdp-atomic';
        // 原子通道会先确认文字进入真实编辑器，再在同一次后台调用中按 Enter。
        // Enter 后输入框可能立即清空，因此这里只在仍有文字时做编辑器校验。
        if (normalize(this.chatInputValue(this.resolveEditableChatInput(this.chatInput() || input) || input))) {
          input = await this.waitForEditorGreeting(input, safeGreeting, 5000);
        }
        writeResult = {
          changed: true,
          preserved: false,
          insertedBeforeSend: trustedWrite?.insertedBeforeSend === true,
          writeMethod,
          diagnostics: this.chatEditorDiagnostics(this.resolveEditableChatInput(this.chatInput() || input) || input)
        };
      } catch (trustedWriteError) {
        // 主世界写入失败时只允许一次 DOM 写入兜底，确认真实有字后再触发可信 Enter。
        writeResult = this.setChatText(input, safeGreeting);
        input = await this.waitForEditorGreeting(input, safeGreeting, 10000).catch(() => {
          throw new Error(`招呼语没有进入 BOSS 真实输入框：${trustedWriteError?.message || '主世界写入失败'}；${JSON.stringify(this.chatEditorDiagnostics(input))}`);
        });
        writeMethod = 'dom-input-fallback';
        await sleep(900);
        try {
          await this.trustedEditorAction('pressEnter', input);
        } catch {
          sendMethod = 'dom-enter';
          this.pressEnter(input);
        }
      }
    }

    await sleep(beforeSendDelay);
    if (expectedConversationKey) this.assertConversationKey(expectedConversationKey, pendingId);

    let confirmed = await strictConfirm(Math.min(15000, confirmTimeout));
    if (confirmed) {
      await sleep(2600);
      return { ok: true, confirmed: true, writeResult, method: `${writeMethod}+${sendMethod}` };
    }

    // 输入框已经清空时，不允许重写文案或处理下一个岗位；继续等待当前会话的新文字气泡。
    if (!inputContainsGreeting()) {
      confirmed = await strictConfirm(confirmTimeout);
      if (confirmed) {
        await sleep(2600);
        return { ok: true, confirmed: true, writeResult, method: `${writeMethod}+${sendMethod}-delayed` };
      }
      throw new Error(`文字已离开输入框，但当前 HR 聊天记录没有出现本次招呼语；已暂停且不会发送附件。编辑器：${JSON.stringify(this.chatEditorDiagnostics(currentInput()))}`);
    }

    // Enter 没有生效时，只点击当前编辑器附近、此刻可见的发送按钮一次。
    const button = await waitFor(() => this.sendButton(currentInput()), 6000, '当前聊天发送按钮').catch(() => null);
    if (button) {
      try {
        await this.trustedElementAction('click', button);
        sendMethod = 'debugger-send-button';
      } catch {
        await this.activateSendButton(currentInput(), 'native');
        sendMethod = 'dom-send-button';
      }
      confirmed = await strictConfirm(Math.min(16000, confirmTimeout));
      if (confirmed) {
        await sleep(2600);
        return { ok: true, confirmed: true, writeResult, method: `${writeMethod}+${sendMethod}` };
      }
      if (!inputContainsGreeting()) {
        confirmed = await strictConfirm(confirmTimeout);
        if (confirmed) {
          await sleep(2600);
          return { ok: true, confirmed: true, writeResult, method: `${writeMethod}+${sendMethod}-delayed` };
        }
        throw new Error('发送按钮已触发且输入框已清空，但当前聊天正文没有出现文字气泡；已暂停，未发送附件');
      }
    }

    throw new Error(`招呼语仍在真实输入框中，发送动作未生效；已暂停且不会切换岗位。编辑器：${JSON.stringify(this.chatEditorDiagnostics(currentInput()))}`);
  }

  async uploadResumeImage(dataUrl, options = {}) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return { ok: false, skipped: true };
    if (options.expectedConversationKey) this.assertConversationKey(String(options.expectedConversationKey), String(options.pendingId || ''));
    const beforeImages = this.chatImageNodes().length;
    const beforeMessages = this.chatMessageNodes().length;
    const delayMs = Math.max(1000, Math.min(10000, Number(options.delayMs || 2000)));
    await sleep(delayMs);

    const uploadButton = findByText(/图片|发送简历|附件/).find(visible);
    if (uploadButton) await clickElement(uploadButton);
    const input = all('input[type="file"]').find(element => element.accept?.includes('image') || !element.accept);
    if (!input) return { ok: false, error: '未找到图片上传入口' };
    const [meta, encoded] = dataUrl.split(',');
    const mime = meta.match(/data:([^;]+)/)?.[1] || 'image/png';
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const file = new File([bytes], 'JobClaw-resume.png', { type: mime });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // 若站点弹出图片预览，等待预览稳定后再点击其中的“发送”。
    await sleep(1000);
    const dialog = all('[role="dialog"],[class*="dialog"],[class*="modal"],[class*="preview"]').find(visible);
    if (dialog) {
      const confirm = all('button,a,span', dialog).find(element => visible(element) && /^发送$|^确定$|^确认$/.test(text(element)));
      if (confirm) await clickElement(confirm);
    }

    const confirmed = await waitFor(() => {
      const imagesAdded = this.chatImageNodes().length > beforeImages;
      const messageAdded = this.chatMessageNodes().length > beforeMessages;
      const fileCleared = !input.files || input.files.length === 0;
      return imagesAdded || (messageAdded && fileCleared);
    }, 14000, '简历图片发送确认').catch(() => null);
    if (!confirmed) return { ok: false, error: '简历图片未确认发送' };
    await sleep(1200);
    return { ok: true, confirmed: true };
  }

  async sendOnlineResume() {
    const button = findByText(/发送在线简历|在线简历/).find(visible);
    if (!button) return false;
    await clickElement(button);
    await sleep(500);
    return true;
  }
}

const adapter = new BossAdapter();
if (globalThis.__JOBCLAW_TEST_MODE__) {
  globalThis.__JOBCLAW_TEST_API__ = { BossAdapter, adapter, clickElement, resolveClickTarget, unsafeJavascriptAnchor, sanitizeUnsafeActivation, isExtensionContextError, send, contextInvalidated: () => extensionContextInvalidated, runtimeIsActive, contentVersion: JOBCLAW_CONTENT_VERSION, contentBuild: JOBCLAW_CONTENT_BUILD, contentFile: JOBCLAW_CONTENT_FILE };
}
let running = false;

async function updateTaskProgress({ runId = '', job = null, task = null, analysis = null, stage, progress = null, stageLabel = '', status = 'running', error = '', retryable = null, pendingId = '', setActive = false, extra = {} } = {}) {
  const response = await send('TASK_PROGRESS', {
    run: {
      id: runId || undefined,
      job: job || undefined,
      searchTask: task || undefined,
      analysis: analysis || undefined,
      pendingId: pendingId || undefined,
      stage,
      progress,
      stageLabel,
      status,
      error,
      retryable: retryable === null ? undefined : retryable,
      ...extra
    },
    setActive
  });
  return response?.run || null;
}

async function updateSearchProgress(task, taskIndex, patch = {}) {
  return send('SEARCH_TASK_PROGRESS', {
    taskId: task?.id,
    taskIndex,
    ...patch
  });
}

async function pauseForVerification() {
  await send('WORKFLOW', {
    patch: {
      paused: true,
      statusText: '检测到安全验证，已自动暂停'
    }
  });
  await send('EVENT', {
    level: 'warning',
    message: '检测到 BOSS 安全验证，任务已暂停'
  });
  await send('SAFETY_OUTCOME', { ok: false, reason: '检测到BOSS安全验证' });
}

async function processApproved(state) {
  const id = state.workflow?.pendingApplyId;
  if (!id) return false;
  const item = (state.pending || []).find(entry => entry.id === id);
  if (!item) {
    await send('WORKFLOW', { patch: { pendingApplyId: null, activeRunId: null, phase: 'search' } });
    return false;
  }
  const greeting = item.deliveryGreeting || item.analysis?.greeting || `您好，我想应聘贵公司的${item.job?.title || '该岗位'}。我已认真阅读岗位要求，希望有机会进一步沟通，谢谢。`;
  let runId = item.runId || state.workflow?.activeRunId || '';
  let currentStage = 'open_job';
  let currentStageLabel = '打开岗位页面';
  let confirmedConversation = null;
  let messageSentConfirmed = false;
  try {
    let run = await updateTaskProgress({
      runId,
      pendingId: id,
      job: item.job,
      task: item.task,
      stage: currentStage,
      progress: 70,
      stageLabel: currentStageLabel,
      status: 'running',
      retryable: true,
      setActive: true
    });
    runId = run?.id || runId;

    const transition = state.chatTransition && state.chatTransition.pendingId === id ? state.chatTransition : null;
    const onChatPage = adapter.chatRouteActive() || Boolean(adapter.chatInput());

    // 每个新岗位必须先回到自己的岗位详情，再从该详情进入对应 HR 会话。
    // 旧版在上一个聊天页直接处理下一任务，导致所有文案继续发给同一个 HR。
    if (onChatPage && !transition) {
      contentRuntime.chatBinding = null;
      if (!item.job?.url) throw new Error('当前仍在上一个 HR 会话，且目标岗位地址缺失，已禁止发送');
      await send('WORKFLOW', { patch: { statusText: `正在切换到目标岗位：${item.job?.title || '岗位'}`, activeRunId: runId } });
      location.href = item.job.url;
      return true;
    }

    if (!onChatPage && item.job?.url && !adapter.currentJobMatches(item.job)) {
      contentRuntime.chatBinding = null;
      await send('WORKFLOW', { patch: { statusText: '正在打开已确认岗位', activeRunId: runId } });
      location.href = item.job.url;
      return true;
    }

    if (!onChatPage) {
      const externalApplication = adapter.externalApplicationInfo();
      if (externalApplication) {
        currentStage = 'skipped';
        currentStageLabel = '外部网申岗位已跳过';
        await updateTaskProgress({
          runId, pendingId: id, job: item.job, task: item.task,
          stage: currentStage, progress: 100, stageLabel: currentStageLabel,
          status: 'skipped', error: externalApplication.reason, retryable: false, setActive: false
        });
        await send('EVENT', {
          level: 'info',
          message: `外部网申岗位已自动跳过：${item.job?.title || '岗位'}`,
          data: { id, runId, job: item.job, application: externalApplication }
        });
        await send('SKIP_PENDING', { id, reason: externalApplication.reason, stageLabel: currentStageLabel });
        contentRuntime.chatBinding = null;
        await adapter.returnToJobsHome();
        return true;
      }
    }

    let expected = transition?.expected || null;
    if (!onChatPage) {
      expected = adapter.expectedChatContext(item.job, id);
      const prepared = await send('CHAT_BINDING_PREPARE', { pendingId: id, job: item.job, expected });
      if (!prepared?.ok) throw new Error(prepared?.error || '无法建立岗位与 HR 会话绑定');
    }

    currentStage = 'open_chat';
    currentStageLabel = '打开沟通窗口';
    await updateTaskProgress({ runId, pendingId: id, job: item.job, task: item.task, stage: currentStage, progress: 78, stageLabel: currentStageLabel, status: 'running', retryable: true, setActive: true });
    await send('WORKFLOW', { patch: { phase: 'apply', statusText: `打开目标 HR 沟通窗口：${item.job?.title || '岗位'}`, activeRunId: runId } });
    const chatEntry = await adapter.enterChat();
    if (chatEntry?.handoff) {
      await send('WORKFLOW', {
        patch: {
          statusText: '正在切换到目标 HR 沟通页，页面加载后将自动继续',
          activeRunId: runId
        }
      });
      return true;
    }
    await send('WORKFLOW', { patch: { chatRecovery: null } });

    currentStage = 'verify_chat_target';
    currentStageLabel = '等待目标 HR 会话就绪';
    await updateTaskProgress({ runId, pendingId: id, job: item.job, task: item.task, stage: currentStage, progress: 82, stageLabel: currentStageLabel, status: 'running', retryable: true, setActive: true });
    await send('WORKFLOW', { patch: { statusText: '正在等待并核对目标 HR 会话，未确认前绝不发送或返回主页', activeRunId: runId } });
    const readyConversation = await adapter.ensureExpectedConversation(expected || {}, 30000);
    let currentConversation = {
      ...readyConversation.context,
      key: adapter.deriveConversationKey(readyConversation.context || {}, expected || {}, id)
    };
    const previousBinding = contentRuntime.chatBinding;
    const validation = adapter.validateChatContext(expected || {}, currentConversation, previousBinding);
    if (!validation.ok) throw new Error(`${validation.reason}；目标：${item.job?.company || ''} ${item.job?.title || ''}，当前：${currentConversation.headerText || currentConversation.selectedText || currentConversation.url}`);
    const ledger = await send('CHAT_BINDING_CHECK', {
      pendingId: id,
      runId,
      job: item.job,
      expected,
      context: currentConversation
    });
    if (!ledger?.ok || ledger.allowed === false) {
      throw new Error(ledger?.error || `该 HR 会话已被其他岗位任务占用，已禁止重复发送${ledger?.existing?.jobTitle ? `（${ledger.existing.jobTitle}）` : ''}`);
    }
    currentConversation = {
      ...currentConversation,
      key: String(ledger?.reservation?.conversationKey || ledger?.conversationKey || currentConversation.key || '')
    };
    if (!currentConversation.key) throw new Error('当前 HR 会话已确认，但无法建立安全投递锁');
    confirmedConversation = currentConversation;
    contentRuntime.chatBinding = {
      pendingId: id,
      jobUrl: item.job?.url || '',
      key: currentConversation.key,
      expected,
      context: currentConversation,
      boundAt: Date.now()
    };
    await send('CHAT_BINDING_CONFIRMED', { pendingId: id, runId, job: item.job, expected, context: currentConversation });
    await send('EVENT', {
      level: 'info',
      message: '已确认当前 HR 与目标岗位一致',
      data: { id, runId, job: item.job, recruiter: currentConversation.recruiterName || '', conversationKey: currentConversation.key }
    });

    // 不再仅凭 DOM 中出现相似文字就把任务判定为已发送。
    // 只有本轮真实执行发送并确认新的右侧消息气泡后，才允许计数和返回主页。
    adapter.assertConversationKey(currentConversation.key, id);

    currentStage = 'fill_message';
    currentStageLabel = '填写求职招呼语';
    await updateTaskProgress({ runId, pendingId: id, job: item.job, task: item.task, stage: currentStage, progress: 86, stageLabel: currentStageLabel, status: 'running', retryable: true, setActive: true });
    await send('WORKFLOW', { patch: { statusText: `正在向目标 HR 填写招呼语：${item.job?.title || '岗位'}`, activeRunId: runId } });

    currentStage = 'send_message';
    currentStageLabel = '发送求职招呼语';
    await updateTaskProgress({ runId, pendingId: id, job: item.job, task: item.task, stage: currentStage, progress: 92, stageLabel: currentStageLabel, status: 'running', retryable: true, setActive: true });
    await waitForRateLimit('delivery', '投递');
    const pacing = state.config || {};
    const greetingResult = await adapter.sendGreeting(greeting, {
      chatReadyDelayMs: 5000,
      beforeSendDelayMs: 2500,
      confirmTimeoutMs: 45000,
      expectedConversationKey: currentConversation.key,
      pendingId: id
    });
    messageSentConfirmed = true;
    currentStage = 'verify_message';
    currentStageLabel = '招呼语已确认发送';
    await updateTaskProgress({ runId, pendingId: id, job: item.job, task: item.task, stage: currentStage, progress: 94, stageLabel: currentStageLabel, status: 'running', retryable: false, setActive: true });
    await send('EVENT', {
      level: 'success',
      message: '求职招呼语已确认发送',
      data: { id, runId, job: item.job, conversationKey: currentConversation.key, method: greetingResult?.method || (greetingResult?.alreadySent ? 'already-sent' : '') }
    });
    // 让文字气泡和服务端会话状态稳定后再处理附件，避免只建立沟通关系却没有文字。
    await sleep(4000);

    const material = await send('MATERIAL');
    if (material.ok && material.config?.sendResumeImage && material.resumeImage) {
      currentStage = 'send_resume';
      currentStageLabel = '发送简历图片';
      await updateTaskProgress({ runId, pendingId: id, job: item.job, task: item.task, stage: currentStage, progress: 98, stageLabel: currentStageLabel, status: 'running', retryable: false, setActive: true });
      adapter.assertConversationKey(currentConversation.key, id);
      await waitForRateLimit('attachment', '附件发送');
      const imageResult = await adapter.uploadResumeImage(material.resumeImage, {
        delayMs: Math.max(1000, Math.min(10000, Number(pacing.attachmentDelaySeconds || 4) * 1000)),
        expectedConversationKey: currentConversation.key,
        pendingId: id
      });
      if (!imageResult.ok) {
        await send('EVENT', { level: 'warning', message: '文字已发送，但简历图片未确认发送', data: { id, runId, job: item.job, error: imageResult.error || '' } });
      } else {
        await send('EVENT', { level: 'success', message: '简历图片已确认发送', data: { id, runId, job: item.job } });
      }
    }
    if (material.ok && material.config?.sendOnlineResume) {
      currentStage = 'send_resume';
      currentStageLabel = '发送在线简历';
      await updateTaskProgress({ runId, pendingId: id, job: item.job, task: item.task, stage: currentStage, progress: 98, stageLabel: currentStageLabel, status: 'running', retryable: true, setActive: true });
      adapter.assertConversationKey(currentConversation.key, id);
      await adapter.sendOnlineResume();
    }

    currentStage = 'verify_result';
    currentStageLabel = '确认投递结果';
    await updateTaskProgress({ runId, pendingId: id, job: item.job, task: item.task, stage: currentStage, progress: 98, stageLabel: currentStageLabel, status: 'running', retryable: true, setActive: true });
    adapter.assertConversationKey(currentConversation.key, id);
    // 最后再观察当前会话，确保文字气泡没有因页面重绘而消失。
    const finalTextConfirmed = await adapter.waitForStableOutgoingGreeting(greeting, new Set(), 7000, currentConversation.key, id);
    if (!finalTextConfirmed && !adapter.greetingVisibleInChat(greeting)) {
      throw new Error('返回主页前未能再次确认当前聊天中的文字消息，已暂停');
    }
    await sleep(3000);
    const completion = await send('APPLY_COMPLETE', { id, ok: true, result: 'strict-text-bubble-confirmed', conversation: currentConversation });
    contentRuntime.chatBinding = null;
    // 每次投递完成都从聊天页返回左上角“首页”对应的岗位主页。
    // 下一轮只能从主页重新进入目标岗位，避免沿用上一个 HR 会话。
    if (!completion?.targetReached) {
      await send('WORKFLOW', { patch: { statusText: '投递完成，正在返回 BOSS 主页继续搜索' } });
      await adapter.returnToJobsHome();
    }
  } catch (error) {
    const errorText = String(error?.message || '投递失败');
    const identityFailure = /聊天窗口|聊天对象|目标岗位|目标HR|HR会话|会话标识|公司或岗位|其他岗位任务占用/.test(errorText);
    const chatEntryFailure = currentStage === 'open_chat'
      && (error?.recoverable === true || /消息输入区|立即沟通入口|沟通页已打开|聊天编辑器|未能进入沟通页面/.test(errorText));
    const workflowRecovery = state.workflow?.chatRecovery?.pendingId === id ? state.workflow.chatRecovery : null;
    const recoveryAttempts = Math.max(0, Number(workflowRecovery?.attempts || 0));

    if (chatEntryFailure && recoveryAttempts < 1 && item.job?.url) {
      const nextRecovery = {
        pendingId: id,
        attempts: recoveryAttempts + 1,
        lastError: errorText,
        lastStage: currentStage,
        attemptedAt: Date.now(),
        jobUrl: item.job.url
      };
      await send('WORKFLOW', {
        patch: {
          chatRecovery: nextRecovery,
          statusText: `沟通窗口未就绪，正在重新打开岗位后自动重试（${nextRecovery.attempts}/1）`,
          activeRunId: runId
        }
      });
      await send('EVENT', {
        level: 'warning',
        message: '沟通窗口未加载，正在自动恢复当前岗位',
        data: { id, runId, job: item.job, error: errorText, recovery: nextRecovery, diagnostics: error?.details || null }
      });
      contentRuntime.chatBinding = null;
      if (adapter.currentJobMatches(item.job) && typeof location.reload === 'function') location.reload();
      else if (typeof location.assign === 'function') location.assign(item.job.url);
      else location.href = item.job.url;
      return true;
    }

    const failedEditor = adapter.resolveEditableChatInput(adapter.chatInput());
    const failedDraftText = normalize(adapter.chatInputValue(failedEditor));
    const expectedDraftText = normalize(greeting);
    const draftPresent = Boolean(expectedDraftText && failedDraftText
      && (failedDraftText === expectedDraftText
        || (failedDraftText.includes(expectedDraftText) && failedDraftText.length <= expectedDraftText.length + 8)));
    const sendUncertain = !messageSentConfirmed && ['write_greeting', 'send_greeting', 'verify_text', 'verify_result'].includes(currentStage);
    const hardSafetyFailure = /安全验证|验证码|登录|账号异常|身份不一致|其他HR|其他 HR/.test(errorText);
    const pauseQueue = identityFailure || draftPresent || sendUncertain || hardSafetyFailure;
    const completion = await send('APPLY_COMPLETE', {
      id,
      ok: false,
      error: errorText,
      stage: currentStage,
      stageLabel: identityFailure
        ? 'HR/岗位核对失败，已禁止发送'
        : (draftPresent ? '发送未确认，草稿保留' : (!messageSentConfirmed ? '文字未写入或未发送' : currentStageLabel)),
      retryable: !/安全验证|登录|岗位已关闭|沟通额度|账号异常/i.test(errorText),
      pauseQueue,
      failureClass: chatEntryFailure ? 'chat_entry' : (sendUncertain ? 'send_uncertain' : 'delivery'),
      cooldownMinutes: chatEntryFailure ? 360 : 90,
      diagnostics: error?.details || null,
      preserveDraft: draftPresent,
      draftPresent,
      editorDiagnostics: adapter.chatEditorDiagnostics(failedEditor),
      conversation: confirmedConversation
    });
    contentRuntime.chatBinding = null;
    if (!pauseQueue) {
      await send('WORKFLOW', {
        patch: {
          chatRecovery: null,
          statusText: chatEntryFailure
            ? '当前岗位沟通窗口未加载，已冷却该岗位并继续后续队列'
            : '当前岗位失败，已跳过并继续后续队列'
        }
      });
      await adapter.returnToJobsHome();
      return true;
    }
    if (messageSentConfirmed && !draftPresent && !completion?.pausedForDraft) {
      await send('WORKFLOW', { patch: { chatRecovery: null, statusText: '文字已确认发送，但后续步骤失败，正在返回主页' } });
      await adapter.returnToJobsHome();
    } else {
      await send('WORKFLOW', { patch: {
        running: false,
        paused: true,
        phase: 'apply',
        chatRecovery: null,
        statusText: draftPresent
          ? '文字尚未确认发送：草稿仍在当前输入框，未返回主页'
          : '发送结果无法确认：已停留在当前页面等待人工检查'
      } });
    }

  }
  return true;
}

async function processSearch(state) {
  const workflow = state.workflow || {};
  const config = state.config || {};
  const tasks = workflow.tasks || [];
  if (!tasks.length) {
    await send('WORKFLOW', { patch: { running: false, paused: true, phase: 'idle', statusText: '没有可执行的搜索任务' } });
    return;
  }
  const taskIndex = Math.min(workflow.taskIndex || 0, tasks.length - 1);
  const task = tasks[taskIndex];
  let processedCount = Number(task.processed || 0);
  let discoveredCount = Number(task.discovered || 0);
  let analyzedCount = Number(task.analyzed || 0);
  let acceptedCount = Number(task.accepted || 0);
  let duplicateCount = Number(task.duplicates || 0);
  let lowQualityCount = Number(task.lowQuality || 0);
  let filterFailureCount = Number(task.filterFailures || 0);
  let failedCount = Number(task.failed || 0);
  let duplicateStreak = 0;
  let noNewStreak = 0;
  let stagnationTriggered = false;

  await updateSearchProgress(task, taskIndex, {
    status: 'running', progress: 6, stageLabel: '打开岗位列表',
    processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
  });
  if (!(await adapter.ensureJobsPage())) return;
  await updateSearchProgress(task, taskIndex, {
    status: 'running', progress: 12, stageLabel: '应用搜索条件',
    processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
  });
  const filterResult = await adapter.applySearchTask(task, workflow);
  if (filterResult?.navigating) return;
  if (hasVerification()) return pauseForVerification();
  if (!filterResult?.ok) {
    const failures = Array.isArray(filterResult?.failures) ? filterResult.failures : [];
    filterFailureCount += failures.length || 1;
    await send('STATS', { delta: { filterFailures: failures.length || 1 } });
    await send('EVENT', {
      level: 'warning',
      message: `部分搜索筛选未成功：${failures.map(item => `${item.label} ${item.value}`).join('，') || '未知筛选'}`,
      data: { task, failures }
    });
    const cityFailure = failures.find(item => item.label === '地区');
    if (cityFailure) {
      await updateSearchProgress(task, taskIndex, {
        status: 'completed', progress: 100, stageLabel: `地区筛选失败 已切换下一个任务`,
        processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount,
        accepted: acceptedCount, duplicates: duplicateCount, lowQuality: lowQualityCount,
        filterFailures: filterFailureCount, failed: failedCount
      });
      const nextTaskIndex = taskIndex + 1;
      await send('WORKFLOW', {
        patch: nextTaskIndex >= tasks.length
          ? { running: false, paused: true, phase: 'idle', statusText: '搜索任务已完成', taskIndex: nextTaskIndex, cardIndex: 0 }
          : { taskIndex: nextTaskIndex, cardIndex: 0, statusText: `地区筛选失败 切换任务 ${nextTaskIndex + 1}/${tasks.length}` }
      });
      return;
    }
  }
  await updateSearchProgress(task, taskIndex, {
    status: 'running', progress: Math.max(20, Number(task.progress || 0)), stageLabel: '持续扫描岗位',
    processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
  });
  await send('WORKFLOW', {
    patch: {
      phase: 'search',
      statusText: `正在扫描：${task.keyword || '岗位'}`
    }
  });

  const cards = adapter.cards();
  if (!cards.length) {
    await updateSearchProgress(task, taskIndex, {
      status: 'completed', progress: 100, stageLabel: '当前搜索任务已完成',
      processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
    });
    const nextTaskIndex = taskIndex + 1;
    if (nextTaskIndex >= tasks.length) {
      await send('WORKFLOW', { patch: { running: false, paused: true, phase: 'idle', statusText: '岗位采集完成' } });
    } else {
      await send('WORKFLOW', { patch: { taskIndex: nextTaskIndex, cardIndex: 0, statusText: `切换搜索任务 ${nextTaskIndex + 1}/${tasks.length}` } });
    }
    return;
  }

  const processed = new Set(workflow.processedKeys || []);
  let index = Math.max(0, workflow.cardIndex || 0);
  let loadMoreAttempts = 0;
  while (true) {
    if (hasVerification()) return pauseForVerification();
    const latest = await send('CONTENT_STATE');
    if (!latest.ok || latest.state.workflow?.paused || !latest.state.workflow?.running) return;
    const activeConfig = latest.state.config || config;
    if (Number(latest.state.stats?.sent || 0) >= Number(activeConfig.dailyTarget || 30)) {
      await updateSearchProgress(task, taskIndex, {
        status: 'completed', progress: 100, stageLabel: '已达到今日成功投递目标',
        processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
      });
      await send('WORKFLOW', { patch: { running: false, paused: true, phase: 'idle', activeRunId: null, statusText: `已完成今日 ${latest.state.stats?.sent || 0} 次成功投递` } });
      return;
    }
    if (Number(activeConfig.discoveryLimit || 100) > 0 && Number(latest.state.stats?.discovered || 0) >= Number(activeConfig.discoveryLimit || 100)) {
      await updateSearchProgress(task, taskIndex, {
        status: 'completed', progress: 100, stageLabel: '已达到今日岗位采集上限',
        processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
      });
      await send('WORKFLOW', { patch: { running: false, paused: true, phase: 'idle', activeRunId: null, statusText: `已达到今日采集上限 ${activeConfig.discoveryLimit || 100}` } });
      return;
    }
    if (processedCount >= Math.max(1, Number(task.maxJobs || activeConfig.maxJobsPerTask || 20))) {
      break;
    }

    // BOSS 使用虚拟列表，点击或滚动后节点可能被替换；每轮重新获取卡片，避免持有失效 DOM。
    const currentCards = adapter.cards();
    if (index >= currentCards.length) {
      const visibleKeys = currentCards.map(card => adapter.cardKey(card)).filter(Boolean);
      const hasUnprocessedVisible = visibleKeys.some(key => !processed.has(key));
      if (hasUnprocessedVisible) {
        index = 0;
        continue;
      }
      if (loadMoreAttempts >= 3) break;
      const loaded = await adapter.loadMoreCards(visibleKeys);
      loadMoreAttempts += 1;
      index = 0;
      if (loaded?.unseen > 0) {
        loadMoreAttempts = 0;
        await send('WORKFLOW', { patch: { cardIndex: 0, statusText: `正在继续加载更多岗位 · 第 ${processedCount + 1} 个` } });
      } else {
        await sleep(500 + loadMoreAttempts * 350);
      }
      continue;
    }
    const card = currentCards[index];
    const key = adapter.cardKey(card);
    index += 1;
    if (!key || processed.has(key)) continue;

    const identity = adapter.cardIdentity(card);
    const previewJob = { title: identity.title || '岗位', company: identity.company || '', url: identity.href || '', cardText: identity.raw || '' };
    let counted = false;
    let run = await updateTaskProgress({
      job: previewJob,
      task,
      stage: 'collect_detail',
      progress: 24,
      stageLabel: '读取岗位详情',
      status: 'running',
      retryable: false,
      setActive: true
    });
    let runId = run?.id || '';

    try {
      await waitForRateLimit('discovery', '岗位读取');
      const detail = await adapter.openCard(card);
      processedCount += 1;
      counted = true;
      if (!detail) {
        processed.add(key);
        failedCount += 1;
        await updateTaskProgress({
          runId, job: previewJob, task, stage: 'failed', progress: 100,
          stageLabel: '岗位详情未加载', status: 'failed', error: '岗位详情暂未加载', retryable: false
        });
        await send('EVENT', {
          level: 'warning',
          message: '岗位详情暂未加载，已跳过当前岗位继续采集',
          data: { key, card: identity, task, runId }
        });
        await send('WORKFLOW', {
          patch: {
            cardIndex: index,
            processedKeys: [...processed],
            currentJob: null,
            activeRunId: null,
            statusText: '当前岗位详情未就绪，已自动继续下一个'
          }
        });
        await updateSearchProgress(task, taskIndex, {
          status: 'running', progress: Math.min(88, 22 + processedCount * 2), stageLabel: `持续扫描 · 已处理 ${processedCount} 个`,
          processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
        });
        await sleep(420);
        continue;
      }

      let job = adapter.extractJob(card);
      const externalApplication = adapter.externalApplicationInfo();
      discoveredCount += 1;
      processed.add(key);
      if (externalApplication) {
        await send('STATS', { delta: { discovered: 1 } });
        await updateTaskProgress({
          runId, job: { ...job, applicationMode: 'external_application' }, task,
          stage: 'skipped', progress: 100,
          stageLabel: '外部网申岗位已跳过', status: 'skipped',
          error: externalApplication.reason, retryable: false, setActive: false
        });
        await send('EVENT', {
          level: 'info',
          message: `外部网申岗位已跳过：${job.title}`,
          data: { job, application: externalApplication, runId }
        });
        await send('WORKFLOW', {
          patch: {
            cardIndex: index,
            processedKeys: [...processed],
            currentJob: null,
            activeRunId: null,
            statusText: `已跳过外部网申岗位：${job.title}`
          }
        });
        await updateSearchProgress(task, taskIndex, {
          status: 'running', progress: Math.min(88, 22 + processedCount * 2),
          stageLabel: `持续扫描 · 已处理 ${processedCount} 个`,
          processed: processedCount, discovered: discoveredCount,
          analyzed: analyzedCount, failed: failedCount
        });
        await sleep(500);
        continue;
      }
      const preflight = await send('JOB_PREFLIGHT', { job });
      if (!preflight?.ok) throw new Error(preflight?.error || '岗位安全预检失败');
      job = {
        ...job,
        companyVerification: preflight.company || null,
        quality: preflight.quality || null,
        jobFingerprint: preflight.duplicate?.fingerprint || ''
      };
      if (preflight.blocked) {
        await send('STATS', { delta: { discovered: 1 } });
        noNewStreak += 1;
        if (preflight.category === 'duplicate') {
          duplicateCount += 1;
          duplicateStreak += 1;
        } else {
          duplicateStreak = 0;
        }
        if (preflight.category === 'low-quality') lowQualityCount += 1;
        const skipLabel = preflight.category === 'duplicate'
          ? '重复岗位已跳过'
          : preflight.category === 'low-quality'
            ? '明显低质岗位已跳过'
            : '企业风险预检未通过';
        await updateTaskProgress({
          runId, job, task, stage: 'skipped', progress: 100,
          stageLabel: skipLabel,
          status: 'skipped', error: preflight.reason || '安全预检未通过', retryable: false, setActive: false
        });
        await send('EVENT', { level: preflight.category === 'duplicate' ? 'info' : 'warning', message: `${skipLabel}：${job.title}`, data: { job, preflight, runId } });
        await send('WORKFLOW', {
          patch: {
            cardIndex: index,
            processedKeys: [...processed],
            currentJob: null,
            activeRunId: null,
            statusText: `${skipLabel}：${job.title}`
          }
        });
        await updateSearchProgress(task, taskIndex, {
          status: 'running', progress: Math.min(88, 22 + processedCount * 2), stageLabel: `持续扫描 · 已处理 ${processedCount} 个`,
          processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount,
          accepted: acceptedCount, duplicates: duplicateCount, lowQuality: lowQualityCount,
          filterFailures: filterFailureCount, failed: failedCount
        });
        const stagnationLimit = Math.max(3, Number(activeConfig.stagnationLimit || 8));
        if (duplicateStreak >= stagnationLimit || noNewStreak >= stagnationLimit + 3) {
          stagnationTriggered = true;
          await send('STATS', { delta: { stagnantTasks: 1 } });
          await send('EVENT', {
            level: 'info',
            message: `当前搜索结果重复或低质岗位过多 已自动切换下一个地区或关键词`,
            data: { task, duplicateStreak, noNewStreak }
          });
          break;
        }
        continue;
      }
      acceptedCount += 1;
      duplicateStreak = 0;
      noNewStreak = 0;
      run = await updateTaskProgress({
        runId, job, task, stage: 'discovered', progress: 30,
        stageLabel: '岗位详情已读取', status: 'running', retryable: false, setActive: true
      });
      runId = run?.id || runId;
      await send('STATS', { delta: { discovered: 1 } });
      await send('WORKFLOW', {
        patch: {
          cardIndex: index,
          processedKeys: [...processed],
          currentJob: job,
          activeRunId: runId,
          statusText: `AI 分析：${job.title}`
        }
      });
      await updateTaskProgress({
        runId, job, task, stage: 'ai_analyze', progress: 42,
        stageLabel: 'AI 匹配分析', status: 'running', retryable: false, setActive: true
      });
      await waitForRateLimit('ai', 'AI分析');
      const ai = await send('AI_JOB', { job });
      analyzedCount += 1;
      await send('STATS', { delta: { analyzed: 1 } });
      if (!ai.ok) {
        failedCount += 1;
        await updateTaskProgress({
          runId, job, task, stage: 'failed', progress: 100,
          stageLabel: 'AI 分析失败', status: 'failed', error: ai.error || 'AI 分析失败', retryable: false
        });
        await send('EVENT', { level: 'error', message: '岗位 AI 分析失败，已继续下一个岗位', data: { job, error: ai.error, runId } });
        await updateSearchProgress(task, taskIndex, {
          status: 'running', progress: Math.min(88, 22 + processedCount * 2), stageLabel: `持续扫描 · 已处理 ${processedCount} 个`,
          processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
        });
        continue;
      }
      await updateTaskProgress({
        runId, job, task, stage: 'ai_complete', progress: 56,
        stageLabel: `AI 分析完成 · ${ai.result.score || 0} 分`, status: 'running', analysis: ai.result, retryable: false
      });
      await send('EVENT', {
        level: ai.result.decision === 'recommend' ? 'success' : 'info',
        message: `岗位分析完成：${job.title}`,
        data: { job, analysis: ai.result, runId }
      });
      const strategyResponse = await send('EVALUATE_STRATEGY', {
        score: ai.result.score,
        riskLevel: job.companyVerification?.riskLevel || 'unknown',
        verified: Boolean(job.companyVerification?.verified),
        decision: ai.result.decision,
        hardBlocks: ai.result.hardBlocks || []
      });
      const strategy = strategyResponse?.result || { accepted: ai.result.score >= Number(activeConfig.minScore || 75), reason: '兼容模式' };
      if (strategy.accepted) {
        const queued = await send('PENDING', { item: { job, analysis: { ...ai.result, strategy }, task, runId } });
        if (queued.ok && activeConfig.executionMode === 'auto' && !activeConfig.dryRun) {
          await send('EVENT', {
            level: 'success',
            message: `已进入自动排序队列：${job.title}`,
            data: {
              job,
              score: ai.result.score,
              priorityScore: queued.item?.priorityScore || 0,
              priorityRank: queued.item?.priorityRank || 0,
              runId
            }
          });
          // 先积累一小批合格岗位，再按 AI 匹配、硬条件、薪资和新鲜度排序。
          // 避免采到第一个岗位就立刻投递，导致后续更优岗位永远排在后面。
          const latestQueue = await send('CONTENT_STATE');
          const queueDepth = (latestQueue.state?.pending || []).filter(entry => entry.status === 'approved_queue').length;
          if (queueDepth >= Math.max(1, Number(activeConfig.queueWarmup || (normalizeStrategy(activeConfig.batchStrategy) === 'full-mass' ? 3 : 4)))) {
            const dispatched = await send('AUTO_DISPATCH_NEXT');
            if (dispatched?.started) {
              await updateSearchProgress(task, taskIndex, {
                status: 'running', progress: Math.min(88, 22 + processedCount * 2),
                stageLabel: `已自动排序，优先投递最高分岗位`,
                processed: processedCount, discovered: discoveredCount,
                analyzed: analyzedCount, failed: failedCount
              });
              return;
            }
          }
        }
      } else {
        await updateTaskProgress({
          runId, job, task, stage: 'skipped', progress: 100,
          stageLabel: strategy.reason || (ai.result.decision === 'reject' ? '存在明确硬性冲突' : '未达到投递策略阈值'),
          status: 'skipped', analysis: { ...ai.result, strategy }, retryable: false
        });
      }
      await updateSearchProgress(task, taskIndex, {
        status: 'running', progress: Math.min(88, 22 + processedCount * 2), stageLabel: `持续扫描 · 已处理 ${processedCount} 个`,
        processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
      });
      await sleep(600);
    } catch (error) {
      processed.add(key);
      if (!counted) processedCount += 1;
      failedCount += 1;
      await updateTaskProgress({
        runId, job: previewJob, task, stage: 'failed', progress: 100,
        stageLabel: '岗位处理异常', status: 'failed', error: error.message, retryable: false
      });
      await send('EVENT', {
        level: 'warning',
        message: '当前岗位处理异常，已跳过并继续采集',
        data: { key, error: error.message, task, runId }
      });
      await send('WORKFLOW', {
        patch: {
          cardIndex: index,
          processedKeys: [...processed],
          currentJob: null,
          activeRunId: null,
          statusText: '单个岗位处理异常，已自动继续'
        }
      });
      await updateSearchProgress(task, taskIndex, {
        status: 'running', progress: Math.min(88, 22 + processedCount * 2), stageLabel: `持续扫描 · 已处理 ${processedCount} 个`,
        processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount, failed: failedCount
      });
      await sleep(420);
    }
  }

  const endState = await send('CONTENT_STATE');
  if (!stagnationTriggered && endState?.state?.config?.executionMode === 'auto' && !endState?.state?.config?.dryRun) {
    const dispatched = await send('AUTO_DISPATCH_NEXT');
    if (dispatched?.started) {
      await updateSearchProgress(task, taskIndex, {
        status: 'running', progress: 92, stageLabel: '本轮岗位已自动排序，正在优先投递',
        processed: processedCount, discovered: discoveredCount,
        analyzed: analyzedCount, failed: failedCount
      });
      return;
    }
  }

  await updateSearchProgress(task, taskIndex, {
    status: 'completed', progress: 100,
    stageLabel: stagnationTriggered ? '重复或低质岗位过多 已提前切换' : '当前搜索任务已完成',
    processed: processedCount, discovered: discoveredCount, analyzed: analyzedCount,
    accepted: acceptedCount, duplicates: duplicateCount, lowQuality: lowQualityCount,
    filterFailures: filterFailureCount, failed: failedCount
  });
  const nextTaskIndex = taskIndex + 1;
  await send('WORKFLOW', {
    patch: nextTaskIndex >= tasks.length
      ? { running: false, paused: true, phase: 'idle', activeRunId: null, statusText: '岗位采集完成', cardIndex: 0 }
      : { taskIndex: nextTaskIndex, cardIndex: 0, activeRunId: null, statusText: `切换搜索任务 ${nextTaskIndex + 1}/${tasks.length}` }
  });
}

async function run() {
  if (!runtimeIsActive() || extensionContextInvalidated) return;
  if (running) return;
  running = true;
  try {
    const response = await send('CONTENT_STATE');
    if (!response?.ok || response.contextInvalidated) return;
    const state = response.state;
    if (!state.workflow?.running || state.workflow?.paused) return;
    if (hasVerification()) return pauseForVerification();
    if (state.workflow?.pendingApplyId) {
      await processApproved(state);
      return;
    }
    await processSearch(state);
  } catch (error) {
    if (extensionContextInvalidated || isExtensionContextError(error)) return;
    await send('EVENT', { level: 'warning', message: '页面暂时未就绪，将自动重试', data: { error: error.message, url: location.href } });
    if (!extensionContextInvalidated) {
      await send('WORKFLOW', { patch: { statusText: '页面暂时未就绪，等待自动重试', retries: Date.now() } });
    }
  } finally {
    running = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!runtimeIsActive()) {
    if (message?.type === 'PROBE') reply({ ok: false, staleRuntime: true, contentVersion: JOBCLAW_CONTENT_VERSION, contentBuild: JOBCLAW_CONTENT_BUILD, contentFile: JOBCLAW_CONTENT_FILE });
    return;
  }
  if (message?.type === 'RUN') {
    run();
    reply({ ok: true, contentVersion: JOBCLAW_CONTENT_VERSION, contentBuild: JOBCLAW_CONTENT_BUILD, contentFile: JOBCLAW_CONTENT_FILE });
    return;
  }
  if (message?.type === 'PROBE') {
    reply({
      ok: true,
      contentVersion: JOBCLAW_CONTENT_VERSION,
      contentBuild: JOBCLAW_CONTENT_BUILD,
      contentFile: JOBCLAW_CONTENT_FILE,
      pageType: adapter.pageType(),
      url: location.href,
      cards: adapter.cards().length,
      hasSearch: Boolean(adapter.searchInput()),
      hasDetail: Boolean(adapter.detailRoot()),
      hasChat: Boolean(adapter.chatInput()),
      verification: hasVerification()
    });
  }
});

setTimeout(run, 900);

})();
