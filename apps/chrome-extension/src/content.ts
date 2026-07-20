import type { JobPosting } from '@jobclaw/core';

interface JobClawRequest {
  type: 'JOBCLAW_GET_JOB' | 'JOBCLAW_FILL_GREETING' | 'JOBCLAW_SECURITY_STATE';
  payload?: { text?: string };
}

function firstText(selectors: string[]): string {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    const text = element?.innerText?.trim() || element?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function allTexts(selectors: string[]): string[] {
  const values = new Set<string>();
  for (const selector of selectors) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const text = element.innerText?.trim() || element.textContent?.trim();
      if (text && text.length <= 80) values.add(text);
    }
  }
  return [...values];
}

function inferMeta(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].trim();
  }
  return '';
}

function extractJob(): JobPosting {
  const title = firstText([
    'h1', '.job-name', '.job-title', '[class*="job-name"]', '[class*="job-title"]'
  ]);
  const company = firstText([
    '.company-name', '.sider-company .company-info a', '[class*="company-name"]',
    '[class*="company-info"] a'
  ]);
  const salary = firstText([
    '.salary', '.job-salary', '[class*="salary"]'
  ]);
  const jobLocation = firstText([
    '.job-area', '.location-address', '[class*="job-area"]', '[class*="location"]'
  ]);
  const description = firstText([
    '.job-sec-text', '.job-detail-body', '.job-detail', '[class*="job-sec-text"]',
    '[class*="job-detail-body"]', '[class*="job-description"]'
  ]);
  const tags = allTexts([
    '.job-tags span', '.job-tags li', '[class*="job-tag"] span', '[class*="job-tag"] li'
  ]);
  const recruiter = firstText([
    '.boss-name', '.name-wrapper .name', '[class*="boss-name"]', '[class*="recruiter"]'
  ]).replace(/在线|刚刚活跃|今日活跃/g, '').trim();
  const metaText = firstText([
    '.job-primary .info-primary', '.job-detail-header', '[class*="job-primary"]',
    '[class*="job-summary"]'
  ]);

  return {
    platform: window.location.hostname === 'www.zhipin.com' ? 'boss' : 'unknown',
    url: window.location.href,
    title,
    company,
    salary,
    location: jobLocation,
    experience: inferMeta(metaText, [/经验不限/, /在校生/, /应届生/, /\d+[-~—至]\d+年/, /\d+年以上/]),
    education: inferMeta(metaText, [/学历不限/, /大专/, /本科/, /硕士/, /博士/]),
    description,
    tags,
    recruiter,
    capturedAt: new Date().toISOString()
  };
}

function securityState(): { blocked: boolean; reason: string } {
  const text = document.body?.innerText || '';
  const signals = ['安全验证', '请完成验证', '滑动验证', '账号异常', '访问过于频繁', '重新登录'];
  const signal = signals.find((item) => text.includes(item));
  return signal ? { blocked: true, reason: `页面出现“${signal}”` } : { blocked: false, reason: '' };
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function fillGreeting(text: string): { ok: boolean; message: string } {
  const security = securityState();
  if (security.blocked) return { ok: false, message: `已停止：${security.reason}` };

  const candidates = [
    ...document.querySelectorAll<HTMLTextAreaElement>('textarea'),
    ...document.querySelectorAll<HTMLElement>('[contenteditable="true"]')
  ].filter((element) => isVisible(element));

  const target = candidates.find((element) => {
    const placeholder = element.getAttribute('placeholder') || '';
    const aria = element.getAttribute('aria-label') || '';
    return /消息|招呼|沟通|输入|回复/.test(`${placeholder} ${aria}`);
  }) ?? candidates.at(-1);

  if (!target) return { ok: false, message: '没有找到可见的消息输入框，请先打开沟通或招呼窗口。' };

  target.focus();
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const descriptor = Object.getOwnPropertyDescriptor(
      target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    );
    descriptor?.set?.call(target, text);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    target.textContent = text;
    target.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text
    }));
  }

  return { ok: true, message: '招呼语已填入。JobClaw 不会自动点击发送，请人工确认。' };
}

chrome.runtime.onMessage.addListener((request: JobClawRequest, _sender: unknown, sendResponse: (response: unknown) => void) => {
  if (request.type === 'JOBCLAW_GET_JOB') {
    const security = securityState();
    sendResponse({ ok: !security.blocked, job: extractJob(), security });
    return;
  }

  if (request.type === 'JOBCLAW_SECURITY_STATE') {
    sendResponse({ ok: true, security: securityState() });
    return;
  }

  if (request.type === 'JOBCLAW_FILL_GREETING') {
    sendResponse(fillGreeting(request.payload?.text || ''));
  }
});
