import { describe, expect, it } from "vitest";
import { buildVcFirmMatchIndex, resolveMatchedVcFirm } from "@/lib/fundingFeedEntityMatch";

describe("fundingFeedEntityMatch", () => {
  const index = buildVcFirmMatchIndex([
    {
      id: "a16z",
      name: "Andreessen Horowitz (a16z)",
      aliases: ["a16z"],
      logo_url: "https://example.com/a16z.png",
      website_url: "https://a16z.com",
    },
    {
      id: "threshold",
      name: "Threshold Ventures",
      aliases: null,
      logo_url: null,
      website_url: "https://threshold.vc",
    },
  ]);

  it("matches a parenthetical directory name from a short lead label", () => {
    const hit = resolveMatchedVcFirm("Andreessen Horowitz", index);
    expect(hit?.id).toBe("a16z");
    expect(hit?.websiteUrl).toBe("https://a16z.com");
  });

  it("matches the a16z alias", () => {
    expect(resolveMatchedVcFirm("a16z", index)?.id).toBe("a16z");
  });

  it("returns null when the lead is unknown", () => {
    expect(resolveMatchedVcFirm("Unknown", index)).toBeNull();
  });
});
