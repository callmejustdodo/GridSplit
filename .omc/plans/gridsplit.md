---
name: gridsplit-plan
description: Consensus implementation plan for GridSplit — client-only static web image splitter (final, post-iteration-2 approval)
type: plan
status: approved
spec_source: .omc/specs/deep-interview-gridsplit.md
prior_drafts: [.omc/drafts/gridsplit-plan-v1.md, .omc/drafts/gridsplit-plan-v2.md]
ralplan_iterations: 2
approval:
  architect: APPROVE_WITH_MINOR_SUGGESTIONS
  critic: APPROVE_WITH_MINOR_CHANGES
---

# GridSplit — Consensus Implementation Plan (APPROVED)

Iteration 2 consensus. Both reviewers approved; minor suggestions merged below and flagged in the changelog.

## Requirements Summary

Build a **free, client-only, single-page web tool** that splits one user-supplied image into an `n × m` grid of equal-sized tiles and delivers them as an auto-downloaded ZIP. All processing in the browser, no server, no network requests after initial page load. Supported inputs: PNG, JPG/JPEG, WebP, static GIF, input file up to ~100 MB. Modern evergreen browsers only. MIT-licensed, deployable to a static host (GitHub Pages / Netlify / Cloudflare Pages).

## RALPLAN-DR Summary

### Principles (5)

1. **Zero server, zero upload** — user images never leave the tab. Guaranteed by the artifact (single-file build), not by vigilance.
2. **Predictable output over clever output** — edge pixels are cropped, not padded or distributed. Every tile is identical in size. Surprising behavior is worse than lossy behavior.
3. **Small surface, narrow scope** — v1 does one thing (split 1 image into n×m equal tiles → ZIP) and nothing else.
4. **Default to the lightest stack that works** — no framework; bundler only because we want TS safety on Canvas/Blob APIs. The artifact matches Option B's distribution property via `vite-plugin-singlefile`.
5. **Fail loudly and humanly** — canvas/memory limits and unsupported formats produce user-visible errors, never silent hangs or blank screens.

### Decision Drivers (Top 3)

1. **Distribution cost = $0 forever** — the built artifact is a single HTML file that can be hosted anywhere.
2. **Implementation core fits within ~10 focused hours** — the ~300-line source + test surface. Full cross-browser QA, deploy, and documentation may extend 2–3 calendar days.
3. **Graceful handling of large images** — 100 MB input files must either succeed or fail with a clear error; a crashed tab is a failed product.

### Viable Options

#### Option A — Vanilla TS + Vite + fflate + `vite-plugin-singlefile` (Chosen)

