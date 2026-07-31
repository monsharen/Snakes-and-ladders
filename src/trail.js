/*
 * trail.js — the board.
 *
 * Instead of a 10x10 grid, the board is a switchback trail: 61 waypoints
 * laid out as a serpentine that climbs a mountain from a valley trailhead
 * to the summit. Geometry is deterministic (seeded jitter) so every player
 * sees the same trail, but it never looks like a grid.
 */

/* ---------- deterministic pseudo-randomness ---------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- dimensions (SVG user units) ---------- */

export const COLS = 4;
export const ROWS = 15;
export const SUMMIT = COLS * ROWS + 1; // 61 — the last waypoint
export const TRAIL_LENGTH = SUMMIT;

const W = 100;
const ROW_H = 35;
const PAD_TOP = 84;
const PAD_BOTTOM = 54;
const H = PAD_TOP + ROWS * ROW_H + PAD_BOTTOM;

const BASE_ALT = 820;
const SUMMIT_ALT = 3240;

/* ---------- terrain bands ---------- */

export const BANDS = [
  { key: 'vallee', name: 'La Vallée', rows: [0, 2], tint: '#3E5A28', note: 'Farm tracks and hay meadows' },
  { key: 'foret', name: 'La Forêt', rows: [3, 5], tint: '#274634', note: 'Spruce, then larch' },
  { key: 'alpage', name: "L'Alpage", rows: [6, 8], tint: '#43563A', note: 'High pasture, bells in the mist' },
  { key: 'pierrier', name: 'Le Pierrier', rows: [9, 11], tint: '#4A4E55', note: 'Scree, boulders, no shade' },
  { key: 'glacier', name: 'Le Glacier', rows: [12, 14], tint: '#5E7B92', note: 'Névé and blue ice' },
  { key: 'sommet', name: 'Le Sommet', rows: [15, 15], tint: '#8AA6BC', note: '3 240 m' },
];

/* ---------- the things that move you ---------- */

// Ascents: shortcuts a hiker would actually take.
const ASCENTS = [
  { from: 3, to: 17, name: 'Shepherds’ path', blurb: 'An unmarked line through the beech — steep, but it cuts out the whole first spur.' },
  { from: 8, to: 24, name: 'Switchback shortcut', blurb: 'The direct line between the hairpins. Quick, and the knees send their invoice later.' },
  { from: 14, to: 31, name: 'Via ferrata', blurb: 'Cable, rungs, and four hundred metres of exposure. Clipped in the whole way.' },
  { from: 22, to: 38, name: 'Last cable car', blurb: 'The 16:40 to the mid-station, caught with a minute to spare and no dignity left.' },
  { from: 33, to: 49, name: 'The easy ridge', blurb: 'Dry rock, good holds, and a breeze that finally kills the horseflies.' },
  { from: 42, to: 55, name: 'Glacier traverse', blurb: 'Roped up on firm névé. The crevasses are all still bridged this early.' },
  { from: 47, to: 58, name: 'Fixed ropes', blurb: 'Someone rigged the headwall last season. Eleven minutes to the top of it.' },
];

// Descents: the mountain's usual repertoire.
const DESCENTS = [
  { from: 19, to: 5, name: 'Swollen ford', blurb: 'The meltwater is thigh-deep and pushing hard. The nearest bridge is a long way downstream.' },
  { from: 27, to: 11, name: 'Rockfall', blurb: 'A crack, then the whole gully lets go. Nothing for it but to retreat below the runout and wait.' },
  { from: 36, to: 20, name: 'Lost the waymarks', blurb: 'Forty minutes of contouring before anyone admits the paint stopped long ago.' },
  { from: 44, to: 26, name: 'Twisted ankle', blurb: 'A loose block rolls underfoot. Nothing broken — but the day has changed shape.' },
  { from: 51, to: 35, name: 'Whiteout', blurb: 'Cloud swallows the slope. No horizon, no shadow, no way to tell which way is down.' },
  { from: 54, to: 39, name: 'Crevasse', blurb: 'The snow bridge goes. Everyone comes out of it fine, and considerably lower.' },
  { from: 60, to: 45, name: 'Storm off the col', blurb: 'Ice on the wind at four in the afternoon. Turning around is the grown-up decision.' },
];

const REFUGES = {
  7: 'Refuge du Pré',
  25: 'Cabane des Mélèzes',
  41: 'Refuge de la Moraine',
  53: 'Bivouac du Col',
};

const VIEWPOINTS = {
  12: 'The valley opens up below — three villages and a lake the colour of slate.',
  30: 'The whole range is visible from here, and the weather coming in behind it.',
  46: 'Above the cloud now. It lies flat underneath like a second country.',
};

/* ---------- geometry ---------- */

function nodePosition(n, rng) {
  if (n === 0) return { x: 50, y: H - 24 }; // trailhead
  if (n === SUMMIT) return { x: 50, y: PAD_TOP - 34 };

  const i = n - 1;
  const row = Math.floor(i / COLS);
  let col = i % COLS;
  if (row % 2 === 1) col = COLS - 1 - col; // serpentine

  const bx = 15 + col * ((W - 30) / (COLS - 1));
  const by = H - PAD_BOTTOM - (row + 0.5) * ROW_H;

  const jx = (rng() - 0.5) * 9;
  const jy = (rng() - 0.5) * 10;

  return { x: Math.min(92, Math.max(8, bx + jx)), y: by + jy };
}

