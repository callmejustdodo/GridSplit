import { useEffect, useMemo, useState } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ImageIcon } from "lucide-react";
import { planTiles, SplitError } from "@/split";
import { cn } from "@/lib/utils";

type Props = {
  file: File | null;
  dims: { width: number; height: number } | null;
  rows: number;
  cols: number;
};

export function TilePreview({ file, dims, rows, cols }: Props) {
  const [objectURL, setObjectURL] = useState<string | null>(null);
  const [hoverTile, setHoverTile] = useState<{ r: number; c: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectURL(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectURL(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const layout = useMemo(() => {
    if (!dims) return null;
    try {
      const { tileW, tileH } = planTiles(dims.width, dims.height, { rows, cols });
      const gridW = cols * tileW;
      const gridH = rows * tileH;
      return {
        tileW,
        tileH,
        gridWPct: (gridW / dims.width) * 100,
        gridHPct: (gridH / dims.height) * 100,
        cropRightPx: dims.width - gridW,
        cropBottomPx: dims.height - gridH,
      };
    } catch (err) {
      if (err instanceof SplitError) return null;
      throw err;
    }
  }, [dims, rows, cols]);

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

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted/40 flex items-center justify-center p-2">
        <div className="relative inline-block max-w-full">
          <img
            src={objectURL}
            alt="source"
            className="block max-h-[60vh] w-auto max-w-full select-none"
            draggable={false}
          />
          {layout && (
            <>
              {/* Grid cells — sized to the usable region; rest is cropped */}
              <div
                className="absolute top-0 left-0 grid"
                style={{
                  width: `${layout.gridWPct}%`,
                  height: `${layout.gridHPct}%`,
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  gridTemplateRows: `repeat(${rows}, 1fr)`,
                }}
              >
                {Array.from({ length: rows * cols }).map((_, i) => {
                  const r = Math.floor(i / cols);
                  const c = i % cols;
                  const active = hoverTile?.r === r && hoverTile?.c === c;
                  return (
                    <div
                      key={i}
                      onMouseEnter={() => setHoverTile({ r, c })}
                      onMouseLeave={() => setHoverTile(null)}
                      className={cn(
                        "border-primary/70 border transition-colors",
                        active ? "bg-primary/25" : "hover:bg-primary/10",
                      )}
                    />
                  );
                })}
              </div>

            </>
          )}
        </div>
      </div>

      {layout && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="font-mono">
            tile: {layout.tileW} × {layout.tileH}
          </span>
          {hoverTile && (
            <span className="font-mono">
              hover: row {hoverTile.r + 1}, col {hoverTile.c + 1}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
