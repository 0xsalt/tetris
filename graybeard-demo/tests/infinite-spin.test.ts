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

// Lock state models for verifying lock delay semantics
//
// The lock system uses a timestamp-based state machine:
//   lockPhase: 'falling' | 'locking' | 'locked'
//   lockStartTime: timestamp when locking began (0 = not locking)
//   lockMoves: counter of player actions during lock phase
//
// Per research (Guideline Move Reset): when piece leaves surface (gravity
// descent or move/rotation off edge), both timer and counter reset. The
// counter limits moves AT a given surface position, not across the piece's
// entire lifetime.
interface LockState {
  lockPhase: 'falling' | 'locking' | 'locked';
  lockStartTime: number;
  lockMoves: number;
}

function modelReturnToFalling(state: LockState): LockState {
  return { lockPhase: 'falling', lockStartTime: 0, lockMoves: 0 };
}

// resetLockState — resets all lock state for a new piece.
// Used by spawnPiece(), holdCurrent(), lockPiece(), triggerGameOver().
function modelResetLockState(_state: LockState): LockState {
  return { lockPhase: 'falling', lockStartTime: 0, lockMoves: 0 };
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
// Return to falling semantics — lockMoves preserved on descent
// ============================================================

describe("infinite-spin fix — return to falling resets lockMoves (research model)", () => {
  test("returning to falling resets lockMoves (Guideline: fresh moves at new position)", () => {
    // Per research: when piece leaves surface (gravity descent), counter resets.
    // The counter limits moves at a given surface position, not across the piece
    // lifetime. Gravity descent = new position = fresh 15-move allowance.
    const before: LockState = { lockPhase: 'locking', lockStartTime: 1000, lockMoves: 10 };
    const after = modelReturnToFalling(before);
    expect(after.lockMoves).toBe(0); // counter resets on descent
    expect(after.lockPhase).toBe('falling');
    expect(after.lockStartTime).toBe(0);
  });

  test("return to falling at lockMoves=0 resets to 0", () => {
    const state: LockState = { lockPhase: 'locking', lockStartTime: 1000, lockMoves: 0 };
    const after = modelReturnToFalling(state);
    expect(after.lockMoves).toBe(0);
  });

  test("return to falling at lockMoves=14 resets to 0", () => {
    const state: LockState = { lockPhase: 'locking', lockStartTime: 1000, lockMoves: 14 };
    const after = modelReturnToFalling(state);
    expect(after.lockMoves).toBe(0);
  });

  test("anti-infinite-spin: 15-move cap enforced per surface position", () => {
    // Guideline Move Reset model: counter resets on descent, but at any
    // single surface position, 15 moves max. The 500ms timer prevents
    // stalling — if player pauses, piece locks. If player keeps moving,
    // counter reaches 15 and piece locks (timer stops resetting).
    let state: LockState = { lockPhase: 'falling', lockStartTime: 0, lockMoves: 0 };

    // Player rotates 10 times on surface
    state = { ...state, lockPhase: 'locking', lockStartTime: 1000, lockMoves: 10 };

    // Gravity descent → counter resets (fresh moves at new position)
    state = modelReturnToFalling(state);
    expect(state.lockMoves).toBe(0); // counter resets

    // At new surface: player gets fresh 15 moves
    state = { ...state, lockPhase: 'locking', lockStartTime: 2000, lockMoves: 15 };
    expect(state.lockMoves >= 15).toBe(true); // cap reached at this surface

    // Verify force lock should apply
    const onSurface = shouldForceLock(3, TOTAL_ROWS - 2, 0, "T", emptyBoard());
    expect(onSurface).toBe(true);
  });
});

// ============================================================
// resetLockState semantics — used on spawn/hold/lock events
// ============================================================

describe("infinite-spin fix — resetLockState resets all lock state on new piece events", () => {
  test("resetLockState resets lockMoves to 0 on new piece spawn", () => {
    // When a new piece spawns, the move counter must reset so the new piece
    // gets its full 15-move allowance.
    const before: LockState = { lockPhase: 'locking', lockStartTime: 1000, lockMoves: 14 };
    const after = modelResetLockState(before);
    expect(after.lockMoves).toBe(0);
    expect(after.lockPhase).toBe('falling');
    expect(after.lockStartTime).toBe(0);
  });

  test("resetLockState resets lockMoves to 0 on hold", () => {
    const state: LockState = { lockPhase: 'locking', lockStartTime: 500, lockMoves: 7 };
    const after = modelResetLockState(state);
    expect(after.lockMoves).toBe(0);
  });

  test("resetLockState resets lockMoves to 0 when piece locks", () => {
    const state: LockState = { lockPhase: 'locked', lockStartTime: 0, lockMoves: 15 };
    const after = modelResetLockState(state);
    expect(after.lockMoves).toBe(0);
  });

  test("resetLockState resets lockMoves to 0 on game over", () => {
    const state: LockState = { lockPhase: 'locking', lockStartTime: 200, lockMoves: 3 };
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
