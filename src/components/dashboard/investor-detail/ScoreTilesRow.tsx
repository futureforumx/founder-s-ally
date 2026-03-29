import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

export interface ScoreTilesRowProps {
  matchScore: number;
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

function colorTokens(score: number) {
  if (score >= 85)
    return {
      valueCls: "text-success",
      tintBg: "bg-success/[0.06]",
      activeTintBg: "bg-success/[0.10]",
      barCls: "bg-success",
      borderActive: "border-success/25",
    };
  if (score >= 65)
    return {
      valueCls: "text-warning",
      tintBg: "bg-warning/[0.06]",
      activeTintBg: "bg-warning/[0.10]",
      barCls: "bg-warning",
      borderActive: "border-warning/25",
    };
  return {
    valueCls: "text-destructive",
    tintBg: "bg-destructive/[0.06]",
    activeTintBg: "bg-destructive/[0.10]",
    barCls: "bg-destructive",
    borderActive: "border-destructive/25",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ value, barCls }: { value: number; barCls: string }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barCls}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        />
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground tabular-nums w-7 text-right">
        {value}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScoreTilesRow({
  matchScore,
  founderSentimentScore = 74,
  founderReputationScore = 68,
  industryReputationScore = 81,
  lastUpdated,
  confidenceScore = 87,
}: ScoreTilesRowProps) {
  const [activeTile, setActiveTile] = useState<TileId | null>(null);

  const tiles: TileConfig[] = [
    {
      id: "match",
      shortLabel: "MATCH",
      displayLabel: "Match",
      value: matchScore,
      definition:
        "How well this investor matches your stage, sector, geography, and check size.",
      subscores: [
        { label: "Stage fit", value: 92, note: "Active in your target stage" },
        { label: "Sector fit", value: 88, note: "Strong thesis overlap" },
        { label: "Geography fit", value: 78, note: "Invests in your region" },
        { label: "Check size fit", value: 85, note: "Within sweet spot" },
        { label: "Lead / follow fit", value: 80, note: "Willing to lead rounds" },
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
        { label: "Would work with again", value: 72 },
        { label: "Support in hard times", value: 68 },
        { label: "Communication quality", value: 80 },
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
        { label: "Signal to other investors", value: 82 },
        { label: "Sector authority", value: 78 },
      ],
    },
  ];

  const formattedDate =
    lastUpdated ??
    new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const handleTileClick = (id: TileId) => {
    setActiveTile((prev) => (prev === id ? null : id));
  };

  const activeTileConfig = activeTile ? tiles.find((t) => t.id === activeTile) : null;

  return (
    <div className="w-full">
      {/* ── Tile row ── */}
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
                "flex-1 flex flex-col items-center justify-center gap-0.5",
                "min-w-[88px] max-w-[104px] h-[68px]",
                "rounded-[8px] border transition-all duration-200 select-none",
                // Base: neutral surface with subtle tint
                isActive
                  ? `${colors.activeTintBg} ${colors.borderActive} shadow-sm`
                  : `bg-[#F7F8FA] dark:bg-secondary/50 border-transparent hover:border-border/60 hover:shadow-sm ${colors.tintBg}`,
              ].join(" ")}
            >
              {/* Label */}
              <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/70 leading-none">
                {tile.shortLabel}
              </span>

              {/* Value */}
              <span className={`text-[20px] font-black leading-none ${colors.valueCls}`}>
                {tile.value}
              </span>

              {/* Caption + caret */}
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60 leading-none">
                {caption}
                <span className="text-[9px]">{isActive ? "▾" : "▸"}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Breakdown accordion panel ── */}
      <AnimatePresence>
        {activeTileConfig && (
          <motion.div
            key={activeTileConfig.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl bg-secondary/40 dark:bg-secondary/30 border border-border/50 px-4 py-4">
              {/* Panel header */}
              <p className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground mb-2">
                {activeTileConfig.displayLabel} — score breakdown
              </p>

              {/* Definition */}
              <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
                {activeTileConfig.definition}
              </p>

              {/* Subscores */}
              <div className="space-y-2">
                {activeTileConfig.subscores.map((sub) => {
                  const colors = colorTokens(sub.value);
                  return (
                    <div key={sub.label} className="flex items-center gap-3">
                      <span className="text-[12px] text-foreground/80 w-36 shrink-0 leading-tight">
                        {sub.label}
                      </span>
                      <ScoreBar value={sub.value} barCls={colors.barCls} />
                      {sub.note && (
                        <span className="text-[10px] text-muted-foreground/60 w-28 text-right shrink-0 leading-tight">
                          {sub.note}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <p className="mt-3 text-[10px] text-muted-foreground/50 border-t border-border/30 pt-2.5">
                Last updated: {formattedDate} · Confidence: {confidenceScore}%
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
