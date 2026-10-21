// Role-permission matrix (FR-03, NFR-03)
export const ROLES = ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'LAB_TECH', 'PHARMACIST', 'BILLING'];

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  RECEPTIONIST: 'Receptionist',
  DOCTOR: 'Doctor',
  LAB_TECH: 'Lab Technician',
  PHARMACIST: 'Pharmacist',
  BILLING: 'Billing Staff',
};

const ALL = ROLES;

export const PERMISSIONS = Object.freeze({
  'dashboard:read': ALL,
  'users:manage': ['ADMIN'],
  'doctors:read': ALL,
  'doctors:manage': ['ADMIN'],
  'patients:read': ALL,
  'patients:write': ['ADMIN', 'RECEPTIONIST'],
  'clinical:read': ['ADMIN', 'DOCTOR'],
  'appointments:read': ['ADMIN', 'RECEPTIONIST', 'DOCTOR'],
  'appointments:write': ['ADMIN', 'RECEPTIONIST'],
  'queue:read': ['ADMIN', 'RECEPTIONIST', 'DOCTOR'],
  'queue:checkin': ['ADMIN', 'RECEPTIONIST'],
  'queue:priority': ['ADMIN', 'RECEPTIONIST', 'DOCTOR'],
  'consultation:write': ['DOCTOR'],
  'lab:read': ['ADMIN', 'DOCTOR', 'LAB_TECH'],
  'lab:order': ['DOCTOR'],
  'lab:process': ['LAB_TECH'],
  'pharmacy:read': ['ADMIN', 'DOCTOR', 'PHARMACIST'],
  'pharmacy:manage': ['PHARMACIST'],
  'prescriptions:read': ['ADMIN', 'DOCTOR', 'PHARMACIST'],
  'prescriptions:dispense': ['PHARMACIST'],
  'beds:read': ['ADMIN', 'RECEPTIONIST', 'DOCTOR'],
  'beds:manage': ['ADMIN', 'RECEPTIONIST'],
  'admissions:read': ['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'BILLING'],
  'admissions:write': ['ADMIN', 'RECEPTIONIST'],
  'admissions:request-discharge': ['DOCTOR'],
  'admissions:override': ['ADMIN'],
  'billing:read': ['ADMIN', 'BILLING'],
  'billing:write': ['BILLING'],
  'reports:read': ['ADMIN'],
  'audit:read': ['ADMIN'],
});

export function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Unknown permission "${permission}"`);
  return allowed.includes(role);
}

export function permissionsFor(role) {
  return Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(role));
}
