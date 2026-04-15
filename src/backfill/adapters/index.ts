/**
 * adapters/index.ts — registry of all source adapters.
 */
import type { SourceAdapter, SourceName } from "../types";

import { websiteAdapter }           from "./website";
import { crunchbaseAdapter }        from "./crunchbase";
import { cbinsightsAdapter }        from "./cbinsights";
import { tracxnAdapter }            from "./tracxn";
import { signalNfxAdapter }         from "./signal-nfx";
import { openvcAdapter }            from "./openvc";
import { vcsheetAdapter }           from "./vcsheet";
import { startupsGalleryAdapter }   from "./startups-gallery";
import { wellfoundAdapter }         from "./wellfound";
import { angellistAdapter }         from "./angellist";
import { mediumAdapter }            from "./medium";
import { substackAdapter }          from "./substack";

export const ADAPTERS: SourceAdapter[] = [
  websiteAdapter,
  crunchbaseAdapter,
  cbinsightsAdapter,
  tracxnAdapter,
  signalNfxAdapter,
  openvcAdapter,
  vcsheetAdapter,
  startupsGalleryAdapter,
  wellfoundAdapter,
  angellistAdapter,
  mediumAdapter,
  substackAdapter,
];

export const ADAPTERS_BY_NAME: Record<SourceName, SourceAdapter | undefined> = Object.fromEntries(
  ADAPTERS.map((a) => [a.name, a])
) as Record<SourceName, SourceAdapter | undefined>;

/**
 * Recommended execution order. Cheap/public sources first so we have a
 * firm-identity anchor before hitting auth-gated sources that need matching.
 */
export const DEFAULT_RUN_ORDER: SourceName[] = [
  "website",
  "crunchbase",
  "openvc",
  "vcsheet",
  "startups_gallery",
  "medium",
  "substack",
  "signal_nfx",
  "cbinsights",
  "tracxn",
  "wellfound",
  "angellist",
];
