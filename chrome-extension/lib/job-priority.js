function salaryPriority(job = {}) {
  const source = `${job.salary || ''} ${job.cardText || ''}`;
  const numbers = [...source.matchAll(/(\d+(?:\.\d+)?)/g)].map(match => Number(match[1])).filter(Number.isFinite);
  if (!numbers.length) return 0;
  let midpoint = numbers.length >= 2 ? (numbers[0] + numbers[1]) / 2 : numbers[0];
  if (/元\/天|元每天|\/天/.test(source)) midpoint *= 22 / 1000;
  if (/元\/月|元每月/.test(source)) midpoint /= 1000;
  return Math.max(0, Math.min(180, Math.round(midpoint * 6)));
}

function freshnessPriority(job = {}) {
  const source = `${job.publishTime || ''} ${job.cardText || ''}`;
  if (/刚刚|最新|今日|今天|分钟前|小时内/.test(source)) return 120;
  if (/昨天|1天前/.test(source)) return 80;
  const days = Number(source.match(/(\d+)\s*天前/)?.[1] || 0);
  if (days > 0) return Math.max(0, 70 - days * 8);
  return 0;
}

export function computeJobPriority(item = {}) {
  const analysis = item.analysis || {};
  const job = item.job || {};
  const hardBlocks = Array.isArray(analysis.hardBlocks) ? analysis.hardBlocks.length : 0;
  const risks = Array.isArray(analysis.risks) ? analysis.risks.length : 0;
  const gaps = Array.isArray(analysis.gaps) ? analysis.gaps.length : 0;
  const score = Math.max(0, Math.min(100, Number(analysis.score || 0)));
  let priority = score * 100;
  if (analysis.decision === 'recommend') priority += 900;
  if (analysis.decision === 'cautious') priority -= 350;
  if (analysis.decision === 'reject') priority -= 5000;
  priority -= hardBlocks * 2400;
  priority -= risks * 90;
  priority -= gaps * 45;
  priority += salaryPriority(job);
  priority += freshnessPriority(job);
  if (/外部网申|立即网申|去网申/.test(`${job.applicationMode || ''} ${job.cardText || ''}`)) priority -= 6000;
  priority -= Number(item.retryCount || 0) * 120;
  return Math.round(priority);
}

function pendingStatusRank(status) {
  return {
    approved: 0,
    approved_queue: 1,
    pending: 2,
    failed: 3,
    sent: 4,
    skipped: 5,
    rejected: 6,
    ignored: 7
  }[status] ?? 8;
}

export function rerankPending(items = []) {
  const enriched = items.map(entry => ({
    ...entry,
    priorityScore: computeJobPriority(entry)
  }));
  enriched.sort((a, b) => {
    const statusDiff = pendingStatusRank(a.status) - pendingStatusRank(b.status);
    if (statusDiff) return statusDiff;
    const priorityDiff = Number(b.priorityScore || 0) - Number(a.priorityScore || 0);
    if (priorityDiff) return priorityDiff;
    const scoreDiff = Number(b.analysis?.score || 0) - Number(a.analysis?.score || 0);
    if (scoreDiff) return scoreDiff;
    return Number(a.createdAt || 0) - Number(b.createdAt || 0);
  });
  let queueRank = 0;
  return enriched.map(entry => {
    if (['approved', 'approved_queue', 'pending'].includes(entry.status)) queueRank += 1;
    return {
      ...entry,
      priorityRank: ['approved', 'approved_queue', 'pending'].includes(entry.status) ? queueRank : null
    };
  });
}
