import { AuthService } from '../services/authService.js';
import { unauthorized, forbidden } from '../utils/errors.js';
import { can } from '../domain/permissions.js';

/** Requires a valid Bearer token (FR-04, NFR-02). */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  try {
    req.user = AuthService.verify(token);
    next();
  } catch (err) {
    next(err);
  }
}

/** Requires that the user's role has at least one of the given permissions (FR-03). */
export function authorize(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (permissions.some((p) => can(req.user.role, p))) return next();
    next(forbidden(`Your role (${req.user.role}) is not allowed to perform this action`));
  };
}
