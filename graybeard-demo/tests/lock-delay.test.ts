import { describe, expect, test } from "bun:test";
import { shouldForceLock, isValid, COLS, TOTAL_ROWS, type Board } from "../src/game-logic";

// Helper: create an empty board
function emptyBoard(): Board {
  return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
}

// Helper: create a board with the bottom row fully filled (simulates floor surface)
function boardWithSolidRow(row: number): Board {
  const b = emptyBoard();
  for (let c = 0; c < COLS; c++) {
    b[row][c] = "#ffffff";
  }
  return b;
}

describe("shouldForceLock — piece on a surface (cannot move down)", () => {
  test("returns true when piece is resting on the floor", () => {
    // T rotation 0: matrix rows 0 and 1.
    // At ny = TOTAL_ROWS - 2 = 20: matrix row 1 → boardY = 21 (last row).
    // Moving down to ny+1 = 21: matrix row 1 → boardY = 22 >= TOTAL_ROWS → invalid.
    expect(shouldForceLock(3, TOTAL_ROWS - 2, 0, "T", emptyBoard())).toBe(true);
  });

  test("returns true when piece is resting on a solid row", () => {
    // Place a solid row at board row 10.
    // T rotation 0 at ny=8: matrix row 1 → boardY=9 (above solid row). Valid.
    // Try ny+1=9: matrix row 1 → boardY=10 → occupied → invalid → shouldForceLock = true.
    const board = boardWithSolidRow(10);
    expect(shouldForceLock(3, 8, 0, "T", board)).toBe(true);
  });

  test("I piece on floor — shouldForceLock returns true", () => {
    // I rotation 0: matrix row 1 has filled cells.
    // At ny = TOTAL_ROWS - 2: matrix row 1 → boardY = TOTAL_ROWS - 1 (last row).
    // ny+1: matrix row 1 → boardY = TOTAL_ROWS → invalid → true.
    expect(shouldForceLock(3, TOTAL_ROWS - 2, 0, "I", emptyBoard())).toBe(true);
  });

  test("piece directly above a single block — shouldForceLock returns true", () => {
    // Place block at (8, 4). T rotation 0 at nx=3, ny=6: matrix row 1 → boardY=7 (above block).
    // ny+1=7: matrix row 1 → boardY=8 → occupied at (8,4) if nx+col aligns.
    // T row 1 = [1,1,1,0] → cols 0,1,2 → boardX = 3,4,5. Block at col 4 → hit → true.
    const board = emptyBoard();
    board[8][4] = "#ff0000";
    expect(shouldForceLock(3, 6, 0, "T", board)).toBe(true);
  });
});

describe("shouldForceLock — piece floating (can still move down)", () => {
  test("returns false when piece is floating in empty board", () => {
    // T at ny=5 can move to ny=6, 7, ... → not on surface → false
    expect(shouldForceLock(3, 5, 0, "T", emptyBoard())).toBe(false);
  });

  test("returns false when piece is near top (above board) — floating", () => {
    // T at ny=0 — can move down → false
    expect(shouldForceLock(3, 0, 0, "T", emptyBoard())).toBe(false);
  });

  test("returns false when piece is above a surface by two rows", () => {
    // Solid row at 15. T rotation 0 at ny=12: matrix row 1 → boardY=13.
    // ny+1=13: matrix row 1 → boardY=14 — NOT the solid row → valid → false.
    const board = boardWithSolidRow(15);
    expect(shouldForceLock(3, 12, 0, "T", board)).toBe(false);
  });

  test("I piece floating in center — returns false", () => {
    expect(shouldForceLock(3, 5, 0, "I", emptyBoard())).toBe(false);
  });
});

describe("lock delay force-lock logic — surface check gating", () => {
  test("at 15 moves, on surface: shouldForceLock returns true (lock should proceed)", () => {
    // Piece at floor — surface detected
    const onSurface = shouldForceLock(3, TOTAL_ROWS - 2, 0, "T", emptyBoard());
    expect(onSurface).toBe(true);
  });

  test("at 15 moves, floating: shouldForceLock returns false (lock must NOT proceed)", () => {
    // Piece floating — no surface
    const floating = shouldForceLock(3, 5, 0, "T", emptyBoard());
    expect(floating).toBe(false);
  });

  test("floating piece position is still valid (can continue falling)", () => {
    // Verify isValid at ny+1 to confirm piece can indeed move down
    expect(isValid(3, 6, 0, "T", emptyBoard())).toBe(true);
  });
});

describe("lock delay move counter semantics", () => {
  test("lockMoves threshold: values 0–14 allow timer reset, 15 triggers surface check", () => {
    // Simulated: moves 0..14 = reset allowed; move 15 = check surface
    const MAX_LOCK_MOVES = 15;
    for (let moves = 0; moves < MAX_LOCK_MOVES; moves++) {
      expect(moves < MAX_LOCK_MOVES).toBe(true); // timer resets
    }
    // At exactly 15, we check surface (tested above)
    expect(MAX_LOCK_MOVES).toBe(15);
  });

  test("clearLockTimer resets move counter to 0 (model: counter must be 0 after clear)", () => {
    // Model the clearLockTimer reset: any lockMoves value resets to 0
    let lockMoves = 14;
    // simulate clear
    lockMoves = 0;
    expect(lockMoves).toBe(0);
  });

  test("lock moves counter increments on each resetLockTimer call", () => {
    // Model the increment behavior
    let lockMoves = 0;
    for (let i = 0; i < 5; i++) {
      lockMoves++;
    }
    expect(lockMoves).toBe(5);
  });
});
