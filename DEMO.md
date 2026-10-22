# MediFlow – how to run and demonstrate

**No setup needed:** open **https://mediflow-hms-6vw1.onrender.com** and skip to step 2. The free server sleeps after 15 idle minutes, so open the link a minute before the demo to wake it. Its demo data resets to fresh records dated that day whenever it restarts.

## 1. Start the app

Open **Terminal** (⌘ + Space → "Terminal") and run:

```bash
cd ~/Documents/Workspaces/SW_Project
npm install
npm run seed
npm run dev
```

Run the lines one at a time, without `#` comments. `npm install` is only needed the first time, and `npm run seed` loads fresh demo data dated *today*. If something fails, see *How to run → Troubleshooting* in [README.md](README.md).

Open **http://localhost:5173** in Chrome or Safari. Keep the Terminal window open while you demo; press **Ctrl + C** to stop.
Next time you only need `cd …`, `npm run seed` (optional) and `npm run dev`.

All demo accounts use the password **`Mediflow@123`** – the login page has one-click buttons for each role:
`admin` · `reception` · `dr.sharma` · `lab` · `pharmacy` · `billing`

> Tip: open a second window in **private/incognito mode** so you can be logged in as two roles at once (e.g. Receptionist on the left, Doctor on the right).

## 2. Demo script (about 10 minutes)

| # | Log in as | Show | Requirements |
|---|---|---|---|
| 1 | **admin** | Dashboard KPIs and charts; sidebar with every module; *Users & Roles* → role-permission matrix | FR-01–06, FR-48 |
| 2 | **reception** | *Patients → Register patient*: type a bad mobile number → field error; then valid → new ID **P000xx**. Register the same name + date of birth again → **duplicate warning** | FR-07–10 |
| 3 | **reception** | *Appointments → Book appointment*: patient → department → doctor → tomorrow → slot grid (free / booked / past) → confirm. Try the same slot for another patient → **"already has an appointment"** | FR-15–17 |
| 4 | **reception** | *Appointments* (today) → **Check in** a Scheduled patient → token. *Queue Board* → Dr. Arjun Sharma: waiting list with **ETA**; **Mark urgent** (reason required) → patient jumps to the top | FR-21–24 |
| 5 | **dr.sharma** | *Queue Board → Call next patient* → *Consultation*: vitals, diagnosis, prescription (medicine search shows stock), order a STAT lab test → **Complete** (try without a diagnosis first → blocked) | FR-25–29 |
| 6 | **lab** | *Laboratory → Collect sample → Enter result* with a value outside the reference range → **ABNORMAL** flag | FR-31–33 |
| 7 | **pharmacy** | *Pharmacy*: one prescription cannot be dispensed (insulin out of stock); dispense another one; *Alerts* tab: low stock and expiry | FR-35–37 |
| 8 | **billing** | *Billing → To bill → Generate invoice* → *Record payment* (UPI + reference) for part of the amount → **Partially paid**; try paying too much → **rejected**; pay the rest → **Paid** → *Print receipt* | FR-44–47 |
| 9 | **reception / dr.sharma / admin** | *Beds & Admissions*: colour-coded bed board → click a green bed → **Admit**; open the admission → **Transfer** (old bed turns *Cleaning*). As the doctor **Request discharge**; as reception **Discharge** → **blocked until the bill is paid**; as admin **override with a reason** (or bill and pay). Mark the old bed **cleaned** → Available | FR-38–43 |
| 10 | **admin** | *Reports* (date range, charts, CSV export) and *Audit Trail* – every action you just performed, with user, role and time (append-only) | FR-49, FR-50 |

Optional finale: in a second Terminal run `npm test` – 142 unit and integration tests pass in a few seconds – and show the report PDF in `deliverables/`.

**Talking points:** layered architecture (React → REST API → services → pure business rules → SQLite); business rules are unit-tested in isolation; every API call is checked against the role-permission matrix; multi-step operations (admission + bed, dispensing + stock, payments) run in a single database transaction; 161 automated tests and 33 logged defects are documented in the Test Report.

## 3. If something goes wrong

| Problem | Fix |
|---|---|
| Queue / today's appointments look empty | Stop the app, run `npm run seed`, start it again |
| "Port 4000 (or 5173) already in use" | Close the other Terminal running MediFlow, or run `lsof -i :4000` and `kill <PID>` |
| `npm install` fails while building *better-sqlite3* | Use Node 22 LTS: `nvm install 22 && nvm use 22`, then `npm install` again |
| Blank page / "Cannot reach the MediFlow server" | Make sure `npm run dev` is still running in Terminal |
| Forgot which account to use | The login page lists all demo accounts – click one to fill it in |

Single-port alternative for a projector: `npm start` builds the app and serves everything on **http://localhost:4000**.
