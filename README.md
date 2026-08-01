<div align="center">

# JobClaw

**本地优先、用户可控的开源求职投递助手**

[安装](#安装) · [AI 配置](#ai-配置) · [功能](#功能) · [开发](#本地开发) · [贡献](CONTRIBUTING.md) · [许可证](#许可证)

![Version](https://img.shields.io/badge/version-v2.1.0-078A83)
![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4)
![Node](https://img.shields.io/badge/Node.js-%3E%3D20-339933)
![License](https://img.shields.io/badge/license-Apache--2.0-2AA66A)

</div>

> JobClaw 不是招聘平台官方产品。请遵守适用法律、网站规则和账号使用要求。项目不提供验证码绕过、账号轮换、代理池、设备指纹伪装或其他规避平台安全措施的能力。

## v2.1.0

v2.1 将岗位分析和招呼语改成 **AI 优先**：默认推荐 `deepseek-v4-flash`，也支持本机 OpenAI 兼容模型。没有配置任何模型时，启动前会明确提醒；用户仍可选择本地轻量算法继续运行。

同时重做暂停控制：点击暂停会立刻终止正在等待的页面步骤并取消进行中的 AI 请求，不需要连续点击。

## 功能

- **简历与职业画像**：解析 PDF、DOCX、TXT，保留可编辑原文和用户确认后的事实
- **完全海投 / 安全海投**：扩大覆盖，同时保留重复过滤、风险检查、限速和发送证据
- **搜索条件自动化**：地区、求职类型、薪资、工作经验、学历要求
- **多城市轮换**：城市与关键词交错搜索，减少反复命中同一批岗位
- **AI 岗位分析**：云端 DeepSeek、本地模型、本地轻量算法三层路由
- **AI 招呼语**：结合真实简历、岗位要求和项目经历逐岗生成，不使用虚构事实
- **立即暂停**：终止 AI 请求和页面等待，停止下一步点击或发送
- **可靠发送**：会话身份绑定、单线程执行、右侧气泡确认、未知结果禁止盲目重试
- **失败恢复**：岗位冷却、断点续跑、异常熔断、人工处理
- **OpenClaw**：可选本地 OCR、企业 Provider、日报和任务恢复

## AI 配置

### 推荐：DeepSeek V4 Flash

设置页默认模型为：

```text
Base URL: https://api.deepseek.com
Model: deepseek-v4-flash
```

API Key 仅保存在 Chrome 本地存储中。开启自动路由后，逐岗分析和招呼语优先使用该模型。

### 可选：本地轻量模型

推荐中文轻量模型：

```text
qwen3:1.7b
```

macOS 可运行：

```bash
chmod +x install-local-ai-macos.command
./install-local-ai-macos.command
```

然后在设置中填写：

```text
Base URL: http://127.0.0.1:11434/v1
Model: qwen3:1.7b
```

模型权重不会打进扩展或源码仓库。低配置设备可以改用 `qwen3:0.6b`。详见 [本地 AI 指南](docs/local-ai.md)。

### 未配置模型

JobClaw 会在任务开始前弹窗说明：

- 可以前往设置配置云端或本地模型
- 也可以继续使用内置轻量算法
- 轻量算法不需要下载模型，但岗位理解和招呼语自然度通常低于 LLM

## AI 路由

自动模式按以下顺序工作：

```text
DeepSeek V4 Flash
→ 本地 OpenAI 兼容模型
→ 内置轻量算法
```

也可以强制选择：

- 仅云端 AI
- 仅本地模型
- 仅本地轻量算法

海投分析默认使用 `智能自动`。只要云端或本地模型可用，每个岗位都会经过 AI 分析和招呼语生成；服务超时或不可用时，单个岗位自动降级，不会拖死整条队列。

## 安装

### 使用 Release

1. 在仓库 **Releases** 下载 `JobClaw-v2.1.0.zip`
2. 解压 ZIP
3. 打开 `chrome://extensions`
4. 开启“开发者模式”
5. 点击“加载已解压的扩展程序”
6. 选择 ZIP 中的 `chrome-extension` 文件夹

### 从源码构建

需要 Node.js 20 或更高版本。

```bash
cd source
npm ci
npm test
```

构建目录：

```text
source/dist/chrome-extension
```

## 首次运行

1. 导入简历并核对原文
2. 核对职业画像，不允许 AI 补造经历
3. 设置城市、岗位类型、薪资、经验和学历
4. 配置 DeepSeek 或本地模型；不配置时确认降级提示
5. 开启模拟运行，检查页面实际筛选条件
6. 使用人工确认发送一条消息
7. 确认招聘者、岗位和右侧发送气泡一致
8. 再启用自动辅助

![任务启动](docs/images/06-start-task.png)

## 两种海投策略

### 完全海投

不因技能、专业、工作年限、学历或匹配分不足自动排除岗位，但仍执行：

- 重复岗位过滤
- 明确风险拦截
- 同公司数量限制
- 发送限速
- 会话身份确认
- 发送结果证据确认

### 安全海投

在完全海投基础上，额外排除 JD 中明确、不可改变的硬性冲突。普通技能缺口和年限差距只影响排序。

## 暂停与停止

- **暂停**：立即取消正在进行的 AI 请求，打断页面等待，不再开始下一步动作；保留任务进度
- **停止**：立即取消任务并清理当前运行标识；历史记录仍保留
- 对已经送达招聘网站服务器的消息无法撤回，因此发送结果不明确时系统会暂停并要求人工核对

## 数据与隐私

- 简历、职业画像、筛选条件和任务记录默认保存在用户设备
- API Key 不应提交到仓库、Issue、截图或日志
- 使用云端 AI 时，必要的简历摘要和岗位信息会发送给用户选择的服务商
- 使用本地模型时，请求发送到用户配置的本机地址
- 项目不要求导出 Cookie、Token 或会话文件

详见 [隐私说明](docs/privacy.md) 和 [权限说明](docs/permissions.md)。

## 仓库结构

```text
job-claw/
├── source/
│   ├── src/                  扩展源码
│   ├── public/               Manifest、页面、样式和图标
│   ├── tests/                单元、集成和回归测试
│   ├── scripts/              构建与检查脚本
│   └── build.mjs
├── desktop-bridge/           OpenClaw 本地桥接
├── docs/
├── skills/
├── install-local-ai-macos.command
├── install-openclaw-macos.command
└── .github/
```

`source/src` 与 `source/public` 是扩展的唯一源码入口。`source/dist` 是构建产物，不提交到 Git。

## 本地开发

```bash
cd source
npm ci
npm run build
npm run test:unit
npm run test:integration
npm run test:regression
npm test
```

完整测试包含 Manifest V3、CSP、语法、敏感信息扫描、AI 路由、即时暂停和历史发送回归。

## 发布

向 `main` 合并发布 PR 后创建标签：

```text
v2.1.0
```

GitHub Actions 会运行测试、构建安装包、生成 SHA-256 并创建 Release。详见 [发布指南](docs/release.md)。

## 许可证

JobClaw 使用 **Apache License 2.0** 完全开源，允许使用、修改、分发和商业使用。分发时需保留适用的许可证和版权声明，并说明重要修改。

- [LICENSE](LICENSE)
- [NOTICE](NOTICE)
- [贡献指南](CONTRIBUTING.md)
- [安全报告](SECURITY.md)

## 免责声明

JobClaw 提供信息整理和用户可控的操作辅助。AI 输出可能不准确，发送前应由用户核对。账号风险、平台限制和求职结果由使用者自行评估。
