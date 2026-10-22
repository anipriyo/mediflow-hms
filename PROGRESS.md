# MediFlow build – progress log

Project: Hospital Management System (Assignment 1), Group 11.
Folder: ~/Documents/Workspaces/SW_Project · GitHub: https://github.com/anipriyo/mediflow-hms (public) · Live: https://mediflow-hms-6vw1.onrender.com
Spec source of truth: docs/spec/requirements.json (50 FR, 10 NFR, 12 BR), docs/spec/team.json

Stack: React 18 + Vite 5 + Tailwind 3 · Express 4 + better-sqlite3 · JWT + bcrypt · Vitest + Supertest + Playwright

## 2026-10-22 – Live deployment, report v1.1, history cleanup
- **Deployed** on a Render free web service from `render.yaml` (Blueprint `mediflow-hms`, Singapore, Node 22). Live at https://mediflow-hms-6vw1.onrender.com and verified: `/api/health` ok, home page, deep links and demo login all work. Every push to `main` redeploys. Vercel was rejected because each serverless instance would hold its own SQLite copy.
- **Report v1.1** (`deliverables/` DOCX + PDF, 84 pages):
  - Live demo link on the cover, in Group Details, Summary, SDD deployment view and Appendix B (clickable).
  - House style requested by the user: no em dash, en dash, semicolon or colon anywhere in the report text. Implemented as `clean()` in `docs/report/lib.mjs` plus hand-reworded prose, enforced by `docs/report/check_text.py` (part of `npm run report`). Verified 0 of each in the DOCX and the PDF. UML diagram images were left as drawn (UML notation such as `name : type` is inside the images, not the text).
  - Fixed two bugs that were already in v1.0: underscores vanished from identifiers such as `SAMPLE_COLLECTED` (the `_italic_` markup matched inside words), and tables were numbered out of reading order (Appendix B and the FR tables were built before the sections around them). All 59 tables and 30 figures are now in order.
  - `finalize.py` now runs a LibreOffice Basic macro in a throw-away profile (works on macOS and Linux, no Python uno module needed) and maps Consolas to DejaVu Sans Mono. On macOS LibreOffice's own Python is killed by the OS, which is why the uno approach was dropped.
- **History cleanup** (user request): removed all coding-assistant attribution from the repository and its history (co-author and session trailers, an assistant instruction file, mentions in this log) and force-pushed `main`. Commit hashes changed.
- **Tooling on this Mac:** `gh` 2.103.0 (Homebrew) logged in as `anipriyo`, so `git push` works. LibreOffice was installed for the report build and uninstalled afterwards.
- **Repo made public** at the user's request after a final secrets scan (none found). Commit author emails and the group's names and registration numbers are now public.
- **Next:** nothing required. Before a demo, open the live link a minute early so the free server wakes up.

## 2026-10-22 – Publish to GitHub (Mac)
- Added `AGENTS.md` (project brief) and git-ignored `chat_history/`. Pre-push check: no secrets tracked (only the dev-default JWT secret in `server/config.js`), largest file is the 7 MB report PDF.
- Pushed `main` to https://github.com/anipriyo/mediflow-hms (private) after logging in with `gh auth login --web --git-protocol https` and `gh auth setup-git`.

## Steps
- [x] 0. Plan approved (6 roles, Group 11, members in team.json)
- [x] 1. Requirements frozen (docs/spec/requirements.json)
- [x] 2. Backend (server/: domain rules, services, routes, seed)
- [x] 3. Frontend (client/src)
- [x] 4. Tests (tests/unit, tests/integration, tests/e2e) + results JSON
- [x] 5. UML (docs/uml/*.puml → png)
- [x] 6. Report (npm run report → docs/report/build/*.docx/pdf, copied to deliverables/)
- [x] 7. Verify, zip, publish to GitHub, deploy online

## Notes
- Defects log: docs/spec/defects.json (DEF-01..33). Every test ID referenced there must exist in the tests.
- Final test order: `npx vitest run --coverage`, then `npx playwright test` (Vitest clears `docs/test-results/actuals.jsonl`), then `npm run report`.
