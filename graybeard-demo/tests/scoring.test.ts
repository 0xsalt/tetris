import { describe, expect, test } from "bun:test";
import { getSpeed, addScore, LINE_POINTS, LINES_PER_LEVEL } from "../src/game-logic";

const emptyStats = () => ({ singles: 0, doubles: 0, triples: 0, tetris: 0 });

describe("getSpeed", () => {
  test("level 1 returns 800ms", () => {
    expect(getSpeed(1)).toBe(800);
  });

  test("level 15 returns 50ms", () => {
    expect(getSpeed(15)).toBe(50);
  });

  test("level above 15 caps at 50ms", () => {
    expect(getSpeed(20)).toBe(50);
    expect(getSpeed(100)).toBe(50);
  });

  test("intermediate levels decrease monotonically", () => {
    let prev = getSpeed(1);
    for (let lvl = 2; lvl <= 15; lvl++) {
      const cur = getSpeed(lvl);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("addScore", () => {
  test("0 lines cleared returns 0 points", () => {
    const result = addScore(0, 1, emptyStats());
    expect(result.points).toBe(0);
    expect(result.newLevel).toBe(1);
  });

  test("1 line at level 1 returns 100 points", () => {
    const result = addScore(1, 1, emptyStats());
    expect(result.points).toBe(LINE_POINTS[1] * 1);
    expect(result.points).toBe(100);
  });

  test("4 lines (Tetris) at level 1 returns 800 points", () => {
    const result = addScore(4, 1, emptyStats());
    expect(result.points).toBe(LINE_POINTS[4] * 1);
    expect(result.points).toBe(800);
  });

  test("4 lines at level 5 returns 4000 points", () => {
    const result = addScore(4, 5, emptyStats());
    expect(result.points).toBe(LINE_POINTS[4] * 5);
    expect(result.points).toBe(4000);
  });

  test("2 lines at level 3 returns 900 points", () => {
    const result = addScore(2, 3, emptyStats());
    expect(result.points).toBe(LINE_POINTS[2] * 3);
    expect(result.points).toBe(900);
  });

  test("stats: single increments singles", () => {
    const result = addScore(1, 1, emptyStats());
    expect(result.stats.singles).toBe(1);
    expect(result.stats.doubles).toBe(0);
    expect(result.stats.triples).toBe(0);
    expect(result.stats.tetris).toBe(0);
  });

  test("stats: double increments doubles", () => {
    const result = addScore(2, 1, emptyStats());
    expect(result.stats.doubles).toBe(1);
    expect(result.stats.singles).toBe(0);
  });

  test("stats: triple increments triples", () => {
    const result = addScore(3, 1, emptyStats());
    expect(result.stats.triples).toBe(1);
  });

  test("stats: tetris increments tetris", () => {
    const result = addScore(4, 1, emptyStats());
    expect(result.stats.tetris).toBe(1);
  });

  test("stats accumulate from existing stats", () => {
    const stats = { singles: 2, doubles: 1, triples: 0, tetris: 0 };
    const result = addScore(1, 1, stats);
    expect(result.stats.singles).toBe(3);
    expect(result.stats.doubles).toBe(1);
  });

  test("level progression: 10 lines advances level", () => {
    const result = addScore(4, 1, emptyStats(), 6, 6);
    expect(result.newLevel).toBe(2);
    expect(result.newLinesInLevel).toBe(0);
  });

  test("level progression: stays same level if under threshold", () => {
    const result = addScore(1, 1, emptyStats(), 0, 5);
    expect(result.newLevel).toBe(1);
    expect(result.newLinesInLevel).toBe(6);
  });

  test("level progression: can advance multiple levels at once", () => {
    // Start at level 1 with 9 lines in level, clear 4 lines (total 13 -> level 2 + 3 in level)
    const result = addScore(4, 1, emptyStats(), 0, 9);
    expect(result.newLevel).toBe(2);
    expect(result.newLinesInLevel).toBe(3);
  });

  test("LINES_PER_LEVEL is 10", () => {
    expect(LINES_PER_LEVEL).toBe(10);
  });

  test("LINE_POINTS array is correct", () => {
    expect(LINE_POINTS[0]).toBe(0);
    expect(LINE_POINTS[1]).toBe(100);
    expect(LINE_POINTS[2]).toBe(300);
    expect(LINE_POINTS[3]).toBe(500);
    expect(LINE_POINTS[4]).toBe(800);
  });
});
