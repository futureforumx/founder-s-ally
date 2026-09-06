/** Stable 60–80 MATCH placeholder when a firm has no profile-specific score yet. */
export function stableDirectoryMatchScore(name: string | null | undefined, explicit?: number | null): number {
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return clampScore(explicit);
  }
  const s = String(name ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 60 + Math.abs(h % 21);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(99, Math.round(value)));
}

function textIncludes(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return haystack.includes(needle) || (needle.length > 3 && needle.includes(haystack));
}

export type BestFitDirectoryEntry = {
  name?: string | null;
  sector?: string | null;
  stage?: string | null;
  description?: string | null;
  matchReason?: string | null;
  _sectors?: string[] | null;
  _stages?: string[] | null;
  _thesisVerticals?: string[] | null;
  _matchScore?: number | null;
  _isActivelyDeploying?: boolean;
};

/**
 * Profile-aware MATCH score for directory cards and Best fit sort.
 * Uses an explicit `_matchScore` when present; otherwise sector/stage overlap
 * against the signed-in company's profile, then a stable name fallback.
 */
export function computeFirmProfileMatchScoreFromProfile(
  userSector: string | null | undefined,
  userStage: string | null | undefined,
  entry: BestFitDirectoryEntry,
): number {
  if (typeof entry._matchScore === "number" && Number.isFinite(entry._matchScore)) {
    return clampScore(entry._matchScore);
  }

  const sectorNeedle = (userSector ?? "").trim().toLowerCase();
  const stageNeedle = (userStage ?? "").trim().toLowerCase();
  if (!sectorNeedle && !stageNeedle) {
    return stableDirectoryMatchScore(entry.name, null);
  }

  let score = 28;
  const sectorHaystack = [
    ...(entry._sectors ?? []),
    ...(entry._thesisVerticals ?? []),
    entry.sector ?? "",
    entry.description ?? "",
  ].map((value) => String(value).toLowerCase());

  if (sectorNeedle && sectorHaystack.some((value) => textIncludes(value, sectorNeedle))) {
    score += 42;
  }

  const stageHaystack = [...(entry._stages ?? []), entry.stage ?? ""].map((value) => String(value).toLowerCase());
  if (stageNeedle && stageHaystack.some((value) => textIncludes(value, stageNeedle))) {
    score += 22;
  }

  if (entry.matchReason) score += 4;
  if (entry._isActivelyDeploying) score += 4;
  return clampScore(score);
}

export function compareDirectoryEntriesByBestFit(
  a: BestFitDirectoryEntry & { name?: string | null },
  b: BestFitDirectoryEntry & { name?: string | null },
  userSector?: string | null,
  userStage?: string | null,
): number {
  const sb = computeFirmProfileMatchScoreFromProfile(userSector, userStage, b);
  const sa = computeFirmProfileMatchScoreFromProfile(userSector, userStage, a);
  if (sb !== sa) return sb - sa;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" });
}
