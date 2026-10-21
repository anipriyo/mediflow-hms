// Login lockout rules (FR-02, BR-12)
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export function isLocked(user, now) {
  return Boolean(user.locked_until) && new Date(user.locked_until).getTime() > now.getTime();
}

/** New counters after a failed attempt. */
export function afterFailedAttempt(user, now) {
  const attempts = (user.locked_until && !isLocked(user, now) ? 0 : user.failed_attempts) + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return { failed_attempts: attempts, locked_until: new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() };
  }
  return { failed_attempts: attempts, locked_until: null };
}

export function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters';
  return null;
}
