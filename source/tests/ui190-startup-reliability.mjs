import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const background = fs.readFileSync(path.join(root, 'src/background.js'), 'utf8');
const sidepanel = fs.readFileSync(path.join(root, 'src/sidepanel.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/sidepanel.html'), 'utf8');
const content = fs.readFileSync(path.join(root, 'src/content-v37.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
if (manifest.version !== '2.0.1') throw new Error('v1.9 manifest missing');
for (const token of ['STARTUP_TOTAL_TIMEOUT_MS', 'withTimeout', 'startupIsFresh', 'patchStartup', "case 'OPEN_BOSS_JOBS'"]) {
  if (!background.includes(token)) throw new Error(`startup background missing ${token}`);
}
for (const token of ['startupFeedback', 'retryStartup', 'openBossJobs', 'actualSearchContext']) {
  if (!html.includes(`id="${token}"`) && !html.includes(`id="${token}"`)) throw new Error(`startup UI missing ${token}`);
}
for (const token of ['timeoutMs: 17500', 'renderStartupFeedback', 'renderActualSearchContext']) {
  if (!sidepanel.includes(token)) throw new Error(`sidepanel startup missing ${token}`);
}
if (!content.includes("JOBCLAW_CONTENT_BUILD = '2.0.1-greeting-hotfix.1'")) throw new Error('content startup build missing');
if (!content.includes('actualSearchContext: context')) throw new Error('effective filter context missing');
console.log('UI190_STARTUP_RELIABILITY_OK');
