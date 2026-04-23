import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { SplitError, planTiles, tileFilename } from '../src/split.js';
import { buildZip } from '../src/zip.js';

describe('planTiles', () => {
  it('handles exact-divisible grids', () => {
    const { tileW, tileH, tiles } = planTiles(1200, 900, { rows: 3, cols: 4 });
    expect(tileW).toBe(300);
    expect(tileH).toBe(300);
    expect(tiles).toHaveLength(12);
    expect(tiles[0]).toEqual({ row: 0, col: 0, dx: 0, dy: 0, w: 300, h: 300 });
    expect(tiles[11]).toEqual({ row: 2, col: 3, dx: 900, dy: 600, w: 300, h: 300 });
  });

  it('floors non-divisible widths/heights and discards trailing pixels', () => {
    const { tileW, tileH, tiles } = planTiles(1000, 1000, { rows: 3, cols: 3 });
    expect(tileW).toBe(333);
    expect(tileH).toBe(333);
    expect(tiles).toHaveLength(9);
    for (const t of tiles) {
      expect(t.w).toBe(333);
      expect(t.h).toBe(333);
    }
  });

  it('handles rectangular grids', () => {
    const { tileW, tileH, tiles } = planTiles(800, 600, { rows: 2, cols: 5 });
    expect(tileW).toBe(160);
    expect(tileH).toBe(300);
    expect(tiles).toHaveLength(10);
  });

  it('handles tiny images that still fit the grid', () => {
    const { tileW, tileH, tiles } = planTiles(10, 10, { rows: 3, cols: 3 });
    expect(tileW).toBe(3);
    expect(tileH).toBe(3);
    expect(tiles).toHaveLength(9);
  });

  it('throws IMAGE_TOO_SMALL when tileW < 1', () => {
    expect.assertions(2);
    try {
      planTiles(2, 2, { rows: 3, cols: 3 });
    } catch (err) {
      expect(err).toBeInstanceOf(SplitError);
      expect((err as SplitError).code).toBe('IMAGE_TOO_SMALL');
    }
  });

  it('throws INVALID_GRID on non-integer rows', () => {
    expect.assertions(2);
    try {
      planTiles(1200, 900, { rows: 2.5, cols: 3 });
    } catch (err) {
      expect(err).toBeInstanceOf(SplitError);
      expect((err as SplitError).code).toBe('INVALID_GRID');
    }
  });

  it('throws INVALID_GRID on out-of-range grid', () => {
    expect.assertions(2);
    try {
      planTiles(1200, 900, { rows: 1, cols: 51 });
    } catch (err) {
      expect(err).toBeInstanceOf(SplitError);
      expect((err as SplitError).code).toBe('INVALID_GRID');
    }
  });

  it('throws INVALID_GRID on zero/negative grid', () => {
    expect(() => planTiles(1200, 900, { rows: 0, cols: 3 })).toThrow(SplitError);
    expect(() => planTiles(1200, 900, { rows: 1, cols: -2 })).toThrow(SplitError);
  });
});

describe('tileFilename', () => {
  it('uses 1-indexed row/col with no zero padding', () => {
    expect(tileFilename(0, 0, 'png')).toBe('tile_r1_c1.png');
    expect(tileFilename(9, 9, 'jpg')).toBe('tile_r10_c10.jpg');
    expect(tileFilename(2, 3, 'webp')).toBe('tile_r3_c4.webp');
  });
});

describe('buildZip unicode round-trip', () => {
  it('preserves non-ASCII filenames exactly', () => {
    const name = 'tile_ñ_中_1.png';
    const data = new Uint8Array([137, 80, 78, 71]);
    const blob = buildZip([{ name, data }]);
    // Re-read synchronously via a small helper that reads Blob bytes.
    // Use a shim: blob.arrayBuffer is async, so we use the underlying Uint8Array
    // by reconstructing it — buildZip returns a Blob wrapping the fflate bytes.
    // For this test, re-call zipSync with the same input to assert byte parity
    // then unzip that.
    return blob.arrayBuffer().then((buf) => {
      const out = unzipSync(new Uint8Array(buf));
      const keys = Object.keys(out);
      expect(keys).toContain(name);
      expect(Array.from(out[name])).toEqual(Array.from(data));
    });
  });
});
