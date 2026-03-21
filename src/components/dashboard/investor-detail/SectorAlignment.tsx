import { Target, AlertTriangle } from "lucide-react";

interface SectorAlignmentProps {
  /** The VC firm's sectors array from vc_mdm_output.json */
  vcSectors: string[];
  /** The user's primary sector */
  primarySector?: string | null;
  /** The user's secondary sectors */
  secondarySectors?: string[];
}

export function SectorAlignment({
  vcSectors,
  primarySector,
  secondarySectors = [],
}: SectorAlignmentProps) {
  const tier1: string[] = [];
  const tier2: string[] = [];
  const tier3: string[] = [];

  for (const s of vcSectors) {
    if (primarySector && s === primarySector) {
      tier1.push(s);
    } else if (secondarySectors.includes(s)) {
      tier2.push(s);
    } else {
      tier3.push(s);
    }
  }

  const hasMatch = tier1.length > 0 || tier2.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h4 className="text-[10px] font-bold text-muted-foreground/60 tracking-wider uppercase">
        Sector Alignment
      </h4>

      {!hasMatch && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
          <span className="text-xs font-medium text-warning">
            Outside of your core focus
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tier1.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success/10 border border-success/20 text-success rounded-lg text-sm font-bold shadow-sm"
          >
            <Target className="w-4 h-4" />
            {s}
          </span>
        ))}

        {tier2.map((s) => (
          <span
            key={s}
            className="inline-flex items-center px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary rounded-md text-xs font-semibold"
          >
            {s}
          </span>
        ))}

        {tier3.map((s) => (
          <span
            key={s}
            className="inline-flex items-center px-2.5 py-1 bg-muted border border-border text-muted-foreground rounded-md text-xs font-medium"
          >
            {s}
          </span>
        ))}
      </div>

      {hasMatch && vcSectors.length > 0 && (
        <p className="text-[10px] text-muted-foreground/60">
          {tier1.length + tier2.length} of {vcSectors.length} sectors align with your profile
        </p>
      )}
    </div>
  );
}
