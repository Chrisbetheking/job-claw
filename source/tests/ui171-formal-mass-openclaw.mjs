import { readFile } from 'node:fs/promises';

const root = 'dist/chrome-extension';
const [manifest, html, background, common, safety, bridge, nativeHost, installer] = await Promise.all([
  readFile(`${root}/manifest.json`, 'utf8').then(JSON.parse),
  readFile(`${root}/sidepanel.html`, 'utf8'),
  readFile(`${root}/background.js`, 'utf8'),
  readFile(`${root}/common.js`, 'utf8'),
  readFile(`${root}/lib/safety-control.js`, 'utf8'),
  readFile('../desktop-bridge/server.js', 'utf8'),
  readFile('../desktop-bridge/native-host.js', 'utf8'),
  readFile('../安装桌面桥接-mac.command', 'utf8')
]);

if (!manifest.permissions.includes('nativeMessaging')) throw new Error('nativeMessaging permission missing');
for (const token of ['value="mass"', 'id="massApplyAnalysis"', 'id="pacingPreset"', 'id="dailyReportEnabled"', 'id="dailyReportTime"', 'id="generateBridgeReport"']) {
  if (!html.includes(token)) throw new Error(`formal UI missing ${token}`);
}
for (const token of ['fastMassAnalysis', 'bridgeUnavailableUntil', 'NATIVE_BRIDGE_HOST', "case 'BRIDGE_DIAGNOSE'", "case 'BRIDGE_REPORT_NOW'"]) {
  if (!background.includes(token)) throw new Error(`formal background missing ${token}`);
}
for (const token of ["massApplyAnalysis: 'fast'", "dailyReportTime: '20:30'", "pacingPreset: 'standard'"]) {
  if (!common.includes(token)) throw new Error(`formal default missing ${token}`);
}
if (!safety.includes("normalized === 'mass'") || !safety.includes('strictHardBlocks')) throw new Error('safe mass strategy missing');
if (!bridge.includes("requestUrl.pathname === '/report/generate'") || !bridge.includes('maybeGenerateScheduledReport')) throw new Error('daily report runtime missing');
if (!nativeHost.includes('ensureServer') || !nativeHost.includes('native message too large')) throw new Error('native bridge host missing');
if (!installer.includes('NativeMessagingHosts') || !installer.includes('com.jobclaw.bridge')) throw new Error('native host installer missing');
console.log('UI171_FORMAL_MASS_OPENCLAW_OK');
