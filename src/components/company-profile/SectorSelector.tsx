import { useState, useCallback } from "react";
import {
  Landmark, Monitor, Brain, HeartPulse, ShoppingCart, Leaf,
  Truck, Factory, Building2, ShieldCheck, Clapperboard, Coins,
  GraduationCap, Rocket, Megaphone,
} from "lucide-react";

const MASTER_SECTORS = [
  "Fintech",
  "Enterprise Software & SaaS",
  "AI, Data & Analytics",
  "HealthTech, Biotech & Life Sciences",
  "Consumer, E‑commerce & CPG",
  "Climate, Energy & Sustainability",
  "Mobility, Transportation & Logistics",
  "IndustrialTech, Manufacturing & Robotics",
  "PropTech & Construction Tech",
  "Cybersecurity & Privacy",
  "Media, Gaming & Creator Economy",
  "Web3, Crypto & DeFi",
  "EdTech & Future of Work",
  "GovTech, Defense & Space",
  "Marketing, Sales & Retail Infrastructure",
] as const;

type MasterSector = typeof MASTER_SECTORS[number];

const SECTOR_ICONS: Record<MasterSector, React.ElementType> = {
  "Fintech": Landmark,
  "Enterprise Software & SaaS": Monitor,
  "AI, Data & Analytics": Brain,
  "HealthTech, Biotech & Life Sciences": HeartPulse,
  "Consumer, E‑commerce & CPG": ShoppingCart,
  "Climate, Energy & Sustainability": Leaf,
  "Mobility, Transportation & Logistics": Truck,
  "IndustrialTech, Manufacturing & Robotics": Factory,
  "PropTech & Construction Tech": Building2,
  "Cybersecurity & Privacy": ShieldCheck,
  "Media, Gaming & Creator Economy": Clapperboard,
  "Web3, Crypto & DeFi": Coins,
  "EdTech & Future of Work": GraduationCap,
  "GovTech, Defense & Space": Rocket,
  "Marketing, Sales & Retail Infrastructure": Megaphone,
};

export interface SectorSelection {
  primary_sector: string | null;
  secondary_sectors: string[];
}

interface SectorSelectorProps {
  value?: SectorSelection;
  onChange?: (selection: SectorSelection) => void;
  className?: string;
}

export function SectorSelector({ value, onChange, className }: SectorSelectorProps) {
  const [primary, setPrimary] = useState<string | null>(value?.primary_sector ?? null);
  const [secondary, setSecondary] = useState<string[]>(value?.secondary_sectors ?? []);

  const emit = useCallback(
    (p: string | null, s: string[]) => {
      setPrimary(p);
      setSecondary(s);
      onChange?.({ primary_sector: p, secondary_sectors: s });
    },
    [onChange]
  );

  const handleClick = useCallback(
    (sector: string) => {
      // Deselect primary
      if (sector === primary) {
        const [promoted, ...rest] = secondary;
        emit(promoted ?? null, rest);
        return;
      }
      // Deselect secondary
      if (secondary.includes(sector)) {
        emit(primary, secondary.filter((s) => s !== sector));
        return;
      }
      // Select: assign as primary if empty, else as secondary
      if (!primary) {
        emit(sector, secondary);
      } else if (secondary.length < 2) {
        emit(primary, [...secondary, sector]);
      }
    },
    [primary, secondary, emit]
  );

  const totalSelected = (primary ? 1 : 0) + secondary.length;
  const maxReached = totalSelected >= 3;

  return (
    <div className={className}>
      <h3 className="text-xl font-bold text-foreground">What is your startup's focus?</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Select 1 Primary sector, and up to 2 optional Secondary sectors.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MASTER_SECTORS.map((sector) => {
          const isPrimary = sector === primary;
          const isSecondary = secondary.includes(sector);
          const isSelected = isPrimary || isSecondary;
          const isDisabled = maxReached && !isSelected;

          const Icon = SECTOR_ICONS[sector];

          return (
            <button
              key={sector}
              type="button"
              onClick={() => !isDisabled && handleClick(sector)}
              className={`
                relative rounded-xl p-4 text-left transition-all duration-200
                flex items-center justify-between group
                ${isPrimary
                  ? "bg-primary/5 border-2 border-primary shadow-sm"
                  : isSecondary
                    ? "bg-muted/50 border-2 border-muted-foreground/30 border-dashed"
                    : isDisabled
                      ? "bg-background border border-border opacity-50 cursor-not-allowed grayscale"
                      : "bg-background border border-border cursor-pointer hover:border-primary/30"
                }
              `}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`h-5 w-5 shrink-0 ${
                    isPrimary
                      ? "text-primary"
                      : isSecondary
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60 group-hover:text-foreground/70"
                  }`}
                />
                <span
                  className={`text-sm font-medium truncate ${
                    isPrimary
                      ? "text-primary"
                      : isSecondary
                        ? "text-foreground"
                        : "text-foreground/70"
                  }`}
                >
                  {sector}
                </span>
              </div>

              {isPrimary && (
                <span className="text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded uppercase tracking-wider shrink-0">
                  Primary
                </span>
              )}
              {isSecondary && (
                <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded uppercase tracking-wider shrink-0">
                  Secondary
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
