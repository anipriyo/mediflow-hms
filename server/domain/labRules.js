// Laboratory order life cycle (FR-32, BR-06) and result flagging (FR-33)
export const LAB_TRANSITIONS = Object.freeze({
  ORDERED: ['SAMPLE_COLLECTED', 'CANCELLED'],
  SAMPLE_COLLECTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
});

export function canTransitionLab(from, to) {
  return (LAB_TRANSITIONS[from] || []).includes(to);
}

/**
 * A numeric result is abnormal when it falls outside [low, high].
 * Returns null when the test has no numeric reference range or the value is not numeric.
 */
export function isAbnormal(value, low, high) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  if (low === null && high === null) return null;
  if (low !== null && low !== undefined && v < low) return true;
  if (high !== null && high !== undefined && v > high) return true;
  return false;
}
