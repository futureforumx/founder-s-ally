/**
 * browser/sessions.ts — Default storage-state paths per source.
 *
 * To record a session:
 *   1. Run `pnpm tsx src/backfill/run-firm-backfill.ts --source=<name> --record-auth`
 *      (the pipeline launches headed, you log in, it saves state)
 *   2. Future runs auto-load that state for the given source.
 */

import { existsSync } from "fs";
import type { SourceName } from "../types";

export const DEFAULT_STORAGE_STATE_PATHS: Partial<Record<SourceName, string>> = {
  cbinsights:       "data/sessions/cbinsights.json",
  tracxn:           "data/sessions/tracxn.json",
  signal_nfx:       "data/sessions/signal-nfx.json",
  linkedin:         "data/sessions/linkedin.json",
  wellfound:        "data/sessions/wellfound.json",
  angellist:        "data/sessions/angellist.json",
  // Public sources — no auth needed
  website:          undefined,
  crunchbase:       undefined,
  openvc:           undefined,
  vcsheet:          undefined,
  startups_gallery: undefined,
  medium:           undefined,
  substack:         undefined,
};

export function resolveStoragePaths(
  override: Partial<Record<SourceName, string>> = {},
): Partial<Record<SourceName, string>> {
  const out: Partial<Record<SourceName, string>> = {};
  for (const [src, defaultPath] of Object.entries(DEFAULT_STORAGE_STATE_PATHS) as Array<[SourceName, string | undefined]>) {
    const p = override[src] ?? defaultPath;
    if (p && existsSync(p)) out[src] = p;
  }
  return out;
}
