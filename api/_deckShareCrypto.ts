import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function encryptionKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Deck sharing needs the server-side Supabase service key.");
  return createHash("sha256").update(secret).digest();
}

/** A keyed PRF turns a 256-bit CSPRNG request nonce into a retry-stable bearer token. */
export function deriveShareToken(ownerId: string, requestId: string) {
  return createHmac("sha256", encryptionKey()).update("vekta-deck-share-v1\0").update(ownerId).update("\0").update(requestId).digest("base64url");
}
export function hashShareToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function hashPrivateValue(value: string) { return createHmac("sha256", encryptionKey()).update(value).digest("hex"); }

export function hashSharePassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifySharePassword(password: string, encoded: string | null) {
  if (!encoded) return !password;
  const [scheme, n, r, p, rawSalt, rawHash] = encoded.split("$");
  if (scheme !== "scrypt" || n !== "16384" || r !== "8" || p !== "1" || !rawSalt || !rawHash) return false;
  try {
    const expected = Buffer.from(rawHash, "base64url");
    const actual = scryptSync(password, Buffer.from(rawSalt, "base64url"), expected.length, { N: 16384, r: 8, p: 1 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
