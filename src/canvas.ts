import type { TileSpec } from './split.js';

export const MAX_DIM = 16384;
export const MAX_RGBA_BYTES_WARN = 500_000_000;

export async function probeDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // may throw DOMException on malformed input — caller maps to user error
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    // Scoped fallback: only attempt the <img>-element path for GIF, to preserve
    // EXIF-orientation guarantees on JPG (which must fail loudly instead of
    // silently losing orientation).
    if (file.type === 'image/gif') {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return await createImageBitmap(img);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    throw err;
  }
}

let webpSupportCache: boolean | null = null;

export function __resetWebPSupportCacheForTests(): void {
  webpSupportCache = null;
}

export async function detectWebPEncode(): Promise<boolean> {
  if (webpSupportCache !== null) return webpSupportCache;
  if (typeof OffscreenCanvas === 'undefined') return (webpSupportCache = false);
  try {
    const oc = new OffscreenCanvas(1, 1);
    const blob = await oc.convertToBlob({ type: 'image/webp' });
    webpSupportCache = blob.type.startsWith('image/webp');
  } catch {
    webpSupportCache = false;
  }
  return webpSupportCache;
}

export type CanvasLike = OffscreenCanvas | HTMLCanvasElement;
export type TileCanvas = {
  canvas: CanvasLike;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
};

export function createTileCanvas(w: number, h: number): TileCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to acquire OffscreenCanvas 2D context');
    return { canvas, ctx: ctx as OffscreenCanvasRenderingContext2D };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire HTMLCanvasElement 2D context');
  return { canvas, ctx };
}

export async function encodeTile(
  source: ImageBitmap,
  target: TileCanvas,
  spec: TileSpec,
  mime: 'image/png' | 'image/jpeg' | 'image/webp',
  quality?: number,
): Promise<Uint8Array> {
  target.ctx.clearRect(0, 0, spec.w, spec.h);
  target.ctx.drawImage(source, spec.dx, spec.dy, spec.w, spec.h, 0, 0, spec.w, spec.h);
  let blob: Blob;
  if (typeof OffscreenCanvas !== 'undefined' && target.canvas instanceof OffscreenCanvas) {
    blob = await target.canvas.convertToBlob({ type: mime, quality });
  } else {
    const htmlCanvas = target.canvas as HTMLCanvasElement;
    blob = await new Promise<Blob>((resolve, reject) =>
      htmlCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        mime,
        quality,
      ),
    );
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export function pickOutputMime(
  inputMime: string,
  webpSupported: boolean,
): {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  ext: 'png' | 'jpg' | 'webp';
  fallbackReason?: string;
} {
  if (inputMime === 'image/jpeg') return { mime: 'image/jpeg', ext: 'jpg' };
  if (inputMime === 'image/webp') {
    return webpSupported
      ? { mime: 'image/webp', ext: 'webp' }
      : {
          mime: 'image/png',
          ext: 'png',
          fallbackReason: 'Your browser cannot encode WebP; tiles saved as PNG.',
        };
  }
  // PNG, GIF, or unknown → PNG output.
  return { mime: 'image/png', ext: 'png' };
}
