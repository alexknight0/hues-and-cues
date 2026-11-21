// Hues and Cues for one shared iPad: players pass it round and tap the board to place cones.
import { VERSION } from "./version.js";
import {
  COLS, ROWS, ROW_NAMES, COLOURS, LIGHT, cellName, rowOf, colOf,
  guessPoints, cueGiverPoints, drawCard, defaultTimesEach,
} from "./board.js";

const KEY_GAME = "hues-and-cues:game";
const KEY_SETUP = "hues-and-cues:setup";
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const HISTORY_MAX = 40;

// Cone colours, chosen to stand out from each other. DARK_TEXT ones get black initials.
const PALETTE = ["#e03131", "#1c7ed6", "#2f9e44", "#fab005", "#f76707", "#862e9c",
  "#15aabf", "#e64980", "#212529", "#f8f9fa"];
const DARK_TEXT = new Set(["#fab005", "#15aabf", "#f8f9fa"]);

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null && k !== false) e.append(k);
  return e;
};

// ---------- state ----------

// S: the game, or null on the setup screen.
// { players: [{name, color}], scores: [n], timesEach, round, phase, card: [cell x4],
//   target, cues: [first, second], cones: [{p, cell, pass}], pass, turn, pending, gains }
// phase: handoff | card | cue | guess | ready | scored | over
let S = null;
let history = [];
let peeking = false;
let setup = loadSetup();

function loadSetup() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY_SETUP));
    if (s && Array.isArray(s.players) && s.players.length >= MIN_PLAYERS) return s;
  } catch { /* fall through to the default */ }
  return {
    players: Array.from({ length: 8 }, (_, i) => ({ name: `Player ${i + 1}`, color: PALETTE[i] })),
    timesEach: null, // null = the official number for this many players
  };
}

const saveSetup = () => localStorage.setItem(KEY_SETUP, JSON.stringify(setup));

function save() {
  if (S) localStorage.setItem(KEY_GAME, JSON.stringify({ S, history }));
  else localStorage.removeItem(KEY_GAME);
}

function loadGame() {
  try {
    const g = JSON.parse(localStorage.getItem(KEY_GAME));
    if (g && g.S && g.S.players) {
      S = g.S;
      history = g.history || [];
    }
  } catch { S = null; }
}

const n = () => S.players.length;
const totalRounds = () => n() * S.timesEach;
const giver = () => S.round % n();

// Pass 1 goes clockwise from the cue giver's left, pass 2 back the other way.
function order(pass) {
  const list = [];
  for (let i = 1; i < n(); i++) list.push((giver() + i) % n());
  return pass === 1 ? list : list.reverse();
}
const guesser = () => order(S.pass)[S.turn];

function snapshot() {
  history.push(JSON.stringify(S));
  if (history.length > HISTORY_MAX) history.shift();
}

function undo() {
  if (!history.length) return;
  S = JSON.parse(history.pop());
  commit();
}

function commit() {
  save();
  render();
}

// ---------- game actions ----------

function startGame() {
  const players = setup.players.map((p, i) => ({
    name: p.name.trim() || `Player ${i + 1}`,
    color: p.color,
  }));
  S = {
    players,
    scores: players.map(() => 0),
    timesEach: setup.timesEach || defaultTimesEach(players.length),
    round: 0,
    phase: "handoff",
    cones: [],
  };
  history = [];
  newRound();
}

function newRound() {
  Object.assign(S, {
    phase: "handoff", card: drawCard(), target: null, cues: ["", ""],
    cones: [], pass: 1, turn: 0, pending: null, gains: null,
  });
  history = [];
  peeking = false;
  commit();
}

function startGuessing(pass) {
  snapshot();
  S.phase = "guess";
  S.pass = pass;
  S.turn = 0;
  S.pending = null;
  commit();
}

function tapCell(cell) {
  if (!S || S.phase !== "guess") {
    if (S && (S.phase === "cue" || S.phase === "ready")) toast(S.phase === "cue" ? "Waiting for the cue." : "Everyone has placed. Tap Reveal.");
    return;
  }
  const owner = S.cones.find((c) => c.cell === cell);
  if (owner) {
    toast(`${cellName(cell)} is taken by ${S.players[owner.p].name}.`);
    return;
  }
  S.pending = cell;
  save();
  render();
}

