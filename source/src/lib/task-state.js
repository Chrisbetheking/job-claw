export const TERMINAL_RUN_STATUSES = new Set(['success', 'failed', 'ignored', 'skipped']);

export const TASK_STAGE_META = Object.freeze({
  discovered: ['已发现岗位', 12],
  collect_detail: ['读取岗位详情', 24],
  ai_analyze: ['AI 匹配分析', 42],
  ai_complete: ['AI 分析完成', 56],
  waiting_review: ['等待人工确认', 60],
  queued: ['等待投递', 64],
  retry_queued: ['等待重新投递', 66],
  open_job: ['打开岗位页面', 70],
  open_chat: ['打开沟通窗口', 78],
  verify_chat_target: ['核对 HR 与岗位', 82],
  fill_message: ['填写求职招呼语', 86],
  send_message: ['发送求职招呼语', 90],
  verify_message: ['确认文字已发送', 94],
  send_resume: ['发送简历附件', 97],
  verify_result: ['确认投递结果', 98],
  success: ['投递成功', 100],
  failed: ['投递失败', 100],
  ignored: ['已忽略', 100],
  skipped: ['未达到推荐条件', 100]
});

export function taskStageMeta(stage, label = '', progress = null) {
  const meta = TASK_STAGE_META[stage] || [label || stage || '处理中', 0];
  return {
    label: String(label || meta[0] || '处理中'),
    progress: Math.max(0, Math.min(100, Number(progress ?? meta[1] ?? 0)))
  };
}
