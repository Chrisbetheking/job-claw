export function normalizeCompanyName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/有限责任公司|股份有限公司|有限公司|集团|分公司|公司/g, '')
    .replace(/[\s·•｜|()（）【】\[\]<>《》,，。.:：;；_\-—]/g, '')
    .trim();
}

export function companyCacheKey(companyName = '') {
  return normalizeCompanyName(companyName) || 'unknown-company';
}

function has(text, pattern) {
  return pattern.test(String(text || ''));
}

export function heuristicCompanyVerification(job = {}) {
  const companyName = String(job.company || '').trim();
  const source = [job.title, job.company, job.description, job.cardText, job.requirements].filter(Boolean).join('\n');
  const signals = [];
  let score = 0;
  if (!companyName || companyName.length < 2) {
    signals.push('公司名称缺失或过短');
    score += 35;
  }
  const highPatterns = [
    [/培训费|入职费|报名费|押金|保证金|服装费|工牌费|材料费/, '岗位描述出现入职前收费'],
    [/贷款培训|培训贷|分期培训/, '岗位描述出现培训贷款'],
    [/先转账|私下转账|个人收款码|缴费后入职/, '岗位描述要求私下转账'],
    [/刷单|代充|跑分|资金盘|虚拟币搬砖/, '岗位描述包含高风险业务关键词']
  ];
  for (const [pattern, label] of highPatterns) {
    if (has(source, pattern)) {
      signals.push(label);
      score += 55;
    }
  }
  const mediumPatterns = [
    [/高薪日结|轻松月入|无门槛高薪|在家兼职日结/, '薪资宣传明显夸张'],
    [/加微信详聊|联系私人微信|下载不明APP|扫码进群/, '沟通方式偏离正常招聘流程'],
    [/无需面试|直接入职|当天录取/, '招聘流程过于简化'],
    [/提供身份证正反面|银行卡密码|短信验证码/, '提前索取过度敏感信息']
  ];
  for (const [pattern, label] of mediumPatterns) {
    if (has(source, pattern)) {
      signals.push(label);
      score += 25;
    }
  }
  const riskLevel = score >= 55 ? 'high' : score >= 25 ? 'medium' : companyName ? 'low' : 'unknown';
  return {
    provider: 'local-rules',
    companyName,
    normalizedName: normalizeCompanyName(companyName),
    status: companyName ? 'unverified' : 'unknown',
    verified: false,
    confidence: companyName ? (riskLevel === 'low' ? 0.58 : 0.72) : 0.2,
    riskLevel,
    signals: signals.length ? signals : ['本地规则未发现明显风险关键词'],
    evidence: [],
    checkedAt: Date.now()
  };
}

export function mergeCompanyVerification(providerResult = {}, fallbackResult = {}) {
  const providerSignals = Array.isArray(providerResult.signals) ? providerResult.signals : [];
  const fallbackSignals = Array.isArray(fallbackResult.signals) ? fallbackResult.signals : [];
  const riskOrder = { low: 0, unknown: 1, medium: 2, high: 3 };
  const providerRisk = providerResult.riskLevel || 'unknown';
  const fallbackRisk = fallbackResult.riskLevel || 'unknown';
  const riskLevel = riskOrder[providerRisk] >= riskOrder[fallbackRisk] ? providerRisk : fallbackRisk;
  return {
    ...fallbackResult,
    ...providerResult,
    provider: providerResult.provider || fallbackResult.provider || 'local-rules',
    companyName: providerResult.companyName || fallbackResult.companyName || '',
    normalizedName: providerResult.normalizedName || fallbackResult.normalizedName || '',
    verified: Boolean(providerResult.verified || (providerResult.status === 'active' && riskLevel === 'low') || fallbackResult.verified),
    riskLevel,
    confidence: Math.max(Number(providerResult.confidence || 0), Number(fallbackResult.confidence || 0)),
    signals: [...new Set([...providerSignals, ...fallbackSignals])].slice(0, 12),
    evidence: Array.isArray(providerResult.evidence) ? providerResult.evidence.slice(0, 12) : [],
    checkedAt: Number(providerResult.checkedAt || fallbackResult.checkedAt || Date.now())
  };
}

export function companyVerificationExpired(result = {}, cacheDays = 14, now = Date.now()) {
  const ttl = Math.max(1, Math.min(90, Number(cacheDays || 14))) * 24 * 60 * 60 * 1000;
  return !Number(result.checkedAt) || now - Number(result.checkedAt) > ttl;
}
