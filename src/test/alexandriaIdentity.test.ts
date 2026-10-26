import { describe, expect, it } from "vitest";
import { ENTITY_SPECS } from "@/lib/alexandria/fieldRegistry";
import { duplicateGroups, flagDuplicateIdentities, identityFromRow, resolveIdentity } from "@/lib/alexandria/identity";

const firm = (row: Record<string, unknown>) => identityFromRow(ENTITY_SPECS.firm, { id: "f", ...row });
const investor = (row: Record<string, unknown>, parent: Record<string, unknown> | null) =>
  identityFromRow(ENTITY_SPECS.investor, { id: "i", ...row }, parent);

describe("organisation identity resolution", () => {
  it("matches on official domain first", () => {
    const out = resolveIdentity(firm({ firm_name: "Northwind Ventures", domain: "northwind.example" }), { name: "Northwind Ventures", domain: "https://www.northwind.example/about" });
    expect(out.kind).toBe("match");
    expect(out.kind === "match" && out.confidence).toBe("high");
  });

  it("does not auto-match on a bare name (ambiguous, goes to review)", () => {
    const out = resolveIdentity(firm({ firm_name: "Northwind Ventures" }), { name: "Northwind Ventures", domain: "northwind.example" });
    expect(out.kind).toBe("ambiguous");
  });

  it("accepts a name match only with geographic corroboration", () => {
    const out = resolveIdentity(firm({ firm_name: "Northwind Ventures", hq_city: "Austin", hq_country: "United States" }), { name: "Northwind Ventures", city: "Austin", country: "US" });
    expect(out.kind).toBe("match");
  });

  it("rejects a conflicting domain even when the names agree (false-positive guard)", () => {
    const out = resolveIdentity(firm({ firm_name: "Northwind Ventures", domain: "northwind.example" }), { name: "Northwind Ventures", domain: "northwind.io" });
    expect(out.kind).not.toBe("match");
  });

  it("treats a same-domain result with a different name as ambiguous", () => {
    const out = resolveIdentity(firm({ firm_name: "Northwind Ventures", domain: "northwind.example" }), { name: "Zebra Holdings", domain: "northwind.example" });
    expect(out.kind).toBe("ambiguous");
  });

  it("returns no_match when nothing links the records", () => {
    const out = resolveIdentity(firm({ firm_name: "Northwind Ventures", domain: "northwind.example" }), { name: "Zebra Holdings", domain: "zebra.example" });
    expect(out.kind).toBe("no_match");
  });

  it("ignores aggregator domains as identity evidence", () => {
    const id = firm({ firm_name: "Northwind Ventures", website_url: "https://www.crunchbase.com/organization/northwind" });
    expect(id.domain).toBeNull();
  });

  it("downgrades low provider likelihood", () => {
    const out = resolveIdentity(firm({ firm_name: "Northwind Ventures", domain: "northwind.example" }), { name: "Northwind Ventures", domain: "northwind.example", likelihood: 0.3 });
    expect(out.kind).not.toBe("match");
  });
});

describe("person identity resolution", () => {
  const parent = { firm_name: "Northwind Ventures", domain: "northwind.example" };

  it("matches on LinkedIn URL first", () => {
    const id = investor({ full_name: "Ada Example", linkedin_url: "https://linkedin.com/in/ada-example/" }, parent);
    const out = resolveIdentity(id, { name: "Ada Example", linkedin: "https://www.linkedin.com/in/Ada-Example" });
    expect(out.kind).toBe("match");
  });

  it("matches on full name plus verified employer when no stable id exists", () => {
    const id = investor({ full_name: "Ada Example" }, parent);
    const out = resolveIdentity(id, { name: "Ada Example", employerName: "Northwind Ventures", employerDomain: "northwind.example" });
    expect(out.kind).toBe("match");
  });

  it("sends name-only matches to review (common-name false positives)", () => {
    const id = investor({ full_name: "Ada Example" }, parent);
    expect(resolveIdentity(id, { name: "Ada Example" }).kind).toBe("ambiguous");
  });

  it("does not treat a former employer as current employment", () => {
    const id = investor({ full_name: "Ada Example" }, parent);
    const out = resolveIdentity(id, { name: "Ada Example", employerName: "Other Capital", pastEmployerNames: ["Northwind Ventures"] });
    expect(out.kind).toBe("ambiguous");
  });

  it("refuses a LinkedIn match whose name contradicts", () => {
    const id = investor({ full_name: "Ada Example", linkedin_url: "https://www.linkedin.com/in/ada-example" }, parent);
    const out = resolveIdentity(id, { name: "Quentin Different", linkedin: "https://www.linkedin.com/in/ada-example" });
    expect(out.kind).not.toBe("match");
  });

  it("refuses a conflicting LinkedIn profile", () => {
    const id = investor({ full_name: "Ada Example", linkedin_url: "https://www.linkedin.com/in/ada-example" }, parent);
    const out = resolveIdentity(id, { name: "Ada Example", linkedin: "https://www.linkedin.com/in/ada-example-2", employerName: "Northwind Ventures" });
    expect(out.kind).not.toBe("match");
  });

  it("handles nickname first names", () => {
    const id = investor({ full_name: "Bob Example" }, parent);
    const out = resolveIdentity(id, { name: "Robert Example", employerName: "Northwind Ventures" });
    expect(out.kind).toBe("match");
  });
});

describe("duplicate handling", () => {
  it("flags existing duplicates so they are never auto-enriched or merged", () => {
    const a = firm({ id: "a", firm_name: "Cedar Ventures", domain: "cedar.example" });
    const b = { ...firm({ firm_name: "Cedar Ventures LLC", domain: "cedar.example" }), id: "b" };
    const c = { ...firm({ firm_name: "Solo Capital", domain: "solo.example" }), id: "c" };
    flagDuplicateIdentities([a, b, c]);
    expect(a.duplicateOfExisting).toBe(true);
    expect(b.duplicateOfExisting).toBe(true);
    expect(c.duplicateOfExisting).toBe(false);
    expect(resolveIdentity(a, { name: "Cedar Ventures", domain: "cedar.example" }).kind).toBe("ambiguous");
    expect(duplicateGroups([a, b, c])[0].ids.sort()).toEqual(["a", "b"]);
  });
});
