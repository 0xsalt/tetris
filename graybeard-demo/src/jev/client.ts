// ============================================================
// client.ts — "Jev plays" mode, injected by the server only when
// a TypeSafe key is configured. Reads and drives the game's
// top-level bindings in index.html; never sees the API key.
// ============================================================

import { mulberry32 } from "./seed";

declare let board: (string | null)[][];
declare let currentPiece: { name: string; rotation: number; x: number; y: number } | null;
declare let nextQueue: string[];
declare let gameState: string;
declare let gravityPaused: boolean;
declare let lastDrop: number;
declare let rng: () => number;
declare function startGame(): void;
declare function hardDrop(): void;
declare function isValid(nx: number, ny: number, rot: number, pieceName?: string): boolean;

interface Status {
  enabled: boolean; exhausted: boolean;
  calls_total: number; calls_today: number;
  tokens_today: number; daily_cap: number;
  cost_today_usd: number; cost_total_usd: number; cost_per_call_usd: number; daily_cap_usd: number;
}

function boardWire(): string[] {
  return board.map(row => row.map(cell => (cell === null ? "0" : "1")).join(""));
}

let jevOn = false;
let pending = false;
let lastPiece: object | null = null;
let seed = 0;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

const card = document.createElement("div");
card.className = "card";
card.id = "jev-card";
card.innerHTML = `
  <div class="card-label" style="margin-bottom:8px;">Jev</div>
  <button id="jev-toggle" style="width:100%;padding:6px;font:inherit;cursor:pointer;">JEV: OFF</button>
  <div id="jev-fuel" style="margin-top:8px;height:6px;background:#222;border-radius:3px;overflow:hidden;">
    <div id="jev-fuel-bar" style="height:100%;width:100%;background:#39ff88;"></div>
  </div>
  <div id="jev-stats" style="margin-top:6px;font-size:0.65rem;line-height:1.5;"></div>
  <div id="jev-log" style="margin-top:6px;font-size:0.6rem;line-height:1.4;max-height:220px;overflow:hidden;font-family:monospace;"></div>
`;
// Own column to the right of Hold/Next when the screen has room; otherwise under Next, which is
// where it fits on a tablet in portrait. `panel-right` keeps the mobile rule that hides side panels.
const rightPanel = document.querySelector(".panel-right") as HTMLElement;
const leftPanel = document.querySelector(".panel-left") as HTMLElement;
const column = document.createElement("div");
column.className = "panel-right";
column.style.width = "220px";
rightPanel.after(column);
(document.querySelector(".game-wrapper") as HTMLElement).style.maxWidth = "1140px";

function placeCard() {
  column.style.display = "";
  column.appendChild(card);
  const overflows = column.getBoundingClientRect().right > document.documentElement.clientWidth
    || leftPanel.getBoundingClientRect().left < 0;
  if (overflows) {
    rightPanel.appendChild(card);
    column.style.display = "none";
  }
}
placeCard();
window.addEventListener("resize", placeCard);
const controlsCard = document.querySelector(".controls-card") as HTMLElement | null;

const toggle = document.getElementById("jev-toggle") as HTMLButtonElement;
const stats = document.getElementById("jev-stats")!;
const fuelBar = document.getElementById("jev-fuel-bar") as HTMLElement;
const logEl = document.getElementById("jev-log")!;

function showStatus(s: Status, extra = "") {
  const left = Math.max(0, 1 - s.tokens_today / s.daily_cap);
  fuelBar.style.width = `${(left * 100).toFixed(1)}%`;
  fuelBar.style.background = left > 0.25 ? "#39ff88" : left > 0.1 ? "#ffcc00" : "#ff4466";
  const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(5) : n.toFixed(2)}`;
  stats.innerHTML =
    `cost today: ${usd(s.cost_today_usd)} / ${usd(s.daily_cap_usd)}<br>` +
    `per call: ${usd(s.cost_per_call_usd)} · all time: ${usd(s.cost_total_usd)}<br>` +
    `calls today: ${s.calls_today.toLocaleString()} · total: ${s.calls_total.toLocaleString()}<br>` +
    `tokens today: ${s.tokens_today.toLocaleString()}<br>` +
    `seed: ${seed}${extra ? "<br>" + extra : ""}`;
}

function logLine(text: string, color = "#9ad") {
  const line = document.createElement("div");
  line.style.color = color;
  line.textContent = text;
  logEl.prepend(line);
  while (logEl.childElementCount > 14) logEl.lastElementChild!.remove();
}

function newGame() {
  seed = Math.floor(Math.random() * 2 ** 31);
  rng = mulberry32(seed);
  lastPiece = null;
  startGame();
  logLine(`— new game, seed ${seed} —`, "#777");
}

function setJev(on: boolean) {
  jevOn = on;
  toggle.textContent = `JEV: ${on ? "ON" : "OFF"}`;
  if (controlsCard) controlsCard.style.display = on ? "none" : "";
  gravityPaused = false;
  if (on && gameState !== "playing") newGame();
}

toggle.addEventListener("click", () => setJev(!jevOn));

// One piece per second at most. Without this Jev plays ~4 pieces/s and one viewer spends the daily cap in ~15 minutes.
const PACE_MS = 1000;

async function decideFor(piece: NonNullable<typeof currentPiece>) {
  const started = performance.now();
  pending = true;
  gravityPaused = true;
  try {
    const res = await fetch("/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: boardWire(), piece: piece.name, upcoming: nextQueue.slice(0, 3) }),
    });
    const body = await res.json();
    showStatus(body);

    if (res.status === 429 && body.exhausted) {
      logLine("budget spent for today — Jev stops", "#ff4466");
      setJev(false);
      return;
    }
    if (!res.ok) {
      logLine(`error ${res.status}: ${String(body.error).slice(0, 80)}`, "#ff8844");
      lastPiece = null; // retry this piece on the next frame
      await new Promise(r => setTimeout(r, 1000));
      return;
    }

    // The server already rejected answers outside its list; re-check against the live board.
    if (currentPiece !== piece || !isValid(body.x, 0, body.rotation)) {
      logLine(`skipped ${body.choice}: board changed`, "#ff8844");
      return;
    }
    const conf = typeof body.confidence === "number" ? `${Math.round(body.confidence * 100)}%` : "?";
    logLine(`${piece.name} → ${body.choice}  ${body.record.latency_ms}ms  conf ${conf}`);
    // Hold the piece at the top until the pace interval ends: watchable, and the budget lasts.
    const wait = PACE_MS - (performance.now() - started);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (currentPiece !== piece || !jevOn) return;
    piece.rotation = body.rotation;
    piece.x = body.x;
    piece.y = 0;
    hardDrop();
  } finally {
    gravityPaused = false;
    lastDrop = performance.now();
    pending = false;
  }
}

function tick() {
  if (jevOn) {
    if (gameState === "playing" && currentPiece && currentPiece !== lastPiece && !pending) {
      lastPiece = currentPiece;
      decideFor(currentPiece);
    } else if (gameState === "gameover" && !restartTimer) {
      logLine("game over — restarting in 3s", "#777");
      restartTimer = setTimeout(() => { restartTimer = null; if (jevOn) newGame(); }, 3000);
    }
  }
  requestAnimationFrame(tick);
}

fetch("/api/jev/status").then(r => r.json()).then(s => showStatus(s)).catch(() => {});
// Jev starts on load, so the service-dashboard's plain link opens straight into the demo. ?jev=0 opens a human game.
if (new URLSearchParams(location.search).get("jev") !== "0") setJev(true);
requestAnimationFrame(tick);
