import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { ScissorsIcon } from "lucide-react";
import { planTiles, SplitError } from "@/split";

type Props = {
  rows: number;
  cols: number;
  dims: { width: number; height: number } | null;
  onRowsChange: (v: number) => void;
  onColsChange: (v: number) => void;
  canSplit: boolean;
  busy: boolean;
  onSplit: () => void;
};

function validate(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 50) return "Integer 1–50";
  return null;
}

export function GridControls({
  rows,
  cols,
  dims,
  onRowsChange,
  onColsChange,
  canSplit,
  busy,
  onSplit,
}: Props) {
  const rowsErr = validate(rows);
  const colsErr = validate(cols);

  let tileInfo: string | null = null;
  let tooSmall = false;
  if (dims && !rowsErr && !colsErr) {
    try {
      const { tileW, tileH } = planTiles(dims.width, dims.height, { rows, cols });
      tileInfo = `${rows * cols} tiles · ${tileW} × ${tileH} px each`;
    } catch (err) {
      if (err instanceof SplitError && err.code === "IMAGE_TOO_SMALL") {
        tooSmall = true;
      }
    }
  }

  return (
    <FieldGroup>
      <Field data-invalid={rowsErr ? true : undefined}>
        <FieldLabel htmlFor="rows">Rows (n)</FieldLabel>
        <div className="flex items-center gap-3">
          <Input
            id="rows"
            type="number"
            min={1}
            max={50}
            step={1}
            value={rows}
            onChange={(e) => onRowsChange(Number(e.target.value))}
            aria-invalid={rowsErr ? true : undefined}
            className="w-20"
          />
          <Slider
            value={[rows]}
            min={1}
            max={20}
            step={1}
            onValueChange={(v) => onRowsChange(v[0] ?? rows)}
            className="flex-1"
          />
        </div>
        {rowsErr && <FieldError>{rowsErr}</FieldError>}
      </Field>

      <Field data-invalid={colsErr ? true : undefined}>
        <FieldLabel htmlFor="cols">Columns (m)</FieldLabel>
        <div className="flex items-center gap-3">
          <Input
            id="cols"
            type="number"
            min={1}
            max={50}
            step={1}
            value={cols}
            onChange={(e) => onColsChange(Number(e.target.value))}
            aria-invalid={colsErr ? true : undefined}
            className="w-20"
          />
          <Slider
            value={[cols]}
            min={1}
            max={20}
            step={1}
            onValueChange={(v) => onColsChange(v[0] ?? cols)}
            className="flex-1"
          />
        </div>
        {colsErr && <FieldError>{colsErr}</FieldError>}
      </Field>

      {tileInfo && (
        <Field>
          <FieldDescription>{tileInfo}</FieldDescription>
        </Field>
      )}
      {tooSmall && dims && (
        <Field data-invalid>
          <FieldError>
            Image too small for this grid (need ≥ {cols} × {rows} pixels, got {dims.width} ×{" "}
            {dims.height}).
          </FieldError>
        </Field>
      )}

      <Button onClick={onSplit} disabled={!canSplit} className="w-full" size="lg">
        <ScissorsIcon data-icon="inline-start" />
        {busy ? "Splitting…" : "Split"}
      </Button>
    </FieldGroup>
  );
}
