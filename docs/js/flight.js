// Flight details derived for a trip: airports, estimated durations and arrivals, and the booking link.

import { distanceKm, estimateArrival, estimateMinutes } from './geo.js';
import { safeBookingUrl } from './format.js';

function leg({ date, time, from, to, minutes }) {
  return {
    date,
    from,
    to,
    dep: time,
    arr: estimateArrival({ date, time, fromZone: from.timeZone, toZone: to.timeZone, minutes }),
    minutes,
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
    out: leg({ date: trip.outDate, time: trip.outTime, from: site.origin, to: dest, minutes }),
    back: leg({ date: trip.backDate, time: trip.backTime, from: dest, to: site.origin, minutes }),
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

/** Two-letter badge for the airline column, e.g. "W6". */
export const airlineBadge = (trip) => (trip.airlineCode || trip.airline.slice(0, 2)).toUpperCase();
