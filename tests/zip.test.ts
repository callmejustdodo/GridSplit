import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { buildZip } from '../src/zip.js';

// Read the local-file-header "compression method" field of the first entry.
// ZIP LFH layout: 0..3 = "PK\x03\x04", 4..5 = version, 6..7 = flags,
// 8..9 = compression method (2 bytes LE). We want 0 (STORE).
function compressionMethodOfFirstEntry(bytes: Uint8Array): number {
  // Sanity-check the LFH magic so failures surface clearly.
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);
  expect(bytes[2]).toBe(0x03);
  expect(bytes[3]).toBe(0x04);
  return bytes[8] | (bytes[9] << 8);
}

describe('buildZip', () => {
  it('round-trips a 4-tile known-bytes fixture', async () => {
    const tiles = [
      { name: 'tile_r1_c1.png', data: new Uint8Array([1, 2, 3, 4, 5]) },
      { name: 'tile_r1_c2.png', data: new Uint8Array([10, 20, 30]) },
      { name: 'tile_r2_c1.png', data: new Uint8Array([100, 101, 102, 103]) },
      { name: 'tile_r2_c2.png', data: new Uint8Array([255, 254, 253, 252, 251, 250]) },
    ];
    const blob = buildZip(tiles);
    expect(blob.type).toBe('application/zip');

    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(compressionMethodOfFirstEntry(buf)).toBe(0);

    const out = unzipSync(buf);
    expect(Object.keys(out).sort()).toEqual(tiles.map((t) => t.name).sort());
    for (const t of tiles) {
      expect(Array.from(out[t.name])).toEqual(Array.from(t.data));
    }
  });

  it('emits store-only (level 0, no deflation) even on compressible data', async () => {
    const compressible = new Uint8Array(512).fill(0x41); // 512 x "A"
    const blob = buildZip([{ name: 'a.bin', data: compressible }]);
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(compressionMethodOfFirstEntry(buf)).toBe(0);
    const out = unzipSync(buf);
    expect(out['a.bin'].length).toBe(compressible.length);
  });
});
