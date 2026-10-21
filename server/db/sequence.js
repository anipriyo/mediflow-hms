import { db } from './connection.js';

/**
 * Next number for identifiers such as INV-20261021-0007: MAX(existing suffix) + 1 for the prefix.
 * Using MAX (not COUNT) keeps numbers unique even when older rows were numbered differently
 * (e.g. imported or demo data) or rows are ever removed.
 */
export function nextSequence(table, column, prefix) {
  const row = db()
    .prepare(`SELECT MAX(CAST(SUBSTR(${column}, ?) AS INTEGER)) AS n FROM ${table} WHERE ${column} LIKE ? ESCAPE '\\'`)
    .get(prefix.length + 1, `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  return (row.n || 0) + 1;
}
