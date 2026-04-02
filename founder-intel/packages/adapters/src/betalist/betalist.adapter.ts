import type { AdapterConfig, AdapterResult, IAdapter } from "@founder-intel/types";

// ─── BetaList Adapter (SCAFFOLDED — DISABLED) ─────────────────────────────────
// BetaList's robots.txt status is unclear for automated fetching.
// The site does not expose a public API.
// Disabled pending compliance review.

export class BetaListAdapter implements IAdapter {
  readonly name = "betalist";
  readonly version = "0.1.0-scaffold";
  readonly enabled = false;
  readonly complianceNote =
    "DISABLED — BetaList compliance status is unclear. No public API available. " +
    "Robots.txt review pending. Enable only after confirming compliance.";

  async checkRobotsTxt(): Promise<boolean> {
    return false;
  }

  async run(_config?: AdapterConfig): Promise<AdapterResult> {
    console.warn(`[${this.name}] Adapter is scaffolded only — not implemented`);
    return { organizations: [], people: [], roles: [], sourceRecords: [] };
  }
}

/*
 * IMPLEMENTATION NOTES:
 * - BetaList lists early-stage startups at https://betalist.com
 * - Structure: /startups page with cards, each linking to /startups/:slug
 * - Extractable: name, tagline, website, category, founder name (sometimes)
 * - No direct founder/person data — org-only enrichment
 */
