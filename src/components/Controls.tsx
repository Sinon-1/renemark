import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { WatermarkSettings } from "@/lib/watermark";

interface Props {
  settings: WatermarkSettings;
  hasMark: boolean;
  onChange: (patch: Partial<WatermarkSettings>) => void;
  onAnchor: (col: number, row: number) => void;
  onMarkFile: (file: File) => void;
  bgBusy: boolean;
  onRemoveBg: () => void;
  onRemoveSolid: () => void;
}

function Field({ id, label, value, min, max, onValue }: {
  id: string; label: string; value: number; min: number; max: number; onValue: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm text-muted-foreground">{Math.round(value)}{id === "rotation" ? "°" : "%"}</span>
      </div>
      <Slider id={id} min={min} max={max} step={1} value={[value]} onValueChange={([v]) => onValue(v)} />
    </div>
  );
}

const ROWS = ["Top", "Middle", "Bottom"];
const COLS = ["left", "centre", "right"];

export function Controls({ settings, hasMark, onChange, onAnchor, onMarkFile, bgBusy, onRemoveBg, onRemoveSolid }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-5">
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/*"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onMarkFile(f); e.target.value = ""; }}
        />
        <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" /> {hasMark ? "Change watermark image" : "Choose watermark image"}
        </Button>
        {hasMark && (
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

      <Field id="scale" label="Size" value={settings.scale * 100} min={3} max={100} onValue={(v) => onChange({ scale: v / 100 })} />
      <Field id="opacity" label="Opacity" value={settings.opacity * 100} min={5} max={100} onValue={(v) => onChange({ opacity: v / 100 })} />
      <Field id="rotation" label="Rotation" value={settings.rotation} min={-180} max={180} onValue={(v) => onChange({ rotation: v })} />

      <div className="space-y-2">
        <Label>Position</Label>
        <div className="grid w-fit grid-cols-3 gap-1">
          {ROWS.flatMap((r, ri) =>
            COLS.map((c, ci) => (
              <Button
                key={`${ri}${ci}`}
                variant="outline"
                size="icon"
                className="h-9 w-9"
                aria-label={`${r} ${c}`}
                disabled={!hasMark}
                onClick={() => onAnchor(ci, ri)}
              >
                •
              </Button>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">Or drag the watermark on the preview.</p>
      </div>
    </div>
  );
}
