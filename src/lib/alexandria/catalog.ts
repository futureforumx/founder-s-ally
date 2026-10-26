/**
 * Verified Alexandria capability catalog.
 *
 * The snapshot is produced by `scripts/alexandria-enrichment/discover.ts` from live, free
 * discovery (`findTools`). Execution is only allowed for (provider, capability) pairs that
 * appear in it, and options are validated against the discovered input contract. Nothing in the
 * pipeline names a capability or option that discovery did not return.
 */

export interface CatalogOption {
  name: string;
  type: string;
  required?: boolean;
}

export interface CatalogResponseField {
  name: string;
  type: string;
}

export interface CatalogContract {
  provider: string;
  capability: string;
  name?: string;
  description?: string;
  creditsCost: number;
  perRecord: boolean;
  requiresOneOf?: string[][] | null;
  options: CatalogOption[];
  response: { key?: string; paginated?: boolean; fields: CatalogResponseField[] };
}

export interface CatalogProviderMeta {
  name?: string;
  /** true = an org admin must accept terms before calls succeed; null = not determinable at discovery time. */
  termsRequired: boolean | null;
  termsVersion?: string | null;
  termsUrl?: string | null;
}

export interface CatalogSnapshot {
  generatedAt: string;
  sdkVersion?: string;
  providers: Record<string, CatalogProviderMeta>;
  capabilities: CatalogContract[];
}

/** The only capabilities the enrichment pipeline is built around (all discovered, none assumed). */
export const PIPELINE_CAPABILITIES: ReadonlyArray<{ provider: string; capability: string }> = [
  { provider: "fireround", capability: "investors/profile" },
  { provider: "fireround", capability: "companies/profile" },
  { provider: "fireround", capability: "companies/search" },
  { provider: "fireround", capability: "investors/search" },
  { provider: "fullenrich", capability: "companies/lookup" },
  { provider: "fullenrich", capability: "people/lookup" },
  { provider: "fullenrich", capability: "contacts/work-email" },
  { provider: "apollo", capability: "companies/enrich" },
  { provider: "apollo", capability: "people/match" },
  { provider: "datalegion", capability: "companies/enrich-base" },
  { provider: "datalegion", capability: "people/enrich-base-no-contact" },
  { provider: "people-data-labs", capability: "company/enrich" },
];

export class CatalogError extends Error {
  constructor(
    message: string,
    readonly code: "unknown_capability" | "unknown_option" | "missing_required" | "bad_option_type" | "missing_one_of",
  ) {
    super(message);
    this.name = "CatalogError";
  }
}

function typeMatches(declared: string, value: unknown): boolean {
  switch (declared) {
    case "string":
      return typeof value === "string";
    case "number":
    case "integer":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    default:
      return true;
  }
}

export class Catalog {
  private readonly byKey = new Map<string, CatalogContract>();

  constructor(readonly snapshot: CatalogSnapshot) {
    for (const c of snapshot.capabilities) this.byKey.set(`${c.provider}/${c.capability}`, c);
  }

  has(provider: string, capability: string): boolean {
    return this.byKey.has(`${provider}/${capability}`);
  }

  get(provider: string, capability: string): CatalogContract {
    const c = this.byKey.get(`${provider}/${capability}`);
    if (!c) {
      throw new CatalogError(
        `Capability ${provider}/${capability} was not returned by discovery. Run the discover script to refresh the catalog.`,
        "unknown_capability",
      );
    }
    return c;
  }

  /** Listed credit price for one call; per-record capabilities multiply by `records`. */
  price(provider: string, capability: string, records = 1): number {
    const c = this.get(provider, capability);
    return c.perRecord ? c.creditsCost * Math.max(1, records) : c.creditsCost;
  }

  termsRequired(provider: string): boolean | null {
    return this.snapshot.providers[provider]?.termsRequired ?? null;
  }

  providers(): string[] {
    return Object.keys(this.snapshot.providers);
  }

  /** Throws CatalogError unless the call matches the discovered input contract. */
  validateCall(provider: string, capability: string, options: Record<string, unknown>): CatalogContract {
    const contract = this.get(provider, capability);
    const known = new Map(contract.options.map((o) => [o.name, o]));

    for (const [name, value] of Object.entries(options)) {
      const opt = known.get(name);
      if (!opt) {
        throw new CatalogError(`${provider}/${capability} has no option "${name}" in its discovered contract.`, "unknown_option");
      }
      if (value !== undefined && value !== null && !typeMatches(opt.type, value)) {
        throw new CatalogError(
          `${provider}/${capability} option "${name}" must be ${opt.type}, got ${typeof value}.`,
          "bad_option_type",
        );
      }
    }

    for (const opt of contract.options) {
      if (opt.required && (options[opt.name] === undefined || options[opt.name] === null || options[opt.name] === "")) {
        throw new CatalogError(`${provider}/${capability} requires option "${opt.name}".`, "missing_required");
      }
    }

    const groups = contract.requiresOneOf ?? [];
    if (groups.length) {
      const provided = new Set(
        Object.entries(options)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k]) => k),
      );
      const listed = new Set(groups.flat());
      if (![...listed].some((k) => provided.has(k))) {
        throw new CatalogError(
          `${provider}/${capability} needs at least one identifying input from: ${[...listed].join(", ")}.`,
          "missing_one_of",
        );
      }
    }
    return contract;
  }
}

export function responseFieldNames(contract: CatalogContract): string[] {
  return contract.response.fields.map((f) => f.name);
}
