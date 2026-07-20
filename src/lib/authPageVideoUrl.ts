/** Public R2 hero videos for `/login` — one is chosen at random on each page load. */
export const AUTH_HERO_VIDEO_URLS = [
  "https://pub-894f902f06cd4ebfa3903a5e72ad4c8a.r2.dev/Explosion_Of_Dry_Multi_Colored_Paint_fhd_1126758.mp4",
  "https://pub-894f902f06cd4ebfa3903a5e72ad4c8a.r2.dev/12676758_3840_2160_30fps.mp4",
  "https://pub-894f902f06cd4ebfa3903a5e72ad4c8a.r2.dev/Abstract_LED_Blue_Light_Lines_Background_fhd_2024874.mp4",
] as const;

/** Picks a random auth hero MP4. Call once per mount (e.g. `useMemo`) so refresh rotates. */
export function getAuthPageBackgroundVideoUrl(): string {
  const override = import.meta.env.VITE_AUTH_PAGE_BG_VIDEO_URL?.trim();
  if (override) return override;
  const index = Math.floor(Math.random() * AUTH_HERO_VIDEO_URLS.length);
  return AUTH_HERO_VIDEO_URLS[index] ?? AUTH_HERO_VIDEO_URLS[0];
}
