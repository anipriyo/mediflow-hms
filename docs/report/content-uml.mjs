import path from 'node:path';
import { H1, H2, H3, P, Bullets, DataTable, TableCaption, Callout, Figure, Landscape, PORTRAIT_W } from './lib.mjs';
import { ROOT, LIVE_URL, LIVE_HOST } from './data.mjs';

const uml = (f) => path.join(ROOT, 'docs/uml/png', f);

// No., diagram, UML diagram type, what it shows, requirements and rules it covers, PlantUML source
const CATALOGUE = [
  ['1', 'System overview', 'Use case', 'Six staff actors and the nine major functions of the system (context level)', 'All modules', '01a-use-case-overview'],
  ['2', 'Outpatient care', 'Use case', 'Registration, booking, check-in, smart queue, consultation, laboratory and pharmacy use cases with «include» and «extend»', 'FR-07 to FR-12, FR-15 to FR-37', '01b-use-case-outpatient'],
  ['3', 'Inpatient care and billing', 'Use case', 'Bed board, admission, transfer, discharge with billing clearance, invoices and payments', 'FR-38 to FR-47', '01c-use-case-inpatient-billing'],
  ['4', 'Administration and access control', 'Use case', 'Login with lock-out, dashboards, users and roles, reports and audit trail', 'FR-01 to FR-06, FR-13, FR-14, FR-48 to FR-50', '01d-use-case-admin'],
  ['5', 'Domain model', 'Class', 'Entities with attributes, operations, associations and multiplicities', 'Data of all FRs', '02-class-domain'],
  ['6', 'Service layer design', 'Class', 'React client classes, Express router and middleware, services, rule modules and data access, with dependencies', 'NFR-06 (maintainability)', '03-class-design'],
  ['7', 'Book an appointment', 'Sequence', 'Slot check, conflict detection and transactional booking, with the slot-taken alternative', 'FR-15 to FR-17', '04-seq-booking'],
  ['8', 'Check-in, queue and consultation', 'Sequence', 'Token and ETA calculation, calling the next patient, consultation, prescription, lab order and charges', 'FR-21 to FR-29', '05-seq-queue-consultation'],
  ['9', 'Admission and discharge', 'Sequence', 'Bed allocation, discharge request, billing clearance and the administrator override', 'FR-39 to FR-46', '06-seq-admission-discharge'],
  ['10', 'Login and access control', 'Sequence', 'Password check, lock-out after five failures, token issue and permission check on each request', 'FR-01 to FR-04', '07-seq-login'],
  ['11', 'Appointment', 'State machine', 'Life cycle of an appointment from booking to completion, cancellation or no-show', 'BR-04', '08-state-appointment'],
  ['12', 'Bed', 'State machine', 'Available, reserved, occupied, cleaning and maintenance states with their allowed transitions', 'BR-08', '09-state-bed'],
  ['13', 'Admission, invoice and lab order', 'State machine', 'Three composite life cycles in one diagram', 'BR-06, BR-09, BR-10', '10-state-admission-invoice-lab'],
  ['14', 'Outpatient journey', 'Activity', 'One patient visit across five swimlanes (reception, doctor, laboratory, pharmacy, billing)', 'Outpatient FRs', '13-activity-opd'],
  ['15', 'Layered architecture', 'Component', 'Client, application and data tiers, and the four server layers', 'NFR-06, NFR-10', '11-architecture'],
  ['16', 'Deployment', 'Deployment', 'Workstations, application server with Node.js runtime and SQLite file, and printers', 'NFR-07, NFR-09', '12-deployment'],
  ['17', 'Logical data model', 'Entity relationship (supporting)', 'The 20 database tables, keys and relationships in crow\'s-foot notation', 'Data of all FRs', '14-er-diagram'],
];

