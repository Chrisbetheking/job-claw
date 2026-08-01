import { readFile } from 'node:fs/promises';

const content = await readFile('dist/chrome-extension/content-v37.js', 'utf8');
const background = await readFile('dist/chrome-extension/background.js', 'utf8');
const manifest = JSON.parse(await readFile('dist/chrome-extension/manifest.json', 'utf8'));

if (manifest.version !== '2.2.0') throw new Error(`UI37 version mismatch: ${manifest.version}`);
if (!manifest.content_scripts?.some(item => item.js?.includes('content-v37.js'))) throw new Error('content-v37.js not registered');
if (!content.includes('[contenteditable]:not([contenteditable="false"])')) throw new Error('plaintext-only contenteditable selector missing');
if (!content.includes("editableMode === 'plaintext-only'")) throw new Error('plaintext-only editor scoring missing');
if (!content.includes('async ensureChatEditorReady(')) throw new Error('composer activation recovery missing');
if (!content.includes("send('TRUSTED_CHAT_INPUT', { action: 'click', point })")) throw new Error('trusted composer activation missing');
if (!content.includes('const readyInput = input || await this.ensureChatEditorReady(5000)')) throw new Error('conversation readiness still hard-requires existing editor');
if (!background.includes('[contenteditable]:not([contenteditable="false"])')) throw new Error('main-world plaintext-only write support missing');
if (!background.includes("data-slate-editor") || !background.includes("data-lexical-editor")) throw new Error('modern rich editor support missing');
console.log('UI37_PLAINTEXT_EDITOR_OK');
