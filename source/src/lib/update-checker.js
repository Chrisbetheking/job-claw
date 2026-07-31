export function parseVersion(value = '') {
  const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1).map(Number) : [0, 0, 0];
}

export function compareVersions(left = '', right = '') {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

export function normalizeRelease(payload = {}, currentVersion = '') {
  const latestVersion = String(payload.tag_name || payload.name || '').replace(/^v/i, '').trim();
  return {
    checkedAt: Date.now(),
    currentVersion,
    latestVersion,
    available: Boolean(latestVersion) && compareVersions(latestVersion, currentVersion) > 0,
    name: String(payload.name || payload.tag_name || latestVersion || '暂无正式 Release'),
    notes: String(payload.body || '').slice(0, 1200),
    url: String(payload.html_url || 'https://github.com/Chrisbetheking/job-claw/releases'),
    publishedAt: payload.published_at || '',
    error: ''
  };
}
