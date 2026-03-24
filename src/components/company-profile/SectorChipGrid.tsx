import { useCallback } from "react";
import { Sparkles, Pencil } from "lucide-react";
import { SECTOR_OPTIONS, BUSINESS_MODEL_OPTIONS, TARGET_CUSTOMER_OPTIONS } from "@/constants/taxonomy";

// ── Types ──

export interface SectorChipSelection {
  primary_sector: string | null;
  secondary_sectors: string[];
}

interface SectorChipGridProps {
  value: SectorChipSelection;
  onChange: (sel: SectorChipSelection) => void;
  businessModel: string[];
  onBusinessModelChange: (val: string[]) => void;
  targetCustomer: string[];
  onTargetCustomerChange: (val: string[]) => void;
  aiSuggestedSectors?: string[];
  aiSuggestedModels?: string[];
  aiSuggestedCustomers?: string[];
  approved?: boolean;
  className?: string;
}

// ── Chip component ──

function Chip({
  label,
  state,
  badge,
  aiSuggested,
  aiApproved,
  onClick,
  disabled,
}: {
  label: string;
  state: "primary" | "secondary" | "selected" | "unselected";
  badge?: string;
  aiSuggested?: boolean;
  aiApproved?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 cursor-pointer select-none border whitespace-nowrap";

  // AI states override normal styling
  const isAiPending = aiSuggested && !aiApproved;
  const isAiConfirmed = aiSuggested && aiApproved;

  const stateClasses = {
    primary: "bg-primary text-primary-foreground border-primary shadow-sm font-bold",
    secondary: "bg-secondary/60 text-secondary-foreground border-border font-semibold",
    selected: "bg-accent/15 text-accent-foreground border-accent/40 font-semibold",
    unselected: disabled
      ? "bg-muted/30 text-muted-foreground/40 border-border/50 cursor-not-allowed"
      : "bg-muted/40 text-muted-foreground border-border hover:border-foreground/30 hover:bg-muted/70",
  };

  const aiPendingCls = "bg-ai-pending/25 text-ai-pending-foreground border-ai-pending/50 font-semibold animate-[ai-pulse_2s_ease-in-out_infinite]";
  const aiApprovedCls = "bg-ai-approved text-ai-approved-foreground border-ai-approved shadow-sm font-semibold";

  const resolvedCls = state === "unselected"
    ? stateClasses.unselected
    : isAiPending
      ? aiPendingCls
      : isAiConfirmed
        ? aiApprovedCls
        : stateClasses[state];

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={`${base} ${resolvedCls}`}
    >
      {label}
      {badge && (
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded ${
          isAiConfirmed
            ? "bg-white/20 text-ai-approved-foreground"
            : state === "primary"
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-muted text-muted-foreground"
        }`}>
          {badge}
        </span>
      )}
      {aiSuggested && state !== "unselected" && (
        <span className={`flex items-center gap-0.5 text-[9px] font-semibold opacity-80 ${
          isAiConfirmed ? "text-ai-approved-foreground" : "text-ai-pending-foreground"
        }`}>
          <Sparkles className="h-2.5 w-2.5" /> AI
        </span>
      )}
    </button>
  );
}

// ── Summary Bar ──

function SummaryBar({ primary, secondary }: { primary: string | null; secondary: string[] }) {
  if (!primary && secondary.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
      {primary && (
        <span className="font-bold text-foreground">{primary}</span>
      )}
      {primary && <span className="text-muted-foreground/50">(Primary)</span>}
      {secondary.map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className="text-muted-foreground/30">·</span>
          <span className="text-foreground/80">{s}</span>
          <span className="text-muted-foreground/50">(Secondary)</span>
        </span>
      ))}
    </div>
  );
}

// ── Inline Chip Row for Business Model / Target Customer ──

function InlineChipRow({
  label,
  options,
  selected,
  aiSuggested,
  approved,
  onChange,
  badge,
  max,
}: {
  label: string;
  options: { label: string }[];
  selected: string[];
  aiSuggested?: string[];
  approved?: boolean;
  onChange: (val: string[]) => void;
  badge?: React.ReactNode;
  max?: number;
}) {
  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      if (max && selected.length >= max) return;
      onChange([...selected, item]);
    }
  };

  const maxReached = max ? selected.length >= max : false;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <Pencil className="h-3 w-3 text-muted-foreground/50" />
        {max && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
            selected.length >= max
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}>
            {selected.length}/{max}
          </span>
        )}
        {badge}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.label);
          const isAi = aiSuggested?.includes(opt.label) ?? false;
          const isDisabled = maxReached && !isSelected;
          return (
            <Chip
              key={opt.label}
              label={opt.label}
              state={isSelected ? "selected" : "unselected"}
              aiSuggested={isAi && isSelected}
              aiApproved={approved}
              onClick={() => toggle(opt.label)}
              disabled={isDisabled}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──

export function SectorChipGrid({
  value,
  onChange,
  businessModel,
  onBusinessModelChange,
  targetCustomer,
  onTargetCustomerChange,
  aiSuggestedSectors = [],
  aiSuggestedModels = [],
  aiSuggestedCustomers = [],
  approved = false,
  className,
}: SectorChipGridProps) {
  const { primary_sector, secondary_sectors } = value;

  const handleSectorClick = useCallback(
    (sector: string) => {
      // Deselect primary → promote first secondary
      if (sector === primary_sector) {
        const [promoted, ...rest] = secondary_sectors;
        onChange({ primary_sector: promoted ?? null, secondary_sectors: rest });
        return;
      }
      // Deselect secondary
      if (secondary_sectors.includes(sector)) {
        onChange({ primary_sector, secondary_sectors: secondary_sectors.filter((s) => s !== sector) });
        return;
      }
      // Select: assign as primary if empty, else as secondary (max 2)
      if (!primary_sector) {
        onChange({ primary_sector: sector, secondary_sectors });
      } else if (secondary_sectors.length < 2) {
        onChange({ primary_sector, secondary_sectors: [...secondary_sectors, sector] });
      }
    },
    [primary_sector, secondary_sectors, onChange]
  );

  const totalSelected = (primary_sector ? 1 : 0) + secondary_sectors.length;
  const maxReached = totalSelected >= 3;
  const hasAiSuggestions = aiSuggestedSectors.length > 0;

  return (
    <div className={`space-y-6 ${className ?? ""}`}>
      {/* Sector Grid */}
      <div className="space-y-2">
        {hasAiSuggestions && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-accent" />
            Pre-selected based on your description — adjust freely.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {SECTOR_OPTIONS.map((opt) => {
            const isPrimary = opt.label === primary_sector;
            const isSecondary = secondary_sectors.includes(opt.label);
            const isSelected = isPrimary || isSecondary;
            const isDisabled = maxReached && !isSelected;
            const isAi = aiSuggestedSectors.includes(opt.label);

            return (
              <Chip
                key={opt.label}
                label={opt.label}
                state={isPrimary ? "primary" : isSecondary ? "secondary" : "unselected"}
                badge={isPrimary ? "P" : isSecondary ? "S" : undefined}
                aiSuggested={isAi && isSelected}
                aiApproved={approved}
                onClick={() => handleSectorClick(opt.label)}
                disabled={isDisabled}
              />
            );
          })}
        </div>
        <SummaryBar primary={primary_sector} secondary={secondary_sectors} />
      </div>

      {/* Business Model */}
      <InlineChipRow
        label="Business Model"
        options={BUSINESS_MODEL_OPTIONS}
        selected={businessModel}
        aiSuggested={aiSuggestedModels}
        approved={approved}
        onChange={onBusinessModelChange}
        max={3}
      />

      {/* Target Customer */}
      <InlineChipRow
        label="Target Customer"
        options={TARGET_CUSTOMER_OPTIONS}
        selected={targetCustomer}
        aiSuggested={aiSuggestedCustomers}
        approved={approved}
        onChange={onTargetCustomerChange}
        max={3}
      />
    </div>
  );
}
