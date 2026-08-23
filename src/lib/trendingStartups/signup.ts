const SIGNUP_PATH = (import.meta.env.VITE_FRESH_CAPITAL_SIGNUP_PATH as string | undefined)?.trim() || "/auth/sign-up";

export function trendingStartupsSignupHref(): string {
  const base = SIGNUP_PATH.startsWith("/") ? SIGNUP_PATH : `/${SIGNUP_PATH}`;
  const params = new URLSearchParams();
  params.set("signup_attribution", "trending_startups");
  return `${base}?${params.toString()}`;
}

const SPOTTER_KEY = "vekta-early-spotter-ids";

export function readEarlySpotterIds(): string[] {
  try {
    const raw = localStorage.getItem(SPOTTER_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function isEarlySpotter(id: string): boolean {
  return readEarlySpotterIds().includes(id);
}

export function toggleEarlySpotter(id: string): boolean {
  const next = new Set(readEarlySpotterIds());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  localStorage.setItem(SPOTTER_KEY, JSON.stringify([...next]));
  return next.has(id);
}
