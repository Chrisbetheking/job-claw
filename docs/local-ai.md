# 本地 AI

JobClaw v2.2 支持三层 AI 路由：

```text
DeepSeek V4 Flash
→ 本机 OpenAI 兼容模型
→ 内置轻量算法
```

## 为什么不把模型权重放进扩展

中文模型权重通常远大于 Chrome 扩展本体，不同电脑适合的量化版本也不同。把权重直接放进扩展会导致安装包过大、更新困难，并增加内存占用。因此 JobClaw 只内置推理路由和轻量算法，模型由用户自行安装。

## 推荐模型

| 场景 | 模型 | 说明 |
|---|---|---|
| 默认云端 | `deepseek-v4-flash` | 逐岗分析和招呼语生成 |
| 本地推荐 | `qwen3:1.7b` | 中文能力与资源占用相对均衡 |
| 极低配置 | `qwen3:0.6b` | 更省内存，但理解与表达能力较弱 |

## macOS 快速安装

先安装 Ollama，然后运行：

```bash
chmod +x install-local-ai-macos.command
./install-local-ai-macos.command
```

脚本默认执行：

```bash
ollama pull qwen3:1.7b
```

JobClaw 设置：

```text
AI 路由: 自动选择 或 仅本地模型
本地 Base URL: http://127.0.0.1:11434/v1
本地模型: qwen3:1.7b
```

## llama.cpp 或其他服务

任何提供 OpenAI 兼容 `/v1/chat/completions` 接口的本地服务都可以接入。填写对应 Base URL 和模型名称即可。

## 失败与降级

- 本地服务未启动：自动路由会尝试云端；云端也不可用时转轻量算法
- 模型响应超时：当前岗位降级，不阻塞后续任务
- 点击暂停：正在执行的模型请求会被取消
- 轻量算法不属于 LLM，只基于简历事实、岗位关键词和固定结构生成结果，质量一般低于模型推理
