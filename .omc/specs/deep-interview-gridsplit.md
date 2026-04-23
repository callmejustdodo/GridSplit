---
name: deep-interview-gridsplit
description: Crystallized spec for GridSplit — client-only static web tool that splits one image into an n×m grid of equal tiles and delivers them as a ZIP
type: spec
---

# Deep Interview Spec: GridSplit

## Metadata
- Interview ID: gridsplit-2026-04-23
- Rounds: 6
- Final Ambiguity Score: 9%
- Type: greenfield
- Generated: 2026-04-23
- Threshold: 20% (0.2)
- Status: PASSED

## Clarity Breakdown

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.92 | 0.40 | 0.368 |
| Constraint Clarity | 0.92 | 0.30 | 0.276 |
| Success Criteria | 0.88 | 0.30 | 0.264 |
| **Total Clarity** | | | **0.908** |
| **Ambiguity** | | | **0.092** |

## Goal

GridSplit is a free, client-only static web page that takes a single user-supplied image, splits it into an exact `n × m` grid of equal-sized tiles, and delivers the tiles as one auto-downloaded ZIP. All processing happens in the browser — no server, no upload, no account.

## Constraints

- **Client-only**: all logic runs in the browser; nothing is uploaded or transmitted.
- **Form factor**: single static web page served from a public URL (e.g., GitHub Pages / Netlify / Cloudflare Pages). One `index.html` plus bundled JS/CSS is acceptable; inlining into one file is a nice-to-have, not required.
- **Input formats**: PNG, JPG/JPEG, WebP, static GIF.
- **Max input size**: soft ceiling of ~100 MB (subject to browser canvas limits; graceful failure required above that).
- **Browser targets**: modern evergreen browsers — latest two major versions of Chrome, Firefox, Safari, Edge. No IE, no legacy mobile.
- **License**: MIT (or similarly permissive OSS license), public source.
- **Cost**: free to use, no paywall, no ads, no telemetry.

## Non-Goals

- No batch upload (v1 handles exactly one image at a time).
- No server component of any kind (no uploads, no account, no analytics backend).
- No desktop app / Electron / Tauri build.
- No PWA / Service Worker / offline install story in v1.
- No Instagram-specific overlays, numbering, carousel automation, or watermarking.
- No tile-size-based splitting mode (user specifies `n × m`, never pixel dimensions).
- No editing features (no crop, rotate, resize, filters) beyond the split itself.
- No support for animated GIF frames (static GIF only — first frame or flattened).
- No refusal UI for non-divisible dimensions (the tool handles it silently — see Goal).

## Acceptance Criteria

### Core happy path
- [ ] User opens the public URL in a supported browser and sees a drag-and-drop / file-picker surface plus inputs for `n` (rows) and `m` (columns).
- [ ] User drops a 1200×900 PNG, sets `n=3`, `m=4`, and clicks the split action.
- [ ] The browser produces a ZIP containing exactly 12 PNG tiles, each 300×225 pixels, and triggers a download.
- [ ] Tile files have deterministic, human-readable names (e.g., `tile_r{row}_c{col}.png`, 1-indexed).

### Edge-pixel handling
- [ ] On a 1000×1000 image split 3×3, every tile is exactly 333×333; the last 1 pixel of the right edge and 1 pixel of the bottom edge are cropped (discarded). No padding, no size variance.
- [ ] The same rule applies uniformly for any non-divisible combination: tile size = `floor(dim / count)`, and the rightmost / bottommost pixels beyond `tile_size × count` are dropped.

### Format support
- [ ] JPG input → JPG tiles in ZIP, same quality level where feasible.
- [ ] PNG input → PNG tiles.
- [ ] WebP input → WebP tiles (fallback to PNG if the browser cannot encode WebP).
- [ ] Static GIF input → PNG tiles (GIF encoding is not required for output).

### Size / performance
- [ ] A ~100 MB image does not crash the tab on a machine with ≥8 GB RAM; it either completes or fails with a clear user-visible error.
- [ ] Inputs above the browser canvas dimension limit show a human-readable error rather than a silent failure.

