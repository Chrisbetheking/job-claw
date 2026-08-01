import { readFile } from 'node:fs/promises';

const background = await readFile('dist/chrome-extension/background.js', 'utf8');
const manifest = JSON.parse(await readFile('dist/chrome-extension/manifest.json', 'utf8'));
if (manifest.version !== '2.0.1') throw new Error(`UI37 version mismatch: ${manifest.version}`);
for (const token of [
  'async function debuggerFindEditableObject',
  'const deepQuery = (root, query)',
  "method: 'exact-selector-object-focus+click'",
  'debuggerReadObjectText(target, focus.objectId)',
  "writeMethod = 'exact-cdp-insert-text'",
  "writeMethod = 'exact-cdp-clipboard-paste'",
  "writeMethod = 'exact-cdp-keyboard-type'",
  "text: '\\r', unmodifiedText: '\\r'",
  '写入和 Enter 必须在同一次 debugger 会话'
]) {
  if (!background.includes(token)) throw new Error(`UI37 exact CDP target token missing: ${token}`);
}
const focusIndex = background.indexOf('const exact = await debuggerFindEditableObject');
const pointIndex = background.indexOf('const pointNode = await debuggerNodeAtPoint', focusIndex);
if (focusIndex < 0 || pointIndex < 0 || focusIndex > pointIndex) throw new Error('exact selector is not preferred over coordinate node');
console.log('UI37_EXACT_CDP_TARGET_OK');
