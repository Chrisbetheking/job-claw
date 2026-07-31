# OpenClaw 本地桥接

OpenClaw 是可选的本地服务，用于：

- 扫描 PDF 的本地 OCR
- 企业信息 Provider
- 每日求职报告
- 本地任务快照和恢复

默认监听 `127.0.0.1:17899`，数据保存到：

```text
~/.jobclaw
```

企业 Provider 的密钥通过环境变量配置，不应写入扩展或仓库。
