import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetWebPSupportCacheForTests, detectWebPEncode } from '../src/canvas.js';

type ProbeMode = 'webp' | 'png' | 'throw';

function installOffscreenCanvasStub(mode: ProbeMode): void {
  class StubOC {
    constructor(public width: number, public height: number) {}
    async convertToBlob(_opts: { type: string }): Promise<Blob> {
      void _opts;
      if (mode === 'throw') throw new Error('unsupported MIME');
      const type = mode === 'webp' ? 'image/webp' : 'image/png';
      return new Blob([new Uint8Array([0])], { type });
    }
    getContext(): null {
      return null;
    }
  }
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = StubOC;
}

describe('detectWebPEncode', () => {
  const originalOC = (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas;

  beforeEach(() => {
    __resetWebPSupportCacheForTests();
  });
  afterEach(() => {
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = originalOC;
    __resetWebPSupportCacheForTests();
  });

  it('returns true when convertToBlob returns an image/webp blob', async () => {
    installOffscreenCanvasStub('webp');
    await expect(detectWebPEncode()).resolves.toBe(true);
  });

  it('returns false when convertToBlob returns a non-webp blob (Chrome fallback)', async () => {
    installOffscreenCanvasStub('png');
    await expect(detectWebPEncode()).resolves.toBe(false);
  });

  it('returns false when convertToBlob throws (Safari on unsupported MIME)', async () => {
    installOffscreenCanvasStub('throw');
    await expect(detectWebPEncode()).resolves.toBe(false);
  });

  it('returns false when OffscreenCanvas is undefined', async () => {
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = undefined;
    await expect(detectWebPEncode()).resolves.toBe(false);
  });
});
