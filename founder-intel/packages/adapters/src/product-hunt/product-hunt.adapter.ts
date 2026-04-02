import type { AdapterConfig, AdapterResult, IAdapter } from "@founder-intel/types";

// ─── Product Hunt Adapter (SCAFFOLDED — DISABLED) ─────────────────────────────
// Product Hunt's API requires OAuth 2.0 authentication.
// Their robots.txt disallows scraping of product listing pages.
// Enable this adapter by:
//   1. Registering an OAuth app at https://www.producthunt.com/v2/oauth/applications
//   2. Setting PRODUCT_HUNT_API_KEY in .env
//   3. Setting PRODUCT_HUNT_ENABLED=true

export class ProductHuntAdapter implements IAdapter {
  readonly name = "product-hunt";
  readonly version = "0.1.0-scaffold";
  readonly enabled = false;
  readonly complianceNote =
    "DISABLED — Product Hunt requires OAuth authentication for API access. " +
    "Robots.txt disallows scraping of /posts and /products pages. " +
    "Enable with a valid OAuth token via PRODUCT_HUNT_API_KEY.";

  async checkRobotsTxt(): Promise<boolean> {
    return false; // Treated as disallowed until API key is configured
  }

  async run(_config?: AdapterConfig): Promise<AdapterResult> {
    console.warn(`[${this.name}] Adapter is scaffolded only — not implemented`);
    return { organizations: [], people: [], roles: [], sourceRecords: [] };
  }
}

/*
 * IMPLEMENTATION NOTES (for when this is enabled):
 *
 * Product Hunt GraphQL API endpoint: https://api.producthunt.com/v2/api/graphql
 *
 * Query to list recent products:
 * {
 *   posts(first: 20, order: RANKING) {
 *     edges {
 *       node {
 *         id
 *         name
 *         tagline
 *         description
 *         url
 *         website
 *         makers { id name username profileImage headline }
 *       }
 *     }
 *   }
 * }
 *
 * Map to normalized types:
 * - Product → Organization (website domain as dedupeKey)
 * - Maker → Person (linkedin from profileUrl if available)
 * - Maker role → Role (roleType: "founder")
 */
