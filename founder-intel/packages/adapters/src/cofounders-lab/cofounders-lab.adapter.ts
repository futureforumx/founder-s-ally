import type { AdapterConfig, AdapterResult, IAdapter } from "@founder-intel/types";

// ─── CoFoundersLab Adapter (SCAFFOLDED — DISABLED) ────────────────────────────
// CoFoundersLab requires authentication to view profiles.
// Robots.txt likely disallows unauthenticated scraping.
// Disabled pending compliance confirmation.

export class CoFoundersLabAdapter implements IAdapter {
  readonly name = "cofounders-lab";
  readonly version = "0.1.0-scaffold";
  readonly enabled = false;
  readonly complianceNote =
    "DISABLED — CoFoundersLab requires authentication to access profiles. " +
    "Robots.txt disallows automated access to /members pages. " +
    "Enable only with explicit API partnership or user-authenticated session.";

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
 * - CoFoundersLab profiles at https://cofounderslab.com/members
 * - Requires session cookie / login
 * - Extractable: name, skills, location, industry, linkedin, startup info
 * - High-value for cofounder network mapping
 */
