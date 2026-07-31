import { readFile } from 'node:fs/promises';
const root = 'dist/chrome-extension';
const [common, background, content, html, sidepanel] = await Promise.all([
  readFile(`${root}/common.js`, 'utf8'),
  readFile(`${root}/background.js`, 'utf8'),
  readFile(`${root}/content-v37.js`, 'utf8'),
  readFile(`${root}/sidepanel.html`, 'utf8'),
  readFile(`${root}/sidepanel.js`, 'utf8')
]);
for (const token of ['betweenJobsSeconds: 9', 'attachmentDelaySeconds: 3']) {
  if (!common.includes(token)) throw new Error(`安全节奏默认值缺失：${token}`);
}
for (const token of ['verify_message', '已暂停，未发送附件', 'newGreetingVisibleInChat', 'chatMessageSnapshot', 'await adapter.sendGreeting', 'await adapter.uploadResumeImage', 'activateSendButton', 'deliveryGreeting']) {
  if (!content.includes(token)) throw new Error(`文字优先链路缺失：${token}`);
}
const greetingIndex = content.indexOf('await adapter.sendGreeting');
const imageIndex = content.indexOf('await adapter.uploadResumeImage');
if (greetingIndex < 0 || imageIndex < 0 || greetingIndex >= imageIndex) throw new Error('简历图片不得早于文字确认发送');
if (content.includes('const cleared = !normalize(this.chatInputValue(currentInput))')) throw new Error('不得仅凭输入框清空判定文字发送成功');
if (content.includes('return cleared || messageAdded')) throw new Error('不得凭任意新消息误判招呼语发送成功');
for (const id of ['betweenJobsSeconds', 'attachmentDelaySeconds']) {
  if (!html.includes(`id="${id}"`) || !sidepanel.includes(`'${id}'`)) throw new Error(`投递节奏设置缺失：${id}`);
}
if (!background.includes('Number(config.betweenJobsSeconds || 12) * 1000')) throw new Error('后台岗位切换节奏未生效');
console.log(JSON.stringify({ ok: true, strictTextConfirmation: true, attachmentAfterText: true, safePacing: true }, null, 2));
