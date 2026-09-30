// Destination photos (from Pexels, fetched by the scanner). Only images.pexels.com URLs are ever used.

import { h } from './dom.js';

const IMAGE_HOST = 'https://images.pexels.com/';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const isSafe = (photo) => typeof photo?.base === 'string' && photo.base.startsWith(IMAGE_HOST);

/** Pexels resizes and crops on the fly from query parameters. */
export const photoUrl = (photo, width, height) =>
  `${photo.base}?auto=compress&cs=tinysrgb&fit=crop&w=${width}&h=${height}`;

// Rendition widths as multiples of the layout size: up to 3× for high-density screens.
const SCALES = [1, 1.5, 2, 3];

/**
 * A responsive, lazily loaded <img> with the photo's average colour as a placeholder,
 * or null when there is no usable photo (callers fall back to a colour block, see art.js).
 * `sizes` is how wide the image is drawn (default: `width` px), so the browser picks a sharp enough rendition.
 */
export function photoImg(photo, { width, height, sizes = `${width}px`, className = '', eager = false, alt }) {
  if (!isSafe(photo)) return null;
  return h('img', {
    class: className,
    src: photoUrl(photo, width, height),
    // Pexels resizes the original on the fly.
    srcset: SCALES.map((x) => `${photoUrl(photo, Math.round(width * x), Math.round(height * x))} ${Math.round(width * x)}w`).join(', '),
    sizes,
    width: String(width),
    height: String(height),
    alt: alt ?? photo.alt ?? '',
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    // The photo's average colour shows while it loads (read by `img { background-color: var(--ph) }`).
    style: HEX_COLOR.test(photo.avgColor ?? '') ? { '--ph': photo.avgColor } : null,
  });
}
