# JobClaw GitHub 工作流

## 日常开发

```bash
git switch main
git pull --ff-only
git switch -c feat/company-risk
```

完成一个小目标后提交一次

```bash
git add source/src source/public source/tests docs
git commit -m "feat: add company risk preflight"
```

提交信息建议使用

- `feat:` 新功能
- `fix:` 修复
- `refactor:` 重构
- `test:` 测试
- `docs:` 文档
- `chore:` 构建和仓库维护

## 提交 PR 前

```bash
cd source
npm test
npm run release:prepare
npm test
cd ..
git status --short
git diff --check
```

不要把多个不相关功能塞进同一个 Commit 不要直接在 GitHub 网页覆盖大量源码 不要提交 `.DS_Store` API Key 真实简历 聊天记录或诊断文件

## 发布

1. 合并 PR 到 `main`
2. 确认 Actions 全部通过
3. 更新 `CHANGELOG.md`
4. 本地执行 `cd source && npm run release:prepare && npm test`
5. 提交生成的 `chrome-extension` 和版本元数据
6. 创建标签 `git tag v1.7.0 && git push origin v1.7.0`
7. Release Workflow 自动生成 ZIP 和 SHA256
