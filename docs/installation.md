# 安装指南

## 从 Release 安装

1. 在 GitHub Releases 下载正式 ZIP
2. 解压文件
3. 打开 `chrome://extensions`
4. 开启开发者模式
5. 选择“加载已解压的扩展程序”
6. 选择 ZIP 中的 `chrome-extension` 文件夹

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

## 更新

从源码更新时先拉取最新代码，再重新运行 `npm test`，最后在扩展管理页点击“重新加载”。所有已打开的招聘网站页面也需要刷新。

## OpenClaw

OpenClaw 是可选模块。macOS 执行：

```bash
chmod +x install-openclaw-macos.command
./install-openclaw-macos.command
```
