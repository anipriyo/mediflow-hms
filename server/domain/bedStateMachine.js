// Bed life cycle (FR-41, BR-08)
export const BED_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  OCCUPIED: 'OCCUPIED',
  CLEANING: 'CLEANING',
  MAINTENANCE: 'MAINTENANCE',
});

export const BED_TRANSITIONS = Object.freeze({
  AVAILABLE: ['RESERVED', 'OCCUPIED', 'MAINTENANCE'],
  RESERVED: ['OCCUPIED', 'AVAILABLE'],
  OCCUPIED: ['CLEANING'],
  CLEANING: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE'],
});

export function canTransitionBed(from, to) {
  return (BED_TRANSITIONS[from] || []).includes(to);
}

/** Transitions a user may trigger manually from the bed board (OCCUPIED is driven by admissions). */
export const MANUAL_BED_TRANSITIONS = Object.freeze({
  AVAILABLE: ['RESERVED', 'MAINTENANCE'],
  RESERVED: ['AVAILABLE'],
  OCCUPIED: [],
  CLEANING: ['AVAILABLE', 'MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE'],
});

export function canManuallyTransitionBed(from, to) {
  return (MANUAL_BED_TRANSITIONS[from] || []).includes(to);
}
