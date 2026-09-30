// Destination photos (from Pexels, fetched by the scanner). Only images.pexels.com URLs are ever used.

import { h } from './dom.js';

const IMAGE_HOST = 'https://images.pexels.com/';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const isSafe = (photo) => typeof photo?.base === 'string' && photo.base.startsWith(IMAGE_HOST);

/** Pexels resizes and crops on the fly from query parameters. */
export const photoUrl = (photo, width, height) =>
  `${photo.base}?auto=compress&cs=tinysrgb&fit=crop&w=${width}&h=${height}`;

/**
 * A responsive, lazily loaded <img> with the photo's average colour as a placeholder,
 * or null when there is no usable photo (callers fall back to a colour block, see art.js).
 */
export function photoImg(photo, { width, height, className = '', eager = false, alt }) {
  if (!isSafe(photo)) return null;
  return h('img', {
    class: className,
    src: photoUrl(photo, width, height),
    srcset: `${photoUrl(photo, width, height)} 1x, ${photoUrl(photo, width * 2, height * 2)} 2x`,
    width: String(width),
    height: String(height),
    alt: alt ?? photo.alt ?? '',
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    // The photo's average colour shows while it loads (read by `img { background-color: var(--ph) }`).
    style: HEX_COLOR.test(photo.avgColor ?? '') ? { '--ph': photo.avgColor } : null,
  });
}

/** "Photo: Name / Pexels" credit, linked as the Pexels API guidelines ask. */
export function photoCredit(photo, className = 'photo-credit') {
  if (!isSafe(photo)) return null;
  const href = photo.pageUrl ?? 'https://www.pexels.com/';
  return h('a', { class: className, href, target: '_blank', rel: 'noopener noreferrer' }, `Photo: ${photo.photographer} / Pexels`);
}
