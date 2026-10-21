import { H1, H2, H3, P, Bullets, DataTable, TableCaption, Callout, PORTRAIT_W, LANDSCAPE_W, Small } from './lib.mjs';
import { spec, tests, counts, runLog, coverage, defects } from './data.mjs';
import { USER_REQUIREMENTS } from './content-srs.mjs';

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');
const fmtTs = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const lastRun = () => tests.reduce((m, t) => (t.ts > m ? t.ts : m), '');

const LEVEL_INFO = {
  Unit: { prefix: 'UT', tool: 'Vitest 3', what: 'Pure domain-rule functions in server/domain (slots, conflicts, queue ETA, state machines, billing, inventory, patient validation, lock-out, permissions)' },
  Integration: { prefix: 'IT', tool: 'Vitest + Supertest', what: 'REST API → middleware → services → SQLite (in-memory schema, frozen clock) for every module, NFR security/performance checks and robustness probes with invalid, boundary and malicious input (IT-EDGE-*)' },
  System: { prefix: 'ST', tool: 'Playwright (Chromium)', what: 'Complete application in a real browser: built SPA + API + fresh demo database, one test per module workflow, plus a crawl of every screen for all six roles at desktop and phone width (ST-UI-*)' },
  Acceptance: { prefix: 'AT', tool: 'Playwright (Chromium)', what: 'End-to-end business scenarios across several roles, validating the user requirements (UR-01 … UR-14)' },
};

