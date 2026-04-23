---
name: gridsplit-plan
description: Consensus implementation plan for GridSplit — client-only static web image splitter
type: plan
status: draft
spec_source: .omc/specs/deep-interview-gridsplit.md
---

# GridSplit Implementation Plan (Draft v1)

## Requirements Summary

Build a **free, client-only, single-page web tool** that splits one user-supplied image into an `n × m` grid of equal-sized tiles and delivers them as an auto-downloaded ZIP. All processing in the browser, no server, no network requests after page load. Supported inputs: PNG, JPG/JPEG, WebP, static GIF, up to ~100 MB. Modern evergreen browsers only. MIT-licensed, deployable to a static host (GitHub Pages / Netlify / Cloudflare Pages).

## RALPLAN-DR Summary

### Principles (5)

1. **Zero server, zero upload** — user images never leave the tab. Verifiable via DevTools Network tab showing no requests after initial load.
2. **Predictable output over clever output** — edge pixels are cropped, not padded or distributed. Every tile is identical in size. Surprising behavior is worse than lossy behavior.
3. **Small surface, narrow scope** — v1 does one thing (split 1 image into n×m equal tiles → ZIP) and nothing else. No batch, no overlays, no editing.
4. **Default to the lightest stack that works** — no framework if not needed; if a bundler is needed, prefer the smallest plausible one. Ship a static site, not an SPA wrapped in a static site.
5. **Fail loudly and humanly** — canvas/memory limits and unsupported formats produce user-visible errors, never silent hangs or blank screens.

### Decision Drivers (Top 3)

1. **Distribution cost = $0 forever** — choice must deploy on free static hosts without a backend, without build secrets, and without per-user cost scaling.
2. **Time-to-ship** — a competent developer should be able to implement, test, and deploy v1 in a single focused day. Stack choice should not dominate the work.
3. **Graceful handling of large images** — 100 MB inputs and multi-hundred-megapixel canvas dimensions must either succeed or fail cleanly; a crashed tab is a failed product.

### Viable Options

#### Option A — Vanilla TS + Vite + fflate (Recommended)

