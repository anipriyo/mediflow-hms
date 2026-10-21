import { H1, H2, H3, P, Bullets, DataTable, TableCaption, KVTable, Callout, Figure, PORTRAIT_W } from './lib.mjs';
import { spec, endpoints, ROOT } from './data.mjs';
import path from 'node:path';
import fs from 'node:fs';

const uml = (f) => path.join(ROOT, 'docs/uml/png', f);
const ver = (pkg) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version; } catch { return '—'; } };

export const USER_REQUIREMENTS = [
  ['UR-01', 'Receptionist', 'register a new patient in under two minutes and be warned if the patient may already exist', 'so that every patient has exactly one record and one permanent ID', 'Unique ID P00001… is shown on save; invalid mobile/DOB is highlighted on the field; a possible duplicate (same mobile + DOB or same name + DOB) is listed and must be confirmed.', 'FR-07, FR-08, FR-09'],
  ['UR-02', 'Receptionist / Doctor', 'find a patient by ID, name or mobile and open the full history', 'so that no information has to be asked or typed twice', 'Search returns matches as I type; the history shows visits, admissions and bills; clinical notes are visible to doctors only.', 'FR-10, FR-11, FR-12, FR-30'],
  ['UR-03', 'Receptionist', 'book, reschedule and cancel appointments only in free slots', 'so that doctors are never double-booked', 'Free / booked / past slots are shown for the chosen date; booking a taken slot is refused with a clear message; cancellation asks for a reason.', 'FR-15 – FR-20'],
  ['UR-04', 'Receptionist', 'check patients in and give them a token with an expected waiting time', 'so that the waiting area is orderly and patients know when they will be seen', 'Token numbers are sequential per doctor per day; the queue board shows position and ETA; urgent patients can be moved to the front with a recorded reason.', 'FR-21 – FR-24'],
  ['UR-05', 'Doctor', 'call the next patient and record vitals, diagnosis, prescription and lab orders on one screen', 'so that the consultation is fast and complete', 'Only one consultation can be open at a time; diagnosis is mandatory to complete; completing the visit charges the fee automatically.', 'FR-25 – FR-29'],
  ['UR-06', 'Lab Technician', 'see a worklist of pending tests and enter results that are flagged when abnormal', 'so that urgent abnormal results reach the doctor quickly', 'STAT orders appear first; a result can only be entered after sample collection; values outside the reference range are marked ABNORMAL.', 'FR-31 – FR-34'],
  ['UR-07', 'Pharmacist', 'dispense prescriptions only when stock is sufficient and be alerted about low or expiring stock', 'so that patients never receive expired medicine and stock-outs are avoided', 'Dispensing is blocked when any item is short or expired; low-stock and expiry (≤ 30 days) alerts are listed; restocking records batch and expiry.', 'FR-35 – FR-37'],
  ['UR-08', 'Receptionist', 'see which beds are free and admit or transfer patients safely', 'so that two patients are never assigned the same bed', 'The bed board is colour-coded by status; only AVAILABLE/RESERVED beds can be assigned; a transferred patient\'s old bed goes to CLEANING.', 'FR-38 – FR-41'],
  ['UR-09', 'Doctor / Receptionist', 'discharge a patient only after the bill is settled, with an emergency override for the administrator', 'so that revenue is not lost and exceptions are accountable', 'Discharge is refused while charges are uninvoiced or unpaid; an administrator can override with a mandatory reason that is audited.', 'FR-42, FR-43'],
  ['UR-10', 'Billing Staff', 'generate an invoice from all pending charges, apply approved discounts and accept part payments', 'so that billing is accurate and quick', 'Invoice lines are filled automatically from consultations, tests, medicines and bed days; discount 0–50%; overpayment is refused; each payment prints a receipt.', 'FR-44 – FR-47'],
  ['UR-11', 'Administrator', 'manage staff accounts, roles and doctor schedules', 'so that each person can do exactly their job', 'Usernames are unique; passwords ≥ 8 characters; accounts can be (de)activated; doctor working days, hours and fees are editable.', 'FR-05, FR-06, FR-13, FR-14'],
  ['UR-12', 'Administrator', 'see today\'s key figures and period reports', 'so that I can monitor workload, occupancy and revenue', 'Dashboard KPIs per role; reports for a date range with charts and CSV export.', 'FR-48, FR-49'],
  ['UR-13', 'All staff', 'log in securely and see only the functions of my role', 'so that patient data is protected', 'Account locks for 15 minutes after 5 wrong passwords; menus and APIs are restricted by role; I can log out.', 'FR-01 – FR-04'],
  ['UR-14', 'Administrator', 'trace who did what and when', 'so that clinical and financial actions are accountable', 'Every state change is in an append-only audit trail that can be searched by entity, action, user and date.', 'FR-50'],
];

