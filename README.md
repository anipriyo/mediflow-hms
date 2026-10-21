# MediFlow – Hospital Management System

Software Engineering **Assignment 1 – Hospital Management System** · **Group 11**

| Name | Registration No. |
|---|---|
| Akash Chakraborty | CSE/23011/1059 |
| Anipriyo Mandal | CSE/23017/1065 |
| Arpan Mandal | CSE/23027/1075 |
| Himanshu Patel | CSE/23052/1100 |
| Pranjali Sirari | CSE/23072/1120 |

MediFlow is a web-based HMS that manages **patients, doctors, appointments, prescriptions, billing and medical records**, plus laboratory, pharmacy and in-patient (bed / admission / discharge) workflows. Highlights:

- **Smart queue** – check-in tokens, live queue board, waiting-time estimates, urgent prioritisation
- **Live bed board** – colour-coded bed states, admission → transfer → discharge tied to billing clearance
- **Role-based access control** for 6 roles and an **append-only audit trail**
- Automatic charges → invoices → part payments → printable receipts
- Role dashboards and management reports

The full report (SRS, SDD with UML, Test Plan and Test Report) is in `docs/report/build/` (`npm run report` regenerates it).

## Quick start

Requirements: **Node.js 20 or newer** (`node -v`). No database server is needed – SQLite is embedded and demo data is created automatically on first start.

```bash
npm install
npm run dev
```

Open **http://localhost:5173** and sign in with one of the demo accounts (password **`Mediflow@123`**):

| Username | Role | Try |
|---|---|---|
| `admin` | Administrator | Dashboard, Reports, Users & Roles, Audit Trail, discharge override |
| `reception` | Receptionist | Register patient, book appointment, check in, queue board, admit patient |
| `dr.sharma` | Doctor | Queue → *Call next patient* → consultation, prescription, lab order, complete |
| `lab` | Lab Technician | Lab worklist → collect sample → enter result |
| `pharmacy` | Pharmacist | Dispense prescriptions, stock alerts, restock |
| `billing` | Billing Staff | *To bill* → generate invoice → record payment → print receipt |

Other commands:

| Command | What it does |
|---|---|
| `npm start` | Build the web app and serve everything on http://localhost:4000 |
| `npm run seed` | Reset the database and regenerate demo data relative to *today* |
| `npm test` | Unit + integration tests (Vitest + Supertest) |
| `npm run test:coverage` | Same, with code coverage |
| `npx playwright install chromium` then `npm run test:e2e` | System + acceptance tests in a real browser |
| `npm run report` | Regenerate the report (DOCX + PDF) – needs LibreOffice for the PDF/TOC step |

Tip: the demo data is generated relative to the moment the database is created. Run `npm run seed` on the morning of a demo so that today's queues and appointments look realistic.

Environment variables (optional): `PORT` (API port, default 4000), `MEDIFLOW_DB` (database file, default `data/mediflow.db`), `JWT_SECRET` (set this in any real deployment).

## Project structure

```
server/            Express API
  domain/          pure business rules (slots, queue ETA, state machines, billing, inventory, permissions)
  services/        use-case logic and transactions
  routes/          REST endpoints (+ middleware/ for JWT auth and RBAC)
  db/              schema.sql, connection, demo seed
client/            React + Tailwind single-page app (pages/, components/, lib/)
tests/             unit/, integration/, e2e/ (Playwright)
docs/spec/         requirements.json (50 FR, 10 NFR, 12 BR), defects.json, team.json
docs/uml/          PlantUML sources and rendered diagrams
docs/test-results/ raw test results, coverage, run log
docs/report/       report generator → build/MediFlow_HMS_Group11_Report.docx / .pdf
```

## Publishing to GitHub

The repository already points at `https://github.com/anipriyo/mediflow-hms` (private). From this folder run:

```bash
git push -u origin main
```

(or, with the GitHub CLI: `gh repo create mediflow-hms --private --source=. --push` if the remote does not exist yet).