function confirmCone() {
  if (S.phase !== "guess" || S.pending == null) return;
  snapshot();
  S.cones.push({ p: guesser(), cell: S.pending, pass: S.pass });
  S.pending = null;
  S.turn++;
  if (S.turn >= order(S.pass).length) {
    S.phase = S.pass === 1 ? "cue" : "ready";
    S.pass = S.pass === 1 ? 2 : S.pass;
  }
  commit();
}

function skipSecondCue() {
  snapshot();
  S.phase = "ready";
  commit();
}

function reveal() {
  snapshot();
  const gains = S.players.map(() => 0);
  for (const c of S.cones) gains[c.p] += guessPoints(c.cell, S.target);
  gains[giver()] += cueGiverPoints(S.cones.map((c) => c.cell), S.target);
  S.gains = gains;
  S.scores = S.scores.map((s, i) => s + gains[i]);
  S.phase = "scored";
  commit();
}

function nextRound() {
  if (S.round + 1 >= totalRounds()) {
    snapshot();
    S.phase = "over";
    commit();
    return;
  }
  S.round++;
  newRound();
}

// ---------- board ----------

const boardEl = $("#board");
const cellEls = [];

function buildBoard() {
  const label = (text, cls) => el("div", { className: `lbl ${cls}`, textContent: text });
  const numbers = (cls) => {
    boardEl.append(el("div", { className: "lbl corner" }));
    for (let c = 0; c < COLS; c++) boardEl.append(label(String(c + 1), cls));
    boardEl.append(el("div", { className: "lbl corner" }));
  };
  numbers("top");
  for (let r = 0; r < ROWS; r++) {
    boardEl.append(label(ROW_NAMES[r], "side"));
    for (let c = 0; c < COLS; c++) {
      const cell = r * COLS + c;
      const d = el("div", { className: "cell" });
      d.style.backgroundColor = COLOURS[cell]; // not `background`, which would reset background-clip
      d.dataset.cell = cell;
      cellEls.push(d);
      boardEl.append(d);
    }
    boardEl.append(label(ROW_NAMES[r], "side"));
  }
  numbers("bottom");
  boardEl.addEventListener("click", (e) => {
    const c = e.target.closest(".cell");
    if (c) tapCell(Number(c.dataset.cell));
  });

  // Fit the board to the space it has: 30 squares plus labels across, 16 plus labels down.
  const wrap = $("#board-wrap");
  new ResizeObserver(() => {
    const size = Math.floor(Math.min(wrap.clientWidth / (COLS + 1.4), wrap.clientHeight / (ROWS + 1.4)));
    boardEl.style.setProperty("--cell", `${Math.max(size, 10)}px`);
  }).observe(wrap);
}

function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0];
  return w[0].toUpperCase() + (w[1] || "");
}

function coneEl(p, extra = "") {
  const pl = S.players[p];
  const d = el("div", { className: `cone ${extra}`, textContent: initials(pl.name) });
  d.style.setProperty("--c", pl.color);
  d.style.color = DARK_TEXT.has(pl.color) ? "#111" : "#fff";
  return d;
}

// The scoring frame and its outer ring, laid over the board's grid.
function frameEl(target, radius, cls) {
  const r = rowOf(target);
  const c = colOf(target);
  const r0 = Math.max(0, r - radius);
  const r1 = Math.min(ROWS - 1, r + radius);
  const c0 = Math.max(0, c - radius);
  const c1 = Math.min(COLS - 1, c + radius);
  const d = el("div", { className: `frame ${cls}` });
  // grid lines: the label column/row comes first, so square (r, c) starts at line r + 2 / c + 2
  d.style.gridRow = `${r0 + 2} / ${r1 + 3}`;
  d.style.gridColumn = `${c0 + 2} / ${c1 + 3}`;
  return d;
}

function renderBoard() {
  for (const e of boardEl.querySelectorAll(".cone, .frame, .points")) e.remove();
  for (const e of boardEl.querySelectorAll(".cell.target")) e.classList.remove("target");
  if (!S) return;
  const scored = S.phase === "scored" || S.phase === "over";
  for (const c of S.cones) {
    const cell = cellEls[c.cell];
    cell.append(coneEl(c.p, c.pass === 2 ? "second" : ""));
    if (scored) {
      const pts = guessPoints(c.cell, S.target);
      if (pts) cell.append(el("div", { className: "points", textContent: `+${pts}` }));
    }
  }
  if (S.phase === "guess" && S.pending != null) cellEls[S.pending].append(coneEl(guesser(), "pending"));
  if (scored && S.target != null) {
    cellEls[S.target].classList.add("target");
    boardEl.append(frameEl(S.target, 2, "outer"), frameEl(S.target, 1, "inner"));
  }
}

