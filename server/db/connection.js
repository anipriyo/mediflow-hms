import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

let instance = null;

/** Open (or re-open) the database and apply the schema. Use ':memory:' for tests. */
export function initDb(dbPath, { reset = false } = {}) {
  if (instance) instance.close();
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    if (reset) {
      for (const suffix of ['', '-wal', '-shm']) {
        if (fs.existsSync(dbPath + suffix)) fs.rmSync(dbPath + suffix);
      }
    }
  }
  instance = new Database(dbPath);
  if (dbPath !== ':memory:') instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.exec(SCHEMA);
  return instance;
}

export function db() {
  if (!instance) throw new Error('Database not initialised – call initDb() first');
  return instance;
}

/** Run fn inside a single SQLite transaction (NFR-04). */
export function tx(fn) {
  return db().transaction(fn)();
}

export function closeDb() {
  if (instance) {
    instance.close();
    instance = null;
  }
}
