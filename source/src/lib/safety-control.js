import { classifyIncident, recoveryDelayMs } from './incident-recovery.js';

const PRESETS = {
  conservative: { discovery: 1800, ai: 1000, company: 2200, delivery: 15000, attachment: 4000, queueWarmup: 5 },
  standard: { discovery: 1000, ai: 700, company: 1800, delivery: 9000, attachment: 3000, queueWarmup: 4 },
  efficient: { discovery: 600, ai: 500, company: 1200, delivery: 6000, attachment: 2200, queueWarmup: 3 }
};

const SCOPE_DEFAULTS = {
  discovery: PRESETS.standard.discovery,
  ai: PRESETS.standard.ai,
  company: PRESETS.standard.company,
  delivery: PRESETS.standard.delivery,
  attachment: PRESETS.standard.attachment,
  update: 5000
};

export function normalizeStrategy(value = 'safe-mass') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['full-mass', 'full', 'all', 'unfiltered-mass', 'mass-all'].includes(normalized)) return 'full-mass';
  if (['safe-mass', 'mass', 'explore', 'balanced', 'precise', 'safe'].includes(normalized)) return 'safe-mass';
  return 'safe-mass';
}

export function normalizeSafetyConfig(config = {}) {
  const rate = config.rateLimits || {};
  const pacingPreset = ['conservative', 'standard', 'efficient', 'custom'].includes(config.pacingPreset)
    ? config.pacingPreset
    : 'standard';
  const preset = pacingPreset === 'custom' ? PRESETS.standard : PRESETS[pacingPreset];
  return {
    batchStrategy: normalizeStrategy(config.batchStrategy),
    pacingPreset,
    dryRun: Boolean(config.dryRun),
    discoveryLimit: Math.max(1, Math.min(800, Number(config.discoveryLimit || 150))),
    dailyTarget: Math.max(1, Math.min(150, Number(config.dailyTarget || 150))),
    maxPerCompanyPerDay: Math.max(1, Math.min(12, Number(config.maxPerCompanyPerDay || 3))),
    maxConsecutiveFailures: Math.max(1, Math.min(10, Number(config.maxConsecutiveFailures || rate.maxConsecutiveFailures || 6))),
    autoRecoveryEnabled: config.autoRecoveryEnabled !== false,
    autoRecoveryMaxAttempts: Math.max(1, Math.min(6, Number(config.autoRecoveryMaxAttempts || 3))),
    autoRecoveryCooldownSeconds: Math.max(20, Math.min(1800, Number(config.autoRecoveryCooldownSeconds || 45))),
    jitterSeconds: Math.max(0, Math.min(15, Number(config.jitterSeconds ?? rate.jitterSeconds ?? 3))),
    queueWarmup: Math.max(1, Math.min(10, Number(config.queueWarmup || preset.queueWarmup))),
    intervals: {
      discovery: Math.max(500, Number(pacingPreset === 'custom' ? rate.discoveryMs : preset.discovery)),
      ai: Math.max(350, Number(pacingPreset === 'custom' ? rate.aiMs : preset.ai)),
      company: Math.max(800, Number(pacingPreset === 'custom' ? rate.companyMs : preset.company)),
      delivery: Math.max(6000, Number(pacingPreset === 'custom' ? (rate.deliveryMs || Number(config.betweenJobsSeconds || 9) * 1000) : preset.delivery)),
      attachment: Math.max(1500, Number(pacingPreset === 'custom' ? (rate.attachmentMs || Number(config.attachmentDelaySeconds || 3) * 1000) : preset.attachment)),
      update: Math.max(5000, Number(rate.updateMs || SCOPE_DEFAULTS.update))
    }
  };
}

