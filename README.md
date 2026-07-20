# JobClaw

> 面向中国大陆求职场景的简历事实约束求职助手。

JobClaw 由 Chrome 插件、岗位匹配核心和 OpenClaw Skill 组成。它帮助用户读取当前 BOSS 直聘岗位、对照真实简历分析匹配度、生成有证据支持的招呼语并保存求职记录。

当前版本坚持四条原则：

- 不虚构简历能力；
- 不绕过验证码或平台安全验证；
- 不导出登录 Cookie；
- 只填入招呼语，不自动点击发送。

## 当前功能

- 读取当前 BOSS 直聘岗位详情；
- 设置目标岗位、地区和排除关键词；
- 使用一句自然语言更新筛选规则；
- 维护只保存在浏览器本地的简历事实库；
- 计算岗位匹配分数并解释原因；
- 标注简历已支持和暂未体现的技能；
- 根据真实经历生成招呼语；
- 阻止“精通”“多年经验”等无证据夸大表达；
- 一键填入 BOSS 消息框，人工确认后发送；
- 保存岗位记录并导出 JSON；
- 使用 OpenClaw Skill 整理记录和生成日报。

## 项目结构

```text
JobClaw/
├── apps/
│   ├── chrome-extension/      Chrome 插件
│   └── desktop-bridge/        桌面桥接与日报命令行原型
├── packages/
│   └── core/                  匹配、招呼语与事实校验核心
├── skills/
│   └── jobclaw/               OpenClaw Skill
├── docs/                      中文文档
└── .github/workflows/         持续集成
```

## 本地开发

环境要求：

- Node.js 20 或更高版本；
- Chrome 116 或更高版本；
- npm 10 或更高版本。

安装依赖并构建：

```bash
npm install
npm run check
```

构建完成后，插件目录位于：

```text
apps/chrome-extension/dist
```

## 安装 Chrome 插件

1. 打开 `chrome://extensions/`；
2. 打开右上角“开发者模式”；
3. 点击“加载已解压的扩展程序”；
4. 选择 `apps/chrome-extension/dist`；
5. 打开 BOSS 直聘岗位详情页；
6. 点击浏览器工具栏中的 JobClaw 图标。

也可以生成插件压缩包：

```bash
npm run package:extension
```

生成文件位于：

```text
release/jobclaw-chrome-v0.1.0.zip
```

## 使用方法

第一次使用时先进入“简历事实”页：

1. 填写真实身份和教育背景；
2. 填写目标岗位与目标地区；
3. 只填写能够由简历或项目证明的技能；
4. 项目事实按以下格式填写：

```text
项目名称｜真实完成的工作｜关键词1,关键词2
```

示例：

```text
AI学习助手｜使用Vue完成页面与交互开发｜Vue,前端,AI
```

保存后回到“岗位分析”，打开具体岗位并点击“读取当前岗位”。

## OpenClaw Skill

Skill 位于：

```text
skills/jobclaw/SKILL.md
```

当前 Skill 可指导 OpenClaw 分析 JobClaw 导出的记录并生成日报。构建后可运行：

```bash
node apps/desktop-bridge/dist/cli.js health
node apps/desktop-bridge/dist/cli.js report ./jobclaw-records-2026-07-20.json
```

Native Messaging、夜间任务和消息渠道日报将在后续版本接入。

## 安全与合规边界

本项目不会实现或接受以下功能：

- 验证码绕过；
- 代理池和浏览器指纹伪装；
- Cookie 导出或远程托管；
- 招聘平台私有接口逆向；
- 隐藏 WebDriver；
- 多账号群控；
- 高频批量投递；
- 超出简历事实的能力包装。

当页面出现安全验证、账号异常、重新登录或访问频繁提示时，插件会停止填入操作。

## 隐私

V0.1 的简历事实、筛选规则和岗位记录均使用 `chrome.storage.local` 保存在当前浏览器，不会上传到 JobClaw 服务器，因为当前版本没有 JobClaw 服务器。

## 开源协议

MIT License。

## 说明

JobClaw 与 BOSS 直聘及其运营主体不存在隶属、合作或授权关系。“BOSS 直聘”是相关权利人的商标。本项目仅提供用户侧的信息整理与辅助输入能力，使用者应遵守平台规则和适用法律。
