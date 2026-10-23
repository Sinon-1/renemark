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
}

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = url;
  });
}

function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, W: number, H: number) {
  if (!isRenderable(l)) return;
  const { w, h } = layerBox(l, W);
  ctx.save();
  ctx.globalAlpha = l.opacity;
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rotation * Math.PI) / 180);
  if (l.shadow) {
    ctx.shadowColor = l.shadowColor;
    ctx.shadowBlur = (l.shadowBlur / 100) * h * 0.6;
    ctx.shadowOffsetX = ctx.shadowOffsetY = h * 0.06;
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

/** The core engine: draw the photo, then every watermark on top. Used by the preview AND the export. */
export function renderWatermark(canvas: HTMLCanvasElement, photo: HTMLImageElement, layers: Layer[], highlightId?: string | null) {
  const W = (canvas.width = photo.naturalWidth);
  const H = (canvas.height = photo.naturalHeight);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(photo, 0, 0);
  layers.forEach((l) => drawLayer(ctx, l, W, H));

  // Selection outline: preview only (the export never passes highlightId).
  const sel = highlightId ? layers.find((l) => l.id === highlightId) : null;
  if (sel && isRenderable(sel)) {
    const { w, h } = layerBox(sel, W);
    const pad = W * 0.006, lw = Math.max(2, W * 0.0025);
    ctx.save();
    ctx.translate(sel.x * W, sel.y * H);
    ctx.rotate((sel.rotation * Math.PI) / 180);
    ctx.lineWidth = lw;
    ctx.strokeStyle = "#0d1c42";
    ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + 2 * pad, h + 2 * pad);
    ctx.setLineDash([lw * 3, lw * 2]);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + 2 * pad, h + 2 * pad);
    ctx.restore();
  }
}

/* ---------- Export ---------- */

const outType = (t: string) => (t === "image/png" ? "image/png" : "image/jpeg");
const toBlob = (c: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), type, 0.92));

export function outputName(p: PhotoItem) {
  const ext = outType(p.type) === "image/png" ? "png" : "jpg";
  return `${p.name.replace(/\.[^.]+$/, "")}-renemark.${ext}`;
}

export async function exportOne(p: PhotoItem, layers: Layer[]) {
  const c = document.createElement("canvas");
  renderWatermark(c, p.img, layers);
  return toBlob(c, outType(p.type));
}

/** Give each photo its own watermarks and pack the results into one ZIP. */
export async function exportBatch(
  photos: PhotoItem[],
  layersFor: (id: string) => Layer[],
  onProgress: (done: number, total: number) => void
) {
  const zip = new JSZip();
  const used = new Set<string>();
  for (let i = 0; i < photos.length; i++) {
    onProgress(i, photos.length);
    let name = outputName(photos[i]);
    if (used.has(name)) name = `${i + 1}-${name}`;
    used.add(name);
    zip.file(name, await exportOne(photos[i], layersFor(photos[i].id)));
    await new Promise((r) => setTimeout(r)); // let the page breathe between photos
  }
  onProgress(photos.length, photos.length);
  return zip.generateAsync({ type: "blob" });
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
