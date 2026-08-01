const HARD_SECURITY = /验证码|安全验证|滑块|人机验证|账号限制|账号异常|封禁|风控验证/i;
const AUTH_FAILURE = /登录失效|登录过期|未登录|重新登录|会话失效|cookie失效/i;
const IDENTITY_FAILURE = /身份不一致|聊天对象|目标HR|目标 HR|其他HR|其他 HR|岗位与HR|公司或岗位.*不一致|会话标识|投递锁/i;
const SEND_UNCERTAIN = /无法确认发送|发送结果不确定|已点击发送但|未能再次确认.*文字消息|发送未确认|草稿保留/i;
const RATE_LIMIT = /\b429\b|频率限制|请求过于频繁|操作太频繁|稍后再试|访问过于频繁/i;
const PAGE_RECEIVER = /页面脚本|接收端|receiver|扩展上下文|页面暂时未就绪|页面结构|DOM|脚本未加载|连接页面助手|页面版本/i;
const CHAT_ENTRY = /消息输入区|立即沟通入口|沟通页已打开|聊天编辑器|未能进入沟通页面|输入框.*未出现/i;
const FILTER_FAILURE = /地区筛选|搜索筛选|学历筛选|经验筛选|薪资筛选|求职类型筛选|筛选未成功/i;
const NETWORK_FAILURE = /网络|超时|连接失败|服务繁忙|暂不可用|fetch|ECONN|ERR_NETWORK|网关/i;
const JOB_TERMINAL = /岗位已关闭|职位已关闭|岗位失效|职位失效|已下线|停止招聘|外部网申|沟通额度/i;
const AI_FAILURE = /AI|DeepSeek|Ollama|模型|推理|生成招呼语/i;
const COMPANY_FAILURE = /企业核验|工商|Provider|OpenClaw.*企业|company/i;

