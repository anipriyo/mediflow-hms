import fs from 'node:fs';
import path from 'node:path';

// Clears the "actual results" log before a full test run (do not import vitest here).
export default function setup() {
  const file = path.resolve(process.cwd(), 'docs/test-results/actuals.jsonl');
  if (fs.existsSync(file)) fs.rmSync(file);
}