/** Part C – Software Test Plan (portrait) */
export function testPlan() {
  const frCount = spec.functional.length;
  return [
    H1('PART C – SOFTWARE TEST PLAN', { pageBreak: true }),
    Callout('This plan follows the structure of IEEE 829 / ISO/IEC/IEEE 29119-3. Test cases are automated and carry the identifier of the requirement they verify, so the plan, the test report and the traceability matrix are generated from the same source.'),

    H2('1. Testing Objectives'),
    Bullets([
      `Verify that each of the ${frCount} functional requirements (FR-01 – FR-${String(frCount).padStart(2, '0')}) and the measurable non-functional requirements (NFR-01 – NFR-08) are correctly implemented.`,
      'Verify every business rule (BR-01 – BR-12), especially the boundary conditions: slot limits, 5th failed login, 50% discount, 30-day expiry window, payment equal to balance, minimum one bed-day.',
      'Verify that invalid input and invalid state transitions are rejected with clear messages and without corrupting data (negative testing).',
      'Verify role-based access control: every role can perform its tasks and is denied everything else.',
      'Validate, from the users\' point of view, the complete outpatient and inpatient journeys (acceptance).',
      'Find, record, fix and re-test defects, and provide objective evidence (actual results) for the evaluation of the system.',
    ]),

    H2('2. Testing Scope'),
    H3('2.1 In scope'),
    Bullets([
      'All thirteen modules listed in Part B, Section 2, through the REST API and through the user interface.',
      'Business rules and state machines (appointment, bed, admission, lab order, invoice).',
      'Security: authentication, lock-out, token tampering/expiry, logout revocation, RBAC, SQL-injection resistance, password storage, audit integrity.',
      'Performance of typical API requests on the demo dataset (NFR-01) and responsive layout at phone width (NFR-05).',
      'Data integrity of multi-step operations (transactions) and printing views (invoice, receipt).',
    ]),
    H3('2.2 Out of scope'),
    Bullets([
      'Load and soak testing at production scale (NFR-09, NFR-10) – requires production hardware.',
      'Automated cross-browser testing on Firefox and Safari (only Chromium is automated; other browsers are a release-candidate activity).',
      'Penetration testing by an independent party, accessibility audit (WCAG) and usability testing with real hospital staff.',
      'Third-party integrations, which are out of the product scope (payment gateway, lab analysers, SMS).',
    ]),

    H2('3. Testing Strategy'),
    P('Testing follows the **V-model**: each development artefact has a matching test level, and higher levels are executed only when the lower level passes. All tests are automated so that the whole suite can be re-run after every change (regression testing).'),
    DataTable([
      { header: 'Level', width: 1300 }, { header: 'Verifies', width: 1600 }, { header: 'Scope and approach', width: 3438 }, { header: 'Tool', width: 1500 }, { header: 'Cases', width: 800 }, { header: 'Exit criterion', width: 1000 },
    ], counts.summary.map((s) => [s.level, { Unit: 'Detailed design (rules)', Integration: 'Architecture & module interfaces', System: 'SRS (FR + NFR)', Acceptance: 'User requirements' }[s.level], LEVEL_INFO[s.level].what, LEVEL_INFO[s.level].tool, String(s.total), '100% pass']), { boldFirst: true, size: 17 }),
    TableCaption('Test levels (V-model)'),
    H3('3.1 Test design techniques'),
    DataTable([{ header: 'Technique', width: 2400 }, { header: 'Where it is applied (examples)', width: PORTRAIT_W - 2400 }], [
      ['Equivalence partitioning', 'Valid / invalid mobile numbers, genders, blood groups, payment methods (UT-PAT-02, UT-BIL-05).'],
      ['Boundary value analysis', 'Lab reference limits 69/70/100/145 (UT-LAB-02); reorder level 21/20/0 (UT-PHA-01); expiry at 30/31 days (UT-PHA-02); discount 50% vs 60% (UT-BIL-02, IT-BIL-02); payment equal to balance vs +₹0.01 (UT-BIL-04); 4th vs 5th failed login (UT-AUTH-01); 1 h, 24 h, 25 h, 48 h stays (UT-IPD-03).'],
      ['State-transition testing', 'Valid and invalid transitions of appointment, bed, admission, lab order and invoice (UT-APT-10, UT-IPD-01/02/04, UT-LAB-01, IT-LAB-02, IT-IPD-05).'],
      ['Decision tables', 'Discharge clearance: uninvoiced charges × outstanding balance × role × override reason (UT-IPD-07, IT-IPD-07/08/09).'],
      ['Use-case / scenario testing', 'Booking, queue, consultation, dispensing, admission-to-discharge, billing (ST-*, AT-*).'],
      ['Error guessing & security', 'Forged/expired tokens, SQL injection strings, double submission, malformed JSON (IT-AUTH-05, IT-NFR-01, IT-NFR-04, IT-PHA-05).'],
    ], { boldFirst: true }),
    TableCaption('Test design techniques'),
    H3('3.2 Test environment'),
    DataTable([{ header: 'Item', width: 2400 }, { header: 'Configuration', width: PORTRAIT_W - 2400 }], [
      ['Hardware', 'Linux x86-64 container, 2 vCPU, 7 GB RAM (comparable to a mid-range laptop)'],
      ['Software', `Node.js ${process.version}, SQLite 3, Chromium 141 (Playwright), Vitest 3.2, Supertest 7`],
      ['Unit / integration data', 'Fresh in-memory SQLite database per test file loaded with reference data (8 doctors, 12 lab tests, 26 medicines, 5 wards / 42 beds, 6 patients); clock frozen at Wed 21-Oct-2026 10:00 IST for deterministic results; bcrypt cost lowered to 4 for speed'],
      ['System / acceptance data', 'Fresh demo database generated at server start: 64 patients, ~600 appointments over 14 days, ~380 invoices, 20 active admissions; real wall-clock time'],
      ['Performance data', 'Demo database (IT-NFR-03) – 200 mixed API requests'],
    ], { boldFirst: true }),
    TableCaption('Test environment'),
    H3('3.3 Entry and exit criteria'),
    Bullets([
      '**Entry:** requirements baselined with IDs; code builds without errors; database schema creates successfully; test data generator runs.',
      '**Exit:** 100% of planned test cases executed; all test cases pass; no open defect of severity Critical or High; every FR covered by at least one passing test; domain-rule line coverage ≥ 80%.',
      '**Suspension:** the build fails or more than 20% of a suite fails because of an environment problem. **Resumption:** the cause is fixed and the full suite is re-run.',
    ]),
    H3('3.4 Defect management'),
    P('Every failure is analysed first: if the test script or test data was wrong, the test is corrected and the incident is recorded in the run log (it is **not** a product defect). Product defects are logged with ID, severity, priority, steps to reproduce, expected and actual behaviour, root cause and resolution, and follow the life cycle **New → Assigned → Fixed → Re-tested → Closed** (or **Deferred** with justification). Each fixed defect is protected by a regression test referenced in the defect log.'),
    DataTable([{ header: 'Severity', width: 1400 }, { header: 'Definition', width: PORTRAIT_W - 1400 }], [
      ['Critical', 'System unusable, data loss or security breach; no workaround.'],
      ['High', 'A main function produces wrong results (e.g. wrong bill) or is blocked; workaround is difficult.'],
      ['Medium', 'Function works with a wrong or confusing detail; workaround exists.'],
      ['Low', 'Cosmetic, wording or minor usability issue.'],
    ], { boldFirst: true }),
    TableCaption('Defect severity levels (priority P1 = fix immediately … P4 = next release)'),
    H3('3.5 Roles, schedule and deliverables'),
    DataTable([{ header: 'Activity', width: 3000 }, { header: 'Responsibility', width: 3300 }, { header: 'Output', width: PORTRAIT_W - 6300 }], [
      ['Test planning and design', 'Test lead with requirements owner', 'This test plan; test case catalogue embedded in the test code'],
      ['Unit & integration test implementation', 'Developers of each module', 'tests/unit, tests/integration'],
      ['System & acceptance test implementation', 'Test engineer acting as end users of each role', 'tests/e2e, screenshots'],
      ['Execution and defect logging', 'Test engineer', 'Run log, actual results, defect log'],
      ['Re-testing and regression', 'Developers + test engineer', 'Updated run log'],
      ['Test summary report', 'Test lead', 'Part D of this document'],
    ], { boldFirst: true }),
    TableCaption('Test activities and responsibilities'),
    H3('3.6 Risks and mitigations'),
    DataTable([{ header: 'Risk', width: 4000 }, { header: 'Mitigation', width: PORTRAIT_W - 4000 }], [
      ['Time-dependent rules (slots in the past, queue ETA, bed-days, session expiry) make tests flaky.', 'Central clock that tests freeze; E2E tests book only for the next day and use seeded same-day appointments.'],
      ['Shared database between E2E tests causes order dependence.', 'Each E2E test creates or looks up its own data through the API before acting in the UI; fresh database for every run.'],
      ['Tests written by the same team that wrote the code share its blind spots.', 'Boundary and negative cases derived from the requirements, not from the code; exploratory walkthroughs by members not involved in the module.'],
      ['Short project schedule.', 'Full automation: the complete regression suite runs in about two minutes.'],
    ], { boldFirst: true }),
    TableCaption('Test risks'),

    H2('4. Unit Testing'),
    P(`**Objective:** verify each business rule in isolation. **Approach:** white-box tests of the pure functions in \`server/domain\`, applying boundary-value and state-transition techniques; no database or network is involved, so each test runs in milliseconds. **Coverage:** ${coverage ? `domain-rule modules ${coverage.domain.lines}% lines / ${coverage.domain.branches}% branches; whole server ${coverage.total.lines}% lines / ${coverage.total.branches}% branches (unit + integration suites, V8 coverage)` : 'see Part D'}.`),
    DataTable([{ header: 'Module under test', width: 3000 }, { header: 'Rules verified', width: 4638 }, { header: 'Cases', width: 2000 }], [
      ['appointmentRules, time', 'Slot generation, working days, slot validation, overlap detection, free slots, appointment transitions', String(tests.filter((t) => t.id.startsWith('UT-APT')).length)],
      ['queueRules', 'Priority ordering, token sequence, ETA with and without consultation in progress', String(tests.filter((t) => t.id.startsWith('UT-QUE')).length)],
      ['bedStateMachine, admissionRules', 'Bed transitions, bed-days, proportional allocation after transfer, discharge clearance', String(tests.filter((t) => t.id.startsWith('UT-IPD')).length)],
      ['billingRules, money', 'Totals and discount rounding, discount limits, payment validation, invoice status, number formats', String(tests.filter((t) => t.id.startsWith('UT-BIL')).length)],
      ['labRules, inventoryRules', 'Lab transitions, abnormal flag, low stock, expiry window, dispensability, alerts', String(tests.filter((t) => /^UT-(LAB|PHA)/.test(t.id)).length)],
      ['patientRules, authRules, permissions', 'ID format, validation, duplicates, age, lock-out, password policy, RBAC matrix', String(tests.filter((t) => /^UT-(PAT|AUTH)/.test(t.id)).length)],
    ], { boldFirst: true }),
    TableCaption('Unit test coverage by module'),

    H2('5. Integration Testing'),
    P('**Objective:** verify that the API, middleware, services, rule modules and database work together, including transactions, constraints and the audit log. **Approach:** grey-box tests that send real HTTP requests to the Express application (Supertest) backed by a fresh in-memory SQLite database with the production schema; users log in through the real login endpoint and act with their own tokens. Integration order is **bottom-up**: rule modules were unit-tested first, then each service was integrated through its API. Each test checks the HTTP status, the response body and, where relevant, side effects such as charges, stock levels, bed status and audit entries.'),
    DataTable([{ header: 'Area', width: 2600 }, { header: 'Interfaces exercised', width: 5238 }, { header: 'Cases', width: 1800 }], [
      ['Authentication & users', '/auth/*, /users/* – login, lock-out, deactivation, token tampering, logout, RBAC, user admin', String(tests.filter((t) => /^IT-(AUTH|USR)/.test(t.id)).length)],
      ['Patients, doctors, appointments', '/patients/*, /doctors/*, /appointments/*', String(tests.filter((t) => /^IT-(PAT|DOC|APT)/.test(t.id)).length)],
      ['Smart queue', '/appointments/:id/check-in, /queue/*', String(tests.filter((t) => t.id.startsWith('IT-QUE')).length)],
      ['Consultation, laboratory, pharmacy', '/consultations/*, /lab/*, /pharmacy/* incl. charge creation and atomic dispensing', String(tests.filter((t) => /^IT-(CON|LAB|PHA)/.test(t.id)).length)],
      ['Admissions, beds, billing', '/beds/*, /admissions/*, /billing/* incl. clearance and receipts', String(tests.filter((t) => /^IT-(IPD|BIL)/.test(t.id)).length)],
      ['Reports, audit, NFRs', '/reports/*, /audit, SQL injection, password storage, headers, latency', String(tests.filter((t) => /^IT-(RPT|AUD|NFR)/.test(t.id)).length)],
      ['Robustness / edge cases', 'Impossible dates, malformed filters, wildcards, paging limits, over-long or wrong-type input, ownership and duplicate checks, sequence-number uniqueness, time-zone day boundaries', String(tests.filter((t) => t.id.startsWith('IT-EDGE')).length)],
    ], { boldFirst: true }),
    TableCaption('Integration test areas'),

    H2('6. System Testing'),
    P('**Objective:** verify the complete, integrated system against the SRS from the user interface. **Approach:** black-box tests with Playwright driving a real Chromium browser against the production build served by the Node.js server with a freshly generated demo database. Each test logs in through the login form as the relevant role and performs a complete module workflow (e.g. book → check in → queue; generate invoice → partial payment → overpayment rejected → full payment → print receipt). Non-functional system checks include role-based menus and access-denied pages (security), responsive layout at 390 px (usability, NFR-05) and API latency (performance, NFR-01, measured in IT-NFR-03).'),
    DataTable([{ header: 'ID', width: 1300 }, { header: 'System test', width: PORTRAIT_W - 1300 }], tests.filter((t) => t.level === 'System').map((t) => [t.id, t.title]), { boldFirst: true }),
    TableCaption('System test cases'),

    H2('7. Acceptance Testing'),
    P('**Objective:** confirm that the system satisfies the user requirements (Part A, Section 7) and is ready for use. **Approach:** scenario-based acceptance tests that follow a patient through several roles in one continuous flow, written from the acceptance criteria of the user stories. In this academic project the team acted as the hospital users; the scenarios are scripted and automated (Playwright) so that they are repeatable. A real deployment would add a supervised user-acceptance session with hospital staff and formal sign-off.'),
    DataTable([{ header: 'ID', width: 1100 }, { header: 'Acceptance scenario', width: 5400 }, { header: 'User requirements validated', width: PORTRAIT_W - 6500 }], tests.filter((t) => t.level === 'Acceptance').map((t) => [t.id, t.title, (t.ur || urFor(t)).join(', ')]), { boldFirst: true }),
    TableCaption('Acceptance test scenarios'),
    P('**Acceptance criteria:** all acceptance scenarios pass; no open Critical/High defects; every user requirement UR-01 … UR-14 is validated by at least one acceptance or system test.'),
  ];
}

