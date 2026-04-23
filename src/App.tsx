import { useCallback, useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon, CheckCircle2Icon, XIcon } from "lucide-react";
import { Dropzone } from "@/components/Dropzone";
import { GridControls } from "@/components/GridControls";
import { TilePreview } from "@/components/TilePreview";
import { MAX_DIM, MAX_RGBA_BYTES_WARN, probeDimensions } from "@/canvas";
import { runSplit } from "@/splitJob";

type Dims = { width: number; height: number };
type ProgressState = { done: number; total: number } | null;
type Status =
  | { kind: "idle" }
  | { kind: "busy"; progress: ProgressState }
  | { kind: "done"; filename: string; fallbackReason?: string }
  | { kind: "error"; message: string };

const ACCEPTED_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [dims, setDims] = useState<Dims | null>(null);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const acceptFile = useCallback(async (f: File) => {
    setStatus({ kind: "idle" });
    setFile(null);
    setDims(null);

    if (!ACCEPTED_MIMES.has(f.type)) {
      setStatus({ kind: "error", message: "Unsupported format (PNG, JPG, WebP, GIF only)." });
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      const proceed = window.confirm("File is >100 MB — large images may fail to decode. Proceed?");
      if (!proceed) return;
    }

    let probed: Dims;
    try {
      probed = await probeDimensions(f);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      setStatus({ kind: "error", message: `Could not decode image: ${msg || "unknown error"}` });
      return;
    }

    if (probed.width > MAX_DIM || probed.height > MAX_DIM) {
      setStatus({
        kind: "error",
        message: `Image is too large for this browser (${probed.width}×${probed.height}, max ${MAX_DIM}).`,
      });
      return;
    }

    const rgbaBytes = probed.width * probed.height * 4;
    if (rgbaBytes > MAX_RGBA_BYTES_WARN) {
      const mb = Math.round(rgbaBytes / 1_000_000);
      const proceed = window.confirm(
        `Image is very large (${probed.width}×${probed.height}, ~${mb} MB decoded). May crash the tab. Proceed?`,
      );
      if (!proceed) return;
    }

    setFile(f);
    setDims(probed);
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setDims(null);
    setStatus({ kind: "idle" });
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) {
            void acceptFile(f);
            return;
          }
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [acceptFile]);

  const canSplit =
    file !== null &&
    dims !== null &&
    Number.isInteger(rows) &&
    Number.isInteger(cols) &&
    rows >= 1 &&
    rows <= 50 &&
    cols >= 1 &&
    cols <= 50 &&
    Math.floor(dims.width / cols) >= 1 &&
    Math.floor(dims.height / rows) >= 1 &&
    status.kind !== "busy";

  const onSplit = useCallback(async () => {
    if (!file || !dims) return;
    setStatus({ kind: "busy", progress: null });
    try {
      const { blob, filename, fallbackReason } = await runSplit(file, { rows, cols }, (done, total) =>
        setStatus({ kind: "busy", progress: { done, total } }),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ kind: "done", filename, fallbackReason });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      const friendly = /decode/i.test(msg) ? `Could not decode image: ${msg}` : msg;
      setStatus({ kind: "error", message: friendly });
    }
  }, [file, dims, rows, cols]);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) void acceptFile(f);
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight">GridSplit</h1>
        <p className="text-muted-foreground text-sm">
          Split an image into an <span className="font-mono">n × m</span> grid of tiles. No upload. Client-only.
        </p>
      </header>

      <Card onDragOver={onDragOver} onDrop={onDrop}>
        <CardHeader>
          <CardTitle>{file && dims ? "Split this image" : "Drop an image"}</CardTitle>
          <CardDescription>
            {file && dims
              ? "Adjust rows and columns — the preview below shows where cuts will land. Red regions are edge pixels that will be discarded."
              : "Drop, paste, or browse. PNG, JPG, WebP, or static GIF. Up to 100 MB."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!file || !dims ? (
            <Dropzone onFile={acceptFile} />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground truncate font-mono text-xs">
                  {file.name} — {dims.width} × {dims.height}
                </p>
                <Button variant="ghost" size="sm" onClick={reset} type="button">
                  <XIcon data-icon="inline-start" />
                  Change
                </Button>
              </div>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <TilePreview
                  file={file}
                  dims={dims}
                  rows={rows}
                  cols={cols}
                  onCommit={(r, c) => {
                    setRows(r);
                    setCols(c);
                  }}
                />
                <GridControls
                  rows={rows}
                  cols={cols}
                  dims={dims}
                  onRowsChange={setRows}
                  onColsChange={setCols}
                  canSplit={canSplit}
                  onSplit={onSplit}
                  busy={status.kind === "busy"}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {status.kind === "busy" && status.progress && (
        <Alert>
          <AlertTitle>Splitting…</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              Tile {status.progress.done} / {status.progress.total}
            </span>
            <Progress value={(status.progress.done / Math.max(1, status.progress.total)) * 100} />
          </AlertDescription>
        </Alert>
      )}
      {status.kind === "done" && (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>
            Downloaded <span className="font-mono">{status.filename}</span>
            {status.fallbackReason ? ` — ${status.fallbackReason}` : null}
          </AlertDescription>
        </Alert>
      )}
      {status.kind === "error" && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}

      <footer className="text-muted-foreground text-xs">
        <p>
          Supported: PNG, JPG, WebP, static GIF. Animated GIFs use first frame only. Edge pixels that
          don&apos;t fit the grid are discarded. Max {MAX_DIM} × {MAX_DIM} pixels.
        </p>
        <p>No server, client-only. Your image never leaves this tab.</p>
      </footer>
      <Analytics />
    </main>
  );
}
