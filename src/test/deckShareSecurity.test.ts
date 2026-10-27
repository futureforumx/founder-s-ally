import { afterEach, describe, expect, it } from "vitest";
import { deriveShareToken, hashSharePassword, hashShareToken, verifySharePassword } from "../../api/_deckShareCrypto";
import { shareIsActive } from "../../api/_deckShareServer";
import { prepareDeckShareEventRows } from "../../api/_deckShareEvents";

describe("native deck share security", () => {
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  afterEach(() => {
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });

  it("derives retry-stable bearer tokens from a CSPRNG nonce and stores only a digest", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-server-secret";
    const requestNonce = "nZQ6AT14UFfVt2i9La7b0VzfM2m45_UVn7ybc6M8nLA";
    const first = deriveShareToken("founder-1", requestNonce);
    const second = deriveShareToken("founder-1", "nZQ6AT14UFfVt2i9La7b0VzfM2m45_UVn7ybc6M8nLB");
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(deriveShareToken("founder-1", requestNonce)).toBe(first);
    expect(hashShareToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken(first)).toBe(hashShareToken(first));
  });

  it("hashes optional passwords and rejects incorrect values", () => {
    const encoded = hashSharePassword("a-long-deck-password");
    expect(encoded).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(verifySharePassword("a-long-deck-password", encoded)).toBe(true);
    expect(verifySharePassword("wrong-password", encoded)).toBe(false);
  });

  it("requires the server key for keyed rate-limit hashes", async () => {
    const { hashPrivateValue } = await import("../../api/_deckShareCrypto");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => hashPrivateValue("client-ip")).toThrow("server-side Supabase service key");
  });

  it("rejects revoked and expired links at the provider-independent policy boundary", () => {
    const now = Date.parse("2026-10-26T12:00:00.000Z");
    expect(shareIsActive({ revoked_at: "2026-10-26T11:59:00.000Z" }, now)).toBe("revoked");
    expect(shareIsActive({ expires_at: "2026-10-26T11:59:00.000Z" }, now)).toBe("expired");
    expect(shareIsActive({ expires_at: "2026-10-26T12:01:00.000Z" }, now)).toBeNull();
    expect(shareIsActive({}, now)).toBeNull();
  });

  it("bounds event batches, page numbers, and active-time increments before database writes", () => {
    const eventId = "7ad2df8a-17ee-4cb4-8938-44ef7372622a";
    const valid = prepareDeckShareEventRows([{ eventId, type: "slide_time", slideNumber: 3, activeSeconds: 15 }], "session", "share", 12);
    expect(valid.error).toBeNull();
    expect(valid.rows?.[0]).toMatchObject({ event_id: eventId, session_id: "session", share_id: "share", event_type: "slide_time", slide_number: 3, active_seconds: 15 });
    expect(prepareDeckShareEventRows([{ eventId, type: "slide_time", slideNumber: 13, activeSeconds: 15 }], "s", "l", 12).error).toContain("outside this deck");
    expect(prepareDeckShareEventRows([{ eventId, type: "slide_time", slideNumber: 1, activeSeconds: 21 }], "s", "l", 12).error).toContain("between 1 and 20");
    expect(prepareDeckShareEventRows(Array.from({ length: 21 }, () => ({ eventId, type: "session_start" })), "s", "l", 12).error).toContain("between 1 and 20");
    expect(prepareDeckShareEventRows([{ eventId: "bad-uuid", type: "session_start" }], "s", "l", 12).error).toContain("invalid");
  });
});