export function createSafetyState(input = {}) {
  return {
    lastActionAt: { ...(input.lastActionAt || {}) },
    consecutiveFailures: Math.max(0, Number(input.consecutiveFailures || 0)),
    circuitOpen: Boolean(input.circuitOpen),
    circuitReason: String(input.circuitReason || ''),
    circuitOpenedAt: Number(input.circuitOpenedAt || 0),
    lastSuccessAt: Number(input.lastSuccessAt || 0),
    lastFailureAt: Number(input.lastFailureAt || 0),
    totalThrottled: Math.max(0, Number(input.totalThrottled || 0)),
    backoffLevel: Math.max(0, Math.min(4, Number(input.backoffLevel || 0))),
    lastBackoffReason: String(input.lastBackoffReason || ''),
    currentIncident: input.currentIncident && typeof input.currentIncident === 'object' ? { ...input.currentIncident } : null,
    lastSuggestion: String(input.lastSuggestion || ''),
    autoRecovering: Boolean(input.autoRecovering),
    recoveryPlan: input.recoveryPlan && typeof input.recoveryPlan === 'object' ? { ...input.recoveryPlan } : null,
    nextRecoveryAt: Math.max(0, Number(input.nextRecoveryAt || 0)),
    recoveryAttempts: Math.max(0, Number(input.recoveryAttempts || 0)),
    lastRecoveryResult: String(input.lastRecoveryResult || ''),
    totalAutoRecovered: Math.max(0, Number(input.totalAutoRecovered || 0)),
    totalAutoSkipped: Math.max(0, Number(input.totalAutoSkipped || 0)),
    totalUserInterventions: Math.max(0, Number(input.totalUserInterventions || 0)),
    incidentHistory: (Array.isArray(input.incidentHistory) ? input.incidentHistory : []).slice(0, 30)
  };
}

export function computeRateLimitDecision(config = {}, state = {}, scope = 'discovery', now = Date.now(), random = Math.random) {
  const safety = normalizeSafetyConfig(config);
  const current = createSafetyState(state);
  if (current.circuitOpen) {
    return { allowed: false, circuitOpen: true, waitMs: 0, reason: current.circuitReason || '安全熔断已开启' };
  }
  const baseInterval = safety.intervals[scope] || SCOPE_DEFAULTS[scope] || 1000;
  const adaptiveMultiplier = 1 + current.backoffLevel * 0.45;
  const interval = Math.round(baseInterval * adaptiveMultiplier);
  const jitter = Math.round(Math.max(0, safety.jitterSeconds * 1000) * Math.max(0, Math.min(1, Number(random()))));
  const last = Number(current.lastActionAt[scope] || 0);
  const waitMs = last > 0 ? Math.max(0, last + interval + jitter - now) : 0;
  return {
    allowed: true,
    circuitOpen: false,
    waitMs,
    scope,
    intervalMs: interval,
    baseIntervalMs: baseInterval,
    adaptiveMultiplier,
    jitterMs: jitter,
    backoffLevel: current.backoffLevel
  };
}

export function recordRateAction(state = {}, scope = 'discovery', now = Date.now(), throttled = false) {
  const current = createSafetyState(state);
  return {
    ...current,
    lastActionAt: { ...current.lastActionAt, [scope]: now },
    totalThrottled: current.totalThrottled + (throttled ? 1 : 0)
  };
}

export function recordSafetyOutcome(config = {}, state = {}, outcome = {}, now = Date.now()) {
  const safety = normalizeSafetyConfig(config);
  const current = createSafetyState(state);
  if (outcome.ok) {
    return {
      ...current,
      consecutiveFailures: 0,
      circuitOpen: false,
      circuitReason: '',
      circuitOpenedAt: 0,
      lastSuccessAt: now,
      backoffLevel: Math.max(0, current.backoffLevel - 1),
      lastBackoffReason: current.backoffLevel > 0 ? current.lastBackoffReason : '',
      currentIncident: null,
      lastSuggestion: '',
      autoRecovering: false,
      recoveryPlan: null,
      nextRecoveryAt: 0,
      recoveryAttempts: 0,
      lastRecoveryResult: outcome.recoveryResult || current.lastRecoveryResult
    };
  }

  const failures = current.consecutiveFailures + 1;
  let incident = classifyIncident({ ...outcome, now }, config);
  const repeatThreshold = Math.max(3, Number(safety.maxConsecutiveFailures || 6));
  if (incident.category === 'unknown_soft' && failures >= repeatThreshold) {
    incident = {
      ...incident,
      category: 'repeated_unknown',
      action: 'repair-page',
      title: '连续出现未知页面异常',
      suggestion: '系统会自动刷新并重新连接 BOSS 页面，恢复后从断点继续。'
    };
  }
  const hardStop = incident.hardStop === true || incident.requiresUser === true;
  const autoRecovering = Boolean(config.autoRecoveryEnabled !== false && incident.autoRecoverable && ['cooldown', 'repair-page', 'retry-then-skip'].includes(incident.action));
  const nextAttempt = autoRecovering ? Math.max(1, Number(current.recoveryAttempts || 0) + 1) : 0;
  const delayMs = autoRecovering ? recoveryDelayMs(incident, nextAttempt) : 0;
  const nextRecoveryAt = autoRecovering ? now + delayMs : 0;
  const transient = ['transient_network', 'rate_limit', 'page_connection', 'filter_failure', 'repeated_unknown'].includes(incident.category);
  const historyEntry = {
    id: incident.id,
    ts: now,
    category: incident.category,
    title: incident.title,
    reason: incident.reason,
    suggestion: incident.suggestion,
    action: incident.action,
    autoRecoverable: incident.autoRecoverable,
    requiresUser: incident.requiresUser
  };

  return {
    ...current,
    consecutiveFailures: failures,
    lastFailureAt: now,
    circuitOpen: hardStop,
    circuitReason: hardStop ? incident.reason : '',
    circuitOpenedAt: hardStop ? now : 0,
    backoffLevel: Math.min(4, current.backoffLevel + (transient ? 1 : 0)),
    lastBackoffReason: transient ? incident.reason : current.lastBackoffReason,
    currentIncident: incident,
    lastSuggestion: incident.suggestion || '',
    autoRecovering,
    recoveryPlan: autoRecovering ? { ...incident, attempt: nextAttempt, scheduledAt: now, nextRecoveryAt } : null,
    nextRecoveryAt,
    recoveryAttempts: nextAttempt,
    totalAutoSkipped: current.totalAutoSkipped + (incident.action === 'skip-job' ? 1 : 0),
    totalUserInterventions: current.totalUserInterventions + (hardStop ? 1 : 0),
    incidentHistory: [historyEntry, ...current.incidentHistory].slice(0, 30)
  };
}

