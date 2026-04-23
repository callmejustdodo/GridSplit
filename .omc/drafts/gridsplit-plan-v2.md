---
name: gridsplit-plan
description: Consensus implementation plan for GridSplit — client-only static web image splitter (v2, post-Architect+Critic revision)
type: plan
status: draft
spec_source: .omc/specs/deep-interview-gridsplit.md
prior_revision: .omc/drafts/gridsplit-plan-v1.md
---

# GridSplit Implementation Plan (Draft v2)

## Revision Summary vs v1

Architect and Critic both requested changes. v2 resolves every blocker and applies every strongly-encouraged item. Changelog at the bottom of this file.

## Requirements Summary

Build a **free, client-only, single-page web tool** that splits one user-supplied image into an `n × m` grid of equal-sized tiles and delivers them as an auto-downloaded ZIP. All processing in the browser, no server, no network requests after page load. Supported inputs: PNG, JPG/JPEG, WebP, static GIF, input file up to ~100 MB. Modern evergreen browsers only. MIT-licensed, deployable to a static host (GitHub Pages / Netlify / Cloudflare Pages).

## RALPLAN-DR Summary

### Principles (5)

1. **Zero server, zero upload** — user images never leave the tab. Guaranteed by the artifact (single-file build), not by vigilance.
2. **Predictable output over clever output** — edge pixels are cropped, not padded or distributed. Every tile is identical in size. Surprising behavior is worse than lossy behavior.
3. **Small surface, narrow scope** — v1 does one thing (split 1 image into n×m equal tiles → ZIP) and nothing else.
4. **Default to the lightest stack that works** — no framework; bundler only because we want TS safety on Canvas/Blob APIs. The artifact matches Option B's distribution property via `vite-plugin-singlefile`.
5. **Fail loudly and humanly** — canvas/memory limits and unsupported formats produce user-visible errors, never silent hangs or blank screens.

### Decision Drivers (Top 3)

1. **Distribution cost = $0 forever** — the built artifact is a single HTML file that can be hosted anywhere (GH Pages today, USB stick tomorrow).
2. **Implementation core fits within ~10 focused hours** — the ~300-line source + test surface. Full cross-browser QA, deploy, and documentation may extend 2–3 calendar days. Stack choice should not dominate the work.
3. **Graceful handling of large images** — 100 MB input files must either succeed or fail with a clear error; a crashed tab is a failed product.

### Viable Options

#### Option A — Vanilla TS + Vite + fflate + `vite-plugin-singlefile` (Recommended)

