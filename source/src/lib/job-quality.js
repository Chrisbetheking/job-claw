function normalize(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/有限责任公司|股份有限公司|有限公司/g, '')
    .replace(/202\d届|急招|高薪|诚聘|直招|双休|五险一金/g, '')
    .replace(/[\s·•｜|()（）【】\[\]<>《》,，。.:：;；_\-—]/g, '')
    .trim();
}

function canonicalTitle(value = '') {
  return normalize(value)
    .replace(/实习生|实习岗|实习/g, '实习')
    .replace(/工程师|开发人员|技术员/g, '开发');
}

function fnv1a(value = '') {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function descriptionCore(job = {}) {
  return normalize(`${job.description || ''} ${job.cardText || ''}`).slice(0, 1800);
}

export function jobFamilyKey(job = {}) {
  return [normalize(job.company), canonicalTitle(job.title), normalize(job.location)].join(':');
}

export function jobContentFingerprint(job = {}) {
  const core = descriptionCore(job);
  if (core.length < 80) return '';
  return fnv1a(`${normalize(job.company)}:${canonicalTitle(job.title)}:${core}`);
}

export function evaluateJobQuality(job = {}) {
  const title = String(job.title || '').trim();
  const company = String(job.company || '').trim();
  const description = String(job.description || job.cardText || '').replace(/\s+/g, ' ').trim();
  const source = `${title} ${company} ${description}`;
  let score = 45;
  const signals = [];
  const hardSignals = [];

  if (title.length >= 3) score += 12;
  else { score -= 35; hardSignals.push('岗位名称缺失或过短'); }
  if (company.length >= 2) score += 12;
  else { score -= 35; hardSignals.push('公司名称缺失'); }
  if (description.length >= 260) score += 18;
  else if (description.length >= 100) score += 8;
  else { score -= 24; signals.push('岗位描述信息较少'); }
  if (job.location) score += 4;
  if (job.salary) score += 4;
  if (job.recruiterName) score += 3;
  if (/岗位职责|任职要求|职位描述|工作内容/.test(description)) score += 5;
  if (/薪资面议|轻松月入|日结|在家可做|零经验高薪|无需面试|当天入职|大量招聘|长期招聘/.test(source)) {
    score -= 18;
    signals.push('岗位描述存在泛化或批量招聘特征');
  }
  if (/销售|客服|推广|地推|电话邀约/.test(title) && description.length < 180) {
    score -= 10;
    signals.push('岗位标题较泛且描述不足');
  }
  if (/收费|押金|培训贷|先交|转账|购买设备/.test(source)) {
    score -= 45;
    hardSignals.push('岗位包含收费或转账风险词');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    level: score >= 70 ? 'high' : score >= 45 ? 'medium' : score >= 25 ? 'low' : 'very-low',
    signals,
    hardSignals,
    familyKey: jobFamilyKey(job),
    contentFingerprint: jobContentFingerprint(job)
  };
}

export function findSeenDuplicate(job = {}, history = [], { windowDays = 30 } = {}) {
  const now = Date.now();
  const minTime = now - Math.max(1, Number(windowDays || 30)) * 86400000;
  const familyKey = jobFamilyKey(job);
  const contentFingerprint = jobContentFingerprint(job);
  const match = (Array.isArray(history) ? history : []).find(entry => {
    if (Number(entry.seenAt || entry.createdAt || 0) < minTime) return false;
    if (entry.fingerprint && job.jobFingerprint && entry.fingerprint === job.jobFingerprint) return true;
    if (familyKey && entry.familyKey === familyKey) return true;
    return Boolean(contentFingerprint && entry.contentFingerprint === contentFingerprint);
  });
  if (!match) return null;
  return {
    duplicate: true,
    reason: match.familyKey === familyKey ? '同一公司 同一岗位和地区已在本轮或近期看过' : '岗位内容与近期已处理岗位高度重复',
    existing: match,
    familyKey,
    contentFingerprint
  };
}

export function createSeenJobEntry(job = {}, quality = {}, now = Date.now(), extra = {}) {
  return {
    id: extra.id || (globalThis.crypto?.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`),
    fingerprint: job.jobFingerprint || '',
    familyKey: quality.familyKey || jobFamilyKey(job),
    contentFingerprint: quality.contentFingerprint || jobContentFingerprint(job),
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    url: job.url || '',
    qualityScore: Number(quality.score || 0),
    status: extra.status || 'seen',
    seenAt: now,
    ...extra
  };
}
