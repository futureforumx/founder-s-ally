import { describe, expect, it } from "vitest";
import {
  loadDemoFirmDirectory,
  loadDemoFreshCapital,
  loadDemoMarketCatalog,
  loadDemoRecordUpdates,
  loadDemoReferralCodes,
  loadDemoReviews,
  loadDemoSyncLogs,
} from "@/pages/test-admin/dummyPlatform";

describe("dummy admin platform", () => {
  it("builds a busy investor directory that matches analytics deep links", () => {
    const directory = loadDemoFirmDirectory();
    const names = new Set(directory.firms.map((firm) => firm.id));

    expect(directory.firms.length).toBeGreaterThan(30);
    expect(directory.people.length).toBeGreaterThan(40);
    expect(names.has("demo-sequoia")).toBe(true);
    expect(names.has("demo-a16z")).toBe(true);
    expect(directory.people.some((person) => person.id === "demo-botha" && person.firm_id === "demo-sequoia")).toBe(true);
    expect(directory.funds.length).toBeGreaterThan(10);
    expect(directory.portfolio.length).toBeGreaterThan(20);
    expect(directory.firms.filter((firm) => firm.ready_for_live).length).toBeGreaterThan(20);
  });

  it("builds market, capital, review, and referral activity", () => {
    const directory = loadDemoFirmDirectory();
    const catalog = loadDemoMarketCatalog();
    const fresh = loadDemoFreshCapital(directory);
    const reviews = loadDemoReviews(directory);
    const codes = loadDemoReferralCodes();
    const updates = loadDemoRecordUpdates(directory, catalog);

    expect(catalog.companies.length).toBeGreaterThan(30);
    expect(catalog.founders.length).toBeGreaterThan(20);
    expect(catalog.operators.length).toBeGreaterThan(15);
    expect(fresh.funds.length).toBeGreaterThan(15);
    expect(fresh.deals.length).toBeGreaterThan(30);
    expect(reviews.filter((row) => !row.is_draft).length).toBeGreaterThan(30);
    expect(codes.reduce((sum, code) => sum + code.times_used, 0)).toBeGreaterThan(1_000);
    expect(updates.length).toBeGreaterThan(40);
    expect(updates.some((row) => row.kind === "vc_firm" && row.recordId === "demo-sequoia")).toBe(true);
    expect(loadDemoSyncLogs().filter((log) => log.status === "SUCCESS").length).toBeGreaterThan(20);
  });
});
