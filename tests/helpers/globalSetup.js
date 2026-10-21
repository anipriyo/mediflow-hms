import fs from 'node:fs';
import path from 'node:path';

// Before a Vitest run, drop the previous Unit/Integration "actual results" (keeps System/Acceptance lines
// written by Playwright). Do not import vitest here.
export default function setup() {
  const file = path.resolve(process.cwd(), 'docs/test-results/actuals.jsonl');
  if (!fs.existsSync(file)) return;
  const keep = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).filter((l) => {
    try { return !['Unit', 'Integration'].includes(JSON.parse(l).level); } catch { return false; }
  });
  fs.writeFileSync(file, keep.length ? `${keep.join('\n')}\n` : '');
}
