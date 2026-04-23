import {
  MAX_DIM,
  createTileCanvas,
  decodeImage,
  detectWebPEncode,
  encodeTile,
  pickOutputMime,
  probeDimensions,
} from './canvas.js';
import { type SplitOptions, planTiles, tileFilename } from './split.js';
import { buildZip } from './zip.js';

export type RunSplitResult = {
  blob: Blob;
  filename: string;
  fallbackReason?: string;
};

export async function runSplit(
  file: File,
  opts: SplitOptions,
  onProgress: (done: number, total: number) => void,
): Promise<RunSplitResult> {
  const { width, height } = await probeDimensions(file);
  if (width > MAX_DIM || height > MAX_DIM) {
    throw new Error(
      `Image is too large for this browser (${width}×${height}, max ${MAX_DIM}). Try a smaller image.`,
    );
  }
  // Pixel-count warning gate (Proceed/Cancel) is handled in UI before runSplit is called.

  const bitmap = await decodeImage(file);
  try {
    const { tileW, tileH, tiles } = planTiles(bitmap.width, bitmap.height, opts);
    const target = createTileCanvas(tileW, tileH);
    const webpSupported = await detectWebPEncode();
    const { mime, ext, fallbackReason } = pickOutputMime(file.type, webpSupported);

    const accum: Array<{ name: string; data: Uint8Array }> = [];
    let done = 0;
    for (const spec of tiles) {
      const data = await encodeTile(
        bitmap,
        target,
        spec,
        mime,
        mime === 'image/jpeg' ? 0.92 : undefined,
      );
      accum.push({ name: tileFilename(spec.row, spec.col, ext), data });
      onProgress(++done, tiles.length);
      await new Promise((r) => setTimeout(r, 0)); // yield
    }

    const blob = buildZip(accum);
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    const filename = `gridsplit-${base}-${opts.cols}x${opts.rows}.zip`;
    return { blob, filename, fallbackReason };
  } finally {
    bitmap.close();
  }
}
