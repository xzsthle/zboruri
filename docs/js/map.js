// Route map: curved routes from Chișinău to every destination, projected from real coordinates.

import { $, h, s } from './dom.js';
import { fmtDay, ORIGIN_NAMES } from './format.js';

const WIDTH = 1000;
const HEIGHT = 560;
const MARGIN_DEG = 3;
const LABELLED_DEALS = 7;

const hasCoords = (place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lon);

/** Equirectangular projection fitted to the destinations, with longitude squeezed by cos(latitude). */
function projection(places) {
  const lats = places.map((p) => p.lat);
  const lons = places.map((p) => p.lon);
  const minLat = Math.min(...lats) - MARGIN_DEG;
  const maxLat = Math.max(...lats) + MARGIN_DEG;
  const minLon = Math.min(...lons) - MARGIN_DEG;
  const maxLon = Math.max(...lons) + MARGIN_DEG;
  const squeeze = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const scale = Math.min(WIDTH / ((maxLon - minLon) * squeeze), HEIGHT / (maxLat - minLat));
  const offsetX = (WIDTH - (maxLon - minLon) * squeeze * scale) / 2;
  const offsetY = (HEIGHT - (maxLat - minLat) * scale) / 2;
  const project = ({ lat, lon }) => [offsetX + (lon - minLon) * squeeze * scale, offsetY + (maxLat - lat) * scale];
  return { project, bounds: { minLat, maxLat, minLon, maxLon } };
}

function graticule({ project, bounds }) {
  const lons = [];
  const lats = [];
  for (let lon = Math.ceil(bounds.minLon / 10) * 10; lon <= bounds.maxLon; lon += 10) lons.push(lon);
  for (let lat = Math.ceil(bounds.minLat / 10) * 10; lat <= bounds.maxLat; lat += 10) lats.push(lat);
  const vertical = lons.map((lon) => {
    const [x1, y1] = project({ lat: bounds.maxLat, lon });
    const [x2, y2] = project({ lat: bounds.minLat, lon });
    return `M${x1.toFixed(0)} ${y1.toFixed(0)} L${x2.toFixed(0)} ${y2.toFixed(0)}`;
  });
  const horizontal = lats.map((lat) => {
    const [x1, y1] = project({ lat, lon: bounds.minLon });
    const [x2, y2] = project({ lat, lon: bounds.maxLon });
    return `M${x1.toFixed(0)} ${y1.toFixed(0)} L${x2.toFixed(0)} ${y2.toFixed(0)}`;
  });
  return s('path', { class: 'map-grid', d: [...vertical, ...horizontal].join(' ') });
}

/** A gentle arc that always bows upwards, like a flight path on a route map. */
function arcPath([ox, oy], [dx, dy]) {
  const [mx, my] = [(ox + dx) / 2, (oy + dy) / 2];
  const length = Math.hypot(dx - ox, dy - oy) || 1;
  // Perpendicular to the route, flipped so it points up the screen.
  const sign = dx >= ox ? -1 : 1;
  const [nx, ny] = [(sign * -(dy - oy)) / length, (sign * (dx - ox)) / length];
  const bend = length * 0.18;
  return `M${ox.toFixed(1)} ${oy.toFixed(1)} Q${(mx + nx * bend).toFixed(1)} ${(my + ny * bend).toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)}`;
}

function tooltip(dest, deal, money) {
  const trip = deal ?? dest.cheapest;
  return h('div', { class: 'map-tip' },
    h('strong', {}, `${dest.name} · ${dest.iata}`),
    trip
      ? h('span', {}, `${deal ? 'Deal' : 'From'} ${money.format(trip.totalEur)} return · ${fmtDay(trip.outDate)}`)
      : h('span', {}, 'No fares in range'));
}

