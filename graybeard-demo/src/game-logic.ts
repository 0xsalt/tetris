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

// Scoring constants
export const LINE_POINTS = [0, 100, 300, 500, 800];
export const LINES_PER_LEVEL = 10;
export const PIECE_NAMES = Object.keys(PIECES);

// Board cell type: null = empty, string = color
export type BoardCell = string | null;
export type Board = BoardCell[][];

// Piece state for pure rotation/ghost functions
export interface PieceState {
  name: string;
  x: number;
  y: number;
  rotation: number;
}

// Score result from addScore
export interface ScoreResult {
  points: number;
  newLevel: number;
  newLines: number;
  newLinesInLevel: number;
  stats: { singles: number; doubles: number; triples: number; tetris: number };
}

// Line clear result
export interface ClearResult {
  board: Board;
  cleared: number[];
}

// ============================================================
// Speed
// ============================================================

export function getSpeed(level: number): number {
  const speeds = [800, 717, 633, 550, 467, 383, 300, 217, 133, 100, 83, 83, 83, 67, 50];
  return speeds[Math.min(level - 1, speeds.length - 1)];
}

// ============================================================
// Board helpers
// ============================================================

export function createEmptyBoard(rows: number = TOTAL_ROWS, cols: number = COLS): Board {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

// ============================================================
// Bag (7-bag randomizer)
// ============================================================

export function refillBag(bag: string[]): string[] {
  const newBag = [...PIECE_NAMES];
  for (let i = newBag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newBag[i], newBag[j]] = [newBag[j], newBag[i]];
  }
  return [...bag, ...newBag];
}

export function nextFromBag(bag: string[]): { piece: string; bag: string[] } {
  let currentBag = bag;
  if (currentBag.length < 5) {
    currentBag = refillBag(currentBag);
  }
  const [piece, ...rest] = currentBag;
  return { piece, bag: rest };
}

// ============================================================
// Line clearing
// ============================================================

export function clearLines(board: Board, cols: number = COLS): ClearResult {
  const cleared: number[] = [];
  for (let r = 0; r < board.length; r++) {
    if (board[r].every(cell => cell !== null)) {
      cleared.push(r);
    }
  }

  if (cleared.length === 0) {
    return { board, cleared: [] };
  }

  // Create new board without cleared rows, add empty rows at top
  const newBoard = board.filter((_, i) => !cleared.includes(i));
  while (newBoard.length < board.length) {
    newBoard.unshift(Array(cols).fill(null));
  }

  return { board: newBoard, cleared };
}

// ============================================================
// Scoring
// ============================================================

export function addScore(
  linesCleared: number,
  level: number,
  currentStats: { singles: number; doubles: number; triples: number; tetris: number },
  currentLines: number = 0,
  currentLinesInLevel: number = 0,
): ScoreResult {
  if (linesCleared === 0) {
    return {
      points: 0,
      newLevel: level,
      newLines: currentLines,
      newLinesInLevel: currentLinesInLevel,
      stats: { ...currentStats },
    };
  }

  const points = LINE_POINTS[linesCleared] * level;
  const newLines = currentLines + linesCleared;
  let newLinesInLevel = currentLinesInLevel + linesCleared;
  let newLevel = level;

  const stats = { ...currentStats };
  if (linesCleared === 1) stats.singles++;
  else if (linesCleared === 2) stats.doubles++;
  else if (linesCleared === 3) stats.triples++;
  else if (linesCleared === 4) stats.tetris++;

  while (newLinesInLevel >= LINES_PER_LEVEL) {
    newLinesInLevel -= LINES_PER_LEVEL;
    newLevel++;
  }

  return { points, newLevel, newLines, newLinesInLevel, stats };
}

// ============================================================
// Rotation (SRS wall kicks)
// ============================================================

export function tryRotate(piece: PieceState, dir: number, board: Board, cols: number = COLS, totalRows: number = TOTAL_ROWS): PieceState | null {
  const oldRot = piece.rotation;
  const newRot = (oldRot + dir + 4) % 4;
  const kicks = piece.name === 'I' ? KICKS_I : KICKS_NORMAL;
  const key = `${oldRot}->${newRot}`;
  const kickTable = kicks[key] || [[0, 0]];

  for (const [kx, ky] of kickTable) {
    if (isValid(piece.x + kx, piece.y - ky, newRot, piece.name, board, cols, totalRows)) {
      return {
        name: piece.name,
        x: piece.x + kx,
        y: piece.y - ky,
        rotation: newRot,
      };
    }
  }

  return null;
}

// ============================================================
// Ghost piece
// ============================================================

export function getGhostY(piece: PieceState, board: Board, cols: number = COLS, totalRows: number = TOTAL_ROWS): number {
  let gy = piece.y;
  while (isValid(piece.x, gy + 1, piece.rotation, piece.name, board, cols, totalRows)) {
    gy++;
  }
  return gy;
}

// ============================================================
// Collision / validity
// ============================================================

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
