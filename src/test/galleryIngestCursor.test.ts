import { describe, expect, it } from "vitest";
import {
  GALLERY_EMPTY_CURSOR_LOOKBACK_DAYS,
  listingItemsFromGalleryNewsRows,
} from "../../scripts/funding-ingest/sources";
import type { StartupsGalleryNewsRow } from "@/lib/startupsGalleryNews";

function row(partial: Partial<StartupsGalleryNewsRow> & { companyName: string; cmsId: string }): StartupsGalleryNewsRow {
  return {
    companyPageUrl: `https://startups.gallery/companies/${partial.companyName.toLowerCase()}`,
    companySlug: partial.companyName.toLowerCase(),
    amountRaw: "$10M",
    roundTypeRaw: "Seed",
    announcedAtIso: null,
    leadInvestor: null,
    sourceUrl: `https://example.com/${partial.cmsId}`,
    logoUrl: null,
    ...partial,
  };
}

describe("listingItemsFromGalleryNewsRows", () => {
  it("includes same-calendar-day CMS rows that the date-only checkpoint would previously skip", () => {
    const items = listingItemsFromGalleryNewsRows(
      [
        row({ companyName: "Helcim", cmsId: "helcim", announcedAtIso: "2026-08-21T00:00:00.000Z" }),
        row({ companyName: "OldCo", cmsId: "old", announcedAtIso: "2026-07-01T00:00:00.000Z" }),
      ],
      { since: new Date("2026-08-21T00:00:00.000Z"), maxItems: 50, seenCmsIds: new Set(["seen-already"]) },
    );
    expect(items.map((item) => item.presetDeal?.company_name)).toEqual(["Helcim"]);
  });

  it("looks back two weeks when no CMS ids were persisted so missed rows still ingest", () => {
    const items = listingItemsFromGalleryNewsRows(
      [
        row({ companyName: "Callosum", cmsId: "callosum", announcedAtIso: "2026-08-20T00:00:00.000Z" }),
        row({ companyName: "Veeda", cmsId: "veeda", announcedAtIso: "2026-08-19T00:00:00.000Z" }),
        row({
          companyName: "TooOld",
          cmsId: "too-old",
          announcedAtIso: "2026-07-01T00:00:00.000Z",
        }),
      ],
      { since: new Date("2026-08-21T00:00:00.000Z"), maxItems: 50 },
    );
    expect(GALLERY_EMPTY_CURSOR_LOOKBACK_DAYS).toBe(14);
    expect(items.map((item) => item.presetDeal?.company_name)).toEqual(["Callosum", "Veeda"]);
  });

  it("skips CMS ids already stored on the checkpoint", () => {
    const items = listingItemsFromGalleryNewsRows(
      [row({ companyName: "Helcim", cmsId: "helcim", announcedAtIso: "2026-08-21T00:00:00.000Z" })],
      {
        since: new Date("2026-08-21T00:00:00.000Z"),
        maxItems: 50,
        seenCmsIds: new Set(["helcim"]),
      },
    );
    expect(items).toEqual([]);
  });

  it("returns newest rows first", () => {
    const items = listingItemsFromGalleryNewsRows(
      [
        row({ companyName: "Older", cmsId: "older", announcedAtIso: "2026-08-19T00:00:00.000Z" }),
        row({ companyName: "Newer", cmsId: "newer", announcedAtIso: "2026-08-21T00:00:00.000Z" }),
      ],
      { since: null, maxItems: 50 },
    );
    expect(items.map((item) => item.presetDeal?.company_name)).toEqual(["Newer", "Older"]);
  });
});
