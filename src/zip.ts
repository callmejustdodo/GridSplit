import { zipSync } from 'fflate';

export function buildZip(tiles: Array<{ name: string; data: Uint8Array }>): Blob {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const t of tiles) entries[t.name] = [t.data, { level: 0 }]; // level 0 = STORE
  const bytes = zipSync(entries) as Uint8Array<ArrayBuffer>;
  return new Blob([bytes], { type: 'application/zip' });
}
