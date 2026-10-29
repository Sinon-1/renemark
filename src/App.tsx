import { useEffect, useRef, useState } from "react";
import { Download, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Controls } from "@/components/Controls";
import { PreviewStage } from "@/components/PreviewStage";
import { AccountPresets } from "@/components/AccountPresets";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { removeBackgroundAI, removeSolidColor, shrinkImage } from "@/lib/background";
import { downloadAsset, type Preset } from "@/lib/presets";
import {
  DEFAULT_SETTINGS, anchorLayer, clampLayer, exportBatch, exportOne, isRenderable, loadImage,
  makePhotoAssets, newImageLayer, newTextLayer, outputName, saveBlob, saveUrl,
  type ImageLayer, type Layer, type LayerPatch, type PhotoItem, type WatermarkSettings,
} from "@/lib/watermark";
import { cn } from "@/lib/utils";

const KEY_DEFAULT = "__default"; // watermarks set up before any photo is added

export default function App() {
  const user = useAuth();
  const { dark, toggle } = useTheme();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  // Every photo has its own list of watermarks, so editing one photo never changes another.
  const [photoLayers, setPhotoLayers] = useState<Record<string, Layer[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const moreRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Finished ZIP files. They also appear as tap-to-save buttons, because phones can block a download that
  // starts by itself after a long wait.
  const [ready, setReady] = useState<{ name: string; url: string; size: number }[]>([]);
  const clearReady = () => setReady((r) => { r.forEach((x) => URL.revokeObjectURL(x.url)); return r.length ? [] : r; });

  const current = photos.find((p) => p.id === currentId) ?? photos[0] ?? null;
  const key = current?.id ?? KEY_DEFAULT;
  const layers = photoLayers[key] ?? [];
  const selected = layers.find((l) => l.id === selectedId) ?? layers[0] ?? null;
  const layersFor = (id: string) => photoLayers[id] ?? [];

  const editLayers = (forKey: string, fn: (ls: Layer[]) => Layer[]) =>
    setPhotoLayers((m) => ({ ...m, [forKey]: fn(m[forKey] ?? []) }));

  // Keep a watermark inside its photo whenever it changes.
  const fit = (l: Layer, photo?: PhotoItem | null): Layer =>
    photo ? clampLayer(l, photo.img.naturalWidth, photo.img.naturalHeight) : l;

  const updateLayer = (id: string, patch: LayerPatch, forKey = key) => {
    const photo = photos.find((p) => p.id === forKey);
    editLayers(forKey, (ls) => ls.map((l) => (l.id === id ? fit({ ...l, ...patch } as Layer, photo) : l)));
  };

  useEffect(() => { clearReady(); }, [photos, photoLayers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Free the memory of removed photos.
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line

  const addFiles = async (files: File[]) => {
    const items: PhotoItem[] = [];
    const images = files.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const bad: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const f = images[i];
      if (images.length > 1) setStatus(`Loading photo ${i + 1} of ${images.length}…`);
      try {
        const img = await loadImage(f);
        items.push({ id: crypto.randomUUID(), name: f.name, type: f.type, img, url: img.src, ...makePhotoAssets(img) });
      } catch { bad.push(f.name); }
    }
    if (files.length > images.length) bad.push(...files.filter((f) => !images.includes(f)).map((f) => f.name));
    setStatus(
      bad.length
        ? `Could not open ${bad.length} file${bad.length > 1 ? "s" : ""}: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}. ` +
          (bad.some((n) => /\.(heic|heif)$/i.test(n)) ? "HEIC photos are not supported by most browsers. Save them as JPG first." : "Use JPG, PNG or WebP photos.")
        : ""
    );
    if (items.length) {
      // New photos start with the same watermarks as the photo you are on, then are independent.
      const start = layers;
      setPhotoLayers((m) => {
        const next = { ...m };
        items.forEach((i) => { next[i.id] = start.map((l) => fit({ ...l }, i as PhotoItem)); });
        return next;
      });
      setPhotos((p) => [...p, ...items]);
    }
  };

  // A new watermark goes onto EVERY photo in the batch (same id, so it stays selected when you switch photos).
  // Each photo keeps its own copy afterwards, so you can still tweak one photo without touching the rest.
  const addToAll = (base: Layer, place?: (l: Layer, p: PhotoItem) => Layer) => {
    setPhotoLayers((m) => {
      const next = { ...m };
      if (photos.length === 0) {
        next[KEY_DEFAULT] = [...(m[KEY_DEFAULT] ?? []), base]; // no photos yet: new photos will start with it
      } else {
        photos.forEach((p) => {
          next[p.id] = [...(m[p.id] ?? []), fit(place ? place(base, p) : base, p)];
        });
      }
      return next;
    });
    setSelectedId(base.id);
  };

  const addText = () => addToAll(newTextLayer(layers.length));

  const addImage = async (file: File) => {
    try {
      const small = await shrinkImage(file); // huge logos only slow everything down
      const img = await loadImage(small);
      addToAll(newImageLayer(img, small), (b, p) => ({ ...b, ...anchorLayer(b, 2, 2, p.img) }) as Layer);
    } catch (e) { setStatus((e as Error).message); }
  };

  const deleteLayer = (id: string) => editLayers(key, (ls) => ls.filter((l) => l.id !== id));

  const anchor = (id: string, col: number, row: number) => {
    const l = layers.find((x) => x.id === id);
    if (l && current) updateLayer(id, anchorLayer(l, col, row, current.img));
  };

  // Copy this photo's watermarks onto every photo (only when you press the button).
  const applyToAll = () =>
    setPhotoLayers((m) => {
      const next = { ...m };
      photos.forEach((p) => { next[p.id] = layers.map((l) => fit({ ...l }, p)); });
      return next;
    });

  // Presets save and load one image watermark: the selected one, or the first image watermark.
  const imageLayer: ImageLayer | null =
    selected?.kind === "image" ? selected : (layers.find((l) => l.kind === "image") as ImageLayer | undefined) ?? null;
  const presetSettings: WatermarkSettings = imageLayer
    ? { scale: imageLayer.scale, opacity: imageLayer.opacity, rotation: imageLayer.rotation, x: imageLayer.x, y: imageLayer.y }
    : DEFAULT_SETTINGS;

  const applyPreset = async (p: Preset) => {
    const { id: _id, name: _n, asset_path, ...s } = p;
    const k = key;
    let target = imageLayer?.id;
    if (target) {
      updateLayer(target, s);
    } else {
      const base = { ...newImageLayer(null, null), ...s };
      target = base.id;
      editLayers(k, (ls) => [...ls, base]);
    }
    setSelectedId(target);
    if (asset_path) {
      try {
        const blob = await downloadAsset(asset_path);
        const file = new File([blob], asset_path.split("/").pop() ?? "watermark.png", { type: blob.type });
        updateLayer(target, { img: await loadImage(blob), file }, k);
      } catch (e) { setStatus((e as Error).message); }
    }
  };

  const removeBg = async (mode: "ai" | "solid") => {
    const file = imageLayer?.file;
    if (!imageLayer || !file || bgBusy) return;
    const id = imageLayer.id;
    setBgBusy(true);
    setStatus(mode === "ai" ? "Getting ready. The first time can take a minute…" : "Removing colour…");
    try {
      const out = mode === "ai" ? await removeBackgroundAI(file, setStatus) : await removeSolidColor(file);
      const patch = { img: await loadImage(out), file: out as File };
      setPhotoLayers((m) => {
        const next: Record<string, Layer[]> = {};
        for (const k of Object.keys(m)) next[k] = m[k].map((l) => (l.id === id && l.kind === "image" ? { ...l, ...patch } : l));
        return next;
      });
      setStatus("Background removed.");
    } catch (e) { setStatus((e as Error).message); }
    setBgBusy(false);
  };

  const removePhoto = (id: string) => {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    setPhotos((list) => list.filter((x) => x.id !== id));
    setPhotoLayers((m) => { const { [id]: _gone, ...rest } = m; return rest; });
  };

  const canOne = !!current && layers.some(isRenderable);
  const canAll = photos.some((p) => layersFor(p.id).some(isRenderable));

  const downloadOne = async () => {
    if (!current) return;
    setBusy(true);
    try {
      saveBlob(await exportOne(current, layers), outputName(current));
      setStatus("");
    } catch { setStatus("Could not save this photo. Try again, or try a smaller photo."); }
    setBusy(false);
  };

  const downloadAll = async () => {
    clearReady();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setBusy(true);
    setProgress({ done: 0, total: photos.length });
    try {
      const phone = window.matchMedia?.("(pointer: coarse)").matches;
      const res = await exportBatch(
        photos, layersFor,
        (d, t) => {
          setProgress({ done: d, total: t });
          setStatus(d < t ? `Processing ${d + 1} of ${t}…` : "Packing the ZIP…");
        },
        { signal: ctl.signal, maxPartBytes: (phone ? 120 : 400) * 1024 * 1024 }
      );
      if (res.cancelled) {
        setStatus("Cancelled.");
      } else if (res.parts.length === 0) {
        setStatus("None of the photos could be processed. Try fewer or smaller photos.");
      } else {
        const items = res.parts.map((p) => ({ name: p.name, url: URL.createObjectURL(p.blob), size: p.blob.size }));
        setReady(items);
        if (items.length === 1) saveUrl(items[0].url, items[0].name); // starts the download; the button below is the backup
        const unmarked = photos.filter((p) => !layersFor(p.id).some(isRenderable)).length;
        setStatus(
          [
            `${res.saved} of ${photos.length} photo${photos.length > 1 ? "s" : ""} ready.`,
            res.failed.length ? `Could not process: ${res.failed.slice(0, 3).join(", ")}${res.failed.length > 3 ? "…" : ""}.` : "",
            unmarked ? `${unmarked} had no watermark.` : "",
            res.resized ? `${res.resized} very large photo${res.resized > 1 ? "s were" : " was"} made slightly smaller so phones can save ${res.resized > 1 ? "them" : "it"}.` : "",
            items.length > 1 ? `Big batch: saved as ${items.length} ZIP files. Tap each one below.` : "If nothing downloaded, tap the button below.",
          ].filter(Boolean).join(" ")
        );
      }
    } catch (e) {
      setStatus(`Could not finish: ${(e as Error).message}`);
    }
    abortRef.current = null;
    setProgress(null);
    setBusy(false);
  };

  return (
    <div className="min-h-screen max-w-full overflow-x-clip pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Renemark</h1>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Switch between dark and light mode">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-3">
          <PreviewStage
            photo={current}
            layers={layers}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onMove={(id, x, y) => updateLayer(id, { x, y })}
            onFiles={addFiles}
          />

          {photos.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{photos.length} photo{photos.length > 1 ? "s" : ""}. Swipe sideways to see more.</p>
              {/* Side-scrolling row. The row scrolls by itself; the page never gets wider. */}
              <div className="flex max-w-full items-center gap-3 overflow-x-auto overscroll-x-contain pb-2 pr-2 pt-2" aria-label="Photos in this batch">
                {photos.map((p) => (
                  <div key={p.id} className="relative shrink-0">
                    <button
                      type="button"
                      aria-label={`Preview ${p.name}`}
                      aria-current={p.id === current?.id}
                      onClick={() => setCurrentId(p.id)}
                      className={cn("block h-16 w-16 overflow-hidden rounded-md border", p.id === current?.id && "ring-2 ring-primary")}
                    >
                      <img src={p.thumb ?? p.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => removePhoto(p.id)}
                      className="absolute -right-1 -top-1 rounded-full bg-destructive p-1.5 text-destructive-foreground"
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
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-4">
          <Card>
            <CardHeader><CardTitle>Watermarks</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <Controls
                layers={layers}
                selected={selected}
                onSelect={setSelectedId}
                onAddText={addText}
                onAddImage={addImage}
                onDelete={deleteLayer}
                onChange={(id, patch) => updateLayer(id, patch)}
                onAnchor={anchor}
                bgBusy={bgBusy}
                onRemoveBg={() => removeBg("ai")}
                onRemoveSolid={() => removeBg("solid")}
                canApplyAll={photos.length > 1 && layers.length > 0}
                onApplyAll={applyToAll}
              />
              <div className="space-y-2 border-t pt-4">
                <Button className="w-full" onClick={downloadAll} disabled={!canAll || busy}>
                  <Download className="h-4 w-4" /> {busy && progress ? "Working…" : "Download all as ZIP"}
                </Button>
                <Button className="w-full" variant="outline" onClick={downloadOne} disabled={!canOne || busy}>
                  Download this photo
                </Button>
                {progress && (
                  <div className="space-y-2">
                    <div
                      role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}
                      className="h-2.5 w-full overflow-hidden rounded-full bg-background neu-in-sm"
                    >
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => abortRef.current?.abort()}>Cancel</Button>
                  </div>
                )}
                {ready.map((r) => (
                  <Button key={r.url} asChild variant="outline" className="w-full">
                    <a href={r.url} download={r.name}>
                      <Download className="h-4 w-4" /> Save {r.name} ({(r.size / 1048576).toFixed(r.size > 10485760 ? 0 : 1)} MB)
                    </a>
                  </Button>
                ))}
                <p className="min-h-5 text-sm text-muted-foreground" role="status" aria-live="polite">{status}</p>
                <p className="text-xs text-muted-foreground">Photos are processed in your browser and never uploaded.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Account and presets</CardTitle></CardHeader>
            <CardContent>
              <AccountPresets user={user} settings={presetSettings} markFile={imageLayer?.file ?? null} onApply={applyPreset} />
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
