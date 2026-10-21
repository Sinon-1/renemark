/** AI background removal. Runs in the browser, so images never leave the device.
 *  The model downloads the first time it is used, which can take a minute. */
export async function removeBackgroundAI(file: File): Promise<File> {
  const { removeBackground } = await import("@imgly/background-removal");
  const blob = await removeBackground(file);
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-nobg.png", { type: "image/png" });
}

/** Simple fallback: makes every pixel close to the top-left pixel's colour transparent.
 *  Best for logos on a plain white or single-colour background. */
export async function removeSolidColor(file: File, tolerance = 40): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const [r0, g0, b0] = [d[0], d[1], d[2]];
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - r0, d[i + 1] - g0, d[i + 2] - b0);
    if (dist <= tolerance) d[i + 3] = 0;
    else if (dist <= tolerance * 1.5) d[i + 3] = Math.round((d[i + 3] * (dist - tolerance)) / (tolerance * 0.5)); // soft edge
  }
  ctx.putImageData(image, 0, 0);

  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not create the image."))), "image/png")
  );
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-nobg.png", { type: "image/png" });
}
