import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const code = await readFile('dist/chrome-extension/content-v37.js', 'utf8');

const makeLeaf = value => ({
  innerText: value,
  textContent: value,
  getBoundingClientRect: () => ({ width: 180, height: 32, left: 420, top: 120 }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getAttribute: () => null,
  className: ''
});

const titleLeaf = makeLeaf('前端开发工程师');
const companyLeaf = makeLeaf('华为成都研究所');
const detail = {
  innerText: '前端开发工程师 华为成都研究所 成都 职位描述 负责前端开发工作 任职要求 熟练掌握 React TypeScript 立即沟通',
  textContent: '',
  className: 'job-detail-box',
  getBoundingClientRect: () => ({ width: 650, height: 720, left: 430, top: 160 }),
  querySelector(selector) {
    if (/h1|h2|job-name|job-title|jobName/.test(selector)) return titleLeaf;
    if (/company-name|companyName|company/.test(selector)) return companyLeaf;
    return null;
  },
  querySelectorAll: () => [],
  getAttribute: () => null
};
const anchor = makeLeaf('前端开发工程师');
anchor.href = 'https://www.zhipin.com/job_detail/abc.html';
const card = {
  innerText: '前端开发工程师 11-22K 华为成都研究所 成都 经验不限 本科',
  textContent: '',
  className: 'job-card-wrapper active',
  getBoundingClientRect: () => ({ width: 360, height: 150, left: 40, top: 320 }),
  querySelector(selector) {
    if (selector.includes('a[href*="job_detail"]')) return anchor;
    if (/job-name|job-title|jobName|h3|h4/.test(selector)) return titleLeaf;
    if (/company-name|companyName|company/.test(selector)) return companyLeaf;
    if (/active|selected|aria-selected/.test(selector)) return makeLeaf('');
    return null;
  },
  querySelectorAll: () => [],
  getAttribute(name) {
    if (name === 'aria-selected') return 'true';
    if (name === 'data-jobid') return 'abc';
    return null;
  },
  scrollIntoView() {}
};

const document = {
  body: { innerText: detail.innerText },
  querySelector: selector => selector === '.job-detail-box' ? detail : null,
  querySelectorAll(selector) {
    if (selector === '.job-detail-box') return [detail];
    return [];
  }
};
const listeners = {};
const sandbox = {
  __JOBCLAW_TEST_MODE__: true,
  document,
  innerWidth: 1200,
  location: { href: 'https://www.zhipin.com/web/geek/job' },
  history: { back() {} },
  chrome: {
    runtime: {
      sendMessage: async () => ({ ok: true }),
      onMessage: { addListener: listener => { listeners.message = listener; } }
    }
  },
  getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
  setTimeout: () => 0,
  clearTimeout: () => {},
  PointerEvent: class PointerEvent {},
  MouseEvent: class MouseEvent {},
  InputEvent: class InputEvent {},
  Event: class Event {},
  KeyboardEvent: class KeyboardEvent {},
  HTMLTextAreaElement: class HTMLTextAreaElement {},
  HTMLInputElement: class HTMLInputElement {},
  DataTransfer: class DataTransfer {},
  File: class File {},
  Uint8Array,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  console
};
sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox, { filename: 'content.js' });
const adapter = sandbox.__JOBCLAW_TEST_API__?.adapter;
if (!adapter) throw new Error('未暴露内容脚本测试接口');
if (!adapter.detailMatchesCard(detail, card)) throw new Error('已选中岗位与现有详情未能匹配');
const opened = await adapter.openCard(card);
if (opened !== detail) throw new Error('默认已选中岗位仍触发等待或返回空');

const otherCompany = makeLeaf('其他公司');
const otherCard = { ...card, className: 'job-card-wrapper', getAttribute: () => null };
otherCard.querySelector = selector => {
  if (selector.includes('a[href*="job_detail"]')) return anchor;
  if (/job-name|job-title|jobName|h3|h4/.test(selector)) return titleLeaf;
  if (/company-name|companyName|company/.test(selector)) return otherCompany;
  return null;
};
if (adapter.detailMatchesCard(detail, otherCard)) throw new Error('同名岗位但公司不同被错误匹配');

for (const token of [
  '岗位详情暂未加载，已跳过当前岗位继续采集',
  '当前岗位详情未就绪，已自动继续下一个',
  'BOSS 使用虚拟列表',
  '页面暂时未就绪，等待自动重试'
]) {
  if (!code.includes(token)) throw new Error(`详情容错逻辑缺少：${token}`);
}
if (code.includes('执行失败：${error.message}')) throw new Error('仍会把临时详情问题显示为整轮执行失败');

console.log(JSON.stringify({
  ok: true,
  selectedCardReuse: true,
  titleCompanyMatch: true,
  sameTitleWrongCompanyRejected: true,
  staleDomRefresh: true,
  perJobFailureIsolation: true,
  workflowContinuesAfterDetailTimeout: true
}, null, 2));
