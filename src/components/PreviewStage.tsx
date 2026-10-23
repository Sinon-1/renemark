import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hitTest, makePreviewSource, renderPreview, type Layer, type PhotoItem } from "@/lib/watermark";
import { cn } from "@/lib/utils";

interface Props {
  photo: PhotoItem | null;
  layers: Layer[];
  selectedId: string | null;
  hint?: string;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onFiles: (files: File[]) => void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function PreviewStage({
  photo, layers, selectedId, hint = "Tap a watermark to select it, then drag to move it.", onSelect, onMove, onFiles,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // The preview works on a smaller copy of the photo: much less to redraw on every drag frame.
  const source = useMemo(() => {
    if (!photo) return null;
    const phone = window.matchMedia?.("(pointer: coarse)").matches;
    return makePreviewSource(photo.img, phone ? 900 : 1400);
  }, [photo?.img]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw at most once per screen frame, however many state changes arrive.
  useEffect(() => {
    if (!photo || !source) return;
    const id = requestAnimationFrame(() => {
      if (canvasRef.current)
        renderPreview(canvasRef.current, source, photo.img.naturalWidth, photo.img.naturalHeight, layers, selectedId);
    });
    return () => cancelAnimationFrame(id);
  }, [photo, source, layers, selectedId]);

  /* ---- pick and drag a watermark ---- */
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const pending = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef(0);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const frac = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!photo) return;
    const W = photo.img.naturalWidth, H = photo.img.naturalHeight;
    const { fx, fy } = frac(e);
    const hit = hitTest(layers, fx * W, fy * H, W, H);
    if (!hit) return;
    onSelect(hit.id);
    drag.current = { id: hit.id, dx: hit.x - fx, dy: hit.y - fy }; // keep the grab point, so it does not jump
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const { fx, fy } = frac(e);
    pending.current = { x: clamp01(fx + d.dx), y: clamp01(fy + d.dy) };
    if (frame.current) return; // one update per frame is plenty
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const p = pending.current, cur = drag.current;
      if (p && cur) onMoveRef.current(cur.id, p.x, p.y);
    });
  };

  const up = () => { drag.current = null; pending.current = null; };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div
      className={cn(
        "flex min-h-[320px] items-center justify-center rounded-2xl bg-background p-3 neu-in transition-shadow sm:p-5",
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
            aria-label="Preview. Select a watermark and drag it to move it."
            className="max-h-[65vh] max-w-full cursor-grab touch-none select-none rounded-xl bg-white neu-out-sm active:cursor-grabbing"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
          <p className="mt-4 text-center text-sm text-muted-foreground">{hint}</p>
        </div>
      ) : (
        <div className="max-w-xs text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-background text-primary neu-out">
            <ImagePlus className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold">Drop photos here</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Add one photo or a whole batch, then add text or image watermarks.
          </p>
          <Button onClick={() => inputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" /> Choose photos
          </Button>
        </div>
      )}
    </div>
  );
}
