// Generates the assignment documents (DOCX) from the project's specification, diagrams and test results.
// Usage: node docs/report/build-report.mjs   →  docs/report/build/*.docx
//   MediFlow_HMS_Group11_Report.docx         all parts in one report
//   MediFlow_HMS_Group11_1_SRS.docx … _5_Test_Report.docx   the same parts as five separate documents
import fs from 'node:fs';
import path from 'node:path';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, TableOfContents, Header, Footer, PageNumber, LevelFormat,
  PageOrientation, BorderStyle, ImageRun,
} from 'docx';
import { H1, H2, P, DataTable, TableCaption, Callout, KVTable, Break, Spacer, C, FONT, PORTRAIT_W, LANDSCAPE_W, resetCounters, runs, arrange, clean, setStandalone } from './lib.mjs';
import { spec, team, counts, tests, defects, ROOT, LIVE_URL, LIVE_HOST, REPO_URL, REPO_HOST } from './data.mjs';
import { srs } from './content-srs.mjs';
import { sdd } from './content-sdd.mjs';
import { umlDiagrams } from './content-uml.mjs';
import { testPlan, testCaseTables, testResults, traceability } from './content-test.mjs';

const OUT_DIR = path.join(ROOT, 'docs/report/build');
fs.mkdirSync(OUT_DIR, { recursive: true });

const MARGIN = 1134; // 2 cm
const PORTRAIT = { size: { width: 11906, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 567, footer: 567 } };
const LANDSCAPE = { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 567, footer: 567 } };
const groupNo = String(team.groupNumber).replace(/\D/g, '') || String(team.groupNumber);
const logoPng = path.join(ROOT, 'docs/report/assets/logo.png');
const DEMO_ACCOUNTS = 'admin, reception, dr.sharma, lab, pharmacy and billing, all with the password Mediflow@123';

// ── Documents ─────────────────────────────────────────────────────
const DOCS = [
  {
    file: 'MediFlow_HMS_Group11_Report', title: 'SRS, SDD, Test Plan and Test Report', label: null, appendixB: true,
    about: () => `This report contains the **Software Requirements Specification** (Part A, with ${spec.functional.length} functional and ${spec.nonFunctional.length} non-functional requirements, ${spec.businessRules.length} business rules and 14 user requirements), the **Software Design Document** (Part B, with a layered architecture, 13 modules, 16 UML diagrams of the use case, class, sequence, state, activity, component and deployment kinds, and a logical data model), the **Software Test Plan** (Part C) and the **Software Test Report** (Part D). A working prototype (React + Node.js + SQLite) was built so that the test report contains real results. In the final run **${counts.pass} of ${counts.total} automated test cases passed**, and ${defects.length} defects found during testing are documented with their resolution.`,
    body: () => [...portrait([...srs(), ...sdd(), ...testPlan()]), landscape(testCaseTables()), ...portrait(testResults()), landscape(traceability()), ...portrait(appendixB())],
  },
  {
    file: 'MediFlow_HMS_Group11_1_SRS', title: 'Software Requirements Specification (SRS)', label: 'Software Requirements Specification',
    about: () => `This document specifies ${spec.functional.length} functional and ${spec.nonFunctional.length} non-functional requirements, ${spec.businessRules.length} business rules and 14 user requirements, together with the problem statement, objectives, scope, system requirements, hardware and software requirements, assumptions and constraints. It is the baseline for the other four documents.`,
    body: () => portrait(srs()),
  },
  {
    file: 'MediFlow_HMS_Group11_2_SDD', title: 'Software Design Document (SDD)', label: 'Software Design Document',
    about: () => 'This document describes the design that realises the SRS. It covers the layered architecture and deployment, the thirteen modules, the database design, the class, use case, sequence, state and activity diagrams with use case specifications, the security design and the user interface.',
    body: () => portrait(sdd()),
  },
  {
    file: 'MediFlow_HMS_Group11_3_UML_Diagrams', title: 'UML Diagrams', label: 'UML Diagrams',
    about: () => 'This document collects the sixteen UML diagrams of the system (use case, class, sequence, state, activity, component and deployment) and the supporting logical data model, each with a short explanation and the requirements it covers.',
    body: () => portrait(umlDiagrams()),
  },
  {
    file: 'MediFlow_HMS_Group11_4_Test_Plan', title: 'Software Test Plan', label: 'Software Test Plan',
    about: () => 'This document plans how MediFlow is tested. It sets the testing objectives, scope and strategy, the test design techniques, environment, entry and exit criteria, defect management, roles, schedule and risks, and the approach for unit, integration, system and acceptance testing.',
    body: () => portrait(testPlan()),
  },
  {
    file: 'MediFlow_HMS_Group11_5_Test_Report', title: 'Software Test Report', label: 'Software Test Report', appendixB: true,
    about: () => `This document reports the execution of the Software Test Plan. It lists every test case with its expected and actual result and pass or fail status, the code coverage and non-functional results, the ${defects.length} defects found with their resolution, and a traceability matrix from requirements to tests. In the final run **${counts.pass} of ${counts.total} automated test cases passed**.`,
    body: () => [landscape(testCaseTables()), ...portrait(testResults()), landscape(traceability()), ...portrait(appendixB())],
  },
];
const PARTS = DOCS.filter((d) => d.label);

