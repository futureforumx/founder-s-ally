import { describe, expect, it } from "vitest";
import {
  extractMetricsFromDeckText,
  mergeExtractedMetrics,
  metricsFromAuditResponse,
  metricsPrefillPatch,
} from "@/components/data-room/deckMetricsExtraction";
import { EMPTY_METRICS } from "@/hooks/useCompanyMetrics";

/** Shape of the pdf.js text fallback: slide markers, one label/value pair per line. */
const SLIDE_DECK = `[Slide 01]
Northwind — Seed round

[Slide 02]
Team
Ana Ruiz, CEO — eight years leading payments infrastructure at Stripe and Adyen.
Dev Patel, CTO — built the risk engine at Marqeta.
Headcount: 14

[Slide 03]
Market
TAM $12.4B
SAM: $3.1 billion
SOM $420m

[Slide 04]
Traction
12,000 MAU
NRR of 118%
Monthly churn 2.4%
Burn multiple: 1.4x

[Slide 05]
Unit economics
CAC $250
LTV $5,400
LTV:CAC = 21.6x
CAC payback 6 months

[Slide 06]
Financials
Gross margin 78%
Monthly burn $85k/mo
Runway: 18 months
Cash on hand $1.4m
Total debt $250,000
`;

describe("extractMetricsFromDeckText", () => {
  const metrics = extractMetricsFromDeckText(SLIDE_DECK);

  it("reads market sizing written with symbols, words, and suffixes", () => {
    expect(metrics.tam).toBe("12,400,000,000");
    expect(metrics.sam).toBe("3,100,000,000");
    expect(metrics.som).toBe("420,000,000");
  });

  it("reads traction and unit economics in the units each field stores", () => {
    expect(metrics.activeUsers).toBe("12,000");
    expect(metrics.activeUsersMode).toBe("mau");
    expect(metrics.nrr).toBe("118");
    expect(metrics.churnRate).toBe("2.4");
    expect(metrics.burnMultiple).toBe("1.4");
    expect(metrics.cac).toBe("250");
    expect(metrics.ltv).toBe("5,400");
    expect(metrics.cacPaybackDays).toBe("180");
  });

  it("reads financial health, converting runway and burn to the stored unit", () => {
    expect(metrics.grossMargin).toBe("78");
    expect(metrics.monthlyBurnRate).toBe("85,000");
    expect(metrics.runway).toBe("18");
    expect(metrics.runwayUnit).toBe("months");
    expect(metrics.cashOnHand).toBe("1,400,000");
    expect(metrics.totalDebt).toBe("250,000");
  });

  it("summarises the team slide into the background field", () => {
    expect(metrics.headcount).toBe("14");
    expect(metrics.background).toContain("Ana Ruiz, CEO");
    expect(metrics.background).toContain("Dev Patel, CTO");
    // Figures with a field of their own stay out of the bio summary.
    expect(metrics.background).not.toContain("Headcount");
  });

  it("never reads the LTV:CAC ratio as a dollar figure", () => {
    expect(metrics.cac).not.toBe("22");
    expect(metrics.ltv).not.toBe("22");
  });

  it("handles prose phrasing, value-first labels, and annual figures", () => {
    const prose = extractMetricsFromDeckText(
      `We are a team of 9 serving a $4 billion total addressable market. ` +
        `The product has 45k monthly active users and gross margins of 81%. ` +
        `Our annual burn is $1.2M, leaving 24 months of runway, with $2.4M in the bank. ` +
        `Payback sits at 90 days and net dollar retention is 134%.`,
    );
    expect(prose.headcount).toBe("9");
    expect(prose.tam).toBe("4,000,000,000");
    expect(prose.activeUsers).toBe("45,000");
    expect(prose.grossMargin).toBe("81");
    expect(prose.monthlyBurnRate).toBe("100,000");
    expect(prose.runway).toBe("24");
    expect(prose.cashOnHand).toBe("2,400,000");
    expect(prose.cacPaybackDays).toBe("90");
    expect(prose.nrr).toBe("134");
  });

  it("tracks the DAU toggle when the deck only reports daily actives", () => {
    const daily = extractMetricsFromDeckText("Engagement\nDAU 3,200\nWe grew fast in 2026.");
    expect(daily.activeUsers).toBe("3,200");
    expect(daily.activeUsersMode).toBe("dau");
  });

  it("stores a runway quoted in days on the days toggle", () => {
    const days = extractMetricsFromDeckText("Runway: 540 days");
    expect(days.runway).toBe("540");
    expect(days.runwayUnit).toBe("days");
  });

  it("leaves fields out when the deck only mentions a topic in passing", () => {
    const vague = extractMetricsFromDeckText(
      "Our TAM slide is slide 4. Churn is the metric we care about most. We will cut burn in 2027.",
    );
    expect(vague.tam).toBeUndefined();
    expect(vague.churnRate).toBeUndefined();
    expect(vague.monthlyBurnRate).toBeUndefined();
  });

  it("returns nothing for a deck with no numbers", () => {
    expect(extractMetricsFromDeckText("We are building the future of logistics.")).toEqual({});
  });
});

