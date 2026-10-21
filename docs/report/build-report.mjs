// Generates the assignment report (DOCX) from the project's specification, diagrams and test results.
// Usage: node docs/report/build-report.mjs   →  docs/report/build/MediFlow_HMS_Group11_Report.docx
import fs from 'node:fs';
import path from 'node:path';
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, TableOfContents, Header, Footer, PageNumber, LevelFormat,
  PageOrientation, BorderStyle, ShadingType, ImageRun,
} from 'docx';
import { H1, H2, P, Bullets, DataTable, TableCaption, Callout, KVTable, Break, Spacer, C, FONT, PORTRAIT_W, resetCounters, runs, arrange } from './lib.mjs';
import { spec, team, counts, tests, defects, ROOT } from './data.mjs';
import { srs } from './content-srs.mjs';
import { sdd } from './content-sdd.mjs';
import { testPlan, testCaseTables, testResults, traceability } from './content-test.mjs';

resetCounters();
const OUT_DIR = path.join(ROOT, 'docs/report/build');
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, 'MediFlow_HMS_Group11_Report.docx');

const MARGIN = 1134; // 2 cm
const PORTRAIT = { size: { width: 11906, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 567, footer: 567 } };
const LANDSCAPE = { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 567, footer: 567 } };

const header = new Header({
  children: [new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 4 } },
    children: [
      new TextRun({ text: 'MediFlow – Hospital Management System', font: FONT, size: 16, color: C.brand, bold: true }),
      new TextRun({ text: `\tGroup ${String(team.groupNumber).replace(/\D/g, '') || team.groupNumber} · Assignment ${team.assignmentNumber}`, font: FONT, size: 16, color: C.muted }),
    ],
    tabStops: [{ type: 'right', position: 9638 }],
  })],
});
const headerLandscape = new Header({
  children: [new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 4 } },
    children: [
      new TextRun({ text: 'MediFlow – Hospital Management System', font: FONT, size: 16, color: C.brand, bold: true }),
      new TextRun({ text: `\tGroup ${String(team.groupNumber).replace(/\D/g, '') || team.groupNumber} · Assignment ${team.assignmentNumber}`, font: FONT, size: 16, color: C.muted }),
    ],
    tabStops: [{ type: 'right', position: 14570 }],
  })],
});
const footer = new Footer({
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

// ── Cover page ────────────────────────────────────────────────────
const groupNo = String(team.groupNumber);
const logoPng = path.join(ROOT, 'docs/report/assets/logo.png');
const cover = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 80 }, children: [new TextRun({ text: 'INDIAN INSTITUTE OF INFORMATION TECHNOLOGY KALYANI', font: FONT, size: 26, bold: true, color: C.ink })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: 'Department of Computer Science and Engineering', font: FONT, size: 22, color: C.muted })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [new TextRun({ text: 'Software Engineering – Project Assignment', font: FONT, size: 22, color: C.muted })] }),
  ...(fs.existsSync(logoPng) ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new ImageRun({ type: 'png', data: fs.readFileSync(logoPng), transformation: { width: 96, height: 96 } })] })] : []),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'MediFlow', font: FONT, size: 64, bold: true, color: C.brand })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: 'Hospital Management System', font: FONT, size: 36, color: C.ink })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: `Assignment ${team.assignmentNumber}: ${team.assignmentTitle}`, font: FONT, size: 26, bold: true, color: C.ink })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 }, children: [new TextRun({ text: 'Software Requirements Specification · Software Design Document (UML) · Software Test Plan · Software Test Report', font: FONT, size: 20, color: C.muted })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: `GROUP ${groupNo.replace(/\D/g, '') || groupNo}`, font: FONT, size: 30, bold: true, color: C.brand })] }),
  DataTable([{ header: 'Sl.', width: 900 }, { header: 'Name of the member', width: 4400 }, { header: 'Registration number', width: 3400 }], team.members.map((m, i) => [String(i + 1), m.name, m.reg]), { size: 22 }),
  Spacer(400),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: 'Submitted through Google Classroom · October 2026', font: FONT, size: 20, color: C.muted })] }),
];