// ── Page furniture ────────────────────────────────────────────────
let current = DOCS[0];
const headerFor = (width) => new Header({
  children: [new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 4 } },
    children: [
      new TextRun({ text: current.label ? `MediFlow HMS · ${current.label}` : 'MediFlow Hospital Management System', font: FONT, size: 16, color: C.brand, bold: true }),
      new TextRun({ text: `\tGroup ${groupNo} · Assignment ${team.assignmentNumber}`, font: FONT, size: 16, color: C.muted }),
    ],
    tabStops: [{ type: 'right', position: width }],
  })],
});
const footer = () => new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: 'Page ', font: FONT, size: 16, color: C.muted }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: C.muted }),
      new TextRun({ text: ' of ', font: FONT, size: 16, color: C.muted }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: C.muted }),
    ],
  })],
});

const centred = (text, size, { after = 60, before = 0, bold = false, color = C.ink } = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before, after }, children: [new TextRun({ text: clean(text), font: FONT, size, bold, color })] });

// ── Cover and front matter ────────────────────────────────────────
const cover = (doc) => [
  centred('INDIAN INSTITUTE OF INFORMATION TECHNOLOGY KALYANI', 26, { before: 400, after: 80, bold: true }),
  centred('Department of Computer Science and Engineering', 22, { after: 40, color: C.muted }),
  centred('Software Engineering Project Assignment', 22, { after: 400, color: C.muted }),
  ...(fs.existsSync(logoPng) ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new ImageRun({ type: 'png', data: fs.readFileSync(logoPng), transformation: { width: 88, height: 88 } })] })] : []),
  centred('MediFlow', 64, { after: 60, bold: true, color: C.brand }),
  centred('Hospital Management System', 36, { after: 240 }),
  centred(`Assignment ${team.assignmentNumber} · ${team.assignmentTitle}`, 26, { bold: true }),
  doc.label
    ? centred(doc.title, 34, { before: 200, after: 400, bold: true, color: C.brand })
    : centred('Software Requirements Specification · Software Design Document (UML) · Software Test Plan · Software Test Report', 20, { after: 400, color: C.muted }),
  centred(`GROUP ${groupNo}`, 30, { after: 160, bold: true, color: C.brand }),
  DataTable([{ header: 'Sl.', width: 900 }, { header: 'Name of the member', width: 4400 }, { header: 'Registration number', width: 3400 }], team.members.map((m, i) => [String(i + 1), m.name, m.reg]), { size: 22 }),
  Spacer(360),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: runs(`**Live demo at** [${LIVE_HOST}](${LIVE_URL})`, { size: 22 }) }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: runs(`**Source code at** [${REPO_HOST}](${REPO_URL})`, { size: 22 }) }),
  centred('Submitted through Google Classroom · October 2026', 20, { after: 40, color: C.muted }),
];

const HISTORY = [
  ['0.1', '15-Oct-2026', 'Project selected (Assignment 1 – Hospital Management System)'],
  ['0.2', '18-Oct-2026', 'Scope, user roles and feature set agreed (core, hospital operations, distinctive features)'],
  ['0.5', '21-Oct-2026', 'Requirements baselined (50 FR, 10 NFR, 12 BR); architecture and UML diagrams'],
  ['0.9', '21-Oct-2026', 'Prototype implemented; unit, integration, system and acceptance tests executed'],
  ['0.95', '22-Oct-2026', 'Robustness / edge-case testing; additional defects fixed and regression-tested'],
  ['1.0', '22-Oct-2026', 'Final report for submission'],
  ['1.1', '22-Oct-2026', 'Prototype deployed online (Render); live demo link added'],
];

