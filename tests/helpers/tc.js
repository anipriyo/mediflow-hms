// Test-case helper: every automated test carries its catalogue metadata (ID, requirement, input, expected)
// and records the *actual* observation, which feeds the Test Report (docs/test-results/actuals.jsonl).
import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

export const ACTUALS_FILE = path.resolve(process.cwd(), 'docs/test-results/actuals.jsonl');

/**
 * @param {{id:string,title:string,fr:string[],level:'Unit'|'Integration',input:string,expected:string}} meta
 * @param {(note:(s:any)=>void)=>Promise<void>|void} fn
 */
export function tc(meta, fn) {
  it(`${meta.id}: ${meta.title}`, async () => {
    const notes = [];
    const started = Date.now();
    let error = null;
    try {
      await fn((s) => notes.push(typeof s === 'string' ? s : JSON.stringify(s)));
    } catch (e) {
      error = e;
      throw e;
    } finally {
      fs.mkdirSync(path.dirname(ACTUALS_FILE), { recursive: true });
      fs.appendFileSync(
        ACTUALS_FILE,
        `${JSON.stringify({ ...meta, actual: notes.join('; '), status: error ? 'FAIL' : 'PASS', error: error ? String(error.message).slice(0, 400) : null, ms: Date.now() - started, ts: new Date().toISOString() })}\n`,
      );
    }
  });
}