export function srs() {
  const moduleName = Object.fromEntries(spec.modules.map((m) => [m.id, m.name]));
  const frTables = spec.modules.flatMap((m) => {
    const frs = spec.functional.filter((f) => f.module === m.id);
    if (!frs.length) return [];
    return [
      H3(`5.${spec.modules.indexOf(m) + 2} ${m.name} (${m.id})`),
      DataTable([{ header: 'ID', width: 900 }, { header: 'Requirement', width: PORTRAIT_W - 900 - 1000 }, { header: 'Priority', width: 1000 }], frs.map((f) => [f.id, f.text, f.priority]), { boldFirst: true }),
      TableCaption(`Functional requirements – ${m.name}`),
    ];
  });

  return [
    H1('PART A – SOFTWARE REQUIREMENTS SPECIFICATION (SRS)', { pageBreak: true }),
    Callout('This SRS follows the structure required by the assignment and is informed by IEEE Std 830-1998 / ISO/IEC/IEEE 29148:2018. Every requirement has a unique identifier (FR-xx, NFR-xx, BR-xx, UR-xx) that is traced to design elements and test cases in Part D and Appendix A.'),

    H2('1. Introduction'),
    H3('1.1 Purpose'),
    P('This document specifies the requirements of **MediFlow**, a web-based Hospital Management System (HMS) developed for Assignment 1 of the Software Engineering course. It describes what the system must do (functional requirements), how well it must do it (non-functional requirements), who will use it and under which assumptions and constraints. It is the baseline for the Software Design Document (Part B) and the Software Test Plan and Report (Parts C and D).'),
    H3('1.2 Intended audience'),
    Bullets([
      '**Course instructor and evaluators** – to assess completeness and quality of the specification.',
      '**Development team (Group 11)** – as the single source of truth for design, implementation and testing.',
      '**Hospital stakeholders (future)** – administrators, doctors, front-desk, laboratory, pharmacy and billing staff who would validate the requirements.',
    ]),
    H3('1.3 Product overview'),
    P('MediFlow connects the reception desk, doctors, laboratory, pharmacy, wards and billing through one shared patient record. A patient\'s journey – **registration → appointment → check-in and queue token → consultation → prescription / lab tests → billing → payment** (and for in-patients **admission → bed allocation → transfer → discharge**) – flows through the system without re-entering data. Three features distinguish the product from a basic HMS: a **smart queue** with tokens and waiting-time estimates, a **live bed board** with a safe admission/discharge workflow tied to billing clearance, and **role-based access control with an append-only audit trail**.'),
    H3('1.4 Definitions, acronyms and abbreviations'),
    DataTable([{ header: 'Term', width: 2200 }, { header: 'Meaning', width: PORTRAIT_W - 2200 }], [
      ['HMS', 'Hospital Management System'],
      ['OPD / IPD', 'Out-patient department (visits without admission) / In-patient department (admitted patients)'],
      ['RBAC', 'Role-Based Access Control – permissions are granted to roles, users get one role'],
      ['Token', 'Sequential queue number issued to a patient at check-in, unique per doctor per day'],
      ['ETA', 'Estimated waiting time until the patient is called'],
      ['STAT', 'Urgent laboratory priority (processed before ROUTINE orders)'],
      ['Charge', 'A billable event (consultation fee, lab test, medicine, bed-day) waiting to be invoiced'],
      ['Billing clearance', 'Condition that all charges of an admission are invoiced and fully paid'],
      ['JWT', 'JSON Web Token – signed session token used to authenticate API calls'],
      ['SPA / REST', 'Single-Page Application / Representational State Transfer (HTTP + JSON API)'],
      ['FR / NFR / BR / UR', 'Functional / Non-functional requirement, Business rule, User requirement'],
    ]),
    TableCaption('Definitions and acronyms'),
    H3('1.5 References'),
    Bullets([
      'IEEE Std 830-1998, _Recommended Practice for Software Requirements Specifications_; ISO/IEC/IEEE 29148:2018, _Requirements engineering_.',
      'IEEE Std 1016-2009, _Software Design Descriptions_; IEEE Std 829-2008 / ISO/IEC/IEEE 29119-3, _Software test documentation_.',
      'OMG Unified Modeling Language (UML) 2.5.1 specification.',
      'Assignment brief: “Software Development project problems – 1. Hospital Management System”, Software Engineering course, 2026.',
    ]),
    H3('1.6 Document overview'),
    P('Section 2 states the problem, Section 3 the objectives and Section 4 the scope. Sections 5 and 6 list functional and non-functional requirements, Section 7 the user requirements, Section 8 the detailed system requirements (features, interfaces and data), Section 9 the hardware and software requirements, and Section 10 the assumptions and constraints.'),

    H2('2. Problem Statement'),
    P('Many small and mid-sized hospitals still run their front desk, wards and billing on paper registers and disconnected spreadsheets. This causes recurring problems:'),
    Bullets([
      '**Duplicate and incomplete patient records** – the same patient is registered several times, so history, allergies and previous results are not available to the doctor.',
      '**Double-booked doctors and long, unpredictable waits** – appointments are written in diaries, walk-ins and booked patients compete, and nobody can tell a patient how long they will wait.',
      '**Lost or illegible clinical information** – prescriptions and lab orders on paper are misread, results arrive late and abnormal values are not highlighted.',
      '**Bed confusion** – the front desk does not know which beds are free, being cleaned or under maintenance; occasionally a bed is promised to two patients.',
      '**Revenue leakage** – consultation fees, tests, medicines and bed-days are recorded in different places, invoices are compiled by hand, and patients are sometimes discharged with unpaid bills.',
      '**No accountability** – it is impossible to tell who changed a record, cancelled an appointment or authorised a discharge.',
    ]),
    P('The hospital therefore needs a single, secure system that manages **patients, doctors, appointments, prescriptions, billing and medical records** (as required by the assignment) as one continuous workflow, with the right information available to the right staff member at the right time.'),

    H2('3. Objectives'),
    DataTable([{ header: 'ID', width: 800 }, { header: 'Objective', width: 5600 }, { header: 'Measure of success', width: PORTRAIT_W - 6400 }], [
      ['O1', 'Maintain one permanent electronic record per patient with complete visit, clinical, laboratory, admission and billing history.', 'Unique patient ID; duplicate warning (FR-07 – FR-12).'],
      ['O2', 'Eliminate double-booking and make waiting times predictable.', 'Zero overlapping bookings; token + ETA for every checked-in patient (FR-15 – FR-25).'],
      ['O3', 'Digitise consultations, prescriptions and lab orders and flag abnormal results automatically.', 'Diagnosis mandatory; abnormal flag on out-of-range results (FR-26 – FR-34).'],
      ['O4', 'Control medicine stock and prevent dispensing of expired or unavailable drugs.', 'Dispensing blocked when short/expired; alerts for low/expiring stock (FR-35 – FR-37).'],
      ['O5', 'Give real-time bed visibility and a safe admission → transfer → discharge workflow.', 'No bed double-allocation; discharge only after billing clearance (FR-38 – FR-43).'],
      ['O6', 'Capture every billable event automatically and produce accurate invoices and receipts.', 'Invoices built from charges; overpayment refused (FR-44 – FR-47).'],
      ['O7', 'Protect patient data and make every action traceable.', 'RBAC on every API; lock-out; append-only audit log (FR-01 – FR-06, FR-50).'],
      ['O8', 'Provide managers with live KPIs and period reports.', 'Role dashboards and admin reports (FR-48, FR-49).'],
    ], { boldFirst: true }),
    TableCaption('Project objectives'),

    H2('4. Scope of the System'),
    H3('4.1 In scope'),
    Bullets([
      '**Patient management** – registration with unique ID, validation, duplicate detection, search, update and full history.',
      '**Doctor and department management** – profiles, fees, working days/hours, slot length and average consultation time.',
      '**Appointments** – free-slot calculation, booking, rescheduling, cancellation and no-show handling.',
      '**Smart queue** – check-in tokens, live queue board, waiting-time estimates, urgent prioritisation.',
      '**Consultation and medical records** – vitals, symptoms, diagnosis, notes, follow-up, e-prescriptions, lab orders.',
      '**Laboratory** – worklist, sample collection, result entry and automatic abnormal flagging.',
      '**Pharmacy** – inventory with batch/expiry, restocking, low-stock and expiry alerts, dispensing.',
      '**In-patient management** – wards and beds, bed board, admission, transfer, discharge request and discharge with billing clearance.',
      '**Billing** – automatic charges, invoices, discounts, part payments (cash, card, UPI), receipts and printing.',
      '**Administration** – users and roles, dashboards, management reports and audit trail.',
    ]),
    H3('4.2 Out of scope (this release)'),
    Bullets([
      'Patient self-service portal and online appointment booking by patients.',
      'Online payment gateway and insurance / TPA claim processing (payments are recorded, not processed).',
      'Integration with laboratory analysers, PACS / radiology imaging and external pharmacies.',
      'SMS / e-mail notifications, staff rostering and payroll, operation-theatre scheduling, inventory purchasing.',
      'AI-based features (e.g. clinical note summarisation) – excluded for privacy and reliability reasons.',
    ]),
    H3('4.3 User classes'),
    DataTable([{ header: 'Actor', width: 2200 }, { header: 'Description and main responsibilities', width: PORTRAIT_W - 2200 }], spec.actors.map((a) => [a.name, a.description]), { boldFirst: true }),
    TableCaption('User classes (actors)'),
    P('Patients are **external** to the system: they do not log in; their data is entered and used by staff.'),
    ...Figure(uml('01a-use-case-overview.png'), 'System context – actors and major functions', { maxH: 520 }),

    H2('5. Functional Requirements'),
    P(`The system shall satisfy the ${spec.functional.length} functional requirements below, grouped into ${spec.modules.length} modules. Priority follows MoSCoW-style ranking: **High** = must have for the first release, **Medium** = should have, **Low** = could have. All requirements were implemented in the prototype.`),
    H3('5.1 Business rules'),
    DataTable([{ header: 'ID', width: 900 }, { header: 'Business rule', width: PORTRAIT_W - 900 }], spec.businessRules.map((b) => [b.id, b.text]), { boldFirst: true }),
    TableCaption('Business rules referenced by the functional requirements'),
    ...frTables,

    H2('6. Non-functional Requirements'),
    DataTable([{ header: 'ID', width: 900 }, { header: 'Category', width: 1900 }, { header: 'Requirement', width: PORTRAIT_W - 2800 }], spec.nonFunctional.map((n) => [n.id, n.category, n.text]), { boldFirst: true }),
    TableCaption('Non-functional requirements'),
    P('NFR-01 to NFR-08 are verified by automated tests (see Part D); NFR-09 and NFR-10 are design targets for a production deployment and are addressed by the architecture (Part B) rather than measured on the prototype.'),

    H2('7. User Requirements'),
    P('User requirements describe, in the language of each user class, what they need to achieve. They are written as user stories with acceptance criteria and are refined into the functional requirements listed in the last column. The acceptance tests (AT-01 … AT-05) in Part D validate them end-to-end.'),
    DataTable([
      { header: 'ID', width: 760 }, { header: 'As a …', width: 1250 }, { header: 'I want to …', width: 2350 }, { header: 'So that …', width: 1700 }, { header: 'Acceptance criteria', width: 2578 }, { header: 'FRs', width: 1000 },
    ], USER_REQUIREMENTS, { boldFirst: true, size: 17 }),
    TableCaption('User requirements (user stories)'),

    H2('8. System Requirements'),
    P('System requirements refine the user requirements into precise behaviour of the software system, its interfaces and its data.'),
    H3('8.1 System features (stimulus → response)'),
    DataTable([{ header: 'Feature', width: 1900 }, { header: 'Stimulus / input', width: 3000 }, { header: 'System response / output', width: PORTRAIT_W - 4900 }], [
      ['Authentication', 'Username + password; Bearer token on every API call', 'Issues an 8-hour JWT bound to a server-side session; increments failed attempts and locks after 5; rejects revoked/expired tokens with HTTP 401 and unauthorised roles with HTTP 403.'],
      ['Patient registration', 'Demographics, contact, blood group, allergies', 'Validates fields; searches existing records with the same DOB for phone/name matches; returns HTTP 409 POSSIBLE_DUPLICATE unless confirmed; assigns the next ID P#####.'],
      ['Slot calculation', 'Doctor + date', 'Generates slots from work start to end at slot length on working days; marks slots BOOKED (overlap with an active appointment) or PAST (before current time).'],
      ['Appointment booking', 'Patient, doctor, date, start time, reason', 'Validates working day/hours, slot alignment and future time; rejects doctor or patient overlap (HTTP 409); stores SCHEDULED appointment in a transaction.'],
      ['Check-in & queue', 'Today\'s SCHEDULED appointment', 'Assigns token = max(token)+1 for doctor/day; sets CHECKED_IN; queue ordered URGENT → check-in time; ETA = ahead × average + remaining time of current consultation.'],
      ['Consultation', 'Vitals, symptoms, diagnosis, notes, prescription items, lab tests', 'Validates vitals ranges and BP format; stores prescription (PENDING) and lab orders (ORDERED) with charges; on completion requires diagnosis, closes appointment and adds the consultation fee charge.'],
      ['Laboratory', 'Sample collected; result value / findings', 'Enforces ORDERED → SAMPLE_COLLECTED → COMPLETED; computes ABNORMAL when the value lies outside [ref_low, ref_high]; cancelling removes the unbilled charge.'],
      ['Pharmacy', 'Restock (qty, batch, expiry); dispense request', 'Refuses expired batches; checks every item for stock and expiry inside one transaction; decrements stock and creates medicine charges; produces low-stock / near-expiry / expired alerts.'],
      ['Beds & admissions', 'Patient, attending doctor, bed; transfer bed; discharge', 'Allows only valid bed transitions; one active admission per patient and one patient per bed (enforced by unique indexes); bed-day charges = max(1, ⌈hours/24⌉) shared across stays; discharge only when clearance holds or an administrator overrides with a reason.'],
      ['Billing', 'Patient (+ admission); discount %; payment amount, method, reference', 'Builds an invoice from unbilled charges with number INV-YYYYMMDD-NNNN; discount 0–50% only while UNPAID; payment 0 < amount ≤ balance; reference required for CARD/UPI; receipt R-YYYYMMDD-NNNN.'],
      ['Reporting', 'Date range', 'Aggregates appointments by day/status, revenue by day/method/source, occupancy by ward, top diagnoses and doctor performance.'],
      ['Audit', 'Any create / update / state change', 'Appends user, role, action, entity, id, timestamp and summary; credentials are scrubbed; UPDATE/DELETE on the log are blocked by database triggers.'],
    ], { boldFirst: true, size: 17 }),
    TableCaption('System features'),
    H3('8.2 External interface requirements'),
    P('**User interface.** A responsive single-page web application (minimum width 360 px) with a sidebar showing only the modules permitted for the logged-in role, colour-coded status badges, modal dialogs for actions, field-level validation messages, toast notifications and print-optimised invoice and receipt layouts.'),
    P('**Software interface (REST API).** All functions are exposed as JSON over HTTP under `/api`. Every route except login and health requires a Bearer token; each is protected by the permission shown below (generated from the source code).'),
    DataTable([{ header: 'Method', width: 900 }, { header: 'Endpoint', width: 4400 }, { header: 'Required permission', width: PORTRAIT_W - 5300 }], endpoints.map((e) => [e.method, `\`${e.path}\``, e.perms]), { size: 16 }),
    TableCaption(`REST API endpoints (${endpoints.length})`),
    P('**Hardware interfaces.** Standard keyboard/mouse or touch screen; any printer supported by the browser for invoices and receipts. **Communication interfaces.** HTTP(S) on a hospital LAN; TLS termination by a reverse proxy in production.'),
    H3('8.3 Data requirements'),
    Bullets([
      'Persistent data is stored in a relational database (SQLite file) with 20 tables: users, sessions, departments, doctors, patients, appointments, consultations, prescriptions, prescription items, medicines, lab tests, lab orders, wards, beds, bed stays, admissions, charges, invoices, payments and audit logs.',
      'Integrity rules are enforced in the schema: foreign keys, CHECK constraints on every status column, a unique token per doctor per day, at most one active admission per patient and one admission per bed (partial unique indexes), and append-only triggers on the audit log.',
      'Money is stored in rupees with two decimals and calculated in paise to avoid rounding drift; dates are ISO-8601; appointment dates/times are local (IST).',
      'Medical and billing records are never deleted; cancellations change status and are audited.',
    ]),

    H2('9. Hardware and Software Requirements'),
    H3('9.1 Hardware requirements'),
    DataTable([{ header: 'Component', width: 2000 }, { header: 'Minimum', width: 3600 }, { header: 'Recommended', width: PORTRAIT_W - 5600 }], [
      ['Application server', 'Dual-core 2 GHz CPU, 4 GB RAM, 2 GB free disk', 'Quad-core CPU, 8 GB RAM, SSD with 20 GB free, UPS'],
      ['Client workstation', 'Any PC, laptop or tablet able to run a current browser; 1366 × 768 display', '1920 × 1080 display at reception and nursing stations; tablet for doctors'],
      ['Network', '100 Mbit/s LAN or Wi-Fi', 'Gigabit LAN; separate VLAN for clinical systems'],
      ['Peripherals', 'Any printer for invoices/receipts', 'Thermal receipt printer at billing; barcode scanner (future)'],
    ], { boldFirst: true }),
    TableCaption('Hardware requirements'),
    H3('9.2 Software requirements'),
    DataTable([{ header: 'Layer', width: 2000 }, { header: 'Software (version used)', width: 4400 }, { header: 'Purpose', width: PORTRAIT_W - 6400 }], [
      ['Operating system', 'Windows 10/11, macOS 12+, Ubuntu 22.04+', 'Server and development machines'],
      ['Runtime', `Node.js 20 or later (tested on ${process.version}), npm 10`, 'Runs the API server and build tools'],
      ['Web server / API', `Express ${ver('express')}, jsonwebtoken ${ver('jsonwebtoken')}, bcryptjs ${ver('bcryptjs')}, zod ${ver('zod')}`, 'REST API, authentication, password hashing, input validation'],
      ['Database', `SQLite 3 via better-sqlite3 ${ver('better-sqlite3')}`, 'Embedded relational database (single file, WAL mode)'],
      ['Front end', `React ${ver('react')}, React Router ${ver('react-router-dom')}, Tailwind CSS ${ver('tailwindcss')}, Recharts ${ver('recharts')}, Vite ${ver('vite')}`, 'Single-page user interface and build'],
      ['Browser', 'Chrome / Edge 120+, Firefox 120+, Safari 16+', 'Client access'],
      ['Testing', `Vitest ${ver('vitest')}, Supertest ${ver('supertest')}, Playwright ${ver('@playwright/test')}`, 'Unit, integration, system and acceptance tests'],
      ['Design & documentation', 'PlantUML, docx (document generator), LibreOffice', 'UML diagrams and this report'],
      ['Version control', 'Git, GitHub', 'Source control and collaboration'],
    ], { boldFirst: true }),
    TableCaption('Software requirements'),

    H2('10. Assumptions and Constraints'),
    H3('10.1 Assumptions'),
    Bullets([
      'The system serves a single hospital site; all staff have individual accounts created by the administrator.',
      'Patients do not access the system directly; the receptionist registers them and books appointments.',
      'Doctors work a fixed weekly schedule (days and hours) with a constant slot length; leave management is out of scope.',
      'One consultation is recorded per appointment; in-patient lab tests are ordered against the admission.',
      'Consultation and in-patient services are treated as tax-exempt, so no GST is computed; all amounts are in Indian rupees (₹).',
      'Payments are taken at the hospital counter (cash, card or UPI) and only recorded in MediFlow; no money is processed online.',
      'The server clock is correct and set to the hospital time zone (IST).',
      'All demonstration data (patients, doctors, bills) is synthetic; no real patient data is used.',
    ]),
    H3('10.2 Constraints'),
    Bullets([
      '**Schedule:** the project had to be specified, designed, implemented and tested by a group of five students before 31 October 2026.',
      '**Technology:** only free and open-source software is used; the system must run on a standard student laptop without a separate database server.',
      '**Platform:** browser-based only; no native mobile app.',
      '**Regulatory:** patient data is sensitive; access must follow least privilege, passwords must be hashed and every change must be auditable. Full compliance with the Digital Personal Data Protection Act 2023 and NABH accreditation standards would require further work (consent management, data retention policy, backups) beyond this prototype.',
      '**Scalability:** SQLite supports one application server; a multi-branch deployment would move to a client–server DBMS (e.g. PostgreSQL) without changing the service layer.',
    ]),
    H3('10.3 Dependencies'),
    Bullets([
      'Availability of npm packages listed in Section 9.2 at build time.',
      'A modern browser with JavaScript enabled on every client.',
    ]),
  ];
}
