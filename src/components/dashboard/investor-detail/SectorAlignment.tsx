import { useState } from "react";
import { Target, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

interface SectorAlignmentProps {
  vcSectors: string[];
  primarySector?: string | null;
  secondarySectors?: string[];
}

interface SectorBlock {
  name: string;
  tier: 1 | 2 | 3;
}

const DEFAULT_VISIBLE = 5;

export function SectorAlignment({
  vcSectors,
  primarySector,
  secondarySectors = [],
}: SectorAlignmentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const blocks: SectorBlock[] = vcSectors.map((s) => {
    if (primarySector && s === primarySector) return { name: s, tier: 1 };
    if (secondarySectors.includes(s)) return { name: s, tier: 2 };
    return { name: s, tier: 3 };
  });

  blocks.sort((a, b) => a.tier - b.tier);

  const hasMatch = blocks.some((b) => b.tier < 3);
  const matched = blocks.filter((b) => b.tier < 3);
  const visible = isExpanded ? blocks : blocks.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = blocks.length - DEFAULT_VISIBLE;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-muted-foreground/60 tracking-[0.2em] uppercase">
          Sector Alignment
        </h4>
        {hasMatch && (
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground/50 tracking-wider uppercase">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-[hsl(var(--success))]" />
              Primary
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-sm bg-[hsl(var(--primary))]" />
              Secondary
            </span>
          </div>
        )}
      </div>

      {!hasMatch && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200">
          <AlertTriangle className="h-3.5 w-3.5 text-orange-600 shrink-0" />
          <span className="text-sm font-semibold text-orange-700">
            Outside of your core focus
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {visible.map((b) => {
          const isPrimary = b.tier === 1;
          const isSecondary = b.tier === 2;
          return (
            <span
              key={b.name}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                isPrimary
                  ? "bg-[hsl(var(--success))] text-white"
                  : isSecondary
                    ? "bg-[hsl(var(--primary))] text-primary-foreground"
                    : "bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {isPrimary && <Target className="w-3 h-3 shrink-0 opacity-80" />}
              {b.name}
            </span>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setIsExpanded((v) => !v)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 transition-colors"
        >
          {isExpanded ? (
            <>Show less <ChevronUp className="w-3 h-3" /></>
          ) : (
            <>Show all {blocks.length} sectors <ChevronDown className="w-3 h-3" /></>
          )}
        </button>
      )}

      {vcSectors.length > 0 && (
        <p className="text-[10px] text-muted-foreground/50">
          {matched.length} of {vcSectors.length} sectors align
        </p>
      )}
    </div>
  );
}