- TypeScript source, Vite build, `vite-plugin-singlefile` post-processor → one `index.html` with all JS/CSS inlined. `fflate` (~8 KB gz) for in-memory ZIP creation.
- **Pros:** TS catches Canvas/Blob/Uint8Array API misuse. Artifact is one file (matches Option B's distribution property). `fflate` is the fastest browser ZIP lib. Source maps disabled so DevTools-open does not fetch `.map` post-load (preserves Principle 1 as a compile-time guarantee).
- **Cons:** Requires Node + npm toolchain for contributors. Adds `vite-plugin-singlefile` dependency.

#### Option B — Pure hand-written single `index.html` with inlined fflate

- One HTML file, inline `<script type="module">`, inline `<style>`, fflate source pasted.
- **Pros:** Smallest possible surface. Literally-one-file distribution by construction.
- **Cons:** No TypeScript safety on Canvas/Blob APIs. Inlined fflate is ~30 KB of pasted code that contributors must not touch. Awkward to unit-test.

#### Option C — SvelteKit / Next.js static export

- **Rejected:** invalidated by Principle 3 (small surface), Principle 4 (lightest stack), Decision Driver #2 (≤10-hour implementation core). Framework overhead of 30–100 KB for a one-route app is unjustified.

**Option chosen: A.** Synthesis: `vite-plugin-singlefile` makes A's artifact identical to B's output while retaining TS authoring. The CI artifact-shape guard (`test ! -f dist/assets/*.js`) enforces the single-file invariant that B gets by construction.

## Acceptance Criteria

Every criterion below is mechanically verifiable.

### Core happy path
- [ ] Opening `https://<host>/` in a supported browser renders: drag-and-drop surface, file picker button, numeric inputs labeled "Rows (n)" and "Columns (m)" (both default to 3, min 1, max 50), a "Split" button (disabled until an image is loaded and both `n`, `m` are valid integers), and an error/status region.
- [ ] Dropping a 1200×900 PNG, setting `n=3, m=4`, and clicking "Split" produces a ZIP download named `gridsplit-<originalBasename>-3x4.zip` containing exactly 12 PNG files, each 300×225 pixels. File names: `tile_r{row}_c{col}.png` (1-indexed, **no zero-padding** — matches spec literally). So the first tile is `tile_r1_c1.png`, the last is `tile_r3_c4.png`.
- [ ] ZIP is store-only (no compression). mtime set to the user's local time at export. No hidden OS files.

### Edge-pixel handling
- [ ] **Tile-coordinate spec (authoritative):** For a source image of width `imgW` and height `imgH`, split into `rows × cols`:
  - `tileW = Math.floor(imgW / cols)`
  - `tileH = Math.floor(imgH / rows)`
  - For each `(row, col)` with `row ∈ [0, rows)` and `col ∈ [0, cols)`:
    - `dx = col * tileW`
    - `dy = row * tileH`
    - Tile size is exactly `tileW × tileH`
  - Trailing pixels — `imgW − cols*tileW` on the right, `imgH − rows*tileH` on the bottom — are **discarded**.
  - Output file name uses **1-indexed** `row+1` and `col+1`: `tile_r{row+1}_c{col+1}.{ext}` where `ext` is chosen by `pickOutputMime`.
- [ ] On a 1000×1000 image split 3×3: every tile is 333×333; 1 px right + 1 px bottom discarded. Verified by dimension check on each emitted file.
- [ ] On a 10×10 image split 3×3: every tile is 3×3; 1 px right + 1 px bottom discarded. No tile is empty.
- [ ] If `Math.floor(imgW / cols) < 1 || Math.floor(imgH / rows) < 1` (e.g. 2×2 image split 3×3), UI rejects pre-decode with inline error "Image too small for this grid (need ≥ {cols}×{rows} pixels, got {imgW}×{imgH})".

### Format support
- [ ] JPG input → JPG tiles. Quality `0.92` via `convertToBlob({ type: 'image/jpeg', quality: 0.92 })`.
- [ ] PNG input → PNG tiles (lossless).
- [ ] WebP input → WebP tiles on browsers that support `OffscreenCanvas.convertToBlob({ type: 'image/webp' })`. On browsers that do not (probe either throws or returns a Blob whose `.type` is not `image/webp`), fall back to PNG output with info message "Your browser cannot encode WebP; tiles saved as PNG."
- [ ] Static GIF input → PNG tiles (first frame only; multi-frame animation is not preserved, documented in UI help text).
- [ ] EXIF-oriented JPGs produce tiles aligned to the *displayed* orientation, not the raw pixel grid. Implementation: `createImageBitmap(file, { imageOrientation: 'from-image' })`.

### Input validation
- [ ] File picker / drop zone accepts MIME types: `image/png, image/jpeg, image/webp, image/gif`. Other types show "Unsupported format (PNG, JPG, WebP, GIF only)".
- [ ] Files above 100 MB show a warning "File is >100 MB — large images may fail to decode. Proceed?" with Proceed / Cancel.
- [ ] **Pixel-count pre-decode warning:** after `probeDimensions` returns `{ width, height }`, if `width * height * 4 > 500_000_000` (i.e. predicted decoded RGBA > ~500 MB), show "Image is very large ({width}×{height}, ~{X} MB decoded). May crash the tab. Proceed?" with Proceed / Cancel. This catches small-bytes-huge-pixels PNGs that slip through the 100 MB file-size gate.
- [ ] Pre-decode dimension hard-fail: reject if `width > MAX_DIM || height > MAX_DIM` where `MAX_DIM = 16384`. Error: "Image is too large for this browser ({w}×{h}, max {MAX_DIM}). Try a smaller image."
- [ ] `n` and `m` are integers in `[1, 50]`. Non-integer or out-of-range values show inline field errors and disable the Split button.
- [ ] On `HTMLImageElement.decode()` rejection (malformed image), surface a user-visible error "Could not decode image: {error.message || 'unknown error'}" rather than a silent failure.

### Constraints & distribution (testable)
- [ ] **Playwright test `no-network-after-load.spec.ts`:** launches the built `dist/index.html`, counts `page.on('request')` events, performs a full 3×4 split on a fixture 1200×900 PNG, asserts request count is 0 after initial HTML load. Runs in CI.
- [ ] **LICENSE file at repo root** with MIT text.
- [ ] **Built artifact is a single `dist/index.html`** (no separate JS/CSS/map files) — enforced by CI.
- [ ] **Source maps disabled in production:** `vite.config.ts` sets `build.sourcemap: false`; CI greps the `dist/` tree for `sourceMappingURL` and fails on match.
- [ ] **Bundle-size hard-fail:** `wc -c dist/index.html` ≤ 204800 bytes. Hard-fail threshold in CI, not advisory.
- [ ] **Deployable with no build-time secrets:** `.github/workflows/pages.yml` has zero `secrets.*` references outside of the `GITHUB_TOKEN` that Actions provides automatically.

### Dropped / replaced criteria (transparent accounting)
- ~~"tab does not become unresponsive for > 5 s at any point"~~ — not mechanically testable with planned tooling. Replaced by a structural guarantee (yield via `await new Promise(r => setTimeout(r, 0))` after every tile encode in Step 4). Weaker guarantee, explicitly acknowledged as a follow-up item (potential `PerformanceObserver` instrumentation in v2).
- ~~"Memory usage peaks at ≤ 3× input RGBA"~~ — not mechanically verifiable without gated browser APIs. Replaced by a code-structure guarantee: "one shared canvas sized `tileW × tileH` is reused; each `ImageBitmap.close()` is called after tile encode" — verified by code review.
- ~~"Total gzipped JS+CSS ≤ 40 KB (budget alarm, not a hard fail)"~~ — promoted to hard-fail `wc -c dist/index.html ≤ 204800` CI check.

## Implementation Steps

### 0. Scaffolding
1. `npm create vite@latest . -- --template vanilla-ts` (scripted non-interactively).
2. Install runtime deps: `npm i fflate`.
3. Install dev deps: `npm i -D vite-plugin-singlefile vitest @playwright/test @types/node`.
4. Delete Vite starter boilerplate: `src/counter.ts`, `public/vite.svg`, starter CSS/HTML content. Keep `src/main.ts`, `src/style.css`, `index.html`, `tsconfig.json`, `vite.config.ts`.
5. Edit `vite.config.ts`:
   ```ts
   import { defineConfig } from 'vite';
   import { viteSingleFile } from 'vite-plugin-singlefile';
   export default defineConfig({
     base: './',
     build: { sourcemap: false, assetsInlineLimit: 100_000_000 },
     plugins: [viteSingleFile()],
   });
   ```
6. Add `.github/workflows/pages.yml` — see Step 7.
7. Add `LICENSE` (MIT), update `README.md`.
8. Commit `package-lock.json`; pin `fflate` + `vite-plugin-singlefile` to exact versions in `package.json`.

### 1. Core split algorithm (pure, testable)
File: `src/split.ts`

```ts
export type SplitOptions = { rows: number; cols: number };
export type TileSpec = { row: number; col: number; dx: number; dy: number; w: number; h: number };

export class SplitError extends Error {
  constructor(public code: 'IMAGE_TOO_SMALL' | 'INVALID_GRID', message: string) { super(message); }
}

export function planTiles(imgW: number, imgH: number, opts: SplitOptions): { tileW: number; tileH: number; tiles: TileSpec[] } {
  const { rows, cols } = opts;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 50 || cols > 50) {
    throw new SplitError('INVALID_GRID', `Grid must be integers in [1, 50], got ${rows}×${cols}`);
  }
  const tileW = Math.floor(imgW / cols);
  const tileH = Math.floor(imgH / rows);
  if (tileW < 1 || tileH < 1) {
    throw new SplitError('IMAGE_TOO_SMALL', `Image too small for this grid (need ≥ ${cols}×${rows} pixels, got ${imgW}×${imgH})`);
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
```

Pure arithmetic; no DOM; no canvas. Unit-testable.

### 2. Image decode + canvas slicing + probes
File: `src/canvas.ts`

```ts
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
export type TileCanvas = { canvas: CanvasLike; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D };

export function createTileCanvas(w: number, h: number): TileCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    return { canvas, ctx };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
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
  if (target.canvas instanceof OffscreenCanvas) {
    blob = await target.canvas.convertToBlob({ type: mime, quality });
  } else {
    blob = await new Promise<Blob>((resolve, reject) =>
      target.canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), mime, quality),
    );
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export function pickOutputMime(inputMime: string, webpSupported: boolean): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp'; fallbackReason?: string } {
  if (inputMime === 'image/jpeg') return { mime: 'image/jpeg', ext: 'jpg' };
  if (inputMime === 'image/webp') {
    return webpSupported
      ? { mime: 'image/webp', ext: 'webp' }
      : { mime: 'image/png', ext: 'png', fallbackReason: 'Your browser cannot encode WebP; tiles saved as PNG.' };
  }
  // PNG, GIF, or unknown → PNG output.
  return { mime: 'image/png', ext: 'png' };
}
```

### 3. ZIP packaging (single-Blob, honest memory)
File: `src/zip.ts`

```ts
import { zipSync } from 'fflate';

export function buildZip(tiles: Array<{ name: string; data: Uint8Array }>): Blob {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const t of tiles) entries[t.name] = [t.data, { level: 0 }]; // level 0 = STORE
  const bytes = zipSync(entries);
  return new Blob([bytes], { type: 'application/zip' });
}
```

Peak memory: `source decoded RGBA + sum of encoded tile bytes + one zipped blob`. Streaming ZIP is deferred to a follow-up (Section: Follow-ups).

### 4. Orchestration
File: `src/splitJob.ts`

```ts
export async function runSplit(
  file: File,
  opts: SplitOptions,
  onProgress: (done: number, total: number) => void,
): Promise<{ blob: Blob; filename: string }> {
  const { width, height } = await probeDimensions(file);
  if (width > MAX_DIM || height > MAX_DIM) throw new Error(`Image is too large for this browser (${width}×${height}, max ${MAX_DIM}). Try a smaller image.`);
  // Pixel-count warning gate (Proceed/Cancel) is handled in UI before runSplit is called.

  const bitmap = await decodeImage(file);
  try {
    const { tileW, tileH, tiles } = planTiles(bitmap.width, bitmap.height, opts);
    const target = createTileCanvas(tileW, tileH);
    const webpSupported = await detectWebPEncode();
    const { mime, ext, fallbackReason } = pickOutputMime(file.type, webpSupported);
    // UI reads `fallbackReason` from a returned side-channel (add to return value if needed).

    const accum: Array<{ name: string; data: Uint8Array }> = [];
    let done = 0;
    for (const spec of tiles) {
      const data = await encodeTile(bitmap, target, spec, mime, mime === 'image/jpeg' ? 0.92 : undefined);
      accum.push({ name: tileFilename(spec.row, spec.col, ext), data });
      onProgress(++done, tiles.length);
      await new Promise(r => setTimeout(r, 0)); // yield
    }

    const blob = buildZip(accum);
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    const filename = `gridsplit-${base}-${opts.cols}x${opts.rows}.zip`;
    return { blob, filename };
  } finally {
    bitmap.close();
  }
}
```

### 5. UI
File: `src/ui.ts` (may split into `dropzone.ts` / `form.ts` / `status.ts` if it clarifies; keep flat if < 250 lines total).

Vanilla DOM. Single `<main>` with: header, dropzone, `<input type="file">`, `<input type="number" id="rows">`, `<input type="number" id="cols">`, Split button, progress bar, error region, help text footer.

Wiring:
- Drag-over / drop / paste handlers normalize to a `File`.
- File-picker change → validate MIME → `probeDimensions` → check `width*height*4 > MAX_RGBA_BYTES_WARN` (prompt Proceed/Cancel) → check `width|height > MAX_DIM` (hard fail) → show preview filename + dimensions → enable Split button.
- Input validation on `rows` / `cols` (integer, 1–50) → inline field errors.
- Click Split → `runSplit` with a progress callback that updates the `<progress>` element.
- On success: `URL.createObjectURL(blob)` → programmatic `<a download={filename}>` click → `URL.revokeObjectURL` after ~1 s.
- On error: render user-facing text in the error region (map `HTMLImageElement.decode` rejections to "Could not decode image: {message}"); scroll into view.

File: `src/style.css` — modest, mobile-friendly. ~100 lines.
File: `index.html` — semantic landmarks, `<label for>` pairs, `<meta name="viewport">`, `<title>GridSplit — split an image into tiles</title>`.

### 6. Tests
- **Unit** (Vitest, `tests/split.test.ts`):
  - `planTiles` for divisible, non-divisible, square/rectangular, IMAGE_TOO_SMALL, INVALID_GRID.
  - `tileFilename(0, 0, 'png') === 'tile_r1_c1.png'`, `tileFilename(9, 9, 'jpg') === 'tile_r10_c10.jpg'`.
  - **Unicode round-trip:** `buildZip([{ name: 'tile_ñ_中_1.png', data: new Uint8Array([137,80,78,71]) }])` round-trips via `fflate.unzipSync` with the exact filename preserved.
- **Unit** (`tests/zip.test.ts`): 4-tile known-bytes fixture round-trips. Asserts `level: 0` (store) via ZIP header compression-method byte = 0.
- **Unit** (`tests/canvas-fallback.test.ts`): monkeypatch `globalThis.OffscreenCanvas = undefined`; verify `createTileCanvas` returns an `HTMLCanvasElement`-based result and `encodeTile` still produces a valid PNG byte stream.
- **Unit** (`tests/webp-probe.test.ts`): mock `OffscreenCanvas.convertToBlob` to (a) return `image/webp`, (b) return `image/png`, (c) throw — assert `detectWebPEncode` returns `true/false/false` respectively.
- **E2E** (Playwright, `tests/e2e/split.spec.ts`): against `vite preview`, load built `dist/index.html`, drag fixture `1200x900.png`, set `n=3, m=4`, click Split, intercept download, unzip in Node, assert 12 files of 300×225, filenames `tile_r1_c1.png ... tile_r3_c4.png`.
- **E2E** (`tests/e2e/no-network.spec.ts`): load page, attach `page.on('request', ...)` after `load`, perform split, assert zero subsequent requests.
- **E2E** (`tests/e2e/exif-jpg.spec.ts`): upload a JPG with EXIF `Orientation=6` (90° CW rotation); split 2×2; verify that each tile corresponds to the *displayed* quadrant of the image, not the pre-rotation pixel grid. Fixture: `tests/fixtures/exif-rotated.jpg` + known expected quadrant colors.
- **E2E (nightly, optional)** (`tests/e2e/deployed.spec.ts`): same as `no-network.spec.ts` but against the deployed GH Pages URL to catch base-path / CORS drift.

### 7. CI / Deploy
File: `.github/workflows/pages.yml`

```yaml
name: CI + Pages
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test:unit
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:e2e
      - name: Single-file + no-sourcemap guard
        run: |
          test -f dist/index.html
          if ls dist/assets/*.js dist/assets/*.css dist/assets/*.map 2>/dev/null | grep -q .; then
            echo "expected inlined single-file build but found separate assets"; exit 1
          fi
          if grep -r "sourceMappingURL" dist/ ; then
            echo "source maps leaked"; exit 1
          fi
      - name: Bundle-size hard-fail
        run: |
          SIZE=$(wc -c < dist/index.html)
          echo "dist/index.html = $SIZE bytes"
          [ "$SIZE" -le 204800 ] || { echo "bundle too large ($SIZE > 200 KB)"; exit 1; }
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Package scripts:
```json
{ "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test:unit": "vitest run",
    "test:e2e": "playwright test"
} }
```

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation (with implementation anchor) |
|------|-----------|--------|----------------------------------------|
| Canvas dimension limit hit on large images | Medium | High | Step 2 `probeDimensions` + `MAX_DIM` gate before any canvas allocation. AC: "Pre-decode dimension hard-fail". |
| Small-bytes-huge-pixels PNG slips file-size gate | Medium | High | Pixel-count warning gate at `width*height*4 > 500 MB` in Step 5 UI wiring. AC: "Pixel-count pre-decode warning". |
| `fflate` bundle grows | Very Low | Low | Step 7 bundle-size CI hard-fail. |
| `OffscreenCanvas` unsupported | Low | Medium | Step 2 `createTileCanvas` branches; `encodeTile` handles both paths. Test: `tests/canvas-fallback.test.ts`. |
| Animated GIF users expect all frames | Medium | Low (scoped out) | Documented in UI help text. Non-goal. |
| WebP encode missing / pretending-to-work | Low | Low | Step 2 `detectWebPEncode` with try/catch + Blob `.type` inspection. Test: `tests/webp-probe.test.ts`. |
| Memory balloon on 100 MB inputs | Medium | High | One reused `OffscreenCanvas` per job; `bitmap.close()` after loop; UI yields between tiles. Pixel-count warning surfaces this pre-decode. |
| Filename encoding for non-ASCII basenames | Medium | Low | Verified: Unicode fixture in `tests/split.test.ts`. |
| EXIF-rotated JPG produces wrong tile mapping | Medium | High (silent) | `createImageBitmap(file, { imageOrientation: 'from-image' })`; `<img>` fallback scoped to GIF only so JPG EXIF fails loudly. Test: `tests/e2e/exif-jpg.spec.ts`. |
| CI cannot run Playwright without browser install | High | High | `npx playwright install --with-deps chromium` step; unit and E2E are separate scripts. |
| GH Pages `base: './'` drift not caught by `vite preview` | Low | Medium | Optional nightly `tests/e2e/deployed.spec.ts` against the deployed URL. |

## Verification Steps

1. `npm ci` — no errors, lockfile committed.
2. `npm run test:unit` — Vitest green, including Unicode fixture, `canvas-fallback`, `webp-probe`.
3. `npx playwright install --with-deps chromium`.
4. `npm run build` — produces `dist/index.html`.
5. `ls dist/` — contains only `index.html` (plus possibly `.nojekyll`); no separate `.js` / `.css` / `.map` files.
6. `grep -r "sourceMappingURL" dist/` — returns nothing.
7. `wc -c dist/index.html` — ≤ 204800 bytes.
8. `npm run test:e2e` — `split.spec.ts`, `no-network.spec.ts`, `exif-jpg.spec.ts` all green.
9. `npm run preview` — open `http://localhost:4173/` in Chrome, Firefox, Safari, Edge. Manually:
   - Split a 1200×900 PNG at 3×4; `unzip -l` and `identify` to verify 300×225 tiles.
   - Split a 1000×1000 PNG at 3×3; verify 333×333 tiles.
   - Split a 2×2 PNG at 3×3; verify UI blocks with correct error.
   - Upload an EXIF-rotated JPG; verify tiles align with displayed orientation.
   - Upload a static GIF; verify tiles are PNG.
   - Upload a `.bmp`; verify UI rejects with "Unsupported format".
   - Upload a small-bytes but 10000×10000 PNG; verify the pixel-count warning fires.