// ---------- the bar under the board ----------

function button(text, onClick, cls = "") {
  const b = el("button", { type: "button", className: `ctl ${cls}`, textContent: text });
  b.addEventListener("click", onClick);
  return b;
}

const name = (p) => S.players[p].name;
const strong = (text) => el("b", { textContent: text });
const undoButton = () => {
  const b = button("Undo", undo);
  b.disabled = !history.length;
  return b;
};
const peekButton = () => button("Show my card", () => { peeking = true; render(); });

function cueInput(i) {
  const input = el("input", {
    type: "text", value: S.cues[i], autocomplete: "off", enterKeyHint: "done",
    placeholder: i === 0 ? "Type the cue (optional)" : "Type the second cue (optional)",
  });
  input.setAttribute("autocapitalize", "off");
  input.addEventListener("input", () => { S.cues[i] = input.value; save(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  return input;
}

function renderBar() {
  const text = $("#prompt-text");
  const cues = $("#cues");
  const actions = $("#actions");
  text.replaceChildren();
  cues.replaceChildren();
  actions.replaceChildren();
  const g = giver();

  const shownCues = S.cues.filter((c, i) => c.trim() && !(S.phase === "cue" && i === S.pass - 1));
  if (shownCues.length && S.phase !== "scored") {
    cues.append("Cues: ", ...shownCues.flatMap((c, i) => [i ? " · " : "", el("q", { textContent: c.trim() })]));
  }

  switch (S.phase) {
    case "cue": {
      const first = S.pass === 1;
      text.append(strong(name(g)), first
        ? " is the cue giver. Say a one-word cue."
        : ": say a second cue of up to two words, or skip it.");
      cues.prepend(cueInput(first ? 0 : 1), " ");
      if (!first) actions.append(undoButton());
      actions.append(peekButton());
      if (!first) actions.append(button("Skip", skipSecondCue));
      actions.append(button(first ? "Start guessing" : "Second guesses", () => startGuessing(S.pass), "primary"));
      break;
    }
    case "guess": {
      const p = guesser();
      const left = order(S.pass).length - S.turn;
      text.append(el("span", { className: "dot" }), strong(name(p)),
        `: tap a square for your ${S.pass === 1 ? "first" : "second"} cone.`,
        el("small", { textContent: ` ${left} to go` }));
      text.querySelector(".dot").style.background = S.players[p].color;
      const ok = button("Place cone", confirmCone, "primary");
      if (S.pending != null) {
        const sw = el("span", { className: "swatch" });
        sw.style.background = COLOURS[S.pending];
        ok.replaceChildren(sw, `Place on ${cellName(S.pending)}`);
      } else ok.disabled = true;
      actions.append(undoButton(), ok);
      break;
    }
    case "ready":
      text.append("All cones are down. ", strong(name(g)), ", reveal your colour.");
      actions.append(undoButton(), button("Reveal", reveal, "primary"));
      break;
    case "scored": {
      const sw = el("span", { className: "swatch" });
      sw.style.background = COLOURS[S.target];
      text.append("The colour was ", sw, strong(cellName(S.target)), ".");
      const gotPoints = S.gains.map((v, i) => [i, v]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      cues.append(gotPoints.length
        ? gotPoints.map(([i, v]) => `${name(i)} +${v}${i === g ? " (cue giver)" : ""}`).join(" · ")
        : "Nobody scored this round.");
      const last = S.round + 1 >= totalRounds();
      actions.append(undoButton(), button(last ? "Final scores" : "Next round", nextRound, "primary"));
      break;
    }
  }
}

function renderScores() {
  const list = $("#scores");
  list.replaceChildren();
  const active = S.phase === "guess" ? guesser() : null;
  S.players.forEach((p, i) => {
    const li = el("li", {},
      coneEl(i, "chip"),
      el("span", { className: "pname", textContent: p.name }),
      el("b", { className: "pscore", textContent: S.scores[i] }));
    if (i === giver()) li.append(el("span", { className: "tag", textContent: "cue" }));
    if (S.phase === "scored" && S.gains[i]) li.append(el("span", { className: "gain", textContent: `+${S.gains[i]}` }));
    if (i === active) li.classList.add("active");
    if (i === giver()) li.classList.add("giver");
    list.append(li);
  });
}

// ---------- the private cover (handoff, card, peek, final scores) ----------

function renderCover() {
  const cover = $("#cover");
  const box = $("#cover-box");
  box.replaceChildren();
  const show = S && (S.phase === "handoff" || S.phase === "card" || S.phase === "over" || peeking);
  cover.hidden = !show;
  if (!show) return;
  cover.classList.toggle("final", S.phase === "over");
  const g = giver();

  if (peeking) {
    const sw = el("div", { className: "big-swatch" });
    sw.style.background = COLOURS[S.target];
    box.append(el("h2", { textContent: `${name(g)}'s colour` }), sw,
      el("p", { className: "coord", textContent: cellName(S.target) }),
      button("Hide", () => { peeking = false; render(); }, "primary big"));
    return;
  }

  if (S.phase === "handoff") {
    box.append(
      el("p", { className: "hint", textContent: `Round ${S.round + 1} of ${totalRounds()}` }),
      el("h2", {}, "Pass the iPad to ", strong(name(g))),
      el("p", { textContent: "Everyone else, look away." }),
      button(`I'm ${name(g)}, show my card`, () => { S.phase = "card"; commit(); }, "primary big"));
    return;
  }

  if (S.phase === "card") {
    const grid = el("div", { className: "card-grid" });
    for (const cell of S.card) {
      const b = el("button", { type: "button", className: "card-choice" });
      const sw = el("span", { className: "big-swatch" });
      sw.style.background = COLOURS[cell];
      b.append(sw, el("span", { className: "coord", textContent: cellName(cell) }));
      if (cell === S.target) b.classList.add("chosen");
      b.setAttribute("aria-pressed", String(cell === S.target));
      b.addEventListener("click", () => { S.target = cell; commit(); });
      grid.append(b);
    }
    const go = button("Hide card and give the cue", () => {
      S.phase = "cue";
      S.pass = 1;
      history = [];
      commit();
    }, "primary big");
    go.disabled = S.target == null;
    box.append(el("h2", {}, strong(name(g)), ", choose a colour"), grid,
      el("div", { className: "dlg-actions" }, button("Draw another card", () => {
        S.card = drawCard();
        S.target = null;
        commit();
      }), go));
    return;
  }

  // Game over
  const ranked = S.players.map((p, i) => ({ ...p, i, score: S.scores[i] })).sort((a, b) => b.score - a.score);
  const top = ranked[0].score;
  const winners = ranked.filter((r) => r.score === top).map((r) => r.name);
  const list = el("ol", { className: "final-list" });
  for (const r of ranked) {
    const li = el("li", {}, coneEl(r.i, "chip"), el("span", { className: "pname", textContent: r.name }),
      el("b", { textContent: r.score }));
    if (r.score === top) li.classList.add("winner");
    list.append(li);
  }
  box.append(el("h2", { textContent: winners.length > 1 ? `Tie: ${winners.join(" & ")}` : `${winners[0]} wins!` }),
    list,
    el("div", { className: "dlg-actions" },
      button("Back to the board", undo),
      button("Change players", () => { S = null; history = []; commit(); }),
      button("Play again", startGame, "primary")));
}

// ---------- setup screen ----------

function renderSetup() {
  const list = $("#player-list");
  list.replaceChildren();
  setup.players.forEach((p, i) => {
    const sw = el("button", { type: "button", className: "color-btn", ariaLabel: "Change colour" });
    sw.style.background = p.color;
    sw.addEventListener("click", () => {
      const used = new Set(setup.players.map((q) => q.color));
      let k = PALETTE.indexOf(p.color);
      for (let step = 0; step < PALETTE.length; step++) {
        k = (k + 1) % PALETTE.length;
        if (!used.has(PALETTE[k])) break;
      }
      p.color = PALETTE[k];
      saveSetup();
      renderSetup();
    });
    const input = el("input", { type: "text", value: p.name, autocomplete: "off", enterKeyHint: "next" });
    input.addEventListener("input", () => { p.name = input.value; saveSetup(); });
    input.addEventListener("focus", () => input.select());
    const rm = el("button", { type: "button", className: "ctl remove", textContent: "✕", ariaLabel: `Remove ${p.name}` });
    rm.disabled = setup.players.length <= MIN_PLAYERS;
    rm.addEventListener("click", () => {
      setup.players.splice(i, 1);
      saveSetup();
      renderSetup();
    });
    const up = el("button", { type: "button", className: "ctl move", textContent: "↑", ariaLabel: `Move ${p.name} up` });
    up.disabled = i === 0;
    up.addEventListener("click", () => {
      [setup.players[i - 1], setup.players[i]] = [setup.players[i], setup.players[i - 1]];
      saveSetup();
      renderSetup();
    });
    list.append(el("li", {}, sw, input, up, rm));
  });
  $("#add-player").disabled = setup.players.length >= MAX_PLAYERS;

  const count = setup.players.length;
  const times = setup.timesEach || defaultTimesEach(count);
  for (const b of document.querySelectorAll(".seg button")) {
    b.setAttribute("aria-checked", String(Number(b.dataset.times) === times));
  }
  $("#setup-summary").textContent =
    `${count} players, ${count * times} rounds.` + (setup.timesEach ? "" : ` (The rules say ${times === 1 ? "once" : "twice"} each for ${count} players.)`);
}

$("#add-player").addEventListener("click", () => {
  const used = new Set(setup.players.map((p) => p.color));
  setup.players.push({
    name: `Player ${setup.players.length + 1}`,
    color: PALETTE.find((c) => !used.has(c)) || PALETTE[0],
  });
  saveSetup();
  renderSetup();
  const inputs = document.querySelectorAll("#player-list input");
  inputs[inputs.length - 1].focus();
});
for (const b of document.querySelectorAll(".seg button")) {
  b.addEventListener("click", () => {
    const t = Number(b.dataset.times);
    setup.timesEach = t === defaultTimesEach(setup.players.length) ? null : t;
    saveSetup();
    renderSetup();
  });
}
$("#start").addEventListener("click", startGame);

// ---------- header, dialogs, toast ----------

function confirmDialog(text, ok) {
  const d = $("#confirm");
  $("#confirm-text").textContent = text;
  $("#confirm-ok").onclick = () => { d.close(); ok(); };
  d.showModal();
}

for (const d of document.querySelectorAll("dialog")) {
  for (const b of d.querySelectorAll("[data-close]")) b.addEventListener("click", () => d.close());
}
$("#rules-btn").addEventListener("click", () => $("#rules").showModal());
$("#new-btn").addEventListener("click", () => {
  if (!S) return;
  confirmDialog("End this game and go back to the player list?", () => {
    S = null;
    history = [];
    commit();
  });
});

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
}

// ---------- render ----------

function render() {
  $("#setup").hidden = !!S;
  $("#game").hidden = !S;
  $("#new-btn").hidden = !S;
  $("#round-info").textContent = S && S.phase !== "over" ? `Round ${S.round + 1} of ${totalRounds()}` : "";
  if (!S) {
    renderSetup();
    renderCover();
    return;
  }
  renderBoard();
  renderBar();
  renderScores();
  renderCover();
}

loadGame();
buildBoard();
render();

// For tests: window.__hc.state() / .set(state)
window.__hc = { state: () => S, set: (s) => { S = s; history = []; commit(); } };

// ---------- update light ----------
// The update light is shared by Alex's Pages sites (github.com/alexknight0/pages-common).
// The game is saved after every tap, so updating (which reloads the page) carries on where
// it left off. Loaded dynamically so the game still runs if jsDelivr is unreachable.

import("https://cdn.jsdelivr.net/gh/alexknight0/pages-common@1.0.0/update.js")
  .then(({ initUpdateLight }) => initUpdateLight({
    version: VERSION,
    buttons: "#version",
    report: toast,
    beforeUpdate() {
      save();
    },
  }))
  .catch((e) => {
    console.warn("update light:", e);
    for (const b of document.querySelectorAll(".version")) {
      b.dataset.state = "unknown";
      b.title = "Couldn't load the update check (offline?).";
    }
  });
