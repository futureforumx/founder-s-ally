import { describe, expect, it } from "vitest";
import { resolveIngestFetchUrl, sanitizeIngestProxyOrigin } from "../../scripts/funding-ingest/sources";
import { isNonRetryableIngestError } from "../../scripts/funding-ingest/retry";

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

  it("unwraps markdown-link secrets and quoted origins", () => {
    const markdown =
      "[https://vekta-ingest-proxy.silent-math-4d01.workers.dev](https://vekta-ingest-proxy.silent-math-4d01.workers.dev)";
    expect(sanitizeIngestProxyOrigin(`"${markdown}"`)).toBe(
      "https://vekta-ingest-proxy.silent-math-4d01.workers.dev",
    );
    expect(
      resolveIngestFetchUrl(
        "https://www.geekwire.com/fundings/",
        "https://vekta-ingest-proxy.silent-math-4d01.workers.dev\n",
      ),
    ).toBe(
      "https://vekta-ingest-proxy.silent-math-4d01.workers.dev?url=https%3A%2F%2Fwww.geekwire.com%2Ffundings%2F",
    );
  });

  it("falls back to the source URL when the proxy origin is invalid", () => {
    expect(resolveIngestFetchUrl("https://www.geekwire.com/fundings/", "not a url")).toBe(
      "https://www.geekwire.com/fundings/",
    );
  });
});

describe("isNonRetryableIngestError", () => {
  it("skips retries for URL parse failures and 403s", () => {
    expect(isNonRetryableIngestError(new Error("Failed to parse URL from [https://x](https://x)?url=y"))).toBe(
      true,
    );
    expect(isNonRetryableIngestError(new Error("HTTP 403 for https://www.geekwire.com/fundings/"))).toBe(true);
    expect(isNonRetryableIngestError(new Error("HTTP 503 for https://techcrunch.com"))).toBe(false);
  });
});
