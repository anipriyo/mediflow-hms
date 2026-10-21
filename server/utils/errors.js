export class AppError extends Error {
  constructor(status, message, code = 'ERROR', details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, 'VALIDATION_ERROR', details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You do not have permission to perform this action') =>
  new AppError(403, msg, 'FORBIDDEN');
export const notFound = (what = 'Resource') => new AppError(404, `${what} not found`, 'NOT_FOUND');
export const conflict = (msg, code = 'CONFLICT', details) => new AppError(409, msg, code, details);
export const locked = (msg) => new AppError(423, msg, 'ACCOUNT_LOCKED');

/** Assert helper used by domain/service code */
export function ensure(condition, error) {
  if (!condition) throw error;
}
