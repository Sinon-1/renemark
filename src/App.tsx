import { useEffect, useRef, useState } from "react";
import { Download, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Controls } from "@/components/Controls";
import { PreviewStage } from "@/components/PreviewStage";
import { AccountPresets } from "@/components/AccountPresets";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { removeBackgroundAI, removeSolidColor } from "@/lib/background";
import { downloadAsset, type Preset } from "@/lib/presets";
import {
  DEFAULT_SETTINGS, anchorPosition, exportBatch, exportOne, loadImage, outputName, saveBlob,
  type PhotoItem, type WatermarkSettings,
} from "@/lib/watermark";
import { cn } from "@/lib/utils";

export default function App() {
  const user = useAuth();
  const { dark, toggle } = useTheme();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [mark, setMark] = useState<HTMLImageElement | null>(null);
  const [markFile, setMarkFile] = useState<File | null>(null);
  // Each photo keeps its own watermark settings, so editing one never changes the others.
  const [photoSettings, setPhotoSettings] = useState<Record<string, WatermarkSettings>>({});
  const [defaults, setDefaults] = useState<WatermarkSettings>(DEFAULT_SETTINGS); // used while no photo is added yet
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const moreRef = useRef<HTMLInputElement>(null);

  const current = photos.find((p) => p.id === currentId) ?? photos[0] ?? null;
  const settingsFor = (id: string) => photoSettings[id] ?? defaults;
  const settings = current ? settingsFor(current.id) : defaults;
  // Change settings for the photo you are editing only.
  const patch = (p: Partial<WatermarkSettings>) => {
    if (!current) return setDefaults((d) => ({ ...d, ...p }));
    const id = current.id;
    setPhotoSettings((m) => ({ ...m, [id]: { ...(m[id] ?? defaults), ...p } }));
  };

  // Free the memory of removed photos.
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line

  const addFiles = async (files: File[]) => {
    const items: PhotoItem[] = [];
    for (const f of files.filter((f) => f.type.startsWith("image/"))) {
      try {
        const img = await loadImage(f);
        items.push({ id: crypto.randomUUID(), name: f.name, type: f.type, img, url: img.src });
      } catch { setStatus(`Could not read ${f.name}.`); }
    }
    if (items.length) {
      // New photos start with the same look as the photo you are on, then are independent.
      const start = { ...settings };
      setPhotoSettings((m) => {
        const next = { ...m };
        items.forEach((i) => { next[i.id] = { ...start }; });
        return next;
      });
      setPhotos((p) => [...p, ...items]);
    }
  };

  const setMarkFromFile = async (file: File) => {
    const img = await loadImage(file);
    setMark(img);
    setMarkFile(file);
    if (current) patch(anchorPosition(2, 2, settings, current.img, img));
  };

  const applyPreset = async (p: Preset) => {
    const { id: _id, name: _n, asset_path, ...s } = p;
    patch(s); // a preset applies to the photo you are editing only
    if (asset_path) {
      try {
        const blob = await downloadAsset(asset_path);
        setMark(await loadImage(blob));
        setMarkFile(new File([blob], asset_path.split("/").pop() ?? "watermark.png", { type: blob.type }));
      }
      catch (e) { setStatus((e as Error).message); }
    }
  };

  const removeBg = async (mode: "ai" | "solid") => {
    if (!markFile) return;
    setBgBusy(true);
    setStatus(mode === "ai" ? "Removing background. The first time can take a minute…" : "Removing colour…");
    try {
      const out = mode === "ai" ? await removeBackgroundAI(markFile) : await removeSolidColor(markFile);
      setMark(await loadImage(out));
      setMarkFile(out);
      setStatus("Background removed.");
    } catch (e) { setStatus(`Could not remove the background: ${(e as Error).message}`); }
    setBgBusy(false);
  };

  const removePhoto = (id: string) => {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    setPhotos((list) => list.filter((x) => x.id !== id));
    setPhotoSettings((m) => { const { [id]: _gone, ...rest } = m; return rest; });
  };

  const downloadOne = async () => {
    if (!current) return;
    saveBlob(await exportOne(current, mark, settings), outputName(current));
  };

  const downloadAll = async () => {
    setBusy(true);
    try {
      const zip = await exportBatch(photos, mark, settingsFor, (d, t) =>
        setStatus(d < t ? `Processing ${d + 1} of ${t}…` : `Done. ${t} photo${t > 1 ? "s" : ""} saved.`)
      );
      saveBlob(zip, "renemark-batch.zip");
    } catch (e) { setStatus((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="min-h-screen pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Renemark</h1>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Switch between dark and light mode">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-3">
          <PreviewStage
            photo={current}
            mark={mark}
            settings={settings}
            onMove={(x, y) => patch({ x, y })}
            onFiles={addFiles}
          />

          {photos.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Photos in this batch">
              {photos.map((p) => (
                <div key={p.id} className="relative shrink-0">
                  <button
                    type="button"
                    aria-label={`Preview ${p.name}`}
                    aria-current={p.id === current?.id}
                    onClick={() => setCurrentId(p.id)}
                    className={cn("block h-16 w-16 overflow-hidden rounded-md border", p.id === current?.id && "ring-2 ring-primary")}
                  >
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => removePhoto(p.id)}
                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-1 text-destructive-foreground"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <input
                ref={moreRef} type="file" accept="image/*" multiple hidden
                onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
              />
              <Button variant="outline" className="h-16 w-16 shrink-0" aria-label="Add more photos" onClick={() => moreRef.current?.click()}>
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Watermark</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <Controls
                settings={settings}
                hasMark={!!mark}
                onChange={patch}
                onAnchor={(c, r) => current && patch(anchorPosition(c, r, settings, current.img, mark))}
                onMarkFile={setMarkFromFile}
                bgBusy={bgBusy}
                onRemoveBg={() => removeBg("ai")}
                onRemoveSolid={() => removeBg("solid")}
              />
              <div className="space-y-2 border-t pt-4">
                <Button className="w-full" onClick={downloadAll} disabled={!photos.length || !mark || busy}>
                  <Download className="h-4 w-4" /> Download all as ZIP
                </Button>
                <Button className="w-full" variant="outline" onClick={downloadOne} disabled={!current || !mark || busy}>
                  Download this photo
                </Button>
                <p className="min-h-5 text-sm text-muted-foreground" role="status">{status}</p>
                <p className="text-xs text-muted-foreground">Photos are processed in your browser and never uploaded.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Account and presets</CardTitle></CardHeader>
            <CardContent><AccountPresets user={user} settings={settings} markFile={markFile} onApply={applyPreset} /></CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
