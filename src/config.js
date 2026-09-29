import { readFile } from 'node:fs/promises';

const isPositiveInt = (v) => Number.isInteger(v) && v >= 1;

const RULES = {
  origin: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v),
  maxReturnPriceEur: (v) => Number.isFinite(v) && v > 0,
  minNights: isPositiveInt,
  maxNights: isPositiveInt,
  daysAhead: (v) => isPositiveInt(v) && v <= 365,
  maxDealsPerDestination: isPositiveInt,
  requestDelayMs: (v) => Number.isInteger(v) && v >= 0,
};

export function validateConfig(raw) {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Invalid config.json: expected a JSON object');
  }
  const errors = Object.entries(RULES)
    .filter(([key, isValid]) => !isValid(raw[key]))
    .map(([key]) => `"${key}" is missing or invalid`);
  if (errors.length === 0 && raw.minNights > raw.maxNights) {
    errors.push('"minNights" must be <= "maxNights"');
  }
  if (errors.length > 0) {
    throw new Error(`Invalid config.json: ${errors.join('; ')}`);
  }
  return Object.freeze({ ...raw });
}

export async function loadConfig(path) {
  return validateConfig(JSON.parse(await readFile(path, 'utf8')));
}
