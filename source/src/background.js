import { DEFAULTS, safeClone, today, uniq } from './common.js';
import { normalizeConversationIdentity, deriveConversationReservationKey, sameRecruiterReservation } from './lib/conversation-identity.js';
import { TERMINAL_RUN_STATUSES, taskStageMeta } from './lib/task-state.js';
import { rerankPending } from './lib/job-priority.js';
import { computeRateLimitDecision, evaluateStrategy, normalizeStrategy, recordRateAction, recordSafetyOutcome, resetSafetyCircuit, strictHardBlocks } from './lib/safety-control.js';
import { companyCacheKey, companyVerificationExpired, heuristicCompanyVerification, mergeCompanyVerification } from './lib/company-verifier.js';
import { createHistoryEntry, findDuplicate } from './lib/deduplication.js';
import { createSeenJobEntry, evaluateJobQuality, findSeenDuplicate } from './lib/job-quality.js';
import { BOSS_FILTER_OPTIONS, normalizeBossFilter, normalizeCityList, normalizeSearchConfig, roundRobinSearchTasks } from './lib/search-filters.js';
import { normalizeRelease } from './lib/update-checker.js';
import { buildBossSearchUrl, collectBossCityEntries, mergeBossCityMaps, normalizeBossCityName, resolveBossCityCode } from './lib/city-routing.js';
import { chooseAiRoute, normalizeAiProviderMode, publicAiStatus } from './lib/ai-routing.js';

const BRIDGE_ENDPOINTS = ['http://127.0.0.1:17899', 'http://localhost:17899'];
const BOSS_JOBS_HOME_URL = 'https://www.zhipin.com/web/geek/job';
const NATIVE_BRIDGE_HOST = 'com.jobclaw.bridge';
let lastBridgeSnapshotAt = 0;
let bridgeUnavailableUntil = 0;
let bridgeLastError = '';
const EXPECTED_CONTENT_VERSION = '2.1.0';
const EXPECTED_CONTENT_BUILD = '2.1.0-ai-pause.2';
const CONTENT_SCRIPT_FILE = 'content-v37.js';
const STARTUP_TOTAL_TIMEOUT_MS = 15000;
const STARTUP_STALE_AFTER_MS = 30000;
const BOSS_PROBE_TIMEOUT_MS = 2200;
const BOSS_COMMAND_TIMEOUT_MS = 4200;
const BOSS_TAB_READY_TIMEOUT_MS = 6500;
const BOSS_CITY_DIRECTORY_ENDPOINTS = [
  'https://www.zhipin.com/wapi/zpgeek/common/data/citysites.json',
  'https://www.zhipin.com/wapi/zpCommon/data/city.json'
];
const BOSS_CITY_DIRECTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let bossCityDirectoryMemory = null;
const activeAiControllers = new Set();

function abortActiveAiRequests(reason = 'cancelled') {
  for (const controller of [...activeAiControllers]) {
    try { controller.abort(reason); } catch {}
  }
  activeAiControllers.clear();
}


