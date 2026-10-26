import { describe, expect, it } from "vitest";
import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, INFERRED_CAP, UNDOCUMENTED_SHAPE_CAP, scoreFact } from "@/lib/alexandria/confidence";
import { decideFields, type DecideContext } from "@/lib/alexandria/decide";
import { ENTITY_SPECS } from "@/lib/alexandria/fieldRegistry";
import type { Fact } from "@/lib/alexandria/types";

const fact = (over: Partial<Fact> & Pick<Fact, "field" | "value">): Fact => ({
  provider: "fireround",
  capability: "companies/profile",
  kind: "explicit",
  verification: "provider_reported",
  shapeDocumented: true,
  retrievedAt: "2026-10-26T00:00:00Z",
  identityScore: 0.97,
  ...over,
});

const ctxFor = (entity: keyof typeof ENTITY_SPECS, row: Record<string, unknown>, over: Partial<DecideContext> = {}): DecideContext => ({
  spec: ENTITY_SPECS[entity],
  row,
  identityScore: 0.97,
  provenance: {},
  allowContactLookups: false,
  forceRefresh: false,
  refreshableFields: new Set(),
  ...over,
});

describe("confidence thresholds", () => {
  const base = { provider: "fireround", verification: "provider_reported" as const, kind: "explicit" as const, shapeDocumented: true, providerLikelihood: null };

  it("scores documented, verified-identity provider facts as high", () => {
    const s = scoreFact({ fact: base, identityScore: 0.97, corroboratingProviders: 1 });
    expect(s.score).toBeGreaterThanOrEqual(CONFIDENCE_HIGH);
    expect(s.label).toBe("high");
  });

  it("caps undocumented nested shapes below high until corroborated by a second provider", () => {
    const single = scoreFact({ fact: { ...base, shapeDocumented: false }, identityScore: 0.99, corroboratingProviders: 1 });
    expect(single.score).toBeLessThanOrEqual(UNDOCUMENTED_SHAPE_CAP);
    expect(single.label).toBe("medium");
    const both = scoreFact({ fact: { ...base, shapeDocumented: false }, identityScore: 0.99, corroboratingProviders: 2 });
    expect(both.label).toBe("high");
  });

  it("never lets inferred facts reach high, even when corroborated", () => {
    const s = scoreFact({ fact: { ...base, kind: "inferred" }, identityScore: 0.99, corroboratingProviders: 3 });
    expect(s.score).toBeLessThanOrEqual(INFERRED_CAP);
    expect(s.label).not.toBe("high");
  });

  it("scales by identity strength and zeroes unconfirmed identity", () => {
    const strong = scoreFact({ fact: base, identityScore: 0.97, corroboratingProviders: 1 }).score;
    const medium = scoreFact({ fact: base, identityScore: 0.88, corroboratingProviders: 1 }).score;
    const weak = scoreFact({ fact: base, identityScore: 0.7, corroboratingProviders: 1 });
    expect(medium).toBeLessThan(strong);
    expect(weak.label).toBe("low");
  });

  it("derived facts rank below provider-reported ones", () => {
    const reported = scoreFact({ fact: base, identityScore: 0.97, corroboratingProviders: 1 }).score;
    const derived = scoreFact({ fact: { ...base, verification: "derived" }, identityScore: 0.97, corroboratingProviders: 1 }).score;
    expect(derived).toBeLessThan(reported);
    expect(derived).toBeGreaterThanOrEqual(CONFIDENCE_MEDIUM);
  });
});