10. Push to `main` — GH Actions runs `pages.yml`; deploy succeeds; deployed URL performs a split end-to-end; DevTools Network silent during split.

## ADR

**Decision:** Implement GridSplit as vanilla TypeScript + Vite + `fflate` + `vite-plugin-singlefile` → one static `index.html`.

**Drivers:**
1. Distribution cost = $0 forever.
2. Implementation core fits within ~10 focused hours.
3. Predictable, fail-loud behavior on browser-canvas edge cases.

**Alternatives considered:**
- **Option B (Pure hand-written single HTML):** Architecturally cleaner for Principles 1, 3, 4 (artifact invariant rather than build discipline). Rejected because (a) TS safety on Canvas / Blob / `OffscreenCanvas` API-type confusion materially reduces bugs, and (b) Vitest + Playwright integration is easier with split source modules. The *artifact property* of B is preserved in A via `vite-plugin-singlefile` + CI artifact-shape hard-fail.
- **Option C (SvelteKit / Next.js static export):** Rejected outright — framework overhead of 30–100 KB for a one-route app violates Principle 3 and Principle 4, and invalidates Decision Driver #2.

**Why chosen:** Option A provides the smallest stack that still delivers (a) TS safety on Canvas/Blob APIs, (b) a testable module structure for Vitest + Playwright, and (c) a single-file artifact matching Option B's distribution property via `vite-plugin-singlefile` + CI enforcement. Deployable to any free static host with no environment variables or secrets.

