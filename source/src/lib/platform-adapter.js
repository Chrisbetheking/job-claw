export const PLATFORM_REGISTRY = Object.freeze({
  boss: {
    id: 'boss',
    name: 'BOSS直聘',
    hosts: ['www.zhipin.com', 'app.zhipin.com'],
    capabilities: ['discover', 'read-job', 'open-chat', 'send-greeting', 'send-resume', 'verify-result']
  }
});

export function detectPlatform(rawUrl = '') {
  try {
    const host = new URL(rawUrl).hostname;
    return Object.values(PLATFORM_REGISTRY).find(platform => platform.hosts.includes(host)) || null;
  } catch {
    return null;
  }
}

export function platformSupports(platformId = '', capability = '') {
  return Boolean(PLATFORM_REGISTRY[platformId]?.capabilities?.includes(capability));
}
