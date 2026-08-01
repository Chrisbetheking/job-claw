import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const common = await readFile('src/common.js', 'utf8');
const background = await readFile('src/background.js', 'utf8');
const content = await readFile('src/content-v37.js', 'utf8');
const panelHtml = await readFile('public/sidepanel.html', 'utf8');
const panelJs = await readFile('src/sidepanel.js', 'utf8');
const recovery = await readFile('src/lib/incident-recovery.js', 'utf8');

assert.equal(manifest.version, '2.2.0');
assert.match(manifest.version_name, /Automatic Incident Diagnosis/);
assert.match(common, /autoRecoveryEnabled: true/);
assert.match(common, /dailyTarget: 150/);
assert.match(background, /AUTO_RECOVERY_ALARM/);
assert.match(background, /attemptAutoRecovery/);
assert.match(background, /scheduleAutoRecovery/);
assert.match(background, /continueAfterRecoveryExhausted/);
assert.match(background, /skipCurrentSearchTaskForRecovery/);
assert.match(background, /dailyTarget \|\| 150/);
assert.match(background, /CONTINUE_AFTER_INCIDENT/);
assert.match(content, /2\.2\.0-auto-recovery\.1/);
assert.doesNotMatch(content, /\['write_greeting', 'send_greeting'/);
assert.match(panelHtml, /id="autoRecoveryEnabled"/);
assert.match(panelHtml, /id="autoRecoverNow"/);
assert.match(panelHtml, /id="continueIncident"/);
assert.match(panelJs, /AUTO_RECOVER_NOW/);
assert.match(panelJs, /safetySuggestion/);
assert.match(recovery, /security_verification/);
assert.match(recovery, /send_uncertain/);
assert.match(recovery, /skip-job/);
assert.match(recovery, /degrade-ai/);

console.log('UI220_AUTO_RECOVERY_OK');
