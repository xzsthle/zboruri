// Distances, estimated flight times and local-time conversion between airport time zones.
// Wizz Air's public data has departure times but not arrival times, so arrivals are estimated.

const EARTH_RADIUS_KM = 6371;
const CRUISE_KMH = 750;
const TAXI_CLIMB_MIN = 30;

const radians = (deg) => (deg * Math.PI) / 180;

export function distanceKm(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return null;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)));
}

/** Block time estimate: cruise speed plus taxi/climb, rounded to 5 minutes. */
export const estimateMinutes = (km) => (km == null ? null : Math.round((km / CRUISE_KMH * 60 + TAXI_CLIMB_MIN) / 5) * 5);

export const fmtDuration = (minutes) =>
  minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

function zoneParts(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function offsetMinutes(utcMs, timeZone) {
  const p = zoneParts(utcMs, timeZone);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utcMs) / 60_000);
}

/** Local wall time in a zone → UTC milliseconds (two passes to settle DST edges). */
function zonedToUtc(dateIso, time, timeZone) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - offsetMinutes(wall, timeZone) * 60_000;
  return wall - offsetMinutes(first, timeZone) * 60_000;
}

const pad = (n) => String(n).padStart(2, '0');

/** Estimated local arrival { time, nextDay } or null when times or zones are unknown. */
export function estimateArrival({ date, time, fromZone, toZone, minutes }) {
  if (!time || !fromZone || !toZone || minutes == null) return null;
  try {
    const arrivalUtc = zonedToUtc(date, time, fromZone) + minutes * 60_000;
    const local = zoneParts(arrivalUtc, toZone);
    const arrivalDate = `${local.year}-${pad(local.month)}-${pad(local.day)}`;
    return { time: `${pad(local.hour)}:${pad(local.minute)}`, nextDay: arrivalDate > date };
  } catch {
    return null; // unknown time zone name
  }
}

/** Current local time in a zone, e.g. "14:05". */
export function nowIn(timeZone) {
  try {
    const p = zoneParts(Date.now(), timeZone);
    return `${pad(p.hour)}:${pad(p.minute)}`;
  } catch {
    return null;
  }
}

/** Hours between two zones right now, e.g. -1 when the destination is an hour behind. */
export function hoursBetween(fromZone, toZone) {
  try {
    const now = Date.now();
    return (offsetMinutes(now, toZone) - offsetMinutes(now, fromZone)) / 60;
  } catch {
    return null;
  }
}
