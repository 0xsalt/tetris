import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COLS, TOTAL_ROWS, PIECES, refillBag, type Board } from "../src/game-logic";
import { enumeratePlacements, describePlacement, parseBoard } from "../src/jev/placements";
import { Budget, CallLog, USD_PER_INPUT_TOKEN, buildRequest, decide, loadApiKey } from "../src/jev/jev";
import { mulberry32 } from "../src/jev/seed";

function emptyBoard(): Board {
  return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
}

function tmpLog() {
  return join(mkdtempSync(join(tmpdir(), "jev-test-")), "calls.jsonl");
}

function fakeJev(answer: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ model: "jev-1.13.0", answers: { placement: answer }, usage: { input_tokens: 700, output_tokens: 30 } }), { status })) as any;
}

describe("enumeratePlacements — empty board", () => {
  test("O has 9 distinct placements", () => expect(enumeratePlacements(emptyBoard(), "O")).toHaveLength(9));
  test("I has 17 distinct placements", () => expect(enumeratePlacements(emptyBoard(), "I")).toHaveLength(17));
  test("T has 34 distinct placements", () => expect(enumeratePlacements(emptyBoard(), "T")).toHaveLength(34));
  test("S and Z have 17 each", () => {
    expect(enumeratePlacements(emptyBoard(), "S")).toHaveLength(17);
    expect(enumeratePlacements(emptyBoard(), "Z")).toHaveLength(17);
  });
  test("J and L have 34 each", () => {
    expect(enumeratePlacements(emptyBoard(), "J")).toHaveLength(34);
    expect(enumeratePlacements(emptyBoard(), "L")).toHaveLength(34);
  });
  test("keys are unique", () => {
    const keys = enumeratePlacements(emptyBoard(), "T").map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("enumeratePlacements — features", () => {
  test("a vertical I into a 4-deep well clears 4 lines", () => {
    const b = emptyBoard();
    for (let r = TOTAL_ROWS - 4; r < TOTAL_ROWS; r++) for (let c = 0; c < COLS - 1; c++) b[r][c] = "#";
    const best = enumeratePlacements(b, "I").find(p => p.columns[0] === 9 && p.columns[1] === 9)!;
    expect(best.linesCleared).toBe(4);
    expect(best.heightAfter).toBe(0);
    expect(describePlacement(best)).toContain("a Tetris");
  });
  test("a flat O on the floor adds no holes", () => {
    const p = enumeratePlacements(emptyBoard(), "O")[0];
    expect(p.holesAdded).toBe(0);
    expect(p.heightAfter).toBe(2);
  });
  test("an S on a flat floor leaves a covered hole", () => {
    const flatS = enumeratePlacements(emptyBoard(), "S").find(p => p.rotation === 0)!;
    expect(flatS.holesAdded).toBe(1);
  });
});

describe("parseBoard", () => {
  test("accepts 22 rows of 10 bits", () => {
    const b = parseBoard(Array(TOTAL_ROWS).fill("0000000001"));
    expect(b![0][9]).not.toBeNull();
    expect(b![0][0]).toBeNull();
  });
  test("rejects the wrong row count", () => expect(parseBoard(Array(5).fill("0000000000"))).toBeNull());
  test("rejects non-bit characters", () => expect(parseBoard(Array(TOTAL_ROWS).fill("000000000x"))).toBeNull());
  test("rejects non-arrays", () => expect(parseBoard("nope")).toBeNull());
});

describe("decide", () => {
  const placements = enumeratePlacements(emptyBoard(), "O");

  test("returns Jev's choice when it is in the placement list", async () => {
    const file = tmpLog();
    const log = new CallLog(file);
    const budget = new Budget(1_000_000, file);
    const r = await decide("k", "O", [], placements, log, budget, fakeJev({ type: "choice", choice: placements[3].key, probabilities: {}, confidence: 0.8 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decision.choice).toBe(placements[3].key);
    expect(log.count).toBe(1);
    expect(budget.spent).toBe(700);
  });

  test("rejects an answer outside the placement list", async () => {
    const file = tmpLog();
    const r = await decide("k", "O", [], placements, new CallLog(file), new Budget(1_000_000, file), fakeJev({ type: "choice", choice: "rm -rf /", confidence: 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.record.error).toContain("rejected");
  });

  test("maps Jev overload (529) to a retryable 429", async () => {
    const file = tmpLog();
    const r = await decide("k", "O", [], placements, new CallLog(file), new Budget(1_000_000, file), fakeJev(null, 529));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(429);
  });

  test("request carries only server-built option text", () => {
    const req = buildRequest("O", ["T", "I", "L", "S"], placements);
    expect(Object.keys(req.questions.placement.criteria)).toEqual(placements.map(p => p.key));
    expect(req.state.upcoming_pieces).toHaveLength(3);
  });
});

describe("Budget", () => {
  test("is exhausted once today's input tokens reach the cap", () => {
    const b = new Budget(1000, tmpLog());
    expect(b.exhausted).toBe(false);
    b.charge(1000);
    expect(b.exhausted).toBe(true);
  });
  test("rebuilds today's spend from the log at startup", async () => {
    const file = tmpLog();
    const log = new CallLog(file);
    await decide("k", "O", [], enumeratePlacements(emptyBoard(), "O"), log, new Budget(1_000_000, file),
      fakeJev({ type: "choice", choice: "r0x-1", confidence: 1 }));
    expect(new Budget(1_000_000, file).spent).toBe(700);
  });
  test("counts today's billed calls and all-time input tokens for cost display", async () => {
    const file = tmpLog();
    const log = new CallLog(file);
    const budget = new Budget(1_000_000, file);
    const placements = enumeratePlacements(emptyBoard(), "O");
    for (let i = 0; i < 3; i++) {
      await decide("k", "O", [], placements, log, budget, fakeJev({ type: "choice", choice: "r0x-1", confidence: 1 }));
    }
    expect(budget.callsToday).toBe(3);
    expect(new CallLog(file).inputTokens).toBe(2100);
    expect(new Budget(1_000_000, file).callsToday).toBe(3);
    expect(2100 * USD_PER_INPUT_TOKEN).toBeCloseTo(0.0000882, 10);
  });
});

describe("loadApiKey", () => {
  test("returns null when the file is missing", () => expect(loadApiKey("/nonexistent/jev.env")).toBeNull());
  test("reads TYPESAFE_API_KEY and strips quotes", async () => {
    const f = join(mkdtempSync(join(tmpdir(), "jev-key-")), "jev.env");
    await Bun.write(f, `# comment\nTYPESAFE_API_KEY="abc123"\n`);
    expect(loadApiKey(f)).toBe("abc123");
  });
});

describe("mulberry32 seed", () => {
  test("same seed gives the same sequence", () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
  test("different seeds diverge", () => {
    const a = mulberry32(1), b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });
});

test("piece shapes used by the server exist for all seven pieces", () => {
  expect(Object.keys(PIECES).sort()).toEqual(["I", "J", "L", "O", "S", "T", "Z"]);
  expect(refillBag([])).toHaveLength(7);
});
