# MediFlow build – progress log

Project: Hospital Management System (Assignment 1), Group 11.
Cloud workspace: /home/user/mediflow · Mac mirror: ~/Documents/Workspaces/SW_Project
Spec source of truth: docs/spec/requirements.json (50 FR, 10 NFR, 12 BR), docs/spec/team.json

Stack: React 18 + Vite 5 + Tailwind 3 · Express 4 + better-sqlite3 · JWT + bcrypt · Vitest + Supertest + Playwright

## Steps
- [x] 0. Plan approved (6 roles, Group 11, members in team.json)
- [x] 1. Requirements frozen (docs/spec/requirements.json)
- [x] 2. Backend (server/: domain rules, services, routes, seed)
- [x] 3. Frontend (client/src)
- [ ] 4. Tests (tests/unit, tests/integration, tests/e2e) + results JSON
- [ ] 5. UML (docs/uml/*.puml → png)
- [ ] 6. Report (docs/report → DOCX + PDF)
- [ ] 7. Verify, zip, sync to Mac SW_Project, save to Project

## Notes
- GitHub: repo created at https://github.com/anipriyo/mediflow-hms (private, empty). Org blocks GitHub connector → cannot push from cloud. User pushes from Mac: `cd ~/Documents/Workspaces/SW_Project && git push -u origin main`. Sync .git inside tarball to SW_Project.
- Mac folder: /Users/manda_mac/Documents/Workspaces/SW_Project (granted ~/Documents). Stray empty ~/Documents/MediFlow-HMS (couldn't delete).
- Scheduled resume check-in: trig_01RSy2v9X9QFht4FwDeBJyKR at 21:57Z.
- Sync method: tar (excl node_modules/dist/db) → /mnt/user-data/outputs → SendUserFile → device_commit_files to SW_Project/.sync/ → device_bash `tar --overwrite -xzf`.
- Defects log: docs/spec/defects.json (DEF-01..08). Test IDs referenced there must exist: IT-APT-03, IT-BIL-07, UT-IPD-05, UT-IPD-06, IT-IPD-06, IT-LAB-06, IT-IPD-02, ST-BIL-01.
