/** Browser redirect target after OAuth / connector flows (must match how users open the app). */
export function getAppOriginForOAuthRedirect(): string {
  const explicit =
    process.env.OAUTH_APP_REDIRECT_ORIGIN ||
    process.env.VITE_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  if (explicit?.trim()) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:5173";
}
