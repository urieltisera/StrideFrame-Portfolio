export const MAX_PHOTO_BYTES = Number(process.env.MAX_PHOTO_BYTES || 10 * 1024 * 1024);
export const MAX_PHOTOS_PER_UPLOAD = Number(process.env.MAX_PHOTOS_PER_UPLOAD || 50);
export const supportedMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
