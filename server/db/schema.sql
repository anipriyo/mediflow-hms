-- MediFlow HMS – SQLite schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('ADMIN','RECEPTIONIST','DOCTOR','LAB_TECH','PHARMACIST','BILLING')),
  email           TEXT,
  phone           TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  jti         TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS doctors (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL UNIQUE REFERENCES users(id),
  department_id       INTEGER NOT NULL REFERENCES departments(id),
  specialization      TEXT NOT NULL,
  qualification       TEXT,
  consultation_fee    REAL NOT NULL CHECK (consultation_fee >= 0),
  avg_consult_minutes INTEGER NOT NULL DEFAULT 15 CHECK (avg_consult_minutes > 0),
  slot_minutes        INTEGER NOT NULL DEFAULT 15 CHECK (slot_minutes > 0),
  work_start          TEXT NOT NULL DEFAULT '09:00',
  work_end            TEXT NOT NULL DEFAULT '17:00',
  work_days           TEXT NOT NULL DEFAULT '1,2,3,4,5,6', -- 0=Sun … 6=Sat
  room                TEXT
);

CREATE TABLE IF NOT EXISTS patients (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_code            TEXT NOT NULL UNIQUE,
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  gender                  TEXT NOT NULL CHECK (gender IN ('MALE','FEMALE','OTHER')),
  dob                     TEXT NOT NULL,
  phone                   TEXT NOT NULL,
  email                   TEXT,
  address                 TEXT,
  blood_group             TEXT,
  allergies               TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  created_by              INTEGER REFERENCES users(id),
  created_at              TEXT NOT NULL,
  updated_at              TEXT
);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);

CREATE TABLE IF NOT EXISTS appointments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id         INTEGER NOT NULL REFERENCES patients(id),
  doctor_id          INTEGER NOT NULL REFERENCES doctors(id),
  date               TEXT NOT NULL,
  start_time         TEXT NOT NULL,
  end_time           TEXT NOT NULL,
  reason             TEXT,
  status             TEXT NOT NULL DEFAULT 'SCHEDULED'
                     CHECK (status IN ('SCHEDULED','CHECKED_IN','IN_CONSULTATION','COMPLETED','CANCELLED','NO_SHOW')),
  token_no           INTEGER,
  priority           TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','URGENT')),
  priority_reason    TEXT,
  checked_in_at      TEXT,
  consult_started_at TEXT,
  completed_at       TEXT,
  cancel_reason      TEXT,
  created_by         INTEGER REFERENCES users(id),
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments(doctor_id, date);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_token_per_doctor_day ON appointments(doctor_id, date, token_no) WHERE token_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS consultations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id),
  patient_id     INTEGER NOT NULL REFERENCES patients(id),
  doctor_id      INTEGER NOT NULL REFERENCES doctors(id),
  symptoms       TEXT,
  bp             TEXT,
  pulse          INTEGER,
  temperature    REAL,
  weight         REAL,
  spo2           INTEGER,
  diagnosis      TEXT,
  notes          TEXT,
  follow_up_date TEXT,
  status         TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED')),
  created_at     TEXT NOT NULL,
  completed_at   TEXT
);

CREATE TABLE IF NOT EXISTS medicines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  generic_name  TEXT,
  form          TEXT NOT NULL DEFAULT 'Tablet',
  strength      TEXT,
  unit_price    REAL NOT NULL CHECK (unit_price >= 0),
  stock_qty     INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 20 CHECK (reorder_level >= 0),
  batch_no      TEXT,
  expiry_date   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id INTEGER REFERENCES consultations(id),
  admission_id    INTEGER REFERENCES admissions(id),
  patient_id      INTEGER NOT NULL REFERENCES patients(id),
  doctor_id       INTEGER NOT NULL REFERENCES doctors(id),
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DISPENSED','CANCELLED')),
  created_at      TEXT NOT NULL,
  dispensed_at    TEXT,
  dispensed_by    INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id     INTEGER NOT NULL REFERENCES medicines(id),
  dosage          TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  duration_days   INTEGER NOT NULL CHECK (duration_days > 0),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  instructions    TEXT
);

CREATE TABLE IF NOT EXISTS lab_tests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  category   TEXT,
  price      REAL NOT NULL CHECK (price >= 0),
  unit       TEXT,
  ref_low    REAL,
  ref_high   REAL,
  ref_text   TEXT
);

