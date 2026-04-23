import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { UploadCloudIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onFile: (f: File) => void;
};

export function Dropzone({ onFile }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-3 border border-dashed p-8 text-center transition-colors",
        dragOver ? "bg-accent border-primary" : "bg-card border-border",
      )}
    >
      <UploadCloudIcon className="text-muted-foreground size-10" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">Drop an image, paste from clipboard, or browse</p>
        <p className="text-muted-foreground text-xs">PNG / JPG / WebP / static GIF</p>
      </div>
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        Choose file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
