import { describe, expect, test } from "bun:test";
import { clearLines, createEmptyBoard, COLS, TOTAL_ROWS, type Board } from "../src/game-logic";

describe("clearLines", () => {
  test("empty board — no lines cleared, board unchanged", () => {
    const board = createEmptyBoard();
    const result = clearLines(board);
    expect(result.cleared).toEqual([]);
    expect(result.board).toBe(board); // same reference when nothing cleared
    expect(result.board.length).toBe(TOTAL_ROWS);
  });

  test("single full row — returns correct index, board updated", () => {
    const board = createEmptyBoard();
    // Fill the last visible row (row TOTAL_ROWS - 1)
    const targetRow = TOTAL_ROWS - 1;
    board[targetRow] = Array(COLS).fill('#ff0000');
    const result = clearLines(board);
    expect(result.cleared).toEqual([targetRow]);
    expect(result.board.length).toBe(TOTAL_ROWS);
    // Top row should be empty (new row added at top)
    expect(result.board[0].every(cell => cell === null)).toBe(true);
    // No full rows remain
    expect(result.board.every(row => !row.every(cell => cell !== null))).toBe(true);
  });

  test("double clear — two full rows cleared", () => {
    const board = createEmptyBoard();
    board[TOTAL_ROWS - 1] = Array(COLS).fill('#00ff00');
    board[TOTAL_ROWS - 2] = Array(COLS).fill('#0000ff');
    const result = clearLines(board);
    expect(result.cleared).toHaveLength(2);
    expect(result.cleared).toContain(TOTAL_ROWS - 1);
    expect(result.cleared).toContain(TOTAL_ROWS - 2);
    expect(result.board.length).toBe(TOTAL_ROWS);
  });

  test("triple clear — three full rows cleared", () => {
    const board = createEmptyBoard();
    board[TOTAL_ROWS - 1] = Array(COLS).fill('#ff0000');
    board[TOTAL_ROWS - 2] = Array(COLS).fill('#ff0000');
    board[TOTAL_ROWS - 3] = Array(COLS).fill('#ff0000');
    const result = clearLines(board);
    expect(result.cleared).toHaveLength(3);
    expect(result.board.length).toBe(TOTAL_ROWS);
  });

  test("tetris — four full rows cleared", () => {
    const board = createEmptyBoard();
    for (let r = TOTAL_ROWS - 4; r < TOTAL_ROWS; r++) {
      board[r] = Array(COLS).fill('#00ffff');
    }
    const result = clearLines(board);
    expect(result.cleared).toHaveLength(4);
    expect(result.board.length).toBe(TOTAL_ROWS);
  });

  test("partial rows — not cleared", () => {
    const board = createEmptyBoard();
    // Fill all but last column
    board[TOTAL_ROWS - 1] = Array(COLS).fill('#ff0000');
    board[TOTAL_ROWS - 1][COLS - 1] = null;
    const result = clearLines(board);
    expect(result.cleared).toEqual([]);
    expect(result.board).toBe(board);
  });

  test("mixed full and partial rows — only full rows cleared", () => {
    const board = createEmptyBoard();
    // Full row
    board[TOTAL_ROWS - 1] = Array(COLS).fill('#ff0000');
    // Partial row
    board[TOTAL_ROWS - 2] = Array(COLS).fill('#00ff00');
    board[TOTAL_ROWS - 2][0] = null;
    const result = clearLines(board);
    expect(result.cleared).toEqual([TOTAL_ROWS - 1]);
    expect(result.board.length).toBe(TOTAL_ROWS);
  });

  test("board dimensions preserved after clearing", () => {
    const board = createEmptyBoard();
    for (let r = 0; r < TOTAL_ROWS; r++) {
      board[r] = Array(COLS).fill('#aabbcc');
    }
    const result = clearLines(board);
    expect(result.cleared).toHaveLength(TOTAL_ROWS);
    expect(result.board.length).toBe(TOTAL_ROWS);
    expect(result.board[0].length).toBe(COLS);
    // All rows should be empty after clearing entire board
    expect(result.board.every(row => row.every(cell => cell === null))).toBe(true);
  });
});
