import { TravelpayoutsAuthError } from './travelpayouts.js';

const NO_PLACES = { placeFor: () => null, airlineName: () => null };

/**
 * Cached fares for every airline via Travelpayouts. Optional: without a token it's off, and any failure
 * leaves the run on live Wizz Air data alone. An auth failure is flagged so the job can tell the user.
 */
export async function scanOtherAirlines({ travelpayouts, config, origin, fromIso, toIso, log }) {
  if (!travelpayouts) {
    return { found: [], reference: NO_PLACES, status: { status: 'off' } };
  }
  try {
    const [reference, found] = await Promise.all([
      travelpayouts.fetchReference(),
      travelpayouts.fetchTrips({
        origin,
        fromIso,
        toIso,
        minNights: config.minNights,
        maxNights: config.maxNights,
        directOnly: config.directFlightsOnly,
      }),
    ]);
    log.info(`Other airlines: ${found.length} cached round trips from Travelpayouts`);
    return { found, reference, status: { status: 'ok', trips: found.length } };
  } catch (error) {
    log.warn(`Other airlines skipped — ${error.message}`);
    return {
      found: [],
      reference: NO_PLACES,
      status: { status: 'error', message: error.message, auth: error instanceof TravelpayoutsAuthError },
    };
  }
}