const groupDetails = (doc) => [
  H1('Group Details'),
  KVTable([
    ['Group number', groupNo],
    ['Assignment number and title', `Assignment ${team.assignmentNumber} – ${team.assignmentTitle}`],
    ...(doc.label
      ? [['Document', `${doc.title} (document ${PARTS.indexOf(doc) + 1} of ${PARTS.length})`]]
      : [['Deliverables', 'SRS, SDD with UML diagrams, Software Test Plan and Test Report (this document) + working prototype (source code)']]),
    ['Project name', 'MediFlow Hospital Management System'],
    ['Problem statement (brief)', 'Develop a system to manage patients, doctors, appointments, prescriptions, billing and medical records.'],
    ...(doc.label ? [['Companion documents', PARTS.filter((d) => d !== doc).map((d) => d.title).join(', ')]] : []),
    ['Live demo', `[${LIVE_HOST}](${LIVE_URL})`],
    ['Source code', `[${REPO_HOST}](${REPO_URL})`],
  ], [3000, PORTRAIT_W - 3000], { h1: 'Field', h2: 'Value' }),
  TableCaption('Group and assignment details'),
  DataTable([{ header: 'Sl.', width: 800 }, { header: 'Name', width: 4400 }, { header: 'Registration number', width: PORTRAIT_W - 5200 }], team.members.map((m, i) => [String(i + 1), m.name, m.reg]), { boldFirst: true }),
  TableCaption('Group members (names and registration numbers)'),
  H2('Document control'),
  DataTable([{ header: 'Version', width: 1100 }, { header: 'Date', width: 1800 }, { header: 'Description', width: PORTRAIT_W - 2900 }], [
    ...HISTORY,
    doc.label
      ? ['1.2', '25-Oct-2026', `Issued as a separate document (${doc.title}), one of five`]
      : ['1.2', '25-Oct-2026', 'Source code link added; the parts are also issued as five separate documents'],
  ]),
  TableCaption('Revision history'),
  Break(),
  H2('Summary'),
  P('MediFlow is a web-based Hospital Management System that manages **patients, doctors, appointments, prescriptions, billing and medical records**, extended with laboratory, pharmacy and in-patient (bed and admission) management. Beyond the core requirements, it introduces a **smart queue** with tokens and waiting-time estimates, a **live bed board** with a discharge workflow tied to billing clearance, and **role-based access control with an append-only audit trail** for six staff roles.'),
  P(doc.about()),
  Callout(`**Live demo.** The prototype runs online at [${LIVE_HOST}](${LIVE_URL}) and opens in any browser with no installation. Sign in with one of the demo accounts (${DEMO_ACCOUNTS}). It uses a free cloud plan, so the first visit after 15 idle minutes takes about a minute to load, and the demo data is reset to fresh records dated that day whenever the server restarts.`),
  Callout(`**Source code and running it locally.** The full source code is at [${REPO_HOST}](${REPO_URL}). Install Node.js 20 or later, run \`npm install\` and then \`npm run dev\` in the project folder, and open localhost port 5173 in a browser.${doc.appendixB ? ' See Appendix B for details.' : ''}`),
];

const toc = () => [
  H1('Table of Contents'),
  new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }),
];

