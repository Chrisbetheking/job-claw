# 发布指南

## 版本准备

同步更新：

- `source/package.json`
- `source/package-lock.json`
- `source/public/manifest.json`
- `README.md`
- `CHANGELOG.md`
- `CITATION.cff`

运行：

```bash
cd source
npm ci
npm test
```

## Pull Request

从 `main` 创建发布分支，例如：

```text
release/v2.2.0
```

通过 Pull Request 合并，不直接上传整包到 `main`。

## Tag

在合并后的 `main` 最新提交创建：

```text
v2.2.0
```

标签必须与 Manifest 版本完全一致。

## 自动 Release

`.github/workflows/release.yml` 会：

1. 安装依赖
2. 运行完整测试
3. 核对 Tag 和 Manifest
4. 构建 Chrome 扩展
5. 打包扩展、OpenClaw、文档和安装脚本
6. 生成 SHA-256
7. 创建 GitHub Release

不要在同名标签已经存在时重复创建。失败时修复工作流后重新运行，或删除错误标签再从正确提交创建。
