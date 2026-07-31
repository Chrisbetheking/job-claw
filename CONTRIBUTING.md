# Contributing to JobClaw

感谢你参与 JobClaw。

## 开发环境

- Node.js 20 或更高版本
- Chrome 或 Chromium 浏览器
- macOS OpenClaw 功能需要系统自带 Swift、PDFKit 和 Vision

```bash
git clone https://github.com/Chrisbetheking/job-claw.git
cd job-claw/source
npm ci
npm test
```

## 源码入口

- `source/src`：JavaScript 源码
- `source/public`：Manifest、HTML、CSS、图标
- `desktop-bridge`：可选本地桥接
- `source/dist`：构建产物，不提交到仓库

不要直接编辑构建目录。

## 分支和提交

从最新 `main` 创建分支：

```text
feat/company-verification
fix/city-filter
refactor/task-state
```

推荐提交前缀：

```text
feat:     新功能
fix:      Bug 修复
refactor: 不改变行为的重构
test:     测试
docs:     文档
chore:    工程维护
```

一个提交只解决一类问题。不要把无关格式化、构建产物和功能修改混在一起。

## 提交前检查

```bash
cd source
npm test
```

UI 修改请至少检查 320、360、400 和 500 像素宽度的侧边栏。

招聘网站适配修复应提供脱敏后的 DOM 结构、复现步骤或测试 Fixture。不要提交真实姓名、公司聊天、Cookie、Token、API Key、简历或本地日志。

## Pull Request

PR 中请说明：

- 问题和复现步骤
- 设计选择
- 修改范围
- 风险与回滚方法
- 已运行的测试
- UI 变化截图（需脱敏）

提交贡献即表示你同意所提交内容按 Apache License 2.0 发布。不要求签署额外 CLA。