async function loadBossCityDirectory({ force = false } = {}) {
  if (!force && bossCityDirectoryMemory?.map instanceof Map && bossCityDirectoryMemory.map.size) return bossCityDirectoryMemory;
  const { bossCityDirectory = {} } = await storage.get('bossCityDirectory').catch(() => ({ bossCityDirectory: {} }));
  const cachedAt = Number(bossCityDirectory.updatedAt || 0);
  const cachedMap = mergeBossCityMaps(bossCityDirectory.entries || {});
  if (!force && cachedAt > 0 && Date.now() - cachedAt < BOSS_CITY_DIRECTORY_TTL_MS && cachedMap.size) {
    bossCityDirectoryMemory = { map: cachedMap, source: bossCityDirectory.source || 'cache', updatedAt: cachedAt };
    return bossCityDirectoryMemory;
  }

  const fetchedMaps = [];
  const sources = [];
  for (const endpoint of BOSS_CITY_DIRECTORY_ENDPOINTS) {
    try {
      const response = await withTimeout(fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json,text/plain,*/*' }
      }), 3500, '读取BOSS城市目录');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await withTimeout(response.json(), 1800, '解析BOSS城市目录');
      const entries = collectBossCityEntries(payload);
      if (entries.size) {
        fetchedMaps.push(entries);
        sources.push(endpoint);
      }
    } catch (error) {
      await writeEvent('warning', 'BOSS城市目录接口暂不可用，使用本地城市编码继续', {
        endpoint,
        error: String(error?.message || error || '')
      }).catch(() => {});
    }
  }

  const map = mergeBossCityMaps(cachedMap, ...fetchedMaps);
  const updatedAt = Date.now();
  const entries = Object.fromEntries(map);
  await storage.set({ bossCityDirectory: { entries, updatedAt, source: sources.length ? 'boss-api' : 'fallback' } }).catch(() => {});
  bossCityDirectoryMemory = { map, source: sources.length ? 'boss-api' : 'fallback', updatedAt };
  return bossCityDirectoryMemory;
}

async function buildBossSearchRoute({ city = '', keyword = '', currentUrl = '', alternate = false } = {}) {
  const normalizedCity = normalizeBossCityName(city);
  const directory = await loadBossCityDirectory();
  const cityCode = resolveBossCityCode(normalizedCity, directory.map);
  if (normalizedCity && !cityCode) {
    return { ok: false, city: normalizedCity, keyword: String(keyword || '').trim(), error: `未找到${normalizedCity}的BOSS城市编码` };
  }
  let currentPath = '';
  try { currentPath = new URL(String(currentUrl || '')).pathname; } catch {}
  const preferPlural = alternate ? !/\/web\/geek\/jobs$/.test(currentPath) : /\/web\/geek\/jobs$/.test(currentPath);
  const path = preferPlural ? '/web/geek/jobs' : '/web/geek/job';
  const url = buildBossSearchUrl({
    cityCode,
    query: keyword,
    baseUrl: `https://www.zhipin.com${path}`
  });
  const alternateUrl = buildBossSearchUrl({
    cityCode,
    query: keyword,
    baseUrl: `https://www.zhipin.com${path.endsWith('/jobs') ? '/web/geek/job' : '/web/geek/jobs'}`
  });
  return {
    ok: true,
    city: normalizedCity,
    cityCode,
    keyword: String(keyword || '').trim(),
    url,
    alternateUrl,
    source: directory.source
  };
}

function timeoutError(label, timeoutMs) {
  const error = new Error(`${label}超时（${Math.ceil(timeoutMs / 1000)}秒）`);
  error.code = 'JOBCLAW_TIMEOUT';
  error.timeoutMs = timeoutMs;
  return error;
}

async function withTimeout(value, timeoutMs, label = '操作') {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const storage = {
  get: keys => chrome.storage.local.get(keys),
  all: () => chrome.storage.local.get(null),
  set: patch => chrome.storage.local.set(patch)
};

const debuggerLocks = new Map();

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let offscreenCreation = null;

async function ensureClipboardOffscreen() {
  if (!chrome.offscreen?.createDocument) return false;
  const url = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [url]
    }).catch(() => []);
    if (contexts?.length) return true;
  }
  if (!offscreenCreation) {
    offscreenCreation = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['CLIPBOARD'],
      justification: '将求职招呼语以真实粘贴方式写入 BOSS 聊天编辑器'
    }).then(() => true).catch(error => {
      const message = String(error?.message || error || '');
      if (/single offscreen|already exists|existing offscreen/i.test(message)) return true;
      throw error;
    }).finally(() => { offscreenCreation = null; });
  }
  return offscreenCreation;
}

async function writeClipboardText(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    const ready = await ensureClipboardOffscreen();
    if (!ready) return false;
    const response = await chrome.runtime.sendMessage({ type: 'JOBCLAW_CLIPBOARD_WRITE', text: value });
    return response?.ok === true;
  } catch {
    return false;
  }
}

function validPoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    throw new Error('聊天输入坐标无效');
  }
  return { x, y };
}

async function debuggerBringToFront(target) {
  await chrome.debugger.sendCommand(target, 'Page.bringToFront').catch(() => {});
  await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
    expression: 'window.focus(); true',
    returnByValue: true
  }).catch(() => {});
}

async function debuggerNodeAtPoint(target, point) {
  const { x, y } = validPoint(point);
  const result = await chrome.debugger.sendCommand(target, 'DOM.getNodeForLocation', {
    x, y,
    includeUserAgentShadowDOM: true,
    ignorePointerEventsNone: true
  }).catch(() => null);
  return {
    nodeId: Number(result?.nodeId || 0),
    backendNodeId: Number(result?.backendNodeId || 0),
    frameId: String(result?.frameId || '')
  };
}

async function debuggerResolveNodeObject(target, node = {}) {
  const args = {};
  if (Number(node.nodeId || 0)) args.nodeId = Number(node.nodeId);
  else if (Number(node.backendNodeId || 0)) args.backendNodeId = Number(node.backendNodeId);
  else return '';
  const resolved = await chrome.debugger.sendCommand(target, 'DOM.resolveNode', args).catch(() => null);
  return String(resolved?.object?.objectId || '');
}

async function debuggerReadObjectText(target, objectId = '') {
  if (!objectId) return '';
  const result = await chrome.debugger.sendCommand(target, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      if ('value' in this && !this.isContentEditable) return String(this.value || '');
      return String(this.innerText || this.textContent || '');
    }`,
    returnByValue: true,
    silent: true
  }).catch(() => null);
  return String(result?.result?.value || '');
}

async function debuggerReadNodeText(target, node = {}) {
  const objectId = await debuggerResolveNodeObject(target, node);
  return debuggerReadObjectText(target, objectId);
}

async function debuggerFindEditableObject(target, message = {}) {
  const selector = String(message.selector || '').trim();
  const point = validPoint(message.point);
  const expression = `(() => {
    const exactSelector = ${JSON.stringify(selector)};
    const point = ${JSON.stringify(point)};
    const editableSelector = 'textarea,input[type="text"],input:not([type]),[contenteditable]:not([contenteditable="false"]),[role="textbox"],[data-slate-editor="true"],[data-lexical-editor="true"]';
    const isEditable = node => {
      if (!node || node.nodeType !== 1) return false;
      const tag = String(node.tagName || '').toLowerCase();
      if (tag === 'textarea') return true;
      if (tag === 'input') {
        const type = String(node.getAttribute('type') || 'text').toLowerCase();
        return ['text', 'search', ''].includes(type);
      }
      const mode = String(node.getAttribute('contenteditable') || '').toLowerCase();
      return node.isContentEditable
        || Boolean(mode && !['false', 'inherit', 'off'].includes(mode))
        || node.getAttribute('role') === 'textbox'
        || node.getAttribute('data-slate-editor') === 'true'
        || node.getAttribute('data-lexical-editor') === 'true';
    };
    const deepQuery = (root, query) => {
      if (!root) return null;
      try {
        const direct = root.querySelector?.(query);
        if (direct) return direct;
      } catch {}
      let elements = [];
      try { elements = [...(root.querySelectorAll?.('*') || [])]; } catch {}
      for (const element of elements) {
        if (element.shadowRoot) {
          const found = deepQuery(element.shadowRoot, query);
          if (found) return found;
        }
      }
      return null;
    };
    const nearestEditable = node => {
      let current = node;
      for (let depth = 0; current && depth < 16; depth += 1) {
        if (isEditable(current)) return current;
        let nested = null;
        try { nested = current.querySelector?.(editableSelector); } catch {}
        if (nested && isEditable(nested)) return nested;
        const root = current.getRootNode?.();
        current = current.parentElement || (root && root.host) || null;
      }
      return null;
    };
    let node = exactSelector ? deepQuery(document, exactSelector) : null;
    node = nearestEditable(node) || node;
    if (!isEditable(node)) {
      let pointNode = null;
      try { pointNode = document.elementFromPoint(point.x, point.y); } catch {}
      node = nearestEditable(pointNode);
    }
    if (!isEditable(node)) return null;
    try { node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); } catch {}
    try { node.focus({ preventScroll: true }); } catch { try { node.focus(); } catch {} }
    if (node.isContentEditable) {
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch {}
    }
    return node;
  })()`;
  const result = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
    expression,
    returnByValue: false,
    awaitPromise: false,
    includeCommandLineAPI: false
  }).catch(() => null);
  const objectId = String(result?.result?.objectId || '');
  if (!objectId) return { objectId: '', nodeId: 0, point, selector };
  const requested = await chrome.debugger.sendCommand(target, 'DOM.requestNode', { objectId }).catch(() => null);
  const nodeId = Number(requested?.nodeId || 0);
  return { objectId, nodeId, point, selector };
}

async function debuggerFocusObject(target, objectId = '') {
  if (!objectId) return null;
  const result = await chrome.debugger.sendCommand(target, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      try { this.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); } catch {}
      try { this.focus({ preventScroll: true }); } catch { try { this.focus(); } catch {} }
      if (this.isContentEditable) {
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(this);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        } catch {}
      }
      const rect = this.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, tag: this.tagName || '', id: this.id || '' };
    }`,
    returnByValue: true,
    silent: true
  }).catch(() => null);
  return result?.result?.value || null;
}

async function debuggerPasteClipboard(target) {
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
    nativeVirtualKeyCode: 86,
    modifiers: 4,
    commands: ['Paste']
  });
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'v',
    code: 'KeyV',
    windowsVirtualKeyCode: 86,
    nativeVirtualKeyCode: 86,
    modifiers: 4
  });
}

async function withTabDebugger(tabId, operation) {
  if (!Number.isInteger(Number(tabId))) throw new Error('无法确定当前 BOSS 标签页');
  const id = Number(tabId);
  const previous = debuggerLocks.get(id) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  const queueEntry = previous.then(() => current);
  debuggerLocks.set(id, queueEntry);
  await previous;
  const target = { tabId: id };
  let attached = false;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    await debuggerBringToFront(target);
    return await operation(target);
  } catch (error) {
    const message = String(error?.message || error || '');
    if (/Another debugger is already attached|Cannot attach to this target|DevTools/i.test(message)) {
      throw new Error('Chrome 调试通道正被 DevTools 或其他工具占用，请关闭该 BOSS 页面的开发者工具后重试');
    }
    throw error;
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
    release?.();
    if (debuggerLocks.get(id) === queueEntry) debuggerLocks.delete(id);
  }
}

async function debuggerMouseClick(target, point) {
  const { x, y } = validPoint(point);
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved', x, y, button: 'none', buttons: 0
  });
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1
  });
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1
  });
}

async function debuggerDocumentNode(target) {
  const result = await chrome.debugger.sendCommand(target, 'DOM.getDocument', {
    depth: -1,
    pierce: true
  });
  const nodeId = Number(result?.root?.nodeId || 0);
  if (!nodeId) throw new Error('无法读取当前 BOSS 页面 DOM');
  return nodeId;
}

async function debuggerNodeBySelector(target, selector) {
  const normalized = String(selector || '').trim();
  if (!normalized) return 0;
  const rootNodeId = await debuggerDocumentNode(target);
  const result = await chrome.debugger.sendCommand(target, 'DOM.querySelector', {
    nodeId: rootNodeId,
    selector: normalized
  });
  return Number(result?.nodeId || 0);
}

async function debuggerFocusTarget(target, message = {}) {
  await debuggerBringToFront(target);

  // 必须优先锁定 content script 临时标记的真实编辑节点。旧版先取坐标节点，
  // BOSS 页面上经常命中编辑器外壳/透明层，导致看似有光标但文字没有进入编辑器。
  const exact = await debuggerFindEditableObject(target, message).catch(() => ({ objectId: '', nodeId: 0 }));
  if (exact.objectId) {
    const rect = await debuggerFocusObject(target, exact.objectId);
    if (rect && Number(rect.width) > 0 && Number(rect.height) > 0) {
      const clickPoint = {
        x: Math.round(Number(rect.left) + Math.max(8, Math.min(Number(rect.width) - 8, Number(rect.width) * 0.5))),
        y: Math.round(Number(rect.top) + Math.max(8, Math.min(Number(rect.height) - 8, Number(rect.height) * 0.5)))
      };
      await debuggerMouseClick(target, clickPoint).catch(() => {});
      await debuggerFocusObject(target, exact.objectId);
      return { method: 'exact-selector-object-focus+click', ...exact, point: clickPoint, rect };
    }
    return { method: 'exact-selector-object-focus', ...exact, rect };
  }

  const pointNode = await debuggerNodeAtPoint(target, message.point).catch(() => ({ nodeId: 0, backendNodeId: 0 }));
  if (pointNode.nodeId || pointNode.backendNodeId) {
    const args = pointNode.nodeId ? { nodeId: pointNode.nodeId } : { backendNodeId: pointNode.backendNodeId };
    await chrome.debugger.sendCommand(target, 'DOM.focus', args).catch(() => {});
    await debuggerMouseClick(target, message.point).catch(() => {});
    const objectId = await debuggerResolveNodeObject(target, pointNode).catch(() => '');
    return { method: 'point-node-focus+click', ...pointNode, objectId };
  }

  await debuggerMouseClick(target, message.point);
  return { method: 'coordinate-click', nodeId: 0, objectId: '' };
}

async function debuggerClickTarget(target, message = {}) {
  const selector = String(message.selector || '').trim();
  if (selector) {
    const nodeId = await debuggerNodeBySelector(target, selector);
    if (nodeId) {
      await chrome.debugger.sendCommand(target, 'DOM.scrollIntoViewIfNeeded', { nodeId }).catch(() => {});
      const model = await chrome.debugger.sendCommand(target, 'DOM.getBoxModel', { nodeId });
      const quad = model?.model?.content || model?.model?.border || [];
      if (Array.isArray(quad) && quad.length >= 8) {
        const xs = [quad[0], quad[2], quad[4], quad[6]].map(Number);
        const ys = [quad[1], quad[3], quad[5], quad[7]].map(Number);
        await debuggerMouseClick(target, {
          x: xs.reduce((sum, value) => sum + value, 0) / xs.length,
          y: ys.reduce((sum, value) => sum + value, 0) / ys.length
        });
        return { method: 'dom-box-click', nodeId };
      }
    }
  }
  await debuggerMouseClick(target, message.point);
  return { method: 'coordinate-click', nodeId: 0 };
}

async function debuggerReadTargetText(target, selector) {
  const normalized = String(selector || '').trim();
  if (!normalized) return '';
  const expression = `(() => {
    const element = document.querySelector(${JSON.stringify(normalized)});
    if (!element) return '';
    if ('value' in element) return String(element.value || '');
    return String(element.innerText || element.textContent || '');
  })()`;
  const result = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false
  });
  return String(result?.result?.value || '');
}

async function debuggerSelectAll(target) {
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65, modifiers: 4, commands: ['SelectAll']
  });
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65, modifiers: 4
  });
}

async function debuggerPressEnter(target) {
  // 与 Selenium/Playwright 的真实 Enter 等价：rawKeyDown 携带回车文本后再 keyUp。
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r'
  });
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13
  });
}

async function debuggerTypeText(target, text) {
  const value = String(text || '');
  for (const character of value) {
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'char',
      text: character,
      unmodifiedText: character
    });
    await new Promise(resolve => setTimeout(resolve, 12));
  }
}

async function mainWorldWriteChatText(tabId, selector, text) {
  const normalizedSelector = String(selector || '').trim();
  const desired = String(text || '');
  if (!normalizedSelector || !desired.trim()) throw new Error('聊天输入目标或招呼语为空');
  const results = await chrome.scripting.executeScript({
    target: { tabId: Number(tabId) },
    world: 'MAIN',
    func: (exactSelector, nextText) => {
      const normalizeText = value => String(value || '').replace(/\s+/g, '').trim();
      const isEditable = node => {
        if (!node || typeof node.matches !== 'function') return false;
        const tag = String(node.tagName || '').toLowerCase();
        if (tag === 'textarea') return true;
        if (tag === 'input') {
          const type = String(node.getAttribute('type') || 'text').toLowerCase();
          return ['text', 'search', ''].includes(type);
        }
        const editableMode = String(node.getAttribute('contenteditable') || '').toLowerCase();
        return node.isContentEditable
          || Boolean(editableMode && !['false', 'inherit', 'off'].includes(editableMode))
          || node.getAttribute('role') === 'textbox'
          || node.getAttribute('data-slate-editor') === 'true'
          || node.getAttribute('data-lexical-editor') === 'true';
      };
      const deepQuery = (rootNode, query) => {
        if (!rootNode) return null;
        try {
          const direct = rootNode.querySelector?.(query);
          if (direct) return direct;
        } catch {}
        let elements = [];
        try { elements = [...(rootNode.querySelectorAll?.('*') || [])]; } catch {}
        for (const element of elements) {
          if (element.shadowRoot) {
            const found = deepQuery(element.shadowRoot, query);
            if (found) return found;
          }
        }
        return null;
      };
      const root = deepQuery(document, exactSelector);
      if (!root) return { ok: false, reason: 'selector-not-found' };
      const editor = isEditable(root)
        ? root
        : [...root.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable]:not([contenteditable="false"]),[role="textbox"],[data-slate-editor="true"],[data-lexical-editor="true"]')].find(isEditable);
      if (!editor) return { ok: false, reason: 'editable-not-found', rootTag: String(root.tagName || '') };

      const readValue = () => {
        if ('value' in editor && !editor.isContentEditable) return String(editor.value || '');
        return String(editor.innerText || editor.textContent || '');
      };
      const dispatchInput = (inputType, data) => {
        try {
          editor.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: false,
            composed: true,
            inputType,
            data
          }));
        } catch {
          editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
      };
      const dispatchBeforeInput = (inputType, data) => {
        try {
          return editor.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType,
            data
          }));
        } catch {
          return true;
        }
      };

      editor.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      try { HTMLElement.prototype.focus.call(editor); } catch { editor.focus?.(); }
      const previous = readValue();
      const tag = String(editor.tagName || '').toLowerCase();
      let method = '';

      if ((tag === 'textarea' || tag === 'input') && 'value' in editor) {
        const proto = tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        dispatchBeforeInput('deleteByCut', null);
        if (setter) setter.call(editor, ''); else editor.value = '';
        dispatchInput('deleteByCut', null);
        const tracker = editor._valueTracker;
        if (tracker?.setValue) tracker.setValue(previous);
        dispatchBeforeInput('insertText', nextText);
        if (setter) setter.call(editor, nextText); else editor.value = nextText;
        dispatchInput('insertText', nextText);
        editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        method = 'main-native-value-setter';
      } else {
        const selection = window.getSelection?.();
        if (selection && document.createRange) {
          const range = document.createRange();
          range.selectNodeContents(editor);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        dispatchBeforeInput('deleteContentBackward', null);
        let inserted = false;
        try {
          const transfer = new DataTransfer();
          transfer.setData('text/plain', nextText);
          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clipboardData: transfer
          });
          editor.dispatchEvent(pasteEvent);
          inserted = normalizeText(readValue()).includes(normalizeText(nextText));
        } catch {
          inserted = false;
        }
        if (!inserted) {
          try {
            inserted = Boolean(document.execCommand?.('insertText', false, nextText));
          } catch {
            inserted = false;
          }
        }
        if (!inserted || !normalizeText(readValue()).includes(normalizeText(nextText))) {
          try {
            editor.replaceChildren(document.createTextNode(nextText));
          } catch {
            editor.textContent = nextText;
          }
        }
        dispatchInput('insertText', nextText);
        editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        try {
          editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, composed: true, data: nextText }));
        } catch {}
        method = inserted ? 'main-exec-command' : 'main-contenteditable-replace';
      }

      try { HTMLElement.prototype.focus.call(editor); } catch { editor.focus?.(); }
      const actual = readValue();
      const compactExpected = normalizeText(nextText);
      const compactActual = normalizeText(actual);
      return {
        ok: Boolean(compactActual && compactActual.includes(compactExpected)),
        method,
        actual,
        tag,
        id: String(editor.id || ''),
        className: String(editor.className || '').slice(0, 180),
        contenteditable: String(editor.getAttribute?.('contenteditable') || ''),
        role: String(editor.getAttribute?.('role') || '')
      };
    },
    args: [normalizedSelector, desired]
  });
  return results?.[0]?.result || { ok: false, reason: 'main-world-no-result' };
}

async function trustedChatInput(tabId, message = {}) {
  const action = String(message.action || '');
  if (action === 'replaceText' || action === 'replaceTextAndEnter') {
    const text = String(message.text || '');
    if (!text.trim()) throw new Error('待输入的招呼语为空');
    const compactExpected = text.replace(/\s+/g, '');

    // 写入和 Enter 必须在同一次 debugger 会话、同一个精确编辑节点上完成。
    // 这是 Selenium sendKeys / Playwright locator.type + Enter 的同类浏览器级路径，
    // 避免旧版“聚焦了外壳、文字没有进入真实编辑器”的问题。
    return withTabDebugger(tabId, async target => {
      let focus = await debuggerFocusTarget(target, message);
      if (!focus.objectId) throw new Error('没有定位到 BOSS 真实聊天编辑节点');

      const readExact = async () => debuggerReadObjectText(target, focus.objectId);
      const refocus = async () => {
        const refreshed = await debuggerFocusTarget(target, message);
        if (refreshed.objectId) focus = refreshed;
        if (!focus.objectId) throw new Error('BOSS 聊天编辑节点已失效');
        return focus;
      };
      const matches = value => {
        const compact = String(value || '').replace(/\s+/g, '');
        return Boolean(compact && (compact === compactExpected || compact.includes(compactExpected)));
      };

      let actual = '';
      let writeMethod = '';

      // 1) 精确对象聚焦后使用 CDP Input.insertText，最接近真实键盘输入。
      await debuggerSelectAll(target);
      await chrome.debugger.sendCommand(target, 'Input.insertText', { text });
      await new Promise(resolve => setTimeout(resolve, 700));
      actual = await readExact();
      writeMethod = 'exact-cdp-insert-text';

      // 2) 某些富文本编辑器只响应原生 paste。
      if (!matches(actual) && await writeClipboardText(text)) {
        await refocus();
        await debuggerSelectAll(target);
        await debuggerPasteClipboard(target);
        await new Promise(resolve => setTimeout(resolve, 900));
        actual = await readExact();
        writeMethod = 'exact-cdp-clipboard-paste';
      }

      // 3) React/Vue 受控编辑器可能需要主世界 setter/beforeinput/input。
      if (!matches(actual)) {
        const mainWrite = await mainWorldWriteChatText(tabId, message.selector, text).catch(error => ({
          ok: false,
          reason: String(error?.message || error || 'main-world-write-failed')
        }));
        await refocus();
        await new Promise(resolve => setTimeout(resolve, 650));
        actual = await readExact();
        writeMethod = mainWrite?.method || 'main-world-write';
      }

      // 4) 最后兜底为逐字符可信键盘输入，仍锁定同一个真实节点。
      if (!matches(actual)) {
        await refocus();
        await debuggerSelectAll(target);
        await debuggerTypeText(target, text);
        await new Promise(resolve => setTimeout(resolve, 1000));
        actual = await readExact();
        writeMethod = 'exact-cdp-keyboard-type';
      }

      if (!matches(actual)) {
        throw new Error(`文字没有进入 BOSS 真实聊天编辑器；实际长度=${String(actual || '').length}`);
      }

      if (action === 'replaceTextAndEnter') {
        await refocus();
        // 给 BOSS 受控状态一次提交渲染机会，再发送真实 Enter。
        await new Promise(resolve => setTimeout(resolve, 520));
        await debuggerPressEnter(target);
      }

      return {
        ok: true,
        action,
        length: text.length,
        insertedBeforeSend: true,
        writeMethod,
        actualLength: String(actual || '').length,
        focusMethod: focus.method,
        editor: {
          nodeId: Number(focus.nodeId || 0),
          selector: String(message.selector || '')
        }
      };
    });
  }

  return withTabDebugger(tabId, async target => {
    if (action === 'pressEnter') {
      const focus = await debuggerFocusTarget(target, message);
      if (!focus.objectId) throw new Error('没有定位到 BOSS 真实聊天编辑节点');
      await new Promise(resolve => setTimeout(resolve, 320));
      await debuggerPressEnter(target);
      return { ok: true, action, focusMethod: focus.method };
    }
    if (action === 'click') {
      const click = await debuggerClickTarget(target, message);
      return { ok: true, action, clickMethod: click.method };
    }
    throw new Error('不支持的可信输入动作');
  });
}

async function init() {
  const current = await storage.all();
  const patch = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (current[key] === undefined) patch[key] = value;
  }
  if (!current.ui9ModeMigration) {
    const currentConfig = current.config || {};
    patch.config = {
      ...DEFAULTS.config,
      ...currentConfig,
      executionMode: currentConfig.executionMode === 'auto' ? 'auto' : 'review',
      dailyTarget: Number(currentConfig.dailyTarget || 0) === 40 ? 150 : Number(currentConfig.dailyTarget || 150)
    };
    patch.ui9ModeMigration = true;
  }
  if (!current.ui10UnlimitedV4Migration) {
    const baseConfig = patch.config || current.config || {};
    const baseModel = { ...DEFAULTS.config.model, ...(baseConfig.model || {}) };
    const baseUrl = String(baseModel.baseUrl || DEFAULTS.config.model.baseUrl);
    const modelName = String(baseModel.model || '').trim();
    const isDeepSeek = /deepseek\.com/i.test(baseUrl);
    const legacyDeepSeekModel = !modelName || ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4'].includes(modelName);
    patch.config = {
      ...DEFAULTS.config,
      ...baseConfig,
      discoveryLimit: 0,
      model: {
        ...baseModel,
        model: isDeepSeek && legacyDeepSeekModel ? 'deepseek-v4-flash' : (modelName || 'deepseek-v4-flash')
      }
    };
    patch.ui10UnlimitedV4Migration = true;
  }
  if (!current.ui20ReliableSendMigration) {
    const baseConfig = patch.config || current.config || {};
    patch.config = {
      ...DEFAULTS.config,
      ...baseConfig,
      betweenJobsSeconds: Math.max(8, Math.min(30, Number(baseConfig.betweenJobsSeconds || 8))),
      attachmentDelaySeconds: Math.max(1, Math.min(10, Number(baseConfig.attachmentDelaySeconds || 2)))
    };
    patch.ui20ReliableSendMigration = true;
  }
  if (!current.ui21ConversationBindingMigration) {
    patch.chatTransition = null;
    patch.chatDeliveryLedger = current.chatDeliveryLedger && typeof current.chatDeliveryLedger === 'object'
      ? current.chatDeliveryLedger
      : {};
    patch.ui21ConversationBindingMigration = true;
  }
  if (!current.ui22StrictTranscriptMigration) {
    const baseConfig = patch.config || current.config || {};
    patch.config = {
      ...DEFAULTS.config,
      ...baseConfig,
      betweenJobsSeconds: Math.max(12, Math.min(30, Number(baseConfig.betweenJobsSeconds || 12))),
      attachmentDelaySeconds: Math.max(4, Math.min(10, Number(baseConfig.attachmentDelaySeconds || 4)))
    };
    patch.ui22StrictTranscriptMigration = true;
  }
  if (!current.ui24VerifiedConversationMigration) {
    patch.chatTransition = null;
    patch.ui24VerifiedConversationMigration = true;
  }
  if (!current.ui27TrustedInputMigration) {
    const baseWorkflow = patch.workflow || current.workflow || {};
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...baseWorkflow,
      running: false,
      paused: true,
      phase: 'idle',
      pendingApplyId: null,
      activeRunId: null,
      statusText: '可信发送引擎已升级，请重新开始任务'
    };
    patch.chatTransition = null;
    patch.ui27TrustedInputMigration = true;
  }
  if (!current.ui12ProfileDraftMigration) {
    let migratedProfile = current.profile && typeof current.profile === 'object' ? current.profile : null;
    let migratedDraft = current.profileDraft && typeof current.profileDraft === 'object'
      ? normalizeProfileDraft(current.profileDraft)
      : null;
    if (!profileDraftHasAny(migratedDraft) && profileHasCore(migratedProfile)) {
      migratedDraft = profileToDraft(migratedProfile, 'migration');
    }
    if (!profileDraftHasCore(migratedDraft) && String(current.resumeText || '').trim().length >= 30) {
      try {
        migratedProfile = buildLocalProfile(current.resumeText || '');
        migratedProfile.generation.mode = 'local-recovery';
        migratedProfile.generation.label = '本地初稿';
        migratedProfile.generation.warning = '已从保存的简历恢复初稿。';
        migratedDraft = profileToDraft(migratedProfile, 'recovery');
        patch.profile = migratedProfile;
      } catch {
        // 简历内容不足时只保留现有数据，不生成空画像。
      }
    }
    if (profileDraftHasAny(migratedDraft)) patch.profileDraft = migratedDraft;
    patch.ui12ProfileDraftMigration = true;
  }
  if (!current.ui37DirectionPlanMigration) {
    const profileForPlan = patch.profile || current.profile || null;
    const existingPlan = current.directionPlan && typeof current.directionPlan === 'object'
      ? current.directionPlan
      : null;
    if (profileHasCore(profileForPlan)) {
      patch.directionPlan = buildDirectionPlan(profileForPlan, existingPlan, {
        confirmed: Boolean(existingPlan?.confirmed),
        preserveSelections: true,
        preserveEdits: true,
        preserveCustom: true
      });
    } else if (existingPlan) {
      patch.directionPlan = normalizeDirectionPlan(existingPlan, profileForPlan);
    }
    patch.ui37DirectionPlanMigration = true;
  }
  if (!current.ui18TaskProgressMigration) {
    const migratedPending = Array.isArray(current.pending) ? current.pending.map(entry => ({ ...entry })) : [];
    const migratedRuns = Array.isArray(current.taskRuns) ? current.taskRuns.map(run => normalizeTaskRun(run, run)) : [];
    for (let index = 0; index < migratedPending.length; index += 1) {
      const item = migratedPending[index];
      let run = migratedRuns.find(entry => entry.id === item.runId || entry.pendingId === item.id);
      if (!run) {
        const statusMap = {
          pending: ['waiting_review', 'waiting_review', 60],
          approved: ['running', 'queued', 64],
          approved_queue: ['queued', 'queued', 64],
          sent: ['success', 'success', 100],
          failed: ['failed', 'failed', 100],
          rejected: ['ignored', 'ignored', 100]
        };
        const [status, stage, progress] = statusMap[item.status] || ['skipped', 'skipped', 100];
        run = normalizeTaskRun({
          id: crypto.randomUUID(),
          pendingId: item.id,
          job: item.job,
          analysis: item.analysis,
          searchTask: item.task,
          status,
          stage,
          progress,
          error: item.error || '',
          retryable: item.status === 'failed',
          createdAt: item.createdAt || Date.now(),
          completedAt: ['sent', 'failed', 'rejected'].includes(item.status) ? (item.completedAt || item.rejectedAt || Date.now()) : null
        });
        migratedRuns.push(run);
      }
      migratedPending[index] = { ...item, runId: run.id };
    }
    const workflow = { ...DEFAULTS.workflow, ...(current.workflow || {}) };
    workflow.tasks = (workflow.tasks || []).map((task, index) => ({
      ...task,
      id: task.id || crypto.randomUUID(),
      status: task.status || (index < Number(workflow.taskIndex || 0) ? 'completed' : index === Number(workflow.taskIndex || 0) && workflow.running ? 'running' : 'pending'),
      progress: Number.isFinite(Number(task.progress)) ? Number(task.progress) : (index < Number(workflow.taskIndex || 0) ? 100 : 0),
      stageLabel: task.stageLabel || (index < Number(workflow.taskIndex || 0) ? '已完成' : '等待开始'),
      processed: Number(task.processed || 0),
      discovered: Number(task.discovered || 0),
      analyzed: Number(task.analyzed || 0),
      failed: Number(task.failed || 0)
    }));
    patch.pending = migratedPending;
    patch.taskRuns = migratedRuns;
    patch.workflow = workflow;
    patch.ui18TaskProgressMigration = true;
  }
  if (!current.ui20GreetingLockMigration) {
    const basePending = Array.isArray(patch.pending) ? patch.pending : (Array.isArray(current.pending) ? current.pending : []);
    patch.pending = basePending.map(item => ({
      ...item,
      deliveryGreeting: String(item.deliveryGreeting || item.analysis?.greeting || '').trim()
    }));
    patch.ui20GreetingLockMigration = true;
  }
  if (!current.ui30AtomicSendSortMigration) {
    const basePending = Array.isArray(patch.pending) ? patch.pending : (Array.isArray(current.pending) ? current.pending : []);
    patch.pending = rerankPending(basePending);
    const baseWorkflow = patch.workflow || current.workflow || {};
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...baseWorkflow,
      running: false,
      paused: true,
      pendingApplyId: null,
      activeRunId: null,
      statusText: '投递引擎与岗位自动排序已升级，请重新开始'
    };
    patch.chatTransition = null;
    patch.ui30AtomicSendSortMigration = true;
  }
  if (!current.ui31ConversationSelectionMigration) {
    const basePending = Array.isArray(patch.pending) ? patch.pending : (Array.isArray(current.pending) ? current.pending : []);
    patch.pending = rerankPending(basePending);
    const baseWorkflow = patch.workflow || current.workflow || {};
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...baseWorkflow,
      running: false,
      paused: true,
      pendingApplyId: null,
      activeRunId: null,
      statusText: 'HR 会话选择与身份核对已升级，请重新开始'
    };
    const ledger = current.chatDeliveryLedger && typeof current.chatDeliveryLedger === 'object' ? current.chatDeliveryLedger : {};
    patch.chatDeliveryLedger = Object.fromEntries(Object.entries(ledger).filter(([, entry]) => entry?.status === 'sent'));
    patch.chatTransition = null;
    patch.ui31ConversationSelectionMigration = true;
  }
  if (!current.ui35ConversationKeyMigration) {
    const baseWorkflow = patch.workflow || current.workflow || {};
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...baseWorkflow,
      running: false,
      paused: true,
      pendingApplyId: null,
      activeRunId: null,
      statusText: 'HR 会话锁已升级，请重新开始'
    };
    const ledger = current.chatDeliveryLedger && typeof current.chatDeliveryLedger === 'object' ? current.chatDeliveryLedger : {};
    patch.chatDeliveryLedger = Object.fromEntries(Object.entries(ledger).filter(([, entry]) => entry?.status === 'sent'));
    patch.chatTransition = null;
    patch.ui35ConversationKeyMigration = true;
  }
  if (!current.v130SingleValidationMigration) {
    const baseConfig = patch.config || current.config || {};
    const alreadySuccessful = Number(current.stats?.sent || 0) > 0
      || Number(baseConfig.singleJobValidationCompletedAt || 0) > 0;
    patch.config = {
      ...DEFAULTS.config,
      ...baseConfig,
      requireSingleJobValidation: baseConfig.requireSingleJobValidation !== false,
      singleJobValidationCompletedAt: alreadySuccessful
        ? Number(baseConfig.singleJobValidationCompletedAt || Date.now())
        : 0
    };
    patch.v130SingleValidationMigration = true;
  }
  if (!current.v170SafetyIntelligenceMigration) {
    const baseConfig = patch.config || current.config || {};
    const legacyTarget = Number(baseConfig.dailyTarget || 0);
    const legacyDiscovery = Number(baseConfig.discoveryLimit || 0);
    patch.config = {
      ...DEFAULTS.config,
      ...baseConfig,
      batchStrategy: normalizeStrategy(baseConfig.batchStrategy),
      dryRun: Boolean(baseConfig.dryRun),
      dailyTarget: legacyTarget <= 0 ? 30 : Math.min(150, legacyTarget),
      discoveryLimit: legacyDiscovery <= 0 ? 150 : Math.min(800, legacyDiscovery),
      betweenJobsSeconds: Math.max(6, Number(baseConfig.betweenJobsSeconds || 9)),
      maxPerCompanyPerDay: Math.max(1, Math.min(12, Number(baseConfig.maxPerCompanyPerDay || 3))),
      maxConsecutiveFailures: Math.max(1, Math.min(10, Number(baseConfig.maxConsecutiveFailures || 3))),
      jitterSeconds: Math.max(0, Math.min(15, Number(baseConfig.jitterSeconds ?? 3))),
      companyVerificationEnabled: baseConfig.companyVerificationEnabled !== false,
      companyVerificationProvider: String(baseConfig.companyVerificationProvider || 'bridge'),
      companyVerificationCacheDays: Math.max(1, Math.min(90, Number(baseConfig.companyVerificationCacheDays || 14))),
      blockUnknownCompanies: Boolean(baseConfig.blockUnknownCompanies),
      updateCheckEnabled: baseConfig.updateCheckEnabled !== false,
      rateLimits: { ...DEFAULTS.config.rateLimits, ...(baseConfig.rateLimits || {}) }
    };
    patch.safetyState = { ...DEFAULTS.safetyState, ...(current.safetyState || {}) };
    patch.companyVerificationCache = current.companyVerificationCache && typeof current.companyVerificationCache === 'object' ? current.companyVerificationCache : {};
    patch.deliveryHistory = Array.isArray(current.deliveryHistory) ? current.deliveryHistory : [];
    patch.updateInfo = { ...DEFAULTS.updateInfo, ...(current.updateInfo || {}), currentVersion: '1.7.0' };
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...(patch.workflow || current.workflow || {}),
      running: false,
      paused: true,
      pendingApplyId: null,
      activeRunId: null,
      statusText: 'v1.7 安全投递引擎已升级 请检查限速和企业核验设置后重新开始'
    };
    patch.v170SafetyIntelligenceMigration = true;
  }
  if (!current.v170FormalReleaseMigration) {
    const baseConfig = patch.config || current.config || {};
    const migratedStrategy = normalizeStrategy(baseConfig.batchStrategy);
    patch.config = {
      ...DEFAULTS.config,
      ...baseConfig,
      batchStrategy: migratedStrategy,
      massApplyAnalysis: ['auto-ai', 'cloud', 'local', 'rules'].includes(baseConfig.massApplyAnalysis) ? baseConfig.massApplyAnalysis : 'auto-ai',
      pacingPreset: ['conservative', 'standard', 'efficient', 'custom'].includes(baseConfig.pacingPreset) ? baseConfig.pacingPreset : 'standard',
      dailyTarget: Math.max(1, Math.min(150, Number(baseConfig.dailyTarget || 30))),
      discoveryLimit: Math.max(1, Math.min(800, Number(baseConfig.discoveryLimit || 150))),
      betweenJobsSeconds: Math.max(6, Math.min(120, Number(baseConfig.betweenJobsSeconds || 9))),
      attachmentDelaySeconds: Math.max(1.5, Math.min(15, Number(baseConfig.attachmentDelaySeconds || 3))),
      maxPerCompanyPerDay: Math.max(1, Math.min(12, Number(baseConfig.maxPerCompanyPerDay || 3))),
      queueWarmup: Math.max(1, Math.min(10, Number(baseConfig.queueWarmup || 4))),
      dailyReportEnabled: baseConfig.dailyReportEnabled !== false,
      dailyReportTime: /^\d{2}:\d{2}$/.test(String(baseConfig.dailyReportTime || '')) ? String(baseConfig.dailyReportTime) : '20:30',
      dailyReportNotification: baseConfig.dailyReportNotification !== false,
      rateLimits: { ...DEFAULTS.config.rateLimits, ...(baseConfig.rateLimits || {}) }
    };
    patch.safetyState = { ...DEFAULTS.safetyState, ...(current.safetyState || {}) };
    patch.v170FormalReleaseMigration = true;
  }
  if (!current.v180SearchFilterMigration) {
    const baseConfig = patch.config || current.config || {};
    patch.config = {
      ...DEFAULTS.config,
      ...baseConfig,
      targetLocations: Array.isArray(baseConfig.targetLocations) ? baseConfig.targetLocations : [],
      expandNationwideToCities: baseConfig.expandNationwideToCities !== false,
      cityRotationCities: Array.isArray(baseConfig.cityRotationCities) && baseConfig.cityRotationCities.length
        ? baseConfig.cityRotationCities
        : DEFAULTS.config.cityRotationCities,
      employmentTypes: Array.isArray(baseConfig.employmentTypes) && baseConfig.employmentTypes.length ? baseConfig.employmentTypes : ['不限'],
      experiences: Array.isArray(baseConfig.experiences) && baseConfig.experiences.length ? baseConfig.experiences : ['不限'],
      degrees: Array.isArray(baseConfig.degrees) && baseConfig.degrees.length ? baseConfig.degrees : ['不限'],
      salary: String(baseConfig.salary || '不限'),
      maxSearchTasks: Math.max(1, Math.min(300, Number(baseConfig.maxSearchTasks || 120))),
      maxJobsPerTask: Math.max(1, Math.min(100, Number(baseConfig.maxJobsPerTask || 20))),
      stagnationLimit: Math.max(3, Math.min(30, Number(baseConfig.stagnationLimit || 8))),
      dedupeWindowDays: Math.max(1, Math.min(180, Number(baseConfig.dedupeWindowDays || 30))),
      lowQualityPolicy: ['rank', 'skip-obvious'].includes(baseConfig.lowQualityPolicy) ? baseConfig.lowQualityPolicy : 'skip-obvious',
      lowQualityThreshold: Math.max(0, Math.min(60, Number(baseConfig.lowQualityThreshold ?? 24)))
    };
    patch.jobSeenHistory = Array.isArray(current.jobSeenHistory) ? current.jobSeenHistory.slice(-3000) : [];
    patch.updateInfo = { ...DEFAULTS.updateInfo, ...(current.updateInfo || {}), currentVersion: '1.8.0' };
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...(patch.workflow || current.workflow || {}),
      running: false,
      paused: true,
      taskIndex: 0,
      cardIndex: 0,
      processedKeys: [],
      duplicateStreak: 0,
      noNewStreak: 0,
      activeRunId: null,
      statusText: 'v2.0 海投策略与筛选核验已升级 请确认完全海投或安全海投后重新开始'
    };
    patch.v180SearchFilterMigration = true;
  }
  if (!current.v180ChatRecoveryHotfixMigration) {
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...(patch.workflow || current.workflow || {}),
      running: false,
      paused: true,
      pendingApplyId: null,
      activeRunId: null,
      chatRecovery: null,
      statusText: 'v1.8 沟通恢复与消息页布局补丁已安装 请重新开始或使用重置并继续'
    };
    patch.chatTransition = null;
    patch.v180ChatRecoveryHotfixMigration = true;
  }
  if (!current.v190StartupReliabilityMigration) {
    patch.updateInfo = { ...DEFAULTS.updateInfo, ...(current.updateInfo || {}), currentVersion: '1.9.0' };
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...(patch.workflow || current.workflow || {}),
      running: false,
      paused: true,
      phase: 'idle',
      startup: { ...DEFAULTS.workflow.startup },
      actualSearchContext: null,
      statusText: 'v1.9 启动连接与任务诊断已升级 请刷新 BOSS 页面后重新开始'
    };
    patch.v190StartupReliabilityMigration = true;
  }
  if (!current.v200StrategyFilterGreetingMigration) {
    const baseConfig = patch.config || current.config || {};
    patch.config = {
      ...DEFAULTS.config,
      ...baseConfig,
      batchStrategy: normalizeStrategy(baseConfig.batchStrategy || 'safe-mass'),
      greetingStyle: baseConfig.greetingStyle === 'natural-project' ? 'human-project' : (baseConfig.greetingStyle || 'human-project')
    };
    patch.updateInfo = { ...DEFAULTS.updateInfo, ...(current.updateInfo || {}), currentVersion: '2.0.1' };
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...(patch.workflow || current.workflow || {}),
      running: false,
      paused: true,
      phase: 'idle',
      startup: { ...DEFAULTS.workflow.startup },
      actualSearchContext: null,
      statusText: 'v2.0.1 已修复完整求职招呼语和岗位元数据清洗 请刷新 BOSS 页面后重新开始'
    };
    patch.v200StrategyFilterGreetingMigration = true;
  }
  if (!current.v200FullGreetingHotfixMigration) {
    const profileForGreeting = patch.profile || current.profile || null;
    const resumeForGreeting = String(current.resumeText || '');
    const basePending = Array.isArray(patch.pending) ? patch.pending : (Array.isArray(current.pending) ? current.pending : []);
    patch.pending = basePending.map(item => {
      if (['sent', 'rejected'].includes(item?.status)) return item;
      const existingGreeting = String(item?.deliveryGreeting || item?.analysis?.greeting || '').trim();
      const shouldRefresh = existingGreeting.length < 120
        || /本月活跃|今日活跃|刚刚活跃|\d+\s*(?:分钟|小时|天|周|月)内活跃|方便沟通下吗|还在招吗/.test(existingGreeting);
      if (!shouldRefresh || !profileForGreeting) return item;
      const greeting = fallbackApplicantGreeting(item?.job || {}, profileForGreeting, 'human-project', resumeForGreeting);
      return {
        ...item,
        deliveryGreeting: greeting,
        analysis: { ...(item?.analysis || {}), greeting }
      };
    });
    patch.v200FullGreetingHotfixMigration = true;
  }

  if (!current.v210AiPauseMigration) {
    const baseConfig = patch.config || current.config || {};
    patch.config = {
      ...DEFAULTS.config,
      ...baseConfig,
      massApplyAnalysis: ['auto-ai', 'cloud', 'local', 'rules'].includes(baseConfig.massApplyAnalysis) ? baseConfig.massApplyAnalysis : 'auto-ai',
      aiProviderMode: normalizeAiProviderMode(baseConfig.aiProviderMode || 'auto'),
      warnWithoutAi: baseConfig.warnWithoutAi !== false,
      model: {
        ...DEFAULTS.config.model,
        ...(baseConfig.model || {}),
        model: String(baseConfig.model?.model || 'deepseek-v4-flash') === 'deepseek-v4-pro' ? 'deepseek-v4-flash' : String(baseConfig.model?.model || 'deepseek-v4-flash')
      },
      localModel: { ...DEFAULTS.config.localModel, ...(baseConfig.localModel || {}) }
    };
    patch.updateInfo = { ...DEFAULTS.updateInfo, ...(current.updateInfo || {}), currentVersion: '2.1.0' };
    patch.workflow = {
      ...DEFAULTS.workflow,
      ...(patch.workflow || current.workflow || {}),
      running: false,
      paused: true,
      phase: 'idle',
      controlRevision: Number(current.workflow?.controlRevision || 0) + 1,
      pauseRequestedAt: 0,
      stopRequestedAt: 0,
      statusText: 'v2.1 已升级 AI 路由和即时暂停 请刷新 BOSS 页面后重新开始'
    };
    patch.v210AiPauseMigration = true;
  }
  if (Object.keys(patch).length) await storage.set(patch);
  const { stats } = await storage.get('stats');
  if (!stats || stats.date !== today()) {
    await storage.set({ stats: { ...DEFAULTS.stats, date: today() } });
  }
  await refreshBossTabsForRuntimeVersion();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.alarms.create('jobclaw-tick', { periodInMinutes: 1 });
  chrome.alarms.create('jobclaw-update-check', { periodInMinutes: 360 });
  checkForUpdates(false).catch(() => {});
  syncBridgeSnapshot(true).catch(() => {});
}

function publicState(all) {
  const state = safeClone(all);
  if (state?.config?.model) state.config.model.apiKey = state.config.model.apiKey ? '***' : '';
  if (state?.config?.localModel) state.config.localModel.apiKey = state.config.localModel.apiKey ? '***' : '';
  state.aiStatus = publicAiStatus(all?.config || {});
  if (Array.isArray(state?.jobSeenHistory)) {
    state.jobSeenHistoryCount = state.jobSeenHistory.length;
    delete state.jobSeenHistory;
  }
  if (state?.resumeImage) state.resumeImage = '[已保存]';
  if (state?.resumeSourceFile) {
    const { name, type, size, lastModified } = state.resumeSourceFile;
    state.resumeSourceFile = { name, type, size, lastModified, stored: true };
  }
  return state;
}

async function writeEvent(level, message, data = {}) {
  const { events = [] } = await storage.get('events');
  const event = { id: crypto.randomUUID(), ts: Date.now(), level, message, data };
  events.unshift(event);
  await storage.set({ events: events.slice(0, 300) });
  bridge('/sync', { event }).catch(() => {});
  return event;
}

async function patchWorkflow(patch) {
  const { workflow } = await storage.get('workflow');
  const next = { ...DEFAULTS.workflow, ...(workflow || {}), ...(patch || {}) };
  await storage.set({ workflow: next });
  return next;
}

async function patchStartup(startupPatch = {}, workflowPatch = {}) {
  const { workflow } = await storage.get('workflow');
  const current = workflow || {};
  return patchWorkflow({
    ...workflowPatch,
    startup: {
      ...DEFAULTS.workflow.startup,
      ...(current.startup || {}),
      ...(startupPatch || {})
    }
  });
}

function startupIsFresh(startup = {}) {
  return startup.state === 'starting'
    && Number(startup.startedAt || 0) > 0
    && Date.now() - Number(startup.startedAt || 0) < STARTUP_STALE_AFTER_MS;
}

async function changeStats(delta = {}) {
  const { stats } = await storage.get('stats');
  const next = { ...DEFAULTS.stats, ...(stats || {}), date: today() };
  for (const [key, value] of Object.entries(delta)) {
    next[key] = Math.max(0, Number(next[key] || 0) + Number(value || 0));
  }
  await storage.set({ stats: next });
  return next;
}


function runJobKey(job = {}) {
  return String(job.jobId || job.encryptJobId || job.url || [job.title, job.company, job.location].filter(Boolean).join('|') || '').trim();
}

function normalizeTaskRun(input = {}, existing = {}) {
  const now = Date.now();
  const stage = String(input.stage || existing.stage || 'discovered');
  const meta = taskStageMeta(stage, input.stageLabel, input.progress);
  const status = String(input.status || existing.status || 'running');
  const terminal = TERMINAL_RUN_STATUSES.has(status);
  return {
    ...existing,
    ...input,
    id: input.id || existing.id || crypto.randomUUID(),
    jobKey: input.jobKey || existing.jobKey || runJobKey(input.job || existing.job || {}),
    status,
    stage,
    stageLabel: meta.label,
    progress: meta.progress,
    createdAt: existing.createdAt || input.createdAt || now,
    startedAt: existing.startedAt || input.startedAt || (status === 'running' ? now : null),
    updatedAt: now,
    completedAt: terminal ? (input.completedAt || existing.completedAt || now) : null,
    retryCount: Math.max(0, Number(input.retryCount ?? existing.retryCount ?? 0)),
    error: String(input.error ?? existing.error ?? ''),
    retryable: input.retryable ?? existing.retryable ?? Boolean(input.pendingId || existing.pendingId)
  };
}

async function upsertTaskRun(patch = {}) {
  const { taskRuns = [] } = await storage.get('taskRuns');
  const jobKey = patch.jobKey || runJobKey(patch.job || {});
  const index = taskRuns.findIndex(run => run.id === patch.id || (jobKey && run.jobKey === jobKey && !TERMINAL_RUN_STATUSES.has(run.status)));
  const existing = index >= 0 ? taskRuns[index] : {};
  const nextRun = normalizeTaskRun({ ...patch, jobKey }, existing);
  const next = index >= 0
    ? taskRuns.map((run, runIndex) => runIndex === index ? nextRun : run)
    : [nextRun, ...taskRuns];
  await storage.set({ taskRuns: next });
  return nextRun;
}

async function updateTaskRunByPending(pendingId, patch = {}) {
  if (!pendingId) return null;
  const { pending = [], taskRuns = [] } = await storage.get(['pending', 'taskRuns']);
  const item = pending.find(entry => entry.id === pendingId);
  const run = taskRuns.find(entry => entry.id === item?.runId || entry.pendingId === pendingId);
  if (!run && !item) return null;
  return upsertTaskRun({
    id: run?.id || item?.runId,
    pendingId,
    job: item?.job || run?.job,
    analysis: item?.analysis || run?.analysis,
    searchTask: item?.task || run?.searchTask,
    ...patch
  });
}

async function updateSearchTaskProgress(message = {}) {
  const { workflow } = await storage.get('workflow');
  const nextWorkflow = { ...DEFAULTS.workflow, ...(workflow || {}) };
  const tasks = Array.isArray(nextWorkflow.tasks) ? [...nextWorkflow.tasks] : [];
  const index = tasks.findIndex(task => task.id === message.taskId);
  const fallbackIndex = Number.isInteger(message.taskIndex) ? message.taskIndex : -1;
  const targetIndex = index >= 0 ? index : fallbackIndex;
  if (targetIndex < 0 || targetIndex >= tasks.length) return null;
  const current = tasks[targetIndex] || {};
  const progress = Math.max(0, Math.min(100, Number(message.progress ?? current.progress ?? 0)));
  tasks[targetIndex] = {
    ...current,
    status: message.status || current.status || 'pending',
    stageLabel: message.stageLabel || current.stageLabel || '',
    progress,
    processed: Math.max(0, Number(message.processed ?? current.processed ?? 0)),
    discovered: Math.max(0, Number(message.discovered ?? current.discovered ?? 0)),
    analyzed: Math.max(0, Number(message.analyzed ?? current.analyzed ?? 0)),
    accepted: Math.max(0, Number(message.accepted ?? current.accepted ?? 0)),
    duplicates: Math.max(0, Number(message.duplicates ?? current.duplicates ?? 0)),
    lowQuality: Math.max(0, Number(message.lowQuality ?? current.lowQuality ?? 0)),
    filterFailures: Math.max(0, Number(message.filterFailures ?? current.filterFailures ?? 0)),
    failed: Math.max(0, Number(message.failed ?? current.failed ?? 0)),
    updatedAt: Date.now(),
    completedAt: message.status === 'completed' ? Date.now() : current.completedAt || null
  };
  nextWorkflow.tasks = tasks;
  await storage.set({ workflow: nextWorkflow });
  return tasks[targetIndex];
}

async function retryFailedTask(runId) {
  const { taskRuns = [], pending = [], workflow = {} } = await storage.get(['taskRuns', 'pending', 'workflow']);
  const run = taskRuns.find(entry => entry.id === runId);
  if (!run) throw new Error('失败任务不存在');
  if (run.status === 'success') throw new Error('该岗位已经投递成功，不会重复投递');
  if (workflow.running && (workflow.activeRunId === run.id || workflow.pendingApplyId === run.pendingId)) {
    throw new Error('该失败任务正在重试，请等待当前结果');
  }
  if (Number(run.retryRequestedAt || 0) > Date.now() - 15000) {
    throw new Error('该任务刚刚提交过重试，请稍后查看结果');
  }
  let item = pending.find(entry => entry.id === run.pendingId || entry.runId === run.id);
  if (!item && run.job && run.analysis) {
    item = {
      id: crypto.randomUUID(),
      runId: run.id,
      job: run.job,
      analysis: run.analysis,
      deliveryGreeting: String(run.analysis?.greeting || '').trim(),
      task: run.searchTask || {},
      status: 'approved',
      createdAt: Date.now(),
      approvedAt: Date.now()
    };
  }
  if (!item) throw new Error('该历史任务缺少岗位或招呼语信息，无法直接重试');
  if (item.status === 'sent') throw new Error('该岗位已经投递成功，不会重复投递');
  item = {
    ...item,
    deliveryGreeting: String(item.deliveryGreeting || item.analysis?.greeting || '').trim(),
    status: 'approved', error: '', approvedAt: Date.now(), runId: run.id
  };
  const nextPending = pending.some(entry => entry.id === item.id)
    ? pending.map(entry => entry.id === item.id ? item : entry)
    : [item, ...pending];
  await storage.set({ pending: rerankPending(nextPending) });
  await upsertTaskRun({
    id: run.id,
    pendingId: item.id,
    job: item.job,
    analysis: item.analysis,
    searchTask: item.task,
    status: 'running',
    stage: 'retry_queued',
    progress: 66,
    stageLabel: '等待重新投递',
    error: '',
    retryable: true,
    retryCount: Number(run.retryCount || 0) + 1,
    retryRequestedAt: Date.now(),
    completedAt: null
  });
  await patchWorkflow({
    running: true,
    paused: false,
    phase: 'apply',
    statusText: `正在重新投递：${item.job?.title || '岗位'}`,
    pendingApplyId: item.id,
    activeRunId: run.id
  });
  try {
    await sendToBoss({ type: 'RUN' });
    setTimeout(() => sendToBoss({ type: 'RUN' }).catch(() => {}), 700);
  } catch (error) {
    await upsertTaskRun({ id: run.id, status: 'failed', stage: 'failed', progress: 100, stageLabel: '重新投递启动失败', error: error.message, retryable: true });
    await patchWorkflow({ running: false, paused: true, phase: 'idle', pendingApplyId: null, activeRunId: null, statusText: '重新投递启动失败' });
    throw error;
  }
  return { runId: run.id, pendingId: item.id };
}

async function retryAllFailedTasks() {
  const { taskRuns = [], pending = [], workflow = {} } = await storage.get(['taskRuns', 'pending', 'workflow']);
  if (workflow.running && workflow.activeRunId) {
    throw new Error('当前已有投递任务正在执行，请等待完成后再批量重试');
  }
  const failedRuns = taskRuns.filter(run => run.status === 'failed'
    && run.retryable !== false
    && Number(run.retryRequestedAt || 0) <= Date.now() - 15000);
  if (!failedRuns.length) return { count: 0 };
  const nextPending = [...pending];
  const queue = [];
  for (const run of failedRuns) {
    if (run.status === 'success') continue;
    let item = nextPending.find(entry => entry.id === run.pendingId || entry.runId === run.id);
    if (!item && run.job && run.analysis) {
      item = {
        id: crypto.randomUUID(), runId: run.id, job: run.job, analysis: run.analysis,
        deliveryGreeting: String(run.analysis?.greeting || '').trim(),
        task: run.searchTask || {}, createdAt: Date.now()
      };
      nextPending.unshift(item);
    }
    if (!item || item.status === 'sent') continue;
    item.deliveryGreeting = String(item.deliveryGreeting || item.analysis?.greeting || '').trim();
    item.status = queue.length ? 'approved_queue' : 'approved';
    item.approvedAt = Date.now();
    item.error = '';
    const pendingIndex = nextPending.findIndex(entry => entry.id === item.id);
    if (pendingIndex >= 0) nextPending[pendingIndex] = { ...item };
    queue.push({ run, item });
  }
  if (!queue.length) return { count: 0 };
  await storage.set({ pending: rerankPending(nextPending) });
  for (const [index, entry] of queue.entries()) {
    await upsertTaskRun({
      id: entry.run.id,
      pendingId: entry.item.id,
      status: index === 0 ? 'running' : 'queued',
      stage: 'retry_queued',
      progress: 66,
      stageLabel: index === 0 ? '正在重新投递' : '等待重新投递',
      error: '',
      retryable: true,
      retryCount: Number(entry.run.retryCount || 0) + 1,
      retryRequestedAt: Date.now(),
      completedAt: null
    });
  }
  const first = queue[0];
  await patchWorkflow({
    running: true,
    paused: false,
    phase: 'apply',
    statusText: `重新投递 1/${queue.length}：${first.item.job?.title || '岗位'}`,
    pendingApplyId: first.item.id,
    activeRunId: first.run.id
  });
  try {
    await sendToBoss({ type: 'RUN' });
  } catch (error) {
    for (const entry of queue) {
      await upsertTaskRun({ id: entry.run.id, status: 'failed', stage: 'failed', progress: 100, stageLabel: '批量重试启动失败', error: error.message, retryable: true });
    }
    await patchWorkflow({ running: false, paused: true, phase: 'idle', pendingApplyId: null, activeRunId: null, statusText: '批量重试启动失败' });
    throw error;
  }
  return { count: queue.length };
}

async function ignoreFailedTask(runId) {
  const { taskRuns = [], pending = [] } = await storage.get(['taskRuns', 'pending']);
  const run = taskRuns.find(entry => entry.id === runId);
  if (!run) throw new Error('失败任务不存在');
  const nextPending = pending.map(entry => entry.id === run.pendingId || entry.runId === run.id
    ? { ...entry, status: 'rejected', rejectedAt: Date.now() }
    : entry);
  await storage.set({ pending: nextPending });
  return upsertTaskRun({ id: run.id, status: 'ignored', stage: 'ignored', progress: 100, stageLabel: '已忽略', retryable: false });
}

const BOSS_URL_PATTERN = /^https:\/\/(?:www|app)\.zhipin\.com\//i;
const NO_RECEIVER_PATTERN = /Could not establish connection|Receiving end does not exist|message port closed|No tab with id/i;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function receiverMatchesExpectedVersion(probe) {
  return Boolean(probe?.ok
    && probe.contentVersion === EXPECTED_CONTENT_VERSION
    && probe.contentBuild === EXPECTED_CONTENT_BUILD
    && probe.contentFile === CONTENT_SCRIPT_FILE);
}

async function waitForTabReady(tabId, timeout = BOSS_TAB_READY_TIMEOUT_MS) {
  if (!chrome.tabs?.get) {
    await wait(500);
    return null;
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const tab = await withTimeout(chrome.tabs.get(tabId), 1200, '读取 BOSS 标签页').catch(() => null);
    if (tab?.status === 'complete') return tab;
    await wait(160);
  }
  return withTimeout(chrome.tabs.get(tabId), 1200, '读取 BOSS 标签页').catch(() => null);
}

async function reloadBossTab(tab, reason = 'runtime-refresh') {
  if (!tab?.id || !chrome.tabs?.reload) return tab;
  await withTimeout(chrome.tabs.reload(tab.id, { bypassCache: true }), 2500, '刷新 BOSS 页面');
  const ready = await waitForTabReady(tab.id, BOSS_TAB_READY_TIMEOUT_MS);
  if (!ready || ready.status !== 'complete') throw timeoutError('等待 BOSS 页面加载', BOSS_TAB_READY_TIMEOUT_MS);
  await writeEvent('info', 'BOSS 页面助手已自动刷新', { reason, tabId: tab.id, contentVersion: EXPECTED_CONTENT_VERSION, contentBuild: EXPECTED_CONTENT_BUILD }).catch(() => {});
  return ready;
}

async function refreshBossTabsForRuntimeVersion() {
  const key = 'bossContentRuntimeBuild';
  const current = await storage.get(key);
  const expectedRuntime = `${EXPECTED_CONTENT_VERSION}:${EXPECTED_CONTENT_BUILD}`;
  if (current?.[key] === expectedRuntime) return;
  await storage.set({ [key]: expectedRuntime });
  if (!chrome.tabs?.query || !chrome.tabs?.reload) return;
  const tabs = await chrome.tabs.query({ url: ['https://www.zhipin.com/*', 'https://app.zhipin.com/*'] }).catch(() => []);
  for (const tab of tabs || []) {
    if (!tab?.id) continue;
    await chrome.tabs.reload(tab.id, { bypassCache: true }).catch(() => {});
  }
}

async function activeBossTab() {
  const activeCurrent = await withTimeout(chrome.tabs.query({
    active: true,
    currentWindow: true,
    url: ['https://www.zhipin.com/*', 'https://app.zhipin.com/*']
  }), 1800, '查找当前 BOSS 页面').catch(() => []);
  if (activeCurrent?.[0]) return activeCurrent[0];
  const tabs = await withTimeout(chrome.tabs.query({
    url: ['https://www.zhipin.com/*', 'https://app.zhipin.com/*']
  }), 1800, '查找 BOSS 页面').catch(() => []);
  return [...(tabs || [])].sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))[0] || null;
}

function bossConnectionError(error) {
  const message = String(error?.message || error || '');
  if (NO_RECEIVER_PATTERN.test(message)) {
    return 'BOSS 页面连接尚未就绪，JobClaw 已尝试自动修复。请刷新当前 BOSS 页面后再点一次开始。';
  }
  if (/Cannot access contents of url|The extensions gallery cannot be scripted|Missing host permission/i.test(message)) {
    return '当前页面无法接入 JobClaw。请确认打开的是 BOSS 直聘岗位页或沟通页。';
  }
  return message || 'BOSS 页面连接失败';
}

async function probeBossReceiver(tab) {
  return withTimeout(
    chrome.tabs.sendMessage(tab.id, { type: 'PROBE', expectedContentVersion: EXPECTED_CONTENT_VERSION, expectedContentBuild: EXPECTED_CONTENT_BUILD }),
    BOSS_PROBE_TIMEOUT_MS,
    '连接 BOSS 页面助手'
  );
}

async function injectBossContent(tab) {
  if (!chrome.scripting?.executeScript) throw new Error('扩展缺少页面注入能力，请重新加载最新版 JobClaw');
  await withTimeout(chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [CONTENT_SCRIPT_FILE]
  }), 3200, '注入 BOSS 页面助手');
}

async function ensureBossReceiver(tab) {
  if (!tab?.id) throw new Error('请先打开并登录 BOSS 直聘');
  if (!BOSS_URL_PATTERN.test(String(tab.url || ''))) {
    throw new Error('请切换到 BOSS 直聘岗位页或沟通页');
  }

  const startedAt = Date.now();
  const remaining = () => Math.max(800, STARTUP_TOTAL_TIMEOUT_MS - (Date.now() - startedAt));
  let probe = null;
  try {
    probe = await withTimeout(probeBossReceiver(tab), Math.min(BOSS_PROBE_TIMEOUT_MS + 300, remaining()), '检查 BOSS 页面助手');
    if (receiverMatchesExpectedVersion(probe)) return probe;
  } catch (error) {
    const message = String(error?.message || error);
    if (!NO_RECEIVER_PATTERN.test(message) && error?.code !== 'JOBCLAW_TIMEOUT') {
      throw new Error(bossConnectionError(error));
    }
  }

  // 没有接收器时先尝试轻量注入，避免一上来整页刷新导致长时间停在“连接中”。
  if (!probe?.ok) {
    await injectBossContent(tab).catch(() => null);
    await wait(220);
    const injectedProbe = await probeBossReceiver(tab).catch(() => null);
    if (receiverMatchesExpectedVersion(injectedProbe)) return injectedProbe;
    probe = injectedProbe || probe;
  }

  // 能响应但版本不一致，或者注入后仍未就绪，最多刷新一次。
  if (!receiverMatchesExpectedVersion(probe)) {
    tab = await withTimeout(reloadBossTab(tab, `startup-${probe?.contentVersion || 'missing'}`), Math.min(BOSS_TAB_READY_TIMEOUT_MS + 2800, remaining()), '刷新并连接 BOSS 页面');
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (remaining() <= 900) break;
    await wait(220 + attempt * 180);
    const currentProbe = await probeBossReceiver(tab).catch(() => null);
    if (receiverMatchesExpectedVersion(currentProbe)) return currentProbe;
  }
  throw new Error(`BOSS 页面助手连接超时。请刷新当前 BOSS 页面，确认页面加载完成后点击“重新连接”。需要 ${EXPECTED_CONTENT_VERSION} / ${EXPECTED_CONTENT_BUILD}`);
}

async function sendToBossTab(tab, message) {
  await ensureBossReceiver(tab);
  try {
    return await withTimeout(chrome.tabs.sendMessage(tab.id, message), BOSS_COMMAND_TIMEOUT_MS, '向 BOSS 页面发送任务');
  } catch (error) {
    if (!NO_RECEIVER_PATTERN.test(String(error?.message || error)) && error?.code !== 'JOBCLAW_TIMEOUT') {
      throw new Error(bossConnectionError(error));
    }
    tab = await reloadBossTab(tab, 'message-receiver-lost');
    await ensureBossReceiver(tab);
    try {
      return await withTimeout(chrome.tabs.sendMessage(tab.id, message), BOSS_COMMAND_TIMEOUT_MS, '重新发送 BOSS 页面任务');
    } catch (retryError) {
      throw new Error(bossConnectionError(retryError));
    }
  }
}

async function sendToBoss(message) {
  const tab = await activeBossTab();
  if (!tab) throw new Error('请先打开并登录 BOSS 直聘');
  return sendToBossTab(tab, message);
}

async function broadcastBossControl(type, payload = {}) {
  if (!chrome.tabs?.query) return [];
  const tabs = await chrome.tabs.query({ url: ['https://www.zhipin.com/*', 'https://app.zhipin.com/*'] }).catch(() => []);
  return Promise.allSettled((tabs || []).filter(tab => tab?.id).map(tab =>
    withTimeout(chrome.tabs.sendMessage(tab.id, { type, ...payload }), 900, `发送${type}`).catch(() => null)
  ));
}

async function nativeBridge(path, body) {
  if (!chrome.runtime?.sendNativeMessage) throw new Error('当前 Chrome 不支持 Native Messaging');
  const response = await chrome.runtime.sendNativeMessage(NATIVE_BRIDGE_HOST, { path, body: body ?? null });
  if (!response || response.ok === false) throw new Error(response?.error || '本地桥接没有返回结果');
  const payload = response.payload && typeof response.payload === 'object' ? response.payload : response;
  return { ...payload, _transport: 'native' };
}

async function bridge(path, body) {
  const failures = [];
  const timeoutMs = path === '/parse-resume' ? 190000 : path === '/company/verify' ? 3500 : path === '/status' ? 3000 : 8000;
  for (const base of BRIDGE_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `本地桥接返回 HTTP ${response.status}`);
      bridgeUnavailableUntil = 0;
      bridgeLastError = '';
      return { ...payload, _transport: 'http', _endpoint: base };
    } catch (error) {
      failures.push(`${base} ${error?.name === 'AbortError' ? '连接超时' : String(error?.message || error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  try {
    const payload = await nativeBridge(path, body);
    bridgeUnavailableUntil = 0;
    bridgeLastError = '';
    return payload;
  } catch (error) {
    failures.push(`Native Messaging ${String(error?.message || error)}`);
    bridgeLastError = String(error?.message || error);
    if (path === '/company/verify') bridgeUnavailableUntil = Date.now() + 5 * 60 * 1000;
  }
  throw new Error(`OpenClaw 桌面桥接未连接。请双击“install-openclaw-macos.command”完成安装或修复。${failures.length ? ` 诊断：${failures.join('；')}` : ''}`);
}

async function diagnoseBridge() {
  const attempts = [];
  for (const base of BRIDGE_ENDPOINTS) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${base}/status`, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      attempts.push({ transport: 'http', endpoint: base, ok: response.ok, elapsedMs: Date.now() - startedAt, status: response.status, payload });
      if (response.ok) return { ok: true, transport: 'http', runtimeId: chrome.runtime.id, attempts, status: payload };
    } catch (error) {
      attempts.push({ transport: 'http', endpoint: base, ok: false, elapsedMs: Date.now() - startedAt, error: error?.name === 'AbortError' ? '连接超时' : String(error?.message || error) });
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    const status = await nativeBridge('/status');
    attempts.push({ transport: 'native', host: NATIVE_BRIDGE_HOST, ok: true });
    return { ok: true, transport: 'native', runtimeId: chrome.runtime.id, attempts, status };
  } catch (error) {
    attempts.push({ transport: 'native', host: NATIVE_BRIDGE_HOST, ok: false, error: String(error?.message || error) });
  }
  return {
    ok: false,
    runtimeId: chrome.runtime.id,
    expectedRuntimeId: 'dkfilgjiooigjbollljdionbnnofekkh',
    attempts,
    fix: '退出旧桥接后 双击项目根目录的“install-openclaw-macos.command” 安装完成后回到扩展点击检测连接',
    logPaths: ['~/.jobclaw/bridge.log', '~/.jobclaw/bridge-error.log']
  };
}

function bridgeSnapshot(all = {}) {
  const config = all.config || {};
  const pending = Array.isArray(all.pending) ? all.pending : [];
  const taskRuns = Array.isArray(all.taskRuns) ? all.taskRuns : [];
  return {
    ts: Date.now(),
    stats: { ...(all.stats || {}) },
    workflow: {
      running: Boolean(all.workflow?.running),
      paused: Boolean(all.workflow?.paused),
      phase: String(all.workflow?.phase || 'idle'),
      statusText: String(all.workflow?.statusText || '')
    },
    queue: {
      waiting: pending.filter(item => ['pending', 'approved_queue', 'approved'].includes(item.status)).length,
      sent: pending.filter(item => item.status === 'sent').length,
      failed: pending.filter(item => item.status === 'failed').length
    },
    recentRuns: taskRuns.filter(() => true).slice(0, 30).map(run => ({
      status: run.status,
      stageLabel: run.stageLabel,
      job: run.job ? { title: run.job.title || '', company: run.job.company || '' } : null,
      updatedAt: run.updatedAt || run.completedAt || run.createdAt || 0
    })),
    config: {
      batchStrategy: normalizeStrategy(config.batchStrategy),
      massApplyAnalysis: config.massApplyAnalysis || 'auto-ai',
      pacingPreset: config.pacingPreset || 'standard',
      dailyTarget: Number(config.dailyTarget || 30),
      dailyReportEnabled: config.dailyReportEnabled !== false,
      dailyReportTime: String(config.dailyReportTime || '20:30'),
      dailyReportNotification: config.dailyReportNotification !== false
    }
  };
}

async function syncBridgeSnapshot(force = false) {
  if (!force && Date.now() - lastBridgeSnapshotAt < 55 * 1000) return { skipped: true };
  lastBridgeSnapshotAt = Date.now();
  const snapshot = bridgeSnapshot(await storage.all());
  return bridge('/sync', { snapshot });
}

async function enforceRateLimit(scope = 'discovery') {
  const { config = {}, safetyState = {} } = await storage.get(['config', 'safetyState']);
  const now = Date.now();
  const decision = computeRateLimitDecision(config, safetyState, scope, now);
  if (!decision.allowed) {
    await patchWorkflow({ running: false, paused: true, statusText: decision.reason || '安全熔断已开启' });
    return { ok: false, ...decision };
  }
  const reservedAt = now + Number(decision.waitMs || 0);
  const nextState = recordRateAction(safetyState, scope, reservedAt, Number(decision.waitMs || 0) > 0);
  await storage.set({ safetyState: nextState });
  return { ok: true, ...decision, reservedAt };
}

async function applySafetyOutcome(outcome = {}) {
  const { config = {}, safetyState = {} } = await storage.get(['config', 'safetyState']);
  const next = recordSafetyOutcome(config, safetyState, outcome);
  await storage.set({ safetyState: next });
  if (next.circuitOpen) {
    await patchWorkflow({
      running: false,
      paused: true,
      phase: 'safety_stop',
      pendingApplyId: null,
      chatRecovery: null,
      statusText: `安全熔断：${next.circuitReason || '连续任务失败'}`
    });
    await writeEvent('warning', '安全熔断已开启', { reason: next.circuitReason, failures: next.consecutiveFailures });
    chrome.notifications.create(`jobclaw-safety-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'JobClaw 已安全暂停',
      message: next.circuitReason || '连续任务失败，请检查页面后手动恢复'
    }).catch(() => {});
  }
  return next;
}

async function clearSafetyCircuit() {
  const { safetyState = {} } = await storage.get('safetyState');
  const next = resetSafetyCircuit(safetyState);
  await storage.set({ safetyState: next });
  await writeEvent('info', '安全熔断已重置');
  return next;
}

async function probeAndRepairBossPage({ resume = false } = {}) {
  let tab = await activeBossTab();
  if (!tab) throw new Error('请先打开并登录 BOSS 直聘');
  const probe = await ensureBossReceiver(tab);
  if (probe?.verification || probe?.pageType === 'verification') {
    throw new Error('检测到 BOSS 安全验证 请先在页面完成验证');
  }

  const stored = await storage.get(['workflow', 'pending']);
  let workflow = { ...DEFAULTS.workflow, ...(stored.workflow || {}) };
  const hasActiveDelivery = Boolean(workflow.pendingApplyId);
  const probeHasCapabilities = probe && ['hasSearch', 'hasDetail', 'hasChat', 'cards'].some(key => Object.prototype.hasOwnProperty.call(probe, key));
  const unusablePage = probe?.pageType === 'other'
    || (probeHasCapabilities && !probe?.hasSearch && !probe?.hasDetail && !probe?.hasChat && Number(probe?.cards || 0) <= 0);
  const staleChatPage = probe?.pageType === 'chat' && !hasActiveDelivery;
  let navigated = false;

  if (unusablePage || staleChatPage) {
    await chrome.tabs.update(tab.id, { url: BOSS_JOBS_HOME_URL });
    navigated = true;
  }

  if (!resume) {
    return {
      pageType: probe?.pageType || 'unknown',
      navigated,
      message: navigated ? '已自动切换到 BOSS 职位页 请等待页面加载' : `页面连接正常 · ${probe?.pageType || 'unknown'}`,
      probe
    };
  }

  await clearSafetyCircuit();
  let dispatched = { started: false };
  if (!workflow.pendingApplyId && !navigated) {
    dispatched = await dispatchNextAutoPending().catch(() => ({ started: false }));
    workflow = { ...DEFAULTS.workflow, ...((await storage.get('workflow')).workflow || {}) };
  }
  const hasQueued = (stored.pending || []).some(entry => entry.status === 'approved_queue');
  const hasWork = Boolean(workflow.pendingApplyId)
    || hasQueued
    || (Array.isArray(workflow.tasks) && workflow.tasks.length > Number(workflow.taskIndex || 0));
  if (!hasWork) {
    return { pageType: probe?.pageType || 'unknown', navigated, resumed: false, message: '熔断已重置 但当前没有可继续的任务' };
  }

  workflow = await patchWorkflow({
    running: true,
    paused: false,
    phase: workflow.pendingApplyId ? 'apply' : 'search',
    chatRecovery: null,
    statusText: workflow.pendingApplyId ? '已重置并继续当前投递队列' : '已重置并从上次进度继续采集'
  });
  if (navigated) {
    setTimeout(async () => {
      const queued = await dispatchNextAutoPending().catch(() => ({ started: false }));
      if (!queued?.started) sendToBoss({ type: 'RUN' }).catch(() => {});
    }, 1800);
  } else if (!dispatched?.started) {
    tab = await activeBossTab();
    if (tab) await sendToBossTab(tab, { type: 'RUN' });
  }
  await writeEvent('info', '已完成页面检测并继续任务', { pageType: probe?.pageType, navigated, pendingApplyId: workflow.pendingApplyId || '' });
  return {
    pageType: probe?.pageType || 'unknown',
    navigated,
    resumed: true,
    message: navigated ? '已重置并切换到职位页 页面加载后自动继续' : '已重置并从断点继续任务'
  };
}

async function verifyCompanyForJob(job = {}, force = false) {
  const { config = {}, companyVerificationCache = {} } = await storage.get(['config', 'companyVerificationCache']);
  const fallback = heuristicCompanyVerification(job);
  if (config.companyVerificationEnabled === false) {
    return { ...fallback, provider: 'disabled', status: 'disabled', verified: false, riskLevel: fallback.riskLevel === 'high' ? 'high' : 'unknown' };
  }
  const key = companyCacheKey(job.company);
  const cached = companyVerificationCache[key];
  if (!force && cached && !companyVerificationExpired(cached, config.companyVerificationCacheDays || 14)) {
    return { ...cached, cacheHit: true };
  }
  let providerResult = null;
  if (config.companyVerificationProvider !== 'local' && Date.now() < bridgeUnavailableUntil) {
    providerResult = {
      provider: 'bridge-cooldown',
      status: 'unavailable',
      verified: false,
      riskLevel: 'unknown',
      confidence: 0,
      signals: [`OpenClaw暂不可用 已在本地快速降级 ${bridgeLastError || ''}`.trim()],
      evidence: [],
      checkedAt: Date.now()
    };
  }
  if (config.companyVerificationProvider !== 'local' && !providerResult) {
    const throttle = await enforceRateLimit('company');
    if (throttle.ok && throttle.waitMs) await wait(throttle.waitMs);
    try {
      const response = await bridge('/company/verify', {
        provider: config.companyVerificationProvider || 'bridge',
        companyName: job.company || '',
        job: {
          title: job.title || '',
          company: job.company || '',
          location: job.location || '',
          description: job.description || job.cardText || '',
          url: job.url || ''
        }
      });
      providerResult = response?.result || response;
    } catch (error) {
      providerResult = {
        provider: 'bridge-unavailable',
        status: 'unavailable',
        verified: false,
        riskLevel: 'unknown',
        confidence: 0,
        signals: [`企业数据源暂不可用：${error.message}`],
        evidence: []
      };
    }
  }
  const merged = mergeCompanyVerification(providerResult || {}, fallback);
  const nextCache = { ...companyVerificationCache, [key]: merged };
  const entries = Object.entries(nextCache).sort((a, b) => Number(b[1]?.checkedAt || 0) - Number(a[1]?.checkedAt || 0)).slice(0, 500);
  await storage.set({ companyVerificationCache: Object.fromEntries(entries) });
  return { ...merged, cacheHit: false };
}

async function preflightJob(job = {}) {
  const stored = await storage.get(['config', 'pending', 'deliveryHistory', 'jobSeenHistory']);
  const config = stored.config || {};
  const pending = stored.pending || [];
  const deliveryHistory = stored.deliveryHistory || [];
  const jobSeenHistory = Array.isArray(stored.jobSeenHistory) ? stored.jobSeenHistory : [];
  const duplicate = findDuplicate(job, {
    pending,
    history: deliveryHistory,
    maxPerCompanyPerDay: config.maxPerCompanyPerDay || 2,
    date: today()
  });
  const fingerprintedJob = { ...job, jobFingerprint: duplicate.fingerprint || '' };
  if (duplicate.duplicate) {
    await changeStats({ duplicates: 1, blocked: 1 });
    return { ok: true, blocked: true, category: 'duplicate', reason: duplicate.reason, duplicate };
  }

  const seenDuplicate = findSeenDuplicate(fingerprintedJob, jobSeenHistory, {
    windowDays: config.dedupeWindowDays || 30
  });
  if (seenDuplicate?.duplicate) {
    await changeStats({ duplicates: 1, blocked: 1 });
    return {
      ok: true,
      blocked: true,
      category: 'duplicate',
      reason: seenDuplicate.reason,
      duplicate: { ...duplicate, ...seenDuplicate }
    };
  }

  const quality = evaluateJobQuality(fingerprintedJob);
  const lowQualityBlocked = config.lowQualityPolicy === 'skip-obvious'
    && (quality.hardSignals.length > 0 || quality.score < Number(config.lowQualityThreshold ?? 24));
  const now = Date.now();
  const cutoff = now - Math.max(1, Number(config.dedupeWindowDays || 30)) * 86400000;
  const nextSeen = [
    ...jobSeenHistory.filter(entry => Number(entry.seenAt || entry.createdAt || 0) >= cutoff),
    createSeenJobEntry(fingerprintedJob, quality, now, { status: lowQualityBlocked ? 'low-quality' : 'accepted-preflight' })
  ].slice(-4000);
  await storage.set({ jobSeenHistory: nextSeen });

  if (lowQualityBlocked) {
    await changeStats({ lowQuality: 1, blocked: 1 });
    return {
      ok: true,
      blocked: true,
      category: 'low-quality',
      reason: quality.hardSignals[0] || quality.signals[0] || `岗位质量分较低 ${quality.score}`,
      quality,
      duplicate
    };
  }

  const company = await verifyCompanyForJob(fingerprintedJob);
  const blockUnknown = Boolean(config.blockUnknownCompanies);
  const blocked = company.riskLevel === 'high' || (blockUnknown && company.riskLevel === 'unknown');
  await changeStats(blocked ? { blocked: 1 } : company.verified ? { verified: 1 } : {});
  return {
    ok: true,
    blocked,
    category: blocked ? 'company-risk' : 'accepted',
    reason: blocked ? (company.signals?.[0] || '企业核验未通过') : '',
    company,
    quality,
    duplicate
  };
}


async function checkForUpdates(force = false) {
  const currentVersion = chrome.runtime.getManifest().version;
  const { config = {}, updateInfo = {} } = await storage.get(['config', 'updateInfo']);
  if (config.updateCheckEnabled === false && !force) return updateInfo;
  if (!force && Number(updateInfo.checkedAt || 0) && Date.now() - Number(updateInfo.checkedAt) < 6 * 60 * 60 * 1000) return updateInfo;
  try {
    const response = await fetch('https://api.github.com/repos/Chrisbetheking/job-claw/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      credentials: 'omit'
    });
    if (response.status === 404) {
      const next = { ...DEFAULTS.updateInfo, currentVersion, checkedAt: Date.now(), error: '仓库暂未发布正式 Release' };
      await storage.set({ updateInfo: next });
      return next;
    }
    if (!response.ok) throw new Error(`GitHub Release HTTP ${response.status}`);
    const next = normalizeRelease(await response.json(), currentVersion);
    const wasAvailable = Boolean(updateInfo.available && updateInfo.latestVersion === next.latestVersion);
    await storage.set({ updateInfo: next });
    if (next.available && !wasAvailable) {
      chrome.notifications.create(`jobclaw-update-${next.latestVersion}`, {
        type: 'basic',
        iconUrl: 'icon128.png',
        title: `JobClaw ${next.latestVersion} 可更新`,
        message: next.name || '发现新的正式版本'
      }).catch(() => {});
    }
    return next;
  } catch (error) {
    const next = { ...updateInfo, currentVersion, checkedAt: Date.now(), error: error.message || '更新检查失败' };
    await storage.set({ updateInfo: next });
    return next;
  }
}

function extractJson(raw) {
  let text = String(raw || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  text = text.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(text);
}

function aiError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function aiFailureKind(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === 'AI_CONFIG' || /API Key|未配置|401|unauthorized/i.test(message)) return 'config-missing';
  if (['AI_NETWORK', 'AI_HTTP', 'AI_TIMEOUT'].includes(code) || /HTTP|fetch|网络|超时|服务不可用/i.test(message)) return 'service-error';
  return 'output-invalid';
}

function isRetryableAiOutputError(error) {
  return ['AI_TRUNCATED', 'AI_EMPTY', 'AI_INVALID_JSON', 'AI_PROFILE_INCOMPLETE'].includes(String(error?.code || ''));
}

async function requestModel(url, payload, apiKey = '', timeoutMs = 90000) {
  const controller = new AbortController();
  activeAiControllers.add(controller);
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (String(apiKey || '').trim()) headers.Authorization = `Bearer ${apiKey}`;
    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const reason = String(controller.signal.reason || '');
      if (reason && reason !== 'timeout') throw aiError('AI_ABORTED', 'AI 请求已被暂停或停止');
      throw aiError('AI_TIMEOUT', 'AI 请求超时');
    }
    throw aiError('AI_NETWORK', `AI 网络请求失败：${error?.message || '连接异常'}`);
  } finally {
    clearTimeout(timer);
    activeAiControllers.delete(controller);
  }
}

async function callModel(messages, jsonMode = true, options = {}) {
  const { config = {} } = await storage.get('config');
  const route = chooseAiRoute(options.forceRoute ? { ...config, aiProviderMode: options.forceRoute } : config);
  if (route.route === 'rules') throw aiError('AI_CONFIG', route.reason || '未配置 AI 服务');
  const selected = route.route === 'local' ? (config.localModel || {}) : (config.model || {});
  const fallbackBase = route.route === 'local' ? 'http://127.0.0.1:11434/v1' : 'https://api.deepseek.com';
  const fallbackModel = route.route === 'local' ? 'qwen3:1.7b' : 'deepseek-v4-flash';
  const url = `${String(selected.baseUrl || fallbackBase).replace(/\/$/, '')}/chat/completions`;
  const payload = {
    model: selected.model || fallbackModel,
    messages,
    temperature: Number(options.temperature ?? selected.temperature ?? 0.2),
    max_tokens: Number(options.maxTokens ?? 2800)
  };
  if (jsonMode) payload.response_format = { type: 'json_object' };

  let response = await requestModel(url, payload, selected.apiKey || '', Number(options.timeoutMs || (route.route === 'local' ? 120000 : 90000)));
  let bodyText = await response.text();
  if (!response.ok && jsonMode && [400, 404, 422].includes(response.status) && /response[_ -]?format|json_object|unsupported/i.test(bodyText)) {
    const retryPayload = { ...payload };
    delete retryPayload.response_format;
    response = await requestModel(url, retryPayload, selected.apiKey || '', Number(options.timeoutMs || (route.route === 'local' ? 120000 : 90000)));
    bodyText = await response.text();
  }
  if (!response.ok) throw aiError('AI_HTTP', `AI 请求失败 HTTP ${response.status}: ${bodyText.substring(0, 500)}`, { status: response.status, route: route.route });

  let result;
  try { result = JSON.parse(bodyText); }
  catch { throw aiError('AI_INVALID_RESPONSE', 'AI 接口返回了无法识别的响应', { route: route.route }); }
  const choice = result.choices?.[0];
  const content = String(choice?.message?.content || '').trim();
  if (!content) throw aiError('AI_EMPTY', 'AI 返回为空', { route: route.route });
  if (choice.finish_reason === 'length') throw aiError('AI_TRUNCATED', 'AI 输出被截断', { finishReason: choice.finish_reason, partial: content, route: route.route });
  if (!jsonMode) return content;
  try {
    const parsed = extractJson(content);
    Object.defineProperty(parsed, '__aiRoute', { value: route.route, enumerable: false });
    return parsed;
  } catch (error) {
    throw aiError('AI_INVALID_JSON', `AI 返回 JSON 不完整：${error?.message || '解析失败'}`, { partial: content, route: route.route });
  }
}

function cleanResumeText(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function lineMatches(text, pattern, limit = 6) {
  return uniq(cleanResumeText(text)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length >= 4 && line.length <= 180 && pattern.test(line)))
    .slice(0, limit);
}

function extractSkills(text) {
  const source = cleanResumeText(text);
  const catalog = [
    ['JavaScript', /\bjavascript\b|\bjs\b/i],
    ['TypeScript', /\btypescript\b|\bts\b/i],
    ['HTML', /\bhtml5?\b/i],
    ['CSS', /\bcss3?\b|sass|less/i],
    ['Vue', /\bvue(?:\.js|3|2)?\b/i],
    ['React', /\breact(?:\.js)?\b/i],
    ['Next.js', /\bnext\.?js\b/i],
    ['Node.js', /\bnode\.?js\b/i],
    ['Express', /\bexpress\b/i],
    ['Vite', /\bvite\b/i],
    ['Webpack', /\bwebpack\b/i],
    ['Tailwind CSS', /\btailwind\b/i],
    ['ECharts', /\becharts\b/i],
    ['D3.js', /\bd3(?:\.js)?\b/i],
    ['Tauri', /\btauri\b/i],
    ['Electron', /\belectron\b/i],
    ['Chrome Extension', /chrome\s*(?:extension|扩展)|浏览器扩展/i],
    ['Python', /\bpython\b/i],
    ['Java', /\bjava\b/i],
    ['C/C++', /\bc\+\+\b|\bc语言\b/i],
    ['Go', /\bgolang\b|\bgo语言\b/i],
    ['SQL', /\bsql\b/i],
    ['MySQL', /\bmysql\b/i],
    ['PostgreSQL', /\bpostgres(?:ql)?\b/i],
    ['Redis', /\bredis\b/i],
    ['Spring Boot', /spring\s*boot/i],
    ['Flask', /\bflask\b/i],
    ['Django', /\bdjango\b/i],
    ['FastAPI', /\bfastapi\b/i],
    ['Git', /\bgit\b|github/i],
    ['Docker', /\bdocker\b/i],
    ['Linux', /\blinux\b/i],
    ['Playwright', /\bplaywright\b/i],
    ['Selenium', /\bselenium\b/i],
    ['PyTorch', /\bpytorch\b/i],
    ['TensorFlow', /\btensorflow\b/i],
    ['OpenCV', /\bopencv\b/i],
    ['RAG', /\brag\b|检索增强生成/i],
    ['LLM', /\bllm\b|大语言模型|语言模型/i],
    ['AI Agent', /ai\s*agent|智能体/i],
    ['OCR', /\bocr\b|文字识别/i],
    ['数据可视化', /数据可视化|可视化看板/i]
  ];
  return catalog.filter(([, pattern]) => pattern.test(source)).map(([name]) => name).slice(0, 40);
}

function extractDegree(text) {
  const source = cleanResumeText(text);
  if (/博士|ph\.?d/i.test(source)) return '博士';
  if (/硕士|研究生|master/i.test(source)) return '硕士';
  if (/本科|学士|bachelor/i.test(source)) return '本科';
  if (/大专|专科|associate/i.test(source)) return '大专';
  return '不限';
}

function extractLocations(text) {
  const source = cleanResumeText(text);
  const cities = ['北京','上海','广州','深圳','杭州','成都','西安','南京','武汉','苏州','重庆','天津','长沙','郑州','青岛','厦门','合肥','济南','宁波','东莞','珠海','佛山','无锡','兰州','太原','南阳','东京','大阪'];
  return cities.filter(city => source.includes(city)).slice(0, 6);
}

function extractExplicitDirections(text) {
  const source = cleanResumeText(text);
  const matches = [];
  const pattern = /(?:求职意向|求职方向|目标岗位|意向岗位|应聘岗位|期望职位)\s*[:：]?\s*([^\n]{2,100})/ig;
  let match;
  while ((match = pattern.exec(source)) && matches.length < 3) {
    matches.push(...String(match[1] || '').split(/[，,、/|]/).map(item => item.trim()).filter(item => item.length >= 2 && item.length <= 28));
  }
  return uniq(matches).slice(0, 3);
}

function inferDirections(text, skills) {
  const source = cleanResumeText(text);
  const explicit = extractExplicitDirections(source);
  if (explicit.length) return explicit;
  const directions = [];
  const has = name => skills.includes(name);
  const internship = /实习|在校|应届|校招/i.test(source);
  if (/前端|web前端|网页开发/i.test(source) || ['JavaScript','TypeScript','Vue','React','HTML','CSS'].some(has)) {
    directions.push(internship ? '前端开发实习生' : '前端开发工程师');
  }
  if (/全栈/i.test(source) || ((has('React') || has('Vue')) && (has('Node.js') || has('Java') || has('Python')))) {
    directions.push(internship ? '全栈开发实习生' : '全栈开发工程师');
  }
  if (/ai应用|人工智能应用|智能体|rag|大模型|llm/i.test(source) || ['RAG','LLM','AI Agent'].some(has)) {
    directions.push(internship ? 'AI 应用开发实习生' : 'AI 应用开发工程师');
  }
  if (/数据可视化|echarts|d3/i.test(source) || has('数据可视化') || has('ECharts') || has('D3.js')) {
    directions.push('数据可视化开发工程师');
  }
  if (/后端|服务端/i.test(source) || ['Spring Boot','Java','Node.js','Python','Go'].filter(has).length >= 2) {
    directions.push(internship ? '后端开发实习生' : '后端开发工程师');
  }
  if (!directions.length) directions.push(internship ? '软件开发实习生' : '软件开发工程师');
  return uniq(directions).slice(0, 3);
}

function buildSearchKeywords(directions, skills) {
  const keywords = [...directions];
  const joined = directions.join(' ');
  if (/前端/.test(joined)) {
    keywords.push('前端开发', 'Web 前端', 'JavaScript 开发');
    if (skills.includes('React')) keywords.push('React 开发');
    if (skills.includes('Vue')) keywords.push('Vue 开发');
    if (skills.includes('TypeScript')) keywords.push('TypeScript 前端');
  }
  if (/全栈/.test(joined)) keywords.push('全栈开发', 'Web 全栈');
  if (/AI 应用/.test(joined)) {
    keywords.push('AI 应用开发');
    if (skills.includes('RAG')) keywords.push('RAG 应用开发');
    if (skills.includes('AI Agent')) keywords.push('AI Agent 开发');
  }
  if (/数据可视化/.test(joined)) keywords.push('数据可视化', '可视化前端');
  if (/后端/.test(joined)) keywords.push('后端开发', '服务端开发');
  return uniq(keywords).slice(0, 12);
}

function explainProfileFallbackReason(reason = '', kind = '') {
  const message = String(reason || '').trim();
  const resolvedKind = kind || aiFailureKind({ message });
  if (!message) return '';
  if (resolvedKind === 'config-missing') {
    return 'AI 尚未配置；本次未调用 AI，当前初稿全部来自本地规则。';
  }
  if (resolvedKind === 'service-error') {
    return 'AI 请求没有成功；本次画像未使用 AI，当前初稿全部来自本地规则。';
  }
  return 'AI 连接可用，但返回内容未通过完整性校验；系统已自动精简重试，仍未成功，因此本次初稿全部来自本地规则。';
}

function validateGeneratedProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw aiError('AI_PROFILE_INCOMPLETE', 'AI 画像字段不完整');
  }
  const directions = normalizeStringList(profile.primaryDirections, 3);
  const keywords = normalizeStringList(profile.searchKeywords, 12);
  const summary = String(profile.summary || '').trim();
  if (!directions.length || !keywords.length || summary.length < 12) {
    throw aiError('AI_PROFILE_INCOMPLETE', 'AI 画像字段不完整');
  }
  if (!profile.facts || typeof profile.facts !== 'object' || Array.isArray(profile.facts)) {
    throw aiError('AI_PROFILE_INCOMPLETE', 'AI 画像字段不完整');
  }
  if (!profile.hardConstraints || typeof profile.hardConstraints !== 'object' || Array.isArray(profile.hardConstraints)) {
    throw aiError('AI_PROFILE_INCOMPLETE', 'AI 画像字段不完整');
  }
  return profile;
}

function validateCompactGeneratedProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw aiError('AI_PROFILE_INCOMPLETE', 'AI 精简画像字段不完整');
  }
  const normalized = {
    summary: String(profile.summary || '').trim(),
    primaryDirections: normalizeStringList(profile.primaryDirections, 3),
    searchKeywords: normalizeStringList(profile.searchKeywords, 12),
    skills: normalizeStringList(profile.skills, 30),
    locations: normalizeStringList(profile.locations, 20),
    employmentTypes: normalizeStringList(profile.employmentTypes, 10),
    salary: String(profile.salary || '').trim(),
    experience: String(profile.experience || '').trim(),
    degree: String(profile.degree || '').trim(),
    excludeDirections: normalizeStringList(profile.excludeDirections, 20)
  };
  if (!normalized.primaryDirections.length || !normalized.searchKeywords.length || normalized.summary.length < 12) {
    throw aiError('AI_PROFILE_INCOMPLETE', 'AI 精简画像字段不完整');
  }
  return normalized;
}

function buildLocalProfile(resumeText, reason = '', failureKind = '') {
  const text = cleanResumeText(resumeText);
  if (text.length < 30) throw new Error('简历内容太少，暂时无法生成职业画像');
  const skills = extractSkills(text);
  const primaryDirections = inferDirections(text, skills);
  const searchKeywords = buildSearchKeywords(primaryDirections, skills);
  const degree = extractDegree(text);
  const locations = extractLocations(text);
  const internship = /实习|在校|应届|校招/i.test(text);
  const employmentTypes = internship ? ['实习', '校招'] : ['全职'];
  const experience = internship ? '在校/应届' : '按岗位要求匹配';
  const topSkills = skills.slice(0, 7);
  const summaryParts = [];
  if (degree !== '不限') summaryParts.push(`${degree}${internship ? '在读或应届' : '背景'}`);
  if (topSkills.length) summaryParts.push(`具备 ${topSkills.join('、')} 等技能或项目经验`);
  summaryParts.push(`主要关注 ${primaryDirections.join('、')} 方向`);

  const education = lineMatches(text, /大学|学院|本科|硕士|博士|教育经历|专业/i, 6);
  const experiences = lineMatches(text, /实习|工作经历|公司|负责|任职|助理|工程师/i, 8);
  const projects = lineMatches(text, /项目|系统|平台|工作台|GitHub|开发|实现|搭建|设计/i, 10);
  const certificates = lineMatches(text, /证书|CET|英语六级|英语四级|资格|获奖|奖项/i, 6);
  const resolvedKind = failureKind || (reason ? aiFailureKind({ message: reason }) : 'not-requested');

  return normalizeProfile({
    facts: { education, experiences, projects, skills, certificates },
    primaryDirections: primaryDirections.map(name => ({ name, confidence: 0.72, evidence: ['根据简历中的技能、项目和求职阶段生成'] })),
    secondaryDirections: [],
    searchKeywords,
    hardConstraints: {
      locations,
      employmentTypes,
      salary: '不限',
      experience,
      degree
    },
    excludeDirections: [],
    summary: `${summaryParts.join('，')}。`,
    generation: {
      mode: 'local-fallback',
      label: '本地规则初稿',
      aiStatus: resolvedKind,
      warning: explainProfileFallbackReason(reason, resolvedKind),
      technicalReason: String(reason || ''),
      generatedAt: Date.now()
    }
  });
}

function mergeProfileWithFallback(aiProfile, fallbackProfile, generation = null) {
  const ai = aiProfile && typeof aiProfile === 'object' ? aiProfile : {};
  const aiFacts = ai.facts && typeof ai.facts === 'object' ? ai.facts : {};
  const fallbackFacts = fallbackProfile.facts || {};
  const hard = ai.hardConstraints && typeof ai.hardConstraints === 'object' ? ai.hardConstraints : {};
  const fallbackHard = fallbackProfile.hardConstraints || {};
  return normalizeProfile({
    ...fallbackProfile,
    ...ai,
    facts: {
      ...fallbackFacts,
      ...aiFacts,
      education: Array.isArray(aiFacts.education) && aiFacts.education.length ? aiFacts.education : fallbackFacts.education,
      experiences: Array.isArray(aiFacts.experiences) && aiFacts.experiences.length ? aiFacts.experiences : fallbackFacts.experiences,
      projects: Array.isArray(aiFacts.projects) && aiFacts.projects.length ? aiFacts.projects : fallbackFacts.projects,
      skills: normalizeStringList(aiFacts.skills).length ? aiFacts.skills : fallbackFacts.skills,
      certificates: Array.isArray(aiFacts.certificates) && aiFacts.certificates.length ? aiFacts.certificates : fallbackFacts.certificates
    },
    primaryDirections: normalizeStringList(ai.primaryDirections, 3).length ? ai.primaryDirections : fallbackProfile.primaryDirections,
    searchKeywords: normalizeStringList(ai.searchKeywords, 12).length ? ai.searchKeywords : fallbackProfile.searchKeywords,
    hardConstraints: {
      ...fallbackHard,
      ...hard,
      locations: normalizeStringList(hard.locations).length ? hard.locations : fallbackHard.locations,
      employmentTypes: normalizeStringList(hard.employmentTypes).length ? hard.employmentTypes : fallbackHard.employmentTypes,
      salary: String(hard.salary || fallbackHard.salary || '不限'),
      experience: String(hard.experience || fallbackHard.experience || ''),
      degree: String(hard.degree || fallbackHard.degree || '不限')
    },
    summary: String(ai.summary || fallbackProfile.summary),
    generation: generation || {
      mode: 'ai-assisted',
      label: 'AI 完整画像',
      aiStatus: 'success',
      warning: 'AI 返回的完整 JSON 已通过校验；仅对可选空字段使用本地规则补齐。',
      generatedAt: Date.now()
    }
  });
}

function compactProfileToFull(compact, fallback) {
  return {
    facts: {
      ...(fallback.facts || {}),
      skills: compact.skills.length ? compact.skills : fallback.facts?.skills || []
    },
    primaryDirections: compact.primaryDirections,
    secondaryDirections: [],
    searchKeywords: compact.searchKeywords,
    hardConstraints: {
      ...(fallback.hardConstraints || {}),
      locations: compact.locations.length ? compact.locations : fallback.hardConstraints?.locations || [],
      employmentTypes: compact.employmentTypes.length ? compact.employmentTypes : fallback.hardConstraints?.employmentTypes || [],
      salary: compact.salary || fallback.hardConstraints?.salary || '不限',
      experience: compact.experience || fallback.hardConstraints?.experience || '',
      degree: compact.degree || fallback.hardConstraints?.degree || '不限'
    },
    excludeDirections: compact.excludeDirections,
    summary: compact.summary
  };
}

async function buildProfile(resumeText) {
  const text = cleanResumeText(resumeText);
  const fallback = buildLocalProfile(text);
  const schema = '{"facts":{"education":[],"experiences":[],"projects":[],"skills":[],"certificates":[]},"primaryDirections":[{"name":"","confidence":0,"evidence":[]}],"secondaryDirections":[],"searchKeywords":[],"hardConstraints":{"locations":[],"employmentTypes":[],"salary":"","experience":"","degree":""},"excludeDirections":[],"summary":""}';
  let firstError = null;
  try {
    const profile = validateGeneratedProfile(await callModel([
      {
        role: 'system',
        content: `你是严格的职业画像分析器。只能使用简历真实事实，不能根据项目业务场景推断用户职业。主方向最多3个，搜索词必须是真实岗位名称。数组必须精简，教育/经历/项目各最多4条，每条不超过80字，技能最多15个，摘要不超过180字。即使信息不完整，也必须给出可编辑初稿，禁止返回空内容。输出严格 JSON：${schema}`
      },
      { role: 'user', content: text.slice(0, 22000) }
    ], true, { maxTokens: 4200, temperature: 0.05 }));
    return mergeProfileWithFallback(profile, fallback);
  } catch (error) {
    firstError = error;
  }

  // 连接正常但完整画像输出过长、JSON 不完整或字段校验失败时，自动改用精简结构重试。
  if (isRetryableAiOutputError(firstError)) {
    const compactSchema = '{"summary":"","primaryDirections":[],"searchKeywords":[],"skills":[],"locations":[],"employmentTypes":[],"salary":"","experience":"","degree":"","excludeDirections":[]}';
    try {
      const compact = validateCompactGeneratedProfile(await callModel([
        {
          role: 'system',
          content: `你是求职职业画像分析器。只使用简历事实。请输出极简 JSON，不要解释，不要证据长句。摘要120字以内；主方向最多3个；搜索词最多10个；技能最多12个；其余字段简短。输出结构：${compactSchema}`
        },
        { role: 'user', content: text.slice(0, 18000) }
      ], true, { maxTokens: 2200, temperature: 0.05 }));
      return mergeProfileWithFallback(compactProfileToFull(compact, fallback), fallback, {
        mode: 'ai-compact-retry',
        label: 'AI 精简重试结果',
        aiStatus: 'success-after-retry',
        warning: 'AI 连接正常。首次完整画像输出未完成，系统已自动精简重试并成功采用 AI 结果。',
        technicalReason: String(firstError?.message || ''),
        generatedAt: Date.now()
      });
    } catch (retryError) {
      const combined = `${firstError?.message || 'AI 首次输出未通过'}；精简重试：${retryError?.message || '失败'}`;
      return buildLocalProfile(text, combined, aiFailureKind(firstError));
    }
  }

  return buildLocalProfile(text, firstError?.message || 'AI 生成失败', aiFailureKind(firstError));
}


function normalizeStringList(value, limit = 30) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[，,\n]/);
  return uniq(values.map(item => typeof item === 'string' ? item.trim() : String(item?.name || item?.title || '').trim()))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeDirections(value, existing = []) {
  const previous = new Map((Array.isArray(existing) ? existing : []).map(item => {
    const name = typeof item === 'string' ? item : item?.name;
    return [String(name || '').trim(), item];
  }));
  return normalizeStringList(value, 3).map(name => {
    const old = previous.get(name);
    if (old && typeof old === 'object') return { ...old, name };
    return { name, confidence: 1, evidence: ['用户手动编辑'] };
  });
}

function normalizeProfile(incoming, current = null) {
  const base = current && typeof current === 'object' ? current : {};
  const next = incoming && typeof incoming === 'object' ? incoming : {};
  const profile = {
    ...base,
    ...next,
    facts: {
      education: [], experiences: [], projects: [], skills: [], certificates: [],
      ...(base.facts || {}),
      ...(next.facts || {}),
      skills: normalizeStringList(next.facts?.skills ?? base.facts?.skills, 40)
    },
    primaryDirections: normalizeDirections(next.primaryDirections ?? base.primaryDirections, base.primaryDirections),
    secondaryDirections: normalizeStringList(next.secondaryDirections ?? base.secondaryDirections, 10),
    searchKeywords: normalizeStringList(next.searchKeywords ?? base.searchKeywords, 12),
    excludeDirections: normalizeStringList(next.excludeDirections ?? base.excludeDirections, 20),
    hardConstraints: {
      locations: [], employmentTypes: [], salary: '', experience: '', degree: '',
      ...(base.hardConstraints || {}),
      ...(next.hardConstraints || {})
    },
    summary: String(next.summary ?? base.summary ?? '').trim(),
    editedAt: Date.now()
  };
  profile.hardConstraints.locations = normalizeStringList(profile.hardConstraints.locations, 20);
  profile.hardConstraints.employmentTypes = normalizeStringList(profile.hardConstraints.employmentTypes, 10);
  profile.hardConstraints.salary = String(profile.hardConstraints.salary || '').trim();
  profile.hardConstraints.experience = String(profile.hardConstraints.experience || '').trim();
  profile.hardConstraints.degree = String(profile.hardConstraints.degree || '').trim();
  if (!profile.primaryDirections.length) throw new Error('职业画像至少需要一个主方向');
  if (!profile.searchKeywords.length) throw new Error('职业画像至少需要一个岗位搜索词');
  return profile;
}


function profileHasCore(profile) {
  return Boolean(
    normalizeStringList(profile?.primaryDirections, 3).length &&
    normalizeStringList(profile?.searchKeywords, 12).length
  );
}

function normalizeProfileDraft(incoming, fallback = null) {
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const next = incoming && typeof incoming === 'object' ? incoming : {};
  const chooseList = (key, limit = 30) => Object.prototype.hasOwnProperty.call(next, key)
    ? normalizeStringList(next[key], limit)
    : normalizeStringList(base[key], limit);
  const chooseText = key => Object.prototype.hasOwnProperty.call(next, key)
    ? String(next[key] || '').trim()
    : String(base[key] || '').trim();
  return {
    summary: chooseText('summary'),
    primaryDirections: chooseList('primaryDirections', 3),
    searchKeywords: chooseList('searchKeywords', 12),
    skills: chooseList('skills', 40),
    locations: chooseList('locations', 20),
    employmentTypes: chooseList('employmentTypes', 10),
    experience: chooseText('experience'),
    degree: chooseText('degree'),
    salary: chooseText('salary'),
    excludeDirections: chooseList('excludeDirections', 20),
    source: String(next.source || base.source || 'draft'),
    updatedAt: Number(next.updatedAt || Date.now())
  };
}

function profileDraftHasCore(draft) {
  return Boolean(
    normalizeStringList(draft?.primaryDirections, 3).length &&
    normalizeStringList(draft?.searchKeywords, 12).length
  );
}

function profileDraftHasAny(draft) {
  if (!draft || typeof draft !== 'object') return false;
  return Boolean(
    String(draft.summary || '').trim() ||
    normalizeStringList(draft.primaryDirections).length ||
    normalizeStringList(draft.searchKeywords).length ||
    normalizeStringList(draft.skills).length ||
    normalizeStringList(draft.locations).length ||
    normalizeStringList(draft.employmentTypes).length ||
    String(draft.experience || '').trim() ||
    String(draft.degree || '').trim() ||
    String(draft.salary || '').trim() ||
    normalizeStringList(draft.excludeDirections).length
  );
}

function profileToDraft(profile, source = 'generated') {
  const hard = profile?.hardConstraints || {};
  return normalizeProfileDraft({
    summary: profile?.summary || '',
    primaryDirections: normalizeStringList(profile?.primaryDirections, 3),
    searchKeywords: normalizeStringList(profile?.searchKeywords, 12),
    skills: normalizeStringList(profile?.facts?.skills, 40),
    locations: normalizeStringList(hard.locations, 20),
    employmentTypes: normalizeStringList(hard.employmentTypes, 10),
    experience: hard.experience || '',
    degree: hard.degree || '',
    salary: hard.salary || '',
    excludeDirections: normalizeStringList(profile?.excludeDirections, 20),
    source,
    updatedAt: Date.now()
  });
}

function profileFromDraft(draft, currentProfile = null) {
  const normalized = normalizeProfileDraft(draft);
  return normalizeProfile({
    ...(currentProfile || {}),
    summary: normalized.summary,
    primaryDirections: normalized.primaryDirections,
    searchKeywords: normalized.searchKeywords,
    excludeDirections: normalized.excludeDirections,
    facts: {
      ...(currentProfile?.facts || {}),
      skills: normalized.skills
    },
    hardConstraints: {
      ...(currentProfile?.hardConstraints || {}),
      locations: normalized.locations,
      employmentTypes: normalized.employmentTypes,
      experience: normalized.experience,
      degree: normalized.degree,
      salary: normalized.salary
    }
  }, currentProfile);
}


function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeDirectionKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/实习生|工程师|开发|岗位|职位|校招|社招|应届/g, '')
    .replace(/[\s,，/\\|·•()（）【】\[\]_-]+/g, '')
    .trim();
}

function stableDirectionId(name, source = 'profile') {
  const input = `${source}:${normalizeDirectionKey(name) || String(name || '').trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `direction_${(hash >>> 0).toString(36)}`;
}

const DIRECTION_PRESETS = [
  {
    test: /前端|web|react|vue|javascript|typescript/i,
    keywords: ['前端开发实习生', 'Web前端实习生', 'React开发实习生', 'Vue开发实习生'],
    relevantSkills: ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'React', 'Vue', 'Next.js', 'Vite', 'Webpack'],
    gapSkills: ['工程化', '性能优化', '组件库']
  },
  {
    test: /ai应用|人工智能应用|大模型|agent|rag|llm/i,
    keywords: ['AI应用开发实习生', 'AI Agent实习生', 'RAG应用开发实习生', '大模型应用开发实习生'],
    relevantSkills: ['AI Agent', 'RAG', 'Python', 'TypeScript', 'React', 'Node.js', 'OCR'],
    gapSkills: ['Python', '模型评测', '向量数据库']
  },
  {
    test: /全栈|full.?stack|前后端/i,
    keywords: ['全栈开发实习生', 'Web全栈实习生', '前后端开发实习生'],
    relevantSkills: ['JavaScript', 'TypeScript', 'React', 'Vue', 'Node.js', 'Express', 'MySQL'],
    gapSkills: ['后端接口', '数据库', '部署运维']
  },
  {
    test: /开发者工具|研发工具|桌面端|tauri|electron|工具开发/i,
    keywords: ['开发者工具实习生', '研发工具开发实习生', '桌面端开发实习生', '平台工具开发实习生'],
    relevantSkills: ['Tauri', 'Electron', 'TypeScript', 'React', 'Rust', 'Node.js', 'OCR'],
    gapSkills: ['跨平台工程化', '桌面端发布', '系统 API']
  },
  {
    test: /数据可视化|可视化|echarts|大屏/i,
    keywords: ['数据可视化实习生', '前端可视化实习生', 'ECharts开发实习生'],
    relevantSkills: ['ECharts', 'JavaScript', 'TypeScript', 'React', 'Vue', '数据处理'],
    gapSkills: ['图形性能优化', '复杂交互', '可视化工程化']
  },
  {
    test: /后端|java|node|服务端/i,
    keywords: ['后端开发实习生', 'Node.js开发实习生', 'Java开发实习生'],
    relevantSkills: ['Java', 'Node.js', 'Express', 'MySQL', 'Redis', 'Spring'],
    gapSkills: ['数据库', '缓存', '接口设计']
  }
];

function directionPreset(name) {
  return DIRECTION_PRESETS.find(item => item.test.test(String(name || ''))) || null;
}

function normalizedSkillSet(profile = {}) {
  return new Map(normalizeStringList(profile?.facts?.skills, 50).map(skill => [normalizeDirectionKey(skill), skill]));
}

function buildDirectionKeywords(name, profile = {}) {
  const allKeywords = normalizeStringList(profile?.searchKeywords, 30);
  const nameKey = normalizeDirectionKey(name);
  const preset = directionPreset(name);
  const matching = allKeywords.filter(keyword => {
    const key = normalizeDirectionKey(keyword);
    return key && (nameKey.includes(key) || key.includes(nameKey) || [...nameKey].filter(char => key.includes(char)).length >= Math.min(3, nameKey.length));
  });
  return uniq([name, ...matching, ...(preset?.keywords || [])]).filter(Boolean).slice(0, 8);
}

function buildDirectionEvidence(name, candidate = {}, profile = {}) {
  const skills = normalizeStringList(profile?.facts?.skills, 30);
  const skillMap = normalizedSkillSet(profile);
  const preset = directionPreset(name);
  const relevant = (preset?.relevantSkills || skills).filter(skill => {
    const key = normalizeDirectionKey(skill);
    return skillMap.has(key) || skills.some(current => normalizeDirectionKey(current).includes(key) || key.includes(normalizeDirectionKey(current)));
  });
  const matchedSkills = uniq(relevant.length ? relevant : skills.slice(0, 4)).slice(0, 5);
  const gaps = (preset?.gapSkills || []).filter(skill => {
    const key = normalizeDirectionKey(skill);
    return ![...skillMap.keys()].some(existing => existing.includes(key) || key.includes(existing));
  }).slice(0, 3);
  const evidence = normalizeStringList(candidate?.evidence, 3);
  const reason = evidence.length
    ? `职业画像中已提取到：${evidence.join('；')}`.slice(0, 160)
    : matchedSkills.length
      ? `与简历中的 ${matchedSkills.join('、')} 技能和项目经历匹配。`
      : `该方向来自职业画像中的主要求职方向，可继续人工调整。`;
  return { matchedSkills, gaps, reason };
}

function normalizeDirectionItem(item = {}, index = 0) {
  const name = String(item.name || item.title || '').trim().slice(0, 60);
  const source = item.source === 'custom' || item.custom ? 'custom' : 'profile';
  const id = String(item.id || stableDirectionId(name || `custom-${index}`, source));
  return {
    id,
    source,
    custom: source === 'custom',
    sourceName: String(item.sourceName || name).trim().slice(0, 60),
    name,
    enabled: item.enabled !== false,
    priority: Math.round(clampNumber(item.priority, 1, 99, index + 1)),
    score: Math.round(clampNumber(item.score, 0, 100, source === 'custom' ? 70 : Math.max(60, 88 - index * 7))),
    reason: String(item.reason || (source === 'custom' ? '用户自定义岗位方向。' : '根据职业画像推荐。')).trim().slice(0, 240),
    matchedSkills: normalizeStringList(item.matchedSkills, 8),
    gaps: normalizeStringList(item.gaps, 6),
    keywords: uniq(normalizeStringList(item.keywords, 12).length ? normalizeStringList(item.keywords, 12) : [name]).slice(0, 12),
    updatedAt: Number(item.updatedAt || Date.now())
  };
}

function profileDirectionSignature(profile = {}) {
  return JSON.stringify({
    directions: normalizeStringList(profile?.primaryDirections?.map(item => typeof item === 'string' ? item : item?.name), 6).map(normalizeDirectionKey),
    keywords: normalizeStringList(profile?.searchKeywords, 20).map(normalizeDirectionKey)
  });
}

function normalizeDirectionPlan(plan, profile = null, options = {}) {
  const items = (Array.isArray(plan?.items) ? plan.items : [])
    .map((item, index) => normalizeDirectionItem(item, index))
    .filter(item => item.name && item.keywords.length)
    .sort((left, right) => left.priority - right.priority || right.score - left.score)
    .slice(0, 12)
    .map((item, index) => ({ ...item, priority: index + 1 }));
  return {
    version: 1,
    items,
    confirmed: options.confirmed ?? Boolean(plan?.confirmed),
    updatedAt: Number(options.updatedAt || plan?.updatedAt || Date.now()),
    appliedAt: Number(options.appliedAt || plan?.appliedAt || 0),
    profileSignature: String(options.profileSignature || plan?.profileSignature || profileDirectionSignature(profile)).slice(0, 600)
  };
}

function buildDirectionPlan(profile = {}, currentPlan = null, options = {}) {
  const primary = Array.isArray(profile?.primaryDirections) ? profile.primaryDirections : [];
  const secondary = Array.isArray(profile?.secondaryDirections) ? profile.secondaryDirections : [];
  const searchKeywords = normalizeStringList(profile?.searchKeywords, 20);
  const candidates = [];
  for (const item of [...primary, ...secondary]) {
    const name = String(typeof item === 'string' ? item : item?.name || '').trim();
    if (!name || candidates.some(candidate => normalizeDirectionKey(candidate.name) === normalizeDirectionKey(name))) continue;
    candidates.push({ name, raw: typeof item === 'object' ? item : {} });
  }
  for (const keyword of searchKeywords) {
    if (candidates.length >= 6) break;
    if (!/开发|工程师|实习生|前端|后端|全栈|AI|人工智能|工具|可视化/i.test(keyword)) continue;
    if (candidates.some(candidate => normalizeDirectionKey(candidate.name) === normalizeDirectionKey(keyword))) continue;
    candidates.push({ name: keyword, raw: {} });
  }
  if (!candidates.length) candidates.push({ name: '目标岗位', raw: {} });

  const existing = new Map((currentPlan?.items || []).map(item => [String(item.id || ''), item]));
  const generated = candidates.slice(0, 6).map((candidate, index) => {
    const id = stableDirectionId(candidate.name, 'profile');
    const previous = existing.get(id);
    const confidence = Number(candidate.raw?.confidence);
    const score = Number.isFinite(confidence)
      ? Math.round(confidence <= 1 ? confidence * 100 : confidence)
      : Math.max(62, 90 - index * 7);
    const evidence = buildDirectionEvidence(candidate.name, candidate.raw, profile);
    return normalizeDirectionItem({
      id,
      source: 'profile',
      sourceName: candidate.name,
      name: options.preserveEdits && previous?.name ? previous.name : candidate.name,
      enabled: options.preserveSelections && previous ? previous.enabled : index < 3,
      priority: previous?.priority || index + 1,
      score,
      reason: evidence.reason,
      matchedSkills: evidence.matchedSkills,
      gaps: evidence.gaps,
      keywords: options.preserveEdits && previous?.keywords?.length
        ? previous.keywords
        : buildDirectionKeywords(candidate.name, profile)
    }, index);
  });
  const custom = options.preserveCustom === false ? [] : (currentPlan?.items || [])
    .filter(item => item?.source === 'custom' || item?.custom)
    .map((item, index) => normalizeDirectionItem(item, generated.length + index));
  return normalizeDirectionPlan({
    items: [...generated, ...custom],
    confirmed: options.confirmed ?? false,
    updatedAt: Date.now(),
    appliedAt: options.confirmed ? Date.now() : Number(currentPlan?.appliedAt || 0)
  }, profile, { confirmed: options.confirmed ?? false, updatedAt: Date.now() });
}

function selectedDirectionItems(plan = {}) {
  return (Array.isArray(plan?.items) ? plan.items : [])
    .map((item, index) => normalizeDirectionItem(item, index))
    .filter(item => item.enabled && item.name && item.keywords.length)
    .sort((left, right) => left.priority - right.priority || right.score - left.score);
}

function compactEvidenceText(value, maxLength = 72) {
  return String(value || '')
    .replace(/^[\s\-•·\d.、）)]+/, '')
    .replace(/^(项目经历|项目名称|工作经历|实习经历|主要职责|职责|项目|教育经历)[:：\s]*/i, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[，,；;。.!！?？]+$/g, '')
    .trim()
    .slice(0, maxLength);
}

function greetingTokens(job = {}) {
  return uniq(String([job.title, job.description, job.cardText].filter(Boolean).join(' '))
    .toLowerCase()
    .split(/[^a-z0-9+#.\u4e00-\u9fa5]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2));
}

function cleanGreetingJobTitle(value = '') {
  let title = compactEvidenceText(value || '这个岗位', 72)
    .replace(/\d+\s*(?:分钟|小时|天|周|月)内活跃/gi, '')
    .replace(/本月活跃|今日活跃|刚刚活跃|招聘者|HRBP|HR|Boss/gi, '')
    .replace(/[（(](?:急聘|校招|社招|可转正|双休|高薪|base[^）)]*)[）)]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const salaryAt = title.search(/\b\d+(?:\.\d+)?\s*[-~至]\s*\d+(?:\.\d+)?\s*(?:K|k|元|万|\/天|\/月)/);
  if (salaryAt > 0) title = title.slice(0, salaryAt);
  title = title.replace(/[-—–|｜]\s*(?:泛抖音|抖音|电商|商业化|广告|生活服务|某事业部|业务线|急聘|双休|可转正|校招|社招).*$/i, '');
  title = title.replace(/(?:招聘|职位)$/g, '').replace(/\s+/g, '').trim();
  if (/^[\u4e00-\u9fa5]{2,4}(?:本月|今日|刚刚|\d+月内)/.test(title)) return '这个岗位';
  return title.slice(0, 28) || '这个岗位';
}

function looksLikeRoleInsteadOfProject(value = '') {
  const textValue = compactEvidenceText(value, 90);
  const role = /(?:实习生|工程师|开发岗|产品经理|运营|设计师|测试|岗位|职位|任职)/i.test(textValue);
  const project = /(?:系统|平台|工作台|工具|应用|网站|小程序|插件|Agent|RAG|问答|项目)/i.test(textValue);
  const action = /(?:负责|实现|搭建|设计|封装|优化|接入|重构|联调|检索|问答)/i.test(textValue);
  return role && !project && !action;
}

function splitProjectEvidence(value = '') {
  const clean = compactEvidenceText(value, 150)
    .replace(/^(我|本人)(曾经|之前|主要)?/i, '')
    .trim();
  if (!clean || looksLikeRoleInsteadOfProject(clean)) return null;
  const segments = clean.split(/[：:。；;]/).map(item => item.trim()).filter(Boolean);
  let name = segments[0] || '';
  let contribution = segments.slice(1).join('，');
  if (!contribution) {
    const commaParts = clean.split(/[，,]/).map(item => item.trim()).filter(Boolean);
    name = commaParts.shift() || name;
    contribution = commaParts.join('，');
  }
  name = name.replace(/^(参与|负责|开发|搭建|设计)(了|过)?/i, '').trim();
  if (name.length > 28 && /负责|实现|开发|搭建|设计|封装|优化|接入/.test(name)) {
    const match = name.match(/^(.{4,24}?)(?:中|项目里|项目中)?(?:主要)?(?:负责|实现|开发|搭建|设计|封装|优化|接入)(.+)$/);
    if (match) { name = match[1].trim(); contribution = `${match[2].trim()}${contribution ? `，${contribution}` : ''}`; }
  }
  contribution = contribution
    .replace(/^(主要)?(?:负责|参与|实现|开发|搭建|设计|封装|优化|接入)[:：\s]*/i, '')
    .replace(/(?:本人|我)\s*/g, '')
    .trim();
  const action = contribution.split(/[，,、]/).map(item => item.trim()).filter(Boolean)
    .find(item => /页面|前端|接口|联调|问答|检索|组件|状态|展示|流程|自动化|解析|服务|功能|模块|性能/.test(item))
    || contribution.split(/[，,、]/).map(item => item.trim()).filter(Boolean)[0]
    || '';
  if (!name || name.length < 3) return null;
  return { name: name.slice(0, 30), contribution: action.slice(0, 42), clean };
}

function projectEvidenceList(job, profile = {}, limit = 4) {
  const tokens = greetingTokens(job);
  const skills = normalizeStringList(profile?.facts?.skills, 40);
  const matchedSkills = skills.filter(skill => {
    const key = String(skill || '').toLowerCase();
    return key && tokens.some(token => token.includes(key) || key.includes(token));
  });
  const candidates = [
    ...normalizeStringList(profile?.facts?.projects, 16).map(text => ({ kind: 'project', text })),
    ...normalizeStringList(profile?.facts?.experiences, 10).map(text => ({ kind: 'experience', text }))
  ].map(item => {
    const parsed = splitProjectEvidence(item.text);
    const clean = compactEvidenceText(item.text, 150);
    if (!parsed) return null;
    const lower = clean.toLowerCase();
    let score = item.kind === 'project' ? 14 : 4;
    for (const token of tokens) if (token.length >= 2 && lower.includes(token)) score += Math.min(5, token.length);
    for (const skill of matchedSkills) if (lower.includes(String(skill).toLowerCase())) score += 9;
    if (/负责|实现|开发|搭建|设计|封装|优化|接入|联调|检索|问答/.test(clean)) score += 7;
    return { ...item, ...parsed, clean, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  return candidates.slice(0, limit);
}

function relevantProfileEvidence(job, profile = {}) {
  const tokens = greetingTokens(job);
  const skills = normalizeStringList(profile?.facts?.skills, 40);
  const matchedSkills = skills.filter(skill => {
    const key = String(skill || '').toLowerCase();
    return key && tokens.some(token => token.includes(key) || key.includes(token));
  });
  const orderedSkills = uniq([...matchedSkills, ...skills]).slice(0, 6);
  const projects = projectEvidenceList(job, profile, 4);
  return {
    matchedSkills: orderedSkills,
    project: projects[0] || null,
    projects,
    education: compactEvidenceText(normalizeStringList(profile?.facts?.education, 4)[0] || '', 68)
  };
}

function resumeGreetingLines(resumeText = '') {
  return String(resumeText || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 120);
}

function applicantName(profile = {}, resumeText = '') {
  const direct = [profile?.name, profile?.fullName, profile?.personalInfo?.name, profile?.personal?.name]
    .map(value => String(value || '').trim())
    .find(value => /^[\u4e00-\u9fa5]{2,4}$/.test(value) || /^[A-Za-z][A-Za-z .'-]{1,40}$/.test(value));
  if (direct) return direct;
  const blocked = /^(个人简历|求职简历|简历|个人信息|基本信息|教育经历|项目经历|工作经历|实习经历|联系方式)$/;
  for (const line of resumeGreetingLines(resumeText).slice(0, 12)) {
    const exact = line.match(/^(?:姓名[:：]\s*)?([\u4e00-\u9fa5]{2,4})$/);
    if (exact && !blocked.test(exact[1])) return exact[1];
    const prefixed = line.match(/^姓名[:：]\s*([\u4e00-\u9fa5]{2,4})/);
    if (prefixed) return prefixed[1];
  }
  return '';
}

function applicantEducation(profile = {}, resumeText = '') {
  const candidates = [
    ...normalizeStringList(profile?.facts?.education, 6),
    ...resumeGreetingLines(resumeText).filter(line => /大学|学院/.test(line) && /专业|本科|硕士|博士|在读|毕业/.test(line)).slice(0, 6)
  ];
  for (let value of candidates) {
    value = compactEvidenceText(value, 88)
      .replace(/(?:19|20)\d{2}[.\-/年]\d{1,2}(?:[.\-/月]\d{1,2})?\s*[-~至—–]\s*(?:至今|(?:19|20)\d{2}[.\-/年]\d{1,2}(?:[.\-/月]\d{1,2})?)/g, '')
      .replace(/教育经历[:：]?/g, '')
      .replace(/[|｜·•]/g, ' ')
      .replace(/\s+/g, '')
      .trim();
    if (/大学|学院/.test(value) && value.length >= 6) return value.slice(0, 52);
  }
  return '';
}

function applicantAvailability(profile = {}, resumeText = '') {
  const source = `${resumeText || ''}\n${profile?.summary || ''}\n${profile?.hardConstraints?.experience || ''}`.replace(/\s+/g, ' ');
  const arrivalMatch = source.match(/可立即到岗|可以立即到岗|随时到岗|一周内到岗|两周内到岗|可于[^，。；]{1,18}到岗|最早[^，。；]{1,18}到岗/);
  const durationMatch = source.match(/(?:能|可|可以)?(?:稳定|连续)?实习(?:时间)?\s*[:：]?\s*([一二三四五六七八九十\d]+)\s*个?月/);
  return {
    arrival: arrivalMatch ? arrivalMatch[0].replace(/^可以/, '可') : '',
    duration: durationMatch ? `${durationMatch[1]}个月` : ''
  };
}

function greetingModules(profile = {}, limit = 6) {
  const source = [
    ...normalizeStringList(profile?.facts?.projects, 16),
    ...normalizeStringList(profile?.facts?.experiences, 12)
  ].join(' ');
  const patterns = [
    '页面开发', '前端开发', '接口封装', '接口联调', 'API封装', '检索逻辑', 'RAG问答', '表单状态',
    '状态管理', '结果展示', '组件开发', '模型接入', '权限控制', '自动化流程', '数据可视化', '数据处理',
    '文件解析', 'OCR识别', '服务端开发', '数据库设计', '性能优化'
  ];
  return patterns.filter(item => source.toLowerCase().includes(item.toLowerCase())).slice(0, limit);
}

function compactContribution(project, skillText = '') {
  if (!project) return '';
  let contribution = String(project.contribution || '').trim();
  if (!contribution && skillText) contribution = `${skillText}相关功能`;
  contribution = contribution.replace(/^(主要)?负责/i, '').replace(/[。；;]+$/g, '').slice(0, 42);
  return contribution;
}

function humanGreetingTemplate(job, profile, style = 'human-project', resumeText = '') {
  const title = cleanGreetingJobTitle(job?.title || '这个岗位');
  const evidence = relevantProfileEvidence(job, profile);
  const skills = evidence.matchedSkills.slice(0, 6);
  const projects = evidence.projects.slice(0, 4);
  const modules = greetingModules(profile, 6);
  const name = applicantName(profile, resumeText);
  const education = applicantEducation(profile, resumeText) || evidence.education;
  const availability = applicantAvailability(profile, resumeText);
  const skillText = skills.join('、');
  const projectNames = uniq(projects.map(item => item.name)).slice(0, 4);
  const projectText = projectNames.join('、');

  if (style === 'concise') {
    const intro = name ? `您好，我是${name}` : '您好';
    const evidenceText = projects[0]
      ? `我做过${projects[0].name}${projects[0].contribution ? `，主要负责${projects[0].contribution}` : ''}`
      : skillText ? `我有${skillText}相关项目经验` : '我对岗位方向比较感兴趣';
    return `${intro}，想应聘${title}。${evidenceText}，方便进一步沟通吗？`.replace(/。{2,}/g, '。').slice(0, 180);
  }

  if (style === 'skill-first') {
    const intro = name ? `您好，我是${name}` : '您好';
    const school = education ? `，${education}` : '';
    const tech = skillText ? `我熟悉${skillText}等技术` : '我有相关项目实践';
    const project = projectText ? `，也做过${projectText}等项目` : '';
    return `${intro}${school}。${tech}${project}。希望能就${title}进一步沟通。`.replace(/。{2,}/g, '。').slice(0, 260);
  }

  const firstParts = [];
  if (name) firstParts.push(`您好，我是${name}`);
  else firstParts.push('您好');
  if (education) firstParts.push(education);
  if (availability.arrival) firstParts.push(availability.arrival);
  if (availability.duration) firstParts.push(`能稳定实习${availability.duration}`);
  let firstSentence = firstParts.join('，');
  if (firstSentence === '您好') firstSentence = `您好，我想应聘${title}`;
  firstSentence += '。';

  const secondParts = [];
  if (skillText) secondParts.push(`我熟悉${skillText}等技术`);
  if (projectText) secondParts.push(`也做过${projectText}${projectNames.length >= 3 ? '等' : ''}项目`);
  const secondSentence = secondParts.length ? `${secondParts.join('，')}。` : `我对${title}的工作内容比较感兴趣。`;

  let thirdSentence = '';
  if (modules.length) {
    thirdSentence = `过往项目中参与过${modules.join('、')}等模块，比较注重功能落地和细节处理。`;
  } else if (projects[0]) {
    const contribution = compactContribution(projects[0], skillText);
    thirdSentence = contribution
      ? `过往项目中主要负责${contribution}，比较注重功能落地和细节处理。`
      : '过往项目中比较注重功能落地和细节处理。';
  }

  const ending = '希望有机会加入贵公司，在真实业务中继续提升工程能力。';
  return `${firstSentence}${secondSentence}${thirdSentence}${ending}`
    .replace(/。{2,}/g, '。')
    .replace(/，，+/g, '，')
    .replace(/项目项目/g, '项目')
    .trim()
    .slice(0, 320);
}

function fallbackApplicantGreeting(job, profile, style = 'human-project', resumeText = '') {
  return humanGreetingTemplate(job, profile, style, resumeText);
}

function normalizeApplicantGreeting(result, job, profile, style = 'human-project', resumeText = '') {
  const raw = String(result?.greeting || '').replace(/\s+/g, ' ').trim();
  const reversed = /看到你的简历|你的简历|很匹配我们|匹配我们|欢迎.*沟通|期待你|候选人|我们团队|我们公司|团队主要涉及|你很匹配/i.test(raw);
  const recruiterNoise = /本月活跃|今日活跃|刚刚活跃|\d+\s*(?:分钟|小时|天|周|月)内活跃|招聘者姓名/i.test(raw);
  const badProject = /我(?:之前)?做过.{0,22}(?:实习生|工程师|岗位|职位)/i.test(raw);
  const evidence = relevantProfileEvidence(job, profile);
  const fullStyle = style === 'human-project' || style === 'natural-project';
  const applicantVoice = /我是|我想应聘|我熟悉|我做过|过往项目|希望有机会/.test(raw);
  const projectGrounded = /做过|负责|实现|开发|搭建|项目|实践|页面|接口|检索|状态|展示/.test(raw);
  const minimumLength = fullStyle ? 120 : 40;
  const maximumLength = fullStyle ? 330 : 220;
  if (!raw || reversed || recruiterNoise || badProject || !applicantVoice || raw.length < minimumLength || raw.length > maximumLength || (!projectGrounded && evidence.project)) {
    return fallbackApplicantGreeting(job, profile, style, resumeText);
  }
  return raw.slice(0, maximumLength);
}

function fastMassAnalysis(job, profile, strategy = 'safe-mass', resumeText = '') {
  const normalizedStrategy = normalizeStrategy(strategy);
  const jobText = [job?.title, job?.description, job?.cardText].filter(Boolean).join('\n').toLowerCase();
  const skills = normalizeStringList(profile?.facts?.skills, 20);
  const directions = normalizeStringList(profile?.primaryDirections?.map(item => typeof item === 'string' ? item : item?.name), 8);
  const matchedEvidence = [];
  for (const skill of skills) {
    const token = String(skill || '').trim();
    if (token && jobText.includes(token.toLowerCase())) matchedEvidence.push(token);
  }
  const directionMatched = directions.some(item => item && jobText.includes(String(item).toLowerCase()));
  const score = Math.max(20, Math.min(90, 32 + matchedEvidence.length * 9 + (directionMatched ? 16 : 0)));
  return {
    score,
    decision: normalizedStrategy === 'full-mass' ? 'recommend' : (matchedEvidence.length || directionMatched ? 'recommend' : 'cautious'),
    hardBlocks: [],
    strictHardBlocks: [],
    matchedEvidence: matchedEvidence.slice(0, 8),
    gaps: [],
    risks: [],
    reason: normalizedStrategy === 'full-mass'
      ? '完全海投快速模式 不以技能 年限 专业 学历或岗位匹配度拦截 仅保留安全风险和去重检查'
      : '安全海投快速模式 只拦截明确硬性冲突 重复岗位和高风险岗位 其他差距仅用于排序',
    greeting: fallbackApplicantGreeting(job, profile, 'human-project', resumeText),
    analysisMode: normalizedStrategy === 'full-mass' ? 'local-full-mass-fast' : 'local-safe-mass-fast'
  };
}

async function analyzeJob(job) {
  const { profile, resumeText, config } = await storage.get(['profile', 'resumeText', 'config']);
  if (!profile) throw new Error('请先生成职业画像');
  const strategy = normalizeStrategy(config?.batchStrategy);
  const massMode = strategy === 'full-mass' || strategy === 'safe-mass';
  const greetingStyle = ['human-project', 'natural-project', 'concise', 'skill-first'].includes(config?.greetingStyle) ? config.greetingStyle : 'human-project';
  const analysisPreference = String(config?.massApplyAnalysis || 'auto-ai');
  if (analysisPreference === 'rules') return fastMassAnalysis(job, profile, strategy, resumeText);
  const strategyInstruction = strategy === 'full-mass'
    ? '当前为完全海投模式。不得因为技能、年限、专业、学历、行业经验或匹配分不足拒绝岗位，decision原则上为recommend。只识别企业诈骗、收费、账号或岗位明显异常等安全风险，硬性要求仅记录到gaps用于排序。'
    : '当前为安全海投模式。技能、技术栈、专业、学历偏差、经验年限不足和行业经历缺失通常只放入gaps；只有JD明确写出必须、仅限、不接受且与用户真实条件存在不可改变冲突时，才写入hardBlocks并允许reject。';
  try {
    const result = await callModel([
      {
        role: 'system',
        content: `你是求职者的岗位分析助手，不是招聘方。所有经历必须来自简历事实。${strategyInstruction} 输出JSON：{"score":0,"decision":"recommend|cautious|reject","hardBlocks":[],"matchedEvidence":[],"gaps":[],"risks":[],"reason":"","greeting":""}。greeting要写成完整、专业但不生硬的求职自我介绍，默认170到280个中文字符，4到5句。优先按这个顺序组织：1 姓名、学校、专业和学历；2 真实到岗时间与可稳定实习时长；3 4到6项真实技术；4 2到4个真实项目；5 过去项目中本人实际负责的页面、接口、检索、表单状态、结果展示等模块；6 表达希望进一步沟通和参与真实业务。只能写简历里明确存在的事实，缺少哪项就省略，绝不能补造。不要把招聘者姓名、活跃状态、薪资、学历标签混进岗位名，也不能把“某某实习生、工程师”写成做过的项目。禁止使用“想问下某某本月活跃还在招吗”这类错误句式。可以使用“希望有机会加入贵公司，在真实业务中继续提升工程能力”这类正式表达。招呼语风格=${greetingStyle}。`
      },
      {
        role: 'user',
        content: `职业画像：${JSON.stringify(profile)}\n简历：${String(resumeText || '').slice(0, 15000)}\n岗位：${JSON.stringify(job)}`
      }
    ], true, { forceRoute: analysisPreference === 'cloud' ? 'cloud' : (analysisPreference === 'local' ? 'local' : undefined) });
    result.score = Math.max(0, Math.min(100, Number(result.score || 0)));
    result.greeting = normalizeApplicantGreeting(result, job, profile, greetingStyle, resumeText);
    result.hardBlocks = Array.isArray(result.hardBlocks) ? result.hardBlocks.map(item => String(item || '').trim()).filter(Boolean) : [];
    result.strictHardBlocks = strictHardBlocks(result.hardBlocks);
    if (strategy === 'full-mass') result.decision = 'recommend';
    else if (result.strictHardBlocks.length) result.decision = 'reject';
    else if (result.decision === 'reject') result.decision = 'cautious';
    return result;
  } catch (error) {
    if (String(error?.code || '') === 'AI_ABORTED') throw error;
    const fallback = fastMassAnalysis(job, profile, strategy, resumeText);
    fallback.analysisMode = 'local-semantic-fallback';
    fallback.aiWarning = String(error?.message || 'AI服务不可用，已使用本地轻量算法');
    return fallback;
  }
}

function createTasks(profile, config, directionPlan) {
  const directions = selectedDirectionItems(directionPlan);
  const search = normalizeSearchConfig(config);
  const groups = search.cities.map(location => {
    const cityTasks = [];
    const seen = new Set();
    for (const direction of directions) {
      for (const keyword of direction.keywords) {
        const dedupeKey = [keyword, location, search.employmentType, search.experience, search.degree, search.salary]
          .map(value => String(value || '').trim().toLowerCase())
          .join('|');
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        cityTasks.push({
          id: crypto.randomUUID(),
          directionId: direction.id,
          directionName: direction.name,
          directionPriority: direction.priority,
          directionScore: direction.score,
          keyword,
          location,
          employmentType: search.employmentType,
          experience: search.experience,
          degree: search.degree,
          salary: search.salary,
          maxJobs: search.maxJobsPerTask,
          attempts: 0,
          status: 'pending',
          progress: 0,
          stageLabel: '等待开始',
          processed: 0,
          discovered: 0,
          analyzed: 0,
          accepted: 0,
          duplicates: 0,
          lowQuality: 0,
          filterFailures: 0,
          failed: 0,
          createdAt: Date.now()
        });
      }
    }
    return cityTasks;
  });
  return roundRobinSearchTasks(groups, search.maxSearchTasks);
}


async function dispatchNextAutoPending() {
  const { pending = [], workflow = {}, config = {} } = await storage.get(['pending', 'workflow', 'config']);
  if (config.executionMode !== 'auto') return { started: false, reason: 'not-auto' };
  if (config.dryRun) return { started: false, reason: 'dry-run' };
  if (workflow.pendingApplyId) return { started: false, reason: 'busy', pendingApplyId: workflow.pendingApplyId };
  const ranked = rerankPending(pending);
  const candidate = ranked.find(entry => entry.status === 'approved_queue');
  if (!candidate) {
    await storage.set({ pending: ranked });
    return { started: false, reason: 'empty' };
  }
  const next = rerankPending(ranked.map(entry => entry.id === candidate.id
    ? { ...entry, status: 'approved', approvedAt: entry.approvedAt || Date.now() }
    : entry));
  await storage.set({ pending: next });
  const run = await updateTaskRunByPending(candidate.id, {
    status: 'running',
    stage: 'queued',
    progress: 64,
    stageLabel: `优先投递 · 队列第 ${candidate.priorityRank || 1} 位`,
    error: '',
    retryable: true,
    completedAt: null
  });
  await patchWorkflow({
    running: true,
    paused: false,
    phase: 'apply',
    statusText: `${normalizeStrategy(config.batchStrategy) === 'full-mass' ? '完全海投' : '安全海投'}：${candidate.job?.title || '岗位'}（队列优先级 ${candidate.priorityRank || 1}）`,
    pendingApplyId: candidate.id,
    activeRunId: run?.id || candidate.runId || null
  });
  await sendToBoss({ type: 'RUN' });
  return { started: true, item: candidate, queueDepth: next.filter(entry => entry.status === 'approved_queue').length };
}

async function addPending(item) {
  const { pending = [], config = {} } = await storage.get(['pending', 'config']);
  let run = null;
  if (item.runId) {
    run = await upsertTaskRun({
      id: item.runId,
      job: item.job,
      analysis: item.analysis,
      searchTask: item.task,
      status: config.executionMode === 'auto' && !config.dryRun ? 'queued' : 'waiting_review',
      stage: config.executionMode === 'auto' && !config.dryRun ? 'queued' : 'waiting_review',
      progress: config.executionMode === 'auto' && !config.dryRun ? 64 : 60,
      stageLabel: config.dryRun ? '模拟运行等待确认' : (config.executionMode === 'auto' ? '已进入自动排序队列' : '等待人工确认')
    });
  } else {
    run = await upsertTaskRun({
      job: item.job,
      analysis: item.analysis,
      searchTask: item.task,
      status: config.executionMode === 'auto' && !config.dryRun ? 'queued' : 'waiting_review',
      stage: config.executionMode === 'auto' && !config.dryRun ? 'queued' : 'waiting_review',
      progress: config.executionMode === 'auto' && !config.dryRun ? 64 : 60,
      stageLabel: config.dryRun ? '模拟运行等待确认' : (config.executionMode === 'auto' ? '已进入自动排序队列' : '等待人工确认')
    });
  }
  const nextItem = {
    ...item,
    runId: run.id,
    id: item.id || crypto.randomUUID(),
    deliveryGreeting: String(item.deliveryGreeting || item.analysis?.greeting || '').trim(),
    status: config.executionMode === 'auto' && !config.dryRun ? 'approved_queue' : 'pending',
    createdAt: Date.now()
  };
  await upsertTaskRun({ id: run.id, pendingId: nextItem.id });
  const next = rerankPending([nextItem, ...pending.filter(entry => entry.id !== nextItem.id)]);
  await storage.set({ pending: next });
  const count = next.filter(entry => entry.status === 'pending').length;
  await storage.set({ stats: { ...(await storage.get('stats')).stats, pending: count } });
  return next.find(entry => entry.id === nextItem.id) || nextItem;
}

async function approvePending(id, greeting = '') {
  const { pending = [], config = {}, stats = {} } = await storage.get(['pending', 'config', 'stats']);
  const item = pending.find(entry => entry.id === id);
  if (!item) throw new Error('待确认岗位不存在');
  const lockedGreeting = String(greeting || item.deliveryGreeting || item.analysis?.greeting || '').trim();
  if (config.dryRun) {
    const completedAt = Date.now();
    const next = pending.map(entry => entry.id === id ? {
      ...entry,
      deliveryGreeting: lockedGreeting,
      analysis: { ...(entry.analysis || {}), greeting: lockedGreeting },
      status: 'simulated',
      completedAt
    } : entry);
    await storage.set({
      pending: next,
      stats: { ...stats, pending: next.filter(entry => entry.status === 'pending').length, simulated: Number(stats.simulated || 0) + 1 }
    });
    await updateTaskRunByPending(id, { status: 'success', stage: 'simulated', progress: 100, stageLabel: '模拟投递已通过', retryable: false, completedAt, result: 'dry-run' });
    await writeEvent('success', '模拟投递已通过 未执行真实发送', { id, job: item.job });
    return next.find(entry => entry.id === id);
  }
  const updatedItem = {
    ...item,
    deliveryGreeting: lockedGreeting,
    analysis: { ...(item.analysis || {}), greeting: lockedGreeting },
    status: 'approved',
    approvedAt: Date.now()
  };
  const next = pending.map(entry => entry.id === id ? updatedItem : entry);
  await storage.set({ pending: next });
  const pendingCount = next.filter(entry => entry.status === 'pending').length;
  await storage.set({ stats: { ...stats, pending: pendingCount } });
  const run = await updateTaskRunByPending(id, {
    status: 'running',
    stage: 'queued',
    progress: 64,
    stageLabel: '等待投递',
    error: '',
    retryable: true,
    completedAt: null
  });
  await patchWorkflow({
    running: true,
    paused: false,
    phase: 'apply',
    statusText: `准备以求职者身份沟通：${item.job?.title || '岗位'}`,
    pendingApplyId: id,
    activeRunId: run?.id || item.runId || null
  });
  await sendToBoss({ type: 'RUN' });
  setTimeout(() => sendToBoss({ type: 'RUN' }).catch(() => {}), 700);
  return updatedItem;
}

async function approveAllPending() {
  const { pending = [], config = {}, stats = {} } = await storage.get(['pending', 'config', 'stats']);
  const candidates = rerankPending(pending).filter(entry => entry.status === 'pending');
  if (!candidates.length) return { count: 0 };
  if (config.dryRun) {
    const completedAt = Date.now();
    const ids = new Set(candidates.map(entry => entry.id));
    const next = pending.map(entry => ids.has(entry.id) ? { ...entry, status: 'simulated', completedAt } : entry);
    await storage.set({ pending: next, stats: { ...stats, pending: 0, simulated: Number(stats.simulated || 0) + candidates.length } });
    for (const candidate of candidates) {
      await updateTaskRunByPending(candidate.id, { status: 'success', stage: 'simulated', progress: 100, stageLabel: '模拟投递已通过', retryable: false, completedAt, result: 'dry-run' });
    }
    await writeEvent('success', `已完成${candidates.length}个岗位的模拟投递 未执行真实发送`);
    return { count: candidates.length, simulated: true };
  }
  const ids = new Set(candidates.map(entry => entry.id));
  const next = pending.map(entry => ids.has(entry.id)
    ? { ...entry, status: 'approved_queue', approvedAt: Date.now() }
    : entry);
  const first = candidates[0];
  await storage.set({ pending: next });
  await storage.set({ stats: { ...stats, pending: 0 } });
  for (const [index, candidate] of candidates.entries()) {
    await updateTaskRunByPending(candidate.id, {
      status: index === 0 ? 'running' : 'queued',
      stage: 'queued',
      progress: 64,
      stageLabel: index === 0 ? '准备投递' : '批量队列等待中',
      error: '',
      retryable: true,
      completedAt: null
    });
  }
  await patchWorkflow({
    running: true,
    paused: false,
    phase: 'apply',
    statusText: `批量投递 1/${candidates.length}：${first.job?.title || '岗位'}`,
    pendingApplyId: first.id,
    activeRunId: first.runId || null
  });
  await sendToBoss({ type: 'RUN' });
  return { count: candidates.length };
}

async function rejectAllPending() {
  const { pending = [] } = await storage.get('pending');
  const count = pending.filter(entry => entry.status === 'pending').length;
  const next = pending.map(entry => entry.status === 'pending'
    ? { ...entry, status: 'rejected', rejectedAt: Date.now() }
    : entry);
  await storage.set({ pending: next });
  const { stats } = await storage.get('stats');
  await storage.set({ stats: { ...stats, pending: 0 } });
  for (const item of pending.filter(entry => entry.status === 'pending')) {
    await updateTaskRunByPending(item.id, { status: 'ignored', stage: 'ignored', progress: 100, stageLabel: '已忽略', retryable: false });
  }
  return { count };
}

async function rejectPending(id) {
  const { pending = [] } = await storage.get('pending');
  const next = pending.map(entry => entry.id === id ? { ...entry, status: 'rejected', rejectedAt: Date.now() } : entry);
  await storage.set({ pending: next });
  const count = next.filter(entry => entry.status === 'pending').length;
  const { stats } = await storage.get('stats');
  await storage.set({ stats: { ...stats, pending: count } });
  await updateTaskRunByPending(id, { status: 'ignored', stage: 'ignored', progress: 100, stageLabel: '已忽略', retryable: false });
}


async function skipPendingTask(id, reason = '该岗位需要外部网申，已自动跳过', stageLabel = '外部网申岗位已跳过') {
  const { pending = [], stats = {}, config = {}, chatTransition = null } = await storage.get(['pending', 'stats', 'config', 'chatTransition']);
  const completedAt = Date.now();
  let skippedItem = null;
  let next = pending.map(entry => {
    if (entry.id !== id) return entry;
    skippedItem = { ...entry, status: 'skipped', completedAt, error: reason };
    return skippedItem;
  });
  const updatedStats = {
    ...stats,
    pending: next.filter(entry => entry.status === 'pending').length
  };
  await storage.set({ pending: next, stats: updatedStats, chatTransition: chatTransition?.pendingId === id ? null : chatTransition });
  const run = await updateTaskRunByPending(id, {
    status: 'skipped', stage: 'skipped', progress: 100,
    stageLabel, error: reason, retryable: false, completedAt
  });
  await writeEvent('info', stageLabel, {
    id,
    runId: run?.id || skippedItem?.runId || '',
    job: skippedItem?.job,
    reason
  });

  next = rerankPending(next);
        const queued = next.find(entry => entry.status === 'approved_queue');
  if (queued) {
    next = next.map(entry => entry.id === queued.id ? { ...entry, status: 'approved' } : entry);
    await storage.set({ pending: next });
    const queuedRun = await updateTaskRunByPending(queued.id, {
      status: 'running', stage: 'queued', progress: 64,
      stageLabel: '准备投递', error: '', completedAt: null
    });
    await patchWorkflow({
      pendingApplyId: queued.id,
      activeRunId: queuedRun?.id || queued.runId || null,
      running: true,
      paused: false,
      phase: 'apply',
      statusText: `已跳过外部网申岗位，继续投递：${queued.job?.title || '岗位'}`
    });
  } else {
    await patchWorkflow({
      pendingApplyId: null,
      activeRunId: null,
      running: true,
      paused: false,
      phase: 'search',
      statusText: '外部网申岗位已跳过，继续搜索可直接沟通岗位'
    });
  }
  setTimeout(() => sendToBoss({ type: 'RUN' }).catch(() => {}), Math.max(3000, Math.min(10000, Number(config.betweenJobsSeconds || 5) * 1000)));
  return { item: skippedItem, queued: queued || null };
}

async function handleBridgeCommands() {
  try {
    const response = await bridge('/commands');
    for (const command of response.commands || []) {
      if (command.type === 'start') {
        await patchWorkflow({ running: true, paused: false, statusText: '由 OpenClaw 启动' });
        await sendToBoss({ type: 'RUN' });
      } else if (command.type === 'pause') {
        await patchWorkflow({ paused: true, statusText: '由 OpenClaw 暂停' });
      } else if (command.type === 'stop') {
        await patchWorkflow({ running: false, paused: true, phase: 'idle', statusText: '由 OpenClaw 停止' });
      }
    }
  } catch {
    // 桌面桥接未运行时保持浏览器扩展独立可用。
  }
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
init();

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'jobclaw-update-check') {
    await checkForUpdates(false).catch(() => {});
    return;
  }
  if (alarm.name !== 'jobclaw-tick') return;
  const { workflow } = await storage.get('workflow');
  if (workflow?.running && !workflow.paused) sendToBoss({ type: 'RUN' }).catch(() => {});
  handleBridgeCommands();
  syncBridgeSnapshot(false).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    switch (message?.type) {
      case 'TRUSTED_CHAT_INPUT': {
        const tabId = sender?.tab?.id;
        const url = String(sender?.tab?.url || '');
        if (!/^https:\/\/(?:www|app)\.zhipin\.com\//i.test(url)) throw new Error('可信输入只能用于当前 BOSS 页面');
        const result = await trustedChatInput(tabId, message);
        reply({ ok: true, ...result });
        break;
      }
      case 'BOSS_SEARCH_ROUTE': {
        reply(await buildBossSearchRoute({
          city: message.city || '',
          keyword: message.keyword || '',
          currentUrl: message.currentUrl || sender?.tab?.url || '',
          alternate: Boolean(message.alternate)
        }));
        break;
      }
      case 'NAVIGATE_BOSS_SEARCH': {
        const rawUrl = String(message.url || '').trim();
        let target;
        try { target = new URL(rawUrl); } catch { throw new Error('BOSS搜索地址无效'); }
        if (target.protocol !== 'https:' || target.hostname !== 'www.zhipin.com' || !/^\/web\/geek\/jobs?$/.test(target.pathname)) {
          throw new Error('仅允许导航到BOSS职位搜索页');
        }
        const tabId = Number(sender?.tab?.id || message.tabId || 0);
        if (!tabId) throw new Error('无法确认当前BOSS标签页');
        await chrome.tabs.update(tabId, { url: target.toString(), active: true });
        reply({ ok: true, tabId, url: target.toString() });
        break;
      }
      case 'RATE_LIMIT': {
        reply(await enforceRateLimit(message.scope || 'discovery'));
        break;
      }
      case 'SAFETY_OUTCOME': {
        const state = await applySafetyOutcome({ ok: message.ok !== false, reason: message.reason || '' });
        reply({ ok: true, state });
        break;
      }
      case 'RESET_SAFETY': {
        reply({ ok: true, state: await clearSafetyCircuit() });
        break;
      }
      case 'CLEAR_JOB_HISTORY': {
        await storage.set({ jobSeenHistory: [] });
        await writeEvent('info', '岗位去重记忆已由用户清除');
        reply({ ok: true });
        break;
      }
      case 'PROBE_AND_REPAIR': {
        reply({ ok: true, result: await probeAndRepairBossPage({ resume: false }) });
        break;
      }
      case 'RESET_AND_RESUME': {
        const result = await probeAndRepairBossPage({ resume: true });
        reply({ ok: true, ...result });
        break;
      }
      case 'JOB_PREFLIGHT': {
        reply(await preflightJob(message.job || {}));
        break;
      }
      case 'VERIFY_COMPANY': {
        reply({ ok: true, result: await verifyCompanyForJob(message.job || {}, Boolean(message.force)) });
        break;
      }
      case 'EVALUATE_STRATEGY': {
        const { config = {} } = await storage.get('config');
        const result = evaluateStrategy({
          strategy: config.batchStrategy,
          score: message.score,
          minScore: config.minScore,
          riskLevel: message.riskLevel || 'unknown',
          verified: Boolean(message.verified),
          decision: message.decision || 'cautious',
          hardBlocks: message.hardBlocks || []
        });
        reply({ ok: true, result });
        break;
      }
      case 'CHECK_UPDATE': {
        reply({ ok: true, result: await checkForUpdates(Boolean(message.force)) });
        break;
      }
      case 'OPEN_UPDATE': {
        const { updateInfo = {} } = await storage.get('updateInfo');
        const url = String(message.url || updateInfo.url || 'https://github.com/Chrisbetheking/job-claw/releases');
        await chrome.tabs.create({ url });
        reply({ ok: true });
        break;
      }
      case 'GET_STATE':
        reply({ ok: true, state: publicState(await storage.all()) });
        break;
      case 'SAVE_CONFIG': {
        const { config } = await storage.get('config');
        const incoming = message.config || {};
        const oldKey = config?.model?.apiKey || '';
        incoming.model = {
          ...(config?.model || {}),
          ...(incoming.model || {}),
          apiKey: incoming.model?.apiKey && incoming.model.apiKey !== '***'
            ? incoming.model.apiKey
            : oldKey
        };
        incoming.executionMode = incoming.executionMode === 'auto' ? 'auto' : 'review';
        incoming.batchStrategy = normalizeStrategy(incoming.batchStrategy || config?.batchStrategy || 'safe-mass');
        incoming.massApplyAnalysis = ['auto-ai', 'cloud', 'local', 'rules'].includes(incoming.massApplyAnalysis) ? incoming.massApplyAnalysis : (config?.massApplyAnalysis || 'auto-ai');
        incoming.aiProviderMode = normalizeAiProviderMode(incoming.aiProviderMode || config?.aiProviderMode || 'auto');
        incoming.warnWithoutAi = incoming.warnWithoutAi !== false;
        incoming.pacingPreset = ['conservative', 'standard', 'efficient', 'custom'].includes(incoming.pacingPreset) ? incoming.pacingPreset : (config?.pacingPreset || 'standard');
        incoming.dryRun = Boolean(incoming.dryRun);
        incoming.dailyTarget = Math.max(1, Math.min(150, Number(incoming.dailyTarget || config?.dailyTarget || 30)));
        incoming.discoveryLimit = Math.max(1, Math.min(800, Number(incoming.discoveryLimit || config?.discoveryLimit || 150)));
        const presetDelay = { conservative: 15, standard: 9, efficient: 6 }[incoming.pacingPreset];
        incoming.betweenJobsSeconds = Math.max(6, Math.min(120, Number(presetDelay || incoming.betweenJobsSeconds || config?.betweenJobsSeconds || 9)));
        incoming.attachmentDelaySeconds = Math.max(1.5, Math.min(15, Number(incoming.attachmentDelaySeconds || config?.attachmentDelaySeconds || 3)));
        incoming.maxPerCompanyPerDay = Math.max(1, Math.min(12, Number(incoming.maxPerCompanyPerDay || config?.maxPerCompanyPerDay || 3)));
        incoming.queueWarmup = Math.max(1, Math.min(10, Number(incoming.queueWarmup || config?.queueWarmup || 4)));
        incoming.maxConsecutiveFailures = Math.max(1, Math.min(10, Number(incoming.maxConsecutiveFailures || config?.maxConsecutiveFailures || 3)));
        incoming.jitterSeconds = Math.max(0, Math.min(15, Number(incoming.jitterSeconds ?? config?.jitterSeconds ?? 3)));
        incoming.companyVerificationEnabled = incoming.companyVerificationEnabled !== false;
        incoming.companyVerificationProvider = String(incoming.companyVerificationProvider || config?.companyVerificationProvider || 'bridge');
        incoming.companyVerificationCacheDays = Math.max(1, Math.min(90, Number(incoming.companyVerificationCacheDays || config?.companyVerificationCacheDays || 14)));
        incoming.blockUnknownCompanies = Boolean(incoming.blockUnknownCompanies);
        incoming.targetLocations = normalizeCityList(incoming.targetLocations || config?.targetLocations || []);
        incoming.expandNationwideToCities = incoming.expandNationwideToCities !== false;
        incoming.cityRotationCities = normalizeCityList(incoming.cityRotationCities || config?.cityRotationCities || DEFAULTS.config.cityRotationCities, DEFAULTS.config.cityRotationCities);
        incoming.employmentTypes = [normalizeBossFilter((incoming.employmentTypes || config?.employmentTypes || ['不限'])[0], BOSS_FILTER_OPTIONS.employmentTypes)];
        incoming.experiences = [normalizeBossFilter((incoming.experiences || config?.experiences || ['不限'])[0], BOSS_FILTER_OPTIONS.experiences)];
        incoming.degrees = [normalizeBossFilter((incoming.degrees || config?.degrees || ['不限'])[0], BOSS_FILTER_OPTIONS.degrees)];
        incoming.salary = normalizeBossFilter(incoming.salary || config?.salary || '不限', BOSS_FILTER_OPTIONS.salaries);
        incoming.maxSearchTasks = Math.max(1, Math.min(300, Number(incoming.maxSearchTasks || config?.maxSearchTasks || 120)));
        incoming.maxJobsPerTask = Math.max(1, Math.min(100, Number(incoming.maxJobsPerTask || config?.maxJobsPerTask || 20)));
        incoming.stagnationLimit = Math.max(3, Math.min(30, Number(incoming.stagnationLimit || config?.stagnationLimit || 8)));
        incoming.dedupeWindowDays = Math.max(1, Math.min(180, Number(incoming.dedupeWindowDays || config?.dedupeWindowDays || 30)));
        incoming.lowQualityPolicy = ['rank', 'skip-obvious'].includes(incoming.lowQualityPolicy) ? incoming.lowQualityPolicy : (config?.lowQualityPolicy || 'skip-obvious');
        incoming.lowQualityThreshold = Math.max(0, Math.min(60, Number(incoming.lowQualityThreshold ?? config?.lowQualityThreshold ?? 24)));
        incoming.updateCheckEnabled = incoming.updateCheckEnabled !== false;
        incoming.dailyReportEnabled = incoming.dailyReportEnabled !== false;
        incoming.dailyReportTime = /^\d{2}:\d{2}$/.test(String(incoming.dailyReportTime || '')) ? String(incoming.dailyReportTime) : (config?.dailyReportTime || '20:30');
        incoming.dailyReportNotification = incoming.dailyReportNotification !== false;
        incoming.rateLimits = { ...DEFAULTS.config.rateLimits, ...(config?.rateLimits || {}), ...(incoming.rateLimits || {}), deliveryMs: Math.max(6000, Number(incoming.betweenJobsSeconds || 9) * 1000), attachmentMs: Math.max(1500, Number(incoming.attachmentDelaySeconds || 3) * 1000) };
        incoming.model.baseUrl = String(incoming.model.baseUrl || 'https://api.deepseek.com').trim();
        incoming.model.model = String(incoming.model.model || 'deepseek-v4-flash').trim();
        const oldLocalKey = config?.localModel?.apiKey || '';
        incoming.localModel = {
          ...(config?.localModel || DEFAULTS.config.localModel),
          ...(incoming.localModel || {}),
          enabled: Boolean(incoming.localModel?.enabled),
          baseUrl: String(incoming.localModel?.baseUrl || 'http://127.0.0.1:11434/v1').trim(),
          model: String(incoming.localModel?.model || 'qwen3:1.7b').trim(),
          apiKey: incoming.localModel?.apiKey && incoming.localModel.apiKey !== '***' ? incoming.localModel.apiKey : oldLocalKey,
          temperature: Math.max(0, Math.min(1.5, Number(incoming.localModel?.temperature ?? config?.localModel?.temperature ?? 0.2)))
        };
        await storage.set({ config: { ...(config || {}), ...incoming } });
        await writeEvent('info', '设置已保存');
        syncBridgeSnapshot(true).catch(() => {});
        reply({ ok: true });
        break;
      }
      case 'SET_RESUME':
        await storage.set({ resumeText: String(message.text || '') });
        await writeEvent('info', '简历文本已保存', { length: String(message.text || '').length });
        reply({ ok: true });
        break;
      case 'SET_RESUME_SOURCE': {
        const file = message.file || null;
        if (!file?.name || !file?.dataUrl) throw new Error('简历原文件数据不完整');
        if (String(file.dataUrl).length > 26 * 1024 * 1024) throw new Error('简历原文件过大');
        const source = {
          name: String(file.name),
          type: String(file.type || ''),
          size: Number(file.size || 0),
          lastModified: Number(file.lastModified || 0),
          dataUrl: String(file.dataUrl),
          savedAt: Date.now()
        };
        await storage.set({ resumeSourceFile: source });
        await writeEvent('info', '简历原文件已保留', { name: source.name, size: source.size });
        reply({ ok: true, file: { name: source.name, type: source.type, size: source.size, stored: true } });
        break;
      }
      case 'PARSE_RESUME_PDF': {
        const { resumeSourceFile } = await storage.get('resumeSourceFile');
        if (!resumeSourceFile?.dataUrl) throw new Error('请先选择 PDF 简历');
        if (!String(resumeSourceFile.name || '').toLowerCase().endsWith('.pdf') && resumeSourceFile.type !== 'application/pdf') {
          throw new Error('当前保留的文件不是 PDF');
        }
        try {
          const result = await bridge('/parse-resume', {
            name: resumeSourceFile.name,
            type: resumeSourceFile.type,
            dataUrl: resumeSourceFile.dataUrl
          });
          if (result?.text) await writeEvent('info', 'PDF 本机深度识别完成', { method: result.method, length: result.text.length });
          reply({ ok: Boolean(result?.ok), result, error: result?.error || '' });
        } catch (error) {
          reply({ ok: false, error: `桌面桥接不可用：${error.message}` });
        }
        break;
      }
      case 'SET_IMAGE':
        await storage.set({ resumeImage: message.dataUrl || null });
        await writeEvent('info', message.dataUrl ? '简历图片已保存' : '简历图片已移除');
        reply({ ok: true });
        break;
      case 'BUILD_LOCAL_PROFILE':
      case 'ENSURE_PROFILE_DRAFT': {
        const { resumeText, profile: currentProfile, profileDraft: currentDraft } = await storage.get(['resumeText', 'profile', 'profileDraft']);
        if (profileDraftHasCore(currentDraft) && profileHasCore(currentProfile)) {
          reply({ ok: true, profile: currentProfile, profileDraft: currentDraft, skipped: true });
          break;
        }
        if (profileHasCore(currentProfile)) {
          const profileDraft = profileDraftHasAny(currentDraft)
            ? normalizeProfileDraft(currentDraft, profileToDraft(currentProfile, 'profile-repair'))
            : profileToDraft(currentProfile, 'profile-repair');
          await storage.set({ profileDraft });
          reply({ ok: true, profile: currentProfile, profileDraft, repaired: true });
          break;
        }
        const profile = buildLocalProfile(resumeText || '');
        profile.generation.mode = 'local-recovery';
        profile.generation.label = '本地初稿';
        profile.generation.warning = '已从保存的简历自动恢复可编辑初稿。';
        const profileDraft = profileToDraft(profile, 'local-recovery');
        const { directionPlan: currentDirectionPlan } = await storage.get('directionPlan');
        const directionPlan = buildDirectionPlan(profile, currentDirectionPlan, {
          confirmed: false,
          preserveSelections: true,
          preserveEdits: true,
          preserveCustom: true
        });
        await storage.set({ profile, profileDraft, directionPlan });
        await writeEvent('info', '已从已保存简历恢复可编辑画像', { directions: profile.primaryDirections });
        reply({ ok: true, profile, profileDraft, directionPlan, generation: profile.generation });
        break;
      }
      case 'BUILD_PROFILE': {
        const { resumeText, directionPlan: currentDirectionPlan } = await storage.get(['resumeText', 'directionPlan']);
        const profile = await buildProfile(resumeText || '');
        const profileDraft = profileToDraft(profile, profile.generation?.mode || 'generated');
        const directionPlan = buildDirectionPlan(profile, currentDirectionPlan, {
          confirmed: false,
          preserveSelections: true,
          preserveEdits: true,
          preserveCustom: true
        });
        await storage.set({ profile, profileDraft, directionPlan });
        const generation = profile.generation || {};
        const local = generation.mode === 'local-fallback';
        const eventTitle = !local
          ? (generation.mode === 'ai-compact-retry' ? 'AI 精简重试成功，职业画像已生成' : '职业画像已生成')
          : generation.aiStatus === 'service-error'
            ? 'AI 请求失败，已生成本地可编辑画像'
            : generation.aiStatus === 'config-missing'
              ? 'AI 尚未配置，已生成本地可编辑画像'
              : 'AI 输出未通过校验，已生成本地可编辑画像';
        await writeEvent(local ? 'warning' : 'info', eventTitle,
          { directions: profile.primaryDirections, generation });
        reply({ ok: true, profile, profileDraft, directionPlan, generation, warning: generation.warning || '' });
        break;
      }
      case 'SAVE_PROFILE_DRAFT': {
        const { profileDraft: currentDraft } = await storage.get('profileDraft');
        const profileDraft = normalizeProfileDraft(message.profileDraft, currentDraft);
        await storage.set({ profileDraft });
        reply({ ok: true, profileDraft });
        break;
      }
      case 'SAVE_PROFILE': {
        const { profile: currentProfile, config = {}, profileDraft: currentDraft, directionPlan: currentDirectionPlan } = await storage.get(['profile', 'config', 'profileDraft', 'directionPlan']);
        const profile = normalizeProfile(message.profile, currentProfile);
        const profileDraft = profileToDraft(profile, 'manual-save');
        const keepDirectionConfirmation = Boolean(
          currentDirectionPlan?.confirmed
          && profileDirectionSignature(currentProfile || {}) === profileDirectionSignature(profile)
        );
        const directionPlan = buildDirectionPlan(profile, currentDirectionPlan, {
          confirmed: keepDirectionConfirmation,
          preserveSelections: true,
          preserveEdits: true,
          preserveCustom: true
        });
        const hard = profile.hardConstraints || {};
        const nextConfig = {
          ...config,
          targetLocations: hard.locations?.length ? hard.locations : (config.targetLocations || []),
          employmentTypes: hard.employmentTypes?.length ? hard.employmentTypes : (config.employmentTypes || ['不限']),
          experiences: hard.experience ? [hard.experience] : (config.experiences || []),
          degrees: hard.degree ? [hard.degree] : (config.degrees || []),
          salary: hard.salary || config.salary || '不限'
        };
        await storage.set({ profile, profileDraft, directionPlan, config: nextConfig });
        await writeEvent('info', '职业画像已手动保存', { directions: profile.primaryDirections });
        reply({ ok: true, profile, profileDraft, directionPlan, config: nextConfig });
        break;
      }
      case 'REBUILD_DIRECTION_PLAN': {
        const stored = await storage.get(['profile', 'profileDraft', 'directionPlan']);
        let profile = stored.profile;
        if (!profileHasCore(profile) && profileDraftHasCore(stored.profileDraft)) {
          profile = profileFromDraft(stored.profileDraft, profile);
          await storage.set({ profile });
        }
        if (!profileHasCore(profile)) throw new Error('请先生成职业画像');
        const directionPlan = buildDirectionPlan(profile, stored.directionPlan, {
          confirmed: false,
          preserveSelections: false,
          preserveEdits: false,
          preserveCustom: true
        });
        await storage.set({ directionPlan });
        await writeEvent('info', '已重新生成岗位方向推荐', {
          directions: directionPlan.items.map(item => item.name),
          enabled: directionPlan.items.filter(item => item.enabled).length
        });
        reply({ ok: true, directionPlan });
        break;
      }
      case 'SAVE_DIRECTION_PLAN': {
        const stored = await storage.get(['profile', 'config', 'workflow', 'directionPlan']);
        if (!profileHasCore(stored.profile)) throw new Error('请先生成职业画像');
        const directionPlan = normalizeDirectionPlan(message.directionPlan, stored.profile, {
          confirmed: true,
          updatedAt: Date.now(),
          appliedAt: Date.now()
        });
        const selected = selectedDirectionItems(directionPlan);
        if (!selected.length) throw new Error('至少选择一个要投递的岗位方向');
        const tasks = createTasks(stored.profile, stored.config || DEFAULTS.config, directionPlan);
        if (!tasks.length) throw new Error('所选岗位方向没有可用搜索词，请先补充关键词');
        await storage.set({ directionPlan });
        await writeEvent('info', '投递岗位方向已保存', {
          directions: selected.map(item => item.name),
          taskCount: tasks.length,
          appliesNextRun: Boolean(stored.workflow?.running)
        });
        reply({
          ok: true,
          directionPlan,
          selectedCount: selected.length,
          taskCount: tasks.length,
          appliesNextRun: Boolean(stored.workflow?.running)
        });
        break;
      }
      case 'TEST_AI': {
        const { config = {} } = await storage.get('config');
        const status = publicAiStatus(config);
        if (status.route === 'rules') {
          reply({ ok: true, text: '未连接模型，本地轻量算法可用', status });
          break;
        }
        const text = await callModel([
          { role: 'system', content: '只回复“连接正常”。' },
          { role: 'user', content: '测试连接' }
        ], false);
        reply({ ok: true, text, status });
        break;
      }
      case 'OPEN_BOSS_JOBS': {
        const tab = await activeBossTab();
        if (tab?.id) {
          await withTimeout(chrome.tabs.update(tab.id, { url: BOSS_JOBS_HOME_URL }), 3000, '打开 BOSS 职位页');
          reply({ ok: true, tabId: tab.id });
        } else {
          const created = await withTimeout(chrome.tabs.create({ url: BOSS_JOBS_HOME_URL, active: true }), 3000, '打开 BOSS 职位页');
          reply({ ok: true, tabId: created?.id || null });
        }
        break;
      }
      case 'PROBE_BOSS': {
        const tab = await activeBossTab();
        if (!tab) throw new Error('请先打开并登录 BOSS 直聘');
        const result = await ensureBossReceiver(tab);
        reply({ ok: true, result: { ...result, tabId: tab.id, title: tab.title || '', url: tab.url || '' } });
        break;
      }
      case 'START': {
        const requestId = String(message.requestId || crypto.randomUUID());
        const existing = await storage.get(['workflow', 'safetyState']);
        if (existing.safetyState?.circuitOpen) throw new Error(`安全熔断未重置：${existing.safetyState.circuitReason || '请先检查页面状态'}`);
        if (startupIsFresh(existing.workflow?.startup)) {
          reply({ ok: true, starting: true, alreadyStarting: true, startup: existing.workflow.startup });
          break;
        }

        const startedAt = Date.now();
        await patchStartup({
          id: requestId,
          state: 'starting',
          step: 'local-check',
          message: '正在检查简历与岗位方向',
          startedAt,
          deadlineAt: startedAt + STARTUP_TOTAL_TIMEOUT_MS,
          completedAt: 0,
          error: '',
          tabId: null,
          pageType: '',
          transport: 'chrome-message'
        }, {
          running: false,
          paused: true,
          phase: 'starting',
          statusText: '正在检查简历与岗位方向'
        });

        try {
          const stored = await storage.get(['profile', 'profileDraft', 'resumeText', 'config', 'directionPlan']);
          let profile = stored.profile;
          const config = stored.config;
          if (!profileHasCore(profile) && profileDraftHasCore(stored.profileDraft)) {
            profile = profileFromDraft(stored.profileDraft, profile);
            await storage.set({ profile });
          }
          if (!profileHasCore(profile) && String(stored.resumeText || '').trim().length >= 30) {
            profile = buildLocalProfile(stored.resumeText || '');
            profile.generation.mode = 'local-recovery';
            profile.generation.label = '本地初稿';
            const profileDraft = profileToDraft(profile, 'start-recovery');
            await storage.set({ profile, profileDraft });
          }
          if (!profileHasCore(profile)) throw new Error('请先生成职业画像');
          let directionPlan = stored.directionPlan;
          if (!directionPlan?.items?.length) {
            directionPlan = buildDirectionPlan(profile, null, { confirmed: false });
            await storage.set({ directionPlan });
          }
          directionPlan = normalizeDirectionPlan(directionPlan, profile);
          if (!directionPlan.confirmed) throw new Error('请先在“简历 → 职业画像”中选择要投递的岗位方向并保存');
          if (!selectedDirectionItems(directionPlan).length) throw new Error('至少选择一个要投递的岗位方向');
          const tasks = createTasks(profile, config, directionPlan);
          if (!tasks.length) throw new Error('所选岗位方向没有可执行的搜索词，请补充方向关键词');

          await patchStartup({ step: 'find-tab', message: '正在查找当前 BOSS 页面' }, { statusText: '正在查找当前 BOSS 页面' });
          let tab = await withTimeout(activeBossTab(), 2500, '查找当前 BOSS 页面');
          if (!tab) throw new Error('请先打开并登录 BOSS 直聘，并保持 BOSS 标签页处于当前窗口');
          await patchStartup({ step: 'page-ready', message: '正在等待 BOSS 页面加载完成', tabId: tab.id }, { statusText: '正在等待 BOSS 页面加载完成' });
          if (tab.status !== 'complete') tab = await waitForTabReady(tab.id, 3800) || tab;

          await patchStartup({ step: 'receiver', message: '正在连接 BOSS 页面助手', tabId: tab.id }, { statusText: '正在连接 BOSS 页面助手' });
          const probe = await withTimeout(ensureBossReceiver(tab), STARTUP_TOTAL_TIMEOUT_MS - Math.min(STARTUP_TOTAL_TIMEOUT_MS - 1200, Date.now() - startedAt), '连接 BOSS 页面助手');
          if (probe?.verification || probe?.pageType === 'verification') throw new Error('检测到 BOSS 安全验证 请先完成验证');

          const workflow = {
            ...DEFAULTS.workflow,
            running: true,
            paused: false,
            phase: 'search',
            statusText: '正在启动岗位采集',
            tasks,
            activeRunId: null,
            chatRecovery: null,
            startup: {
              ...DEFAULTS.workflow.startup,
              id: requestId,
              state: 'starting',
              step: 'dispatch',
              message: '正在把任务交给 BOSS 页面',
              startedAt,
              deadlineAt: startedAt + STARTUP_TOTAL_TIMEOUT_MS,
              tabId: tab.id,
              pageType: probe?.pageType || '',
              transport: 'chrome-message'
            }
          };
          await storage.set({ workflow, chatTransition: null });
          const probeHasCapabilities = probe && ['hasSearch', 'hasDetail', 'cards'].some(key => Object.prototype.hasOwnProperty.call(probe, key));
          const needsJobsPage = probe?.pageType === 'chat'
            || probe?.pageType === 'other'
            || (probeHasCapabilities && !probe?.hasSearch && !probe?.hasDetail && Number(probe?.cards || 0) <= 0);
          if (needsJobsPage) {
            await patchStartup({ step: 'navigate', message: '正在打开 BOSS 职位页', tabId: tab.id }, { statusText: '正在打开 BOSS 职位页' });
            await withTimeout(chrome.tabs.update(tab.id, { url: BOSS_JOBS_HOME_URL }), 3000, '打开 BOSS 职位页');
            await patchStartup({
              state: 'complete', step: 'navigate', message: '职位页打开后将自动开始', completedAt: Date.now(), pageType: 'jobs'
            }, { running: true, paused: false, phase: 'search', statusText: '职位页加载完成后将自动开始采集' });
            await writeEvent('info', '任务已启动并自动切换到 BOSS 职位页', { taskCount: workflow.tasks.length, tabId: tab.id, previousPageType: probe?.pageType || '' });
            reply({ ok: true, navigating: true, startup: (await storage.get('workflow')).workflow?.startup });
            break;
          }

          await patchStartup({ step: 'dispatch', message: '正在启动岗位采集', tabId: tab.id, pageType: probe?.pageType || '' }, { statusText: '正在启动岗位采集' });
          await withTimeout(chrome.tabs.sendMessage(tab.id, { type: 'RUN' }), BOSS_COMMAND_TIMEOUT_MS, '启动岗位采集');
          const completed = await patchStartup({
            state: 'complete',
            step: 'running',
            message: '岗位采集已启动',
            completedAt: Date.now(),
            error: '',
            tabId: tab.id,
            pageType: probe?.pageType || ''
          }, { running: true, paused: false, phase: 'search', statusText: '岗位采集已启动' });
          await writeEvent('info', '任务已启动', { taskCount: workflow.tasks.length, tabId: tab.id, pageType: probe?.pageType || '' });
          reply({ ok: true, startup: completed.startup });
        } catch (error) {
          const messageText = bossConnectionError(error);
          const failed = await patchStartup({
            state: 'failed',
            step: 'failed',
            message: '启动失败',
            completedAt: Date.now(),
            error: messageText
          }, {
            running: false,
            paused: true,
            phase: 'idle',
            statusText: messageText
          });
          await writeEvent('warning', '任务启动失败', { error: messageText, requestId }).catch(() => {});
          reply({ ok: false, error: messageText, startup: failed.startup });
        }
        break;
      }
      case 'PAUSE': {
        const { workflow = {} } = await storage.get('workflow');
        const revision = Number(workflow.controlRevision || 0) + 1;
        abortActiveAiRequests('user-pause');
        await patchWorkflow({ paused: true, phase: 'pausing', pauseRequestedAt: Date.now(), controlRevision: revision, statusText: '正在立即暂停…' });
        await broadcastBossControl('PAUSE_NOW', { revision });
        await patchWorkflow({ paused: true, phase: 'paused', statusText: '用户已暂停' });
        await writeEvent('info', '任务已立即暂停', { revision });
        reply({ ok: true, revision });
        break;
      }
      case 'STOP': {
        const { workflow = {} } = await storage.get('workflow');
        const revision = Number(workflow.controlRevision || 0) + 1;
        abortActiveAiRequests('user-stop');
        await patchWorkflow({ running: false, paused: true, phase: 'stopping', stopRequestedAt: Date.now(), controlRevision: revision, statusText: '正在立即停止…', pendingApplyId: null, activeRunId: null });
        await broadcastBossControl('STOP_NOW', { revision });
        await patchWorkflow({ running: false, paused: true, phase: 'idle', statusText: '用户已停止', pendingApplyId: null, activeRunId: null });
        await writeEvent('info', '任务已立即停止', { revision });
        reply({ ok: true, revision });
        break;
      }
      case 'AI_STATUS': {
        const { config = {} } = await storage.get('config');
        reply({ ok: true, status: publicAiStatus(config) });
        break;
      }
      case 'AI_JOB':
        reply({ ok: true, result: await analyzeJob(message.job) });
        break;
      case 'CHAT_BINDING_PREPARE': {
        if (!message.pendingId || !message.expected) throw new Error('岗位与 HR 会话绑定信息不完整');
        const transition = {
          pendingId: String(message.pendingId),
          job: safeClone(message.job || {}),
          expected: safeClone(message.expected || {}),
          preparedAt: Date.now()
        };
        await storage.set({ chatTransition: transition });
        reply({ ok: true, transition });
        break;
      }
      case 'CHAT_BINDING_CHECK': {
        const expected = message.expected || {};
        const recruiterName = String(message.context?.recruiterName || expected.recruiterName || '').trim();
        const company = String(message.context?.companyName || expected.company || message.job?.company || '').trim();
        const key = deriveConversationReservationKey(message.context || {}, expected, message.pendingId);
        if (!key) {
          reply({ ok: false, allowed: false, error: '目标 HR 已核验，但无法建立安全投递锁' });
          break;
        }
        const { chatDeliveryLedger = {} } = await storage.get('chatDeliveryLedger');
        const existing = chatDeliveryLedger[key];
        const identityExisting = Object.values(chatDeliveryLedger).find(entry =>
          entry?.pendingId !== message.pendingId
          && ['reserved', 'sent'].includes(String(entry?.status || ''))
          && sameRecruiterReservation(entry, recruiterName, company)
        );
        const conflict = existing && existing.pendingId !== message.pendingId ? existing : identityExisting;
        if (conflict) {
          reply({
            ok: true,
            allowed: false,
            error: `当前 HR 会话已绑定其他岗位任务，禁止继续发送`,
            existing: conflict
          });
          break;
        }
        const reservation = {
          ...(existing || {}),
          conversationKey: key,
          pendingId: String(message.pendingId || ''),
          runId: String(message.runId || ''),
          jobUrl: String(message.job?.url || ''),
          jobTitle: String(message.job?.title || ''),
          company: String(message.job?.company || ''),
          recruiterName,
          company,
          chatUrl: String(message.context?.url || ''),
          status: existing?.status === 'sent' ? 'sent' : 'reserved',
          reservedAt: existing?.reservedAt || Date.now(),
          updatedAt: Date.now()
        };
        await storage.set({ chatDeliveryLedger: { ...chatDeliveryLedger, [key]: reservation } });
        reply({ ok: true, allowed: true, conversationKey: key, reservation });
        break;
      }
      case 'CHAT_BINDING_CONFIRMED': {
        const transition = {
          pendingId: String(message.pendingId || ''),
          job: safeClone(message.job || {}),
          expected: safeClone(message.expected || {}),
          context: safeClone(message.context || {}),
          confirmedAt: Date.now()
        };
        await storage.set({ chatTransition: transition });
        reply({ ok: true, transition });
        break;
      }
      case 'MATERIAL': {
        const { resumeImage, config } = await storage.get(['resumeImage', 'config']);
        reply({ ok: true, resumeImage, config });
        break;
      }
      case 'CONTENT_STATE':
        reply({ ok: true, state: await storage.all() });
        break;
      case 'WORKFLOW':
        reply({ ok: true, workflow: await patchWorkflow(message.patch || {}) });
        break;
      case 'STATS':
        reply({ ok: true, stats: await changeStats(message.delta || {}) });
        break;
      case 'TASK_PROGRESS': {
        const run = await upsertTaskRun(message.run || {});
        if (message.setActive) await patchWorkflow({ activeRunId: run.id });
        reply({ ok: true, run });
        break;
      }
      case 'SEARCH_TASK_PROGRESS':
        reply({ ok: true, task: await updateSearchTaskProgress(message) });
        break;
      case 'RETRY_FAILED_TASK':
        reply({ ok: true, ...(await retryFailedTask(message.runId)) });
        break;
      case 'RETRY_ALL_FAILED_TASKS':
        reply({ ok: true, ...(await retryAllFailedTasks()) });
        break;
      case 'IGNORE_FAILED_TASK':
        reply({ ok: true, run: await ignoreFailedTask(message.runId) });
        break;
      case 'OPEN_TASK_JOB': {
        const url = String(message.url || '').trim();
        if (!/^https:\/\/(?:www|app)\.zhipin\.com\//i.test(url)) throw new Error('岗位地址无效');
        const tab = await chrome.tabs.create({ url, active: true });
        reply({ ok: true, tabId: tab.id });
        break;
      }
      case 'EVENT':
        reply({ ok: true, event: await writeEvent(message.level || 'info', message.message || '', message.data || {}) });
        break;
      case 'PENDING':
        reply({ ok: true, item: await addPending(message.item || {}) });
        break;
      case 'APPROVE':
        reply({ ok: true, item: await approvePending(message.id, message.greeting || '') });
        break;
      case 'REJECT':
        await rejectPending(message.id);
        reply({ ok: true });
        break;
      case 'APPROVE_ALL':
        reply({ ok: true, ...(await approveAllPending()) });
        break;
      case 'REJECT_ALL':
        reply({ ok: true, ...(await rejectAllPending()) });
        break;
      case 'AUTO_APPROVE': {
        const { pending = [] } = await storage.get('pending');
        const next = rerankPending(pending.map(entry => entry.id === message.id
          ? {
              ...entry,
              deliveryGreeting: String(message.greeting || entry.deliveryGreeting || entry.analysis?.greeting || '').trim(),
              status: 'approved_queue',
              approvedAt: Date.now()
            }
          : entry));
        await storage.set({ pending: next });
        reply({ ok: true, ...(await dispatchNextAutoPending()) });
        break;
      }
      case 'AUTO_DISPATCH_NEXT':
        reply({ ok: true, ...(await dispatchNextAutoPending()) });
        break;
      case 'SKIP_PENDING':
        reply({ ok: true, ...(await skipPendingTask(message.id, message.reason, message.stageLabel)) });
        break;
      case 'APPLY_COMPLETE': {
        const { pending = [], config = {}, stats = {}, chatDeliveryLedger = {}, chatTransition = null, deliveryHistory = [] } = await storage.get(['pending', 'config', 'stats', 'chatDeliveryLedger', 'chatTransition', 'deliveryHistory']);
        const completedAt = Date.now();
        let completedItem = null;
        let next = pending.map(entry => {
          if (entry.id !== message.id) return entry;
          completedItem = { ...entry, status: message.ok ? 'sent' : 'failed', completedAt, error: message.error || '' };
          return completedItem;
        });
        const updatedStats = {
          ...stats,
          pending: next.filter(entry => entry.status === 'pending').length,
          sent: Number(stats?.sent || 0) + (message.ok ? 1 : 0),
          failed: Number(stats?.failed || 0) + (message.ok ? 0 : 1)
        };
        const conversationKey = String(message.conversation?.key || '');
        let nextLedger = chatDeliveryLedger;
        if (conversationKey && chatDeliveryLedger[conversationKey]?.pendingId === message.id) {
          nextLedger = {
            ...chatDeliveryLedger,
            [conversationKey]: {
              ...chatDeliveryLedger[conversationKey],
              status: message.ok ? 'sent' : 'failed',
              sentAt: message.ok ? completedAt : (chatDeliveryLedger[conversationKey].sentAt || null),
              failedAt: message.ok ? null : completedAt,
              error: message.error || '',
              updatedAt: completedAt
            }
          };
        }
        const nextTransition = chatTransition?.pendingId === message.id ? null : chatTransition;
        const cooldownMinutes = Math.max(5, Math.min(24 * 60, Number(message.cooldownMinutes || (message.failureClass === 'chat_entry' ? 360 : 90))));
        const historyEntry = completedItem?.job
          ? createHistoryEntry(completedItem.job, message.ok ? 'sent' : 'failed', completedAt, {
              pendingId: message.id,
              runId: completedItem.runId || '',
              stage: message.stage || '',
              failureClass: message.failureClass || '',
              error: message.error || '',
              cooldownUntil: message.ok ? 0 : completedAt + cooldownMinutes * 60 * 1000
            })
          : null;
        const nextHistory = historyEntry ? [historyEntry, ...deliveryHistory].slice(0, 2000) : deliveryHistory;
        await storage.set({ pending: next, stats: updatedStats, chatDeliveryLedger: nextLedger, chatTransition: nextTransition, deliveryHistory: nextHistory });
        const safetyAfter = await applySafetyOutcome({ ok: Boolean(message.ok), reason: message.error || (message.ok ? '' : '投递失败') });
        const completedRun = await updateTaskRunByPending(message.id, message.ok
          ? {
              status: 'success', stage: 'success', progress: 100, stageLabel: '投递成功', error: '',
              retryable: false, completedAt, result: message.result || 'sent'
            }
          : {
              status: 'failed', stage: message.stage || 'failed', progress: 100,
              stageLabel: message.stageLabel || '投递失败', error: message.error || '投递失败',
              retryable: message.retryable !== false, retryRequestedAt: 0, completedAt
            });
        await writeEvent(message.ok ? 'success' : 'error', message.ok ? '求职投递成功' : '求职投递失败', {
          id: message.id,
          runId: completedRun?.id || completedItem?.runId || '',
          job: completedItem?.job,
          stage: message.stage || '',
          error: message.error || ''
        });
        if (safetyAfter.circuitOpen) {
          reply({ ok: true, circuitOpen: true, reason: safetyAfter.circuitReason });
          break;
        }

        const validationPending = message.ok
          && config.executionMode === 'auto'
          && config.requireSingleJobValidation !== false
          && !Number(config.singleJobValidationCompletedAt || 0);
        if (validationPending) {
          const nextConfig = { ...config, singleJobValidationCompletedAt: completedAt };
          await storage.set({ config: nextConfig });
          await patchWorkflow({
            running: false,
            paused: true,
            pendingApplyId: null,
            activeRunId: null,
            phase: 'idle',
            statusText: '单条验收已通过并自动暂停；确认聊天文字和附件后可继续批量'
          });
          await writeEvent('success', '首次单条投递验收通过', {
            id: message.id,
            runId: completedRun?.id || completedItem?.runId || '',
            job: completedItem?.job,
            completedAt
          });
          reply({ ok: true, validationCompleted: true, pausedForValidation: true });
          break;
        }

        if (updatedStats.sent >= Number(config.dailyTarget || 30)) {
          await patchWorkflow({ running: false, paused: true, pendingApplyId: null, activeRunId: null, phase: 'idle', statusText: `已完成今日 ${updatedStats.sent} 次成功投递` });
          reply({ ok: true, targetReached: true });
          break;
        }

        // 任何文字未确认场景都暂停当前队列，但只有输入框中确实存在完整招呼语时，
        // 才提示“草稿已保留”。输入框为空时必须明确提示写入失败，不能误导用户。
        if (!message.ok && message.pauseQueue) {
          const draftPresent = message.preserveDraft === true || message.draftPresent === true;
          await patchWorkflow({
            running: false,
            paused: true,
            pendingApplyId: null,
            activeRunId: completedRun?.id || completedItem?.runId || null,
            phase: 'apply',
            statusText: draftPresent
              ? '发送未确认，已暂停队列；当前招呼语仍在输入框'
              : '文字没有写入或没有发送，已暂停队列并停留在当前 HR 页面'
          });
          await writeEvent('warning', draftPresent
            ? '自动投递已暂停，当前招呼语仍保留在输入框'
            : '自动投递已暂停，聊天输入框中没有完整招呼语', {
            id: message.id,
            runId: completedRun?.id || completedItem?.runId || '',
            job: completedItem?.job,
            draftPresent,
            editorDiagnostics: message.editorDiagnostics || null,
            error: message.error || ''
          });
          reply({ ok: true, pausedForDraft: draftPresent, pausedForSendFailure: true });
          break;
        }

        next = rerankPending(next);
        const queued = next.find(entry => entry.status === 'approved_queue');
        if (queued) {
          next = next.map(entry => entry.id === queued.id ? { ...entry, status: 'approved' } : entry);
          await storage.set({ pending: next });
          const remaining = next.filter(entry => entry.status === 'approved_queue').length;
          const queuedRun = await updateTaskRunByPending(queued.id, {
            status: 'running', stage: 'queued', progress: 64, stageLabel: '准备投递', error: '', completedAt: null
          });
          await patchWorkflow({
            pendingApplyId: queued.id,
            activeRunId: queuedRun?.id || queued.runId || null,
            chatRecovery: null,
            running: true,
            paused: false,
            phase: 'apply',
            statusText: `继续批量投递：${queued.job?.title || '岗位'}（剩余 ${remaining}）`
          });
          const pacingMs = Math.max(3000, Math.min(30000, Number(config.betweenJobsSeconds || 12) * 1000));
          await patchWorkflow({ statusText: `当前岗位处理完成，${Math.round(pacingMs / 1000)} 秒后继续批量投递` });
          setTimeout(() => sendToBoss({ type: 'RUN' }).catch(() => {}), pacingMs);
        } else {
          const pacingMs = Math.max(3000, Math.min(30000, Number(config.betweenJobsSeconds || 12) * 1000));
          await patchWorkflow({ pendingApplyId: null, activeRunId: null, chatRecovery: null, phase: 'search', statusText: message.ok ? `文字投递已确认，${Math.round(pacingMs / 1000)} 秒后继续筛选` : `当前岗位失败，${Math.round(pacingMs / 1000)} 秒后继续筛选` });
          setTimeout(() => sendToBoss({ type: 'RUN' }).catch(() => {}), pacingMs);
        }
        reply({ ok: true });
        break;
      }
      case 'BRIDGE_STATUS':
        try { reply({ ok: true, result: await bridge('/status') }); }
        catch (error) { reply({ ok: false, error: error.message }); }
        break;
      case 'BRIDGE_DIAGNOSE':
        reply({ ok: true, result: await diagnoseBridge() });
        break;
      case 'BRIDGE_REPORT_NOW':
        try {
          await syncBridgeSnapshot(true);
          reply({ ok: true, result: await bridge('/report/generate', { force: true }) });
        } catch (error) { reply({ ok: false, error: error.message }); }
        break;
      case 'BRIDGE_REPORT':
        try { reply({ ok: true, result: await bridge('/report') }); }
        catch (error) { reply({ ok: false, error: error.message }); }
        break;
      case 'BRIDGE_COMMAND':
        try { reply({ ok: true, result: await bridge('/command', { type: message.command }) }); }
        catch (error) { reply({ ok: false, error: error.message }); }
        break;
      default:
        reply({ ok: false, error: 'unknown message' });
    }
  })().catch(async error => {
    await writeEvent('error', '后台处理失败', { type: message?.type, error: error.message });
    reply({ ok: false, error: error.message });
  });
  return true;
});
