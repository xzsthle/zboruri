// Free, keyless daily rates that include MDL (the ECB feed does not).
const RATES_URL = 'https://open.er-api.com/v6/latest/EUR';

export async function fetchEurRates(getJson) {
  const data = await getJson(RATES_URL);
  if (data?.result !== 'success' || typeof data.rates !== 'object' || data.rates === null) {
    throw new Error('Exchange-rate API returned an unexpected response');
  }
  return Object.freeze({ ...data.rates, EUR: 1 });
}

/** Converts an amount to EUR, where `rates[currency]` is units of that currency per 1 EUR. */
export function toEur(amount, currency, rates) {
  const rate = rates[currency];
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No exchange rate for ${currency}`);
  }
  return Math.round((amount / rate) * 100) / 100;
}
