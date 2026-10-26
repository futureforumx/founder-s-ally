import type { BudgetGuard } from "./budget";
import { BudgetExceededError } from "./budget";
import type { LedgerPort } from "./executor";
import { deterministicUuid } from "./stable";
import { normalizeUrl } from "./normalize";
import type { Fact } from "./types";

/**
 * Last-resort first-party tier: read the entity's own website metadata with Firecrawl scrape (1 credit
 * per page on the standard plan). Only the page's declared meta description is used, which is the
 * entity's own statement. Thesis, criteria and portfolio extraction stays with the existing
 * scripts/enrich-firm-focus.ts and portfolio pipelines; this tier never infers a thesis.
 */
export interface WebScrapePort {
  scrape(url: string): Promise<{ description: string | null; finalUrl: string | null; credits: number }>;
}

export const WEB_SCRAPE_CREDITS = 1;

export interface WebResearchInput {
  runId: string;
  entityType: string;
  entityId: string;
  entity: "firm" | "company";
  websiteUrl: string | null;
  port: WebScrapePort | null;
  budget: BudgetGuard;
  ledger: LedgerPort;
  now: Date;
}

export async function webResearch(input: WebResearchInput): Promise<{ facts: Fact[]; credits: number; note: string }> {
  const url = normalizeUrl(input.websiteUrl);
  if (!url) return { facts: [], credits: 0, note: "no website to read" };
  if (!input.port) return { facts: [], credits: 0, note: "web research not authorized" };

  const requestId = deterministicUuid(`${input.runId}\n${input.entityType}:${input.entityId}\nweb/scrape\n${url}`);
  let reservation;
  try {
    reservation = input.budget.reserve("web", WEB_SCRAPE_CREDITS, `${input.entityType}:${input.entityId}`);
  } catch (err) {
    if (err instanceof BudgetExceededError) return { facts: [], credits: 0, note: `budget: ${err.message}` };
    throw err;
  }
  const base = {
    requestId,
    runId: input.runId,
    entityType: input.entityType,
    entityId: input.entityId,
    provider: "web",
    capability: "scrape",
    creditsEstimated: WEB_SCRAPE_CREDITS,
  };
  await input.ledger.upsertLedger({ ...base, status: "reserved", attemptCount: 0 });
  try {
    const res = await input.port.scrape(url);
    input.budget.commit(reservation, res.credits);
    await input.ledger.upsertLedger({ ...base, creditsActual: res.credits, status: res.credits > 0 ? "charged" : "no_charge", attemptCount: 1 });
    const description = res.description?.trim();
    if (!description || description.length < 40) return { facts: [], credits: res.credits, note: "no usable meta description" };
    const fact = (field: string): Fact => ({
      field,
      value: description,
      provider: "web",
      capability: "scrape",
      kind: "explicit",
      verification: "first_party",
      shapeDocumented: true,
      sourceUrl: res.finalUrl ?? url,
      evidence: "page meta description",
      retrievedAt: input.now.toISOString(),
    });
    const facts = input.entity === "firm" ? [fact("description")] : [fact("description_long"), ...(description.length <= 280 ? [fact("description_short")] : [])];
    return { facts, credits: res.credits, note: "first-party meta description" };
  } catch (err) {
    input.budget.commit(reservation, WEB_SCRAPE_CREDITS);
    await input.ledger.upsertLedger({ ...base, creditsActual: null, status: "unknown", errorCode: "web_scrape_error", attemptCount: 1 });
    return { facts: [], credits: 0, note: `web scrape failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
