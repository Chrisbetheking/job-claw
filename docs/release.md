# 发布指南

## 准备

1. 更新 `source/package.json` 和 `source/public/manifest.json` 版本
2. 更新 `CHANGELOG.md`
3. 运行完整测试

```bash
cd source
npm ci
npm test
```

## Pull Request

从 `main` 创建发布分支，通过 Pull Request 合并，不直接把大包上传到 `main`。

## Tag 和 Release

在合并后的 `main` 提交创建标签：

```text
v2.0.1
```

推送标签后，`.github/workflows/release.yml` 会：

- 运行完整测试
- 构建 Chrome 扩展
- 生成正式 ZIP
- 生成 SHA-256
- 创建 GitHub Release
