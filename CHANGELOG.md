# Changelog

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
