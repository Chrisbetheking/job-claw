# JobClaw v1.7 架构

## 主流程

岗位读取 → 外部网申识别 → 安全限速 → 跨任务去重 → 企业风险核验 → AI 匹配 → 策略判定 → 人工确认或自动队列 → 投递限速 → 会话身份核对 → 真实发送证据 → 写入历史与漏斗

## 唯一源码入口

- `source/src` JavaScript 源码
- `source/public` Manifest HTML CSS 与静态资源
- `source/dist/chrome-extension` 本地构建结果
- `chrome-extension` 提交到仓库的可安装发布目录

不得直接修改 `chrome-extension` 修改完成后执行 `cd source && npm run release:prepare`

## v1.7 模块

- `lib/safety-control.js` 统一限速 熔断和策略判定
- `lib/company-verifier.js` 企业核验结果标准化 本地风险规则和缓存策略
- `lib/deduplication.js` 岗位指纹 历史去重和同公司每日上限
- `lib/update-checker.js` GitHub Release 版本比较
- `lib/platform-adapter.js` 招聘平台能力注册表

## 企业核验边界

本地规则只负责发现岗位描述中的风险信号 不等于工商核验 精准模式只接受外部 Provider 明确核验通过且风险为低的企业
