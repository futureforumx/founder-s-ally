function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

function origin(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.origin;
}

function isVektaHost(host: string): boolean {
  return host === "vekta.so" || host === "www.vekta.so";
}

export function resolveWorkOSClientId(): string {
  return trim(import.meta.env.VITE_WORKOS_CLIENT_ID);
}

export function resolveWorkOSRedirectUri(): string | undefined {
  const explicit = trim(import.meta.env.VITE_WORKOS_REDIRECT_URI);
  if (explicit) return explicit;
  const host = hostname();
  if (isVektaHost(host)) {
    return "https://vekta.so/auth/callback";
  }
  const currentOrigin = origin();
  return currentOrigin ? `${currentOrigin}/auth/callback` : undefined;
}

export function hasWorkOSConfig(): boolean {
  return Boolean(resolveWorkOSClientId());
}