- **Approach:** TypeScript source, Vite build, `vite-plugin-singlefile` post-processor → one `index.html` with all JS/CSS inlined. `fflate` (~8 KB gz) for in-memory ZIP creation.
- **Pros:** TS catches Canvas/Blob/Uint8Array API misuse. Artifact is one file (matches Option B's distribution property). `fflate` is the fastest browser ZIP lib. Source maps disabled so DevTools-open does not fetch `.map` post-load (preserves Principle 1 as a compile-time guarantee).
- **Cons:** Requires Node + npm toolchain for contributors. Adds `vite-plugin-singlefile` dependency.

#### Option B — Pure hand-written single `index.html` with inlined fflate

- **Approach:** One HTML file, inline `<script type="module">`, inline `<style>`, fflate source pasted into a `<script>` block. No build step, no `node_modules`.
- **Pros:** Smallest possible surface. Literally-one-file distribution.
- **Cons:** No TypeScript safety on Canvas/Blob APIs (the real bug risk is arithmetic, which TS does not catch — **but** type safety still reduces `HTMLCanvasElement` vs `OffscreenCanvas` vs `HTMLImageElement` confusion). Inlined fflate is ~30 KB of pasted code that contributors must not touch. Awkward to unit-test (Vitest can import single-file HTML but it is friction).

#### Option C — SvelteKit / Next.js static export

- **Approach:** A meta-framework exporting a fully static site.
- **Pros:** Rich component model if the app grows.
- **Cons:** Massively over-scoped. **Rejected**: invalidated by Principle 3 (small surface), Principle 4 (lightest stack), and Decision Driver #2 (≤10-hour implementation core).

**Option chosen: A.** Option B is a close, principled runner-up. The architect's antithesis — that B is more principle-aligned because distribution is the artifact property, not a build discipline — is addressed in v2 by adding `vite-plugin-singlefile`: the *artifact* is identical to B's output while the *authoring experience* retains TS. This is the synthesis path.

## Acceptance Criteria

Every criterion below is mechanically verifiable.

### Core happy path
- [ ] Opening `https://<host>/` in a supported browser renders: drag-and-drop surface, file picker button, numeric inputs labeled "Rows (n)" and "Columns (m)" (both default to 3, min 1, max 50), a "Split" button (disabled until an image is loaded and both `n`, `m` are valid integers), and an error/status region.
- [ ] Dropping a 1200×900 PNG, setting `n=3, m=4`, and clicking "Split" produces a ZIP download named `gridsplit-<originalBasename>-3x4.zip` containing exactly 12 PNG files, each 300×225 pixels. File names: `tile_r{row}_c{col}.png` (1-indexed, **no zero-padding** — matches spec literally). So the first tile is `tile_r1_c1.png`, the last is `tile_r3_c4.png`.
- [ ] ZIP is store-only (no compression). mtime set to the user's local time at export. No hidden OS files (no `.DS_Store`).

### Edge-pixel handling
- [ ] **Tile-coordinate spec (authoritative):** For a source image of width `imgW` and height `imgH`, split into `rows × cols`:
  - `tileW = Math.floor(imgW / cols)`
  - `tileH = Math.floor(imgH / rows)`
  - For each `(row, col)` with `row ∈ [0, rows)` and `col ∈ [0, cols)`:
    - `dx = col * tileW` (x in source-image space, pixels right of left edge)
    - `dy = row * tileH` (y in source-image space, pixels down from top edge)
    - Tile size is exactly `tileW × tileH`
  - Trailing pixels — `imgW − cols*tileW` on the right, `imgH − rows*tileH` on the bottom — are **discarded** (cropped).
  - Output file name uses **1-indexed** `row+1` and `col+1`: `tile_r{row+1}_c{col+1}.png`.
- [ ] On a 1000×1000 image split 3×3: every tile is 333×333; 1 px right + 1 px bottom discarded. Verified by dimension check on each emitted file.
- [ ] On a 10×10 image split 3×3: every tile is 3×3; 1 px right + 1 px bottom discarded. No tile is empty.
- [ ] If `Math.floor(imgW / cols) < 1 || Math.floor(imgH / rows) < 1` (e.g. 2×2 image split 3×3), UI rejects pre-decode with inline error "Image too small for this grid (need ≥ {cols}×{rows} pixels, got {imgW}×{imgH})".

### Format support
- [ ] JPG input → JPG tiles. Quality `0.92` via `convertToBlob({ type: 'image/jpeg', quality: 0.92 })`.
- [ ] PNG input → PNG tiles (lossless).
- [ ] WebP input → WebP tiles on browsers that support `OffscreenCanvas.convertToBlob({ type: 'image/webp' })` AND return a Blob whose `.type` actually starts with `image/webp`. On browsers that return something else (falsy / `image/png`), fall back to PNG output with info message "Your browser cannot encode WebP; tiles saved as PNG." (Probe at app init; cache the result.)
- [ ] Static GIF input → PNG tiles (first frame only; multi-frame animation is not preserved, documented in UI help text).
- [ ] EXIF-oriented JPGs produce tiles aligned to the *displayed* orientation, not the raw pixel grid. Implementation: `createImageBitmap(file, { imageOrientation: 'from-image' })`.

### Input validation
- [ ] File picker / drop zone accepts MIME types: `image/png, image/jpeg, image/webp, image/gif`. Other types or unrecognized files show "Unsupported format (PNG, JPG, WebP, GIF only)".
- [ ] Files above 100 MB show a warning "File is >100 MB — large images may fail to decode. Proceed?" with Proceed / Cancel. If user proceeds and decode fails, user-visible error surfaces the browser's exception message.
- [ ] Pre-decode dimension check: probe via an `HTMLImageElement` (`const img = new Image(); img.src = objectURL; await img.decode()`) to read `naturalWidth/naturalHeight` before calling `createImageBitmap`. Reject if `naturalWidth > MAX_DIM || naturalHeight > MAX_DIM` where `MAX_DIM = 16384` (the Safari-safe floor across our browser targets). Error: "Image is too large for this browser ({w}×{h}, max {MAX_DIM}). Try a smaller image."
- [ ] `n` and `m` are integers in `[1, 50]`. Non-integer or out-of-range values show inline field errors and disable the Split button.

### Constraints & distribution (testable)
- [ ] **Playwright test `no-network-after-load.spec.ts`:** launches the built `dist/index.html`, counts `page.on('request')` events, performs a full 3×4 split on a fixture 1200×900 PNG, asserts request count is 0 after initial HTML load. Runs in CI.
- [ ] **LICENSE file at repo root** with MIT text.
- [ ] **Built artifact is a single `dist/index.html`** (no separate JS/CSS files) — CI step `test -f dist/index.html && test ! -f dist/assets/*.js` (or equivalent) passes.
- [ ] **Source maps disabled in production:** `vite.config.ts` sets `build.sourcemap: false`. CI step `grep -r "sourceMappingURL" dist/ && exit 1 || exit 0` passes.
- [ ] **Bundle-size hard fail:** CI step checks `wc -c dist/index.html` ≤ 200 KB (uncompressed single-file HTML; ≈ 40–60 KB gzipped). Hard-fail threshold, not advisory.
- [ ] **Deployable with no build-time secrets:** `.github/workflows/pages.yml` has zero `secrets.*` references outside of the `GITHUB_TOKEN` that Actions provides automatically.

### Dropped / replaced criteria (from v1)
- ~~"tab does not become unresponsive for > 5 s at any point"~~ — removed. Not mechanically testable with the planned tooling; replaced by a soft product expectation ("UI should yield between tiles via `await new Promise(r => setTimeout(r, 0))` after every tile encode") in Step 4.
- ~~"Memory usage peaks at ≤ 3× input RGBA"~~ — removed. Not mechanically verifiable without gated browser APIs. Replaced by a code-structure guarantee: "one shared `OffscreenCanvas` sized to `tileW × tileH` is reused across the job; each `ImageBitmap.close()` is called after tile encode" — verified by code review during Step 2 implementation.
- ~~"Total gzipped JS+CSS ≤ 40 KB (budget alarm, not a hard fail)"~~ — promoted to the hard-fail `wc -c dist/index.html ≤ 200 KB` criterion above.

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
6. Add `.github/workflows/pages.yml` — see Step 7 for full spec.
7. Add `LICENSE` (MIT, user's name), update `README.md`.
8. Commit `package-lock.json`; pin `fflate` to an exact version in `package.json`.

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

export function tileFilename(row0: number, col0: number): string {
  // 1-indexed, no zero-padding, matches spec literally
  return `tile_r${row0 + 1}_c${col0 + 1}.png`;
}
```

Pure arithmetic, no DOM, no canvas. Unit-testable.

### 2. Image decode + canvas slicing + probes
File: `src/canvas.ts`

- `const MAX_DIM = 16384;` (Safari-safe floor; sufficient across modern evergreen targets).
- `async function probeDimensions(file: File): Promise<{ width: number; height: number }>` — uses `HTMLImageElement` + `img.decode()` to read `naturalWidth/naturalHeight` pre-canvas, so we fail fast on oversize inputs. Caller compares against `MAX_DIM` and aborts before `createImageBitmap`.
- `async function decodeImage(file: File): Promise<ImageBitmap>` — `createImageBitmap(file, { imageOrientation: 'from-image' })`. If this throws (e.g. Safari + GIF edge case), fallback path: load via `<img>` element, then `createImageBitmap(img)` on the loaded element.
- `async function detectWebPEncode(): Promise<boolean>` — run once at app init. Encode a 1×1 canvas via both `OffscreenCanvas.convertToBlob({ type: 'image/webp' })` and inspect the returned Blob's `.type`. Cache result. Used to decide `encodeTile` output format for WebP inputs.
- `type CanvasLike = OffscreenCanvas | HTMLCanvasElement;`
- `function createTileCanvas(w: number, h: number): { canvas: CanvasLike; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D }` — prefer `OffscreenCanvas`; if `typeof OffscreenCanvas === 'undefined'`, fall back to a detached `HTMLCanvasElement`. **One canvas is created per split job and reused across all tiles** (same size for every tile).
- `async function encodeTile(source: ImageBitmap, target: { canvas: CanvasLike; ctx: ... }, spec: TileSpec, mime: 'image/png' | 'image/jpeg' | 'image/webp', quality?: number): Promise<Uint8Array>`:
  - `ctx.clearRect(0, 0, spec.w, spec.h)`
  - `ctx.drawImage(source, spec.dx, spec.dy, spec.w, spec.h, 0, 0, spec.w, spec.h)`
  - If `canvas instanceof OffscreenCanvas`: `await canvas.convertToBlob({ type: mime, quality })`.
  - Else: use the `HTMLCanvasElement.toBlob` promise wrapper with the same MIME/quality.
  - Return `new Uint8Array(await blob.arrayBuffer())`.
- `function pickOutputMime(inputMime: string, webpSupported: boolean): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp'; fallbackReason?: string }`:
  - `image/png` → PNG.
  - `image/jpeg` → JPEG.
  - `image/webp` → WebP if `webpSupported`, else PNG with `fallbackReason = 'Your browser cannot encode WebP; tiles saved as PNG.'`
  - `image/gif` → PNG (first-frame only).

### 3. ZIP packaging (single-Blob model — honest about memory)
File: `src/zip.ts`

Decision: v1's "streaming ZIP" claim was aspirational; resolving the Architect's tension by **dropping streaming** for v1. Use `fflate.zipSync` on the accumulated tile buffers. Honest memory bound: peak memory ≈ `source decoded RGBA + sum of encoded tile bytes + one zipped-blob copy`. For a 100 MB JPG that decodes to ~800 MB RGBA, this fits on 8 GB RAM. If a future version needs truly streaming output, swap to `fflate.Zip` + `ReadableStream`-based download — documented as a follow-up.

```ts
import { zipSync } from 'fflate';

export function buildZip(tiles: Array<{ name: string; data: Uint8Array }>): Blob {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const t of tiles) entries[t.name] = [t.data, { level: 0 }]; // level 0 = store only
  const bytes = zipSync(entries);
  return new Blob([bytes], { type: 'application/zip' });
}
```

### 4. Orchestration
File: `src/splitJob.ts`

```ts
export async function runSplit(
  file: File,
  opts: SplitOptions,
  onProgress: (done: number, total: number) => void,
): Promise<{ blob: Blob; filename: string }>;
```

Sequence:
1. `probeDimensions(file)` → if oversize, throw.
2. `decodeImage(file)` → `ImageBitmap`.
3. `planTiles(bitmap.width, bitmap.height, opts)` → tile specs.
4. `const target = createTileCanvas(tileW, tileH);` (created once, reused for every tile).
5. `const { mime, ext, fallbackReason } = pickOutputMime(file.type, await detectWebPEncode());` — `ext` overrides `.png` in `tileFilename` when `mime` is not PNG.
6. For each `TileSpec`:
   - `bytes = await encodeTile(bitmap, target, spec, mime, quality)`
   - `accum.push({ name: tileFilename(spec.row, spec.col).replace(/\.png$/, '.' + ext), data: bytes })`
   - `onProgress(++done, tiles.length)`
   - `await new Promise(r => setTimeout(r, 0))` — yield to the UI thread.
7. `bitmap.close()` — free decoded source.
8. `blob = buildZip(accum)`.
9. `filename = \`gridsplit-${basenameOf(file.name)}-${cols}x${rows}.zip\``.
10. Return `{ blob, filename }`.

### 5. UI
File: `src/ui.ts` (inline or split into `dropzone.ts` / `form.ts` / `status.ts` if it helps clarity; keep flat if < 250 lines total).

Vanilla DOM. Single `<main>` with: header, dropzone, `<input type="file">`, `<input type="number" id="rows">`, `<input type="number" id="cols">`, Split button, progress bar, error region, help text footer.

Wiring:
- Drag-over / drop / paste handlers normalize to a `File`.
- File-picker change → validate MIME → call `probeDimensions` → show preview filename + dimensions → enable Split button.
- Input validation on `rows` / `cols` (integer, 1–50) → inline field errors.
- Click Split → `runSplit` with a progress callback that updates the `<progress>` element.
- On success: `URL.createObjectURL(blob)` → programmatic `<a download={filename}>` click → `URL.revokeObjectURL` after ~1 s.
- On error: render the error text in the error region; scroll into view.

File: `src/style.css` — modest, mobile-friendly. ~100 lines.
File: `index.html` — semantic landmarks, `<label for>` pairs, `<meta name="viewport">`, `<title>GridSplit — split an image into tiles</title>`.

### 6. Tests
- **Unit** (Vitest, `tests/split.test.ts`):
  - `planTiles` for divisible, non-divisible, square/rectangular, IMAGE_TOO_SMALL, INVALID_GRID.
  - `tileFilename(0, 0) === 'tile_r1_c1.png'` (1-indexed, no padding — even at 10×10: `tileFilename(9, 9) === 'tile_r10_c10.png'`).
  - **Unicode fixture:** `buildZip([{ name: 'tile_ñ_中_1.png', data: new Uint8Array([137,80,78,71,...]) }])` round-trips via `fflate.unzipSync` with the exact filename preserved.
- **Unit** (`tests/zip.test.ts`): 4-tile known-bytes fixture round-trips. Asserts `level: 0` (store) by inspecting the ZIP's compression-method field (should be 0).
- **Unit** (`tests/canvas-fallback.test.ts`): monkeypatch `globalThis.OffscreenCanvas = undefined`; verify `createTileCanvas` returns an `HTMLCanvasElement`-based result and `encodeTile` still produces a valid PNG.
- **E2E** (Playwright, `tests/e2e/split.spec.ts`): against `vite preview`, load the built `dist/index.html`, drag fixture `1200x900.png`, set `n=3, m=4`, click Split, intercept the download, unzip in Node, assert 12 files of 300×225 each, assert filenames `tile_r1_c1.png ... tile_r3_c4.png`.
- **E2E** (`tests/e2e/no-network.spec.ts`): load page, attach `page.on('request', ...)` after `load` event, perform a split, assert zero subsequent requests.
- **E2E (optional, nightly)** (`tests/e2e/deployed.spec.ts`): same as `no-network.spec.ts` but against the most recently deployed GH Pages URL rather than `vite preview`, to catch base-path / CORS drift.

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
      - run: npm run test:unit            # Vitest
      - run: npx playwright install --with-deps chromium
      - run: npm run build                # Vite → dist/
      - run: npm run test:e2e             # Playwright against vite preview
      - name: Single-file + no-sourcemap guard
        run: |
          test -f dist/index.html
          ! ls dist/assets 2>/dev/null | grep -E '\.(js|css|map)$' || { echo "expected inlined single-file build"; exit 1; }
          ! grep -r "sourceMappingURL" dist/ || { echo "source maps leaked"; exit 1; }
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
| Canvas dimension limit hit on large images | Medium | High (tab crash) | Step 2 `probeDimensions` runs before any canvas allocation; rejects `> MAX_DIM` with a user-visible error. AC: "Pre-decode dimension check". |
| `fflate` bundle grows surprisingly | Very Low | Low | Step 7 bundle-size CI hard-fail: `wc -c dist/index.html ≤ 200 KB`. |
| `OffscreenCanvas` not supported (older Safari) | Low | Medium | Step 2 `createTileCanvas` returns `HTMLCanvasElement`-based result when `OffscreenCanvas` is undefined; `encodeTile` branches on type. Test: `tests/canvas-fallback.test.ts`. |
| Animated GIF users expect all frames | Medium | Low (scoped out) | Documented in UI help text (Step 5 `index.html` help block). Non-goal, not a bug. |
| WebP encode missing / pretending-to-work on some Safari | Low | Low | Step 2 `detectWebPEncode` probes by actually encoding and inspecting the returned Blob's `.type` — not just checking `canvas.toBlob` existence. Falls back to PNG with info message. |
| Memory balloon on 100 MB inputs | Medium | High (tab crash) | Step 2 reuses one `OffscreenCanvas` sized `tileW × tileH` across all tiles. Step 4 calls `bitmap.close()` after tile loop. Step 4 also yields between tiles via `setTimeout(r, 0)`. Documented memory bound in Step 3. |
| Filename encoding for non-ASCII basenames | Medium | Low | `fflate` supports UTF-8 filenames. Verified: `tests/split.test.ts` Unicode fixture (Step 6). |
| EXIF-rotated JPG produces wrong tile mapping | Medium | High (silent correctness bug) | Step 2 `decodeImage` uses `{ imageOrientation: 'from-image' }`. AC: "EXIF-oriented JPGs produce tiles aligned to displayed orientation". |
| CI workflow cannot run Playwright without browser install | High | High (pipeline broken) | Step 7 workflow includes `npx playwright install --with-deps chromium` before `npm run test:e2e`; unit and E2E are separate scripts so unit failures don't require browsers. |
| GH Pages `base: './'` drift not caught by `vite preview` | Low | Medium | Step 6 `tests/e2e/deployed.spec.ts` (optional nightly) runs against the actual deployed URL. |

## Verification Steps

1. `npm ci` — no errors, lockfile committed.
2. `npm run test:unit` — Vitest green, including Unicode fixture and `canvas-fallback` test.
3. `npx playwright install --with-deps chromium`.
4. `npm run build` — produces `dist/index.html`.
5. `ls dist/` — contains ONLY `index.html` (and possibly `.nojekyll`); no separate `.js` / `.css` / `.map` files.
6. `grep -r "sourceMappingURL" dist/` — returns nothing.
7. `wc -c dist/index.html` — ≤ 204800 bytes.
8. `npm run test:e2e` — both `split.spec.ts` and `no-network.spec.ts` green.
9. `npm run preview` — open `http://localhost:4173/` in Chrome, Firefox, Safari, Edge. Manually:
   - Split a 1200×900 PNG at 3×4; `unzip -l downloaded.zip`; `identify` each tile (expect 300×225).
   - Split a 1000×1000 PNG at 3×3; verify 333×333 tiles.
   - Split a 2×2 PNG at 3×3; verify UI blocks with correct error.
   - Upload a JPG with EXIF rotation tag; verify tiles are aligned to displayed orientation.
   - Upload a static GIF; verify tiles are PNG.
   - Upload an unsupported type (`.bmp`); verify UI rejects with correct error.
10. Push to `main` — GH Actions runs `pages.yml`; deploy succeeds; deployed URL loads and performs a split end-to-end. DevTools Network shows zero requests during split.

## ADR

**Decision:** Implement GridSplit as vanilla TypeScript + Vite + `fflate` + `vite-plugin-singlefile` → one static `index.html`.

**Drivers:**
1. Distribution cost = $0 forever; compatible with any free static host.
2. Implementation core fits within ~10 focused hours (excluding cross-browser manual QA + deploy).
3. Predictable, fail-loud behavior on browser-canvas edge cases (pre-decode probing, EXIF handling, WebP fallback).

**Alternatives considered:**
- **Option B (Pure hand-written single HTML with inlined fflate):** Architecturally cleanest — single-file artifact by construction, no `node_modules`, no build step. Rejected for v1 because (a) TS catches Canvas/Blob/`OffscreenCanvas` API-type confusion that is easy to write incorrectly, and (b) Vitest + Playwright integration is materially easier when source is split into testable modules. The *artifact property* of B is preserved in Option A via `vite-plugin-singlefile`.
- **Option C (SvelteKit / Next.js static export):** Rejected outright — violates Principle 3 (small surface) and Principle 4 (lightest stack), and invalidated by Decision Driver #2 (≤10-hour implementation core). Framework overhead of 30–100 KB for a one-route app is unjustified.

**Why chosen:** Option A provides the smallest stack that still delivers (a) TS safety on Canvas/Blob API misuse, (b) a testable module structure for Vitest + Playwright, and (c) a single-file artifact matching Option B's distribution property via `vite-plugin-singlefile`. It is deployable to any free static host with no environment variables or build secrets, satisfying Driver #1.

**Consequences:**
- Requires Node + npm toolchain for contributors (standard for web dev; not zero-tool).
- Adds `vite-plugin-singlefile` dependency (pin exact version in `package.json`).
- Adds `node_modules` build-time surface; `npm ci` and `package-lock.json` mitigate supply-chain drift.
- CI step count grows (Playwright browser install is the largest contributor).

**Follow-ups (post-v1):**
- Truly streaming ZIP output via `fflate.Zip` + `ReadableStream` + `Response.body` → `URL.createObjectURL` — deferred until memory evidence demands it.
- Single-file authoring experience (collapsing Option A's source into Option B's shape) if the app stays this small.
- PWA / Service Worker (explicit non-goal for v1).
- Batch upload (explicit non-goal for v1).
- Drag-to-resize grid preview overlay.

## Changelog (v1 → v2)

### Architect-driven blockers resolved
- `split.ts` tile-coordinate spec rewritten in code (no NumPy slice notation); `dx = col * tileW`, `dy = row * tileH` with `row ∈ [0, rows)`, `col ∈ [0, cols)`; 1-indexed filenames applied at output boundary.
- Streaming-vs-Blob contradiction resolved by dropping streaming for v1; memory claim rewritten honestly in Step 3; `fflate.zipSync` used.
- EXIF orientation handled via `createImageBitmap(file, { imageOrientation: 'from-image' })` in Step 2; dedicated AC added.

### Architect-driven strong recommendations applied
- `vite-plugin-singlefile` added to Step 0 scaffolding and `vite.config.ts`.
- `build.sourcemap: false` set in `vite.config.ts`.
- Single `OffscreenCanvas` reused across tiles (Step 4 orchestration).
- `planTiles` now throws `INVALID_GRID` for non-integer / out-of-range inputs AND `IMAGE_TOO_SMALL` when `tileW < 1 || tileH < 1`.
- `tests/canvas-fallback.test.ts` covers main-thread canvas path.
- Optional nightly E2E against deployed GH Pages URL (`tests/e2e/deployed.spec.ts`).

### Critic-driven blockers resolved
- Canvas pre-decode dimension check: `probeDimensions` via `HTMLImageElement` added to Step 2, wired to input validation AC.
- Bundle-size CI hard-fail: `wc -c dist/index.html ≤ 204800` in `pages.yml`.
- `OffscreenCanvas` fallback is a concrete code path via `createTileCanvas` + `encodeTile` branching, not a handwave.
- Unicode fixture added to `tests/split.test.ts`.
- "Unresponsive > 5 s" and "Memory ≤ 3× RGBA" ACs removed; replaced with structural guarantees (code-review-verifiable) and the bundle-size hard-fail.
- 40 KB gzip "budget alarm" promoted to 200 KB single-file HTML hard-fail.
- `pages.yml` now includes `npx playwright install --with-deps chromium` and splits `test:unit` / `test:e2e`.
- Filename padding rule realigned to spec literally: `tile_r{row+1}_c{col+1}.png`, no zero-padding ever.
- Safari `convertToBlob` WebP probe: `detectWebPEncode` inspects the returned Blob's `.type` rather than just trusting `toBlob` existence.
- GIF fallback path added: if `createImageBitmap(file)` throws, decode via `<img>` element then `createImageBitmap(img)`.
- Driver #2 rescoped: "Implementation core fits within ~10 focused hours" (not "one day"), acknowledging full QA + deploy may span 2–3 calendar days.