function urFor(t) {
  const frs = new Set(t.fr || []);
  return USER_REQUIREMENTS.filter((u) => {
    const refs = u[5].split(',').map((s) => s.trim());
    return refs.some((r) => {
      if (r.includes('–')) {
        const [a, b] = r.split('–').map((x) => Number(x.replace(/\D/g, '')));
        return [...frs].some((f) => { const n = Number(f.replace(/\D/g, '')); return f.startsWith('FR') && n >= a && n <= b; });
      }
      return frs.has(r);
    });
  }).map((u) => u[0]);
}

/** Part D – test case tables (landscape) */
export function testCaseTables() {
  const cols = [
    { header: 'ID', width: 1150 },
    { header: 'Req.', width: 1150 },
    { header: 'Test case / input', width: 4000 },
    { header: 'Expected result', width: 3300 },
    { header: 'Actual result (recorded during execution)', width: 4070 },
    { header: 'Status', width: 900 },
  ];
  const sections = [];
  sections.push(
    H1('PART D – SOFTWARE TEST REPORT', { pageBreak: true }),
    H2('8. Test Cases'),
    P(`This section lists every executed test case with its expected and actual result and pass/fail status. The **actual result** column is not typed by hand: each automated test records what it observed (HTTP status, message, values) while running, and the report is generated from that log. Final execution: ${fmtTs(lastRun())} IST.`),
  );
  const levels = [['Unit', '8.1 Unit test cases'], ['Integration', '8.2 Integration test cases'], ['System', '8.3 System test cases'], ['Acceptance', '8.4 Acceptance test cases']];
  for (const [lvl, title] of levels) {
    const rows = tests.filter((t) => t.level === lvl).map((t) => [
      t.id,
      (t.fr || []).join(', '),
      [`**${t.title}**`, `Input: ${t.input}`],
      t.expected,
      t.actual || (t.error ? `Error: ${t.error}` : '—'),
      t.status === 'PASS' ? 'PASS' : 'FAIL',
    ]);
    sections.push(H3(title), DataTable(cols, rows, { size: 15, statusCol: 5, boldFirst: true, cantSplit: true }), TableCaption(`${lvl} test cases (${rows.length})`));
  }
  return sections;
}