### Constraints & distribution
- [ ] No network requests are made after initial page load (verifiable in DevTools Network tab).
- [ ] Source is published under MIT (or equivalent permissive license) with a `LICENSE` file.
- [ ] Deployable by a static host (GitHub Pages / Netlify / Cloudflare Pages) with no build-step secrets and no server runtime.

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "n × m" means split one image into tiles | Could have meant the inverse (compose n×m into one) | Confirmed: split direction only |
| Output is many files | Could have been per-file downloads or in-page preview | Confirmed: single auto-downloaded ZIP |
| Form factor is static web | Could have been PWA / desktop / self-contained HTML | Confirmed: static web page at public URL |
| Users think in `n × m` | Contrarian challenge: tile-size framing might be more natural | Confirmed: `n × m` is the real mental model |
| Non-divisible dimensions need handling | Could have been: distribute, crop, pad, or refuse | Confirmed: equal tiles, crop remainder |
| Scope is broad | Simplifier challenge: could ship narrower (strict MVP) | Broader chosen — PNG/JPG/WebP/static-GIF, ~100 MB |

## Technical Context

Greenfield. Current repo contains only `README.md` (`# GridSplit`) and an empty `.gitignore`. No existing frontend stack to respect.

**Likely stack (implementation-time decision, not locked by this spec):**
- Zero-framework vanilla TS/JS is viable and matches the "static page" constraint.
- A tiny bundler (Vite) + a ZIP library (`fflate` is small and fast) + `<canvas>` for slicing is a reasonable default.
- No server runtime, no API routes, no environment variables at runtime.
- Deploy target: any static host; recommend GitHub Pages for zero-cost alignment with the "free" goal.

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Image | core domain | `file`, `width`, `height`, `format` (PNG/JPG/WebP/GIF) | is split into many `Tile`s |
| Grid | core domain | `n` (rows), `m` (columns) | defines the split applied to `Image` |
| Tile | core domain | `row`, `col`, `width`, `height`, `blob`, `filename` | belongs to one `Image`, produced per `Grid` cell |
| ZIP | core domain | `filename`, `tiles[]` | aggregates all `Tile`s for one split operation |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 3 (Image, Grid, Tile) | 3 | 0 | 0 | N/A |
| 2 | 4 (+ ZIP) | 1 | 0 | 3 | 75% |
| 3 | 4 | 0 | 0 | 4 | 100% |
| 4 | 4 | 0 | 0 | 4 | 100% |
| 5 | 4 | 0 | 0 | 4 | 100% |
| 6 | 4 | 0 | 0 | 4 | 100% |

Converged at Round 3 and held stable through the remaining rounds — the domain model is firm.

## Interview Transcript

<details>
<summary>Full Q&A (6 rounds)</summary>

### Round 1 — Targeting: Goal Clarity (Ontology-style)
**Q:** When you say "GridSplit for n x m images", which direction is the core operation?
**A:** Split 1 image into n×m tiles
**Ambiguity:** 62% (Goal: 0.65, Constraints: 0.30, Criteria: 0.10)

### Round 2 — Targeting: Success Criteria
**Q:** When a user finishes splitting, what exactly do they walk away with?
**A:** ZIP with all tiles
**Ambiguity:** 41% (Goal: 0.80, Constraints: 0.35, Criteria: 0.55)

### Round 3 — Targeting: Constraints
**Q:** What's the form factor — how does the user actually reach GridSplit?
**A:** Static web page (public URL)
**Ambiguity:** 29% (Goal: 0.80, Constraints: 0.70, Criteria: 0.60)

### Round 4 — Targeting: Goal (Contrarian mode)
**Q:** What if "n × m" isn't actually how users want to specify the split — which framing is the real one?
**A:** n×m is definitely right
**Ambiguity:** 27% (Goal: 0.83, Constraints: 0.70, Criteria: 0.62)

### Round 5 — Targeting: Goal
**Q:** A user uploads a 1000×1000 image and picks a 3×3 split. What does GridSplit do?
**A:** Equal tiles + crop remainder
**Ambiguity:** 21% (Goal: 0.88, Constraints: 0.70, Criteria: 0.75)

### Round 6 — Targeting: Constraints (Simplifier mode)
**Q:** What's the MVP operational envelope — how small can v1 be and still be worth shipping?
**A:** Broader (PNG/JPG/WebP/GIF-static, ~100MB)
**Ambiguity:** 9% (Goal: 0.92, Constraints: 0.92, Criteria: 0.88)

</details>
