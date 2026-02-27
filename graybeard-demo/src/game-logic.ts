// ============================================================
// game-logic.ts — Extracted Tetris game logic for testing
// ============================================================

// Board dimensions
export const COLS = 10;
export const ROWS = 20;
export const HIDDEN_ROWS = 2;
export const TOTAL_ROWS = ROWS + HIDDEN_ROWS; // 22

// Piece definitions: all 7 tetrominoes with 4 rotation matrices each (4x4)
export const PIECES: Record<string, { name: string; color: string; shadow: string; matrices: number[][][] }> = {
  I: {
    name: 'I',
    color: '#00e5ff',
    shadow: 'rgba(0, 229, 255, 0.3)',
    matrices: [
      [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
      [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
      [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
    ],
  },
  O: {
    name: 'O',
    color: '#ffee00',
    shadow: 'rgba(255, 238, 0, 0.3)',
    matrices: [
      [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    ],
  },
  T: {
    name: 'T',
    color: '#cc44ff',
    shadow: 'rgba(204, 68, 255, 0.3)',
    matrices: [
      [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
      [[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],
      [[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
    ],
  },
  S: {
    name: 'S',
    color: '#44ff88',
    shadow: 'rgba(68, 255, 136, 0.3)',
    matrices: [
      [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],
      [[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],
      [[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
    ],
  },
  Z: {
    name: 'Z',
    color: '#ff4444',
    shadow: 'rgba(255, 68, 68, 0.3)',
    matrices: [
      [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
      [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],
      [[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]],
    ],
  },
  J: {
    name: 'J',
    color: '#4466ff',
    shadow: 'rgba(68, 102, 255, 0.3)',
    matrices: [
      [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
      [[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]],
    ],
  },
  L: {
    name: 'L',
    color: '#ff8800',
    shadow: 'rgba(255, 136, 0, 0.3)',
    matrices: [
      [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],
      [[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],
      [[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
    ],
  },
};

// Wall kick data (SRS)
// Note: in the game's rotate(), kick ky is *subtracted* from piece.y,
// so positive ky moves the piece UP.
export const KICKS_NORMAL: Record<string, number[][]> = {
  '0->1': [[ 0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
  '1->2': [[ 0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
  '2->3': [[ 0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
  '3->0': [[ 0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
};

export const KICKS_I: Record<string, number[][]> = {
  '0->1': [[ 0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
  '1->2': [[ 0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
  '2->3': [[ 0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
  '3->0': [[ 0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
};

// Board cell type: null = empty, string = color
export type BoardCell = string | null;
export type Board = BoardCell[][];

/**
 * isValid — Check whether a piece position is valid on the board.
 *
 * Standard Tetris rule: cells with boardY < 0 are above the visible
 * playfield (hidden rows buffer). They are allowed — just skip the
 * collision check for those cells. This is the GH#1/GH#2 fix.
 *
 * @param nx         Piece X position (board column)
 * @param ny         Piece Y position (board row, 0 = first hidden row)
 * @param rot        Rotation index (0–3)
 * @param pieceName  Name of piece (key into PIECES)
 * @param board      The board array (TOTAL_ROWS x COLS)
 * @param cols       Number of columns (default COLS)
 * @param totalRows  Total rows including hidden (default TOTAL_ROWS)
 */
export function isValid(
  nx: number,
  ny: number,
  rot: number,
  pieceName: string,
  board: Board,
  cols: number = COLS,
  totalRows: number = TOTAL_ROWS,
): boolean {
  const p = PIECES[pieceName];
  if (!p) return false;
  const matrix = p.matrices[rot];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const boardX = nx + c;
      const boardY = ny + r;
      // Left/right wall bounds
      if (boardX < 0 || boardX >= cols) return false;
      // Below the floor
      if (boardY >= totalRows) return false;
      // Above the board (hidden rows): skip — standard Tetris spawn behavior
      if (boardY < 0) continue;
      // Occupied cell on the board
      if (board[boardY][boardX] !== null) return false;
    }
  }
  return true;
}

/**
 * shouldForceLock — Determine whether a piece at its current position
 * should be force-locked after exhausting lock-delay move allowance.
 *
 * Only force-lock if the piece is actually resting on a surface
 * (i.e. it cannot move down one row). If the piece is floating, let
 * gravity bring it down naturally instead of locking it mid-air.
 *
 * @param nx         Piece X position
 * @param ny         Piece Y position
 * @param rot        Rotation index
 * @param pieceName  Piece name
 * @param board      The board array
 * @param cols       Number of columns
 * @param totalRows  Total rows including hidden
 */
export function shouldForceLock(
  nx: number,
  ny: number,
  rot: number,
  pieceName: string,
  board: Board,
  cols: number = COLS,
  totalRows: number = TOTAL_ROWS,
): boolean {
  // The piece is on a surface when it cannot move down one row
  return !isValid(nx, ny + 1, rot, pieceName, board, cols, totalRows);
}
