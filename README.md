# GridSplit

Split one image into an `n × m` grid of equal-sized tiles — all in your browser, no server, no upload.

Live demo: _(to be filled in after first GitHub Pages deploy)_

## Usage

1. Open the page.
2. Drag-and-drop, paste, or pick an image (PNG / JPG / WebP / static GIF, up to 100 MB).
3. Set **Rows (n)** and **Columns (m)** (integers, 1–50). A live preview shows exactly where tiles will cut and highlights any edge pixels that will be discarded.
4. Click **Split**. Your browser downloads `gridsplit-<basename>-<m>x<n>.zip` containing the tiles.

Edge pixels that don't fit the grid are discarded — every tile is identical in size.

## No server, client-only

No upload, no analytics, no network traffic after the initial page load. The built artifact is a single `index.html` file; your image never leaves the tab.

## Local development

```bash
npm ci
npm run dev
```

Other scripts:

- `npm run build` — produces a single-file `dist/index.html`.
- `npm run preview` — serves the built artifact on `http://localhost:4173/`.
- `npm run test:unit` — runs the Vitest unit suite.
- `npm run test:e2e` — runs the Playwright E2E suite (requires `npx playwright install chromium`).

## License

MIT — see [LICENSE](./LICENSE).