**Consequences:**
- Requires Node + npm toolchain for contributors.
- Adds `vite-plugin-singlefile` dependency (pin exact version).
- Adds `node_modules` build-time surface; `npm ci` + `package-lock.json` mitigate supply-chain drift.
- Single-file invariant is enforced by CI, not by construction — a contributor bypassing CI could ship a multi-file build. CI hard-fail is the load-bearing control.

**Follow-ups (post-v1):**
- Truly streaming ZIP via `fflate.Zip` + `ReadableStream` + `Response.body` if memory evidence demands it.
- `PerformanceObserver`-based long-task instrumentation to re-introduce a measurable UI-responsiveness AC.
- Single-file authoring (collapsing Option A source into Option B shape) if scope stays this small.
- PWA / Service Worker (explicit non-goal for v1).
- Batch upload (explicit non-goal for v1).
- Drag-to-resize grid preview overlay.

## Changelog (v1 → v2 → final)

### v2 changes (addressed Architect iteration 1)
- Tile-indexing spec rewritten without NumPy slice notation; `dx = col * tileW`, `dy = row * tileH`, 1-indexed filenames at output boundary.
- Streaming-vs-Blob contradiction removed: `fflate.zipSync` used; honest memory bound documented; streaming deferred to follow-up.
- EXIF orientation: `createImageBitmap(file, { imageOrientation: 'from-image' })` in `decodeImage`.
- `vite-plugin-singlefile` + `build.sourcemap: false` + CI single-file / sourcemap / size guards.
- Reused `OffscreenCanvas` across tiles; `bitmap.close()` in `finally`.
- `planTiles` validates integer/range AND `tileW/tileH >= 1`.
- `tests/canvas-fallback.test.ts` covers main-thread canvas path.
- Optional nightly E2E against deployed URL.
- Pre-decode dimension check via `HTMLImageElement.decode()` → `naturalWidth/Height`.
- Bundle-size hard-fail (`wc -c dist/index.html ≤ 204800`).
- CI includes `npx playwright install --with-deps chromium`; unit/e2e split.
- Filename padding rule aligned to spec literally.
- Safari `convertToBlob` WebP probe inspects Blob `.type`.
- GIF fallback path for `createImageBitmap`.
- Driver #2 rescoped to "~10 focused hours" for implementation core.

