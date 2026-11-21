// Writes icon.svg: a 6x6 patch of board colours with a cone and the scoring frame.
// Run: node tools/make_icon.mjs   (then tools/make_icons.py renders the PNGs)
import { writeFileSync } from "node:fs";
import { COLOURS, COLS } from "../board.js";

const N = 6;
const size = 512;
const inner = size * 0.64; // artwork inside the central 80% (maskable safe zone)
const cell = inner / N;
const off = (size - inner) / 2;
let rects = "";
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    const colour = COLOURS[(2 + r * 2) * COLS + c * 5];
    rects += `<rect x="${off + c * cell}" y="${off + r * cell}" width="${cell + 0.5}" height="${cell + 0.5}" fill="${colour}"/>`;
  }
}
const fx = off + 2 * cell;
const fy = off + 2 * cell;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="#1c1c22"/>
${rects}
<rect x="${fx}" y="${fy}" width="${cell * 3}" height="${cell * 3}" fill="none" stroke="#000" stroke-width="10"/>
<rect x="${fx - 5}" y="${fy - 5}" width="${cell * 3 + 10}" height="${cell * 3 + 10}" fill="none" stroke="#fff" stroke-width="4"/>
<circle cx="${fx + cell * 1.5}" cy="${fy + cell * 1.5}" r="${cell * 0.42}" fill="#e03131" stroke="#fff" stroke-width="7"/>
</svg>
`;
writeFileSync(new URL("../icon.svg", import.meta.url), svg);
console.log("wrote icon.svg");
