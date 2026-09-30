// Fallback art for a destination without a photo: a flat colour block with the airport code.
// The tone is seeded by the airport code, so a destination looks the same on every visit.

import { h } from './dom.js';
import { hashCode } from './format.js';

const TONES = ['clay', 'charcoal', 'fog', 'sand'];

export const artTone = (iata) => TONES[hashCode(iata) % TONES.length];

/** <span class="art-block art--clay"><span class="art-code">SOF</span></span> */
export function colorBlock(iata, className = '') {
  return h('span', { class: `art-block art--${artTone(iata)} ${className}`.trim(), 'aria-hidden': 'true' },
    h('span', { class: 'art-code' }, iata));
}
