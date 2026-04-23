import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ImageIcon } from "lucide-react";
import { planTiles, SplitError } from "@/split";
import { cn } from "@/lib/utils";

type Props = {
  file: File | null;
  dims: { width: number; height: number } | null;
  rows: number;
  cols: number;
  onCommit?: (rows: number, cols: number) => void;
};

// Too close to the top or left edge and `round(1/rel)` explodes toward 50.
// Treat the first 2.5% of each dimension as the "no hover grid" gutter.
const EDGE_GUTTER = 0.025;

function deriveFromMouse(relX: number, relY: number): { rows: number; cols: number } | null {
  if (relX <= EDGE_GUTTER || relY <= EDGE_GUTTER || relX >= 1 || relY >= 1) return null;
  const cols = Math.max(1, Math.min(50, Math.round(1 / relX)));
  const rows = Math.max(1, Math.min(50, Math.round(1 / relY)));
  return { rows, cols };
}

export function TilePreview({ file, dims, rows, cols, onCommit }: Props) {
  const [objectURL, setObjectURL] = useState<string | null>(null);
  const [hoverGrid, setHoverGrid] = useState<{ rows: number; cols: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectURL(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectURL(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const effectiveRows = hoverGrid?.rows ?? rows;
  const effectiveCols = hoverGrid?.cols ?? cols;

  const layout = useMemo(() => {
    if (!dims) return null;
    try {
      const { tileW, tileH } = planTiles(dims.width, dims.height, {
        rows: effectiveRows,
        cols: effectiveCols,
      });
      const gridW = effectiveCols * tileW;
      const gridH = effectiveRows * tileH;
      return {
        tileW,
        tileH,
        gridWPct: (gridW / dims.width) * 100,
        gridHPct: (gridH / dims.height) * 100,
      };
    } catch (err) {
      if (err instanceof SplitError) return null;
      throw err;
    }
  }, [dims, effectiveRows, effectiveCols]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;
      const next = deriveFromMouse(relX, relY);
      if (!next) {
        if (hoverGrid !== null) setHoverGrid(null);
        return;
      }
      if (hoverGrid?.rows !== next.rows || hoverGrid?.cols !== next.cols) {
        setHoverGrid(next);
      }
    },
    [hoverGrid],
  );

  const onMouseLeave = useCallback(() => setHoverGrid(null), []);

  const onClick = useCallback(() => {
    if (hoverGrid && onCommit) {
      onCommit(hoverGrid.rows, hoverGrid.cols);
    }
  }, [hoverGrid, onCommit]);

  if (!file || !dims || !objectURL) {
    return (
      <Empty className="h-full min-h-64 border border-dashed">
        <EmptyHeader>
          <ImageIcon className="text-muted-foreground size-10" />
          <EmptyTitle>No image yet</EmptyTitle>
          <EmptyDescription>
            Once you pick an image, a live preview of the split grid will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const interactive = Boolean(onCommit);
  const hoverChangesCommitted =
    hoverGrid && (hoverGrid.rows !== rows || hoverGrid.cols !== cols);

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted/40 flex items-center justify-center p-2">
        <div
          className={cn(
            "relative inline-block max-w-full",
            interactive && "cursor-pointer",
          )}
          onMouseMove={interactive ? onMouseMove : undefined}
          onMouseLeave={interactive ? onMouseLeave : undefined}
          onClick={interactive ? onClick : undefined}
        >
          <img
            src={objectURL}
            alt="source"
            className="block max-h-[60vh] w-auto max-w-full select-none"
            draggable={false}
          />
          {layout && (
            <div
              className="pointer-events-none absolute top-0 left-0 grid"
              style={{
                width: `${layout.gridWPct}%`,
                height: `${layout.gridHPct}%`,
                gridTemplateColumns: `repeat(${effectiveCols}, 1fr)`,
                gridTemplateRows: `repeat(${effectiveRows}, 1fr)`,
              }}
            >
              {Array.from({ length: effectiveRows * effectiveCols }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "border transition-colors",
                    hoverGrid
                      ? "border-primary bg-primary/5"
                      : "border-primary/70",
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {layout && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="font-mono">
            {effectiveRows} × {effectiveCols} · tile {layout.tileW} × {layout.tileH}
          </span>
          {interactive && hoverChangesCommitted && (
            <span className="text-primary font-mono">
              click to set {hoverGrid.rows} × {hoverGrid.cols}
            </span>
          )}
          {interactive && !hoverGrid && (
            <span className="font-mono">hover to preview · click to set</span>
          )}
        </div>
      )}
    </div>
  );
}
