import { describe, expect, it } from "vitest";
import { extractRecords, mapResponse, parseLocationString, shapeSkeleton, type MapContext } from "@/lib/alexandria/mappers";

const ctx = (entity: MapContext["entity"], trusted: string[] = []): MapContext => ({ entity, retrievedAt: "2026-10-26T00:00:00Z", trustedShapes: new Set(trusted) });

describe("response mappers", () => {
  it("maps documented Fireround company fields and converts USD millions", () => {
    const res = mapResponse(
      "fireround",
      "companies/profile",
      { id: "1", name: "Lumen Robotics", domain: "https://www.lumen.example", description: "Robots for warehouses.", sector: "Robotics", headquarters: "Austin, United States", total_raised_usd_millions: 12.5 },
      null,
      ctx("company"),
    );
    const byField = Object.fromEntries(res.facts.map((f) => [f.field, f]));
    expect(byField.total_raised_usd.value).toBe(12_500_000);
    expect(byField.total_raised_usd.shapeDocumented).toBe(true);
    expect(byField.domain.value).toBe("lumen.example");
    expect(byField.description_short.value).toBe("Robots for warehouses.");
    expect(byField.hq_city.shapeDocumented).toBe(false);
    expect(res.providerEntity).toMatchObject({ name: "Lumen Robotics", domain: "lumen.example" });
  });

  it("marks nested-object facts undocumented until the shape is trusted", () => {
    const data = { name: "Lumen", domain: "lumen.example", latest_round: { round: "Series A", date: "2026-03-01", amount_usd: 8_000_000 } };
    const untrusted = mapResponse("fireround", "companies/profile", data, null, ctx("company"));
    expect(untrusted.facts.find((f) => f.field === "last_round_type")!.shapeDocumented).toBe(false);
    const trusted = mapResponse("fireround", "companies/profile", data, null, ctx("company", ["fireround/companies/profile"]));
    expect(trusted.facts.find((f) => f.field === "last_round_type")!.shapeDocumented).toBe(true);
  });

  it("treats sector/stage activity as inferred (never a stated thesis)", () => {
    const res = mapResponse("fireround", "investors/profile", { name: "Northwind", domain: "northwind.example", sectors: [{ name: "Fintech" }], stages: [{ name: "Seed" }] }, null, ctx("firm"));
    const sector = res.facts.find((f) => f.field === "sector_focus")!;
    expect(sector.kind).toBe("inferred");
    expect(res.facts.find((f) => f.field === "stage_focus")!.kind).toBe("inferred");
  });

  it("extracts firm-level investment claims without attributing them to a person", () => {
    const res = mapResponse(
      "fireround",
      "investors/profile",
      { name: "Northwind", domain: "northwind.example", recent_rounds: [{ company_name: "Lumen", date: "2026-03-01", round: "Seed", role: "lead" }] },
      null,
      ctx("firm"),
    );
    expect(res.relationships).toHaveLength(1);
    expect(res.relationships[0]).toMatchObject({ kind: "FIRM_INVESTED_IN_COMPANY", companyName: "Lumen", role: "lead", shapeDocumented: false });
    expect(res.facts.find((f) => f.field === "most_recent_investment_date")!.value).toBe("2026-03-01");
  });

  it("never emits an email unless the provider returned one, and keeps it unverified without a status", () => {
    expect(mapResponse("fullenrich", "contacts/work-email", { contact_info: {} }, "results", ctx("investor")).facts).toHaveLength(0);
    const some = mapResponse("fullenrich", "contacts/work-email", { results: [{ contact_info: { most_probable_work_email: { email: "ada@northwind.example", status: "DELIVERABLE" } } }] }, "results", ctx("investor"));
    expect(some.facts[0]).toMatchObject({ field: "email", verification: "provider_verified", shapeDocumented: false });
  });

  it("is capture-only for Data Legion (no facts from an undocumented shape)", () => {
    const res = mapResponse("datalegion", "companies/enrich-base", { matches: [{ company: { name: "x" } }] }, "matches", ctx("company"));
    expect(res.facts).toEqual([]);
    expect(res.notes.join(" ")).toMatch(/capture-only/);
  });

  describe("malformed provider responses", () => {
    const cases: Array<[string, unknown]> = [
      ["null", null],
      ["string", "oops"],
      ["number", 7],
      ["empty array", []],
      ["array of junk", [1, "x", null]],
      ["empty object", {}],
      ["wrong field types", { name: 5, domain: { a: 1 }, description: ["x"], total_raised_usd_millions: "NaN", latest_round: "n/a", investors: "none", headquarters: 12 }],
    ];
    for (const [label, payload] of cases) {
      it(`does not throw or invent facts for: ${label}`, () => {
        for (const [provider, capability, key, entity] of [
          ["fireround", "companies/profile", null, "company"],
          ["fireround", "investors/profile", null, "firm"],
          ["fullenrich", "companies/lookup", "companies", "company"],
          ["fullenrich", "people/lookup", "people", "investor"],
          ["apollo", "people/match", "person", "investor"],
          ["people-data-labs", "company/enrich", null, "company"],
        ] as const) {
          const res = mapResponse(provider, capability, payload, key, ctx(entity));
          for (const f of res.facts) {
            expect(f.value).not.toBeNull();
            expect(f.value).not.toBeUndefined();
            expect(Number.isNaN(f.value as number)).toBe(false);
          }
        }
      });
    }

    it("returns no facts for an unknown capability", () => {
      const res = mapResponse("fireround", "made/up", { name: "x" }, null, ctx("company"));
      expect(res.facts).toEqual([]);
      expect(res.notes[0]).toMatch(/no mapper/);
    });
  });
});

