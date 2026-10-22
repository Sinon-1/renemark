import JSZip from "jszip";

/** All position values are fractions (0-1) of the photo, so one setting fits any photo size. */
export interface WatermarkSettings {
  scale: number;    // watermark width as a fraction of photo width
  opacity: number;  // 0-1
  rotation: number; // degrees
  x: number;        // centre of the watermark, 0-1
  y: number;
}

export const DEFAULT_SETTINGS: WatermarkSettings = { scale: 0.25, opacity: 0.6, rotation: 0, x: 0.8, y: 0.88 };

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

/** The core engine: draw the photo, then the watermark on top. Works on any canvas. */
export function renderWatermark(
  canvas: HTMLCanvasElement,
  photo: HTMLImageElement,
  mark: HTMLImageElement | null,
  s: WatermarkSettings
) {
  canvas.width = photo.naturalWidth;
  canvas.height = photo.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(photo, 0, 0);
  if (!mark) return;

  const w = s.scale * canvas.width;
  const h = (w * mark.naturalHeight) / mark.naturalWidth;
  ctx.save();
  ctx.globalAlpha = s.opacity;
  ctx.translate(s.x * canvas.width, s.y * canvas.height);
  ctx.rotate((s.rotation * Math.PI) / 180);
  ctx.drawImage(mark, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Snap the watermark to a corner, edge or the centre. col/row are 0, 1 or 2. */
export function anchorPosition(
  col: number,
  row: number,
  s: WatermarkSettings,
  photo: HTMLImageElement,
  mark: HTMLImageElement | null
): Pick<WatermarkSettings, "x" | "y"> {
  const margin = 0.04;
  const halfW = s.scale / 2;
  const ratio = mark ? mark.naturalHeight / mark.naturalWidth : 1;
  const halfH = (s.scale * ratio * photo.naturalWidth) / photo.naturalHeight / 2;
  return {
    x: col === 0 ? margin + halfW : col === 2 ? 1 - margin - halfW : 0.5,
    y: row === 0 ? margin + halfH : row === 2 ? 1 - margin - halfH : 0.5,
  };
}

const outType = (t: string) => (t === "image/png" ? "image/png" : "image/jpeg");
const toBlob = (c: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), type, 0.92));

export function outputName(p: PhotoItem) {
  const ext = outType(p.type) === "image/png" ? "png" : "jpg";
  return `${p.name.replace(/\.[^.]+$/, "")}-renemark.${ext}`;
}

export async function exportOne(p: PhotoItem, mark: HTMLImageElement | null, s: WatermarkSettings) {
  const c = document.createElement("canvas");
  renderWatermark(c, p.img, mark, s);
  return toBlob(c, outType(p.type));
}

/** Apply each photo's own settings and pack the results into one ZIP. */
export async function exportBatch(
  photos: PhotoItem[],
  mark: HTMLImageElement | null,
  settingsFor: (id: string) => WatermarkSettings,
  onProgress: (done: number, total: number) => void
) {
  const zip = new JSZip();
  const used = new Set<string>();
  for (let i = 0; i < photos.length; i++) {
    onProgress(i, photos.length);
    let name = outputName(photos[i]);
    if (used.has(name)) name = `${i + 1}-${name}`;
    used.add(name);
    zip.file(name, await exportOne(photos[i], mark, settingsFor(photos[i].id)));
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
