import snapshot from "./catalog.snapshot.json";
import { Catalog, type CatalogSnapshot } from "./catalog";

export * from "./types";
export * from "./fieldRegistry";
export * from "./identity";
export * from "./confidence";
export * from "./decide";
export * from "./budget";
export * from "./executor";
export * from "./mappers";
export * from "./waterfall";
export * from "./relationships";
export * from "./pipeline";
export type { EnrichmentStore } from "./store";
export { Catalog } from "./catalog";

/** Catalog built from the committed discovery snapshot. Refresh with `pnpm alexandria:discover` (free). */
export function loadCatalog(): Catalog {
  return new Catalog(snapshot as unknown as CatalogSnapshot);
}
