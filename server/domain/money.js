/** Round to 2 decimals using paise arithmetic to avoid floating point drift. */
export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function sum(values) {
  return round2(values.reduce((acc, v) => acc + Math.round(Number(v) * 100), 0) / 100);
}