describe("safe update rules", () => {
  it("fills missing values when confidence is high", () => {
    const [d] = decideFields([fact({ field: "description_long", value: "Robots for warehouses." })], ctxFor("company", { description_long: null }));
    expect(d).toMatchObject({ action: "apply", reason: "fill_missing", after: "Robots for warehouses." });
  });

  it("queues medium-confidence facts for review instead of applying", () => {
    const [d] = decideFields([fact({ field: "hq_city", value: "Austin", shapeDocumented: false })], ctxFor("company", { hq_city: null }));
    expect(d.action).toBe("review");
  });

  it("drops low-confidence facts", () => {
    const [d] = decideFields([fact({ field: "hq_city", value: "Austin", identityScore: 0.5 })], ctxFor("company", { hq_city: null }));
    expect(d.action).toBe("skip");
  });

  it("never applies inferred values, only queues them", () => {
    const [d] = decideFields([fact({ field: "investment_themes", value: ["AI"], kind: "inferred", verification: "derived" })], ctxFor("firm", { investment_themes: null }));
    expect(d.action).toBe("review");
    expect(d.reason).toMatch(/inferred_not_applied/);
  });

  it("never writes enum-constrained columns automatically", () => {
    const [d] = decideFields([fact({ field: "sector", value: "Robotics" })], ctxFor("company", { sector: null }));
    expect(d.action).toBe("review");
    expect(d.reason).toMatch(/enum_column_review_only/);
  });

  it("preserves manually curated values (conflict goes to review)", () => {
    const [d] = decideFields(
      [fact({ field: "description_long", value: "Provider text" })],
      ctxFor("company", { description_long: "Hand written" }, { provenance: { description_long: { sourcePlatform: "manual_admin_edit", confidenceScore: 1, scrapedAt: null } } }),
    );
    expect(d.action).toBe("review");
    expect(d.reason).toMatch(/manual_value_protected/);
  });

  it("treats an unattributed existing value as protected (no overwrite)", () => {
    const [d] = decideFields([fact({ field: "description_long", value: "Provider text" })], ctxFor("company", { description_long: "Existing" }));
    expect(d.action).toBe("review");
  });

  it("skips identical values", () => {
    const [d] = decideFields([fact({ field: "hq_city", value: "austin" })], ctxFor("company", { hq_city: "Austin" }));
    expect(d.action).toBe("skip");
    expect(d.reason).toBe("identical");
  });

  it("merges multi-value attributes with canonical dedupe and never removes entries", () => {
    const [d] = decideFields([fact({ field: "tech_stack", value: ["react", "Python", "go"], provider: "fullenrich", capability: "companies/lookup" })], ctxFor("company", { tech_stack: ["Python", "Rust"] }));
    expect(d.action).toBe("apply");
    expect(d.after).toEqual(["Python", "Rust", "react", "go"]);
  });

  it("accepts a newer verified round date as a current-state correction", () => {
    const d = decideFields([fact({ field: "last_round_date", value: "2026-03-01" })], ctxFor("company", { last_round_date: "2025-01-15" }));
    expect(d[0]).toMatchObject({ action: "apply", reason: expect.stringMatching(/current_state_correction/) });
  });

  it("never moves a round date backwards", () => {
    const d = decideFields([fact({ field: "last_round_date", value: "2023-03-01" })], ctxFor("company", { last_round_date: "2025-01-15" }));
    expect(d[0].action).toBe("review");
  });

  it("only replaces round details when the same batch advances the round date", () => {
    const stale = decideFields(
      [fact({ field: "last_round_type", value: "Seed" }), fact({ field: "last_round_date", value: "2023-03-01" })],
      ctxFor("company", { last_round_type: "Series A", last_round_date: "2025-01-15" }),
    );
    expect(stale.find((x) => x.field === "last_round_type")!.action).not.toBe("apply");
    const fresh = decideFields(
      [fact({ field: "last_round_type", value: "Series B" }), fact({ field: "last_round_date", value: "2026-03-01" })],
      ctxFor("company", { last_round_type: "Series A", last_round_date: "2025-01-15" }),
    );
    expect(fresh.find((x) => x.field === "last_round_type")!.action).toBe("apply");
  });

  it("replaces a lower-confidence automated value only when more authoritative and stale", () => {
    const prov = { hq_city: { sourcePlatform: "alexandria:fullenrich", confidenceScore: 0.6, scrapedAt: null } };
    const d = decideFields([fact({ field: "hq_city", value: "Denver" })], ctxFor("company", { hq_city: "Austin" }, { provenance: prov, refreshableFields: new Set(["hq_city"]) }));
    expect(d[0].action).toBe("apply");
    const notStale = decideFields([fact({ field: "hq_city", value: "Denver" })], ctxFor("company", { hq_city: "Austin" }, { provenance: prov }));
    expect(notStale[0].action).toBe("review");
  });

  it("gates contact fields behind explicit authorisation", () => {
    const f = fact({ field: "email", value: "ada@northwind.example", provider: "fullenrich", capability: "contacts/work-email", verification: "provider_verified" });
    expect(decideFields([f], ctxFor("investor", { email: null }))[0].action).toBe("skip");
    expect(decideFields([f], ctxFor("investor", { email: null }, { allowContactLookups: true }))[0].action).toBe("apply");
  });

  it("rejects malformed provider values instead of writing them", () => {
    const d = decideFields(
      [fact({ field: "founded_year", value: 1492 }), fact({ field: "company_url", value: "javascript:alert(1)" }), fact({ field: "headcount", value: "many" }), fact({ field: "email", value: "not-an-email", provider: "fullenrich" })],
      ctxFor("company", { founded_year: null, company_url: null, headcount: null }, { allowContactLookups: true }),
    );
    expect(d.every((x) => x.action === "skip")).toBe(true);
  });

  it("uses corroboration across providers to lift undocumented shapes to apply", () => {
    const facts = [
      fact({ field: "hq_city", value: "Austin", shapeDocumented: false }),
      fact({ field: "hq_city", value: "Austin", shapeDocumented: false, provider: "fullenrich", capability: "companies/lookup" }),
    ];
    expect(decideFields(facts, ctxFor("company", { hq_city: null }))[0].action).toBe("apply");
  });

  it("lets an authorised force-refresh replace automated (never manual) values", () => {
    const prov = { hq_city: { sourcePlatform: "alexandria:fireround", confidenceScore: 0.99, scrapedAt: null } };
    const d = decideFields([fact({ field: "hq_city", value: "Denver" })], ctxFor("company", { hq_city: "Austin" }, { provenance: prov, forceRefresh: true }));
    expect(d[0].action).toBe("apply");
    const manual = decideFields([fact({ field: "hq_city", value: "Denver" })], ctxFor("company", { hq_city: "Austin" }, { provenance: { hq_city: { sourcePlatform: "manual", confidenceScore: 1, scrapedAt: null } }, forceRefresh: true }));
    expect(manual[0].action).toBe("review");
  });
});
