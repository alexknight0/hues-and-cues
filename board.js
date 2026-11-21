// Board colours and scoring rules. No DOM here.
//
// The real board is 30 columns (1-30) by 16 rows (A-P): hue changes along a row and
// rows run from pale at the top to dark at the bottom. These colours are an
// approximation built in OKLCH: each row has one lightness and each column one hue.
// - Hues are spaced so neighbouring columns differ by the same amount to the eye
//   (equal steps in OKLab at a mid row), not by equal degrees, which wasted columns on
//   near-identical greens and teals and jumped through the reds.
// - Chroma follows a smooth curve per row (soft pastels at the top, richest in the
//   middle rows, muted at the bottom), capped by what sRGB can show. Without the cap
//   some hues (cyan, magenta) went neon while their neighbours couldn't follow.

export const COLS = 30;
export const ROWS = 16;
export const ROW_NAMES = "ABCDEFGHIJKLMNOP";

const L_TOP = 0.94;
const L_BOTTOM = 0.32;
const HUE_START = 20; // a pinkish red, so column 1 sits next to column 30 on the colour wheel
const C_PEAK = 0.17; // chroma of the richest row
const C_TOP = 0.07; // chroma of the palest row
const C_BOTTOM = 0.11; // chroma of the darkest row
const PEAK_ROW = 0.42; // where (0 = top, 1 = bottom) the board is most colourful
const GAMUT_SHARE = 0.97; // stay a little inside the sRGB edge

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

// Smooth bump: C_TOP at t = 0, C_PEAK at PEAK_ROW, C_BOTTOM at t = 1.
function rowChroma(t) {
  const [edge, u] = t < PEAK_ROW ? [C_TOP, t / PEAK_ROW] : [C_BOTTOM, (1 - t) / (1 - PEAK_ROW)];
  const s = Math.sin((u * Math.PI) / 2);
  return edge + (C_PEAK - edge) * s;
}

const chromaAt = (L, h, C) => Math.min(C, maxChroma(L, h));

// Column hues: walk round the wheel in small steps at a mid row, measure the OKLab
// distance travelled, and put the 30 columns at equal distances along that path.
const HUES = (() => {
  const L = 0.66;
  const C = rowChroma(PEAK_ROW + 0.1);
  const steps = 720;
  const lab = (h) => {
    const c = chromaAt(L, h, C);
    return [L, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  };
  const len = [0];
  let prev = lab(HUE_START);
  for (let i = 1; i <= steps; i++) {
    const cur = lab(HUE_START + (360 * i) / steps);
    len.push(len[i - 1] + Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]));
    prev = cur;
  }
  const total = len[steps];
  const hues = [];
  let j = 0;
  for (let c = 0; c < COLS; c++) {
    const want = (total * c) / COLS;
    while (len[j + 1] < want) j++;
    const f = (want - len[j]) / (len[j + 1] - len[j] || 1);
    hues.push((HUE_START + (360 * (j + f)) / steps) % 360);
  }
  return hues;
})();

function cellColour(row, col) {
  const t = row / (ROWS - 1);
  const L = L_TOP + (L_BOTTOM - L_TOP) * t;
  const h = HUES[col];
  return { hex: toHex(oklchToLinear(L, chromaAt(L, h, rowChroma(t)), h)), L };
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
