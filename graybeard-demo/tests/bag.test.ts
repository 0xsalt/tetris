import { describe, expect, test } from "bun:test";
import { refillBag, nextFromBag, PIECE_NAMES } from "../src/game-logic";

describe("refillBag", () => {
  test("refillBag([]) returns 7 pieces", () => {
    const bag = refillBag([]);
    expect(bag.length).toBe(7);
  });

  test("refillBag result contains all 7 piece names", () => {
    const bag = refillBag([]);
    const sorted = [...bag].sort();
    expect(sorted).toEqual([...PIECE_NAMES].sort());
  });

  test("refillBag appends to existing bag", () => {
    const existing = ["I", "O"];
    const bag = refillBag(existing);
    expect(bag.length).toBe(9);
    expect(bag[0]).toBe("I");
    expect(bag[1]).toBe("O");
  });

  test("each refill is a shuffled permutation of all 7 pieces", () => {
    const bag = refillBag([]);
    const pieceSet = new Set(PIECE_NAMES);
    for (const piece of bag) {
      expect(pieceSet.has(piece)).toBe(true);
    }
  });

  test("PIECE_NAMES contains exactly 7 entries", () => {
    expect(PIECE_NAMES.length).toBe(7);
  });

  test("PIECE_NAMES includes all standard tetromino names", () => {
    const expected = ["I", "O", "T", "S", "Z", "J", "L"];
    for (const name of expected) {
      expect(PIECE_NAMES).toContain(name);
    }
  });
});

describe("nextFromBag", () => {
  test("returns first piece from bag", () => {
    const bag = ["T", "I", "O", "S", "Z", "J", "L"];
    const { piece, bag: remaining } = nextFromBag(bag);
    expect(piece).toBe("T");
    expect(remaining).toEqual(["I", "O", "S", "Z", "J", "L"]);
  });

  test("returned bag has one fewer piece", () => {
    const bag = refillBag([]);
    const { bag: remaining } = nextFromBag(bag);
    expect(remaining.length).toBe(6);
  });

  test("auto-refills when bag has fewer than 5 pieces", () => {
    const smallBag = ["I", "O", "T", "S"];
    const { bag: remaining } = nextFromBag(smallBag);
    // 4 pieces → triggers refill → 4 - 1 consumed + 7 added = 10
    expect(remaining.length).toBe(10);
  });

  test("does not auto-refill when bag has 5 or more pieces", () => {
    const bag = ["I", "O", "T", "S", "Z"];
    const { bag: remaining } = nextFromBag(bag);
    expect(remaining.length).toBe(4);
  });

  test("auto-refill at threshold of exactly 5 pieces does not refill", () => {
    const bag = ["I", "O", "T", "S", "Z"];
    const { piece, bag: remaining } = nextFromBag(bag);
    expect(piece).toBe("I");
    expect(remaining.length).toBe(4);
  });
});

describe("7-bag guarantee", () => {
  test("every 7 consecutive pieces contain all 7 piece names", () => {
    let bag: string[] = [];
    const pieces: string[] = [];

    // Draw 35 pieces (5 full bags)
    for (let i = 0; i < 35; i++) {
      const { piece, bag: remaining } = nextFromBag(bag);
      pieces.push(piece);
      bag = remaining;
    }

    // Each group of 7 must be a permutation of all pieces
    for (let i = 0; i < 35; i += 7) {
      const group = pieces.slice(i, i + 7).sort();
      expect(group).toEqual([...PIECE_NAMES].sort());
    }
  });

  test("no duplicate pieces within a single bag draw", () => {
    const bag = refillBag([]);
    const seen = new Set(bag);
    expect(seen.size).toBe(7);
  });
});
