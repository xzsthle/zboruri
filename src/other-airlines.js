import { TravelpayoutsAuthError } from './travelpayouts.js';

export const NO_REFERENCE = { placeFor: () => null, airlineName: () => null, airportInfo: () => ({}) };

/**
 * Public reference data (places, airport names, time zones). Optional: without it destinations simply
 * lack airport names and other airlines' new destinations can't be placed.
 */
export async function loadReference({ reference, log }) {
  if (!reference) return NO_REFERENCE;
  try {
    return await reference.fetchReference();
  } catch (error) {
    log.warn(`Reference data unavailable — ${error.message}`);
    return NO_REFERENCE;
  }
}

/**
 * Cached fares for every airline via Travelpayouts. Optional: without a token it's off, and any failure
 * leaves the run on live Wizz Air data alone. An auth failure is flagged so the job can tell the user.
 */
export async function scanOtherAirlines({ travelpayouts, config, origin, fromIso, toIso, log }) {
  if (!travelpayouts) return { found: [], status: { status: 'off' } };
  try {
    const found = await travelpayouts.fetchTrips({
      origin,
      fromIso,
      toIso,
      minNights: config.minNights,
      maxNights: config.maxNights,
      directOnly: config.directFlightsOnly,
    });
    log.info(`Other airlines: ${found.length} cached round trips from Travelpayouts`);
    return { found, status: { status: 'ok', trips: found.length } };
  } catch (error) {
    log.warn(`Other airlines skipped — ${error.message}`);
    return { found: [], status: { status: 'error', message: error.message, auth: error instanceof TravelpayoutsAuthError } };
  }
}
