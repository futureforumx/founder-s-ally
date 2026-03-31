import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useMatchBreakdown, getMatchFitNote } from "./InvestorAIInsight";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subscore {
  label: string;
  value: number; // 0–100
  note?: string;
}

type TileId = "match" | "founderSentiment" | "founderReputation" | "industryReputation";

interface TileConfig {
  id: TileId;
  shortLabel: string;
  displayLabel: string;
  value: number;
  definition: string;
  subscores: Subscore[];
}

interface CompanyContext {
  name?: string;
  sector?: string;
  stage?: string;
  model?: string;
  description?: string;
}

interface InvestorContext {
  name: string;
  description?: string;
  stage?: string;
  sector?: string;
  checkSize?: string;
  recentDeals?: string;
  currentThesis?: string;
  geography?: string;
  source?: string;
}

export interface ScoreTilesRowProps {
  matchScore: number;
  firmName?: string;
  companyContext?: CompanyContext | null;
  investorContext?: InvestorContext | null;
  founderSentimentScore?: number;
  founderReputationScore?: number;
  industryReputationScore?: number;
  lastUpdated?: string;
  confidenceScore?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCaption(score: number): string {
  if (score >= 85) return "High";
  if (score >= 70) return "Good";
  if (score >= 55) return "Medium";
  return "Low";
}

type SubscoreTier = "high" | "good" | "medium" | "low";

function tierForSubscore(score: number): SubscoreTier {
  if (score >= 85) return "high";
  if (score >= 70) return "good";
  if (score >= 55) return "medium";
  return "low";
}

/** Notes for founder-sentiment rows — always aligned to the numeric score. */
function founderSentimentNote(
  row: "overall" | "workAgain" | "hardTimes" | "communication",
  score: number
): string {
  const t = tierForSubscore(score);
  const m: Record<typeof row, Record<SubscoreTier, string>> = {
    overall: {
      high: "Consistently praised overall experience",
      good: "Generally positive experiences reported",
      medium: "Mixed experiences across founders",
      low: "Frequent concerns about the partnership",
    },
    workAgain: {
      high: "Most would partner again enthusiastically",
      good: "Majority likely to work together again",
      medium: "Split on whether they’d repeat",
      low: "Many would not choose to work again",
    },
    hardTimes: {
      high: "Stands out for support in hard moments",
      good: "Reasonable support when things get tough",
      medium: "Uneven support through downturns",
      low: "Often absent or unhelpful in crises",
    },
    communication: {
      high: "Clear, frequent, respectful communication",
      good: "Solid communication with occasional gaps",
      medium: "Inconsistent clarity or responsiveness",
      low: "Communication is a common pain point",
    },
  };
  return m[row][t];
}

function founderReputationNote(
  row: "responsiveness" | "friendliness" | "followThrough" | "valueAdd",
  score: number
): string {
  const t = tierForSubscore(score);
  const m: Record<typeof row, Record<SubscoreTier, string>> = {
    responsiveness: {
      high: "Fast, reliable responses to founders",
      good: "Usually reachable within a reasonable window",
      medium: "Slow or uneven response patterns",
      low: "Often hard to reach or unresponsive",
    },
    friendliness: {
      high: "Widely seen as founder-aligned and fair",
      good: "Generally constructive working style",
      medium: "Perceived as transactional or distant",
      low: "Often described as difficult or adversarial",
    },
    followThrough: {
      high: "Commitments and promises reliably kept",
      good: "Mostly follows through; rare misses",
      medium: "Mixed track record on commitments",
      low: "Frequent gaps between say and do",
    },
    valueAdd: {
      high: "Strong operator and network leverage",
      good: "Helpful introductions and light support",
      medium: "Limited hands-on value beyond capital",
      low: "Little perceived help beyond the check",
    },
  };
  return m[row][t];
}

function industryReputationNote(
  row: "tier" | "brand" | "signal" | "authority",
  score: number
): string {
  const t = tierForSubscore(score);
  const m: Record<typeof row, Record<SubscoreTier, string>> = {
    tier: {
      high: "Top-quartile firm in peer rankings",
      good: "Well-regarded institutional brand",
      medium: "Credible but not tier-defining",
      low: "Below peers on perceived firm quality",
    },
    brand: {
      high: "Highly recognized name in the market",
      good: "Solid brand familiarity among founders",
      medium: "Known in niche circles more than broadly",
      low: "Limited brand recognition vs peers",
    },
    signal: {
      high: "Their logo strongly validates a round",
      good: "Positive signal to other investors",
      medium: "Modest signaling effect",
      low: "Weak signal to follow-on capital",
    },
    authority: {
      high: "Seen as a thought leader in the space",
      good: "Credible sector perspective",
      medium: "Average sector voice and influence",
      low: "Limited authority in your vertical",
    },
  };
  return m[row][t];
}

// Returns color tokens for a given score.
// `subtleCls` is used on inactive tiles so the score reads quieter than the big MATCH pill.
function colorTokens(score: number) {
  if (score >= 85)
    return {
      valueCls: "text-success",
      subtleCls: "text-success/70",
      activeTintBg: "bg-success/[0.05]",
      activeBorder: "border-success/25",
      barCls: "bg-success",
    };
  if (score >= 65)
    return {
      valueCls: "text-warning",
      subtleCls: "text-warning/70",
      activeTintBg: "bg-warning/[0.05]",
      activeBorder: "border-warning/25",
      barCls: "bg-warning",
    };
  return {
    valueCls: "text-destructive",
    subtleCls: "text-destructive/70",
    activeTintBg: "bg-destructive/[0.05]",
    activeBorder: "border-destructive/25",
    barCls: "bg-destructive",
  };
}

// ─── Subscore row ─────────────────────────────────────────────────────────────
// Layout: Label | bar track | score | note
// Each bar color is keyed to its own value, matching major score color logic.

function SubscoreRow({ sub }: { sub: Subscore }) {
  const barCls = colorTokens(sub.value).barCls;
  return (
    <div className="flex items-center gap-3">
      {/* Label */}
      <span className="text-[11px] text-foreground/70 w-32 shrink-0 leading-snug">
        {sub.label}
      </span>

      {/* Bar track */}
      <div className="flex-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barCls}`}
          initial={{ width: 0 }}
          animate={{ width: `${sub.value}%` }}
          transition={{ duration: 0.32, ease: "easeOut" }}
        />
      </div>

      {/* Score number */}
      <span className="text-[11px] font-semibold text-foreground/70 w-6 text-right tabular-nums shrink-0">
        {sub.value}
      </span>

      {/* Optional note */}
      {sub.note ? (
        <span className="text-[10px] text-muted-foreground/50 w-40 text-right shrink-0 leading-snug truncate">
          {sub.note}
        </span>
      ) : (
        <span className="w-40 shrink-0" />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScoreTilesRow({
  matchScore,
  firmName = "",
  companyContext,
  investorContext,
  founderSentimentScore = 74,
  founderReputationScore = 68,
  industryReputationScore = 81,
  lastUpdated,
  confidenceScore = 87,
}: ScoreTilesRowProps) {
  const [activeTile, setActiveTile] = useState<TileId | null>(null);

  useEffect(() => {
    setActiveTile(null);
  }, [firmName]);

  // Shared with the big Match pill — sessionStorage caches so no duplicate calls.
  const { items: matchItems } = useMatchBreakdown(
    firmName,
    companyContext,
    investorContext,
    matchScore,
  );

  const computedMatchScore = useMemo(() => {
    if (!matchItems.length) return matchScore;
    return Math.round(
      matchItems.reduce((s, i) => s + i.score, 0) / matchItems.length,
    );
  }, [matchItems, matchScore]);

  const tiles: TileConfig[] = [
    {
      id: "match",
      shortLabel: "MATCH",
      displayLabel: "Match",
      value: computedMatchScore,
      definition:
        "How well this investor matches your stage, sector, geography, and check size.",
      subscores: matchItems.length
        ? matchItems.map((item) => ({
            label:
              item.category.charAt(0).toUpperCase() +
              item.category.slice(1) +
              " fit",
            value: item.score,
            note: getMatchFitNote(item.category, item.score),
          }))
        : [
            { label: "Sector fit", value: 88, note: getMatchFitNote("sector", 88) },
            { label: "Stage fit", value: 95, note: getMatchFitNote("stage", 95) },
            { label: "Geography fit", value: 78, note: getMatchFitNote("geography", 78) },
            { label: "Profile fit", value: 82, note: getMatchFitNote("profile", 82) },
          ],
    },
    {
      id: "founderSentiment",
      shortLabel: "SENTIMENT",
      displayLabel: "Founder Sentiment",
      value: founderSentimentScore,
      definition:
        "How positively founders in our network talk about working with this investor.",
      subscores: [
        { label: "Overall experience", value: 76, note: founderSentimentNote("overall", 76) },
        { label: "Work with again", value: 72, note: founderSentimentNote("workAgain", 72) },
        { label: "Hard times support", value: 68, note: founderSentimentNote("hardTimes", 68) },
        { label: "Communication", value: 80, note: founderSentimentNote("communication", 80) },
      ],
    },
    {
      id: "founderReputation",
      shortLabel: "REPUTATION",
      displayLabel: "Founder Reputation",
      value: founderReputationScore,
      definition:
        "Reputation of this investor among founders more broadly, beyond your immediate network.",
      subscores: [
        { label: "Responsiveness", value: 70, note: founderReputationNote("responsiveness", 70) },
        { label: "Founder friendliness", value: 65, note: founderReputationNote("friendliness", 65) },
        { label: "Follow-through", value: 72, note: founderReputationNote("followThrough", 72) },
        { label: "Value-add", value: 66, note: founderReputationNote("valueAdd", 66) },
      ],
    },
    {
      id: "industryReputation",
      shortLabel: "INDUSTRY",
      displayLabel: "Industry Reputation",
      value: industryReputationScore,
      definition:
        "How this firm is perceived in the wider market and within your sector.",
      subscores: [
        { label: "Tier", value: 85, note: industryReputationNote("tier", 85) },
        { label: "Brand recognition", value: 90, note: industryReputationNote("brand", 90) },
        { label: "Investor signal", value: 82, note: industryReputationNote("signal", 82) },
        { label: "Sector authority", value: 78, note: industryReputationNote("authority", 78) },
      ],
    },
  ];

  const formattedDate =
    lastUpdated ??
    new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const handleTileClick = (id: TileId) =>
    setActiveTile((prev) => (prev === id ? null : id));

  const activeTileConfig = activeTile
    ? tiles.find((t) => t.id === activeTile)
    : null;

  return (
    <div className="w-full min-w-0">
      {/* ── Tile strip ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2.5 w-fit">
        {tiles.map((tile) => {
          const isActive = activeTile === tile.id;
          const colors = colorTokens(tile.value);
          const caption = getCaption(tile.value);

          return (
            <button
              key={tile.id}
              onClick={() => handleTileClick(tile.id)}
              aria-expanded={isActive}
              className={[
                "group relative overflow-hidden rounded-xl px-3 py-2.5 min-w-[96px]",
                "flex flex-col items-start",
                "backdrop-blur-[28px] border transition-all duration-200 select-none cursor-pointer",
                isActive
                  ? `${colors.activeTintBg} ${colors.activeBorder} shadow-lg`
                  : "bg-white/50 dark:bg-white/[0.07] border-white/25 dark:border-white/[0.12] hover:bg-white/60 dark:hover:bg-white/[0.11] hover:-translate-y-0.5 shadow-[0_4px_20px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]",
              ].join(" ")}
            >
              {/* Top specular highlight — simulates glass edge catching light */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />

              {/* Label row with colored accent dot */}
              <div className="flex items-center gap-1 mb-1.5">
                <span className={["w-1.5 h-1.5 rounded-full shrink-0", colors.barCls].join(" ")} />
                <span className="text-[9px] tracking-[0.05em] uppercase font-semibold text-foreground/55 leading-none">
                  {tile.shortLabel}
                </span>
              </div>

              {/* Score — neutral color, weight carries the hierarchy */}
              <div className="relative mb-0.5">
                <span className="text-[26px] font-bold leading-none tabular-nums text-foreground">
                  {tile.value}
                </span>
                {/* Soft color bloom behind number */}
                <div className={["absolute inset-0 blur-2xl opacity-25 rounded-full scale-[2]", colors.barCls].join(" ")} />
              </div>

              {/* Caption */}
              <span className="text-[10px] text-foreground/40 leading-none mb-2">
                {caption}
              </span>

              {/* Colored progress pill */}
              <div className="h-0.5 w-full rounded-full bg-black/[0.06] dark:bg-white/10">
                <motion.div
                  className={`h-0.5 rounded-full ${colors.barCls} opacity-75`}
                  initial={{ width: 0 }}
                  animate={{ width: `${tile.value}%` }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              </div>

              {/* Shimmer sweep */}
              <div className="absolute bottom-0 left-0 h-[2px] w-full overflow-hidden">
                <div className={["h-full w-1/3 animate-shimmer opacity-50", colors.barCls].join(" ")} />
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Breakdown panel ────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTileConfig && (
          <motion.div
            key={activeTileConfig.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden w-full"
          >
            {(() => {
              const colors = colorTokens(activeTileConfig.value);
              return (
                <div className="mt-2 rounded-[10px] bg-secondary/30 dark:bg-secondary/20 border border-border/50 px-4 pt-3 pb-2.5 w-full">
                  {/* Panel header */}
                  <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/60 mb-2">
                    {activeTileConfig.displayLabel} — score breakdown
                  </p>

                  {/* Definition */}
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed mb-3">
                    {activeTileConfig.definition}
                  </p>

                  {/* Subscores — each bar uses value-based color tiers */}
                  <div className="space-y-2.5">
                    {activeTileConfig.subscores.map((sub) => (
                      <SubscoreRow key={sub.label} sub={sub} />
                    ))}
                  </div>

                  {/* Footer */}
                  <p className="mt-3 text-[9px] text-muted-foreground/35 border-t border-border/20 pt-1.5">
                    Updated {formattedDate} · Confidence {confidenceScore}%
                  </p>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
