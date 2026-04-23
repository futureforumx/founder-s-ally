function trim(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^["']|["']$/g, "");
}

export type AuthProviderKind = "clerk" | "workos";

export function readAuthProvider(): AuthProviderKind {
  return trim(import.meta.env.VITE_AUTH_PROVIDER).toLowerCase() === "workos"
    ? "workos"
    : "clerk";
}

export function readWorkOSConfig() {
  return {
    clientId: trim(import.meta.env.VITE_WORKOS_CLIENT_ID),
    apiHostname: trim(import.meta.env.VITE_WORKOS_API_HOSTNAME),
    redirectUri: trim(import.meta.env.VITE_WORKOS_REDIRECT_URI),
    devMode: trim(import.meta.env.VITE_WORKOS_DEV_MODE).toLowerCase() === "true",
  };
}

export function isWorkOSConfigured(): boolean {
  const cfg = readWorkOSConfig();
  return Boolean(cfg.clientId && (cfg.apiHostname || cfg.devMode));
}
