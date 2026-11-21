// Board colours and scoring rules. No DOM here.
//
// The board is 30 columns (1-30) by 16 rows (A-P). Like the printed game, the colours
// are laid out as a colour wheel spread over the rectangle: almost white near the
// middle (row I, column 16), getting stronger towards the edges, with the hue set by
// the direction from the centre. Clockwise from the top: red, magenta, purple, blue,
// cyan, green, yellow, orange, red, and a dark maroon-brown in the top-left corner. Corners
// sit further from the centre than the edges, so they get darker.
// The values are our own (computed in OKLCH), not copied from the printed board.

export const COLS = 30;
export const ROWS = 16;
export const ROW_NAMES = "ABCDEFGHIJKLMNOP";

const CENTRE_ROW = 8.3; // 0-based: just below row I
const CENTRE_COL = 16.5; // 0-based: around column 17
const L_CENTRE = 0.965;
const GAMUT_SHARE = 0.98; // stay a little inside the sRGB edge
const CORNER_DARKEN = 0.17; // lightness lost going from an edge out to a corner

// Direction from the centre (degrees clockwise from straight up) → colour at the edge.
// h = OKLCH hue, unwrapped so it only ever decreases; L = edge lightness; C = edge chroma
// (still limited by what sRGB can show). The reds get the most chroma so they read as red,
// not coral; the top middle leans crimson, and true red sits a little left of it.
const ANCHORS = [
  { at: 0, h: 8, L: 0.55, C: 0.22 }, // crimson (top middle)
  { at: 35, h: -25, L: 0.53, C: 0.22 }, // magenta
  { at: 70, h: -55, L: 0.45, C: 0.19 }, // purple
  { at: 100, h: -85, L: 0.38, C: 0.17 }, // indigo (right middle)
  { at: 140, h: -110, L: 0.6, C: 0.15 }, // blue
  { at: 165, h: -150, L: 0.7, C: 0.13 }, // cyan / teal
  { at: 195, h: -215, L: 0.62, C: 0.17 }, // green (bottom middle)
  { at: 235, h: -240, L: 0.82, C: 0.19 }, // yellow-green
  { at: 270, h: -258, L: 0.92, C: 0.19 }, // yellow (left middle)
  { at: 300, h: -295, L: 0.74, C: 0.18 }, // orange
  { at: 322, h: -320, L: 0.6, C: 0.21 }, // red-orange
  { at: 340, h: -332, L: 0.54, C: 0.23 }, // red
  { at: 360, h: -352, L: 0.55, C: 0.22 }, // crimson again
];

export const cellIndex = (row, col) => row * COLS + col;
export const rowOf = (cell) => Math.floor(cell / COLS);
export const colOf = (cell) => cell % COLS;
export const cellName = (cell) => `${ROW_NAMES[rowOf(cell)]}${colOf(cell) + 1}`;

function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

function toHex(rgb) {
  return (
    "#" +
    rgb
      .map((v) => {
        v = Math.min(1, Math.max(0, v));
        v = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
        return Math.round(v * 255).toString(16).padStart(2, "0");
      })
      .join("")
  );
}

function maxChroma(L, h) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(L, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo * GAMUT_SHARE;
}

function edgeColour(angle) {
  let i = 0;
  while (ANCHORS[i + 1].at < angle) i++;
  const a = ANCHORS[i];
  const b = ANCHORS[i + 1];
  const f = (angle - a.at) / (b.at - a.at);
  return {
    h: (((a.h + (b.h - a.h) * f) % 360) + 360) % 360,
    L: a.L + (b.L - a.L) * f,
    C: a.C + (b.C - a.C) * f,
  };
}

function cellColour(row, col) {
  // Square-ish distance: 1 on the edge of the board, ~1.4 in the corners.
  const x = (col - CENTRE_COL) / (col < CENTRE_COL ? CENTRE_COL : COLS - 1 - CENTRE_COL);
  const y = (row - CENTRE_ROW) / (row < CENTRE_ROW ? CENTRE_ROW : ROWS - 1 - CENTRE_ROW);
  const d = Math.hypot(x, y);
  const angle = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
  const edge = edgeColour(angle);
  const t = Math.min(1, d);
  const ease = 1 - (1 - t) ** 1.6; // leaves the pale centre quickly
  let L = L_CENTRE + (edge.L - L_CENTRE) * ease;
  if (d > 1) L -= CORNER_DARKEN * Math.min(1, (d - 1) / 0.41);
  const C = Math.min(edge.C * ease ** 0.9, maxChroma(L, edge.h));
  return { hex: toHex(oklchToLinear(L, C, edge.h)), L };
}

// COLOURS[cell] = "#rrggbb"; LIGHT[cell] = true when dark text reads better on it.
export const COLOURS = [];
export const LIGHT = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const { hex, L } = cellColour(r, c);
    COLOURS.push(hex);
    LIGHT.push(L > 0.62);
  }
}

// Distance in the sense of the scoring frame: 0 = the target, 1 = inside the frame,
// 2 = touching the frame from outside.
export const ringDistance = (a, b) =>
  Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)));

export function guessPoints(cell, target) {
  const d = ringDistance(cell, target);
  return d === 0 ? 3 : d === 1 ? 2 : d === 2 ? 1 : 0;
}

// Cue giver: 1 point per cone inside the frame (the 3x3 block, target included).
export const cueGiverPoints = (cells, target) =>
  cells.filter((c) => ringDistance(c, target) <= 1).length;

// A card shows four colours. Keep them at least 3 squares apart so they're different
// enough to be worth choosing between.
export function drawCard(rand = Math.random) {
  for (;;) {
    const card = [];
    let tries = 0;
    while (card.length < 4 && tries++ < 200) {
      const c = Math.floor(rand() * COLS * ROWS);
      if (card.every((o) => ringDistance(o, c) >= 3)) card.push(c);
    }
    if (card.length === 4) return card;
  }
}

// Cue giver rounds: each player twice with 3-6 players, once with 7 or more (official rules).
export const defaultTimesEach = (n) => (n <= 6 ? 2 : 1);
