import fs from 'node:fs';
import path from 'node:path';

// Before a Playwright run, drop the previous System/Acceptance "actual results" (keeps Unit/Integration lines).
export default function globalSetup() {
  const file = path.resolve(process.cwd(), 'docs/test-results/actuals.jsonl');
  if (!fs.existsSync(file)) return;
  const keep = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).filter((l) => {
    try { return !['System', 'Acceptance'].includes(JSON.parse(l).level); } catch { return false; }
  });
  fs.writeFileSync(file, keep.length ? `${keep.join('\n')}\n` : '');
}
