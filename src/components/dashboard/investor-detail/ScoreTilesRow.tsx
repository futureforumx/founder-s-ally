import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useMatchBreakdown } from "./InvestorAIInsight";

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
// All bars share the same color (keyed to the panel's overall score range).

function SubscoreRow({ sub, barCls }: { sub: Subscore; barCls: string }) {
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
            note: item.detail,
          }))
        : [
            { label: "Stage fit", value: 92, note: "Active in your target stage" },
            { label: "Sector fit", value: 88, note: "Strong thesis overlap" },
            { label: "Geography fit", value: 78, note: "Invests in your region" },
            { label: "Profile fit", value: 82, note: "Aligned check size and model" },
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
        { label: "Overall experience", value: 76 },
        { label: "Work with again", value: 72 },
        { label: "Hard times support", value: 68 },
        { label: "Communication", value: 80 },
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
        { label: "Responsiveness", value: 70 },
        { label: "Founder friendliness", value: 65 },
        { label: "Follow-through", value: 72 },
        { label: "Value-add", value: 66 },
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
        { label: "Tier", value: 85, note: "Tier 1" },
        { label: "Brand recognition", value: 90 },
        { label: "Investor signal", value: 82 },
        { label: "Sector authority", value: 78 },
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
    // w-fit keeps the panel the same width as the tile strip — no full-bleed sprawl.
    <div className="w-fit">
      {/* ── Tile strip ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2">
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
                // Fixed size so 4 tiles stay compact
                "relative w-24 h-[64px]",
                "flex flex-col items-center justify-center gap-0.5 px-2",
                "rounded-[8px] border transition-all duration-200 select-none",
                isActive
                  ? `${colors.activeTintBg} ${colors.activeBorder}`
                  : "bg-white dark:bg-card border-[#E5E7EB] dark:border-border hover:shadow-md hover:border-border",
              ].join(" ")}
            >
              {/* Label */}
              <span
                className={[
                  "text-[10px] tracking-wider uppercase leading-none",
                  isActive
                    ? "font-bold text-foreground/75"
                    : "font-medium text-muted-foreground/60",
                ].join(" ")}
              >
                {tile.shortLabel}
              </span>

              {/* Score value — lighter than big pill when inactive */}
              <span
                className={[
                  "text-[20px] font-bold leading-tight",
                  isActive ? colors.valueCls : colors.subtleCls,
                ].join(" ")}
              >
                {tile.value}
              </span>

              {/* Caption */}
              <span className="text-[10px] text-muted-foreground/50 leading-none">
                {caption}
              </span>

              {/* Chevron — bottom-right corner, rotates on active */}
              <ChevronDown
                className={[
                  "absolute bottom-1.5 right-1.5 w-3 h-3 transition-all duration-200",
                  isActive
                    ? "text-muted-foreground/60 rotate-0"
                    : "text-muted-foreground/30 -rotate-90",
                ].join(" ")}
              />
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
                <div className="mt-2 rounded-[10px] bg-secondary/30 dark:bg-secondary/20 border border-border/50 px-4 pt-3.5 pb-3 w-full">
                  {/* Panel header */}
                  <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/60 mb-2.5">
                    {activeTileConfig.displayLabel} — score breakdown
                  </p>

                  {/* Definition */}
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed mb-3.5">
                    {activeTileConfig.definition}
                  </p>

                  {/* Subscores — all bars share the panel's color family */}
                  <div className="space-y-3">
                    {activeTileConfig.subscores.map((sub) => (
                      <SubscoreRow
                        key={sub.label}
                        sub={sub}
                        barCls={colors.barCls}
                      />
                    ))}
                  </div>

                  {/* Footer */}
                  <p className="mt-3.5 text-[9px] text-muted-foreground/35 border-t border-border/20 pt-2">
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
