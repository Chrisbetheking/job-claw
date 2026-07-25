---
name: jobclaw
description: 控制本机 JobClaw 求职任务、读取状态、恢复失败任务并生成日报。
---

使用 JobClaw 目录中的 `desktop-bridge/cli.js`：

- 开始：`node desktop-bridge/cli.js control start`
- 暂停：`node desktop-bridge/cli.js control pause`
- 停止：`node desktop-bridge/cli.js control stop`
- 日报：`node desktop-bridge/cli.js report`
- 状态：`node desktop-bridge/cli.js status`

安全规则：

- 不得绕过验证码、安全验证或平台频率限制。
- 不得替用户承诺薪资、到岗时间、面试时间或不存在的经历。
- 人工确认模式必须由用户确认后发送。
- 全自动模式只处理达到用户阈值、属于用户已选择方向的岗位。
- 首次全自动成功投递一条后必须暂停，让用户核对聊天对象、文字气泡和附件。
- 未确认右侧聊天文字气泡时，不发送附件、不计成功、不继续下一个岗位。
- 所有提示词和招呼语必须使用求职者口吻，并只引用真实简历事实。
