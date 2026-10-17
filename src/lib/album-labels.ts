export const DEFAULT_ALBUM_SLUG = "event-photos";
export const DEFAULT_ALBUM_TITLE = "Event photos";
export const INDIVIDUAL_ALBUM_SLUG = "individual-photos";

/** Keeps implementation-only album names out of photographer/customer UI. */
export function albumDisplayTitle(album: { slug: string; title: string }) {
  if (album.slug === DEFAULT_ALBUM_SLUG || album.title === "Event photos") return "General photos";
  return album.title;
}

export function isIndividualAlbum(album: { slug: string }) {
  return album.slug === INDIVIDUAL_ALBUM_SLUG;
}

export function isDefaultAlbum(album: { slug?: string; title: string }) {
  return album.slug === DEFAULT_ALBUM_SLUG || album.title === "Event photos";
}