export function umlDiagrams() {
  return [
    H1('UML DIAGRAMS', { pageBreak: true }),
    Callout('All diagrams follow UML 2.5 and were drawn as text with PlantUML. The sources are kept with the code in `docs/uml/*.puml` and rendered to `docs/uml/png/`, so every diagram can be regenerated and reviewed like source code. The same diagrams are explained in their design context in the Software Design Document.'),

    H2('1. Introduction'),
    P('This document collects the sixteen UML diagrams of MediFlow, plus the logical data model that supports them. They describe the system from four viewpoints. **Use case diagrams** show who uses the system and for what, **class diagrams** show its static structure, **sequence, state and activity diagrams** show its behaviour, and **component and deployment diagrams** show how it is built and installed.'),
    DataTable([
      { header: 'No.', width: 500 }, { header: 'Diagram', width: 1650 }, { header: 'Type', width: 1150 }, { header: 'What it shows', width: 2988 }, { header: 'Covers', width: 1350 }, { header: 'Source (.puml)', width: 2000 },
    ], CATALOGUE.map(([no, name, type, shows, covers, file]) => [no, `**${name}**`, type, shows, covers, file]), { size: 15 }),
    TableCaption('Diagram catalogue'),
    H3('1.1 Notation used'),
    Bullets([
      '**Use case diagrams.** Stick figures are actors (staff roles), ovals are use cases and the rectangle is the system boundary. «include» marks behaviour that always happens as part of the base use case, while «extend» marks optional behaviour.',
      '**Class diagrams.** Each class shows its attributes and operations. Lines show associations with multiplicities, a filled diamond marks composition and an arrow marks a dependency. Stereotypes such as «lib/api.js» name the source file that implements a class.',
      '**Sequence diagrams.** Lifelines run from left (actor and user interface) to right (database). Messages are numbered, and alt and opt fragments show the error and override paths that are also covered by test cases.',
      '**State and activity diagrams.** Rounded boxes are states or actions, the filled circle is the start and the ringed circle is the end. Transitions that are not drawn are rejected by the system with HTTP 409.',
    ]),

    H2('2. Use Case Diagrams'),
    P('The system has six staff actors (Receptionist, Doctor, Lab Technician, Pharmacist, Billing Staff and Administrator). Patients are external to the system, because they do not log in and their data is entered by staff. A single diagram with six actors and about forty use cases would be unreadable, so the model is split into an overview and three detailed diagrams.'),
    ...Figure(uml('01a-use-case-overview.png'), 'Use case diagram – system overview', { maxH: 520 }),
    ...Figure(uml('01b-use-case-outpatient.png'), 'Use case diagram – outpatient care', { maxH: 850 }),
    ...Figure(uml('01c-use-case-inpatient-billing.png'), 'Use case diagram – inpatient care and billing', { maxH: 560 }),
    ...Figure(uml('01d-use-case-admin.png'), 'Use case diagram – administration and access control', { maxH: 520 }),
    P('Detailed specifications of the five most important use cases (book appointment, check in and manage queue, conduct consultation, discharge patient and record payment) are given in the Software Design Document, Section 5.1.'),

    H2('3. Class Diagrams'),
    P('The **domain class diagram** shows the main entities, their attributes, operations and associations with multiplicities. A patient books many appointments, and each appointment has at most one consultation, which may produce one prescription (composed of items referencing medicines) and several lab orders. Wards are composed of beds, and an admission is composed of one or more bed stays (one per bed occupied), which is how transfers and bed-day billing are modelled. Charges aggregate into invoices, which own payments.'),
    ...Figure(uml('02-class-domain.png'), 'Domain class diagram', { maxH: 850 }),
    P('The **design class diagram** shows how the implementation realises the domain. Controllers delegate to services, services use pure rule modules and the data-access layer, and the cross-cutting services (Charge and Audit) are shared by all modules.'),
    Landscape(...Figure(uml('03-class-design.png'), 'Design class diagram – service layer and dependencies', { maxW: 960, maxH: 590 })),

    H2('4. Sequence Diagrams'),
    P('The sequence diagrams show the interaction between the actors, the React user interface, the API layer, the services, the rule modules and the database for the four most important scenarios.'),
    Landscape(...Figure(uml('04-seq-booking.png'), 'Sequence diagram – book an appointment', { maxW: 960, maxH: 590 })),
    ...Figure(uml('05-seq-queue-consultation.png'), 'Sequence diagram – check-in, queue and consultation', { maxH: 850 }),
    ...Figure(uml('06-seq-admission-discharge.png'), 'Sequence diagram – admission and discharge with billing clearance', { maxH: 850 }),
    ...Figure(uml('07-seq-login.png'), 'Sequence diagram – login, lock-out and role-based access', { maxH: 520 }),

    H2('5. State Diagrams'),
    P('Every entity with a life cycle has a state diagram. The same transition tables are implemented in `server/domain/*` and verified by the unit tests UT-APT-10, UT-IPD-01, UT-IPD-02, UT-IPD-04, UT-LAB-01 and UT-BIL-06, so the diagrams and the code cannot drift apart unnoticed.'),
    ...Figure(uml('08-state-appointment.png'), 'State diagram – Appointment', { maxH: 480 }),
    ...Figure(uml('09-state-bed.png'), 'State diagram – Bed', { maxH: 340 }),
    ...Figure(uml('10-state-admission-invoice-lab.png'), 'State diagrams – Admission, Invoice and Lab order', { maxH: 700 }),

    H2('6. Activity Diagram'),
    P('The activity diagram complements the state diagrams by showing how responsibility for one outpatient visit passes between the roles, from registration and check-in through consultation, laboratory and pharmacy to billing.'),
    ...Figure(uml('13-activity-opd.png'), 'Activity diagram – outpatient journey across roles', { maxH: 700 }),

    H2('7. Component Diagram'),
    P('MediFlow uses a three-tier, layered client and server architecture. The presentation tier is a React single-page application in the browser, the application tier is a Node.js and Express server with a REST API, and the data tier is an embedded SQLite database. Inside the server each layer may only call the layer below it.'),
    ...Figure(uml('11-architecture.png'), 'Component diagram – layered system architecture', { maxH: 560 }),

    H2('8. Deployment Diagram'),
    P('In a hospital, the server runs on one application machine on the local network and staff use any browser on a workstation or tablet. Invoices and receipts are printed from the browser.'),
    ...Figure(uml('12-deployment.png'), 'Deployment diagram', { maxH: 380 }),
    P(`The public demonstration uses the same single-server design. One Node.js web service on Render's cloud serves both the built React app and the REST API with the embedded SQLite database, at [${LIVE_HOST}](${LIVE_URL}).`),

    H2('9. Logical Data Model'),
    P('The logical data model is not a UML diagram, but it is included because the domain class diagram maps directly onto it. It has 20 tables in third normal form, and status columns are constrained by CHECK clauses that mirror the state diagrams in Section 5.'),
    ...Figure(uml('14-er-diagram.png'), 'Logical data model (crow\'s-foot notation)', { maxH: 820 }),
  ];
}
