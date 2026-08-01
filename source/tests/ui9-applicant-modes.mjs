import { readFile } from 'node:fs/promises';

const root = 'dist/chrome-extension';
const [html, sidepanel, background, content, common, manifest] = await Promise.all([
  readFile(`${root}/sidepanel.html`, 'utf8'),
  readFile(`${root}/sidepanel.js`, 'utf8'),
  readFile(`${root}/background.js`, 'utf8'),
  readFile(`${root}/content-v37.js`, 'utf8'),
  readFile(`${root}/common.js`, 'utf8'),
  readFile(`${root}/manifest.json`, 'utf8').then(JSON.parse)
]);

if (!html.includes('JobClaw <em>by Chris</em>')) throw new Error('顶部缺少 JobClaw by Chris 品牌');
if (manifest.name !== 'JobClaw by Chris 求职助手') throw new Error('Manifest 品牌名错误');
for (const mode of ['data-execution-mode="review"', 'data-execution-mode="auto"']) {
  if ((html.match(new RegExp(mode, 'g')) || []).length !== 2) throw new Error(`执行模式入口数量错误：${mode}`);
}
if (!common.includes("executionMode: 'review'")) throw new Error('默认人工确认模式缺失');
if (!common.includes('dailyTarget: 150')) throw new Error('每日成功投递目标默认值不是 150');
for (const token of ['APPROVE_ALL', 'REJECT_ALL', 'queue-greeting-editor', 'setExecutionMode', '全自动投递']) {
  if (!sidepanel.includes(token)) throw new Error(`人工/自动模式 UI 能力缺失：${token}`);
}
for (const token of ["activeConfig.executionMode === 'auto'", "send('AUTO_DISPATCH_NEXT'", 'activeConfig.dailyTarget']) {
  if (!content.includes(token)) throw new Error(`全自动执行链路缺失：${token}`);
}
for (const token of ['AUTO_APPROVE', 'approveAllPending', 'approved_queue', 'normalizeApplicantGreeting', 'humanGreetingTemplate', '完整、专业但不生硬的求职自我介绍']) {
  if (!background.includes(token)) throw new Error(`求职者投递链路缺失：${token}`);
}
if (!background.includes('求职者的岗位分析助手，不是招聘方')) throw new Error('AI 角色没有固定为求职者');
if (!background.includes('看到你的简历') || !background.includes('匹配我们')) throw new Error('招聘方反向口吻拦截规则缺失');
if (!background.includes('updatedStats.sent >= Number(config.dailyTarget || 150)')) throw new Error('每日目标没有按成功投递计算');

console.log(JSON.stringify({
  ok: true,
  brand: 'JOBCLAW_BY_CHRIS_OK',
  role: 'APPLICANT_ONLY_OK',
  modes: ['MANUAL_REVIEW', 'FULL_AUTO'],
  manual: ['EDIT_GREETING', 'SINGLE_CONFIRM', 'BATCH_CONFIRM', 'BATCH_REJECT'],
  auto: 'SCORE_THRESHOLD_AUTO_APPLY_OK',
  dailyTarget: 'SUCCESSFUL_APPLICATIONS_150'
}, null, 2));
