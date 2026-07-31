# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 2.x | Yes |
| 1.x | Security fixes only when practical |

## Reporting a vulnerability

请优先使用 GitHub 仓库的 **Private vulnerability reporting / Security Advisory** 私密报告安全问题。

不要在公开 Issue 中提交：

- API Key、Cookie、Token、Session
- 真实简历和联系方式
- 招聘者聊天记录
- 可以直接利用的攻击代码
- 本地桥接数据和完整诊断日志

报告建议包含：

- 受影响版本
- 操作系统和 Chrome 版本
- 最小复现步骤
- 影响范围
- 脱敏后的证据
- 建议修复方向（可选）

优先处理的问题包括密钥泄露、跨会话错误发送、任意文件或命令执行、权限越界、诊断数据泄露和绕过用户确认。
