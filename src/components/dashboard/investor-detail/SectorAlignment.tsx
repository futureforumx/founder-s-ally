import { Target, AlertTriangle } from "lucide-react";

interface SectorAlignmentProps {
  vcSectors: string[];
  primarySector?: string | null;
  secondarySectors?: string[];
}

/** Maps tier to a color palette inspired by the heatmap reference */
function getTierStyle(tier: 1 | 2 | 3) {
  switch (tier) {
    case 1:
      return {
        bg: "bg-[hsl(var(--success))]",
        text: "text-white",
        subtext: "text-white/70",
        label: "Primary Match",
      };
    case 2:
      return {
        bg: "bg-[hsl(var(--primary))]",
        text: "text-white",
        subtext: "text-white/70",
        label: "Secondary",
      };
    case 3:
      return {
        bg: "bg-muted",
        text: "text-muted-foreground",
        subtext: "text-muted-foreground/50",
        label: "Other",
      };
  }
}

interface SectorBlock {
  name: string;
  tier: 1 | 2 | 3;
}

export function SectorAlignment({
  vcSectors,
  primarySector,
  secondarySectors = [],
}: SectorAlignmentProps) {
  const blocks: SectorBlock[] = [];

  for (const s of vcSectors) {
    if (primarySector && s === primarySector) {
      blocks.push({ name: s, tier: 1 });
    } else if (secondarySectors.includes(s)) {
      blocks.push({ name: s, tier: 2 });
    } else {
      blocks.push({ name: s, tier: 3 });
    }
  }

  // Sort: tier 1 first, then tier 2, then tier 3
  blocks.sort((a, b) => a.tier - b.tier);

  const hasMatch = blocks.some((b) => b.tier < 3);

  // Split into "top row" (tier 1 + tier 2) and "bottom row" (tier 3)
  const topRow = blocks.filter((b) => b.tier < 3);
  const bottomRow = blocks.filter((b) => b.tier === 3);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-muted-foreground/60 tracking-[0.2em] uppercase">
          Sector Alignment
        </h4>
        {hasMatch && (
          <div className="flex items-center gap-4 text-[9px] text-muted-foreground/50 tracking-wider uppercase">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-[hsl(var(--success))]" />
              Primary
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-[hsl(var(--primary))]" />
              Secondary
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-muted" />
              Other
            </span>
          </div>
        )}
      </div>

      {!hasMatch && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
          <span className="text-xs font-medium text-warning">
            Outside of your core focus
          </span>
        </div>
      )}

      {/* Heatmap grid */}
      <div className="space-y-1.5">
        {/* Top row: matched sectors get more space */}
        {topRow.length > 0 && (
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: topRow
                .map((b) => (b.tier === 1 ? "2fr" : "1.5fr"))
                .join(" "),
            }}
          >
            {topRow.map((b) => {
              const style = getTierStyle(b.tier);
              return (
                <div
                  key={b.name}
                  className={`${style.bg} rounded-lg p-3 min-h-[72px] flex flex-col justify-between transition-all hover:scale-[1.01] hover:shadow-md`}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`text-[10px] font-semibold ${style.subtext} uppercase tracking-wider leading-tight`}
                    >
                      {style.label}
                    </span>
                    {b.tier === 1 && (
                      <Target className="w-3.5 h-3.5 text-white/70" />
                    )}
                  </div>
                  <span
                    className={`text-sm font-bold ${style.text} leading-tight mt-1`}
                  >
                    {b.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom row: other sectors in equal-width blocks */}
        {bottomRow.length > 0 && (
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${Math.min(bottomRow.length, 3)}, 1fr)`,
            }}
          >
            {bottomRow.map((b) => {
              const style = getTierStyle(b.tier);
              return (
                <div
                  key={b.name}
                  className={`${style.bg} rounded-lg p-2.5 min-h-[56px] flex flex-col justify-between transition-all`}
                >
                  <span
                    className={`text-[9px] ${style.subtext} uppercase tracking-wider`}
                  >
                    {style.label}
                  </span>
                  <span
                    className={`text-xs font-semibold ${style.text} leading-tight mt-0.5`}
                  >
                    {b.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {vcSectors.length > 0 && (
        <p className="text-[10px] text-muted-foreground/50">
          {blocks.filter((b) => b.tier < 3).length} of {vcSectors.length}{" "}
          sectors align with your profile
        </p>
      )}
    </div>
  );
}
