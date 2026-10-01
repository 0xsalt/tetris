// ============================================================
// jev.ts — One Choice question to TypeSafe's Jev per piece,
// a daily token cap, and an append-only call log.
// ============================================================

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { describePlacement, type Placement } from "./placements";

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
// TypeSafe list price: $0.042 per million input tokens; output tokens are free.
export const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

export interface CallRecord {
  ts: string;
  piece: string;
  options: number;
  choice: string | null;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  status: number;
  error?: string;
}

export function loadApiKey(envFile: string): string | null {
  if (!existsSync(envFile)) return null;
  if (statSync(envFile).mode & 0o077) console.warn(`warning: ${envFile} is readable by other users; chmod 600 it`);
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*TYPESAFE_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

/** Tracks today's billed input tokens, rebuilt from the call log at startup. */
export class Budget {
  private day = "";
  private used = 0;
  private calls = 0;
  constructor(readonly dailyCap: number, private logFile: string) {
    this.rollover();
    if (existsSync(logFile)) {
      for (const line of readFileSync(logFile, "utf8").split("\n")) {
        if (!line) continue;
        try {
          const rec = JSON.parse(line) as CallRecord;
          if (rec.ts.slice(0, 10) === this.day && rec.input_tokens) { this.used += rec.input_tokens; this.calls++; }
        } catch { /* skip a torn line */ }
      }
    }
  }
  private rollover() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) { this.day = today; this.used = 0; this.calls = 0; }
  }
  get spent() { this.rollover(); return this.used; }
  get callsToday() { this.rollover(); return this.calls; }
  get exhausted() { return this.spent >= this.dailyCap; }
  charge(tokens: number) { this.rollover(); this.used += tokens; this.calls++; }
}

export class CallLog {
  count = 0;
  inputTokens = 0;
  recent: CallRecord[] = [];
  constructor(private file: string) {
    mkdirSync(dirname(file), { recursive: true });
    if (!existsSync(file)) return;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line) continue;
      this.count++;
      try { this.inputTokens += (JSON.parse(line) as CallRecord).input_tokens || 0; } catch { /* torn line */ }
    }
  }
  append(rec: CallRecord) {
    appendFileSync(this.file, JSON.stringify(rec) + "\n");
    this.count++;
    this.inputTokens += rec.input_tokens;
    this.recent.push(rec);
    if (this.recent.length > 50) this.recent.shift();
  }
}

/** The board as facts computed in code, per TypeSafe's guidance: Jev does not count cells reliably. */
export interface BoardFacts {
  column_heights: number[]; // filled height of each column, left to right, in rows
  tallest_column: number;
  covered_holes: number;    // empty cells with a filled cell somewhere above them
}

// Exact conditions, read literally (TypeSafe: "Jev 1.13 jaggedness", literal reading). The numbers
// match the option fields, so every rule here can be checked against every option.
export const PLACEMENT_INSTRUCTIONS =
  "Choose where to land `current_piece` on a Tetris board 10 columns wide and 20 rows tall. " +
  "Each option lists exactly what that landing does to the board. Weigh them in this order of importance: " +
  "(1) `lines_cleared`: more is better, and 4 at once is the best move in the game. " +
  "(2) `covered_holes_added`: 0 is strongly preferred; every covered hole blocks a row from clearing until it is dug out. " +
  "(3) `tallest_column_after`: lower is better, and above 14 of 20 rows the game is close to being lost. " +
  "(4) `bumpiness_after` (sum of height differences between neighbouring columns): lower is better. " +
  "Use `upcoming_pieces` to leave a place where the next piece fits.";

export function buildRequest(pieceName: string, upcoming: string[], placements: Placement[], board: BoardFacts) {
  const criteria: Record<string, object> = {};
  for (const p of placements) criteria[p.key] = describePlacement(p);
  return {
    state: {
      game: "Tetris",
      board: { columns: 10, rows: 20, ...board },
      current_piece: pieceName,
      upcoming_pieces: upcoming.slice(0, 3),
    },
    model: JEV_MODEL,
    questions: {
      placement: { type: "choice", instructions: PLACEMENT_INSTRUCTIONS, criteria },
    },
  };
}

export interface Decision {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

/**
 * Ask Jev and return its choice, which is guaranteed to be one of `placements`.
 * An answer outside that set is logged and rejected, never applied.
 */
export async function decide(
  apiKey: string,
  pieceName: string,
  upcoming: string[],
  placements: Placement[],
  board: BoardFacts,
  log: CallLog,
  budget: Budget,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; decision: Decision; record: CallRecord } | { ok: false; status: number; record: CallRecord }> {
  const started = performance.now();
  const record: CallRecord = {
    ts: new Date().toISOString(), piece: pieceName, options: placements.length,
    choice: null, confidence: null, probabilities: null, model: null,
    input_tokens: 0, output_tokens: 0, latency_ms: 0, status: 0,
  };

  let res: Response;
  try {
    res = await fetchFn(JEV_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRequest(pieceName, upcoming, placements, board)),
      signal: AbortSignal.timeout(10_000),
      // One fixed partner: never follow a redirect anywhere with the key attached.
      redirect: "error",
    });
  } catch (err) {
    record.latency_ms = Math.round(performance.now() - started);
    record.status = 502;
    record.error = `network: ${(err as Error).message}`;
    log.append(record);
    return { ok: false, status: 502, record };
  }

  record.latency_ms = Math.round(performance.now() - started);
  record.status = res.status;
  const body: any = await res.json().catch(() => null);

  if (!res.ok || !body) {
    record.error = `jev http ${res.status}: ${JSON.stringify(body)?.slice(0, 300)}`;
    log.append(record);
    return { ok: false, status: res.status === 429 || res.status === 529 ? 429 : 502, record };
  }

  record.model = body.model ?? null;
  record.input_tokens = body.usage?.input_tokens ?? 0;
  record.output_tokens = body.usage?.output_tokens ?? 0;
  budget.charge(record.input_tokens);

  const answer = body.answers?.placement;
  const valid = new Set(placements.map(p => p.key));
  if (!answer || typeof answer.choice !== "string" || !valid.has(answer.choice)) {
    record.error = `rejected answer outside the placement list: ${JSON.stringify(answer?.choice)}`;
    record.status = 502;
    log.append(record);
    return { ok: false, status: 502, record };
  }

  record.choice = answer.choice;
  record.confidence = answer.confidence ?? null;
  record.probabilities = answer.probabilities ?? null;
  log.append(record);
  return {
    ok: true,
    record,
    decision: { choice: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities ?? {} },
  };
}