function bandForRow(row) {
  return BANDS.find((b) => row >= b.rows[0] && row <= b.rows[1]) || BANDS[BANDS.length - 1];
}

function altitude(n) {
  const t = n <= 0 ? 0 : (n - 1) / (SUMMIT - 1);
  return Math.round((BASE_ALT + t * (SUMMIT_ALT - BASE_ALT)) / 10) * 10;
}

/* ---------- curve helpers ---------- */

// Catmull-Rom through the waypoints, emitted as cubic beziers.
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function linkPath(a, b, bow) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular offset, scaled by length but capped so it stays on the map
  const amount = Math.min(30, 6 + len * 0.16) * bow;
  let cx = mx + (-dy / len) * amount;
  let cy = my + (dx / len) * amount;
  cx = Math.min(96, Math.max(4, cx));
  return { d: `M ${a.x} ${a.y} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x} ${b.y}`, cx, cy };
}

/* ---------- decorative terrain ---------- */

function buildDecor(rng) {
  const items = [];
  const top = (row) => H - PAD_BOTTOM - (row + 1) * ROW_H;
  const bottom = (row) => H - PAD_BOTTOM - row * ROW_H;

  for (const band of BANDS) {
    if (band.key === 'sommet') continue;
    const y0 = top(band.rows[1]);
    const y1 = bottom(band.rows[0]);
    const count = band.key === 'foret' ? 34 : band.key === 'pierrier' ? 30 : 22;
    for (let i = 0; i < count; i++) {
      const x = 2 + rng() * 96;
      const y = y0 + rng() * (y1 - y0);
      const s = 0.6 + rng() * 0.9;
      items.push({ kind: band.key, x, y, s, r: rng() });
    }
  }
  return items;
}

/* ---------- contour lines ----------
   One shared relief function, offset vertically. Real contours never cross,
   and neither do these — which is the whole reason the map reads as terrain
   and not as wallpaper. */

function relief(x) {
  return (
    5.5 * Math.sin(x * 0.055 + 0.4) +
    2.6 * Math.sin(x * 0.129 + 1.9) +
    1.4 * Math.sin(x * 0.241 + 2.6)
  );
}

function buildContours(rng) {
  const lines = [];
  const spacing = 17;
  let i = 0;
  for (let y = -6; y < H + 12; y += spacing + (rng() - 0.5) * 5) {
    // higher up the map, the ground steepens: contours crowd and flatten
    const t = 1 - y / H;
    const squash = 0.55 + t * 0.9;
    const pts = [];
    for (let x = -6; x <= 106; x += 4) pts.push({ x, y: y + relief(x) * squash });
    lines.push({
      d: smoothPath(pts),
      major: i % 4 === 0,
      y,
      altitude: Math.round((BASE_ALT + (1 - (y - 40) / (H - 90)) * (SUMMIT_ALT - BASE_ALT)) / 50) * 50,
    });
    i++;
  }
  return lines.filter((l) => l.altitude > BASE_ALT - 200 && l.altitude < SUMMIT_ALT + 200);
}

/* ---------- build ---------- */

export function buildTrail(seed = 20260731) {
  const rng = mulberry32(seed);

  const nodes = [];
  for (let n = 0; n <= SUMMIT; n++) {
    const pos = nodePosition(n, rng);
    const row = n <= 0 ? 0 : n === SUMMIT ? ROWS : Math.floor((n - 1) / COLS);
    const band = n === SUMMIT ? BANDS[BANDS.length - 1] : bandForRow(row);
    let kind = 'plain';
    if (n === 0) kind = 'trailhead';
    else if (n === SUMMIT) kind = 'summit';
    else if (REFUGES[n]) kind = 'refuge';
    else if (VIEWPOINTS[n]) kind = 'view';
    nodes.push({ n, x: pos.x, y: pos.y, row, band: band.key, kind, altitude: altitude(n) });
  }

  const links = [];
  ASCENTS.forEach((a, i) => {
    const p = linkPath(nodes[a.from], nodes[a.to], i % 2 ? 1 : -1);
    links.push({ ...a, dir: 'up', id: `up${i}`, d: p.d });
  });
  DESCENTS.forEach((a, i) => {
    const p = linkPath(nodes[a.from], nodes[a.to], i % 2 ? -1 : 1);
    links.push({ ...a, dir: 'down', id: `down${i}`, d: p.d });
  });

  const byFrom = new Map(links.map((l) => [l.from, l]));

  const bandRanges = BANDS.map((b) => {
    const yTop = b.key === 'sommet' ? 0 : H - PAD_BOTTOM - (b.rows[1] + 1) * ROW_H;
    const yBottom = b.key === 'sommet'
      ? H - PAD_BOTTOM - (ROWS) * ROW_H
      : H - PAD_BOTTOM - b.rows[0] * ROW_H;
    return { ...b, yTop, yBottom, altitude: altitude(Math.min(SUMMIT, b.rows[0] * COLS + 1)) };
  });

  return {
    width: W,
    height: H,
    nodes,
    links,
    linkFrom: (n) => byFrom.get(n) || null,
    refuges: REFUGES,
    viewpoints: VIEWPOINTS,
    bands: bandRanges,
    contours: buildContours(rng),
    decor: buildDecor(rng),
    path: smoothPath(nodes),
    summit: SUMMIT,
    baseAltitude: BASE_ALT,
    summitAltitude: SUMMIT_ALT,
    altitude,
  };
}
