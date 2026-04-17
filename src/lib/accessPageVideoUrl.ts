/** R2 / CDN object name for the /access hero background (1920×1080). */
export const ACCESS_PAGE_BG_VIDEO_FILENAME = "14904127-hd_1920_1080_30fps-ezgif.com-video-speed.mp4";

/** Default public R2 dev host (object must live at `/{ACCESS_PAGE_BG_VIDEO_FILENAME}`). */
export const DEFAULT_ACCESS_PAGE_VIDEO_CDN_BASE = "https://pub-894f902f06cd4ebfa3903a5e72ad4c8a.r2.dev";

/**
 * Resolves the public MP4 URL for the access page background.
 * Override with `VITE_ACCESS_PAGE_BG_VIDEO_URL` (full URL) or `VITE_ACCESS_PAGE_VIDEO_CDN_BASE` (no trailing slash).
 */
export function getAccessPageBackgroundVideoUrl(): string {
  const full = import.meta.env.VITE_ACCESS_PAGE_BG_VIDEO_URL?.trim();
  if (full) return full;
  const base =
    import.meta.env.VITE_ACCESS_PAGE_VIDEO_CDN_BASE?.trim() || DEFAULT_ACCESS_PAGE_VIDEO_CDN_BASE;
  return `${base.replace(/\/$/, "")}/${ACCESS_PAGE_BG_VIDEO_FILENAME}`;
}