### Final changes (addressed Architect + Critic iteration 2 minor items)
- **Pixel-count pre-decode warning** (Architect): new AC at `Input validation`; fires when `width * height * 4 > 500 MB` predicted decoded RGBA. Catches small-bytes-huge-pixels PNGs.
- **GIF-only `<img>` fallback scope** (Architect): `decodeImage` now only attempts the `<img>` path when `file.type === 'image/gif'`; JPG decode failures fail loudly to preserve the EXIF-orientation guarantee.
- **`tileFilename` accepts `ext` directly** (Architect): removed brittle `.replace(/\.png$/, '.' + ext)` string override; filename is constructed correctly from the start.
- **`detectWebPEncode` try/catch** (Critic): probe wraps `convertToBlob` in try/catch for Safari's throw-on-unsupported-MIME behavior; `tests/webp-probe.test.ts` exercises all three paths.
- **CI guard shell script fix** (Critic): replaced `! ls … | grep` pipe-precedence pattern with `if ls …; then exit 1; fi` form.
- **EXIF-JPG E2E test** (Critic): `tests/e2e/exif-jpg.spec.ts` added with a fixture carrying `Orientation=6`.
- **`HTMLImageElement.decode()` error mapping** (Critic): new AC under `Input validation` specifying user-visible error "Could not decode image: {message}".
