/**
 * Adapter registry — maps adapter_key (from fi_sources.adapter_key) to adapter.
 *
 * To add a new source:
 *  1. Create a new file in this directory implementing SourceAdapter
 *  2. Import it here and add it to ADAPTER_REGISTRY
 *  3. Insert a row into fi_sources with the matching adapter_key
 */

import type { SourceAdapter } from "../types.ts";
import { StartupsGalleryAdapter } from "./startups-gallery.ts";
import { VcNewsDailyAdapter }     from "./vc-news-daily.ts";
import { TechCrunchAdapter }      from "./techcrunch.ts";
import { Venture5Adapter }        from "./venture5.ts";
import { VcStackAdapter }         from "./vcstack.ts";
import { CrunchbaseAdapter }      from "./crunchbase.ts";

export const ADAPTER_REGISTRY: Record<string, SourceAdapter> = {
  [StartupsGalleryAdapter.key]: StartupsGalleryAdapter,
  [VcNewsDailyAdapter.key]:     VcNewsDailyAdapter,
  [TechCrunchAdapter.key]:      TechCrunchAdapter,
  [Venture5Adapter.key]:        Venture5Adapter,
  [VcStackAdapter.key]:         VcStackAdapter,
  [CrunchbaseAdapter.key]:      CrunchbaseAdapter,
};

export function getAdapter(key: string): SourceAdapter | undefined {
  return ADAPTER_REGISTRY[key];
}

export { StartupsGalleryAdapter, VcNewsDailyAdapter, TechCrunchAdapter, Venture5Adapter, VcStackAdapter, CrunchbaseAdapter };
