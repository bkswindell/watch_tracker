// @ts-nocheck
export function artworkUrl(value) {
  if (!value) return value;
  try {
    const base =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const target = new URL(value, base);
    if (["media.themoviedb.org", "image.tmdb.org"].includes(target.hostname)) {
      target.hostname = "image.tmdb.org";
      return `/tmdb-image?url=${encodeURIComponent(target.href)}`;
    }
    return target.href;
  } catch {
    return value;
  }
}

export function youtubeThumbnailUrl(videoId) {
  return /^[A-Za-z0-9_-]{11}$/.test(videoId || "")
    ? `/youtube-thumbnail?video=${encodeURIComponent(videoId)}`
    : null;
}
