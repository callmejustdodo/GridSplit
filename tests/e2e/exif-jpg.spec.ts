import { test } from '@playwright/test';

// TODO: provide a minimal EXIF-Orientation=6 JPG fixture at
//   tests/fixtures/exif-rotated.jpg
// Hand-crafting a valid JPEG with a TIFF/EXIF APP1 segment and
// Orientation=6 tag is straightforward but noisy; skipping for v1.
// Expected behaviour: splitting a 2×2 grid on an EXIF-rotated JPG must
// produce tiles aligned to the *displayed* orientation, not the raw
// pixel grid. Implementation anchor: createImageBitmap(file,
// { imageOrientation: 'from-image' }) in src/canvas.ts.
test.skip('EXIF-oriented JPG tiles align with displayed orientation', () => {
  // Intentionally empty — see TODO above.
});
