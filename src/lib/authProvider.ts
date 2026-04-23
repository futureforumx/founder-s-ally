function trimEnv(value: string | undefined): string {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

export type AuthProviderKind = "workos";

export function readAuthProvider(): AuthProviderKind {
  return "workos";
}

export interface WorkOSConfig {
  clientId: string;
  apiHostname: string;
  redirectUri: string;
  devMode: boolean;
}

export function readWorkOSConfig(): WorkOSConfig {
  return {
    clientId: trimEnv(import.meta.env.VITE_WORKOS_CLIENT_ID),
    apiHostname: trimEnv(import.meta.env.VITE_WORKOS_API_HOSTNAME),
    redirectUri: trimEnv(import.meta.env.VITE_WORKOS_REDIRECT_URI),
    devMode: trimEnv(import.meta.env.VITE_WORKOS_DEV_MODE).toLowerCase() === "true",
  };
}

export function isWorkOSConfigured(): boolean {
  const cfg = readWorkOSConfig();
  return Boolean(cfg.clientId && (cfg.apiHostname || cfg.devMode));
}
