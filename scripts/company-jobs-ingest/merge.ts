import { createHash } from "node:crypto";
import type { NormalizedJobInput } from "./types.js";

const SOURCE_PRIORITY: Record<string, number> = {
  ASHBY: 4,
  GREENHOUSE: 4,
  LEVER: 4,
  WEBSITE: 1,
};

function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** When merge keys collide, keep the higher-priority (typically ATS) row. */
export function mergePreferStructured(jobs: NormalizedJobInput[]): NormalizedJobInput[] {
  const byKey = new Map<string, NormalizedJobInput>();
  const sorted = [...jobs].sort(
    (a, b) => (SOURCE_PRIORITY[String(b.sourceType)] ?? 0) - (SOURCE_PRIORITY[String(a.sourceType)] ?? 0),
  );
  for (const j of sorted) {
    const existing = byKey.get(j.mergeKey);
    if (!existing) {
      byKey.set(j.mergeKey, j);
      continue;
    }
    if (SOURCE_PRIORITY[j.sourceType] > SOURCE_PRIORITY[existing.sourceType]) {
      byKey.set(j.mergeKey, j);
    }
  }
  return [...byKey.values()];
}

export function stableDedupeKey(organizationId: string, mergeKey: string): string {
  if (mergeKey.length <= 480) return mergeKey;
  const h = createHash("sha256").update(`${organizationId}\n${mergeKey}`).digest("hex");
  return `sha256:${h}`;
}

/** Drop WEBSITE rows whose title matches an ATS role (same title, ATS canonical). */
export function dropWebsiteDuplicatesAgainstAts(jobs: NormalizedJobInput[]): NormalizedJobInput[] {
  const atsTitles = new Set(
    jobs.filter((j) => j.sourceType !== "WEBSITE").map((j) => normTitle(j.title)),
  );
  return jobs.filter((j) => {
    if (j.sourceType !== "WEBSITE") return true;
    return !atsTitles.has(normTitle(j.title));
  });
}
