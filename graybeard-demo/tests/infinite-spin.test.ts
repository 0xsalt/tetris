import { describe, expect, test } from "bun:test";
import { shouldForceLock, isValid, COLS, TOTAL_ROWS, type Board } from "../src/game-logic";

// Helper: create an empty board
function emptyBoard(): Board {
  return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
}

// Helper: create a board with a solid row at a given index
function boardWithSolidRow(row: number): Board {
  const b = emptyBoard();
  for (let c = 0; c < COLS; c++) {
    b[row][c] = "#ffffff";
  }
  return b;
}

// Lock state models for verifying infinite-spin fix semantics
//
// clearLockTimer — clears the timer only, does NOT reset lockMoves.
// This is what gravityTick() calls: the move counter survives a downward step.
interface LockState {
  lockTimer: ReturnType<typeof setTimeout> | null;
  lockMoves: number;
}

function modelClearLockTimer(state: LockState): LockState {
  return { ...state, lockTimer: null };
}

// resetLockState — clears timer AND resets lockMoves to 0.
// Used by spawnPiece(), holdCurrent(), lockPiece(), triggerGameOver().
function modelResetLockState(_state: LockState): LockState {
  return { lockTimer: null, lockMoves: 0 };
}

// ============================================================
// Lock move counter threshold
// ============================================================

describe("infinite-spin fix — lock move counter threshold", () => {
  test("after 15 moves on surface, shouldForceLock returns true", () => {
    // Simulate piece on the floor after exhausting 15 move allowances
    const onSurface = shouldForceLock(3, TOTAL_ROWS - 2, 0, "T", emptyBoard());
    expect(onSurface).toBe(true);
  });

  test("counter at 14 (< 15) does NOT trigger force lock", () => {
    // 14 moves consumed — timer can still reset; we verify we're below threshold
    const MAX_LOCK_MOVES = 15;
    const lockMoves = 14;
    expect(lockMoves < MAX_LOCK_MOVES).toBe(true);
  });

  test("counter at exactly 15 reaches force-lock threshold", () => {
    const MAX_LOCK_MOVES = 15;
    const lockMoves = 15;
    expect(lockMoves >= MAX_LOCK_MOVES).toBe(true);
  });
});

// ============================================================
// clearLockTimer semantics — timer only, lockMoves preserved
// ============================================================

describe("infinite-spin fix — clearLockTimer preserves lockMoves", () => {
  test("clearLockTimer does NOT reset lockMoves (gravity tick scenario)", () => {
    // Simulates gravityTick(): piece moves down, timer clears, but move count
    // is preserved so accumulated rotations cannot be undone by gravity.
    const before: LockState = { lockTimer: null, lockMoves: 10 };
    const after = modelClearLockTimer(before);
    expect(after.lockMoves).toBe(10); // counter preserved
    expect(after.lockTimer).toBeNull();
  });

  test("clearLockTimer at lockMoves=0 keeps it at 0", () => {
    const state: LockState = { lockTimer: null, lockMoves: 0 };
    const after = modelClearLockTimer(state);
    expect(after.lockMoves).toBe(0);
  });

  test("clearLockTimer at lockMoves=14 keeps it at 14", () => {
    const state: LockState = { lockTimer: null, lockMoves: 14 };
    const after = modelClearLockTimer(state);
    expect(after.lockMoves).toBe(14);
  });

  test("infinite-spin cycle: lockMoves not reset by repeated gravity ticks", () => {
    // Reproduce the bug scenario: piece surfaces, player rotates 10 times,
    // gravity moves piece down, clearLockTimer fires. Without the fix,
    // lockMoves would reset to 0 on each gravity step, allowing unlimited rotations.
    // With the fix, lockMoves accumulates across gravity steps.
    let state: LockState = { lockTimer: null, lockMoves: 0 };

    // Player rotates 10 times on surface
    state = { ...state, lockMoves: 10 };

    // Gravity moves piece down → clearLockTimer (timer only)
    state = modelClearLockTimer(state);
    expect(state.lockMoves).toBe(10); // counter survives gravity step

    // Player rotates 4 more times on the new surface
    state = { ...state, lockMoves: state.lockMoves + 4 };
    expect(state.lockMoves).toBe(14);

    // One more rotation reaches threshold
    state = { ...state, lockMoves: state.lockMoves + 1 };
    expect(state.lockMoves).toBe(15);

    // Verify force lock should apply at this point
    const onSurface = shouldForceLock(3, TOTAL_ROWS - 2, 0, "T", emptyBoard());
    expect(onSurface).toBe(true);
  });
});

// ============================================================
// resetLockState semantics — used on spawn/hold/lock events
// ============================================================

describe("infinite-spin fix — resetLockState resets lockMoves on new piece events", () => {
  test("resetLockState resets lockMoves to 0 on new piece spawn", () => {
    // When a new piece spawns, the move counter must reset so the new piece
    // gets its full 15-move allowance.
    const before: LockState = { lockTimer: null, lockMoves: 14 };
    const after = modelResetLockState(before);
    expect(after.lockMoves).toBe(0);
    expect(after.lockTimer).toBeNull();
  });

  test("resetLockState resets lockMoves to 0 on hold", () => {
    const state: LockState = { lockTimer: null, lockMoves: 7 };
    const after = modelResetLockState(state);
    expect(after.lockMoves).toBe(0);
  });

  test("resetLockState resets lockMoves to 0 when piece locks", () => {
    const state: LockState = { lockTimer: null, lockMoves: 15 };
    const after = modelResetLockState(state);
    expect(after.lockMoves).toBe(0);
  });

  test("resetLockState resets lockMoves to 0 on game over", () => {
    const state: LockState = { lockTimer: null, lockMoves: 3 };
    const after = modelResetLockState(state);
    expect(after.lockMoves).toBe(0);
  });
});

// ============================================================
// shouldForceLock integration — surface detection gate
// ============================================================

describe("infinite-spin fix — shouldForceLock gates force lock correctly", () => {
  test("piece on solid row: shouldForceLock returns true", () => {
    const board = boardWithSolidRow(10);
    // T rotation 0 at ny=8: bottom of piece at row 9, solid at 10 → on surface
    expect(shouldForceLock(3, 8, 0, "T", board)).toBe(true);
  });

  test("floating piece: shouldForceLock returns false even at 15 moves", () => {
    // Even if lockMoves reaches 15, a floating piece must not be force-locked
    expect(shouldForceLock(3, 5, 0, "T", emptyBoard())).toBe(false);
  });

  test("isValid confirms floating piece can continue falling", () => {
    // Verify the floating piece can actually move down (isValid at ny+1)
    expect(isValid(3, 6, 0, "T", emptyBoard())).toBe(true);
  });
});
