import JSZip from "jszip";

/** What a saved preset stores: the look of one image watermark. Fractions (0-1) of the photo, so it fits any photo size. */
export interface WatermarkSettings {
  scale: number;    // watermark width as a fraction of photo width
  opacity: number;  // 0-1
  rotation: number; // degrees
  x: number;        // centre of the watermark, 0-1
  y: number;
}

export const DEFAULT_SETTINGS: WatermarkSettings = { scale: 0.25, opacity: 0.6, rotation: 0, x: 0.8, y: 0.88 };

/* ---------- Watermark layers: a photo can have as many as you like ---------- */

interface LayerBase {
  id: string;
  opacity: number;      // 0-1 (lower = more faded)
  rotation: number;     // degrees
  x: number;            // centre, 0-1 of photo width
  y: number;            // centre, 0-1 of photo height
  shadow: boolean;
  shadowColor: string;  // #rrggbb
  shadowBlur: number;   // 0-100
}

export interface ImageLayer extends LayerBase {
  kind: "image";
  scale: number;        // width as a fraction of photo width
  img: HTMLImageElement | null;
  file: File | null;
}

export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  font: string;         // CSS font-family stack
  size: number;         // font size as a fraction of photo width
  color: string;        // #rrggbb
  bold: boolean;
  italic: boolean;
}

export type Layer = ImageLayer | TextLayer;
export type LayerPatch = Partial<Omit<ImageLayer, "kind" | "id">> & Partial<Omit<TextLayer, "kind" | "id">>;

export const FONTS = [
  { label: "Arial", css: "Arial, Helvetica, sans-serif" },
  { label: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet", css: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: "Georgia", css: 'Georgia, "Times New Roman", serif' },
  { label: "Times New Roman", css: '"Times New Roman", Times, serif' },
  { label: "Courier New", css: '"Courier New", Courier, monospace' },
  { label: "Impact", css: 'Impact, "Arial Black", sans-serif' },
  { label: "Script", css: '"Brush Script MT", "Segoe Script", cursive' },
];

export function newTextLayer(count: number): TextLayer {
  return {
    id: crypto.randomUUID(), kind: "text", text: "Your name", font: FONTS[0].css, size: 0.06,
    color: "#ffffff", bold: true, italic: false, opacity: 0.85, rotation: 0,
    x: 0.5, y: Math.min(0.85, 0.15 + (count % 6) * 0.14), // spread new ones out so they don't pile up
    shadow: true, shadowColor: "#000000", shadowBlur: 45,
  };
}

export function newImageLayer(img: HTMLImageElement | null, file: File | null): ImageLayer {
  return {
    id: crypto.randomUUID(), kind: "image", img, file, ...DEFAULT_SETTINGS,
    shadow: false, shadowColor: "#000000", shadowBlur: 40,
  };
}

export const isRenderable = (l: Layer) => (l.kind === "image" ? !!l.img : l.text.trim().length > 0);

/* ---------- Geometry (all in photo pixels) ---------- */

let measureCtx: CanvasRenderingContext2D | null = null;
const measurer = () => (measureCtx ??= document.createElement("canvas").getContext("2d")!);

const fontString = (l: TextLayer, W: number) =>
  `${l.italic ? "italic " : ""}${l.bold ? "bold " : ""}${Math.max(1, l.size * W)}px ${l.font}`;

/** Size of a layer before rotation. */
export function layerBox(l: Layer, W: number): { w: number; h: number } {
  if (l.kind === "image") {
    if (!l.img) return { w: 0, h: 0 };
    const w = l.scale * W;
    return { w, h: (w * l.img.naturalHeight) / l.img.naturalWidth };
  }
  const ctx = measurer();
  ctx.font = fontString(l, W);
  return { w: ctx.measureText(l.text || " ").width, h: l.size * W * 1.2 };
}

function halfExtents(w: number, h: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return { hw: (w * c + h * s) / 2, hh: (w * s + h * c) / 2 };
}

/** Keep a layer inside the photo when it fits (centre it when it is bigger than the photo). */
export function clampLayer<T extends Layer>(l: T, W: number, H: number): T {
  const { w, h } = layerBox(l, W);
  const { hw, hh } = halfExtents(w, h, l.rotation);
  const fit = (v: number, half: number, total: number) =>
    2 * half >= total ? total / 2 : Math.min(total - half, Math.max(half, v));
  return { ...l, x: fit(l.x * W, hw, W) / W, y: fit(l.y * H, hh, H) / H };
}

/** Snap a layer to a corner, edge or the centre. col/row are 0, 1 or 2. */
export function anchorLayer(l: Layer, col: number, row: number, photo: HTMLImageElement): { x: number; y: number } {
  const W = photo.naturalWidth, H = photo.naturalHeight;
  const { w, h } = layerBox(l, W);
  const { hw, hh } = halfExtents(w, h, l.rotation);
  const mx = 0.04 * W, my = 0.04 * H;
  const x = col === 0 ? mx + hw : col === 2 ? W - mx - hw : W / 2;
  const y = row === 0 ? my + hh : row === 2 ? H - my - hh : H / 2;
  return { x: x / W, y: y / H };
}

/** Which layer is under this point? The top one wins. */
export function hitTest(layers: Layer[], px: number, py: number, W: number, H: number): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!isRenderable(l)) continue;
    const { w, h } = layerBox(l, W);
    const pad = W * 0.02; // a little extra so small watermarks are easy to grab
    const r = (l.rotation * Math.PI) / 180;
    const dx = px - l.x * W, dy = py - l.y * H;
    const rx = dx * Math.cos(r) + dy * Math.sin(r);
    const ry = -dx * Math.sin(r) + dy * Math.cos(r);
    if (Math.abs(rx) <= w / 2 + pad && Math.abs(ry) <= h / 2 + pad) return l;
  }
  return null;
}