/** Part D – summaries, defects (portrait) */
export function testResults() {
  const s = counts.summary;
  const tot = s.reduce((a, x) => ({ total: a.total + x.total, pass: a.pass + x.pass, fail: a.fail + x.fail }), { total: 0, pass: 0, fail: 0 });
  const nfr = (id) => tests.find((t) => t.id === id);
  const frCovered = spec.functional.filter((f) => tests.some((t) => (t.fr || []).includes(f.id) && t.status === 'PASS'));
  const sevCount = (sev) => defects.filter((d) => d.severity === sev).length;
  return [
    H2('9. Expected Results'),
    P('Expected results were defined **before** execution from the requirements and business rules (not from the observed behaviour) and are stored with each test case. They specify the exact HTTP status code, error code or message, state transition, calculated amount or UI element that must appear – for example “409 DOCTOR_SLOT_TAKEN”, “ETA 0, 12, 24 min”, “total ₹1,111.05” or “bed GA-01 CLEANING”. The expected result of every case is shown in the tables of Section 8.'),

    H2('10. Actual Results'),
    P('Actual results were captured automatically at run time. The final regression run executed the complete suite on a clean build:'),
    DataTable([
      { header: 'Test level', width: 2000 }, { header: 'Planned', width: 1300 }, { header: 'Executed', width: 1300 }, { header: 'Passed', width: 1300 }, { header: 'Failed', width: 1300 }, { header: 'Pass rate', width: PORTRAIT_W - 7200 },
    ], [...s.map((x) => [x.level, String(x.total), String(x.total), String(x.pass), String(x.fail), pct(x.pass, x.total)]), ['Total', String(tot.total), String(tot.total), String(tot.pass), String(tot.fail), pct(tot.pass, tot.total)]], { boldFirst: true }),
    TableCaption('Test execution summary (final run)'),
    H3('10.1 Execution history'),
    P('The suite was executed several times during development. Failures in earlier runs and their causes are recorded honestly below; failures caused by mistakes in test scripts are distinguished from product defects (Section 12).'),
    DataTable([{ header: 'Run', width: 600 }, { header: 'Date / time (IST)', width: 1700 }, { header: 'Scope', width: 2100 }, { header: 'Result', width: 1500 }, { header: 'Notes', width: PORTRAIT_W - 5900 }], runLog, { size: 16, boldFirst: true }),
    TableCaption('Test run log'),
    H3('10.2 Code coverage'),
    coverage
      ? DataTable([{ header: 'Scope', width: 3200 }, { header: 'Lines', width: 1600 }, { header: 'Branches', width: 1600 }, { header: 'Functions', width: 1600 }, { header: 'Statements', width: PORTRAIT_W - 8000 }], [
        ['Domain rules (server/domain)', `${coverage.domain.lines}%`, `${coverage.domain.branches}%`, `${coverage.domain.functions}%`, `${coverage.domain.statements}%`],
        ['Services (server/services)', `${coverage.services.lines}%`, `${coverage.services.branches}%`, `${coverage.services.functions}%`, `${coverage.services.statements}%`],
        ['Whole server', `${coverage.total.lines}%`, `${coverage.total.branches}%`, `${coverage.total.functions}%`, `${coverage.total.statements}%`],
      ], { boldFirst: true })
      : P('Coverage data not available.'),
    TableCaption('Code coverage of the server by unit + integration tests (V8)'),
    H3('10.3 Non-functional results'),
    DataTable([{ header: 'NFR', width: 1100 }, { header: 'Measured / observed', width: 6400 }, { header: 'Verdict', width: PORTRAIT_W - 7500 }], [
      ['NFR-01', nfr('IT-NFR-03')?.actual || 'see IT-NFR-03', nfr('IT-NFR-03')?.status || '—'],
      ['NFR-02', `${nfr('IT-NFR-02')?.actual || ''}; ${nfr('IT-NFR-01')?.actual || ''}; forged/expired tokens rejected (IT-AUTH-05)`, nfr('IT-NFR-02')?.status === 'PASS' && nfr('IT-NFR-01')?.status === 'PASS' ? 'PASS' : 'FAIL'],
      ['NFR-03', 'Clinical data denied to non-clinical roles (IT-CON-06); passwords never in audit log (IT-AUD-01)', tests.find((t) => t.id === 'IT-CON-06')?.status || '—'],
      ['NFR-04', 'Dispensing with one unavailable item leaves stock and prescription unchanged (IT-PHA-03); admission + bed update in one transaction', nfr('IT-PHA-03')?.status || '—'],
      ['NFR-05', nfr('AT-04')?.actual || 'see AT-04', nfr('AT-04')?.status || '—'],
      ['NFR-06', coverage ? `Layered code; domain rules ${coverage.domain.lines}% line coverage (target ≥ 80%)` : 'see 10.2', coverage && coverage.domain.lines >= 80 ? 'PASS' : '—'],
      ['NFR-07', 'Built and fully tested on Linux with Node.js 22 and Chromium; all dependencies are cross-platform (Node.js 20+, prebuilt SQLite binaries for Windows/macOS/Linux). Windows/macOS and Firefox/Safari runs are not yet verified', 'PASS (partial – see scope)'],
      ['NFR-08', nfr('IT-AUD-01')?.actual || 'see IT-AUD-01', nfr('IT-AUD-01')?.status || '—'],
    ], { boldFirst: true, statusCol: 2, size: 17 }),
    TableCaption('Non-functional requirement results'),

    H2('11. Pass/Fail Status'),
    P(`**Overall status: ${tot.fail === 0 ? 'PASS' : 'FAIL'}.** ${tot.pass} of ${tot.total} test cases passed (${pct(tot.pass, tot.total)}) in the final run. ${frCovered.length} of ${spec.functional.length} functional requirements are covered by at least one passing test (see the traceability matrix in Appendix A). ${defects.filter((d) => d.status === 'Fixed').length} defects were found and fixed during testing and ${defects.filter((d) => d.status !== 'Fixed').length} low-severity enhancement was deferred; no Critical or High defect is open.`),
    DataTable([{ header: 'Exit criterion (Part C, 3.3)', width: 5600 }, { header: 'Result', width: 2500 }, { header: 'Met?', width: PORTRAIT_W - 8100 }], [
      ['100% of planned test cases executed', `${tot.total}/${tot.total} executed`, 'PASS'],
      ['All test cases pass', `${tot.pass}/${tot.total} passed`, tot.fail === 0 ? 'PASS' : 'FAIL'],
      ['No open Critical/High defects', `${defects.filter((d) => ['Critical', 'High'].includes(d.severity) && d.status !== 'Fixed').length} open`, defects.some((d) => ['Critical', 'High'].includes(d.severity) && d.status !== 'Fixed') ? 'FAIL' : 'PASS'],
      ['Every FR covered by a passing test', `${frCovered.length}/${spec.functional.length}`, frCovered.length === spec.functional.length ? 'PASS' : 'FAIL'],
      ['Domain-rule line coverage ≥ 80%', coverage ? `${coverage.domain.lines}%` : '—', coverage && coverage.domain.lines >= 80 ? 'PASS' : 'FAIL'],
    ], { statusCol: 2, boldFirst: true }),
    TableCaption('Exit criteria evaluation'),

    H2('12. Defect Reporting'),
    P(`${defects.length} defects were reported during system testing and code review: ${['High', 'Medium', 'Low'].map((sv) => `${sevCount(sv)} ${sv.toLowerCase()}`).join(', ')} severity. Each fixed defect was re-tested and is protected by the regression test listed in the log.`),
    DataTable([{ header: 'ID', width: 800 }, { header: 'Title', width: 3000 }, { header: 'Module', width: 1000 }, { header: 'Severity / priority', width: 1100 }, { header: 'Found in', width: 1638 }, { header: 'Status', width: 900 }, { header: 'Verified by', width: 1200 }],
      defects.map((d) => [d.id, d.title, d.module, `${d.severity} / ${d.priority}`, d.foundIn, d.status, d.verifiedBy]), { size: 15, statusCol: 5, boldFirst: true }),
    TableCaption('Defect log'),
    H3('12.1 Detailed defect reports'),
    ...defects.flatMap((d) => [
      DataTable([{ header: d.id, width: 2000 }, { header: d.title, width: PORTRAIT_W - 2000 }], [
        ['Module / severity', `${d.module} · ${d.severity} · ${d.priority}`],
        ['Detected during', d.foundIn],
        ['Steps to reproduce', d.steps],
        ['Expected', d.expected],
        ['Actual (before fix)', d.actual],
        ['Root cause', d.rootCause],
        ['Resolution', d.fix],
        ['Status / verification', `${d.status} – ${d.verifiedBy}`],
      ], { boldFirst: true, zebra: false, size: 17 }),
      Small(' '),
    ]),
    H3('12.2 Defect summary and analysis'),
    DataTable([{ header: 'Severity', width: 2000 }, { header: 'Reported', width: 2000 }, { header: 'Fixed', width: 2000 }, { header: 'Deferred / open', width: PORTRAIT_W - 6000 }], ['High', 'Medium', 'Low'].map((sv) => [sv, String(sevCount(sv)), String(defects.filter((d) => d.severity === sv && d.status === 'Fixed').length), String(defects.filter((d) => d.severity === sv && d.status !== 'Fixed').length)]), { boldFirst: true }),
    TableCaption('Defects by severity and status'),
    P(`**Analysis.** Most defects (${defects.filter((d) => /Robustness|robustness/.test(d.foundIn)).length} of ${defects.length}) were found by the dedicated robustness / edge-case pass, which probed every API with impossible dates, wrong data types, extreme values and malicious strings and crawled every screen for all six roles at desktop and phone width. The two high-severity defects were both data-integrity problems that only appear in longer scenarios: DEF-05 (bed-day billing after a same-day transfer) and DEF-22 (sequence numbers colliding with existing numbers) – confirming the value of scenario-based and data-driven testing in addition to unit tests. No defect caused data loss and no security vulnerability was found; the one deferred item (DEF-08) is a usability enhancement whose rule is already enforced by the server.`),

    H2('13. Conclusion'),
    P(`MediFlow implements all ${spec.functional.length} functional requirements of the SRS. The final regression run passed ${tot.pass} of ${tot.total} automated test cases across unit, integration, system and acceptance levels, every exit criterion of the test plan is met, and all defects of medium or higher severity are fixed and covered by regression tests. The system is therefore considered **ready for demonstration and user acceptance by hospital staff**. Recommended next steps before a production pilot are: cross-browser and accessibility testing, load testing on the target server, nightly database backups, HTTPS deployment behind a reverse proxy and a supervised user-acceptance session.`),
  ];
}

