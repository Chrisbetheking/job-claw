import { readFile } from 'node:fs/promises';

const root = 'dist/chrome-extension';
const [content, common, background, manifest] = await Promise.all([
  readFile(`${root}/content-v37.js`, 'utf8'),
  readFile(`${root}/common.js`, 'utf8'),
  readFile(`${root}/background.js`, 'utf8'),
  readFile(`${root}/manifest.json`, 'utf8')
]);

for (const token of [
  'chatTranscriptRoot(input = this.chatInput())',
  'transcriptGeometry(node, input = this.chatInput())',
  'isOutgoingTranscriptNode(node',
  'chatMessageNodes({ outgoingOnly = false } = {})',
  'waitForStableOutgoingGreeting',
  '必须匹配完整招呼语',
  '左侧联系人列表',
  'strict-text-bubble-confirmed',
  '当前聊天正文没有出现文字气泡',
  'await sleep(4000)'
]) {
  if (!content.includes(token)) throw new Error(`UI22 严格正文确认缺失：${token}`);
}
if (/slice\(0,\s*Math\.min\(48/.test(content)) throw new Error('UI22 不得再用招呼语前缀匹配整个页面');
if (!content.includes("this.chatMessageNodes({ outgoingOnly: true })")) throw new Error('UI22 必须只在当前会话的发出消息中确认文字');
if (!common.includes('betweenJobsSeconds: 9') || !common.includes('attachmentDelaySeconds: 3')) throw new Error('UI22 正式版安全节奏默认值缺失');
if (!background.includes('ui22StrictTranscriptMigration')) throw new Error('UI22 旧配置节奏迁移缺失');
const parsedManifest = JSON.parse(manifest);
if (!parsedManifest.content_scripts?.some(item => item.js?.includes('content-v37.js'))) throw new Error('UI22 内容脚本未注册');
console.log('UI22_STRICT_TRANSCRIPT_AND_PACING_OK');
