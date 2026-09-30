// Flight details derived for a trip: airports, estimated durations and arrivals, and the booking link.

import { distanceKm, estimateArrival, estimateMinutes, fmtDuration } from './geo.js';
import { safeBookingUrl } from './format.js';

/** One direction. `estimated`: the flight time comes from distance (direct Wizz Air), not the airline's itinerary. */
function leg({ date, time, from, to, minutes, stops, estimated }) {
  return {
    date,
    from,
    to,
    dep: time,
    arr: estimateArrival({ date, time, fromZone: from.timeZone, toZone: to.timeZone, minutes }),
    minutes,
    stops,
    estimated,
  };
}

export function flightInfo(trip, site, engine) {
  const dest = engine.destinations.get(trip.iata);
  const km = distanceKm(site.origin, dest);
  const minutes = estimateMinutes(km);
  return {
    dest,
    km,
    minutes,
    out: leg({
      date: trip.outDate, time: trip.outTime, from: site.origin, to: dest,
      minutes: trip.outMinutes ?? minutes, stops: trip.outStops ?? trip.stops ?? 0, estimated: trip.outMinutes == null,
    }),
    back: leg({
      date: trip.backDate, time: trip.backTime, from: dest, to: site.origin,
      minutes: trip.backMinutes ?? minutes, stops: trip.backStops ?? trip.stops ?? 0, estimated: trip.backMinutes == null,
    }),
  };
}

/** Live Wizz Air trips deep-link to Wizz Air's own flight selection with the traveller count filled in. */
export function bookingLink(trip, site, adults) {
  if (trip.source === 'wizz') {
    return `https://www.wizzair.com/en-gb/booking/select-flight/${site.origin.iata}/${trip.iata}/${trip.outDate}/${trip.backDate}/${adults}/0/0/null`;
  }
  return safeBookingUrl(trip.bookingUrl);
}

export const bookLabel = (trip) => (trip.source === 'travelpayouts' ? 'Check price on Aviasales' : `Book on ${trip.airline}`);

/** "Direct", "1 stop", "2 stops" */
export const stopsLabel = (stops) => (stops > 0 ? `${stops} stop${stops === 1 ? '' : 's'}` : 'Direct');

// "≈" marks times estimated from distance; the airlines' own itinerary times are shown as they are.
export const durationLabel = (leg) => (leg.minutes == null ? null : `${leg.estimated ? '≈ ' : ''}${fmtDuration(leg.minutes)}`);
export const arrivalLabel = (leg) => (leg.arr ? `${leg.estimated ? '≈ ' : ''}${leg.arr.time}` : '—');

/** Two-letter badge for the airline column, e.g. "W6". */
export const airlineBadge = (trip) => (trip.airlineCode || trip.airline.slice(0, 2)).toUpperCase();
