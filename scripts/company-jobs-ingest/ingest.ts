import type { AtsHint, NormalizedJobInput } from "./types.js";
import { fetchAshbyJobs } from "./ats/ashby.js";
import { fetchGreenhouseJobs } from "./ats/greenhouse.js";
import { fetchLeverJobs } from "./ats/lever.js";
import { extractWebsiteJobs } from "./website/fallback.js";
import { dropWebsiteDuplicatesAgainstAts, mergePreferStructured } from "./merge.js";

export async function ingestJobsForOrg(
  website: string,
  detection: {
    careersPageUrl: string | null;
    atsHints: AtsHint[];
    rootUrl: string;
  },
  log: (m: string) => void,
): Promise<{ jobs: NormalizedJobInput[]; errors: string[] }> {
  const errors: string[] = [];
  let collected: NormalizedJobInput[] = [];

  for (const hint of detection.atsHints) {
    try {
      let batch: NormalizedJobInput[] = [];
      if (hint.kind === "ASHBY") batch = await fetchAshbyJobs(hint.token);
      else if (hint.kind === "GREENHOUSE") batch = await fetchGreenhouseJobs(hint.token);
      else batch = await fetchLeverJobs(hint.token);
      if (batch.length) {
        collected = batch;
        log(`ATS ${hint.kind} token=${hint.token} jobs=${batch.length}`);
        break;
      }
      log(`ATS ${hint.kind} token=${hint.token} returned 0 jobs; trying next/fallback`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${hint.kind}:${hint.token}: ${msg}`);
      log(`ATS ${hint.kind} token=${hint.token} failed: ${msg}`);
    }
  }

  if (detection.careersPageUrl && collected.length === 0) {
    try {
      const web = await extractWebsiteJobs(detection.careersPageUrl, detection.rootUrl, log);
      if (web.length) {
        log(`Website fallback jobs=${web.length} from ${detection.careersPageUrl}`);
        collected = web;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`website:${msg}`);
      log(`Website fallback failed: ${msg}`);
    }
  }

  collected = mergePreferStructured(collected);
  collected = dropWebsiteDuplicatesAgainstAts(collected);

  return { jobs: collected, errors };
}
