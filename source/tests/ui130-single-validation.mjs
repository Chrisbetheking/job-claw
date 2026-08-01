import { readFile } from 'node:fs/promises';

const root = 'dist/chrome-extension';
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
const [common, background, html, sidepanel] = await Promise.all([
  readFile(`${root}/common.js`, 'utf8'),
  readFile(`${root}/background.js`, 'utf8'),
  readFile(`${root}/sidepanel.html`, 'utf8'),
  readFile(`${root}/sidepanel.js`, 'utf8')
]);

if (manifest.version !== '2.1.0') throw new Error(`version mismatch: ${manifest.version}`);
for (const token of ['requireSingleJobValidation: true', 'singleJobValidationCompletedAt: 0']) {
  if (!common.includes(token)) throw new Error(`default missing: ${token}`);
}
for (const token of [
  'v130SingleValidationMigration',
  "statusText: '单条验收已通过并自动暂停；确认聊天文字和附件后可继续批量'",
  'validationPending',
  'pausedForValidation: true'
]) {
  if (!background.includes(token)) throw new Error(`background validation missing: ${token}`);
}
for (const id of ['setupValidationRow', 'setupValidationIcon', 'setupValidationStatus']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`validation UI missing: ${id}`);
}
for (const token of ['singleJobValidationCompletedAt', '首次全自动只执行 1 个岗位并自动暂停']) {
  if (!sidepanel.includes(token)) throw new Error(`sidepanel validation missing: ${token}`);
}
console.log('UI130_SINGLE_VALIDATION_OK');
