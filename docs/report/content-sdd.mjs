import { H1, H2, H3, PartH1, P, Bullets, DataTable, TableCaption, Callout, Figure, Landscape, PORTRAIT_W } from './lib.mjs';
import { spec, rbac, ROOT, loc, LIVE_URL, LIVE_HOST } from './data.mjs';
import path from 'node:path';
import fs from 'node:fs';

const uml = (f) => path.join(ROOT, 'docs/uml/png', f);
const shotPath = (f) => path.join(ROOT, 'docs/screenshots', `${f}.png`);
const shot = (f, caption, opts) => (fs.existsSync(shotPath(f)) ? Figure(shotPath(f), caption, opts) : [P(`[Screenshot ${f} not available]`)]);

const MODULES = [
  ['Authentication & Access Control', 'Login/logout, JWT sessions, account lock-out, role permissions, route guards', 'Login, Layout (role menu)', 'AuthService, auth middleware, authRules, permissions', 'users, sessions', 'FR-01 – FR-04'],
  ['User Administration', 'Create users, (de)activate, reset passwords, role-permission matrix view', 'Users & Roles', 'UserService', 'users', 'FR-05, FR-06'],
  ['Patient Management', 'Registration with unique ID, validation, duplicate detection, search, edit, history', 'Patients, Patient detail', 'PatientService, patientRules', 'patients', 'FR-07 – FR-12'],
  ['Doctor & Department', 'Doctor profiles, schedules, fees, departments, free-slot calculation', 'Doctors', 'DoctorService, appointmentRules', 'doctors, departments', 'FR-13 – FR-15'],
  ['Appointments', 'Book, reschedule, cancel, no-show, filters; 4-step booking wizard', 'Appointments', 'AppointmentService, appointmentRules', 'appointments', 'FR-15 – FR-20'],
  ['Smart Queue', 'Check-in tokens, queue board, ETA, urgent priority, call next', 'Queue Board', 'QueueService, queueRules', 'appointments, consultations', 'FR-21 – FR-25'],
  ['Consultation & Records', 'Vitals, diagnosis, notes, follow-up, prescription builder, lab ordering, history', 'Consultation', 'ConsultationService, ChargeService', 'consultations, prescriptions, prescription_items', 'FR-26 – FR-30'],
  ['Laboratory', 'Worklist, sample collection, result entry, abnormal flag, cancellation', 'Laboratory', 'LabService, labRules', 'lab_tests, lab_orders', 'FR-31 – FR-34'],
  ['Pharmacy & Inventory', 'Medicine master, restock, alerts, dispensing', 'Pharmacy', 'PharmacyService, inventoryRules', 'medicines, prescriptions', 'FR-35 – FR-37'],
  ['Admission, Bed & Discharge', 'Bed board, admit, transfer, bed status, discharge request, clearance, override', 'Beds & Admissions, Admission detail', 'BedService, AdmissionService, bedStateMachine, admissionRules', 'wards, beds, admissions, bed_stays', 'FR-38 – FR-43'],
  ['Billing & Payments', 'Pending charges, invoices, discounts, payments, receipts, printing', 'Billing, Invoice detail, Print views', 'BillingService, ChargeService, billingRules', 'charges, invoices, payments', 'FR-44 – FR-47'],
  ['Dashboard & Reports', 'Role-aware KPIs, 7-day trends, management reports, CSV export', 'Dashboard, Reports', 'ReportService', '(read-only aggregates)', 'FR-48, FR-49'],
  ['Audit Trail', 'Append-only log of every state change; search & filter', 'Audit Trail', 'AuditService', 'audit_logs (+ triggers)', 'FR-50'],
];

