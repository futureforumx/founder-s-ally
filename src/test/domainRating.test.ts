import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAhrefs, normalizeDomain } from "../../api/_domainRating";

describe("domain rating domain and provider helpers", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("normalizes hostnames while preserving www and subdomains", () => {
    expect(normalizeDomain("HTTPS://WWW.Example.com.:8443/path?q=1")).toBe("www.example.com");
    expect(normalizeDomain("münich.de")).toBe("xn--mnich-kva.de");
    expect(normalizeDomain("app.example.com")).toBe("app.example.com");
  });
  it.each(["localhost", "foo.local", "127.0.0.1", "https://user:pw@example.com", "https://[::1]/", "bad host", "internal.example.test"])("rejects unsafe host %s", v => expect(() => normalizeDomain(v)).toThrow());
  it("accepts a real zero rating and preserves license URL", async () => {
    vi.stubEnv("AHREFS_API_KEY", "test-secret");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ domain_rating: { domain_rating: 0, license_url: "https://ahrefs.com/license" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchAhrefs("example.com")).toEqual({ rating: 0, licenseUrl: "https://ahrefs.com/license" });
    const request = fetchMock.mock.calls[0][0] as URL;
    expect(request.hostname).toBe("api.ahrefs.com");
    expect(request.searchParams.get("version")).toBe("dr3");
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer test-secret" });
  });
  it("rejects absent or malformed ratings instead of coercing them to zero", async () => {
    vi.stubEnv("AHREFS_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ domain_rating: { domain_rating: null } }), { status: 200 })));
    await expect(fetchAhrefs("example.com")).rejects.toThrow("provider_invalid_response");
  });
});
