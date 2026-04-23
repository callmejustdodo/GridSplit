export type SplitOptions = { rows: number; cols: number };
export type TileSpec = { row: number; col: number; dx: number; dy: number; w: number; h: number };

export class SplitError extends Error {
  constructor(public code: 'IMAGE_TOO_SMALL' | 'INVALID_GRID', message: string) {
    super(message);
    this.name = 'SplitError';
  }
}

export function planTiles(
  imgW: number,
  imgH: number,
  opts: SplitOptions,
): { tileW: number; tileH: number; tiles: TileSpec[] } {
  const { rows, cols } = opts;
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows < 1 ||
    cols < 1 ||
    rows > 50 ||
    cols > 50
  ) {
    throw new SplitError('INVALID_GRID', `Grid must be integers in [1, 50], got ${rows}×${cols}`);
  }
  const tileW = Math.floor(imgW / cols);
  const tileH = Math.floor(imgH / rows);
  if (tileW < 1 || tileH < 1) {
    throw new SplitError(
      'IMAGE_TOO_SMALL',
      `Image too small for this grid (need ≥ ${cols}×${rows} pixels, got ${imgW}×${imgH})`,
    );
  }
  const tiles: TileSpec[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({ row, col, dx: col * tileW, dy: row * tileH, w: tileW, h: tileH });
    }
  }
  return { tileW, tileH, tiles };
}

export function tileFilename(row0: number, col0: number, ext: 'png' | 'jpg' | 'webp'): string {
  return `tile_r${row0 + 1}_c${col0 + 1}.${ext}`;
}
