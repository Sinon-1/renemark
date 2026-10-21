import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderWatermark, type PhotoItem, type WatermarkSettings } from "@/lib/watermark";
import { cn } from "@/lib/utils";

interface Props {
  photo: PhotoItem | null;
  mark: HTMLImageElement | null;
  settings: WatermarkSettings;
  hint?: string;
  onMove: (x: number, y: number) => void;
  onFiles: (files: File[]) => void;
}

export function PreviewStage({ photo, mark, settings, hint, onMove, onFiles }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const dragging = useRef(false);

  // Live preview: redraw whenever the photo, watermark or any setting changes.
  useEffect(() => {
    if (photo && canvasRef.current) renderWatermark(canvasRef.current, photo.img, mark, settings);
  }, [photo, mark, settings]);

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMove(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    );
  };

  return (
    <div
      className={cn(
        "flex min-h-[320px] items-center justify-center rounded-2xl bg-background p-5 neu-in transition-shadow",
        over && "ring-2 ring-primary"
      )}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
      {photo ? (
        <div className="flex max-w-full flex-col items-center">
          <canvas
            ref={canvasRef}
            aria-label="Preview. Drag to move the watermark."
            className="max-h-[65vh] max-w-full cursor-grab touch-none rounded-xl bg-white neu-out-sm active:cursor-grabbing"
            onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
            onPointerMove={(e) => dragging.current && move(e)}
            onPointerUp={() => (dragging.current = false)}
          />
          {hint && <p className="mt-4 text-center text-sm text-muted-foreground">{hint}</p>}
        </div>
      ) : (
        <div className="max-w-xs text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-background text-primary neu-out">
            <ImagePlus className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold">Drop photos here</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Add one photo or a whole batch, then choose your watermark image.
          </p>
          <Button onClick={() => inputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" /> Choose photos
          </Button>
        </div>
      )}
    </div>
  );
}
