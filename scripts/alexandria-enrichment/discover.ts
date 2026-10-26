/**
 * Refresh the verified Alexandria capability snapshot (FREE - discovery only, no credits).
 *
 *   FIRECRAWL_API_KEY=... pnpm alexandria:discover
 *
 * Writes src/lib/alexandria/catalog.snapshot.json. Review the diff before committing: price or
 * contract changes alter what the pipeline will validate and budget for.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Firecrawl from "@mendable/firecrawl-js";
import { loadEnvFiles } from "../lib/loadEnvFiles";
import { PIPELINE_CAPABILITIES, type CatalogContract, type CatalogProviderMeta, type CatalogSnapshot } from "../../src/lib/alexandria/catalog";

loadEnvFiles([".env", ".env.local"]);

const OUT = join(process.cwd(), "src/lib/alexandria/catalog.snapshot.json");

function sdkVersion(): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "node_modules/@mendable/firecrawl-js/package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

async function fetchTerms(apiKey: string): Promise<Map<string, { required: boolean; version: string | null }>> {
  const out = new Map<string, { required: boolean; version: string | null }>();
  try {
    const res = await fetch("https://api.firecrawl.dev/exchange/provider-terms", {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json()) as { providers?: Array<{ provider: string; required?: boolean; terms?: { version?: string } }> };
    for (const p of body.providers ?? []) {
      out.set(p.provider, { required: p.required === true, version: p.terms?.version ?? null });
    }
  } catch (err) {
    console.warn(`! provider terms catalog unavailable (${err instanceof Error ? err.message : err}); terms status left null`);
  }
  return out;
}

async function main(): Promise<void> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is required (server-side environment variable).");

  const firecrawl = new Firecrawl({ apiKey });
  const wantedProviders = [...new Set(PIPELINE_CAPABILITIES.map((c) => c.provider))];
  const terms = await fetchTerms(apiKey);

  const capabilities: CatalogContract[] = [];
  const providers: Record<string, CatalogProviderMeta> = {};

  for (const provider of wantedProviders) {
    const res = await firecrawl.findTools({
      providers: [provider],
      level: "tools",
      limit: 100,
      expand: ["options", "response"],
    });
    const t = terms.get(provider);
    providers[provider] = {
      termsRequired: terms.size ? (t ? t.required : false) : null,
      termsVersion: t?.version ?? null,
      termsUrl: "https://www.firecrawl.dev/app/settings?tab=data-sources",
    };

    for (const want of PIPELINE_CAPABILITIES.filter((c) => c.provider === provider)) {
      const item = (res.items as unknown as Array<Record<string, any>>).find((i) => i.provider === provider && i.capability === want.capability) as
        | (Record<string, any> & { provider: string; capability: string })
        | undefined;
      if (!item) {
        console.error(`! ${provider}/${want.capability} was NOT returned by discovery - leaving it out of the catalog`);
        continue;
      }
      capabilities.push({
        provider,
        capability: item.capability,
        name: item.name,
        description: item.description,
        creditsCost: typeof item.creditsCost === "number" ? item.creditsCost : Number.NaN,
        perRecord: item.perRecord === true,
        requiresOneOf: item.requiresOneOf ?? null,
        options: (item.options ?? []).map((o: any) => ({ name: o.name, type: o.type, required: o.required === true })),
        response: {
          key: item.response?.key || undefined,
          paginated: item.response?.paginated,
          fields: (item.response?.fields ?? []).map((f: any) => ({ name: f.name, type: f.type })),
        },
      });
      const last = capabilities[capabilities.length - 1];
      console.log(
        `✓ ${provider}/${last.capability}  ${last.creditsCost} credit${last.creditsCost === 1 ? "" : "s"}${last.perRecord ? "/record" : ""}`,
      );
    }
  }

  const missingPrice = capabilities.filter((c) => !Number.isFinite(c.creditsCost));
  if (missingPrice.length) {
    throw new Error(`Discovery returned no price for: ${missingPrice.map((c) => `${c.provider}/${c.capability}`).join(", ")}`);
  }

  const snapshot: CatalogSnapshot = {
    generatedAt: new Date().toISOString(),
    sdkVersion: sdkVersion(),
    providers,
    capabilities,
  };
  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`\nWrote ${capabilities.length} capabilities across ${wantedProviders.length} providers -> ${OUT}`);
  for (const [p, m] of Object.entries(providers)) {
    console.log(`  terms ${p}: ${m.termsRequired === null ? "unknown" : m.termsRequired ? "ACCEPTANCE REQUIRED (org admin, dashboard)" : "no acceptance pending"}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
