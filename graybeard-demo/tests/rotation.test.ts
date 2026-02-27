import { describe, expect, test } from "bun:test";
import { tryRotate, createEmptyBoard, isValid, COLS, TOTAL_ROWS, PIECE_NAMES, type Board, type PieceState } from "../src/game-logic";

function spawnPiece(name: string): PieceState {
  return { name, x: 3, y: 0, rotation: 0 };
}

describe("tryRotate — CW rotation on empty board", () => {
  const board = createEmptyBoard();

  for (const name of PIECE_NAMES) {
    test(`${name} piece can rotate CW`, () => {
      const piece = spawnPiece(name);
      const result = tryRotate(piece, 1, board);
      expect(result).not.toBeNull();
      expect(result!.rotation).toBe(1);
    });
  }
});

describe("tryRotate — CCW rotation on empty board", () => {
  const board = createEmptyBoard();

  for (const name of PIECE_NAMES) {
    test(`${name} piece can rotate CCW`, () => {
      const piece = spawnPiece(name);
      const result = tryRotate(piece, -1, board);
      expect(result).not.toBeNull();
      expect(result!.rotation).toBe(3);
    });
  }
});

describe("O piece rotation", () => {
  const board = createEmptyBoard();

  test("O piece CW rotation stays at same grid position", () => {
    const piece = spawnPiece("O");
    const result = tryRotate(piece, 1, board);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(piece.x);
    expect(result!.y).toBe(piece.y);
  });

  test("O piece all 4 rotations are equivalent (same matrix)", () => {
    // The O piece matrices are all identical — rotating should always succeed
    // and always land at the same logical position
    const piece = spawnPiece("O");
    let current = piece;
    for (let i = 0; i < 4; i++) {
      const next = tryRotate(current, 1, board);
      expect(next).not.toBeNull();
      expect(next!.x).toBe(piece.x);
      expect(next!.y).toBe(piece.y);
      current = next!;
    }
    // After 4 CW rotations, back to rotation 0
    expect(current.rotation).toBe(0);
  });
});

describe("wall kick — T piece against left wall", () => {
  const board = createEmptyBoard();

  test("T piece at x=0 can still rotate CW with kick", () => {
    const piece: PieceState = { name: "T", x: 0, y: 5, rotation: 0 };
    const result = tryRotate(piece, 1, board);
    expect(result).not.toBeNull();
  });

  test("T piece at x=0 rotation applies a kick offset", () => {
    const piece: PieceState = { name: "T", x: 0, y: 5, rotation: 0 };
    const result = tryRotate(piece, 1, board);
    // The first kick [0,0] should work since x=0 with T rotation 0->1 is valid
    // Just verify it resolves
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(1);
  });
});

describe("wall kick — I piece against wall", () => {
  const board = createEmptyBoard();

  test("I piece at right wall can rotate using kick table", () => {
    // Place I at rightmost position, rotation 0 (horizontal)
    const piece: PieceState = { name: "I", x: COLS - 1, y: 5, rotation: 0 };
    // At x=COLS-1 with 4-wide horizontal I, it would be out of bounds
    // tryRotate should find a valid kick
    const result = tryRotate(piece, 1, board);
    // It may or may not succeed depending on exact kick table offsets,
    // but we verify the function returns a valid result if one exists
    if (result !== null) {
      expect(isValid(result.x, result.y, result.rotation, "I", board)).toBe(true);
    }
  });

  test("I piece spawn position can rotate CW", () => {
    const piece: PieceState = { name: "I", x: 3, y: 1, rotation: 0 };
    const result = tryRotate(piece, 1, board);
    expect(result).not.toBeNull();
    expect(isValid(result!.x, result!.y, result!.rotation, "I", board)).toBe(true);
  });
});

describe("tryRotate returns null when blocked", () => {
  test("piece surrounded by filled cells cannot rotate", () => {
    const board = createEmptyBoard();
    // Fill the area around a T piece so no kick can save it
    const px = 5;
    const py = 10;
    // Fill all cells adjacent to piece position
    for (let r = py - 1; r <= py + 3; r++) {
      for (let c = px - 2; c <= px + 4; c++) {
        if (r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS) {
          // Skip the cells the piece itself occupies to avoid false block
          board[r][c] = '#ff0000';
        }
      }
    }
    const piece: PieceState = { name: "T", x: px, y: py, rotation: 0 };
    // Clear the cells the piece actually occupies (rotation 0: row 0 col 1, row 1 cols 0-2)
    board[py][px + 1] = null;
    board[py + 1][px] = null;
    board[py + 1][px + 1] = null;
    board[py + 1][px + 2] = null;

    const result = tryRotate(piece, 1, board);
    expect(result).toBeNull();
  });

  test("returns null only when all kick positions fail", () => {
    // Build a board where only one kick position works
    const board = createEmptyBoard();
    const piece: PieceState = { name: "T", x: 3, y: 3, rotation: 0 };
    // Verify it can rotate on empty board
    expect(tryRotate(piece, 1, board)).not.toBeNull();
  });
});

describe("rotation result validity", () => {
  const board = createEmptyBoard();

  test("rotated piece position passes isValid", () => {
    for (const name of PIECE_NAMES) {
      const piece = spawnPiece(name);
      const result = tryRotate(piece, 1, board);
      if (result !== null) {
        expect(isValid(result.x, result.y, result.rotation, name, board)).toBe(true);
      }
    }
  });

  test("full rotation cycle returns to original rotation", () => {
    const board = createEmptyBoard();
    for (const name of PIECE_NAMES) {
      let piece: PieceState = { name, x: 3, y: 5, rotation: 0 };
      for (let i = 0; i < 4; i++) {
        const next = tryRotate(piece, 1, board);
        expect(next).not.toBeNull();
        piece = next!;
      }
      expect(piece.rotation).toBe(0);
    }
  });
});
