export type VcFundStatus =
  | "announced"
  | "target"
  | "first_close"
  | "final_close"
  | "inferred_active"
  | "historical";

export type VcFundSignalType =
  | "new_fund_announced"
  | "fund_closed"
  | "fund_target_updated"
  | "new_vehicle_detected"
  | "fresh_capital_inferred"
  | "fund_size_updated";

export type VcFundSourceType =
  | "official_website"
  | "sec_filing"
  | "adv_filing"
  | "press_release"
  | "news_article"
  | "structured_provider"
  | "rss"
  | "manual"
  | "inferred"
  | "other";

export type VcFundPersonRole =
  | "gp"
  | "partner"
  | "managing_partner"
  | "principal"
  | "venture_partner"
  | "advisor"
  | "scout"
  | "other";

export type CandidateCapitalEventStatus =
  | "pending"
  | "ignored"
  | "escalated"
  | "verifying"
  | "verified"
  | "promoted"
  | "rejected"
  | "review";

export type CandidateCapitalEventGuess =
  | "new_fund_announced"
  | "fund_closed"
  | "fund_target_updated"
  | "new_vehicle_detected"
  | "fresh_capital_inferred"
  | "unknown";

export interface ExtractedFundAnnouncement {
  externalId?: string | null;
  firmName: string;
  firmWebsiteUrl?: string | null;
  fundName?: string | null;
  fundLabel?: string | null;
  fundType?: string | null;
  fundSize?: number | null;
  targetSizeUsd?: number | null;
  finalSizeUsd?: number | null;
  currency?: string | null;
  vintageYear?: number | null;
  announcedDate?: string | null;
  closeDate?: string | null;
  sourceUrl: string;
  sourceTitle?: string | null;
  sourcePublisher?: string | null;
  sourceType: VcFundSourceType;
  rawText?: string | null;
  rawPayload?: Record<string, unknown> | null;
  confidence: number;
  partners?: Array<{
    fullName: string;
    role?: VcFundPersonRole | string | null;
    title?: string | null;
    confidence?: number | null;
  }>;
  stageFocus?: string[];
  sectorFocus?: string[];
  geographyFocus?: string[];
  metadata?: Record<string, unknown>;
}

export interface CandidateCapitalEventDraft {
  firmRecordId: string | null;
  rawFirmName: string;
  normalizedFirmName: string;
  candidateHeadline: string;
  excerpt: string | null;
  sourceUrl: string;
  sourceType: string;
  publisher: string | null;
  publishedAt: string | null;
  rawText: string | null;
  eventTypeGuess: CandidateCapitalEventGuess;
  normalizedFundLabel: string | null;
  fundSequenceNumber: number | null;
  vintageYear: number | null;
  announcedDate: string | null;
  sizeAmount: number | null;
  sizeCurrency: string | null;
  confidenceScore: number;
  confidenceBreakdown: Record<string, unknown>;
  evidenceCount: number;
  sourceDiversity: number;
  officialSourcePresent: boolean;
  clusterKey: string | null;
  canonicalVcFundId: string | null;
  status: CandidateCapitalEventStatus;
  reviewReason: string | null;
  metadata: Record<string, unknown>;
}

export interface CandidateCapitalEventEvidence {
  sourceUrl: string;
  sourceType: string;
  publisher: string | null;
  publishedAt: string | null;
  headline: string;
  excerpt: string | null;
  rawText: string | null;
  rawPayload: Record<string, unknown>;
  score: number;
}