const appendixB = () => [
  H1('APPENDIX B – RUNNING THE PROTOTYPE', { pageBreak: true }),
  P(`**Online.** The prototype is deployed at [${LIVE_HOST}](${LIVE_URL}) as a free Render web service. Render builds it from the GitHub repository using \`render.yaml\` and redeploys it on every push. No installation is needed, so simply sign in with any demo account below. The free plan sleeps after 15 idle minutes (the next visit takes about a minute) and recreates the demo database on every restart.`),
  P(`**Locally.** The source code is at [${REPO_HOST}](${REPO_URL}). The commands below run the prototype on your own computer.`),
  P('**Requirements:** Node.js 20 or later (includes npm). No database server is needed, because SQLite is embedded and the demo data is generated automatically on first start.'),
  DataTable([{ header: 'Command', width: 3400 }, { header: 'Purpose', width: PORTRAIT_W - 3400 }], [
    ['`npm install`', 'Install dependencies (once)'],
    ['`npm run dev`', 'Start the API (port 4000) and the web app (http://localhost:5173) with live reload'],
    ['`npm start`', 'Build the web app and serve everything from http://localhost:4000'],
    ['`npm run seed`', 'Reset the database and regenerate demo data relative to today'],
    ['`npm test`', 'Run unit + integration tests (Vitest)'],
    ['`npm run test:coverage`', 'Same, with code coverage'],
    ['`npx playwright install chromium` then `npm run test:e2e`', 'Run system and acceptance tests in a real browser'],
    ['`npm run report`', 'Regenerate the documents (DOCX + PDF) from the specification, diagrams and latest test results'],
  ]),
  TableCaption('Project commands'),
  DataTable([{ header: 'Username', width: 2400 }, { header: 'Role', width: 2600 }, { header: 'Try this', width: PORTRAIT_W - 5000 }], [
    ['admin', 'Administrator', 'Dashboard, Reports, Users & Roles, Audit Trail, discharge override'],
    ['reception', 'Receptionist', 'Register patient, book appointment, check in, queue board, admit patient on the bed board'],
    ['dr.sharma', 'Doctor', 'Queue → Call next patient → consultation, prescription, lab order, complete'],
    ['lab', 'Lab Technician', 'Laboratory worklist → collect sample → enter result'],
    ['pharmacy', 'Pharmacist', 'Dispense prescriptions, stock alerts, restock'],
    ['billing', 'Billing Staff', 'Generate invoice from “To bill”, record payment, print receipt'],
  ], { boldFirst: true }),
  TableCaption('Demo accounts (all use the password Mediflow@123)'),
  P('**Project structure:** `server/` (Express API: routes, middleware, services, domain rules, database), `client/` (React app), `tests/` (unit, integration, e2e), `docs/spec/` (requirements, defects), `docs/uml/` (PlantUML sources and images), `docs/test-results/` (raw results), `docs/report/` (report generator).'),
];

// ── Styles and sections ───────────────────────────────────────────
const numbering = {
  config: [
    { reference: 'bullets', levels: [0, 1].map((lvl) => ({ level: lvl, format: LevelFormat.BULLET, text: lvl === 0 ? '•' : '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 + lvl * 360, hanging: 260 } } } })) },
    { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }] },
  ],
};

const styles = {
  default: { document: { run: { font: FONT, size: 21, color: '1E293B' }, paragraph: { spacing: { line: 276, lineRule: 'auto' } } } },
  paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, color: C.brand, font: FONT }, paragraph: { spacing: { before: 240, after: 160 }, keepNext: true, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.brandMid, space: 4 } } } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 27, bold: true, color: C.ink, font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 23, bold: true, color: C.brand, font: FONT }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 2 } },
  ],
};

const portraitSec = (children) => ({ properties: { page: PORTRAIT }, headers: { default: headerFor(PORTRAIT_W) }, footers: { default: footer() }, children: arrange(children) });
const landscape = (children) => ({ properties: { page: LANDSCAPE }, headers: { default: headerFor(LANDSCAPE_W) }, footers: { default: footer() }, children: arrange(children) });
/** Portrait content that may contain Landscape(...) blocks → list of sections. */
function portrait(children) {
  const out = [];
  let buf = [];
  for (const el of children.flat(Infinity)) {
    if (el && el.__landscape) {
      if (buf.length) out.push(portraitSec(buf));
      out.push(landscape(el.__landscape));
      buf = [];
    } else buf.push(el);
  }
  if (buf.length) out.push(portraitSec(buf));
  return out;
}

// ── Build every document ──────────────────────────────────────────
for (const doc of DOCS) {
  current = doc;
  resetCounters();
  setStandalone(Boolean(doc.label));
  const document = new Document({
    creator: 'Group 11, MediFlow',
    title: `MediFlow Hospital Management System. ${doc.title}`,
    description: `Software Engineering Assignment ${team.assignmentNumber}, Group ${groupNo}`,
    features: { updateFields: true },
    numbering,
    styles,
    sections: [
      { properties: { page: PORTRAIT, titlePage: true }, children: arrange(cover(doc)) },
      ...portrait([...groupDetails(doc), Break(), ...toc()]),
      ...doc.body(),
    ],
  });
  const out = path.join(OUT_DIR, `${doc.file}.docx`);
  const buf = await Packer.toBuffer(document);
  fs.writeFileSync(out, buf);
  console.log(`[report] ${path.relative(ROOT, out)} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
}
console.log(`[report] ${DOCS.length} documents, ${tests.length} test cases, ${defects.length} defects`);