/** Appendix A – traceability (landscape) */
export function traceability() {
  const pages = { AUTH: 'Login, menus', USR: 'Users & Roles', PAT: 'Patients', DOC: 'Doctors', APT: 'Appointments', QUE: 'Queue Board', CON: 'Consultation', LAB: 'Laboratory', PHA: 'Pharmacy', IPD: 'Beds, Admission', BIL: 'Billing, Invoice', RPT: 'Dashboard, Reports', AUD: 'Audit Trail' };
  const svc = { AUTH: 'AuthService, permissions', USR: 'UserService', PAT: 'PatientService', DOC: 'DoctorService', APT: 'AppointmentService', QUE: 'QueueService', CON: 'ConsultationService', LAB: 'LabService', PHA: 'PharmacyService', IPD: 'AdmissionService, BedService', BIL: 'BillingService', RPT: 'ReportService', AUD: 'AuditService' };
  const rows = [...spec.functional, ...spec.nonFunctional.map((n) => ({ ...n, module: null }))].map((r) => {
    const ts = tests.filter((t) => (t.fr || []).includes(r.id));
    const ok = ts.length && ts.every((t) => t.status === 'PASS');
    if (!ts.length && r.id === 'NFR-06') return [r.id, r.category, '—', coverage ? `Verified by measurement: layered structure + domain-rule line coverage ${coverage.domain.lines}% (Part D, 10.2)` : 'Coverage not measured', coverage && coverage.domain.lines >= 80 ? 'PASS' : 'NOT TESTED'];
    if (!ts.length && r.id === 'NFR-07') return [r.id, r.category, '—', 'Tested on Linux + Chromium only; other operating systems and browsers not yet verified (Part C, 2.2)', 'PASS (PARTIAL)'];
    return [r.id, r.module ? `${r.module} – ${svc[r.module]}` : r.category, r.module ? pages[r.module] : '—', ts.map((t) => t.id).join(', ') || (r.id === 'NFR-09' || r.id === 'NFR-10' ? 'Not tested – production design target (Part C, 2.2)' : '—'), ts.length ? (ok ? 'PASS' : 'FAIL') : 'NOT TESTED'];
  });
  return [
    H1('APPENDIX A – REQUIREMENTS TRACEABILITY MATRIX', { pageBreak: true }),
    P('Each requirement is traced forward to the design module (service) and user-interface screen that implement it and to the test cases that verify it. The matrix is generated from the requirement identifiers embedded in the automated tests.'),
    DataTable([{ header: 'Requirement', width: 1300 }, { header: 'Design module / service', width: 3200 }, { header: 'UI screen', width: 2000 }, { header: 'Verified by test cases', width: 6870 }, { header: 'Status', width: 1200 }], rows, { size: 15, statusCol: 4, boldFirst: true }),
    TableCaption('Requirements traceability matrix'),
    P('User requirements are traced to functional requirements in Part A, Section 7, and validated by the acceptance tests listed in Part C, Section 7.'),
  ];
}

export { LANDSCAPE_W };