- **Approach:** TypeScript source, Vite build producing a static `dist/` with `index.html` + one JS bundle + one CSS file. Uses the browser `<canvas>` API for slicing and [`fflate`](https://github.com/101arrowz/fflate) (~8 KB gz) for in-memory ZIP creation and streaming download via a Blob URL.
- **Pros:** Smallest plausible bundle (~15–25 KB gz total incl. app code). No framework overhead. Vite gives fast DX, TypeScript catches canvas/Blob API misuse at build. `fflate` is the fastest browser ZIP lib and supports streaming for large outputs. Trivially deployable to GH Pages / Netlify / CF Pages as a static folder.
- **Cons:** User must hand-write DOM code (small UI: dropzone, 2 number inputs, 1 button, 1 error area — manageable). Vite does add `node_modules` and a build step vs. pure hand-written HTML.

#### Option B — Pure hand-written single `index.html`

- **Approach:** One HTML file with inline `<script type="module">` and inline `<style>`. No build step, no `node_modules`, no bundler. Use `fflate` via a single `<script type="module" src="…esm.sh/fflate">` import or an inlined copy.
- **Pros:** Distribution is literally copying one file. Matches the "static, free, forever" principle most directly. No supply chain beyond fflate. Offline-by-default once the file is opened.
- **Cons:** No TypeScript safety. CDN import introduces one network dependency after load (violates Principle 1) unless fflate is inlined, which bloats a hand-maintained file. Harder to unit-test in isolation. Scales poorly if even minor UI polish is added.

#### Option C — SvelteKit / Next.js static export

- **Approach:** A meta-framework exporting a fully static site.
- **Pros:** Rich component model and routing primitives if the app grows.
- **Cons:** Massively over-scoped — GridSplit has one route and a trivial state machine. Adds 30–100 KB of framework JS for zero user-visible benefit. Directly conflicts with Principles 3 and 4. **Rejected**: invalidated by Decision Driver #2 (time-to-ship) and Principle 4 (lightest stack that works).

**Option chosen: A (Vanilla TS + Vite + fflate).** B is a close runner-up; we accept A's build-step cost in exchange for type safety on the canvas/Blob APIs (which are a rich vein of subtle bugs) and a clean dependency graph. If the deliverable ever needs to become a single-file distribution, A can be post-processed into one file.

## Acceptance Criteria

Every criterion below is either a concrete automated/manual test or a verifiable file/command check.

### Core happy path
- [ ] Opening `https://<host>/` in a supported browser renders: drag-and-drop surface, file picker button, numeric inputs labeled "Rows (n)" and "Columns (m)" (both default to 3, min 1, max 50), a "Split" button (disabled until an image is loaded and both `n`, `m` are valid), and an error/status region.
- [ ] Dropping a 1200×900 PNG, setting `n=3, m=4`, and clicking "Split" produces a ZIP download named `gridsplit-<originalBasename>-3x4.zip` containing exactly 12 PNG files, each 300×225 pixels. File names: `tile_r{1..3}_c{1..4}.png` (1-indexed, zero-padded to 2 digits only if `n` or `m` ≥ 10, i.e. `tile_r01_c01.png` for ≥10×10).
- [ ] ZIP metadata: no compression is fine (store-only), mtime set to the user's local time at export. No hidden OS files (no `.DS_Store`).

### Edge-pixel handling
- [ ] On a 1000×1000 image split 3×3, every tile is exactly 333×333; the trailing 1 px right and 1 px bottom are discarded. Formula: `tileW = floor(imgW / m)`, `tileH = floor(imgH / n)`; tile at `(r, c)` is `image[c*tileW : (c+1)*tileW, r*tileH : (r+1)*tileH]`.
- [ ] On a 10×10 image split 3×3, every tile is 3×3 (trailing 1 px right + 1 px bottom discarded). No tile is empty, no error.
- [ ] On an image where `min(imgW, imgH) < max(n, m)` (e.g. 2×2 image split 3×3), UI rejects with an inline error "Image too small for this grid" — does not produce empty tiles.

### Format support
- [ ] JPG input → JPG tiles (quality 0.92, matching MDN's default `HTMLCanvasElement.toBlob` advice).
- [ ] PNG input → PNG tiles (lossless).
- [ ] WebP input on a browser that exposes `canvas.toBlob('image/webp', …)` → WebP tiles; on a browser that does not (rare among targets) → PNG tiles with an info message "Your browser cannot encode WebP; tiles saved as PNG."
- [ ] Static GIF input → PNG tiles (first frame only; multi-frame animation is not preserved — this is documented in UI help text).

### Input validation
- [ ] File picker / drop zone accepts: `image/png, image/jpeg, image/webp, image/gif`. Other MIME types or unrecognized files show "Unsupported format (PNG, JPG, WebP, GIF only)".
- [ ] Files above 100 MB show a warning "File is >100 MB — large images may fail to decode in the browser. Proceed?" with Proceed / Cancel. If user proceeds and decode fails, a user-visible error is shown with the error message surfaced.
- [ ] `n` and `m` are constrained to integers in `[1, 50]`; out-of-range values show inline field errors and disable the Split button.

### Size / performance
- [ ] A ~100 MB image on a machine with ≥8 GB RAM completes a 3×3 split in < 30 s or fails with a clear error; the tab does not become unresponsive for > 5 s at any point (use `requestAnimationFrame` yield points between tile encodes).
- [ ] Inputs above the browser's canvas dimension limit (Safari ~16,384 px per side; Chrome ~32,767 px) show a human-readable error: "Image is too large for this browser ({w}×{h}, max ~{limit}). Try a smaller image."
- [ ] Memory usage peaks at ≤ 3× the input image's decoded RGBA size during export (one source canvas + one tile canvas + ZIP buffer that is flushed per tile).

### Constraints & distribution
- [ ] DevTools Network tab shows zero requests after the initial HTML/JS/CSS load (verified manually and via a Playwright test that asserts `page.on('request')` count after load is 0 during a split operation).
- [ ] `LICENSE` file at repo root containing the MIT license.
- [ ] `npm run build` produces a `dist/` folder that deploys to GitHub Pages / Netlify / Cloudflare Pages with no environment variables, no server runtime, and no build-time secrets.
- [ ] Total gzipped JS+CSS for v1 ≤ 40 KB (budget alarm, not a hard fail).

## Implementation Steps

### 0. Scaffolding
1. `npm create vite@latest . -- --template vanilla-ts` (non-interactive variant if available; otherwise script the answers).
2. Install runtime deps: `npm i fflate`.
3. Install dev deps: `npm i -D @types/node vitest @playwright/test`.
4. Delete Vite starter boilerplate (`src/counter.ts`, `public/vite.svg`, starter CSS/HTML content). Keep `src/main.ts`, `src/style.css`, `index.html`, `tsconfig.json`, `vite.config.ts`.
5. Add `.github/workflows/pages.yml` (see step 7).
6. Add `LICENSE` (MIT, user's name), `README.md` (update existing from `# GridSplit`).

### 1. Core split algorithm (pure, testable)
- File: `src/split.ts`
- Exports:
  - `type SplitOptions = { rows: number; cols: number }`
  - `type TileSpec = { row: number; col: number; dx: number; dy: number; w: number; h: number }`
  - `function planTiles(imgW: number, imgH: number, opts: SplitOptions): { tileW: number; tileH: number; tiles: TileSpec[] }`
  - Throws `new Error('IMAGE_TOO_SMALL')` when `imgW < cols || imgH < rows`.
- Pure arithmetic, no DOM, no canvas. Easy to unit-test.

### 2. Image decode + canvas slicing
- File: `src/canvas.ts`
- Exports:
  - `async function decodeImage(file: File): Promise<{ bitmap: ImageBitmap; width: number; height: number }>` using `createImageBitmap(file)` (works for PNG/JPG/WebP; for GIF the first frame is returned).
  - `async function encodeTile(source: ImageBitmap, spec: TileSpec, mime: 'image/png' | 'image/jpeg' | 'image/webp', quality?: number): Promise<Uint8Array>` — creates an `OffscreenCanvas(spec.w, spec.h)`, draws the subregion via `drawImage(source, spec.dx, spec.dy, spec.w, spec.h, 0, 0, spec.w, spec.h)`, then `canvas.convertToBlob({ type, quality })` → `arrayBuffer()` → `Uint8Array`.
  - `function pickOutputMime(inputMime: string): { mime: string; ext: string; fallbackReason?: string }` — maps PNG→PNG, JPG→JPG, WebP→WebP (with Safari-feature-detect fallback to PNG), GIF→PNG.

### 3. ZIP packaging (streaming)
- File: `src/zip.ts`
- Uses `fflate.Zip` + `ZipPassThrough` for streaming: each encoded tile is pushed in as it's produced so peak memory stays bounded.
- Exports `async function streamToZip(tiles: AsyncIterable<{ name: string; data: Uint8Array }>, onProgress?: (done: number, total: number) => void): Promise<Blob>`.
- Zero compression (store-only): tiles are already compressed image data; re-compressing costs CPU for < 1% savings.

### 4. Orchestration
- File: `src/splitJob.ts`
- Exports `async function runSplit(file: File, opts: SplitOptions, onProgress): Promise<{ blob: Blob; filename: string }>`.
- Sequence: decode → planTiles → loop over TileSpecs encoding each → feed to streamToZip → return final Blob. Uses `requestIdleCallback` / `await new Promise(r => setTimeout(r, 0))` between tiles to keep the UI thread responsive.

### 5. UI
- File: `src/ui.ts` (or split into `dropzone.ts`, `form.ts`, `status.ts` if it clarifies; keep it flat if < 250 lines total).
- Vanilla DOM. Single `<main>` with: header, dropzone, `<input type="file">`, `<input type="number" id="rows">`, `<input type="number" id="cols">`, Split button, progress bar, error region, help text footer.
- Wire up: drag-over/drop handlers, file-picker change, input validation on `rows/cols`, click handler calls `runSplit`, progress updates, error display, final Blob → `URL.createObjectURL` → programmatic `<a download>` click → revoke URL.
- File: `src/style.css` — modest, mobile-friendly, no framework. ~100 lines.
- File: `index.html` — semantic landmarks, labels, `<meta name="viewport">`, `<title>GridSplit — split an image into tiles</title>`.

### 6. Tests
- **Unit** (Vitest, `tests/split.test.ts`): verify `planTiles` for divisible, non-divisible, square/rectangular, and IMAGE_TOO_SMALL cases.
- **Unit** (`tests/zip.test.ts`): feed a known set of byte arrays, parse the resulting ZIP (via `fflate.unzip`), assert file names and bytes match exactly.
- **E2E** (Playwright, `tests/e2e/split.spec.ts`): launch static preview (`vite preview`), load the page, drag a fixture 1200×900 PNG (from `tests/fixtures/`), set `n=3, m=4`, click Split, intercept the download, unzip in Node, assert 12 files each 300×225. Assert `page.on('request')` count is 0 after initial load during the split.

### 7. Deploy
- `.github/workflows/pages.yml`: on push to `main`, run `npm ci && npm run build && npm test`, then deploy `dist/` to GitHub Pages via `actions/deploy-pages`.
- `vite.config.ts`: set `base: './'` so paths work on GH Pages project sites.
- Update `README.md` with: live URL placeholder, usage blurb, "no server, client-only" note, license line, local-dev instructions.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Canvas dimension limit hit on large images | Medium | High (tab crash) | Feature-detect + compare to known browser limits pre-decode; show human-readable error. Document limits in help text. |
| Multi-download / popup blocker intercepts ZIP download | Low | Medium | Use a single programmatic `<a download>` click (one file), not multiple — works consistently. |
| `fflate` bundle grows surprisingly | Very Low | Low | Track gz size in CI (<40 KB budget). Swap to a subset import if needed. |
| `OffscreenCanvas` not supported (older Safari) | Low within evergreen targets | Medium | Feature-detect; fall back to main-thread `<canvas>` with a `requestAnimationFrame` yield between tiles. |
| Animated GIF users expect all frames | Medium | Low (scoped out) | Document clearly in UI help text. This is a non-goal, not a bug. |
| WebP encode missing on some Safari versions | Low | Low | Already covered: fall back to PNG with info message. |
| Memory balloon on 100 MB images | Medium | High (tab crash) | Stream ZIP via `fflate.Zip`; reuse a single off-screen canvas; explicit `bitmap.close()` after each tile; yield between tiles. |
| Filename encoding for non-ASCII basenames | Medium | Low | `fflate` supports UTF-8 filenames; verify via a unit-test fixture with Unicode name. |

## Verification Steps

1. `npm ci && npm run build && npm test` all pass locally.
2. `npm run preview` → open in Chrome, Firefox, Safari, Edge. Manually split a 1200×900 PNG into 3×4; verify ZIP contents (`unzip -l`). Verify DevTools Network has zero requests during split.
3. Manual QA with each supported format (PNG, JPG, WebP, GIF).
4. Manual QA with a non-divisible case (1000×1000 → 3×3) and inspect tile dimensions via `file *.png` or ImageMagick `identify`.
5. Manual QA with an edge case too-small image (2×2 → 3×3) — assert UI blocks with the correct error.
6. Playwright e2e run in CI against the built `dist/`.
7. Deploy a preview to GH Pages; confirm live URL loads and performs a split end-to-end; confirm DevTools Network is silent after load.

## ADR

**Decision:** Implement GridSplit as a vanilla TypeScript + Vite + fflate single-page static app.

**Drivers:**
1. Zero runtime cost (Principle: "free forever"); compatible with any free static host.
2. Time-to-ship: one focused day for a competent developer.
3. Predictable, fail-loud behavior on browser-canvas edge cases.

**Alternatives considered:**
- **Option B (Pure single-file HTML):** Attractive for distribution simplicity, but rejected as the default because (a) no TypeScript safety on the Canvas / Blob / fflate APIs where subtle bugs live, and (b) CDN import of fflate breaks Principle 1 ("no network requests after load") unless inlined, which bloats a hand-maintained file.
- **Option C (SvelteKit / Next.js static export):** Rejected outright — over-scoped, violates Principles 3 and 4 (small surface, lightest stack), adds 30–100 KB framework overhead for a one-route app.

**Why chosen:** Option A is the smallest stack that still gives us (1) type safety where it materially reduces bugs (Canvas/Blob API misuse) and (2) a clean dependency graph (no post-load network imports). It remains fully deployable as a static site, and is trivially post-processable into a single-file distribution if that ever becomes desirable.

**Consequences:**
- Requires a Node + `npm` toolchain for contributors (standard for web dev, but not literally zero-tool).
- Ships a `node_modules` build-time surface; mitigated by pinning fflate and using `npm ci` in CI.
- Small build step between source and deploy; GitHub Action fully automates this.

**Follow-ups (post-v1):**
- Optional single-file distribution build (Vite plugin `vite-plugin-singlefile`).
- PWA / Service Worker for offline install (explicit non-goal for v1).
- Batch mode (explicit non-goal for v1).
- Drag-to-resize grid preview overlay.

## Open Questions

1. **Tile naming padding rule** — spec says zero-pad when `n` or `m` ≥ 10; is that acceptable? (Locked in plan unless reviewer pushes back.)
2. **ZIP filename** — `gridsplit-<basename>-NxM.zip` proposed; OK?
3. **JPG quality** — 0.92 chosen as the Canvas default; acceptable?

These are "best-guess defaults"; Architect/Critic may adjust.
