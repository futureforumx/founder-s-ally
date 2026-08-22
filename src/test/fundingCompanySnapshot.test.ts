import { describe, expect, it } from "vitest";
import { escapeIlike, snapshotFromOrganization, snapshotFromStartup } from "@/lib/fundingCompanySnapshot";

describe("fundingCompanySnapshot", () => {
  it("escapes ilike wildcards in company names", () => {
    expect(escapeIlike("100% Software_Co")).toBe("100\\% Software\\_Co");
  });

  it("formats organization HQ and description", () => {
    const snap = snapshotFromOrganization(
      {
        canonicalName: "Aligned Marketplace",
        city: "New York",
        state: "NY",
        country: "United States",
        description: "A healthcare marketplace for independent practices.",
        logoUrl: "https://example.com/logo.png",
      },
      "Fallback",
    );
    expect(snap.name).toBe("Aligned Marketplace");
    expect(snap.hqLine).toBe("New York, NY");
    expect(snap.description).toContain("healthcare marketplace");
    expect(snap.logoUrl).toBe("https://example.com/logo.png");
  });

  it("prefers startup short description and hq_* fields", () => {
    const snap = snapshotFromStartup(
      {
        company_name: "Astromech",
        hq_city: "Austin",
        hq_state: "TX",
        hq_country: "United States",
        description_short: "Robotics for warehouses.",
        description_long: "A much longer unused bio.",
      },
      "Fallback",
    );
    expect(snap.name).toBe("Astromech");
    expect(snap.hqLine).toBe("Austin, TX");
    expect(snap.description).toBe("Robotics for warehouses.");
  });
});
