export const DEFAULTS = {
  config: {
    executionMode: 'review',
    batchStrategy: 'precise',
    massApplyAnalysis: 'fast',
    pacingPreset: 'standard',
    dryRun: false,
    dailyTarget: 30,
    discoveryLimit: 150,
    aiLimit: 0,
    minScore: 75,
    targetLocations: [],
    employmentTypes: ['不限'],
    experiences: [],
    degrees: [],
    salary: '不限',
    sendResumeImage: true,
    sendOnlineResume: false,
    betweenJobsSeconds: 9,
    attachmentDelaySeconds: 3,
    maxPerCompanyPerDay: 3,
    queueWarmup: 4,
    maxConsecutiveFailures: 3,
    jitterSeconds: 3,
    companyVerificationEnabled: true,
    companyVerificationProvider: 'bridge',
    companyVerificationCacheDays: 14,
    blockUnknownCompanies: false,
    updateCheckEnabled: true,
    dailyReportEnabled: true,
    dailyReportTime: '20:30',
    dailyReportNotification: true,
    rateLimits: {
      discoveryMs: 1000,
      aiMs: 700,
      companyMs: 1800,
      deliveryMs: 9000,
      attachmentMs: 3000,
      updateMs: 5000
    },
    requireSingleJobValidation: true,
    singleJobValidationCompletedAt: 0,
    model: {
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-v4-pro',
      temperature: 0.1
    }
  },
  profile: null,
  profileDraft: null,
  directionPlan: null,
  resumeText: '',
  resumeImage: null,
  resumeSourceFile: null,
  stats: {
    date: '',
    sent: 0,
    discovered: 0,
    analyzed: 0,
    pending: 0,
    failed: 0,
    replied: 0,
    interviews: 0,
    verified: 0,
    blocked: 0,
    duplicates: 0,
    simulated: 0
  },
  workflow: {
    running: false,
    paused: true,
    phase: 'idle',
    statusText: '未开始',
    tasks: [],
    taskIndex: 0,
    cardIndex: 0,
    processedKeys: [],
    retries: 0,
    currentJob: null,
    returnUrl: '',
    returnScrollY: 0,
    pendingApplyId: null,
    activeRunId: null
  },
  pending: [],
  taskRuns: [],
  events: [],
  safetyState: {
    lastActionAt: {},
    consecutiveFailures: 0,
    circuitOpen: false,
    circuitReason: '',
    circuitOpenedAt: 0,
    totalThrottled: 0,
    backoffLevel: 0,
    lastBackoffReason: ''
  },
  companyVerificationCache: {},
  deliveryHistory: [],
  updateInfo: {
    currentVersion: '1.7.0',
    latestVersion: '',
    available: false,
    checkedAt: 0,
    url: 'https://github.com/Chrisbetheking/job-claw/releases',
    error: ''
  }
};

export const today = () => new Date().toISOString().slice(0, 10);
export const uniq = (items = []) => [...new Set(items.filter(Boolean))];
export const list = value => String(value || '')
  .split(/[，,\n]/)
  .map(item => item.trim())
  .filter(Boolean);
export const safeClone = value => JSON.parse(JSON.stringify(value ?? null));
