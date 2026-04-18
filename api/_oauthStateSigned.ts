import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  return (
    process.env.CONNECTOR_OAUTH_STATE_SECRET ||
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-only-connector-oauth-state"
  );
}

export type GoogleOAuthStatePayload = {
  v: 1;
  uid: string;
  oc: string;
  connector: "gmail" | "gcal";
  exp: number;
};

export function signGoogleOAuthState(payload: GoogleOAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGoogleOAuthState(token: string): GoogleOAuthStatePayload | null {
  try {
    const i = token.lastIndexOf(".");
    if (i <= 0) return null;
    const body = token.slice(0, i);
    const sig = token.slice(i + 1);
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleOAuthStatePayload;
    if (parsed.v !== 1) return null;
    if (typeof parsed.uid !== "string" || typeof parsed.oc !== "string") return null;
    if (parsed.connector !== "gmail" && parsed.connector !== "gcal") return null;
    if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
