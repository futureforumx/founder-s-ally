import { Target, AlertTriangle } from "lucide-react";

interface SectorAlignmentProps {
  vcSectors: string[];
  primarySector?: string | null;
  secondarySectors?: string[];
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

  blocks.sort((a, b) => a.tier - b.tier);

  const hasMatch = blocks.some((b) => b.tier < 3);

  // Only show top sectors: matched ones + up to 4 others (max 6 total)
  const matched = blocks.filter((b) => b.tier < 3);
  const others = blocks.filter((b) => b.tier === 3).slice(0, Math.max(0, 6 - matched.length));
  const visible = [...matched, ...others];

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2.5">
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
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
          <span className="text-[11px] font-medium text-warning">
            Outside of your core focus
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1">
        {visible.map((b) => {
          const isPrimary = b.tier === 1;
          const isSecondary = b.tier === 2;
          return (
            <div
              key={b.name}
              className={`rounded-md px-2 py-1.5 flex items-center gap-1.5 ${
                isPrimary
                  ? "bg-[hsl(var(--success))] text-white"
                  : isSecondary
                    ? "bg-[hsl(var(--primary))] text-white"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isPrimary && <Target className="w-3 h-3 shrink-0 opacity-80" />}
              <span className="text-[11px] font-semibold leading-tight truncate">
                {b.name}
              </span>
            </div>
          );
        })}
      </div>

      {vcSectors.length > 0 && (
        <p className="text-[10px] text-muted-foreground/50">
          {matched.length} of {vcSectors.length} sectors align
          {vcSectors.length > visible.length && ` · ${vcSectors.length - visible.length} more`}
        </p>
      )}
    </div>
  );
}
