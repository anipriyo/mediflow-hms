// Smart queue rules (FR-21 … FR-25, BR-05)

/** URGENT first, then by check-in time, then by token. */
export function sortQueue(entries) {
  return [...entries].sort((a, b) => {
    const pa = a.priority === 'URGENT' ? 0 : 1;
    const pb = b.priority === 'URGENT' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.checked_in_at).getTime();
    const tb = new Date(b.checked_in_at).getTime();
    if (ta !== tb) return ta - tb;
    return (a.token_no || 0) - (b.token_no || 0);
  });
}

/** Next token number for a doctor on a day: max(existing) + 1. */
export function nextToken(existingTokens) {
  const nums = existingTokens.filter((t) => Number.isInteger(t));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/** Remaining minutes of an in-progress consultation (never below 1). */
export function remainingMinutes(avgMinutes, startedAt, now) {
  if (!startedAt) return 0;
  const elapsed = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60000);
  return Math.max(avgMinutes - elapsed, 1);
}

/**
 * Builds the waiting list with position and estimated wait (FR-23).
 * ETA = patientsAhead × avgMinutes + remaining time of the current consultation.
 */
export function estimateWaits(waiting, { avgMinutes, inProgressStartedAt = null, now }) {
  const sorted = sortQueue(waiting);
  const base = remainingMinutes(avgMinutes, inProgressStartedAt, now);
  return sorted.map((entry, index) => ({
    ...entry,
    position: index + 1,
    patientsAhead: index,
    etaMinutes: index * avgMinutes + base,
  }));
}

export function formatToken(doctorCode, tokenNo) {
  return `${doctorCode}-${String(tokenNo).padStart(3, '0')}`;
}
