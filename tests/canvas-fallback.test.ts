// Verifies `createTileCanvas` falls back to HTMLCanvasElement when
// OffscreenCanvas is unavailable, and that the main-thread `toBlob`
// path in `encodeTile` is wired up correctly.
//
// happy-dom does not provide a working 2D context on HTMLCanvasElement,
// so we stub `document.createElement('canvas')` to return a canvas-like
// object with a minimal ctx + toBlob. Full pixel-level verification is
// the job of the Playwright E2E suite; this test covers the control-flow
// branch selection.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTileCanvas, encodeTile } from '../src/canvas.js';

type FakeCanvas = HTMLCanvasElement & { __fake: true };

type FakeBundle = {
  canvas: FakeCanvas;
  ctx: CanvasRenderingContext2D;
  toBlob: (cb: (blob: Blob | null) => void, type?: string) => void;
  drawImageCalls: number;
  toBlobCalls: number;
};

function buildFakeCanvas(): FakeBundle {
  const bundle: Partial<FakeBundle> = { drawImageCalls: 0, toBlobCalls: 0 };
  const ctx = {
    clearRect: () => {},
    drawImage: () => {
      bundle.drawImageCalls = (bundle.drawImageCalls ?? 0) + 1;
    },
  } as unknown as CanvasRenderingContext2D;
  const toBlob = (cb: (blob: Blob | null) => void, type?: string) => {
    bundle.toBlobCalls = (bundle.toBlobCalls ?? 0) + 1;
    cb(
      new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
        type: type ?? 'image/png',
      }),
    );
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => (kind === '2d' ? ctx : null),
    toBlob,
    __fake: true,
  } as unknown as FakeCanvas;
  // Make instanceof HTMLCanvasElement return true so user code paths that
  // do brand checks still work.
  Object.setPrototypeOf(canvas, HTMLCanvasElement.prototype);
  bundle.canvas = canvas;
  bundle.ctx = ctx;
  bundle.toBlob = toBlob;
  return bundle as FakeBundle;
}

describe('canvas fallback (no OffscreenCanvas)', () => {
  const originalOffscreen = (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas })
    .OffscreenCanvas;
  let fake: FakeBundle;

  beforeEach(() => {
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = undefined;
    fake = buildFakeCanvas();
    vi.spyOn(document, 'createElement').mockImplementation(
      ((tag: string): HTMLElement => {
        if (tag === 'canvas') return fake.canvas as unknown as HTMLElement;
        throw new Error(`unexpected createElement('${tag}') in this test`);
      }) as typeof document.createElement,
    );
  });
  afterEach(() => {
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = originalOffscreen;
    vi.restoreAllMocks();
  });

  it('createTileCanvas returns an HTMLCanvasElement-shaped result', () => {
    const tc = createTileCanvas(10, 10);
    expect(tc.canvas).toBe(fake.canvas);
    expect((tc.canvas as FakeCanvas).width).toBe(10);
    expect((tc.canvas as FakeCanvas).height).toBe(10);
    expect(tc.ctx).toBe(fake.ctx);
  });

  it('encodeTile uses toBlob() on the HTMLCanvasElement path', async () => {
    const tc = createTileCanvas(4, 4);
    const bitmap = {} as unknown as ImageBitmap;
    const out = await encodeTile(
      bitmap,
      tc,
      { row: 0, col: 0, dx: 0, dy: 0, w: 4, h: 4 },
      'image/png',
    );
    expect(out).toBeInstanceOf(Uint8Array);
    // PNG signature first 8 bytes.
    expect(Array.from(out.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(fake.toBlobCalls).toBe(1);
    expect(fake.drawImageCalls).toBeGreaterThan(0);
  });
});
