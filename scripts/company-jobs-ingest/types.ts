import type { CompanyJobSourceType } from "@prisma/client";

export type AtsKind = "ASHBY" | "GREENHOUSE" | "LEVER";

export interface AtsHint {
  kind: AtsKind;
  /** Ashby board slug, Greenhouse board token, Lever site slug */
  token: string;
  /** Where we found the hint (URL) */
  evidenceUrl: string;
}

export interface SourceDetectionResult {
  rootUrl: string;
  careersPageUrl: string | null;
  /** Ordered: first is preferred for ingestion when multiple exist */
  atsHints: AtsHint[];
  probeErrors: { url: string; message: string }[];
}

export interface NormalizedJobInput {
  sourceType: CompanyJobSourceType;
  sourceUrl: string | null;
  externalJobId: string | null;
  title: string;
  department: string | null;
  team: string | null;
  location: string | null;
  locationType: string | null;
  employmentType: string | null;
  postedAt: Date | null;
  applyUrl: string;
  descriptionSnippet: string | null;
  descriptionRaw: string | null;
  compensationText: string | null;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  rawJson: unknown;
  /** Stable per-ingest merge key (not necessarily the DB dedupe_key yet) */
  mergeKey: string;
}
