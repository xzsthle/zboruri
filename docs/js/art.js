// Generated artwork: vivid card themes and little SVG landscapes that stand in for destination photos.
// Everything is seeded by the airport code, so a destination keeps the same look on every visit.

import { s } from './dom.js';
import { hashCode } from './format.js';

// `on` is the text colour that stays readable on that gradient.
const CARD_THEMES = [
  { bg: 'linear-gradient(155deg, #d9f74a 0%, #25c29c 100%)', on: '#0d1a2b', glow: 'rgb(37 194 156 / 0.55)' },
  { bg: 'linear-gradient(155deg, #ff7b54 0%, #d3123c 100%)', on: '#ffffff', glow: 'rgb(211 18 60 / 0.5)' },
  { bg: 'linear-gradient(155deg, #5d86ff 0%, #1f4ad6 100%)', on: '#ffffff', glow: 'rgb(31 74 214 / 0.5)' },
  { bg: 'linear-gradient(155deg, #ffe066 0%, #ff8a1f 100%)', on: '#1f1503', glow: 'rgb(255 138 31 / 0.5)' },
  { bg: 'linear-gradient(155deg, #a98bff 0%, #da2f8a 100%)', on: '#ffffff', glow: 'rgb(218 47 138 / 0.5)' },
  { bg: 'linear-gradient(155deg, #4be3c1 0%, #0b76c9 100%)', on: '#ffffff', glow: 'rgb(11 118 201 / 0.5)' },
];

export const cardTheme = (iata) => CARD_THEMES[hashCode(iata) % CARD_THEMES.length];

const SCENES = [
  { sky: ['#ffe0b5', '#f28c5c'], sun: '#fff6dc', hills: ['#e6a06a', '#c46d40', '#8d4428'] }, // desert dusk
  { sky: ['#b4defe', '#4f9ce0'], sun: '#ffffff', hills: ['#63a7d4', '#2f78ab', '#1a4d76'] }, // coast
  { sky: ['#e1efff', '#9dc1ea'], sun: '#ffffff', hills: ['#bccbdd', '#8098b6', '#4c6487'] }, // alpine
  { sky: ['#ffc6b3', '#9a68d6'], sun: '#ffe9cf', hills: ['#8a5abb', '#633a91', '#3f2262'] }, // violet dusk
  { sky: ['#cff7e9', '#6fd2bf'], sun: '#fffbe8', hills: ['#8ccf84', '#57a45f', '#327644'] }, // meadow
  { sky: ['#5363b8', '#1c2461'], sun: '#f8f2d4', hills: ['#3a469c', '#28317c', '#171d50'] }, // night
];

/** Deterministic PRNG (mulberry32) so the same seed always draws the same hills. */
function seededRandom(seed) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hillPath(random, baseY, amplitude) {
  const points = Array.from({ length: 5 }, (_, i) => [i * 80, baseY - random() * amplitude]);
  const curves = points.slice(1).map(([x, y], i) => {
    const [px, py] = points[i];
    return `C${px + 40} ${py.toFixed(1)} ${x - 40} ${y.toFixed(1)} ${x} ${y.toFixed(1)}`;
  });
  return `M0 ${points[0][1].toFixed(1)} ${curves.join(' ')} L320 200 L0 200 Z`;
}

// The same destination can be drawn on several (possibly hidden) views; a gradient id that points
// into a hidden copy doesn't paint, so every drawing gets its own id.
let drawings = 0;

/** A sky, a sun and three layers of hills, sized to cover its container. */
export function landscape(iata) {
  const seed = hashCode(iata);
  const random = seededRandom(seed);
  const scene = SCENES[seed % SCENES.length];
  drawings += 1;
  const gradientId = `sky-${iata}-${drawings}`;
  const layers = [
    [120, 44],
    [148, 34],
    [174, 24],
  ];

  return s('svg', { class: 'route-art', viewBox: '0 0 320 200', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' },
    s('defs', {},
      s('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' },
        s('stop', { offset: '0', 'stop-color': scene.sky[0] }),
        s('stop', { offset: '1', 'stop-color': scene.sky[1] }),
      ),
    ),
    s('rect', { width: '320', height: '200', fill: `url(#${gradientId})` }),
    // Low in the sky so it rises from behind the hills instead of sitting on the card's text.
    s('circle', { cx: String(200 + random() * 80), cy: String(96 + random() * 16), r: String(14 + random() * 8), fill: scene.sun, opacity: '0.95' }),
    layers.map(([baseY, amplitude], i) => s('path', { d: hillPath(random, baseY, amplitude), fill: scene.hills[i] })),
  );
}