function destinationNode({ dest, point, deal, isSelected, money, canvas, onSelect }) {
  const [x, y] = point;
  const showTip = () => {
    canvas.querySelector('.map-tip')?.remove();
    const tip = tooltip(dest, deal, money);
    tip.style.setProperty('left', `${(x / WIDTH) * 100}%`);
    tip.style.setProperty('top', `${(y / HEIGHT) * 100}%`);
    canvas.append(tip);
  };
  const hideTip = () => canvas.querySelector('.map-tip')?.remove();
  const classes = ['map-dest', deal ? 'is-deal' : '', isSelected ? 'is-selected' : ''].filter(Boolean).join(' ');
  return s('g', {
    class: classes,
    tabindex: '0',
    role: 'button',
    'aria-label': `${dest.name}${deal ? `, deal ${money.format(deal.totalEur)} return` : ''}`,
    onclick: () => onSelect(dest.iata),
    onkeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(dest.iata); } },
    onpointerenter: showTip,
    onpointerleave: hideTip,
    onfocus: showTip,
    onblur: hideTip,
  },
    deal && s('circle', { class: 'map-halo', cx: x.toFixed(1), cy: y.toFixed(1), r: '13' }),
    s('circle', { class: 'map-dot', cx: x.toFixed(1), cy: y.toFixed(1), r: deal ? '5.5' : '4' }));
}

function label(dest, [x, y], deal, money) {
  return s('text', { class: 'map-label', x: (x + 10).toFixed(1), y: (y - 9).toFixed(1) },
    dest.iata, s('tspan', { class: 'map-label-price', dx: '5' }, money.format(deal.totalEur)));
}

/** `bestDeals` maps destination code → cheapest deal under the current filters. */
export function renderMap({ data, bestDeals, selectedIata, money, onSelect }) {
  const canvas = $('map-canvas');
  const places = data.destinations.filter(hasCoords);
  if (!hasCoords(data.origin) || places.length === 0) {
    canvas.replaceChildren(h('p', { class: 'section-meta' }, 'The map appears after the next scan.'));
    return;
  }
  const proj = projection([data.origin, ...places]);
  const origin = proj.project(data.origin);
  const ordered = places.toSorted((a, b) => Number(bestDeals.has(a.iata)) - Number(bestDeals.has(b.iata)) || Number(a.iata === selectedIata) - Number(b.iata === selectedIata));
  const labelled = new Set([...bestDeals.entries()].sort(([, a], [, b]) => a.totalEur - b.totalEur).slice(0, LABELLED_DEALS).map(([iata]) => iata));

  const arcs = ordered.map((dest) => s('path', {
    class: ['map-arc', bestDeals.has(dest.iata) ? 'is-deal' : '', dest.iata === selectedIata ? 'is-selected' : ''].filter(Boolean).join(' '),
    d: arcPath(origin, proj.project(dest)),
  }));
  const nodes = ordered.map((dest) => destinationNode({
    dest, point: proj.project(dest), deal: bestDeals.get(dest.iata), isSelected: dest.iata === selectedIata, money, canvas, onSelect,
  }));
  const labels = ordered.filter((dest) => labelled.has(dest.iata)).map((dest) => label(dest, proj.project(dest), bestDeals.get(dest.iata), money));

  canvas.replaceChildren(s('svg', { class: 'map-svg', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: 'group', 'aria-label': 'Route map from Chișinău' },
    s('defs', {}, s('linearGradient', { id: 'arc-deal', x1: '0', y1: '0', x2: '1', y2: '0' },
      s('stop', { offset: '0', 'stop-color': '#ff3d7f' }), s('stop', { offset: '1', 'stop-color': '#ffd84a' }))),
    graticule(proj),
    arcs,
    nodes,
    labels,
    s('circle', { class: 'map-origin-ring', cx: origin[0].toFixed(1), cy: origin[1].toFixed(1), r: '9' }),
    s('circle', { class: 'map-origin-dot', cx: origin[0].toFixed(1), cy: origin[1].toFixed(1), r: '7' }),
    s('text', { class: 'map-origin-label', x: (origin[0] + 14).toFixed(1), y: (origin[1] + 5).toFixed(1) }, ORIGIN_NAMES[data.origin.iata] ?? data.origin.name)));
}
