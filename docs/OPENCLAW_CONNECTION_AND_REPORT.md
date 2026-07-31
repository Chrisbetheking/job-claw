# OpenClaw连接与每日汇报

## 安装或修复连接

1. 保留完整源码目录 不要只下载chrome-extension文件夹
2. 双击项目根目录的 `安装桌面桥接-mac.command`
3. 脚本会将桥接复制到 `~/.jobclaw/bridge`
4. 脚本会安装macOS LaunchAgent
5. 脚本会安装Chrome Native Messaging Host
6. 回到JobClaw侧边栏 打开OpenClaw页面 点击检测并修复

连接成功时会显示HTTP或Native通道

## 日志

- `~/.jobclaw/bridge.log`
- `~/.jobclaw/bridge-error.log`
- `~/.jobclaw/data.json`
- `~/.jobclaw/reports/latest.md`

## 每日汇报

在OpenClaw页面开启每天自动汇报并设置本机时间

OpenClaw会汇总

- 采集岗位数
- AI分析数
- 成功沟通数
- 失败数
- 风险拦截数
- 重复岗位数
- 模拟运行数
- 当前待处理队列
- 当天成功沟通岗位和主要公司
- 最近需要注意的异常

也可以运行

```bash
node ~/.jobclaw/bridge/cli.js report
node ~/.jobclaw/bridge/cli.js report-now
node ~/.jobclaw/bridge/cli.js report-status
```

## 企业Provider降级

OpenClaw没有连接时 扩展会先尝试Native Messaging自动唤醒

仍然失败时 企业核验会临时降级为本地岗位风险规则并进入冷却 不会对每一个岗位重复等待连接超时
