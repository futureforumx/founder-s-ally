import { describe, expect, it } from "vitest";
import {
  listingItemFromRawRow,
  rawListingContentHash,
  shouldSkipSharedFeedFetch,
  DEFAULT_SHARED_FEED_MAX_AGE_MS,
} from "../../scripts/ingest-shared-feeds/cache";

describe("shouldSkipSharedFeedFetch", () => {
  const now = new Date("2026-08-21T11:00:00.000Z");

  it("fetches when the cache is empty", () => {
    expect(shouldSkipSharedFeedFetch(null, now, DEFAULT_SHARED_FEED_MAX_AGE_MS, false)).toBe(false);
  });

  it("skips when the same source was fetched a few hours ago", () => {
    expect(
      shouldSkipSharedFeedFetch(new Date("2026-08-21T07:00:00.000Z"), now, DEFAULT_SHARED_FEED_MAX_AGE_MS, false),
    ).toBe(true);
  });

  it("refetches after the max age window", () => {
    expect(
      shouldSkipSharedFeedFetch(new Date("2026-08-20T14:00:00.000Z"), now, DEFAULT_SHARED_FEED_MAX_AGE_MS, false),
    ).toBe(false);
  });

  it("always fetches when force is set", () => {
    expect(
      shouldSkipSharedFeedFetch(new Date("2026-08-21T10:59:00.000Z"), now, DEFAULT_SHARED_FEED_MAX_AGE_MS, true),
    ).toBe(false);
  });
});

describe("listingItemFromRawRow", () => {
  it("maps a cached row onto the funding-ingest listing shape", () => {
    expect(
      listingItemFromRawRow({
        source_key: "TECHCRUNCH_VENTURE",
        canonical_url: "https://techcrunch.com/2026/08/21/example/",
        article_url: "https://techcrunch.com/2026/08/21/example/",
        listing_url: "https://techcrunch.com/category/venture/",
        title: "Example raises $20M",
        published_at: new Date("2026-08-21T12:00:00.000Z"),
        summary: "Seed round",
      }),
    ).toEqual({
      sourceKey: "TECHCRUNCH_VENTURE",
      listingPageUrl: "https://techcrunch.com/category/venture/",
      articleUrl: "https://techcrunch.com/2026/08/21/example/",
      title: "Example raises $20M",
      publishedAt: new Date("2026-08-21T12:00:00.000Z"),
      summary: "Seed round",
    });
  });
});

describe("rawListingContentHash", () => {
  it("is stable for the same listing and changes when the title changes", () => {
    const base = {
      articleUrl: "https://techcrunch.com/a",
      title: "Alpha",
      publishedAt: new Date("2026-08-21T00:00:00.000Z"),
      summary: "one",
    };
    const first = rawListingContentHash(base);
    expect(first).toHaveLength(64);
    expect(rawListingContentHash(base)).toBe(first);
    expect(rawListingContentHash({ ...base, title: "Beta" })).not.toBe(first);
  });
});