/* ---------- Drawing ---------- */

export interface PhotoItem {
  id: string;
  name: string;
  type: string;
  img: HTMLImageElement;
  url: string;
  thumb?: string; // tiny preview for the photo strip (keeps the page light on phones)
}

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = url;
  });
}

/** Small thumbnail for the photo strip, so the browser never has to scale a 12 MP photo down to 64 px. */
export function makePhotoAssets(img: HTMLImageElement): { thumb: string } {
  const side = 160;
  const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const thumb = c.toDataURL("image/jpeg", 0.7);
  c.width = c.height = 0; // free the canvas memory right away
  return { thumb };
}

/** k = how much smaller the canvas is than the photo. Canvas shadows ignore the transform, so they are scaled by hand. */
function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, W: number, H: number, k = 1) {
  if (!isRenderable(l)) return;
  const { w, h } = layerBox(l, W);
  ctx.save();
  ctx.globalAlpha = l.opacity;
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rotation * Math.PI) / 180);
  if (l.shadow) {
    ctx.shadowColor = l.shadowColor;
    ctx.shadowBlur = (l.shadowBlur / 100) * h * 0.6 * k;
    ctx.shadowOffsetX = ctx.shadowOffsetY = h * 0.06 * k;
  }
  if (l.kind === "image") {
    ctx.drawImage(l.img!, -w / 2, -h / 2, w, h);
  } else {
    ctx.font = fontString(l, W);
    ctx.fillStyle = l.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(l.text, 0, 0);
  }
  ctx.restore();
}

/** Draw every watermark (and, for the preview only, the selection outline). Coordinates stay in photo pixels. */
function paint(ctx: CanvasRenderingContext2D, layers: Layer[], W: number, H: number, k: number, highlightId?: string | null) {
  ctx.save();
  ctx.scale(k, k);
  layers.forEach((l) => drawLayer(ctx, l, W, H, k));

  const sel = highlightId ? layers.find((l) => l.id === highlightId) : null;
  if (sel && isRenderable(sel)) {
    const { w, h } = layerBox(sel, W);
    const pad = W * 0.006, lw = Math.max(2 / k, W * 0.0025);
    ctx.translate(sel.x * W, sel.y * H);
    ctx.rotate((sel.rotation * Math.PI) / 180);
    ctx.lineWidth = lw;
    ctx.strokeStyle = "#0d1c42";
    ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + 2 * pad, h + 2 * pad);
    ctx.setLineDash([lw * 3, lw * 2]);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + 2 * pad, h + 2 * pad);
  }
  ctx.restore();
}

/** A smaller copy of the photo used only for the live preview, so dragging stays smooth on phones. */
export interface PreviewSource { src: CanvasImageSource; w: number; h: number; k: number }

export function makePreviewSource(photo: HTMLImageElement, maxSide: number): PreviewSource {
  const W = photo.naturalWidth, H = photo.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(W, H));
  if (k >= 1) return { src: photo, w: W, h: H, k: 1 };
  const c = document.createElement("canvas");
  c.width = Math.round(W * k);
  c.height = Math.round(H * k);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(photo, 0, 0, c.width, c.height);
  return { src: c, w: c.width, h: c.height, k };
}

