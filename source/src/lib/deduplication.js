import { normalizeCompanyName } from './company-verifier.js';

function normalize(value = '') {
  return String(value || '').toLowerCase().replace(/[\s·•｜|()（）【】\[\]<>《》,，。.:：;；_\-—]/g, '').trim();
}

export function jobFingerprint(job = {}) {
  const url = String(job.url || '').split('#')[0].split('?')[0];
  const id = String(job.id || job.jobId || url.match(/job_detail\/([^/.?]+)/)?.[1] || '').trim();
  if (id) return `id:${id}`;
  return `text:${normalizeCompanyName(job.company)}:${normalize(job.title)}:${normalize(job.location)}`;
}

export function companyDailyCount(history = [], companyName = '', date = new Date().toISOString().slice(0, 10)) {
  const normalized = normalizeCompanyName(companyName);
  if (!normalized) return 0;
  return history.filter(entry => entry.date === date && normalizeCompanyName(entry.company) === normalized && entry.status === 'sent').length;
}

export function findDuplicate(job = {}, { pending = [], history = [], maxPerCompanyPerDay = 2, date = new Date().toISOString().slice(0, 10) } = {}) {
  const fingerprint = jobFingerprint(job);
  const pendingMatch = pending.find(entry => jobFingerprint(entry.job || {}) === fingerprint && !['rejected', 'ignored', 'failed'].includes(entry.status));
  if (pendingMatch) return { duplicate: true, reason: '当前队列中已存在同一岗位', fingerprint, existing: pendingMatch };
  const historical = history.find(entry => entry.fingerprint === fingerprint && entry.status === 'sent');
  if (historical) return { duplicate: true, reason: `该岗位已于${historical.date || '此前'}投递`, fingerprint, existing: historical };
  const companyCount = companyDailyCount(history, job.company, date);
  if (companyCount >= Number(maxPerCompanyPerDay || 2)) {
    return { duplicate: true, reason: `同一公司今日已投递${companyCount}个岗位 已达到上限`, fingerprint, companyCount };
  }
  return { duplicate: false, reason: '', fingerprint, companyCount };
}

export function createHistoryEntry(job = {}, status = 'sent', now = Date.now(), extra = {}) {
  return {
    id: extra.id || crypto.randomUUID(),
    fingerprint: jobFingerprint(job),
    jobId: job.id || job.jobId || '',
    title: job.title || '',
    company: job.company || '',
    url: job.url || '',
    status,
    date: new Date(now).toISOString().slice(0, 10),
    createdAt: now,
    ...extra
  };
}
