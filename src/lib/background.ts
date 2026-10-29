/** Watermark images never need to be huge. Shrinking them first makes everything faster and
 *  keeps phones from running out of memory. */
export const MAX_MARK_SIDE = 2048;

export async function shrinkImage(file: File, maxSide = MAX_MARK_SIDE): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (k >= 1) { bitmap.close(); return file; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not resize the image."))), "image/png")
  );
  canvas.width = canvas.height = 0;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
}

/** Turns the usual AI failures into something a normal person can act on. */
function friendly(e: unknown): Error {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "timeout")
    return new Error("This took too long. Try again on a faster connection, or use “Remove solid colour”.");
  if (/fetch|network|load|import|resource|wasm|onnx/i.test(m))
    return new Error("The AI model could not be loaded. Check your internet connection and try again, or use “Remove solid colour”.");
  if (/memory|alloc/i.test(m))
    return new Error("Your device ran out of memory. Try a smaller image, or use “Remove solid colour”.");
  return new Error(m || "Something went wrong.");
}

/** AI background removal. Runs in the browser, so images never leave the device.
 *  The model downloads the first time it is used, which can take a minute.
 *  onProgress gets a short message so the page can show what is happening. */
export async function removeBackgroundAI(file: File, onProgress?: (message: string) => void): Promise<File> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const small = await shrinkImage(file); // the AI works on ~1024 px internally, so more pixels only add waiting time
    const { removeBackground } = await import("@imgly/background-removal");
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 180_000); });
    const blob = await Promise.race([
      removeBackground(small, {
        progress: (key: string, current: number, total: number) => {
          if (!onProgress) return;
          if (key.startsWith("fetch") && total > 0) onProgress(`Downloading the AI model (first time only)… ${Math.round((current / total) * 100)}%`);
          else onProgress("Removing the background…");
        },
      }),
      timeout,
    ]);
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-nobg.png", { type: "image/png" });
  } catch (e) {
    throw friendly(e);
  } finally {
    clearTimeout(timer);
  }
}

/** Simple option for logos on a plain background. It starts from the edges of the picture and only removes
 *  the connected background, so same-coloured parts inside the logo (like white letters) are kept. */
export async function removeSolidColor(file: File, tolerance = 40): Promise<File> {
  const small = await shrinkImage(file);
  const bitmap = await createImageBitmap(small);
  const w = bitmap.width, h = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  // Background colour = the first opaque corner.
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  const c = corners.find((p) => d[p * 4 + 3] > 200);
  if (c === undefined) throw new Error("This image already has a transparent background, so there is nothing to remove.");
  const r0 = d[c * 4], g0 = d[c * 4 + 1], b0 = d[c * 4 + 2];
  const tol2 = tolerance * tolerance;
  const dist2 = (p: number) => {
    const dr = d[p * 4] - r0, dg = d[p * 4 + 1] - g0, db = d[p * 4 + 2] - b0;
    return dr * dr + dg * dg + db * db;
  };
  const isBg = (p: number) => d[p * 4 + 3] < 10 || dist2(p) <= tol2;

  // Flood fill inwards from every edge pixel that looks like the background.
  const gone = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0, removed = 0;
  const push = (p: number) => { if (!gone[p] && isBg(p)) { gone[p] = 1; stack[top++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (top > 0) {
    const p = stack[--top];
    d[p * 4 + 3] = 0;
    removed++;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }

  if (removed === 0) throw new Error("Could not find a plain background. Try “Remove background” (AI) instead.");
  if (removed > w * h * 0.98) throw new Error("That would remove almost the whole picture. Try “Remove background” (AI) instead.");

  // Soften the edge: pixels next to the removed area that are close to the background colour become semi-transparent.
  const soft2 = tolerance * 1.6 * tolerance * 1.6;
  for (let p = 0; p < w * h; p++) {
    if (gone[p]) continue;
    const x = p % w;
    const near = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (p >= w && gone[p - w]) || (p < w * (h - 1) && gone[p + w]);
    if (!near) continue;
    const dd = dist2(p);
    if (dd <= soft2) d[p * 4 + 3] = Math.round((d[p * 4 + 3] * (Math.sqrt(dd) - tolerance)) / (tolerance * 0.6));
  }
  ctx.putImageData(image, 0, 0);

  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not create the image."))), "image/png")
  );
  canvas.width = canvas.height = 0;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-nobg.png", { type: "image/png" });
}
