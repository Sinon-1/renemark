import { useRef } from "react";
import { Bold, Copy, Image as ImageIcon, ImagePlus, Italic, Trash2, Type, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { FONTS, loadImage, type Layer, type LayerPatch } from "@/lib/watermark";
import { cn } from "@/lib/utils";

interface Props {
  layers: Layer[];
  selected: Layer | null;
  onSelect: (id: string) => void;
  onAddText: () => void;
  onAddImage: (file: File) => void;
  onDelete: (id: string) => void;
  onChange: (id: string, patch: LayerPatch) => void;
  onAnchor: (id: string, col: number, row: number) => void;
  bgBusy: boolean;
  onRemoveBg: () => void;
  onRemoveSolid: () => void;
  canApplyAll: boolean;
  onApplyAll: () => void;
}

function Field({ id, label, value, min, max, unit = "%", onValue }: {
  id: string; label: string; value: number; min: number; max: number; unit?: string; onValue: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm text-muted-foreground">{Math.round(value)}{unit}</span>
      </div>
      <Slider id={id} min={min} max={max} step={1} value={[value]} onValueChange={([v]) => onValue(v)} />
    </div>
  );
}

function ColorField({ id, label, value, onValue }: { id: string; label: string; value: string; onValue: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id} type="color" value={value} onChange={(e) => onValue(e.target.value)}
        className="h-9 w-14 cursor-pointer rounded-xl bg-background p-1 neu-in-sm"
      />
    </div>
  );
}

const ROWS = ["Top", "Middle", "Bottom"];
const COLS = ["left", "centre", "right"];

const nameOf = (l: Layer, i: number) =>
  l.kind === "text" ? (l.text.trim() ? `“${l.text.trim().slice(0, 18)}”` : "Empty text") : l.file?.name ?? `Image ${i + 1}`;

export function Controls({
  layers, selected, onSelect, onAddText, onAddImage, onDelete, onChange, onAnchor,
  bgBusy, onRemoveBg, onRemoveSolid, canApplyAll, onApplyAll,
}: Props) {
  const addRef = useRef<HTMLInputElement>(null);
  const swapRef = useRef<HTMLInputElement>(null);
  const change = (patch: LayerPatch) => selected && onChange(selected.id, patch);

  return (
    <div className="space-y-5">
      {/* ---- add and pick watermarks ---- */}
      <div className="space-y-3">
        <input
          ref={addRef} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddImage(f); e.target.value = ""; }}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onAddText}><Type className="h-4 w-4" /> Add text</Button>
          <Button variant="outline" onClick={() => addRef.current?.click()}><ImagePlus className="h-4 w-4" /> Add image</Button>
        </div>

        {layers.length > 0 ? (
          <ul className="space-y-2" aria-label="Watermarks on this photo">
            {layers.map((l, i) => (
              <li key={l.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(l.id)}
                  aria-current={l.id === selected?.id}
                  className={cn(
                    "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-background px-3 text-left text-sm",
                    l.id === selected?.id ? "neu-in-sm ring-2 ring-primary" : "neu-out-sm"
                  )}
                >
                  {l.kind === "text" ? <Type className="h-4 w-4 shrink-0" /> : <ImageIcon className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{nameOf(l, i)}</span>
                </button>
                <Button variant="ghost" size="icon" aria-label="Delete this watermark" onClick={() => onDelete(l.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No watermark yet. Add some text or an image. You can add as many as you like.</p>
        )}

        {canApplyAll && (
          <Button variant="outline" size="sm" className="w-full" onClick={onApplyAll}>
            <Copy className="h-4 w-4" /> Copy these watermarks to all photos
          </Button>
        )}
      </div>

      {/* ---- edit the selected watermark ---- */}
      {selected && (
        <div className="space-y-5 border-t pt-5">
          {selected.kind === "text" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="wm-text">Text</Label>
                <Input id="wm-text" value={selected.text} maxLength={120} onChange={(e) => change({ text: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wm-font">Font</Label>
                <select
                  id="wm-font" value={selected.font} onChange={(e) => change({ font: e.target.value })}
                  className="h-10 w-full rounded-xl bg-background px-3 text-sm neu-in-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {FONTS.map((f) => <option key={f.label} value={f.css}>{f.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1"><ColorField id="wm-color" label="Text colour" value={selected.color} onValue={(color) => change({ color })} /></div>
                <Button variant={selected.bold ? "default" : "outline"} size="icon" aria-label="Bold" aria-pressed={selected.bold} onClick={() => change({ bold: !selected.bold })}>
                  <Bold className="h-4 w-4" />
                </Button>
                <Button variant={selected.italic ? "default" : "outline"} size="icon" aria-label="Italic" aria-pressed={selected.italic} onClick={() => change({ italic: !selected.italic })}>
                  <Italic className="h-4 w-4" />
                </Button>
              </div>
              <Field id="wm-size" label="Size" value={selected.size * 100} min={2} max={30} onValue={(v) => change({ size: v / 100 })} />
            </>
          ) : (
            <>
              <div>
                <input
                  ref={swapRef} type="file" accept="image/*" hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; e.target.value = "";
                    if (f) change({ img: await loadImage(f), file: f });
                  }}
                />
                <Button variant="outline" className="w-full" onClick={() => swapRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {selected.img ? "Change image" : "Choose image"}
                </Button>
                {selected.file && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" disabled={bgBusy} onClick={onRemoveBg}>
                      {bgBusy ? "Working…" : "Remove background"}
                    </Button>
                    <Button variant="outline" size="sm" disabled={bgBusy} onClick={onRemoveSolid}>
                      Remove solid colour
                    </Button>
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  A PNG with a transparent background works best. If yours has a background, remove it above.
                </p>
              </div>
              <Field id="wm-scale" label="Size" value={selected.scale * 100} min={3} max={100} onValue={(v) => change({ scale: v / 100 })} />
            </>
          )}

          <Field id="wm-opacity" label="Opacity" value={selected.opacity * 100} min={5} max={100} onValue={(v) => change({ opacity: v / 100 })} />
          <Field id="wm-rotation" label="Rotation" unit="°" value={selected.rotation} min={-180} max={180} onValue={(v) => change({ rotation: v })} />

          {/* ---- shadow / fade ---- */}
          <div className="space-y-4 rounded-xl p-3 neu-in-sm">
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
              Shadow
              <input
                type="checkbox" checked={selected.shadow} onChange={(e) => change({ shadow: e.target.checked })}
                className="h-5 w-5 cursor-pointer accent-[hsl(var(--primary))]"
              />
            </label>
            {selected.shadow && (
              <>
                <ColorField id="wm-shadow-color" label="Shadow colour" value={selected.shadowColor} onValue={(shadowColor) => change({ shadowColor })} />
                <Field id="wm-shadow-blur" label="Fade (softness)" value={selected.shadowBlur} min={0} max={100} onValue={(v) => change({ shadowBlur: v })} />
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Position</Label>
            <div className="grid w-fit grid-cols-3 gap-1">
              {ROWS.flatMap((r, ri) =>
                COLS.map((c, ci) => (
                  <Button
                    key={`${ri}${ci}`} variant="outline" size="icon" className="h-9 w-9"
                    aria-label={`${r} ${c}`} onClick={() => onAnchor(selected.id, ci, ri)}
                  >
                    •
                  </Button>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">Or drag the watermark on the preview.</p>
          </div>
        </div>
      )}
    </div>
  );
}
