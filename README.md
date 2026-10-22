# MediFlow – Hospital Management System

Software Engineering **Assignment 1 – Hospital Management System** · **Group 11**

**Live demo:** https://mediflow-hms-6vw1.onrender.com (no installation needed; the first visit after 15 idle minutes takes about a minute to wake up)

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

The full report (SRS, SDD with UML, Test Plan and Test Report) is in `deliverables/` (`npm run report` regenerates it into `docs/report/build/`).

## How to run

### 1. Install Node.js (one time)

Download the **LTS** installer for macOS or Windows from https://nodejs.org and run it. Then check the version in a terminal:

```bash
node -v
```

It must print **v20 or newer** (v22 and v24 both work). You don't need a database server: SQLite is built in.

### 2. Open a terminal in the project folder

- **macOS:** open Terminal (⌘ + Space → "Terminal") and go to the folder, for example:
  ```bash
  cd ~/Documents/Workspaces/SW_Project
  ```
- **Windows:** open the project folder in File Explorer, type `cmd` in the address bar and press Enter.
- **From GitHub:** click *Code → Download ZIP*, unzip it, and open a terminal in the unzipped folder.

### 3. Install the dependencies (first time only, about 1 minute)

```bash
npm install
```

### 4. Load the demo data (recommended before every demo)

```bash
npm run seed
```

This creates a fresh database with 8 doctors, 64 patients and 14 days of history, all dated relative to *today*. If you skip it, the app creates the same data automatically the first time it starts.

### 5. Start the app

```bash
npm run dev
```

Wait until the terminal shows `Local: http://localhost:5173/`, then open **http://localhost:5173** in Chrome, Edge or Safari. Keep the terminal window open while you use the app.

### 6. Sign in

Every demo account uses the password **`Mediflow@123`**. The login page has one-click buttons that fill in each account.

| Username | Role | Try |
|---|---|---|
| `admin` | Administrator | Dashboard, Reports, Users & Roles, Audit Trail, discharge override |
| `reception` | Receptionist | Register patient, book appointment, check in, queue board, admit patient |
| `dr.sharma` | Doctor | Queue → *Call next patient* → consultation, prescription, lab order, complete |
| `lab` | Lab Technician | Lab worklist → collect sample → enter result |
| `pharmacy` | Pharmacist | Dispense prescriptions, stock alerts, restock |
| `billing` | Billing Staff | *To bill* → generate invoice → record payment → print receipt |

A 10-minute demo script that walks through every module is in [DEMO.md](DEMO.md).

### 7. Close (stop) and restart the app

**To close it:** click the terminal window that is running `npm run dev` and press **Ctrl + C** (Control + C on a Mac too, not ⌘). The server stops and the prompt comes back. Closing the terminal window also stops it. Closing only the browser tab does **not** stop it.

**To restart it:** open a terminal in the project folder (step 2) and run:

```bash
npm run dev
```

Then open **http://localhost:5173** again. Your data (patients, bills and so on) is saved in `data/mediflow.db` and is still there after a restart.

**To restart with fresh demo data:** stop the app with **Ctrl + C**, then run these two commands one at a time:

```bash
npm run seed
```

```bash
npm run dev
```

`npm run seed` deletes everything you entered and reloads the demo data dated today. `npm install` is never needed again unless you download the project into a new folder.

> Paste commands **one line at a time and without `# comments`**. On macOS, zsh passes a `#` and anything after it to npm as extra arguments, which makes the command fail.

### Troubleshooting

| Problem | Fix |
|---|---|
| `npm: command not found` | Node.js is not installed, or the terminal was open before you installed it. Install Node.js (step 1) and open a new terminal. |
| `npm install` fails while building **better-sqlite3** | macOS: run `xcode-select --install`, then `npm install` again. Windows: install the Node.js **LTS** version and tick "Tools for native modules" in the installer. |
| `Cannot find package …` or `concurrently: command not found` | The dependencies are missing. Run `npm install` in the project folder first. |
| "Port 4000 (or 5173) is already in use" | MediFlow is already running in another terminal. Close that terminal, or on macOS run `lsof -i :4000` and then `kill <PID>`. |
| Blank page or "Cannot reach the MediFlow server" | The terminal running `npm run dev` was closed or stopped. Start it again. |
| Today's queue or appointments look empty | Stop the app, run `npm run seed`, and start it again. |

### Other commands

| Command | What it does |
|---|---|
| `npm start` | Build the web app and serve everything on http://localhost:4000 |
| `npm run seed` | Reset the database and regenerate demo data relative to *today* |
| `npm test` | Unit + integration tests (Vitest + Supertest) |
| `npm run test:coverage` | Same, with code coverage |
| `npx playwright install chromium` then `npm run test:e2e` | System + acceptance tests in a real browser |
| `npm run report` | Regenerate the report (DOCX + PDF) and check its punctuation. Needs LibreOffice for the PDF and table of contents (`brew install --cask libreoffice` on macOS) |

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

## Online deployment (Render)

Live at **https://mediflow-hms-6vw1.onrender.com**. The app is deployed as one free Render web service defined in [render.yaml](render.yaml). Render builds the React app, serves it from Express, and runs on Render's servers, so the link works even when your own computer is off.

- **First deploy:** open https://render.com/deploy?repo=https://github.com/anipriyo/mediflow-hms, sign in with GitHub, give Render access to the `mediflow-hms` repository, and click **Deploy Blueprint**. The first build takes about 5 minutes.
- **Updates:** every `git push` to `main` redeploys automatically.
- **Free-tier behaviour:** the service sleeps after 15 minutes without visitors, and the next visit takes about a minute to wake it. The database is not kept: every deploy, restart or wake-up starts with fresh demo data dated that day.
- **Public access:** anyone with the link can sign in with the demo accounts, so enter only made-up data.

## Publishing to GitHub

The repository is `https://github.com/anipriyo/mediflow-hms` (private). After committing, run:

```bash
git push
```
