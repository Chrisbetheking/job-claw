import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const background = await readFile('src/background.js', 'utf8');
const content = await readFile('src/content-v37.js', 'utf8');

if (!manifest.permissions?.includes('scripting')) throw new Error('scripting permission missing');
if (!manifest.permissions?.includes('debugger')) throw new Error('debugger permission missing');
if (!background.includes('async function mainWorldWriteChatText')) throw new Error('main-world writer missing');
if (!background.includes("world: 'MAIN'")) throw new Error('MAIN world execution missing');
if (!background.includes("Object.getOwnPropertyDescriptor(proto, 'value')")) throw new Error('native value setter missing');
if (!background.includes("new InputEvent('beforeinput'")) throw new Error('beforeinput synchronization missing');
if (!background.includes("new InputEvent('input'")) throw new Error('input synchronization missing');
if (!background.includes("document.execCommand?.('insertText'")) throw new Error('contenteditable insertion path missing');
if (!background.includes('const mainWrite = await mainWorldWriteChatText')) throw new Error('main-world writer fallback missing');
if (!background.includes("writeMethod = 'exact-cdp-keyboard-type'")) throw new Error('trusted per-character keyboard fallback missing');
if (!background.includes("await debuggerPressEnter(target)")) throw new Error('trusted Enter missing');
if (!background.includes("exact-selector-object-focus+click")) throw new Error('exact contenteditable focus missing');
if (!content.includes("await this.trustedEditorAction('replaceTextAndEnter'")) throw new Error('atomic trusted write missing');
if (!background.includes('insertedBeforeSend: true')) throw new Error('background write verification missing');
if (!background.includes("if (action === 'replaceTextAndEnter')")) throw new Error('atomic Enter path missing');
if (!background.includes('if (!matches(actual))')) throw new Error('atomic path must verify write before Enter');
if (!content.includes('waitForStableOutgoingGreeting')) throw new Error('strict outgoing bubble confirmation missing');
if (!content.includes('发送动作未生效；已暂停且不会切换岗位')) throw new Error('safe failure stop missing');
if (!content.includes("const JOBCLAW_CONTENT_VERSION = '2.0.1'")) throw new Error('content version mismatch');
if (!content.includes("const JOBCLAW_CONTENT_FILE = 'content-v37.js'")) throw new Error('content filename mismatch');

console.log(JSON.stringify({
  ok: true,
  mainWorldNativeSetter: true,
  contenteditableMainWorldWrite: true,
  cdpFallback: true,
  verifiedAtomicWriteBeforeEnter: true,
  strictBubbleConfirmation: true,
  safePauseOnFailure: true
}, null, 2));
