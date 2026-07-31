import { readFile } from 'node:fs/promises';

const root = 'dist/chrome-extension';
const [manifest, html, background, content, common, safety, company, dedup, update, bridge] = await Promise.all([
  readFile(`${root}/manifest.json`, 'utf8').then(JSON.parse),
  readFile(`${root}/sidepanel.html`, 'utf8'),
  readFile(`${root}/background.js`, 'utf8'),
  readFile(`${root}/content-v37.js`, 'utf8'),
  readFile(`${root}/common.js`, 'utf8'),
  readFile(`${root}/lib/safety-control.js`, 'utf8'),
  readFile(`${root}/lib/company-verifier.js`, 'utf8'),
  readFile(`${root}/lib/deduplication.js`, 'utf8'),
  readFile(`${root}/lib/update-checker.js`, 'utf8'),
  readFile('../desktop-bridge/server.js', 'utf8')
]);

if (manifest.version !== '2.0.0') throw new Error('v1.7 manifest missing');
if (!manifest.host_permissions.includes('https://api.github.com/*') || !manifest.permissions.includes('nativeMessaging')) throw new Error('GitHub update permission missing');
for (const token of ['batchStrategy', 'massApplyAnalysis', 'pacingPreset', 'dryRun', 'discoveryLimit', 'maxPerCompanyPerDay', 'companyVerificationEnabled', 'updateCheckEnabled', 'dailyReportEnabled', 'dailyReportTime']) {
  if (!common.includes(token) || !html.includes(`id="${token}"`)) throw new Error(`v1.7 setting missing: ${token}`);
}
for (const token of ['enforceRateLimit', 'preflightJob', 'verifyCompanyForJob', 'checkForUpdates', "case 'RESET_SAFETY'", "case 'EVALUATE_STRATEGY'"]) {
  if (!background.includes(token)) throw new Error(`background feature missing: ${token}`);
}
for (const token of ["waitForRateLimit('discovery'", "send('JOB_PREFLIGHT'", "send('EVALUATE_STRATEGY'", "waitForRateLimit('delivery'"]) {
  if (!content.includes(token)) throw new Error(`content safety chain missing: ${token}`);
}
if (!safety.includes('computeRateLimitDecision') || !company.includes('heuristicCompanyVerification') || !dedup.includes('findDuplicate') || !update.includes('compareVersions')) throw new Error('v1.7 modules missing');
if (!bridge.includes("requestUrl.pathname === '/company/verify'") || !bridge.includes("requestUrl.pathname === '/report/generate'")) throw new Error('OpenClaw company/report routes missing');
console.log('UI170_SAFETY_INTELLIGENCE_OK');