/** Live preview: draws the small copy plus the watermarks, scaled to match. Cheap enough to run on every drag frame. */
export function renderPreview(
  canvas: HTMLCanvasElement, source: PreviewSource, photoW: number, photoH: number,
  layers: Layer[], highlightId?: string | null
) {
  if (canvas.width !== source.w) canvas.width = source.w; // resizing clears and reallocates, so only when needed
  if (canvas.height !== source.h) canvas.height = source.h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source.src, 0, 0, source.w, source.h);
  paint(ctx, layers, photoW, photoH, source.k, highlightId);
}

/** The export engine: the photo at full size (or scaled by k), then every watermark on top. */
export function renderWatermark(canvas: HTMLCanvasElement, photo: HTMLImageElement, layers: Layer[], k = 1) {
  const W = photo.naturalWidth, H = photo.naturalHeight;
  canvas.width = Math.max(1, Math.round(W * k));
  canvas.height = Math.max(1, Math.round(H * k));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  paint(ctx, layers, W, H, k);
}

/* ---------- Export ---------- */

const outType = (t: string) => (t === "image/png" ? "image/png" : "image/jpeg");
const toBlob = (c: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), type, 0.92));

export function outputName(p: PhotoItem) {
  const ext = outType(p.type) === "image/png" ? "png" : "jpg";
  return `${p.name.replace(/\.[^.]+$/, "")}-renemark.${ext}`;
}

/** Phones (iPhone Safari especially) fail to create canvases above about 16.7 million pixels.
 *  Bigger photos are scaled down just enough to fit. Raise this on desktop-only use. */
export const MAX_EXPORT_PIXELS = 16_000_000;

export async function exportOne(p: PhotoItem, layers: Layer[]) {
  const c = document.createElement("canvas");
  const pixels = p.img.naturalWidth * p.img.naturalHeight;
  const k = Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / pixels));
  renderWatermark(c, p.img, layers, k);
  try {
    return await toBlob(c, outType(p.type));
  } finally {
    c.width = c.height = 0; // hand the canvas memory back before the next photo
  }
}

export interface BatchResult {
  parts: { name: string; blob: Blob }[]; // one ZIP normally; several when the batch is big
  saved: number;
  failed: string[];  // photos that could not be processed (the rest are still saved)
  resized: number;   // photos scaled down to fit the phone-safe size limit
  cancelled: boolean;
}

/** Give each photo its own watermarks and pack the results into ZIP file(s).
 *  One bad photo no longer stops the batch, and very big batches are split so a phone never runs out of memory. */
export async function exportBatch(
  photos: PhotoItem[],
  layersFor: (id: string) => Layer[],
  onProgress: (done: number, total: number) => void,
  opts: { signal?: AbortSignal; maxPartBytes?: number } = {}
): Promise<BatchResult> {
  const maxPart = opts.maxPartBytes ?? 250 * 1024 * 1024;
  const blobs: Blob[] = [];
  const failed: string[] = [];
  const used = new Set<string>();
  let zip = new JSZip(), inPart = 0, bytes = 0, saved = 0, resized = 0;

  const flush = async () => {
    if (inPart === 0) return;
    // Photos are already compressed, so just store them: much faster and lighter on a phone.
    blobs.push(await zip.generateAsync({ type: "blob", compression: "STORE", streamFiles: true }));
    zip = new JSZip(); inPart = 0; bytes = 0;
  };

  for (let i = 0; i < photos.length; i++) {
    if (opts.signal?.aborted) return { parts: [], saved: 0, failed, resized, cancelled: true };
    onProgress(i, photos.length);
    const p = photos[i];
    try {
      const blob = await exportOne(p, layersFor(p.id));
      if (inPart > 0 && bytes + blob.size > maxPart) await flush();
      const base = outputName(p);
      let name = base, n = 1;
      while (used.has(name)) name = base.replace(/(\.[^.]+)$/, ` (${++n})$1`); // two photos with the same name never overwrite each other
      used.add(name);
      zip.file(name, blob);
      inPart++; bytes += blob.size; saved++;
      if (p.img.naturalWidth * p.img.naturalHeight > MAX_EXPORT_PIXELS) resized++;
    } catch {
      failed.push(p.name);
    }
    await new Promise((r) => setTimeout(r)); // let the page breathe between photos
  }
  onProgress(photos.length, photos.length);
  if (opts.signal?.aborted) return { parts: [], saved: 0, failed, resized, cancelled: true };
  await flush();

  const parts = blobs.map((blob, i) => ({
    blob,
    name: blobs.length === 1 ? "renemark-batch.zip" : `renemark-batch-part-${i + 1}-of-${blobs.length}.zip`,
  }));
  return { parts, saved, failed, resized, cancelled: false };
}

export function saveUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a); // some browsers ignore links that are not in the page
  a.click();
  a.remove();
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  saveUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 60_000); // big files need time; 4 seconds could cut them off
}
