import { describe, expect, it } from "vitest";
import {
  collectionFieldIdsByTitle,
  discoverFramerCmsChunkUrl,
  listFramerSiteModuleUrls,
  parseFramerCmsChunk,
  relatedCollectionModuleIds,
} from "@/lib/framerCmsChunk";
import { galleryRowsFromFundingTrackerCms } from "@/lib/startupsGalleryNews";

function u32(n: number): Uint8Array {
  return Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function keyVal(key: string, value: string): Uint8Array {
  const kb = new TextEncoder().encode(key);
  const vb = new TextEncoder().encode(value);
  return concat(u32(kb.length), kb, Uint8Array.from([0x0c]), u32(vb.length), vb);
}

describe("parseFramerCmsChunk", () => {
  it("reads length-prefixed string fields", () => {
    const chunk = concat(u32(1), Uint8Array.from([0x00, 0x02]), keyVal("id", "xvf81F7hy"), keyVal("IBYUGGBzg", "$20M"));
    const rows = parseFramerCmsChunk(chunk, ["IBYUGGBzg"]);
    expect(rows).toEqual([{ id: "xvf81F7hy", IBYUGGBzg: "$20M" }]);
  });
});

describe("Framer module discovery", () => {
  it("builds the CMS chunk URL from a collection module", () => {
    const js = `new URL(\`./c41Fybgm6-chunk-default-0.framercms\`,\`https://framerusercontent.com/modules/abc/def/c41Fybgm6.js\`)`;
    expect(discoverFramerCmsChunkUrl(js)).toBe(
      "https://framerusercontent.com/cms/abc/def/c41Fybgm6-chunk-default-0.framercms",
    );
  });

  it("lists site module URLs and related collection ids", () => {
    const html = `<link rel="modulepreload" href="https://framerusercontent.com/sites/eQ8/c41Fybgm6.aaa.mjs">`;
    expect(listFramerSiteModuleUrls(html)).toEqual([
      "https://framerusercontent.com/sites/eQ8/c41Fybgm6.aaa.mjs",
    ]);
    expect(relatedCollectionModuleIds("local-module:collection/Nykn2JMeY:default")).toEqual(["Nykn2JMeY"]);
    expect(collectionFieldIdsByTitle("EXtHbUF_V:{dataIdentifier:`x`,title:`Company`,type:p.CollectionReference}")).toEqual({
      Company: "EXtHbUF_V",
    });
  });
});

describe("galleryRowsFromFundingTrackerCms", () => {
  it("joins company / round / lead refs onto listing rows", () => {
    const rows = galleryRowsFromFundingTrackerCms(
      [
        {
          id: "row1",
          EXtHbUF_V: "co1",
          IBYUGGBzg: "$20M",
          S4Xm2uPYp: "rd1",
          Bf0SKaUX9: ["inv1"],
          XuwjYFc1x: "2026-08-21T00:00:00.000Z",
          esRzsd7vq: "https://example.com/source",
          JcWSyTCLL: "astromech-raises-20m-seed",
        },
      ],
      {
        Company: "EXtHbUF_V",
        "Amount Raised": "IBYUGGBzg",
        Round: "S4Xm2uPYp",
        "Lead Investor": "Bf0SKaUX9",
        "Announcement Date": "XuwjYFc1x",
        "Source Link": "esRzsd7vq",
        Slug: "JcWSyTCLL",
      },
      {
        companies: new Map([["co1", { name: "Astromech", slug: "astromech", logoUrl: null }]]),
        stages: new Map([["rd1", "Seed"]]),
        investors: new Map([["inv1", "Peak 6"]]),
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cmsId: "row1",
      companyName: "Astromech",
      amountRaw: "$20M",
      roundTypeRaw: "Seed",
      leadInvestor: "Peak 6",
      sourceUrl: "https://example.com/source",
      companySlug: "astromech",
    });
  });
});
