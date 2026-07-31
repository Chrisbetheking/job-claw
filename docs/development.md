# 开发指南

## 命令

```bash
cd source
npm ci
npm run build
npm test
```

## 修改原则

- 源码只修改 `source/src` 和 `source/public`
- 构建目录 `source/dist` 不提交
- 页面适配逻辑优先放入独立模块
- 所有外部动作需要明确状态、超时和幂等保护
- 新功能需要测试

## 调试

- 扩展后台：`chrome://extensions` → Service Worker
- 页面脚本：目标页面 DevTools Console
- 网络请求：目标页面或扩展 DevTools Network
- OpenClaw：`~/.jobclaw/bridge*.log`
