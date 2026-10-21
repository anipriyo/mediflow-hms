import { z } from 'zod';
import { badRequest } from './errors.js';

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
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be a time in HH:MM format');
export const nonEmpty = (label) => z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`);
export { z };
