export const CAPITAL_EVENT_THRESHOLDS = {
  ignore: 0.28,
  review: 0.52,
  escalate: 0.72,
  autoVerify: 0.9,
  officialSourceAutoPromote: 0.94,
  verificationRequiredMin: 0.72,
  verificationRequiredMax: 0.93,
  minCorroborationScore: 0.34,
  conflictingFundSizeTolerancePct: 0.3,
  conflictingDateToleranceDays: 21,
  maxClusterAgeDaysBeforeReview: 45,
  verifierBatchSize: 25,
  verifierRateMs: 150,
} as const;

export const CAPITAL_EVENT_WEIGHTS = {
  base: 0.1,
  officialSource: 0.26,
  explicitFundLanguage: 0.18,
  closeLanguage: 0.14,
  explicitSize: 0.1,
  sequenceOrVintage: 0.08,
  exactFirmMatch: 0.16,
  corroboration: 0.12,
  portfolioFinancingPenalty: -0.45,
  genericFundraisingPenalty: -0.16,
  hiringPenalty: -0.22,
  commentaryPenalty: -0.14,
  productPenalty: -0.18,
  corroborationAgreement: 0.18,
  independentSource: 0.12,
  strongOfficialBypass: 0.08,
  conflictPenalty: -0.22,
} as const;

export const CAPITAL_EVENT_KEYWORDS = {
  positiveFund:
    /\b(new fund|announced (?:a|its) .*fund|closed .*fund|oversubscribed|debut fund|first fund|fund [ivx0-9]+|opportunity fund|growth fund|seed fund|scout fund|rolling fund|first close|final close|new vehicle|fresh capital)\b/i,
  closeLanguage: /\b(closed|final close|first close|oversubscribed)\b/i,
  sizeLanguage: /\$[\d,.]+(?:\s?(?:million|billion|m|b))?\b|\b\d+(?:\.\d+)?\s?(?:million|billion|m|b)\b/i,
  negativePortfolio:
    /\b(series [abcde]|seed round|raised .*series|portfolio company|lead investor|co-led|financing round|startup raised)\b/i,
  negativeHiring: /\b(hiring|joins as|appointed|expands team|office opening|new office)\b/i,
  negativeProduct: /\b(product launch|launches|released|partnership|partners with|integration)\b/i,
  negativeCommentary: /\b(thoughts on|market update|newsletter|podcast|webinar|conference)\b/i,
} as const;

export const CAPITAL_EVENT_SCAN_PATHS = [
  "",
  "/news",
  "/press",
  "/blog",
  "/announcements",
  "/updates",
] as const;
