// ============================================================
// jev.ts — One Choice question to TypeSafe's Jev per piece,
// a daily token cap, and an append-only call log.
// ============================================================

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { describePlacement, type Placement } from "./placements";

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";

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
  constructor(readonly dailyCap: number, private logFile: string) {
    this.rollover();
    if (existsSync(logFile)) {
      for (const line of readFileSync(logFile, "utf8").split("\n")) {
        if (!line) continue;
        try {
          const rec = JSON.parse(line) as CallRecord;
          if (rec.ts.slice(0, 10) === this.day) this.used += rec.input_tokens || 0;
        } catch { /* skip a torn line */ }
      }
    }
  }
  private rollover() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) { this.day = today; this.used = 0; }
  }
  get spent() { this.rollover(); return this.used; }
  get exhausted() { return this.spent >= this.dailyCap; }
  charge(tokens: number) { this.rollover(); this.used += tokens; }
}

export class CallLog {
  count = 0;
  recent: CallRecord[] = [];
  constructor(private file: string) {
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) this.count = readFileSync(file, "utf8").split("\n").filter(Boolean).length;
  }
  append(rec: CallRecord) {
    appendFileSync(this.file, JSON.stringify(rec) + "\n");
    this.count++;
    this.recent.push(rec);
    if (this.recent.length > 50) this.recent.shift();
  }
}

export function buildRequest(pieceName: string, upcoming: string[], placements: Placement[]) {
  const criteria: Record<string, string> = {};
  for (const p of placements) criteria[p.key] = describePlacement(p);
  return {
    state: { game: "Tetris", current_piece: pieceName, upcoming_pieces: upcoming.slice(0, 3) },
    model: JEV_MODEL,
    questions: {
      placement: {
        type: "choice",
        instructions:
          "Pick the landing spot for the `current_piece` that a strong Tetris player would choose. " +
          "Clearing lines is good. Covered holes are bad and hard to fix. A low stack and a flat surface keep the game alive.",
        criteria,
      },
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
      body: JSON.stringify(buildRequest(pieceName, upcoming, placements)),
      signal: AbortSignal.timeout(10_000),
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
