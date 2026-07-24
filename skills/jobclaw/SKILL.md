---
name: jobclaw
description: 控制本机 JobClaw 求职任务、读取状态并生成日报。
---

使用 JobClaw 目录中的 `desktop-bridge/cli.js`：

- 开始：`node desktop-bridge/cli.js control start`
- 暂停：`node desktop-bridge/cli.js control pause`
- 停止：`node desktop-bridge/cli.js control stop`
- 日报：`node desktop-bridge/cli.js report`
- 状态：`node desktop-bridge/cli.js status`

不得绕过验证码、安全验证或平台频率限制。不得替用户承诺薪资、到岗时间、面试时间或不存在的经历。执行模式由用户选择：人工确认模式必须在“消息”页确认后发送；全自动投递模式只对达到用户阈值的岗位发送，并且必须使用求职者口吻、只引用真实简历事实。
