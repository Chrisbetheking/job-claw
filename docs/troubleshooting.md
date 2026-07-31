# 常见问题

## 一直显示正在连接

1. 在 `chrome://extensions` 重新加载 JobClaw
2. 刷新所有招聘网站页面
3. 保留一个当前活动的职位页面
4. 再次启动模拟运行

## 城市或筛选没有生效

查看侧边栏中的“页面实际筛选”，确认配置值和页面值一致。城市应先切换，再提交关键词，之后应用其他筛选条件。

## OpenClaw 未连接

重新运行 `install-openclaw-macos.command`，然后检查：

```text
~/.jobclaw/bridge.log
~/.jobclaw/bridge-error.log
```

## 修改代码后页面仍是旧版本

重新构建扩展、点击“重新加载”，并刷新所有已打开的目标页面。
