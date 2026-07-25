# Changelog

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