export interface CanonicalFundDraft {
  firmRecordId: string;
  name: string;
  normalizedName: string;
  normalizedKey: string;
  fundType: string | null;
  fundSequenceNumber: number | null;
  vintageYear: number | null;
  announcedDate: string | null;
  closeDate: string | null;
  targetSizeUsd: number | null;
  finalSizeUsd: number | null;
  currency: string;
  status: VcFundStatus;
  sourceConfidence: number;
  sourceCount: number;
  leadSource: string | null;
  announcementUrl: string | null;
  announcementTitle: string | null;
  rawSourceText: string | null;
  isNewFundSignal: boolean;
  activeDeploymentWindowStart: string | null;
  activeDeploymentWindowEnd: string | null;
  likelyActivelyDeploying: boolean | null;
  stageFocus: string[];
  sectorFocus: string[];
  geographyFocus: string[];
  estimatedCheckMinUsd: number | null;
  estimatedCheckMaxUsd: number | null;
  fieldConfidence: Record<string, number>;
  fieldProvenance: Record<string, string[]>;
  verificationStatus: "verified" | "official_source_promoted" | "manual_reviewed";
  lastVerifiedAt: string | null;
  freshnessSyncedAt: string;
  latestSourcePublishedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface FundSourceRecord {
  sourceType: VcFundSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  publisher: string | null;
  publishedAt: string | null;
  extractedPayload: Record<string, unknown>;
  confidence: number;
  contentHash: string | null;
}

export interface FundSignalRecord {
  signalType: VcFundSignalType;
  eventDate: string;
  headline: string;
  summary: string;
  sourceUrl: string | null;
  confidence: number;
  displayPriority: number;
  metadata: Record<string, unknown>;
  dedupeKey: string;
}

export interface FirmCapitalDerivations {
  hasFreshCapital: boolean;
  likelyActivelyDeploying: boolean;
  activeDeploymentWindowStart: string | null;
  activeDeploymentWindowEnd: string | null;
  estimatedCheckMinUsd: number | null;
  estimatedCheckMaxUsd: number | null;
  priorityScoreForFounders: number;
}

export interface FirmRecordLookup {
  id: string;
  firm_name: string;
  legal_name?: string | null;
  website_url?: string | null;
  signal_nfx_url?: string | null;
  cb_insights_url?: string | null;
  tracxn_url?: string | null;
  aliases?: string[] | null;
  slug?: string | null;
  entity_type?: string | null;
  stage_focus?: string[] | null;
  thesis_verticals?: string[] | null;
  geo_focus?: string[] | null;
  min_check_size?: number | null;
  max_check_size?: number | null;
}

export interface FundSyncRunOptions {
  sourceKeys?: string[];
  maxItems?: number;
  sourceFetchLimits?: Record<string, number>;
  dryRun?: boolean;
  allowFirmCreation?: boolean;
  freshCapitalWindowDays?: number;
  firmId?: string;
  clusterKey?: string;
  dateFrom?: string;
  dateTo?: string;
  verbose?: boolean;
  allowOfficialSourcePromotion?: boolean;
  requireVerifiedForPromotion?: boolean;
  verifierBatchSize?: number;
  verificationRateMs?: number;
}

export interface FundSyncSourceStats {
  fetched: number;
  parsed: number;
  candidates: number;
  verified: number;
  promoted: number;
  failures: number;
}

export interface FundSyncStats {
  fetched: number;
  parsed: number;
  processedCandidates?: number;
  verifiedCandidates?: number;
  promotedCandidates?: number;
  mirroredSignals?: number;
  rederivedFirms?: number;
  failures?: number;
  matchedFirms: number;
  createdFirms: number;
  upsertedFunds: number;
  updatedFunds: number;
  attachedSources: number;
  linkedPeople: number;
  emittedSignals: number;
  reviewQueueItems: number;
  sourceStats?: Record<string, FundSyncSourceStats>;
}

export interface FundSyncVerifyStats {
  processed: number;
  verified: number;
  escalated: number;
  rejected: number;
  review: number;
  failures: number;
  sourceStats?: Record<string, FundSyncSourceStats>;
}

export interface VcFundSourceAdapter {
  key: string;
  label: string;
  priority: number;
  fetchFundAnnouncements: (context: {
    firms: FirmRecordLookup[];
    options: FundSyncRunOptions;
  }) => Promise<ExtractedFundAnnouncement[]>;
}
