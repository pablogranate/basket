// Crests render at most ~112 px; 256 keeps them sharp on retina screens.
export const LOGO_MAX_PX = 256;
export const LOGO_WEBP_QUALITY = 0.85;

export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("No se pudo leer la imagen."));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Browser-only. SVGs stay as they are; anything else is redrawn at
// LOGO_MAX_PX as WebP (Safari falls back to PNG), keeping whichever of the
// original and the shrunk version is smaller.
export async function shrinkLogoFile(file: File) {
  const original = await readAsDataUrl(file);

  if (file.type === "image/svg+xml") {
    return original;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const size = fitWithin(bitmap.width, bitmap.height, LOGO_MAX_PX);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();

    const shrunk = canvas.toDataURL("image/webp", LOGO_WEBP_QUALITY);
    return shrunk.length < original.length ? shrunk : original;
  } catch (error) {
    console.warn("[teams] could not shrink logo, keeping original", error);
    return original;
  }
}
