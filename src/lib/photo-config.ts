const configuredLimit = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

export const MAX_PHOTO_BYTES = configuredLimit("MAX_PHOTO_BYTES", 25 * 1024 * 1024);
export const MAX_PHOTOS_PER_UPLOAD = configuredLimit("MAX_PHOTOS_PER_UPLOAD", 20);
export const MAX_UPLOAD_BYTES = configuredLimit("MAX_UPLOAD_BYTES", 200 * 1024 * 1024);
export const MAX_IMAGE_PIXELS = configuredLimit("MAX_IMAGE_PIXELS", 40_000_000);
export const MAX_IMAGE_DIMENSION = configuredLimit("MAX_IMAGE_DIMENSION", 10_000);
export const supportedMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateUploadBatch(files: readonly File[]) {
  if (!files.length) throw new Error("At least one photo is required");
  if (files.length > MAX_PHOTOS_PER_UPLOAD) throw new Error(`A batch may contain at most ${MAX_PHOTOS_PER_UPLOAD} photos`);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) throw new Error(`The upload batch must be smaller than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
  for (const file of files) {
    if (!supportedMimeTypes.includes(file.type as never)) throw new Error(`${file.name}: Unsupported image type`);
    if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) throw new Error(`${file.name}: Image exceeds the ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB per-photo limit`);
  }
  return { totalBytes };
}