describe("helpers", () => {
  it("unwraps records by contract key and tolerates already-unwrapped data", () => {
    expect(extractRecords({ data: [{ a: 1 }, 5] }, "data")).toEqual([{ a: 1 }]);
    expect(extractRecords({ a: 1 }, "data")).toEqual([{ a: 1 }]);
    expect(extractRecords([{ a: 1 }], null)).toEqual([{ a: 1 }]);
  });

  it("ignores one-part location strings (city vs country is ambiguous)", () => {
    expect(parseLocationString("Austin")).toBeNull();
    expect(parseLocationString("Austin, TX, United States")).toEqual({ city: "Austin", state: "TX", country: "United States" });
  });

  it("shape capture records keys and types but never values", () => {
    const skel = shapeSkeleton({ name: "Secret Person", email: "a@b.co", jobs: [{ title: "CEO", years: 3 }], nested: { phone: "555" } });
    const text = JSON.stringify(skel);
    expect(text).not.toMatch(/Secret|a@b\.co|CEO|555/);
    expect(skel).toEqual({ email: "string", jobs: [{ title: "string", years: "number" }], name: "string", nested: { phone: "string" } });
  });
  it("maps the captured Fireround investors/profile shape (stages as objects, nested amount, string company)", () => {
    const data = {
      id: "inv_1",
      name: "Example Capital",
      url: "https://example.test/inv_1",
      description: null,
      domain: null,
      headquarters: null,
      kind: null,
      sectors: [],
      stages: [{ stage: "Seed", count: 7 }, { stage: "Series A", count: 3 }],
      co_investors: [{ id: "c1", name: "Peer Partners", shared_rounds: 2 }],
      totals: { rounds_led: 2, rounds_co_led: 0, rounds_participated: 5, lead_share_usd_millions: 3 },
      recent_rounds: [
        {
          company: "Acme Robotics",
          company_domain: "acme.example",
          company_url: "https://acme.example",
          announced_on: "2026-03-01",
          stage: "Seed",
          stage_as_written: "seed round",
          role: "lead",
          lead_investors: ["Example Capital"],
          earlier_round: false,
          certainty: "high",
          sector: null,
          amount: { as_written: "$4M", usd_millions: 4 },
        },
      ],
    };
    const res = mapResponse("fireround", "investors/profile", data, null, ctx("firm"));
    const byField = Object.fromEntries(res.facts.map((f) => [f.field, f]));
    expect(byField.stage_focus.value).toEqual(["Seed", "Series A"]);
    expect(byField.co_investor_patterns.value).toEqual(["Peer Partners"]);
    expect(byField.most_recent_investment_date.value).toBe("2026-03-01");
    expect(byField.domain).toBeUndefined();
    expect(res.relationships[0]).toMatchObject({ companyName: "Acme Robotics", companyDomain: "acme.example", amountUsd: 4_000_000, role: "lead", announcedOn: "2026-03-01" });
  });
});
