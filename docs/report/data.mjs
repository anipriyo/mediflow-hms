// Loads every input the report is generated from, so the document always matches the code and the latest test run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERMISSIONS, ROLES, ROLE_LABELS } from '../../server/domain/permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../..');

/** Public deployment of the prototype (Render free web service, see render.yaml). */
export const LIVE_URL = 'https://mediflow-hms-6vw1.onrender.com';
export const LIVE_HOST = LIVE_URL.replace(/^https?:\/\//, '');
/** Public source code repository. */
export const REPO_URL = 'https://github.com/anipriyo/mediflow-hms';
export const REPO_HOST = REPO_URL.replace(/^https?:\/\//, '');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const exists = (p) => fs.existsSync(path.join(ROOT, p));

export const spec = json('docs/spec/requirements.json');
export const team = json('docs/spec/team.json');
export const defects = json('docs/spec/defects.json');

// Actual results recorded by the automated tests (last occurrence of each ID wins)
const actualLines = exists('docs/test-results/actuals.jsonl') ? read('docs/test-results/actuals.jsonl').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const byId = new Map();
for (const a of actualLines) byId.set(a.id, a);
const levelOrder = { Unit: 0, Integration: 1, System: 2, Acceptance: 3 };
export const tests = [...byId.values()].sort((a, b) => (levelOrder[a.level] - levelOrder[b.level]) || a.id.localeCompare(b.id, 'en', { numeric: true }));

export const vitest = exists('docs/test-results/vitest-results.json') ? json('docs/test-results/vitest-results.json') : null;
export const playwright = exists('docs/test-results/playwright-results.json') ? json('docs/test-results/playwright-results.json') : null;

// Coverage summary (overall and server/domain only)
export const coverage = (() => {
  if (!exists('docs/test-results/coverage/coverage-summary.json')) return null;
  const c = json('docs/test-results/coverage/coverage-summary.json');
  const agg = (filter) => {
    const keys = Object.keys(c).filter((k) => k !== 'total' && filter(k));
    const sum = { lines: [0, 0], branches: [0, 0], functions: [0, 0], statements: [0, 0] };
    for (const k of keys) for (const m of Object.keys(sum)) { sum[m][0] += c[k][m].covered; sum[m][1] += c[k][m].total; }
    return Object.fromEntries(Object.entries(sum).map(([m, [cov, tot]]) => [m, tot ? Math.round((cov / tot) * 1000) / 10 : 0]));
  };
  return {
    total: Object.fromEntries(['lines', 'branches', 'functions', 'statements'].map((m) => [m, c.total[m].pct])),
    domain: agg((k) => k.includes('/server/domain/')),
    services: agg((k) => k.includes('/server/services/')),
  };
})();

// Run history table from run-log.md
export const runLog = exists('docs/test-results/run-log.md')
  ? read('docs/test-results/run-log.md').split('\n').filter((l) => /^\| R\d/.test(l)).map((l) => l.split('|').slice(1, -1).map((s) => s.trim()))
  : [];

// REST endpoints parsed from the router (method, path, permissions)
export const endpoints = (() => {
  const src = read('server/routes/index.js');
  const out = [];
  const re = /r\.(get|post|put|patch|delete)\('([^']+)'(?:,\s*allow\(([^)]*)\))?/g;
  let m;
  while ((m = re.exec(src))) {
    const perms = m[3] ? m[3].replace(/'/g, '').split(',').map((s) => s.trim()).join(' or ') : (m[2] === '/auth/login' || m[2] === '/health' ? 'public' : 'any authenticated user');
    out.push({ method: m[1].toUpperCase(), path: `/api${m[2]}`, perms });
  }
  return out;
})();

export const rbac = { PERMISSIONS, ROLES, ROLE_LABELS };

export const counts = (() => {
  const by = (lvl) => tests.filter((t) => t.level === lvl);
  const summary = ['Unit', 'Integration', 'System', 'Acceptance'].map((lvl) => ({
    level: lvl,
    total: by(lvl).length,
    pass: by(lvl).filter((t) => t.status === 'PASS').length,
    fail: by(lvl).filter((t) => t.status !== 'PASS').length,
  }));
  return { summary, total: tests.length, pass: tests.filter((t) => t.status === 'PASS').length };
})();

export const loc = (() => {
  const walk = (dir, exts) => {
    let n = 0;
    let files = 0;
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { const r = walk(p, exts); n += r.n; files += r.files; } else if (exts.some((x) => e.name.endsWith(x))) { n += read(p).split('\n').length; files += 1; }
    }
    return { n, files };
  };
  return { server: walk('server', ['.js', '.sql']), client: walk('client/src', ['.jsx', '.js', '.css']), tests: walk('tests', ['.js']) };
})();