function incidentBase(outcome = {}) {
  return {
    id: String(outcome.id || `incident-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    reason: String(outcome.reason || '任务处理异常').trim(),
    failureClass: String(outcome.failureClass || '').trim(),
    stage: String(outcome.stage || '').trim(),
    occurredAt: Number(outcome.now || Date.now()),
    job: outcome.job || null,
    pendingId: String(outcome.pendingId || ''),
    runId: String(outcome.runId || '')
  };
}

export function classifyIncident(outcome = {}, config = {}) {
  const base = incidentBase(outcome);
  const text = `${base.failureClass} ${base.stage} ${base.reason}`;
  const cooldownSeconds = Math.max(20, Math.min(1800, Number(config.autoRecoveryCooldownSeconds || 45)));
  const maxAttempts = Math.max(1, Math.min(6, Number(config.autoRecoveryMaxAttempts || 3)));

  if (HARD_SECURITY.test(text)) {
    return {
      ...base,
      category: 'security_verification', severity: 'critical', action: 'user-action',
      autoRecoverable: false, requiresUser: true, hardStop: true, maxAttempts: 0, cooldownMs: 0,
      title: '检测到平台安全验证',
      suggestion: '请在当前 BOSS 页面完成验证码或安全验证，完成后点击“继续任务”。JobClaw 不会绕过平台验证。'
    };
  }
  if (AUTH_FAILURE.test(text)) {
    return {
      ...base,
      category: 'authentication', severity: 'critical', action: 'user-action',
      autoRecoverable: false, requiresUser: true, hardStop: true, maxAttempts: 0, cooldownMs: 0,
      title: 'BOSS 登录状态已失效',
      suggestion: '请重新登录 BOSS 直聘并保持职位页打开，登录完成后点击“继续任务”。'
    };
  }
  if (IDENTITY_FAILURE.test(text)) {
    return {
      ...base,
      category: 'identity_mismatch', severity: 'critical', action: 'user-action',
      autoRecoverable: false, requiresUser: true, hardStop: true, maxAttempts: 0, cooldownMs: 0,
      title: '当前 HR 与目标岗位不一致',
      suggestion: '为避免向错误招聘者发送消息，系统已停止当前发送。请检查当前聊天对象后再继续。'
    };
  }
  if (outcome.sendUncertain || SEND_UNCERTAIN.test(text)) {
    return {
      ...base,
      category: 'send_uncertain', severity: 'critical', action: 'user-action',
      autoRecoverable: false, requiresUser: true, hardStop: true, maxAttempts: 0, cooldownMs: 0,
      title: '发送结果无法确认',
      suggestion: outcome.draftPresent
        ? '招呼语仍保留在输入框。请确认是否已经发送，避免重复沟通，然后点击“继续任务”。'
        : '请查看当前聊天记录是否已出现消息气泡，确认后再继续，系统不会自动重复发送。'
    };
  }
  if (RATE_LIMIT.test(text)) {
    return {
      ...base,
      category: 'rate_limit', severity: 'warning', action: 'cooldown',
      autoRecoverable: true, requiresUser: false, hardStop: false, maxAttempts,
      cooldownMs: Math.max(10 * 60 * 1000, cooldownSeconds * 1000),
      title: '平台暂时限制操作频率',
      suggestion: '系统会自动延长等待并在冷却结束后继续，不需要手动重置。'
    };
  }
  if (PAGE_RECEIVER.test(text) || base.failureClass === 'startup') {
    return {
      ...base,
      category: 'page_connection', severity: 'warning', action: 'repair-page',
      autoRecoverable: true, requiresUser: false, hardStop: false, maxAttempts,
      cooldownMs: Math.max(20 * 1000, cooldownSeconds * 1000),
      title: 'BOSS 页面连接暂时异常',
      suggestion: '系统会自动重新连接页面脚本、刷新失效页面并从原进度继续。'
    };
  }
  if (FILTER_FAILURE.test(text)) {
    return {
      ...base,
      category: 'filter_failure', severity: 'warning', action: 'repair-page',
      autoRecoverable: true, requiresUser: false, hardStop: false, maxAttempts,
      cooldownMs: Math.max(15 * 1000, Math.min(90 * 1000, cooldownSeconds * 1000)),
      title: '搜索筛选未完全生效',
      suggestion: '系统会重新进入目标城市和关键词页面，再按顺序重新设置筛选条件。'
    };
  }
  if (CHAT_ENTRY.test(text) || base.failureClass === 'chat_entry') {
    return {
      ...base,
      category: 'chat_entry', severity: 'notice', action: 'skip-job',
      autoRecoverable: true, requiresUser: false, hardStop: false, maxAttempts: 1, cooldownMs: 0,
      title: '当前岗位沟通窗口未加载',
      suggestion: '系统已冷却当前岗位并继续处理后续岗位，不会停止整条队列。'
    };
  }
  if (JOB_TERMINAL.test(text)) {
    return {
      ...base,
      category: 'job_unavailable', severity: 'notice', action: 'skip-job',
      autoRecoverable: true, requiresUser: false, hardStop: false, maxAttempts: 0, cooldownMs: 0,
      title: '当前岗位无法继续沟通',
      suggestion: '系统会跳过当前岗位并继续下一个岗位。'
    };
  }
  if (AI_FAILURE.test(text)) {
    return {
      ...base,
      category: 'ai_provider', severity: 'notice', action: 'degrade-ai',
      autoRecoverable: true, requiresUser: false, hardStop: false, maxAttempts: 0, cooldownMs: 0,
      title: 'AI 服务暂时不可用',
      suggestion: '系统会自动切换到本地模型或轻量算法继续分析，并在后续任务中重试云端模型。'
    };
  }
  if (COMPANY_FAILURE.test(text)) {
    return {
      ...base,
      category: 'company_provider', severity: 'notice', action: 'degrade-company',
      autoRecoverable: true, requiresUser: false, hardStop: false, maxAttempts: 0, cooldownMs: 0,
      title: '企业查询服务暂时不可用',
      suggestion: '系统会暂时使用本地风险规则继续，不会因第三方服务离线停止海投。'
    };
  }
  if (NETWORK_FAILURE.test(text)) {
    return {
      ...base,
      category: 'transient_network', severity: 'warning', action: 'cooldown',
      autoRecoverable: true, requiresUser: false, hardStop: false, maxAttempts,
      cooldownMs: Math.max(30 * 1000, cooldownSeconds * 1000),
      title: '网络或页面响应暂时变慢',
      suggestion: '系统会自动退避、重新检测页面并从断点继续。'
    };
  }
  return {
    ...base,
    category: 'unknown_soft', severity: 'warning', action: 'retry-then-skip',
    autoRecoverable: true, requiresUser: false, hardStop: false, maxAttempts,
    cooldownMs: Math.max(20 * 1000, cooldownSeconds * 1000),
    title: '任务出现可恢复异常',
    suggestion: '系统会先自动重试，仍失败则跳过当前岗位并继续，不需要手动重置。'
  };
}

export function recoveryDelayMs(incident = {}, attempt = 1) {
  const base = Math.max(0, Number(incident.cooldownMs || 0));
  if (!base) return 0;
  const exponent = Math.max(0, Math.min(4, Number(attempt || 1) - 1));
  return Math.min(30 * 60 * 1000, Math.round(base * (2 ** exponent)));
}

export function incidentSummary(incident = {}) {
  if (!incident?.reason) return '';
  return [incident.title || '任务异常', incident.suggestion || ''].filter(Boolean).join('：');
}
