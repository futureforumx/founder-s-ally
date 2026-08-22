import { describe, expect, it } from "vitest";
import { resolveIngestFetchUrl } from "../../scripts/funding-ingest/sources";

describe("resolveIngestFetchUrl", () => {
  it("passes non-GeekWire URLs through unchanged", () => {
    expect(resolveIngestFetchUrl("https://techcrunch.com/feed/", "https://proxy.example")).toBe(
      "https://techcrunch.com/feed/",
    );
  });

  it("wraps GeekWire URLs when INGEST_FETCH_PROXY_URL is set", () => {
    expect(resolveIngestFetchUrl("https://www.geekwire.com/fundings/", "https://proxy.example/")).toBe(
      "https://proxy.example?url=https%3A%2F%2Fwww.geekwire.com%2Ffundings%2F",
    );
  });

  it("does not wrap GeekWire when no proxy is configured", () => {
    expect(resolveIngestFetchUrl("https://www.geekwire.com/fundings/", "")).toBe(
      "https://www.geekwire.com/fundings/",
    );
  });
});
