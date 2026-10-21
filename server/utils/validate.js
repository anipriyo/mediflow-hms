import { z } from 'zod';
import { badRequest } from './errors.js';
import { isRealDate } from '../domain/time.js';

/** Parse `data` with a zod schema, throwing a 400 with field-level messages on failure. */
export function validate(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    const first = Object.entries(fields)[0];
    throw badRequest(first ? `${first[0] === '_' ? '' : `${first[0]}: `}${first[1]}` : 'Invalid input', fields);
  }
  return result.data;
}

export const id = z.coerce.number().int().positive();
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format').refine(isRealDate, 'Not a valid calendar date');

/** Parse an integer query parameter and clamp it into [min, max]; invalid → default. */
export function clampInt(value, def, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/** LIKE pattern for a user-supplied search term; % and _ are matched literally (use with ESCAPE '\\'). */
export function likeTerm(term) {
  return `%${String(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Validate an optional YYYY-MM-DD query parameter. */
export function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (!isRealDate(String(value))) throw badRequest(`${field} must be a valid date (YYYY-MM-DD)`, { [field]: 'Invalid date' });
  return String(value);
}
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be a time in HH:MM format');
export const nonEmpty = (label, max = 1000) => z.string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` }).trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);
export { z };
