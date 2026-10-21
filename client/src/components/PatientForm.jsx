import { useState } from 'react';
import { Field, Input, Select, Textarea } from './ui.jsx';
import { todayStr } from '../lib/format.js';

export const EMPTY_PATIENT = {
  first_name: '', last_name: '', gender: '', dob: '', phone: '', email: '', address: '', blood_group: '', allergies: '', emergency_contact_name: '', emergency_contact_phone: '',
};

/** Same normalisation as the server: accepts +91 / 91 / 0 prefixes, spaces and dashes. */
const normPhone = (v) => {
  let p = String(v ?? '').replace(/[\s\-().]/g, '');
  if (/^\+91\d{10}$/.test(p)) p = p.slice(3);
  else if (/^91\d{10}$/.test(p)) p = p.slice(2);
  else if (/^0\d{10}$/.test(p)) p = p.slice(1);
  return p;
};

/** Client-side mirror of the server validation (FR-08) for instant feedback. */
export function validatePatientForm(p) {
  const e = {};
  if (!p.first_name?.trim()) e.first_name = 'First name is required';
  if (!p.last_name?.trim()) e.last_name = 'Last name is required';
  if (!p.gender) e.gender = 'Select a gender';
  if (!p.dob) e.dob = 'Date of birth is required';
  else if (p.dob > todayStr()) e.dob = 'Date of birth cannot be in the future';
  if (!/^[6-9]\d{9}$/.test(normPhone(p.phone))) e.phone = 'Enter a valid 10-digit mobile number';
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) e.email = 'Invalid email address';
  if (p.emergency_contact_phone && !/^[6-9]\d{9}$/.test(normPhone(p.emergency_contact_phone))) e.emergency_contact_phone = 'Enter a valid 10-digit mobile number';
  return e;
}

export default function PatientForm({ value, onChange, errors = {} }) {
  const [touched, setTouched] = useState({});
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const err = (k) => errors[k];
  const blur = (k) => () => setTouched({ ...touched, [k]: true });
  void touched;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="First name" required error={err('first_name')}><Input name="first_name" value={value.first_name} onChange={set('first_name')} onBlur={blur('first_name')} error={err('first_name')} /></Field>
      <Field label="Last name" required error={err('last_name')}><Input name="last_name" value={value.last_name} onChange={set('last_name')} error={err('last_name')} /></Field>
      <Field label="Gender" required error={err('gender')}>
        <Select name="gender" value={value.gender} onChange={set('gender')} error={err('gender')}>
          <option value="">Select…</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
        </Select>
      </Field>
      <Field label="Date of birth" required error={err('dob')}><Input name="dob" type="date" max={todayStr()} value={value.dob} onChange={set('dob')} error={err('dob')} /></Field>
      <Field label="Mobile number" required error={err('phone')}><Input name="phone" inputMode="numeric" maxLength={16} placeholder="10-digit mobile" value={value.phone} onChange={set('phone')} error={err('phone')} /></Field>
      <Field label="Email" error={err('email')}><Input name="email" type="email" value={value.email || ''} onChange={set('email')} error={err('email')} /></Field>
      <Field label="Blood group" error={err('blood_group')}>
        <Select name="blood_group" value={value.blood_group || ''} onChange={set('blood_group')}>
          <option value="">Unknown</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}
        </Select>
      </Field>
      <Field label="Known allergies"><Input name="allergies" value={value.allergies || ''} onChange={set('allergies')} placeholder="e.g. Penicillin" /></Field>
      <Field label="Address" className="sm:col-span-2"><Textarea name="address" rows={2} value={value.address || ''} onChange={set('address')} /></Field>
      <Field label="Emergency contact name"><Input name="emergency_contact_name" value={value.emergency_contact_name || ''} onChange={set('emergency_contact_name')} /></Field>
      <Field label="Emergency contact phone" error={err('emergency_contact_phone')}><Input name="emergency_contact_phone" inputMode="numeric" maxLength={16} value={value.emergency_contact_phone || ''} onChange={set('emergency_contact_phone')} error={err('emergency_contact_phone')} /></Field>
    </div>
  );
}
