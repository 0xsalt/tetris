// ============================================================
// placements.ts — Every legal final landing spot for a piece,
// with the features Jev weighs. Arithmetic stays here in code;
// Jev only sees the plain-English description of each option.
// ============================================================

import { COLS, TOTAL_ROWS, HIDDEN_ROWS, PIECES, isValid, type Board } from "../game-logic";

export interface Placement {
  key: string;          // "r<rotation>x<column>", e.g. "r1x-1"
  rotation: number;
  x: number;
  y: number;            // resting row of the piece matrix origin
  linesCleared: number;
  holesAdded: number;
  heightAfter: number;  // tallest column after the drop, 0..ROWS
  bumpinessAfter: number;
  columns: [number, number];
}

function columnHeights(board: Board): number[] {
  const heights = Array(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (board[r][c] !== null) {
        heights[c] = TOTAL_ROWS - r;
        break;
      }
    }
  }
  return heights;
}

function countHoles(board: Board): number {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let covered = false;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (board[r][c] !== null) covered = true;
      else if (covered) holes++;
    }
  }
  return holes;
}

function bumpiness(heights: number[]): number {
  let sum = 0;
  for (let c = 0; c < COLS - 1; c++) sum += Math.abs(heights[c] - heights[c + 1]);
  return sum;
}

/** Enumerate every distinct resting spot reachable by rotating at spawn height and dropping straight down. */
export function enumeratePlacements(board: Board, pieceName: string): Placement[] {
  const piece = PIECES[pieceName];
  if (!piece) throw new Error(`unknown piece: ${pieceName}`);
  const holesBefore = countHoles(board);
  const seen = new Set<string>();
  const out: Placement[] = [];

  for (let rotation = 0; rotation < 4; rotation++) {
    const matrix = piece.matrices[rotation];
    for (let x = -3; x < COLS; x++) {
      if (!isValid(x, 0, rotation, pieceName, board)) continue;
      let y = 0;
      while (isValid(x, y + 1, rotation, pieceName, board)) y++;

      const cells: [number, number][] = [];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (matrix[r][c]) cells.push([y + r, x + c]);
        }
      }
      const signature = cells.map(([r, c]) => `${r},${c}`).sort().join(";");
      if (seen.has(signature)) continue; // O-piece and I/S/Z rotations land identically
      seen.add(signature);

      const after = board.map(row => [...row]);
      for (const [r, c] of cells) if (r >= 0) after[r][c] = piece.color;
      const kept = after.filter(row => row.some(cell => cell === null));
      const linesCleared = TOTAL_ROWS - kept.length;
      while (kept.length < TOTAL_ROWS) kept.unshift(Array(COLS).fill(null));

      const heights = columnHeights(kept);
      const cols = cells.map(([, c]) => c);
      out.push({
        key: `r${rotation}x${x}`,
        rotation,
        x,
        y,
        linesCleared,
        holesAdded: countHoles(kept) - holesBefore,
        heightAfter: Math.max(...heights),
        bumpinessAfter: bumpiness(heights),
        columns: [Math.min(...cols), Math.max(...cols)],
      });
    }
  }
  return out;
}

/** Plain-English outcome of one placement. Numbers are bucketed into words, per Jev's guidance. */
export function describePlacement(p: Placement): string {
  const lines = ["clears no lines", "clears 1 line", "clears 2 lines", "clears 3 lines", "clears 4 lines (a Tetris)"][p.linesCleared];
  const holes = p.holesAdded <= 0 ? "creates no new covered holes"
    : p.holesAdded === 1 ? "creates 1 new covered hole"
    : "creates several new covered holes";
  const visible = TOTAL_ROWS - HIDDEN_ROWS;
  const height = p.heightAfter <= visible * 0.3 ? "stack stays low"
    : p.heightAfter <= visible * 0.6 ? "stack at medium height"
    : p.heightAfter <= visible * 0.8 ? "stack gets high"
    : "stack near the top, close to losing";
  const surface = p.bumpinessAfter <= 4 ? "surface stays flat"
    : p.bumpinessAfter <= 10 ? "surface somewhat uneven"
    : "surface jagged";
  const span = p.columns[0] === p.columns[1] ? `column ${p.columns[0] + 1}` : `columns ${p.columns[0] + 1}-${p.columns[1] + 1}`;
  return `Lands in ${span}; ${lines}; ${holes}; ${height}; ${surface}.`;
}

/** Board from the wire format: TOTAL_ROWS strings of COLS chars, '1' filled, '0' empty. */
export function parseBoard(rows: unknown): Board | null {
  if (!Array.isArray(rows) || rows.length !== TOTAL_ROWS) return null;
  const board: Board = [];
  for (const row of rows) {
    if (typeof row !== "string" || !/^[01]{10}$/.test(row)) return null;
    board.push([...row].map(ch => (ch === "1" ? "#" : null)));
  }
  return board;
}