// ── Front matter ──────────────────────────────────────────────────
const groupDetails = [
  H1('Group Details'),
  KVTable([
    ['Group number', groupNo.replace(/\D/g, '') || groupNo],
    ['Assignment number and title', `Assignment ${team.assignmentNumber} – ${team.assignmentTitle}`],
    ['Project name', 'MediFlow – Hospital Management System'],
    ['Problem statement (brief)', 'Develop a system to manage patients, doctors, appointments, prescriptions, billing and medical records.'],
    ['Deliverables', 'SRS, SDD with UML diagrams, Software Test Plan and Test Report (this document) + working prototype (source code)'],
  ], [3000, PORTRAIT_W - 3000], { h1: 'Field', h2: 'Value' }),
  TableCaption('Group and assignment details'),
  DataTable([{ header: 'Sl.', width: 800 }, { header: 'Name', width: 4400 }, { header: 'Registration number', width: PORTRAIT_W - 5200 }], team.members.map((m, i) => [String(i + 1), m.name, m.reg]), { boldFirst: true }),
  TableCaption('Group members'),
  H2('Document control'),
  DataTable([{ header: 'Version', width: 1100 }, { header: 'Date', width: 1800 }, { header: 'Description', width: PORTRAIT_W - 2900 }], [
    ['0.1', '15-Oct-2026', 'Project selected (Assignment 1 – Hospital Management System)'],
    ['0.2', '18-Oct-2026', 'Scope, user roles and feature set agreed (core, hospital operations, distinctive features)'],
    ['0.5', '21-Oct-2026', 'Requirements baselined (50 FR, 10 NFR, 12 BR); architecture and UML diagrams'],
    ['0.9', '21-Oct-2026', 'Prototype implemented; unit, integration, system and acceptance tests executed'],
    ['0.95', '22-Oct-2026', 'Robustness / edge-case testing; additional defects fixed and regression-tested'],
    ['1.0', '22-Oct-2026', 'Final report for submission'],
  ]),
  TableCaption('Revision history'),
  Break(),
  H2('Summary'),
  P(`MediFlow is a web-based Hospital Management System that manages **patients, doctors, appointments, prescriptions, billing and medical records**, extended with laboratory, pharmacy and in-patient (bed and admission) management. Beyond the core requirements, it introduces a **smart queue** with tokens and waiting-time estimates, a **live bed board** with a discharge workflow tied to billing clearance, and **role-based access control with an append-only audit trail** for six staff roles.`),
  P(`This report contains the **Software Requirements Specification** (Part A: ${spec.functional.length} functional and ${spec.nonFunctional.length} non-functional requirements, ${spec.businessRules.length} business rules, 14 user requirements), the **Software Design Document** (Part B: layered architecture, 13 modules and 15 UML diagrams – use case, class, sequence, state, activity, component and deployment), the **Software Test Plan** (Part C) and the **Software Test Report** (Part D). A working prototype (React + Node.js + SQLite) was built so that the test report contains real results: **${counts.pass} of ${counts.total} automated test cases passed** in the final run, and ${defects.length} defects found during testing are documented with their resolution.`),
  Callout('How to run the prototype: install Node.js 20+, then in the project folder run `npm install` and `npm run dev`, and open http://localhost:5173. Demo accounts (password Mediflow@123): admin, reception, dr.sharma, lab, pharmacy, billing. See Appendix B.'),
];

const toc = [
  H1('Table of Contents'),
  new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }),
];

const appendixB = [
  H1('APPENDIX B – RUNNING THE PROTOTYPE', { pageBreak: true }),
  P('**Requirements:** Node.js 20 or later (includes npm). No database server is needed – SQLite is embedded and the demo data is generated automatically on first start.'),
  DataTable([{ header: 'Command', width: 3400 }, { header: 'Purpose', width: PORTRAIT_W - 3400 }], [
    ['`npm install`', 'Install dependencies (once)'],
    ['`npm run dev`', 'Start the API (port 4000) and the web app (http://localhost:5173) with live reload'],
    ['`npm start`', 'Build the web app and serve everything from http://localhost:4000'],
    ['`npm run seed`', 'Reset the database and regenerate demo data relative to today'],
    ['`npm test`', 'Run unit + integration tests (Vitest)'],
    ['`npm run test:coverage`', 'Same, with code coverage'],
    ['`npx playwright install chromium` then `npm run test:e2e`', 'Run system and acceptance tests in a real browser'],
    ['`npm run report`', 'Regenerate this report (DOCX + PDF) from the specification, diagrams and latest test results'],
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
  TableCaption('Demo accounts (password: Mediflow@123)'),
  P('**Project structure:** `server/` (Express API: routes, middleware, services, domain rules, database), `client/` (React app), `tests/` (unit, integration, e2e), `docs/spec/` (requirements, defects), `docs/uml/` (PlantUML sources and images), `docs/test-results/` (raw results), `docs/report/` (report generator).'),
];

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

const portraitSec = (children) => ({ properties: { page: PORTRAIT }, headers: { default: header }, footers: { default: footer }, children: arrange(children) });
const landscape = (children) => ({ properties: { page: LANDSCAPE }, headers: { default: headerLandscape }, footers: { default: footer }, children: arrange(children) });
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

const doc = new Document({
  creator: 'Group 11 – MediFlow',
  title: 'MediFlow – Hospital Management System: SRS, SDD, Test Plan and Test Report',
  description: 'Software Engineering Assignment 1',
  features: { updateFields: true },
  numbering,
  styles,
  sections: [
    { properties: { page: PORTRAIT, titlePage: true }, children: arrange(cover) },
    ...portrait([...groupDetails, Break(), ...toc]),
    ...portrait([...srs(), ...sdd(), ...testPlan()]),
    landscape(testCaseTables()),
    ...portrait(testResults()),
    landscape(traceability()),
    ...portrait(appendixB),
  ],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buf);
console.log(`[report] ${OUT} (${(buf.length / 1024 / 1024).toFixed(2)} MB) – ${tests.length} test cases, ${defects.length} defects`);
void runs; void ShadingType; void Bullets; void H2;
