import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

type TileId = "match" | "founderReputation";
export type { TileId };

interface ScoreTile {
  id: TileId;
  label: string;
  value: number;
  detail: string;
}

export interface ScoreTilesRowProps {
  matchScore: number | null;
  matchReason?: string | null;
  firmName?: string;
  founderReputationScore?: number | null;
  lastUpdated?: string | null;
  activeTileId?: TileId | null;
  onActiveTileChange?: (tileId: TileId | null) => void;
  showTiles?: boolean;
  showBreakdown?: boolean;
}

function colorFor(value: number): string {
  return value >= 80 ? "text-success" : value >= 60 ? "text-warning" : "text-muted-foreground";
}

export function ScoreTilesRow({
  matchScore,
  matchReason,
  firmName = "",
  founderReputationScore,
  lastUpdated,
  activeTileId,
  onActiveTileChange,
  showTiles = true,
  showBreakdown = true,
}: ScoreTilesRowProps) {
  const [internalActiveTile, setInternalActiveTile] = useState<TileId | null>(null);
  const activeTile = activeTileId !== undefined ? activeTileId : internalActiveTile;
  const setActiveTile = (next: TileId | null) => {
    onActiveTileChange ? onActiveTileChange(next) : setInternalActiveTile(next);
  };

  useEffect(() => {
    if (onActiveTileChange) onActiveTileChange(null);
    else setInternalActiveTile(null);
  }, [firmName, onActiveTileChange]);

  const tiles = useMemo<ScoreTile[]>(() => {
    const available: ScoreTile[] = [];
    if (matchScore !== null && Number.isFinite(matchScore)) {
      available.push({
        id: "match",
        label: "Company fit",
        value: Math.max(0, Math.min(100, Math.round(matchScore))),
        detail: matchReason?.trim() || "The matching rules did not return an explanation for this result.",
      });
    }
    if (founderReputationScore !== null && founderReputationScore !== undefined && Number.isFinite(founderReputationScore)) {
      available.push({
        id: "founderReputation",
        label: "Founder reputation",
        value: Math.max(0, Math.min(100, Math.round(founderReputationScore))),
        detail: "Firm-level founder reputation score from the investor profile.",
      });
    }
    return available;
  }, [founderReputationScore, matchReason, matchScore]);

  const activeTileConfig = tiles.find((tile) => tile.id === activeTile) ?? null;

  return (
    <div className="w-full min-w-0">
      {showTiles && (
        <div className="flex w-fit max-w-full gap-2 ml-auto">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => setActiveTile(activeTile === tile.id ? null : tile.id)}
              aria-expanded={activeTile === tile.id}
              className="min-w-[92px] rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-left transition-colors hover:bg-secondary/70"
            >
              <span className="block text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">{tile.label}</span>
              <span className={`mt-1 block text-2xl font-bold tabular-nums ${colorFor(tile.value)}`}>{tile.value}</span>
              <span className="text-[9px] text-muted-foreground">profile score</span>
              <ChevronDown className={`mt-1 h-3 w-3 text-muted-foreground transition-transform ${activeTile === tile.id ? "rotate-180" : ""}`} />
            </button>
          ))}
          {tiles.length === 0 && (
            <p className="max-w-40 py-2 text-right text-[10px] leading-relaxed text-muted-foreground">
              No company-specific match score is available.
            </p>
          )}
        </div>
      )}

      {showBreakdown && (
        <AnimatePresence mode="wait">
          {activeTileConfig && (
            <motion.div
              key={activeTileConfig.id}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden w-full"
            >
              <div className="mt-2 rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Why this score</p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/80">{activeTileConfig.detail}</p>
                {lastUpdated && (
                  <p className="mt-2 border-t border-border/40 pt-2 text-[9px] text-muted-foreground">
                    Investor profile last enriched {new Date(lastUpdated).toLocaleDateString()}.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
