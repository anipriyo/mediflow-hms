# Test execution log

| Run | Date/time (IST) | Scope | Result | Notes |
|---|---|---|---|---|
| R1 | 2026-10-21 23:09 | Unit (47) | 47 passed | First execution of unit suite. |
| R2 | 2026-10-21 23:13 | Integration (75) | 73 passed, 2 failed | IT-IPD-09: test advanced the simulated clock by 26 h, so the 8-hour sessions had expired (correct product behaviour, FR-01) → test now logs in again after the jump. IT-BIL-08: test relied on an OPD charge that did not exist in its fixture → test now creates its own visit. Both were test-script errors, not product defects. |
| R3 | 2026-10-21 23:16 | Unit + Integration (122) | 122 passed | Regression run after correcting the two test scripts. |
| R4 | 2026-10-21 23:20 | System + Acceptance E2E (15, Playwright/Chromium) | 15 passed | First execution of the browser suite against a freshly seeded demo database (10 system ST-*, 5 acceptance AT-*). No product defects found; report screenshots captured in docs/screenshots/. |
| R5 | 2026-10-21 23:24 | System + Acceptance E2E (15) | 15 passed | Confirmation run on a new database to check the suite is repeatable (no flaky tests); E2E entries in actuals.jsonl are from this run. |
| R6 | 2026-10-22 03:00–03:35 | Robustness / edge-case probes (API) | 16 issues found | Exploratory boundary and invalid-input probes against every API (impossible dates, wrong types, extreme values, wildcards, ownership, sequence numbers, time-zone boundaries). Product defects DEF-09 … DEF-24 logged and fixed; 16 regression tests IT-EDGE-01 … 16 added. |
| R7 | 2026-10-22 03:35–04:05 | Robustness / edge-case crawl (UI) | 9 issues found | Every screen for all 6 roles at 1440 px, 390 px and 360 px, bad deep links, empty database, double-clicks. Product defects DEF-25 … DEF-33 logged and fixed; crawl automated as ST-UI-01 … 04. |
| R9 | 2026-10-22 04:14 | System + Acceptance E2E (19, Playwright/Chromium) | 19 passed | Final regression run on a freshly generated demo database (10 ST functional, 4 ST-UI, 5 AT) in 3.9 min. Report screenshots re-captured in this run. |
| R10 | 2026-10-22 04:20 | Unit + Integration (142), with coverage | 142 passed | Final regression run after all fixes (includes IT-EDGE-*, UT-PAT-06 … 08). Traceability review showed FR-14 had no test, so IT-DOC-03 was added before this run. Together with R9 this is the final execution reported in the Software Test Report. |