export function resetSafetyCircuit(state = {}, now = Date.now()) {
  const current = createSafetyState(state);
  return {
    ...current,
    consecutiveFailures: 0,
    circuitOpen: false,
    circuitReason: '',
    circuitOpenedAt: 0,
    backoffLevel: 0,
    lastBackoffReason: '',
    lastSuccessAt: now,
    currentIncident: null,
    lastSuggestion: '',
    autoRecovering: false,
    recoveryPlan: null,
    nextRecoveryAt: 0,
    recoveryAttempts: 0
  };
}

export function completeAutoRecovery(state = {}, result = '', now = Date.now()) {
  const current = createSafetyState(state);
  return {
    ...resetSafetyCircuit(current, now),
    totalAutoRecovered: current.totalAutoRecovered + 1,
    lastRecoveryResult: String(result || '已自动恢复并继续任务')
  };
}

const STRICT_HARD_BLOCK = /(?:必须|硬性|仅限|不接受|无法到岗|到岗时间冲突|工作地点不接受|全职.*实习|实习.*全职|年龄限制|执业|资格证|驾驶证|安全许可|仅招应届|不招应届|身份要求|国籍要求)/i;
const SOFT_REQUIREMENT = /(?:技能|技术栈|经验|年限|专业|学历|项目|行业|熟练|精通|优先|加分)/i;

export function strictHardBlocks(hardBlocks = []) {
  return (Array.isArray(hardBlocks) ? hardBlocks : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .filter(item => STRICT_HARD_BLOCK.test(item) && !SOFT_REQUIREMENT.test(item));
}

export function evaluateStrategy({
  strategy = 'safe-mass',
  score = 0,
  minScore = 75,
  riskLevel = 'unknown',
  verified = false,
  decision = 'cautious',
  hardBlocks = []
} = {}) {
  const normalized = normalizeStrategy(strategy);
  const numericScore = Math.max(0, Math.min(100, Number(score || 0)));
  const fatalBlocks = strictHardBlocks(hardBlocks);
  if (riskLevel === 'high') {
    return { accepted: false, reason: '企业或岗位存在明确高风险', threshold: 101, fatalBlocks };
  }
  if (normalized === 'full-mass') {
    return {
      accepted: true,
      reason: verified ? '通过完全海投风险检查' : '未发现明确安全风险，进入完全海投队列',
      threshold: 0,
      fatalBlocks,
      ignoredHardBlocks: fatalBlocks,
      priorityScore: numericScore,
      originalDecision: decision
    };
  }
  if (fatalBlocks.length) {
    return { accepted: false, reason: `存在明确硬性冲突：${fatalBlocks[0]}`, threshold: 101, fatalBlocks };
  }
  return {
    accepted: true,
    reason: verified ? '通过安全海投硬条件检查' : '企业未核验但未发现明确风险，进入安全海投队列',
    threshold: 0,
    fatalBlocks,
    priorityScore: numericScore,
    originalDecision: decision,
    legacyMinScore: Math.max(0, Math.min(100, Number(minScore || 0)))
  };
}
