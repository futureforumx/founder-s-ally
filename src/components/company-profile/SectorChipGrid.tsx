import { useCallback, useState, type DragEvent } from "react";
import { GripVertical, Sparkles, Pencil, X } from "lucide-react";
import { BUSINESS_MODEL_OPTIONS, TARGET_CUSTOMER_OPTIONS } from "@/constants/taxonomy";
import { SectorMultiSelect } from "@/components/company-profile/SectorMultiSelect";

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
  /** Links the caller's `SECTOR` label to the search input. */
  sectorInputId?: string;
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
  onDoubleClick,
  disabled,
}: {
  label: string;
  state: "primary" | "secondary" | "selected" | "unselected";
  badge?: string;
  aiSuggested?: boolean;
  aiApproved?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  disabled?: boolean;
}) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 cursor-pointer select-none border whitespace-nowrap";

  // Purple states apply to ALL selected chips (user or AI), not just AI-suggested
  const isSelected = state !== "unselected";
  const isAiPending = isSelected && aiApproved === false;
  const isAiConfirmed = isSelected && aiApproved === true;

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
      onDoubleClick={disabled ? undefined : onDoubleClick}
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

// ── Ranked sector alignment ──

function SectorAlignmentSlots({
  primary,
  secondary,
  onChange,
}: {
  primary: string | null;
  secondary: string[];
  onChange: (selection: SectorChipSelection) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const ranked = [primary, ...secondary].filter((sector): sector is string => Boolean(sector)).slice(0, 3);

  const commitRanked = (next: string[]) => {
    onChange({
      primary_sector: next[0] ?? null,
      secondary_sectors: next.slice(1, 3),
    });
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetIndex: number) => {
    event.preventDefault();
    const sourceFromTransfer = Number(event.dataTransfer.getData("text/plain"));
    const sourceIndex = dragIndex ?? sourceFromTransfer;
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= ranked.length) return;

    const next = [...ranked];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(Math.min(targetIndex, next.length), 0, moved);
    commitRanked(next);
    setDragIndex(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sector alignment</p>
          <p className="text-[10px] text-muted-foreground/70">Drag to reorder priority.</p>
        </div>
        <span className="text-[9px] font-semibold text-muted-foreground">{ranked.length}/3 selected</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((index) => {
          const sector = ranked[index];
          const isDragging = dragIndex === index;
          return (
            <div
              key={index}
              draggable={Boolean(sector)}
              onDragStart={(event) => sector && handleDragStart(event, index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => handleDrop(event, index)}
              className={`group min-h-[76px] rounded-lg border p-2.5 transition-colors ${
                sector
                  ? "cursor-grab border-border bg-muted/45 active:cursor-grabbing"
                  : "border-dashed border-border/70 bg-muted/15"
              } ${isDragging ? "opacity-40" : ""}`}
            >
              <div className="flex items-start gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                  index === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {index === 0 ? "Primary" : "Secondary"}
                  </p>
                  <p className={`mt-1 text-xs font-semibold leading-snug ${
                    sector ? "text-foreground" : "text-muted-foreground/45"
                  }`}>
                    {sector ?? "Drop sector here"}
                  </p>
                </div>
                {sector && (
                  <>
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/45" aria-hidden />
                    <button
                      type="button"
                      onClick={() => commitRanked(ranked.filter((_, rankedIndex) => rankedIndex !== index))}
                      className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${sector}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
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
              aiApproved={isSelected ? approved : undefined}
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
  sectorInputId,
  className,
}: SectorChipGridProps) {
  const { primary_sector, secondary_sectors } = value;

  const ranked = [primary_sector, ...secondary_sectors].filter((sector): sector is string =>
    Boolean(sector),
  );

  const handleRankedChange = useCallback(
    (next: string[]) => {
      onChange({ primary_sector: next[0] ?? null, secondary_sectors: next.slice(1, 3) });
    },
    [onChange],
  );

  return (
    <div className={`space-y-6 ${className ?? ""}`}>
      {/* Sector search + selection */}
      <div className="space-y-3">
        <SectorMultiSelect
          inputId={sectorInputId}
          value={ranked}
          onChange={handleRankedChange}
          aiSuggested={aiSuggestedSectors}
          approved={approved}
        />
        <SectorAlignmentSlots
          primary={primary_sector}
          secondary={secondary_sectors}
          onChange={onChange}
        />
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