const USE_CASES = [
  {
    id: 'UC-01', name: 'Book appointment', actor: 'Receptionist', fr: 'FR-15 – FR-17',
    pre: 'Receptionist is logged in; patient is registered; doctor works on the chosen date.',
    main: ['Receptionist opens Appointments → Book appointment.', 'Selects the patient (search by name / ID / phone).', 'Chooses department and doctor; the system shows fee, room and hours.', 'Chooses a date; the system displays all slots marked free, booked or past.', 'Selects a free slot, enters the reason and confirms.', 'System validates the slot, checks doctor and patient overlaps, saves the appointment as SCHEDULED and writes an audit entry.'],
    alt: ['5a. Slot was taken meanwhile → HTTP 409 DOCTOR_SLOT_TAKEN; the wizard refreshes the slots.', '5b. Patient already has an overlapping appointment → HTTP 409 PATIENT_DOUBLE_BOOKED.', '4a. Date is a non-working day → no slots are offered.'],
    post: 'Appointment exists in SCHEDULED state and blocks the slot.',
  },
  {
    id: 'UC-02', name: 'Check in patient and manage queue', actor: 'Receptionist (primary), Doctor', fr: 'FR-21 – FR-25',
    pre: 'Appointment is SCHEDULED for today.',
    main: ['Receptionist clicks Check in for the appointment.', 'System assigns the next token for the doctor and sets CHECKED_IN.', 'Queue board shows the patient with position and ETA.', 'Doctor clicks Call next patient.', 'System picks the first patient (URGENT first, then by check-in time), sets IN_CONSULTATION and opens a consultation record.'],
    alt: ['2a. Appointment is not for today → HTTP 400.', '3a. Patient deteriorates → receptionist/doctor marks URGENT with a mandatory reason (audited); patient moves to the front.', '4a. Doctor already has a consultation in progress → HTTP 409.'],
    post: 'Patient is in consultation; others\' ETA is recalculated.',
  },
  {
    id: 'UC-03', name: 'Conduct consultation', actor: 'Doctor', fr: 'FR-26 – FR-29',
    pre: 'A consultation is IN_PROGRESS for the doctor.',
    main: ['Doctor records vitals, symptoms, diagnosis, notes and follow-up date and saves.', 'Adds medicines (dosage, frequency, duration; quantity auto-calculated) and saves the prescription.', 'Orders lab tests (ROUTINE or STAT); charges are created.', 'Clicks Complete consultation.', 'System checks the diagnosis, sets the consultation and appointment COMPLETED and adds the consultation-fee charge.'],
    alt: ['1a. Invalid vitals (e.g. BP “120-80”) → field error.', '2a. Quantity ≤ 0 → validation error.', '4a. Diagnosis missing → HTTP 400; consultation stays open.'],
    post: 'Visit completed; prescription PENDING at pharmacy; lab orders ORDERED; charges waiting for billing.',
  },
  {
    id: 'UC-04', name: 'Discharge patient', actor: 'Doctor, Receptionist, Billing Staff, Administrator', fr: 'FR-42, FR-43',
    pre: 'Patient is ADMITTED.',
    main: ['Doctor requests discharge with a summary (≥ 10 characters).', 'System closes the bed stay, calculates bed-days and adds bed charges; status DISCHARGE_PENDING.', 'Billing generates the admission invoice and records payment(s) until PAID.', 'Receptionist completes the discharge.', 'System verifies clearance, sets DISCHARGED and moves the bed to CLEANING.'],
    alt: ['4a. Charges not invoiced or balance outstanding → HTTP 409 BILLING_NOT_CLEARED.', '4b. Emergency transfer: Administrator overrides with a reason; discharge proceeds and a DISCHARGE_OVERRIDE audit entry records the outstanding amount.'],
    post: 'Admission closed; bed in CLEANING until housekeeping marks it AVAILABLE.',
  },
  {
    id: 'UC-05', name: 'Record payment', actor: 'Billing Staff', fr: 'FR-44 – FR-47',
    pre: 'Invoice exists and is UNPAID or PARTIALLY_PAID.',
    main: ['Billing staff opens the invoice and clicks Record payment.', 'Enters amount (defaults to balance), method and reference (for card/UPI).', 'System validates 0 < amount ≤ balance, stores the payment with a receipt number and updates the status.', 'Receipt is printed.'],
    alt: ['3a. Amount exceeds balance → HTTP 400 with the outstanding balance.', '3b. Card/UPI without reference → HTTP 400.', '3c. Invoice already PAID or CANCELLED → HTTP 400.'],
    post: 'Invoice PARTIALLY_PAID or PAID; receipt available for printing.',
  },
];

function useCaseTable(u) {
  const w = [2000, PORTRAIT_W - 2000];
  return [
    DataTable([{ header: `${u.id}`, width: w[0] }, { header: u.name, width: w[1] }], [
      ['Primary actor(s)', u.actor],
      ['Requirements', u.fr],
      ['Pre-condition', u.pre],
      ['Main success scenario', u.main.map((s, i) => `${i + 1}. ${s}`)],
      ['Alternative flows', u.alt],
      ['Post-condition', u.post],
    ], { boldFirst: true, zebra: false, cantSplit: false }),
    TableCaption(`Use case specification ${u.id} – ${u.name}`),
  ];
}

