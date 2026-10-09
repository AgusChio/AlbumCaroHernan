export interface PreparedImage {
  full: Blob;
  thumb: Blob | null;
  width: number;
  height: number;
}

const FULL_SIDE = 2560;
const THUMB_SIDE = 720;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function scaled(bitmap: ImageBitmap, maxSide: number, quality: number) {
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas, quality);
}

/** Downscales big phone photos and builds a light thumbnail; falls back to the original file. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { full: file, thumb: null, width: 4, height: 3 };
  }
  try {
    const { width, height } = bitmap;
    const keepOriginal = file.type === "image/gif" || Math.max(width, height) <= FULL_SIDE;
    const full = keepOriginal ? file : ((await scaled(bitmap, FULL_SIDE, 0.88)) ?? file);
    const thumb = await scaled(bitmap, THUMB_SIDE, 0.8);
    return { full: full.size < file.size ? full : file, thumb, width, height };
  } finally {
    bitmap.close();
  }
}
