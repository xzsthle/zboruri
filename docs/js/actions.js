// Deal actions: share a link, add both flights to a calendar (.ics), and the little confirmation toast.

import { $, icon } from './dom.js';
import { fmtDay } from './format.js';

let toastTimer = null;

export function toast(message) {
  const el = $('toast');
  el.replaceChildren(icon('i-check'), message);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function dealLink(iata) {
  const url = new URL(location.href);
  url.searchParams.set('dest', iata);
  return url.href;
}

export async function shareDeal({ dest, trip, money }) {
  const url = dealLink(dest.iata);
  const text = `${dest.name}: ${money.format(trip.totalEur)} return, ${fmtDay(trip.outDate)} → ${fmtDay(trip.backDate)}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Zboruri flight deal', text, url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // the viewer closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} — ${url}`);
    toast('Deal link copied');
  } catch {
    toast('Couldn’t copy the link — copy it from the address bar');
  }
}

// ---------- .ics ----------

const pad = (n) => String(n).padStart(2, '0');
const escapeIcs = (text) => String(text).replace(/[\\;,]/g, (ch) => `\\${ch}`).replace(/\n/g, '\\n');
const utcStamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const floating = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
};

/** Local ("floating") departure time for 2 hours, or an all-day event when the time is unknown. */
function eventWindow(date, times) {
  const [year, month, day] = date.split('-').map(Number);
  if (!times?.length) {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    return [`DTSTART;VALUE=DATE:${date.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${utcStamp(next).slice(0, 8)}`];
  }
  const [hours, minutes] = times[0].split(':').map(Number);
  const start = Date.UTC(year, month - 1, day, hours, minutes);
  return [`DTSTART:${floating(start)}`, `DTEND:${floating(start + 2 * 3_600_000)}`];
}

function vevent({ uid, date, times, summary, description }) {
  return ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${utcStamp(new Date())}`, ...eventWindow(date, times),
    `SUMMARY:${escapeIcs(summary)}`, `DESCRIPTION:${escapeIcs(description)}`, 'END:VEVENT'];
}

export function buildIcs({ dest, trip, origin, priceText }) {
  const details = `Return trip found by Zboruri for ${priceText} (${trip.airline}). ${trip.bookingUrl ?? ''}`.trim();
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zboruri//Flight deals//EN', 'CALSCALE:GREGORIAN',
    ...vevent({ uid: `${trip.outDate}-${origin.iata}-${dest.iata}@zboruri`, date: trip.outDate, times: trip.outTimes,
      summary: `✈ ${origin.iata} → ${dest.iata} · ${dest.name}`, description: details }),
    ...vevent({ uid: `${trip.backDate}-${dest.iata}-${origin.iata}@zboruri`, date: trip.backDate, times: trip.backTimes,
      summary: `✈ ${dest.iata} → ${origin.iata} · back home (local time)`, description: details }),
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs({ dest, trip, origin, money }) {
  const ics = buildIcs({ dest, trip, origin, priceText: money.format(trip.totalEur) });
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `zboruri-${dest.iata.toLowerCase()}-${trip.outDate}.ics` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Calendar file downloaded');
}
