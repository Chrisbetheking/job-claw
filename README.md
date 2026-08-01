<div align="center">

# JobClaw

**本地优先的开源求职投递助手**

[安装](#安装与运行) · [功能](#主要功能) · [开发](#本地开发) · [贡献](CONTRIBUTING.md) · [安全](SECURITY.md) · [许可证](#开源许可证)

![Version](https://img.shields.io/badge/version-v2.0.1-078A83)
![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4)
![Node](https://img.shields.io/badge/Node.js-%3E%3D20-339933)
![License](https://img.shields.io/badge/license-Apache--2.0-2AA66A)

</div>

> JobClaw 不是任何招聘平台的官方产品。使用者需要遵守适用法律、目标网站规则和账号使用要求。项目不提供验证码绕过、账号轮换、代理池、设备指纹伪装或其他规避平台安全措施的能力。

> **v2.0.1 临时修复版**：修复 v2.0.0 招呼语过短、岗位元数据污染和旧短招呼语迁移问题，不改变完全海投、安全海投与五项筛选的既有行为。

## 项目简介

JobClaw 将简历整理、职业画像、岗位搜索、条件筛选、岗位去重、风险提示、沟通草稿和投递进度集中在 Chrome 侧边栏中。数据默认保存在浏览器或用户自己的电脑中，AI 服务由用户自行配置。

```text
导入简历
  → 生成并核对职业画像
  → 设置城市、岗位类型、薪资、经验和学历
  → 完全海投或安全海投
  → 岗位去重与风险检查
  → 人工确认或用户主动启用的自动辅助
  → 发送证据确认、失败恢复和日报
```

## 主要功能

- **简历中心**：解析 PDF、DOCX、TXT，保留可编辑原文
- **职业画像**：根据真实简历生成可编辑的技能、项目和求职条件
- **两种海投策略**：完全海投与安全海投
- **搜索条件自动化**：地区、求职类型、薪资、工作经验、学历要求
- **多城市轮换**：按城市和关键词交错搜索，减少重复结果
- **岗位去重**：岗位 ID、URL、公司、标题、地区和内容指纹联合判断
- **企业与岗位风险提示**：本地规则加可选 OpenClaw Provider
- **完整求职招呼语**：从简历提取姓名、学校、到岗时间、技术、项目和负责模块，生成可编辑的完整自我介绍，只使用真实事实
- **可靠发送**：会话身份绑定、单线程执行、限速、发送气泡确认
- **失败恢复**：任务冷却、断点续跑、异常熔断和人工处理
- **模拟运行**：完成采集和队列预览，但不发送消息
- **OpenClaw**：可选本地桥接、OCR、企业 Provider 和每日汇报

## 仓库结构

```text
job-claw/
├── source/
│   ├── src/                 扩展源码
│   ├── public/              Manifest、HTML、CSS 和图标
│   ├── tests/               单元、集成和回归测试
│   ├── scripts/             检查脚本
│   └── build.mjs            构建入口
├── desktop-bridge/          OpenClaw 本地桥接
├── docs/                    安装、架构、安全和开发文档
├── skills/                  JobClaw 技能定义
├── .github/                 CI、Release、Issue 和 PR 模板
└── install-openclaw-macos.command
```

`source/src` 和 `source/public` 是扩展的唯一源码入口。`source/dist` 是本地构建产物，默认不会提交到 Git。

## 安装与运行

### 方式一：使用 GitHub Release

普通用户进入仓库的 **Releases** 页面，下载 `JobClaw-v2.0.1.zip`，解压后在 Chrome 中加载其中的 `chrome-extension` 文件夹。

1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择 `chrome-extension`
5. 打开招聘网站职位页并打开 JobClaw 侧边栏

### 方式二：从源码构建

需要 Node.js 20 或更高版本。

```bash
cd source
npm ci
npm test
```

构建结果位于：

```text
source/dist/chrome-extension
```

在 Chrome 扩展管理页加载这个目录即可。

### 可选：安装 OpenClaw 本地桥接

macOS：

```bash
chmod +x install-openclaw-macos.command
./install-openclaw-macos.command
```

OpenClaw 不是基础功能的强制依赖。它主要用于本地 OCR、企业数据 Provider、任务恢复和日报。

## 首次使用建议

1. 导入并核对简历原文
2. 检查职业画像中是否存在夸大或错误信息
3. 开启模拟运行
4. 使用单一城市和单一关键词验证筛选是否生效
5. 先使用人工确认模式发送一条
6. 确认招聘者、岗位和右侧发送气泡一致后，再启用自动辅助

详细说明见 [安装指南](docs/installation.md) 和 [首次运行检查](docs/first-run-checklist.md)。

## 海投策略

### 完全海投

不因为技能、专业、工作年限、学历或匹配分不足而自动排除岗位，但仍保留：

- 重复岗位过滤
- 明确风险岗位拦截
- 账号与页面异常熔断
- 发送限速
- 会话身份确认
- 发送结果证据确认

### 安全海投

在完全海投的基础上，额外排除 JD 中明确写出的、无法通过沟通确认解决的硬性冲突。

## 数据与隐私

- 简历、职业画像、筛选条件和任务记录默认保存在用户设备中
- 项目不要求导出或上传 Cookie、Token 和会话文件
- API Key 不应提交到仓库、Issue、截图或日志
- 调用第三方 AI 时，必要的简历摘要和岗位信息会发送给用户自行选择的服务商
- 导出诊断信息前，请删除姓名、电话、邮箱、聊天内容和密钥

详见 [隐私说明](docs/privacy.md) 和 [权限说明](docs/permissions.md)。

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

完整测试包括构建、Manifest V3/CSP 检查、单元测试、集成测试、历史回归、JavaScript 语法检查和敏感信息扫描。

开发流程和提交规范见 [开发指南](docs/development.md)。

## 公开发布

仓库包含 GitHub Actions：

- `CI`：推送和 Pull Request 时运行完整验证
- `CodeQL`：静态安全分析
- `Release`：推送 `v*` 标签后构建可安装 ZIP、生成 SHA-256 并创建 Release

发布步骤见 [发布指南](docs/release.md)。

## 开源许可证

JobClaw 的完整源码以 **Apache License 2.0** 开源。

在许可证范围内，你可以：

- 使用和复制
- 修改和创建派生版本
- 分发源码或二进制版本
- 用于个人、研究或商业项目

分发时需要保留许可证和适用的版权声明，并说明你做出的重要修改。项目没有额外的“必须通知作者”“禁止商业使用”或“必须保留产品品牌”条款。

详见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。

## 贡献

欢迎提交 Issue 和 Pull Request。请不要在公开内容中上传真实简历、聊天记录、Cookie、Token、API Key 或其他个人信息。

- [贡献指南](CONTRIBUTING.md)
- [行为准则](CODE_OF_CONDUCT.md)
- [安全报告](SECURITY.md)

## 免责声明

JobClaw 仅提供信息整理和用户可控的操作辅助。AI 输出可能不准确，发送前应由用户核对。使用本项目产生的账号风险、平台限制或求职结果由使用者自行评估和承担。
