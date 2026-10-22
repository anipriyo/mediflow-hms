# MediFlow build – progress log

Project: Hospital Management System (Assignment 1), Group 11.
Cloud workspace: /home/user/mediflow · Mac mirror: ~/Documents/Workspaces/SW_Project
Spec source of truth: docs/spec/requirements.json (50 FR, 10 NFR, 12 BR), docs/spec/team.json

Stack: React 18 + Vite 5 + Tailwind 3 · Express 4 + better-sqlite3 · JWT + bcrypt · Vitest + Supertest + Playwright

## 2026-10-22 – Publish to GitHub (Mac)
- Done: added `AGENTS.md` (project brief); git-ignored `chat_history/`. Pre-push check: no secrets tracked (only the dev-default JWT secret in `server/config.js`), largest file is the 7 MB report PDF.
- GitHub login: this Mac had no credentials, so installed `gh` 2.103.0 (Homebrew) and the user logged in through the browser device flow as `anipriyo` (`gh auth login --web --git-protocol https`, then `gh auth setup-git`).
- Pushed `main` to https://github.com/anipriyo/mediflow-hms (private). Verified: remote `main` matches local HEAD, and the remote has 173 files.

## Steps
- [x] 0. Plan approved (6 roles, Group 11, members in team.json)
- [x] 1. Requirements frozen (docs/spec/requirements.json)
- [x] 2. Backend (server/: domain rules, services, routes, seed)
- [x] 3. Frontend (client/src)
- [x] 4. Tests (tests/unit, tests/integration, tests/e2e) + results JSON
- [x] 5. UML (docs/uml/*.puml → png)
- [~] 6. Report generator done (npm run report → docs/report/build/*.docx/pdf); regenerate after final test run
- [ ] 7. Verify, zip, sync to Mac SW_Project, save to Project

## Notes
- GitHub: repo created at https://github.com/anipriyo/mediflow-hms (private, empty). Org blocks GitHub connector → cannot push from cloud. User pushes from Mac: `cd ~/Documents/Workspaces/SW_Project && git push -u origin main`. Sync .git inside tarball to SW_Project.
- Mac folder: /Users/manda_mac/Documents/Workspaces/SW_Project (granted ~/Documents). Stray empty ~/Documents/MediFlow-HMS (couldn't delete).
- Scheduled resume check-in: trig_01RSy2v9X9QFht4FwDeBJyKR at 21:57Z.
- Sync method: tar (excl node_modules/dist/db) → /mnt/user-data/outputs → SendUserFile → device_commit_files to SW_Project/.sync/ → device_bash `tar --overwrite -xzf`.
- Defects log: docs/spec/defects.json (DEF-01..08). Test IDs referenced there must exist: IT-APT-03, IT-BIL-07, UT-IPD-05, UT-IPD-06, IT-IPD-06, IT-LAB-06, IT-IPD-02, ST-BIL-01.
- 8. Edge-case/hardening pass requested by user (after everything) – then final: `npx vitest run --coverage` THEN `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test` (vitest clears actuals.jsonl), then `npm run report`.
