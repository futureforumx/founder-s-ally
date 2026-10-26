import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_REFRESH_DAYS, ENTITY_SPECS, completenessScore, missingFields, refreshIntervalDays, registryColumns, staleGroups } from "@/lib/alexandria/fieldRegistry";
import { ENTITY_TYPES } from "@/lib/alexandria/types";

const typesSource = readFileSync(join(process.cwd(), "src/integrations/supabase/types.ts"), "utf8");

function rowColumns(table: string): Set<string> {
  const start = typesSource.indexOf(`      ${table}: {\n        Row: {`);
  if (start < 0) return new Set();
  const end = typesSource.indexOf("        Insert: {", start);
  const block = typesSource.slice(start, end);
  return new Set([...block.matchAll(/^\s{10}([a-z_0-9]+)\??:/gm)].map((m) => m[1]));
}

describe("field registry matches the real schema", () => {
  for (const entity of ENTITY_TYPES) {
    it(`${entity}: every mapped column exists on ${ENTITY_SPECS[entity].table}`, () => {
      const spec = ENTITY_SPECS[entity];
      const columns = rowColumns(spec.table);
      expect(columns.size, `table ${spec.table} not found in generated types`).toBeGreaterThan(0);
      const missing = registryColumns(entity).filter((c) => !columns.has(c));
      expect(missing).toEqual([]);
    });

    it(`${entity}: parent join columns exist`, () => {
      const p = ENTITY_SPECS[entity].parent;
      if (!p) return;
      const parentCols = rowColumns(p.table);
      for (const c of ["id", p.nameColumn, p.domainColumn, p.websiteColumn].filter(Boolean) as string[]) expect(parentCols.has(c)).toBe(true);
    });
  }

  it("never maps contact columns as completeness-neutral public fields", () => {
    for (const entity of ENTITY_TYPES) {
      for (const f of ENTITY_SPECS[entity].fields) if (f.column === "email") expect(f.contact).toBe(true);
    }
  });

  it("marks enum-constrained and substantiation-sensitive columns review-only", () => {
    const company = Object.fromEntries(ENTITY_SPECS.company.fields.map((f) => [f.field, f]));
    for (const k of ["sector", "stage", "business_model"]) expect(company[k].reviewOnly).toBe(true);
    const founder = Object.fromEntries(ENTITY_SPECS.founder.fields.map((f) => [f.field, f]));
    for (const k of ["has_prior_exit", "is_repeat_founder", "prior_exits"]) expect(founder[k].reviewOnly).toBe(true);
  });
});

describe("completeness and refresh policy", () => {
  it("computes completeness as the share of populated metric fields", () => {
    expect(completenessScore("operator", {})).toBe(0);
    const row = { title: "Partner", bio: "x" };
    const total = ENTITY_SPECS.operator.fields.filter((f) => f.completeness).length;
    expect(completenessScore("operator", row)).toBe(Math.round((2 / total) * 1000) / 10);
    expect(missingFields("operator", row).some((f) => f.field === "title")).toBe(false);
  });

  it("uses the required refresh cadence", () => {
    expect(DEFAULT_REFRESH_DAYS.funding_deals).toBe(1);
    expect(DEFAULT_REFRESH_DAYS.roles).toBe(30);
    expect(DEFAULT_REFRESH_DAYS.criteria).toBeGreaterThanOrEqual(30);
    expect(DEFAULT_REFRESH_DAYS.criteria).toBeLessThanOrEqual(60);
    expect(DEFAULT_REFRESH_DAYS.growth).toBe(30);
    expect(DEFAULT_REFRESH_DAYS.profiles).toBeGreaterThanOrEqual(60);
    expect(DEFAULT_REFRESH_DAYS.profiles).toBeLessThanOrEqual(90);
    expect(DEFAULT_REFRESH_DAYS.firmographics).toBeGreaterThanOrEqual(90);
    expect(DEFAULT_REFRESH_DAYS.firmographics).toBeLessThanOrEqual(180);
  });

  it("allows env overrides and ignores invalid ones", () => {
    expect(refreshIntervalDays("roles", { ALEXANDRIA_REFRESH_DAYS_ROLES: "14" })).toBe(14);
    expect(refreshIntervalDays("roles", { ALEXANDRIA_REFRESH_DAYS_ROLES: "-3" })).toBe(30);
    expect(refreshIntervalDays("roles", { ALEXANDRIA_REFRESH_DAYS_ROLES: "abc" })).toBe(30);
  });

  it("reports groups as stale only after their own interval", () => {
    const now = new Date("2026-10-26T00:00:00Z");
    const fresh = { funding_deals: "2026-10-25T20:00:00Z", roles: "2026-10-01T00:00:00Z", firmographics: "2026-08-01T00:00:00Z", criteria: "2026-10-20T00:00:00Z", growth: "2026-10-20T00:00:00Z", profiles: "2026-10-20T00:00:00Z" };
    expect(staleGroups("firm", fresh, now, {})).toEqual([]);
    const stale = staleGroups("firm", { ...fresh, funding_deals: "2026-10-24T00:00:00Z", roles: "2026-08-01T00:00:00Z" }, now, {});
    expect(stale).toContain("funding_deals");
    expect(staleGroups("firm", null, now, {}).length).toBeGreaterThan(3);
  });
});