function rbacMatrix() {
  const { PERMISSIONS, ROLES } = rbac;
  const short = { ADMIN: 'Admin', RECEPTIONIST: 'Recep.', DOCTOR: 'Doctor', LAB_TECH: 'Lab', PHARMACIST: 'Pharm.', BILLING: 'Billing' };
  const cols = [{ header: 'Permission', width: 3238 }, ...ROLES.map((r) => ({ header: short[r], width: 1066 }))];
  cols[cols.length - 1].width += PORTRAIT_W - cols.reduce((s, c) => s + c.width, 0);
  const rows = Object.entries(PERMISSIONS).map(([p, roles]) => [`\`${p}\``, ...ROLES.map((r) => (roles.includes(r) ? '✔' : '–'))]);
  return [DataTable(cols, rows, { size: 16 }), TableCaption('Role–permission matrix (generated from server/domain/permissions.js)')];
}

export function sdd() {
  return [
    PartH1('B', 'SOFTWARE DESIGN DOCUMENT (SDD)'),
    Callout('The design follows the IEEE Std 1016-2009 viewpoints, namely context and composition (architecture, modules), logical (class diagrams), interaction (sequence diagrams), state dynamics (state diagrams), information (data model) and interface (UI and API). All diagrams are UML 2.5 and were produced with PlantUML from the source files in docs/uml/.'),

    H2('1. System Architecture'),
    P('MediFlow uses a **three-tier, layered client–server architecture**. The presentation tier is a React single-page application running in the browser; the application tier is a Node.js/Express server exposing a REST API; the data tier is an embedded SQLite database. Inside the server, responsibilities are separated into four layers, and each layer may only call the layer below it.'),
    ...Figure(uml('11-architecture.png'), 'Layered system architecture', { maxH: 560 }),
    DataTable([{ header: 'Layer', width: 2200 }, { header: 'Responsibility', width: 4400 }, { header: 'Implementation', width: PORTRAIT_W - 6600 }], [
      ['Presentation', 'Screens, navigation by role, forms with client-side validation, charts, printing', `client/src – ${fs.readdirSync(path.join(ROOT, 'client/src/pages')).length} page components, shared UI kit, AuthContext, ApiClient`],
      ['API / controller', 'HTTP routing, JSON parsing, authentication, authorisation, error mapping to status codes', 'server/routes/index.js, server/middleware/auth.js, server/app.js'],
      ['Service', 'Use-case logic and transactions; orchestrates rules, data access and audit', 'server/services/*.js (15 services)'],
      ['Domain rules', 'Pure, side-effect-free business rules: slots, conflicts, queue ETA, state machines, billing, inventory, permissions', 'server/domain/*.js (unit-tested in isolation)'],
      ['Data access', 'Connection, schema, prepared statements, transactions, constraints and triggers', 'server/db/connection.js, schema.sql, seed.js'],
    ], { boldFirst: true }),
    TableCaption('Architectural layers'),
    H3('1.1 Design decisions and rationale'),
    DataTable([{ header: 'Decision', width: 3000 }, { header: 'Rationale', width: PORTRAIT_W - 3000 }], [
      ['Web SPA + REST API', 'Works on any device with a browser, no installation at workstations; the API can later serve a mobile app or integrations.'],
      ['Business rules as pure functions', 'Rules such as slot validation, ETA and bed-day allocation are deterministic and testable without a database (NFR-06); a frozen clock makes time-based rules reproducible.'],
      ['SQLite with WAL and transactions', 'Zero-administration database suitable for one hospital server and for marking/demonstration; ACID transactions guarantee multi-step operations (NFR-04).'],
      ['Constraints in the schema as well as in code', 'Defence in depth: unique partial indexes stop double bed allocation and double active admissions even under concurrent requests.'],
      ['JWT + server-side sessions', 'Stateless verification with the ability to revoke on logout or deactivation (FR-04, FR-06).'],
      ['Charges as an intermediate ledger', 'Clinical modules only record billable events; billing turns them into invoices. This decouples modules and prevents missed charges.'],
      ['Append-only audit log', 'Accountability required by O7; enforced by database triggers so even direct SQL cannot alter history.'],
    ], { boldFirst: true }),
    TableCaption('Key design decisions'),
    H3('1.2 Deployment view'),
    ...Figure(uml('12-deployment.png'), 'Deployment diagram', { maxH: 380 }),
    P(`The public demonstration uses the same single-server design. One Node.js web service on Render's cloud serves both the built React app and the REST API with an embedded SQLite database, at [${LIVE_HOST}](${LIVE_URL}). Render builds it from the GitHub repository (\`render.yaml\`) and redeploys on every push; HTTPS is terminated by Render's proxy, matching the reverse-proxy setup recommended for production.`),
    P(`The prototype consists of about ${loc.server.n.toLocaleString('en-IN')} lines of server code in ${loc.server.files} files, ${loc.client.n.toLocaleString('en-IN')} lines of client code in ${loc.client.files} files and ${loc.tests.n.toLocaleString('en-IN')} lines of automated tests.`),

    H2('2. Module / Component Description'),
    P('The system is decomposed into thirteen functional modules. Each module owns its screens, service, rules and tables, and communicates with other modules only through service calls and shared identifiers (patient, appointment, admission, charge).'),
    DataTable([
      { header: 'Module', width: 1500 }, { header: 'Responsibility', width: 2600 }, { header: 'UI pages', width: 1400 }, { header: 'Services / rules', width: 1838 }, { header: 'Tables', width: 1300 }, { header: 'FRs', width: 1000 },
    ], MODULES, { boldFirst: true, size: 16 }),
    TableCaption('Module / component description'),
    H3('2.1 Cross-cutting components'),
    Bullets([
      '**Authentication middleware** verifies the JWT, checks that the session is not revoked or expired and that the account is active, and attaches the user (with role and doctor id) to the request.',
      '**Authorisation** – `authorize(permission…)` checks the role-permission matrix (Section 8). The UI hides menus the role cannot use, but the server is the authority.',
      '**Validation** – zod schemas and domain validators return HTTP 400 with field-level messages that the UI shows next to the inputs.',
      '**Error handling** – a central handler maps errors to consistent JSON: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 business-rule conflict, 423 account locked, 500 unexpected.',
      '**ChargeService** – a shared ledger used by Consultation, Laboratory, Pharmacy and Admission modules to create billable events.',
      '**AuditService** – called by every service after a successful state change; scrubs credential-like fields.',
      '**Clock** – a single time source that tests can freeze.',
    ]),

    H2('3. Database Design (optional)'),
    P('Database design is not required by the assignment; it is included briefly because the class diagram maps directly to the relational schema. The data model has 20 tables in third normal form; status columns are constrained by CHECK clauses that mirror the state diagrams in Section 7.'),
    ...Figure(uml('14-er-diagram.png'), 'Logical data model (crow\'s-foot notation)', { maxH: 820 }),

    H2('4. Class Diagram'),
    P('The **domain class diagram** (Figure below) shows the main entities, their attributes, operations and associations with multiplicities. A patient books many appointments; each appointment has at most one consultation, which may produce one prescription (composed of items referencing medicines) and several lab orders. Wards are composed of beds; an admission is composed of one or more bed stays (one per bed occupied), which is how transfers and bed-day billing are modelled. Charges aggregate into invoices, which own payments.'),
    ...Figure(uml('02-class-domain.png'), 'Domain class diagram', { maxH: 850 }),
    P('The **design class diagram** shows how the implementation realises the domain. Controllers delegate to services, services use pure rule modules and the data-access layer, and cross-cutting services (Charge, Audit) are shared.'),
    Landscape(...Figure(uml('03-class-design.png'), 'Design class diagram – service layer and dependencies', { maxW: 960, maxH: 590 })),

    H2('5. Use Case Diagram'),
    P('Because a single diagram with six actors and forty use cases is unreadable, the use-case model is split into four diagrams. These are an overview (SRS, Section 4.3), outpatient care, inpatient care & billing, and administration & access control. «include» marks behaviour that always happens as part of the base use case, while «extend» marks optional behaviour.'),
    ...Figure(uml('01b-use-case-outpatient.png'), 'Use case diagram – outpatient care', { maxH: 850 }),
    ...Figure(uml('01c-use-case-inpatient-billing.png'), 'Use case diagram – inpatient care and billing', { maxH: 560 }),
    ...Figure(uml('01d-use-case-admin.png'), 'Use case diagram – administration and access control', { maxH: 520 }),
    H3('5.1 Use case specifications'),
    ...USE_CASES.flatMap(useCaseTable),

    H2('6. Sequence Diagrams'),
    P('The sequence diagrams show the interaction between actors, the React UI, the API layer, services, rule modules and the database for the four most important scenarios. Messages are numbered; alt/opt fragments show the error and override paths that are also covered by test cases.'),
    Landscape(...Figure(uml('04-seq-booking.png'), 'Sequence diagram – book an appointment', { maxW: 960, maxH: 590 })),
    ...Figure(uml('05-seq-queue-consultation.png'), 'Sequence diagram – check-in, queue and consultation', { maxH: 850 }),
    ...Figure(uml('06-seq-admission-discharge.png'), 'Sequence diagram – admission and discharge with billing clearance', { maxH: 850 }),
    ...Figure(uml('07-seq-login.png'), 'Sequence diagram – login, lock-out and role-based access', { maxH: 520 }),

    H2('7. State Diagrams'),
    P('State diagrams are applicable to every entity with a life cycle. Transitions not shown are rejected by the system (HTTP 409) – the same transition tables are implemented in `server/domain/*` and verified by unit tests UT-APT-10, UT-IPD-01/02/04, UT-LAB-01 and UT-BIL-06.'),
    ...Figure(uml('08-state-appointment.png'), 'State diagram – Appointment', { maxH: 480 }),
    ...Figure(uml('09-state-bed.png'), 'State diagram – Bed', { maxH: 340 }),
    ...Figure(uml('10-state-admission-invoice-lab.png'), 'State diagrams – Admission, Invoice and Lab order', { maxH: 700 }),
    H3('7.1 Activity view of the outpatient journey'),
    P('The activity diagram complements the state diagrams by showing how the responsibility for one patient visit passes between roles (swimlanes).'),
    ...Figure(uml('13-activity-opd.png'), 'Activity diagram – outpatient journey across roles', { maxH: 700 }),

    H2('8. Security Design'),
    Bullets([
      '**Authentication:** bcrypt password hashes (cost 10); JWT signed with HS256 valid 8 h, bound to a server-side session that is revoked on logout or deactivation; 5 failed attempts lock the account for 15 minutes; generic error messages avoid username enumeration.',
      '**Authorisation:** least-privilege role-permission matrix enforced on every API route; doctors may act only on their own queue and consultations; clinical notes are hidden from non-clinical roles.',
      '**Input handling:** schema validation on every write; parameterised SQL only (no string concatenation); JSON body limit 1 MB; security headers (nosniff, frame-deny, no-referrer).',
      '**Integrity and accountability:** transactions for multi-step updates; unique and check constraints; append-only audit log with triggers.',
    ]),
    ...rbacMatrix(),

    H2('9. User Interface Design'),
    P('The interface uses a consistent layout: a role-filtered sidebar, a top bar with global patient search and the user\'s role, page headers with primary actions, cards, tables and colour-coded status badges (green = available/paid/completed, amber = waiting/pending, red = occupied/unpaid/urgent). Forms validate on the client and show server messages next to the relevant field. The screenshots below were captured automatically by the system tests on the running application.'),
    ...shot('login', 'Login screen with demo accounts', { maxH: 380 }),
    ...shot('dashboard-admin', 'Administrator dashboard – KPIs, 7-day trends, ward occupancy, pharmacy alerts', { maxH: 380 }),
    ...shot('booking-wizard', 'Appointment booking wizard with free / booked / past slots', { maxH: 380 }),
    ...shot('queue-board', 'Queue board – now serving, waiting list with tokens, urgent flag and ETA', { maxH: 380 }),
    ...shot('consultation', 'Doctor consultation workspace – vitals, diagnosis, prescription and lab orders', { maxH: 520 }),
    ...shot('lab-result', 'Laboratory result entry with automatic abnormal flag', { maxH: 380 }),
    ...shot('pharmacy', 'Pharmacy – prescriptions with stock check (undispensable item blocked)', { maxH: 380 }),
    ...shot('beds', 'Live bed board colour-coded by status', { maxH: 380 }),
    ...shot('invoice', 'Invoice with line items, discount, payments and balance', { maxH: 380 }),
    ...shot('receipt-print', 'Printable payment receipt', { maxH: 380 }),
    ...shot('reports', 'Management reports for a date range', { maxH: 380 }),
    ...shot('audit', 'Append-only audit trail', { maxH: 380 }),
    ...shot('mobile-dashboard', 'Responsive layout at 390 px (phone)', { maxH: 420, maxW: 260 }),
    P(`The module list in this part covers all ${spec.functional.length} functional requirements; the traceability matrix in the Software Test Report (Appendix A) traces each one to its module, screen and test cases.`),
  ];
}
