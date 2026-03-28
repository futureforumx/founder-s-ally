import { SectorHeatmap } from "@/components/company-profile/SectorHeatmap";
import { Globe } from "lucide-react";
import { SECTOR_TAXONOMY } from "@/components/company-profile/types";

const allSectors = Object.keys(SECTOR_TAXONOMY);

interface Props {
  sector?: string;
  onNavigateBenchmarks: () => void;
  onNavigateProfile: () => void;
  variant?: "full" | "sectorFocus";
}

export function IndustryView({ sector, onNavigateBenchmarks, onNavigateProfile, variant = "full" }: Props) {
  if (!sector) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
          <Globe className="h-6 w-6 text-accent" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Select Your Sector</h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-4">
          Set your sector in the Company Profile to see the industry heatmap, market pulse, and 2026 benchmarks.
        </p>
        <button
          onClick={onNavigateProfile}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          Set Sector in Profile
        </button>
      </div>
    );
  }

  const primary = (
    <div>
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
        Your Sector
      </h3>
      <SectorHeatmap sector={sector} onNavigateBenchmarks={onNavigateBenchmarks} />
    </div>
  );

  if (variant === "sectorFocus") {
    return <div className="space-y-6">{primary}</div>;
  }

  return (
    <div className="space-y-6">
      {primary}

      <div>
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Full Sector Landscape · 2026
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {allSectors.filter(s => s !== sector).map(s => (
            <SectorHeatmap key={s} sector={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
