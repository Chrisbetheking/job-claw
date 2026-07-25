# GitHub 发布说明

本页面向维护者，普通用户只需要从 Releases 下载 ZIP。

## 日常开发

1. 使用 GitHub Desktop 克隆仓库。
2. 在 Finder 中修改本地仓库文件。
3. 在 `source` 目录运行：

```bash
npm test
```

4. GitHub Desktop 提交并 Push 到 `main`。
5. 在 GitHub Actions 中确认 `CI` 与 `CodeQL` 通过。

## 发布 v1.3.0

1. 确认 `CHANGELOG.md`、`README.md` 和 Manifest 版本已经更新。
2. 确认根目录 `chrome-extension` 与 `source/dist/chrome-extension` 一致。
3. 在 GitHub Desktop 创建并推送 Tag：`v1.3.0`。
4. `Release` 工作流会自动：
   - 运行完整测试；
   - 从源码构建扩展；
   - 组装普通用户安装包；
   - 生成 ZIP；
   - 生成 SHA-256；
   - 发布 GitHub Release。

不要把 API Key、真实简历、手机号、招聘者聊天、Cookie 或本地 `.jobclaw` 数据放入 Release。
