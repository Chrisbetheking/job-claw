# Changelog

## 2.0.0

- 首页和设置页新增完全海投与安全海投双策略切换
- 完全海投不再按技能 年限 专业 学历或匹配分拦截 但继续执行去重 风险检查 限速和发送确认
- 安全海投只额外拦截明确不可改变的硬性冲突
- 重构BOSS求职类型 薪资 工作经验和学历筛选定位 点击 重试和实际值核验
- 页面实际筛选卡只展示页面读取结果 不再以配置值代替
- 招呼语升级为真人项目型 清理岗位尾部标签 只带一段真实项目 一项职责和最多2项技术
- 阻止把实习生 工程师等职位名称错误写成项目经历

## 1.9.0 — 2026-08-01

- Replaced the indefinite “正在连接” state with a bounded startup state machine and explicit steps.
- Added timeouts to Chrome tab discovery, content-script probing, page reload and RUN dispatch.
- Added idempotent startup requests so repeated clicks cannot launch duplicate workflows.
- Added startup recovery actions for reconnecting and opening the BOSS jobs page.
- Prefer the active BOSS tab in the current window instead of an arbitrary background tab.
- Added an effective-search-context card comparing configured filters with the active page state.
- Added v1.9 migration, runtime build handshake and regression coverage.


### v1.8.0 城市切换与折叠状态修复

- 搜索任务先切换 BOSS 顶部城市并确认生效 再提交关键词
- 关键词搜索完成后依次应用求职类型 薪资 工作经验和学历
- 修复地区配置为北京但页面仍停留成都的问题
- 所有可折叠模块升级后默认收起 并继续记住用户后续选择
- 增加搜索结果变化确认和筛选应用状态提示

## 1.8.0 — 2026-07-31

### Messaging, greetings and recovery

- Rebuilt the delivery/message task layout for narrow Chrome side panels, including wrapped titles, compact active cards, folded history and expandable long errors.
- Sanitized polluted historical task titles so recruiter names, activity labels, salary and degree metadata are not displayed as job names.
- Added a natural project-based greeting style that selects one relevant resume project or practice and at most three real technologies.
- Shortened greeting output to a conversational three-sentence structure and blocked common robotic template phrases.
- Ported the v1.7 chat-entry recovery flow to v1.8, including stale content-script detection, DOM-based editor waiting, one automatic reopen retry, per-job cooldown and resumable queues.
- Kept uncertain send results, login anomalies, verification pages and identity mismatch as hard safety pauses.

### Multi-city filters

- Connected BOSS top filters for city employment type salary experience and education to each search task.
- Added nationwide expansion and round-robin city rotation so different keywords are distributed across multiple cities.
- Added task limits and per-city keyword collection limits to keep large search plans bounded.

### Result diversity and quality

- Added continuous job-list loading instead of stopping after the first visible cards.
- Added recent-job memory using job identity family keys and content fingerprints.
- Added duplicate and low-quality streak detection with automatic switching to the next city or keyword.
- Added user-controlled clearing of recent job memory without deleting actual delivery history.
- Kept ordinary skill education major and experience gaps as ranking signals rather than hard rejections.

### Reporting and validation

- Added filter failure duplicate low-quality and automatic-switch counters to task progress and OpenClaw daily reports.
- Added unit and regression coverage for search filter normalization multi-city task generation quality scoring and v1.8 UI wiring.

## 1.7.0 — 2026-07-31

### Formal delivery strategies

- Replaced balanced and explore modes with two clear strategies: precise delivery and safe mass apply.
- Safe mass apply blocks only explicit hard conflicts, duplicates and high-risk jobs; skill, major, education and experience gaps affect ordering instead of automatically rejecting a job.
- Added a fast mass-apply analysis mode that avoids one LLM call per job and generates evidence-based greetings locally.
- Added optional AI-personalized mass apply for users who prefer deeper per-job analysis.

### Delivery efficiency and safety

- Added conservative, standard, efficient and custom pacing presets.
- Reduced unnecessary waiting while retaining one-at-a-time sending and verified chat-bubble evidence.
- Added configurable queue warmup and adaptive backoff when pages or networks become slower.
- Added a bridge-unavailable cooldown so enterprise verification does not wait for repeated connection timeouts on every job.
- Preserved circuit breaking for verification pages, login anomalies, HTTP 403/429, identity mismatch and uncertain send results.

### OpenClaw connection and reports

- Added HTTP plus Chrome Native Messaging dual transport.
- Added automatic bridge wake-up through the installed native host.
- Expanded macOS installation to install LaunchAgent and Native Messaging manifests.
- Added detailed connection diagnostics and repair guidance.
- Added scheduled daily reports, immediate report generation, local Markdown archives and macOS notifications.

### Company verification and repository quality

- Kept the authorized OpenClaw enterprise Provider interface and transparent local-risk fallback.
- Added cross-task deduplication, enterprise-result caching, update checks and release metadata validation.
- Added CODEOWNERS, Dependabot configuration and documented GitHub branch/PR/release workflows.

## 1.3.0 — 2026-07-25

### Stability and safety

- Added a first-run single-job validation gate for fully automatic delivery.
- The first successful automatic delivery pauses the queue so the user can verify the actual chat bubble and attachment before continuing in bulk.
- Existing users with successful historical deliveries are migrated as already validated.
- Added a fourth startup readiness item showing the validation state.

### Architecture

- Extracted conversation identity, task-stage metadata, and job-priority logic into focused runtime modules.
- Added unit tests for the extracted modules.
- Split the previous long test command into unit, integration, regression, manifest, syntax, secret-scan, and release-sync checks.

### Open-source and repository quality

- Added Apache License 2.0, NOTICE, attribution guidance, citation metadata, trademark guidance, and a code of conduct.
- Added GitHub Actions for CI, CodeQL, tagged releases, ZIP packaging, and SHA-256 generation.
- Added repository hygiene files and expanded secret scanning.
- Removed generated validation metadata from the repository root.

## 1.2.37 — 2026-07-24

- Added user-selected delivery directions after career-profile generation.
- Search tasks are generated only from explicitly selected and saved directions.
- Preserved AI matching, automatic ranking, manual review, automatic delivery, progress tracking, retry handling, and OpenClaw.

## 1.9.0 City Route Hotfix

- 城市切换改为优先使用 BOSS 城市编码构造职位搜索地址，不再依赖顶部城市弹窗的合成点击。
- 运行时尝试读取 BOSS 城市目录接口并缓存 30 天，接口不可用时使用内置常用城市编码。
- 支持 `/web/geek/job` 与 `/web/geek/jobs` 两条职位路由，第一次导航未生效时自动换路由重试。
- 页面重载后通过 URL 城市编码、顶部城市文字和岗位结果地区三类证据确认切换结果。
- 地址导航两次仍未确认时才回退到原顶部城市选择器，避免无限停留在连接或切换状态。
- 城市和关键词一次性写入搜索地址，页面加载后再应用求职类型、薪资、经验和学历筛选。