CREATE TABLE IF NOT EXISTS lab_orders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id          INTEGER NOT NULL REFERENCES patients(id),
  doctor_id           INTEGER NOT NULL REFERENCES doctors(id),
  consultation_id     INTEGER REFERENCES consultations(id),
  admission_id        INTEGER REFERENCES admissions(id),
  lab_test_id         INTEGER NOT NULL REFERENCES lab_tests(id),
  status              TEXT NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED','SAMPLE_COLLECTED','COMPLETED','CANCELLED')),
  priority            TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE','STAT')),
  result_value        REAL,
  result_text         TEXT,
  is_abnormal         INTEGER,
  remarks             TEXT,
  sample_collected_at TEXT,
  completed_at        TEXT,
  processed_by        INTEGER REFERENCES users(id),
  created_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL CHECK (type IN ('GENERAL','ICU','PRIVATE','PEDIATRIC','MATERNITY')),
  floor      TEXT,
  daily_rate REAL NOT NULL CHECK (daily_rate >= 0)
);

CREATE TABLE IF NOT EXISTS beds (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  ward_id              INTEGER NOT NULL REFERENCES wards(id),
  bed_no               TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'AVAILABLE'
                       CHECK (status IN ('AVAILABLE','RESERVED','OCCUPIED','CLEANING','MAINTENANCE')),
  current_admission_id INTEGER REFERENCES admissions(id),
  updated_at           TEXT,
  UNIQUE (ward_id, bed_no)
);
-- a bed can hold at most one admission
CREATE UNIQUE INDEX IF NOT EXISTS uq_bed_current_admission ON beds(current_admission_id) WHERE current_admission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS admissions (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_no           TEXT NOT NULL UNIQUE,
  patient_id             INTEGER NOT NULL REFERENCES patients(id),
  doctor_id              INTEGER NOT NULL REFERENCES doctors(id),
  bed_id                 INTEGER NOT NULL REFERENCES beds(id),
  reason                 TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'ADMITTED' CHECK (status IN ('ADMITTED','DISCHARGE_PENDING','DISCHARGED')),
  admitted_at            TEXT NOT NULL,
  discharge_requested_at TEXT,
  discharge_summary      TEXT,
  discharged_at          TEXT,
  override_reason        TEXT,
  created_by             INTEGER REFERENCES users(id)
);
-- a patient can have at most one active admission
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_admission ON admissions(patient_id) WHERE status <> 'DISCHARGED';

CREATE TABLE IF NOT EXISTS bed_stays (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_id INTEGER NOT NULL REFERENCES admissions(id),
  bed_id       INTEGER NOT NULL REFERENCES beds(id),
  daily_rate   REAL NOT NULL,
  start_at     TEXT NOT NULL,
  end_at       TEXT,
  charged      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no      TEXT NOT NULL UNIQUE,
  patient_id      INTEGER NOT NULL REFERENCES patients(id),
  admission_id    INTEGER REFERENCES admissions(id),
  subtotal        REAL NOT NULL,
  discount_pct    REAL NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 50),
  discount_amount REAL NOT NULL DEFAULT 0,
  discount_reason TEXT,
  total           REAL NOT NULL,
  paid_amount     REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PARTIALLY_PAID','PAID','CANCELLED')),
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS charges (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id     INTEGER NOT NULL REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  admission_id   INTEGER REFERENCES admissions(id),
  source_type    TEXT NOT NULL CHECK (source_type IN ('CONSULTATION','LAB','MEDICINE','BED','OTHER')),
  source_id      INTEGER,
  description    TEXT NOT NULL,
  quantity       REAL NOT NULL DEFAULT 1,
  unit_price     REAL NOT NULL,
  amount         REAL NOT NULL,
  invoice_id     INTEGER REFERENCES invoices(id),
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_charges_patient ON charges(patient_id, invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id),
  receipt_no  TEXT NOT NULL UNIQUE,
  amount      REAL NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL CHECK (method IN ('CASH','CARD','UPI')),
  reference   TEXT,
  received_by INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL,
  user_id   INTEGER,
  username  TEXT,
  role      TEXT,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT,
  summary   TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts);

-- Audit trail is append-only (FR-50): block updates and deletes at the database level.
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
