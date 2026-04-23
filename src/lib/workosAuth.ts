import { createRemoteJWKSet, jwtVerify } from "jose";

function trim(raw: unknown): string {
  return String(raw ?? "").trim();
}

function readWorkOSClientId(): string {
  return trim(process.env.VITE_WORKOS_CLIENT_ID);
}

function readWorkOSApiHostname(): string {
  return trim(process.env.VITE_WORKOS_API_HOSTNAME)
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function readWorkOSIssuer(): string {
  const apiHostname = readWorkOSApiHostname();
  return apiHostname ? `https://${apiHostname}/` : "https://api.workos.com/";
}

function workosJwks() {
  const clientId = readWorkOSClientId();
  if (!clientId) throw new Error("Missing VITE_WORKOS_CLIENT_ID");
  return createRemoteJWKSet(new URL(`https://api.workos.com/sso/jwks/${clientId}`));
}

export async function getWorkOSUserIdFromAccessToken(token: string): Promise<string | null> {
  const raw = token.trim();
  if (!raw) return null;

  try {
    const { payload } = await jwtVerify(raw, workosJwks(), {
      issuer: readWorkOSIssuer(),
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
