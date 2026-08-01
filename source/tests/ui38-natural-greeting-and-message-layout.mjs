import { readFile } from 'node:fs/promises';

const root = 'dist/chrome-extension';
const [background, content, sidepanel, html, css, common] = await Promise.all([
  readFile(`${root}/background.js`, 'utf8'),
  readFile(`${root}/content-v37.js`, 'utf8'),
  readFile(`${root}/sidepanel.js`, 'utf8'),
  readFile(`${root}/sidepanel.html`, 'utf8'),
  readFile(`${root}/styles.css`, 'utf8'),
  readFile(`${root}/common.js`, 'utf8')
]);

for (const token of ['humanGreetingTemplate', 'applicantName', 'applicantEducation', 'applicantAvailability', 'greetingModules', 'greetingStyle']) {
  if (!background.includes(token) && !common.includes(token)) throw new Error(`自然招呼语能力缺失：${token}`);
}
for (const token of ['完整、专业但不生硬的求职自我介绍', '希望有机会加入贵公司', '真实到岗时间']) {
  if (!background.includes(token)) throw new Error(`完整招呼语规则缺失：${token}`);
}

for (const token of ['cleanJobTitle', 'plausibleJobTitle', 'cleanCompanyName', 'CHAT_EDITOR_TIMEOUT', '2.0.1-greeting-hotfix.1']) {
  if (!content.includes(token)) throw new Error(`岗位提取或沟通恢复能力缺失：${token}`);
}
for (const token of ['greetingStyle', 'probeAndRepair', 'resetAndResume']) {
  if (!html.includes(`id="${token}"`)) throw new Error(`设置或恢复控件缺失：${token}`);
}
for (const token of ['displayTaskJob', 'delivery-task-folded', 'compactTaskText', 'has-toast']) {
  if (!sidepanel.includes(token) && !css.includes(token)) throw new Error(`消息页布局能力缺失：${token}`);
}
if ((css.match(/\.delivery-task-title strong/g) || []).length < 1) throw new Error('消息任务标题缺少折行规则');
if (!css.includes('overflow-wrap: anywhere')) throw new Error('长错误文本缺少断行保护');
if (css.includes('.profile-editor-card textarea[data-autogrow] {\n.delivery-task')) throw new Error('CSS 仍存在嵌套污染');

console.log(JSON.stringify({
  ok: true,
  greeting: 'NATURAL_PROJECT_EVIDENCE_OK',
  extraction: 'JOB_TITLE_COMPANY_SANITIZED',
  recovery: 'CHAT_ENTRY_RECOVERY_V2',
  layout: 'MESSAGE_TASKS_RESPONSIVE_AND_COMPACT'
}, null, 2));