describe("metricsFromAuditResponse", () => {
  it("normalises the audit function's numbers into field formats", () => {
    expect(
      metricsFromAuditResponse({
        tam: 8_000_000_000,
        nrr: 112,
        activeUsers: 9400,
        activeUsersMode: "dau",
        runway: 14,
        runwayUnit: "months",
        cacPaybackDays: 210,
      }),
    ).toEqual({
      tam: "8,000,000,000",
      nrr: "112",
      activeUsers: "9,400",
      activeUsersMode: "dau",
      runway: "14",
      runwayUnit: "months",
      cacPaybackDays: "210",
    });
  });

  it("still parses values that arrive as formatted strings", () => {
    const metrics = metricsFromAuditResponse({ tam: "$12.4B", grossMargin: "72%", cac: "1,250" });
    expect(metrics.tam).toBe("12,400,000,000");
    expect(metrics.grossMargin).toBe("72");
    expect(metrics.cac).toBe("1,250");
  });

  it("ignores junk and missing fields", () => {
    expect(metricsFromAuditResponse({ tam: "unknown", ltv: null, sam: "n/a" })).toEqual({});
    expect(metricsFromAuditResponse(null)).toEqual({});
  });
});

describe("mergeExtractedMetrics", () => {
  it("prefers the primary source and fills its gaps from the secondary", () => {
    const merged = mergeExtractedMetrics({ tam: "1,000" }, { tam: "2,000", sam: "500" });
    expect(merged).toEqual({ tam: "1,000", sam: "500" });
  });

  it("keeps a unit with the value it describes", () => {
    const merged = mergeExtractedMetrics(
      { activeUsers: "100", activeUsersMode: "mau" },
      { activeUsers: "90", activeUsersMode: "dau", runway: "12", runwayUnit: "months" },
    );
    expect(merged.activeUsersMode).toBe("mau");
    expect(merged.runway).toBe("12");
    expect(merged.runwayUnit).toBe("months");
  });
});

describe("metricsPrefillPatch", () => {
  it("only writes fields the founder left blank", () => {
    const { patch, labels } = metricsPrefillPatch(
      { ...EMPTY_METRICS, tam: "9,000,000,000" },
      { tam: "1,000,000,000", sam: "400,000,000" },
    );
    expect(patch).toEqual({ sam: "400,000,000" });
    expect(labels).toEqual(["SAM"]);
  });

  it("carries the unit toggle only when its value is being written", () => {
    expect(
      metricsPrefillPatch(EMPTY_METRICS, { runway: "540", runwayUnit: "days" }).patch,
    ).toEqual({ runway: "540", runwayUnit: "days" });

    expect(
      metricsPrefillPatch({ ...EMPTY_METRICS, runway: "18" }, { runway: "540", runwayUnit: "days" })
        .patch,
    ).toEqual({});
  });
});
