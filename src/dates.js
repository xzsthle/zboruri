const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(iso) {
  if (typeof iso !== 'string' || !ISO_DATE.test(iso)) {
    throw new Error(`Invalid date "${iso}", expected YYYY-MM-DD`);
  }
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

export function toIsoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  return toIsoDate(parseIsoDate(iso) + days * DAY_MS);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseIsoDate(toIso) - parseIsoDate(fromIso)) / DAY_MS);
}

/** Splits `totalDays` starting at `start` into consecutive inclusive windows of at most `maxSpan` days. */
export function dateWindows(start, totalDays, maxSpan) {
  const count = Math.ceil(totalDays / maxSpan);
  return Array.from({ length: count }, (_, i) => {
    const offset = i * maxSpan;
    const span = Math.min(maxSpan, totalDays - offset);
    return { from: addDays(start, offset), to: addDays(start, offset + span - 1) };
  });
}
