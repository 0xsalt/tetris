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
  <style>
    #jev-toggle { position:relative; width:22px; height:12px; border:none; border-radius:6px; padding:0;
                  background:#3a3a44; cursor:pointer; transition:background 0.2s; flex-shrink:0; }
    #jev-toggle::after { content:""; position:absolute; top:1px; left:1px; width:10px; height:10px;
                         border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.4); transition:left 0.2s; }
    #jev-toggle[aria-checked="true"] { background:#34c759; }
    #jev-toggle[aria-checked="true"]::after { left:11px; }
  </style>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
    <div class="card-label" style="margin:0;">Jev</div>
    <button id="jev-toggle" role="switch" aria-checked="false" aria-label="Jev plays"></button>
  </div>
  <div id="jev-stats" style="margin-top:6px;font-size:0.65rem;line-height:1.5;white-space:nowrap;overflow:hidden;"></div>
  <div id="jev-log" style="margin-top:6px;font-size:0.6rem;line-height:1.4;max-height:220px;overflow:hidden;font-family:monospace;"></div>
`;
// Always under Next on the right, at every screen width.
const rightPanel = document.querySelector(".panel-right") as HTMLElement;
const leftPanel = document.querySelector(".panel-left") as HTMLElement;
rightPanel.appendChild(card);

// Controls sit under the line-clear stats on the left, leaving the right side to Hold, Next and Jev.
const controlsCard = document.querySelector(".controls-card") as HTMLElement | null;
if (controlsCard) leftPanel.appendChild(controlsCard);

const toggle = document.getElementById("jev-toggle") as HTMLButtonElement;
const stats = document.getElementById("jev-stats")!;
const logEl = document.getElementById("jev-log")!;

function showStatus(s: Status, extra = "") {
  const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(5) : n.toFixed(2)}`;
  // One short fact per line, each under ~20 characters, so nothing wraps in the 160px tablet panel.
  stats.innerHTML = [
    `${usd(s.cost_per_call_usd)} per call`,
    `${usd(s.cost_total_usd)} all time`,
    `${usd(s.cost_today_usd)} / ${usd(s.daily_cap_usd)} today`,
    `${s.calls_today.toLocaleString()} calls today`,
    `${s.calls_total.toLocaleString()} calls total`,
    `${(s.tokens_today / 1e6).toFixed(2)}M tok today`,
    `seed ${seed}`,
    ...(extra ? [extra] : []),
  ].join("<br>");
}

function logLine(text: string, color = "#9ad") {
  const line = document.createElement("div");
  line.style.color = color;
  line.style.whiteSpace = "nowrap";
  line.textContent = text;
  logEl.prepend(line);
  while (logEl.childElementCount > 14) logEl.lastElementChild!.remove();
}

function newGame() {
  seed = Math.floor(Math.random() * 2 ** 31);
  rng = mulberry32(seed);
  lastPiece = null;
  startGame();
  logLine(`new game ${seed}`, "#777");
}

function setJev(on: boolean) {
  jevOn = on;
  toggle.setAttribute("aria-checked", String(on));
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
      logLine("budget spent: off", "#ff4466");
      setJev(false);
      return;
    }
    if (!res.ok) {
      logLine(`error ${res.status}`, "#ff8844"); // full detail is in the server's call log
      lastPiece = null; // retry this piece on the next frame
      await new Promise(r => setTimeout(r, 1000));
      return;
    }

    // The server already rejected answers outside its list; re-check against the live board.
    if (currentPiece !== piece || !isValid(body.x, 0, body.rotation)) {
      logLine(`skip ${body.choice} (moved)`, "#ff8844");
      return;
    }
    const conf = typeof body.confidence === "number" ? `${Math.round(body.confidence * 100)}%` : "?";
    logLine(`${piece.name}→${body.choice} ${body.record.latency_ms}ms ${conf}`);
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
      logLine("game over, restart 3s", "#777");
      restartTimer = setTimeout(() => { restartTimer = null; if (jevOn) newGame(); }, 3000);
    }
  }
  requestAnimationFrame(tick);
}

fetch("/api/jev/status").then(r => r.json()).then(s => showStatus(s)).catch(() => {});
// Jev is OFF on every load, whatever the URL: opening the page must never spend money unseen.
// Only the switch turns it on.
requestAnimationFrame(tick);
