# 安装指南

## 从 Release 安装

1. 在 GitHub Releases 下载 `JobClaw-v2.2.0.zip`
2. 解压 ZIP
3. 打开 `chrome://extensions`
4. 开启“开发者模式”
5. 点击“加载已解压的扩展程序”
6. 选择 ZIP 中的 `chrome-extension` 文件夹
7. 刷新所有已打开的 BOSS 页面

## 从源码构建

```bash
cd source
npm ci
npm test
```

加载目录：

```text
source/dist/chrome-extension
```

## 配置 AI

推荐在设置页填写 DeepSeek API Key，默认模型为 `deepseek-v4-flash`。

不使用云端 API 时，可以安装本地模型：

```bash
./install-local-ai-macos.command
```

没有任何模型时，启动任务会出现提示。确认后仍可使用本地轻量算法。

## OpenClaw

OpenClaw 是可选模块，主要用于 OCR、企业 Provider、日报和本地恢复：

```bash
chmod +x install-openclaw-macos.command
./install-openclaw-macos.command
```

## 更新

1. 拉取或下载新版本
2. 重新运行 `npm test`
3. 在 `chrome://extensions` 点击“重新加载”
4. 刷新招聘网站页面

同版本覆盖后也必须重新加载扩展和刷新页面，否则旧 Content Script 仍可能留在标签页中。
