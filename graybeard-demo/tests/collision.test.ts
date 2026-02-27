import { describe, expect, test } from "bun:test";
import { isValid, COLS, ROWS, HIDDEN_ROWS, TOTAL_ROWS, type Board } from "../src/game-logic";

// Helper: create an empty board (TOTAL_ROWS x COLS, all null)
function emptyBoard(): Board {
  return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
}

// Helper: place a color at a specific board row/col
function boardWithCell(row: number, col: number, color = "#ff0000"): Board {
  const b = emptyBoard();
  b[row][col] = color;
  return b;
}

describe("isValid — constants", () => {
  test("COLS is 10", () => expect(COLS).toBe(10));
  test("ROWS is 20", () => expect(ROWS).toBe(20));
  test("HIDDEN_ROWS is 2", () => expect(HIDDEN_ROWS).toBe(2));
  test("TOTAL_ROWS is 22", () => expect(TOTAL_ROWS).toBe(22));
});

describe("isValid — empty board basic positions", () => {
  test("T piece at center of empty board is valid", () => {
    // T rotation 0: [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]]
    // nx=3, ny=5 — well within bounds
    expect(isValid(3, 5, 0, "T", emptyBoard())).toBe(true);
  });

  test("I piece at top of empty board is valid (spawn region)", () => {
    // Standard spawn at nx=3, ny=0
    // I rotation 0 row 1 has the 4 filled cells → boardY = 0+1 = 1 (visible)
    expect(isValid(3, 0, 0, "I", emptyBoard())).toBe(true);
  });
});

describe("isValid — above board (boardY < 0) — GH#1/GH#2 fix", () => {
  test("piece cells above board (boardY < 0) are skipped — returns true", () => {
    // T rotation 0: rows 0 and 1 have cells. Place piece at ny=-1.
    // boardY for row 0 = -1+0 = -1 (skipped), boardY for row 1 = -1+1 = 0 (visible, empty)
    expect(isValid(3, -1, 0, "T", emptyBoard())).toBe(true);
  });

  test("piece fully above board (all cells boardY < 0) is valid", () => {
    // T rotation 0 has filled cells in rows 0 and 1 of the matrix.
    // At ny=-3: boardY for matrix row 0 = -3, row 1 = -2, row 2 = -1, row 3 = 0.
    // Row 3 of T rotation 0 is all zeros, so no cells hit the board. All active cells < 0.
    expect(isValid(3, -3, 0, "T", emptyBoard())).toBe(true);
  });

  test("wall kick near ceiling — piece with some cells at boardY < 0 is valid", () => {
    // I piece rotation 0 occupies matrix row 1.
    // At ny=-1: boardY = -1+1 = 0 → visible, should be valid on empty board.
    expect(isValid(3, -1, 0, "I", emptyBoard())).toBe(true);
  });

  test("piece above board still respects left wall", () => {
    // T rotation 0 at nx=-1, ny=-2: some cells will have boardX < 0
    // T row 1 = [1,1,1,0] → boardX = -1, 0, 1, skip
    // boardX = -1 → return false
    expect(isValid(-1, -2, 0, "T", emptyBoard())).toBe(false);
  });
});

describe("isValid — wall bounds", () => {
  test("returns false when piece hits left wall", () => {
    // T rotation 0 at nx=-1: matrix row 1 col 0 → boardX=-1 → false
    expect(isValid(-1, 5, 0, "T", emptyBoard())).toBe(false);
  });

  test("returns false when piece hits right wall", () => {
    // T rotation 0 width spans cols 0–2. At nx=8, col 2 → boardX=10 >= COLS(10) → false
    expect(isValid(8, 5, 0, "T", emptyBoard())).toBe(false);
  });

  test("returns false when piece hits floor", () => {
    // T rotation 0 occupies matrix rows 0 and 1.
    // At ny = TOTAL_ROWS - 1 = 21: matrix row 1 → boardY = 22 >= TOTAL_ROWS → false
    expect(isValid(3, TOTAL_ROWS - 1, 0, "T", emptyBoard())).toBe(false);
  });

  test("returns true at one row above floor", () => {
    // T rotation 0 occupies matrix rows 0 and 1.
    // At ny = TOTAL_ROWS - 2 = 20: matrix row 1 → boardY = 21 = TOTAL_ROWS - 1 → still valid
    expect(isValid(3, TOTAL_ROWS - 2, 0, "T", emptyBoard())).toBe(true);
  });
});

describe("isValid — occupied cell collision", () => {
  test("returns false when piece overlaps existing block", () => {
    // T rotation 0 center cell at matrix[1][1] → boardX = nx+1, boardY = ny+1
    // Place a block at (6, 6) and put piece at nx=5, ny=5
    const board = boardWithCell(6, 6);
    expect(isValid(5, 5, 0, "T", board)).toBe(false);
  });

  test("returns true when adjacent to block but not overlapping", () => {
    // Block at (6, 9) (far right), T piece at nx=3, ny=5 — no overlap
    const board = boardWithCell(6, 9);
    expect(isValid(3, 5, 0, "T", board)).toBe(true);
  });

  test("returns false when I piece overlaps a block", () => {
    // I rotation 0: matrix row 1 = [1,1,1,1], at nx=3, ny=4: fills boardY=5, boardX=3,4,5,6
    const board = boardWithCell(5, 4);
    expect(isValid(3, 4, 0, "I", board)).toBe(false);
  });

  test("returns true when I piece is above a block", () => {
    // I rotation 0 at nx=3, ny=4 fills boardY=5. Block at row 6 → no overlap.
    const board = boardWithCell(6, 4);
    expect(isValid(3, 4, 0, "I", board)).toBe(true);
  });
});

describe("isValid — O piece (2x2 shape, all rotations identical)", () => {
  test("O piece valid in center", () => {
    expect(isValid(4, 4, 0, "O", emptyBoard())).toBe(true);
  });

  test("O piece invalid against right wall", () => {
    // O occupies cols 1–2 of the 4-wide matrix. At nx=9: col 2 → boardX=11 >= COLS → false
    expect(isValid(9, 4, 0, "O", emptyBoard())).toBe(false);
  });
});
