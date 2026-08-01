# 架构说明

## 运行层次

```text
Chrome 侧边栏
→ Background 状态机与 AI 路由
→ BOSS Content Script
→ 页面读取、筛选和用户授权动作
→ 发送证据确认
→ 本地状态、失败恢复和日报
```

## 主要模块

- `background.js`：任务状态机、AI Provider、配置、持久化、暂停与停止
- `content-v37.js`：岗位读取、筛选、会话写入、发送证据和页面控制
- `sidepanel.js`：用户交互、配置、状态展示和降级提醒
- `lib/ai-routing.js`：云端、本地模型和轻量算法路由
- `lib/` 其他模块：去重、企业检查、限速、筛选、任务状态和岗位排序

## AI 路由

自动模式：

```text
云端 DeepSeek 已配置 → cloud
否则本地模型已启用 → local
否则 → rules
```

云端与本地模型都通过 OpenAI 兼容的 `/chat/completions` 结构调用。每个 AI 请求拥有独立 AbortController，暂停或停止时统一取消。

## 即时暂停

```text
侧边栏点击暂停
→ Background 先标记 pausing
→ Abort 所有 AI 请求
→ 向全部 BOSS 标签页广播 PAUSE_NOW
→ Content Script 中断 sleep、waitFor、筛选和发送前检查
→ 状态改为 paused
```

暂停不回滚已经被招聘网站确认接收的消息。结果不明确时系统会进入人工核对。

## 安全边界

- 高风险操作由用户主动启用
- 同一时间只执行一个发送动作
- 当前招聘者和岗位身份不确定时停止
- 只有看到真实发送气泡才记录成功
- 登录验证和验证码不会自动绕过
- API Key 只保存在扩展本地存储，不写入仓库

## OpenClaw

OpenClaw 通过 localhost HTTP 或 Chrome Native Messaging 与扩展连接，只监听本机回环地址，数据默认保存在 `~/.jobclaw`。
