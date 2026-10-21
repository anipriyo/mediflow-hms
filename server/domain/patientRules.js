// Patient registration rules (FR-07 … FR-09, BR-01)
export const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export function formatPatientCode(n) {
  return `P${String(n).padStart(5, '0')}`;
}

export function isValidMobile(phone) {
  return /^[6-9]\d{9}$/.test(String(phone || ''));
}

/** Returns a map of field → message; empty object when valid. */
export function validatePatient(data, todayStr, { partial = false } = {}) {
  const errors = {};
  const has = (k) => data[k] !== undefined;
  const req = (k) => !partial || has(k);

  if (req('first_name') && !String(data.first_name || '').trim()) errors.first_name = 'First name is required';
  if (req('last_name') && !String(data.last_name || '').trim()) errors.last_name = 'Last name is required';
  if (req('phone') && !isValidMobile(data.phone)) errors.phone = 'Enter a valid 10-digit mobile number';
  if (req('gender') && !GENDERS.includes(data.gender)) errors.gender = 'Gender must be MALE, FEMALE or OTHER';
  if (req('dob')) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dob || '') || Number.isNaN(Date.parse(data.dob))) errors.dob = 'Date of birth is required (YYYY-MM-DD)';
    else if (data.dob > todayStr) errors.dob = 'Date of birth cannot be in the future';
    else if (data.dob < '1900-01-01') errors.dob = 'Date of birth is not realistic';
  }
  if (has('blood_group') && data.blood_group && !BLOOD_GROUPS.includes(data.blood_group)) errors.blood_group = 'Invalid blood group';
  if (has('email') && data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Invalid email address';
  if (has('emergency_contact_phone') && data.emergency_contact_phone && !isValidMobile(data.emergency_contact_phone)) {
    errors.emergency_contact_phone = 'Enter a valid 10-digit mobile number';
  }
  return errors;
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Possible duplicate: same phone + DOB, or same full name + DOB (FR-09). */
export function findPossibleDuplicates(candidate, existing) {
  return existing.filter((p) => {
    if (p.dob !== candidate.dob) return false;
    const samePhone = String(p.phone) === String(candidate.phone);
    const sameName = norm(p.first_name) === norm(candidate.first_name) && norm(p.last_name) === norm(candidate.last_name);
    return samePhone || sameName;
  });
}

export function ageFrom(dob, todayStr) {
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}
