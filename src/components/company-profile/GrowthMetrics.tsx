import { useState, useRef, useCallback } from "react";
import { TrendingUp, DollarSign, Users, Check, ChevronUp, ChevronDown, ShieldCheck, Pencil, Sparkles, RotateCcw, Loader2 } from "lucide-react";

// ── Utilities ──

function parseSmartNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.toString().toLowerCase().replace(/[^0-9.kmb]/g, "");
  const match = cleaned.match(/^([\d.]+)([kmb]?)$/);
  if (!match) return 0;
  let num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === "k") num *= 1_000;
  if (suffix === "m") num *= 1_000_000;
  if (suffix === "b") num *= 1_000_000_000;
  return num;
}

function formatWithCommas(num: number): string {
  if (isNaN(num) || num === 0) return "";
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function useShake() {
  const [shaking, setShaking] = useState(false);
  const trigger = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
  }, []);
  return { shaking, trigger };
}

// ── Types ──

export type DataSource = "deck" | "ai" | "manual";

interface OriginalMetrics {
  currentARR: string;
  yoyGrowth: string;
  totalHeadcount: string;
}

interface GrowthMetricsProps {
  currentARR: string;
  yoyGrowth: string;
  totalHeadcount: string;
  onChange: (field: "currentARR" | "yoyGrowth" | "totalHeadcount", value: string) => void;
  onConfirm?: () => void;
  dataSource?: DataSource;
  onDataSourceChange?: (source: DataSource) => void;
  originalDataSource?: DataSource;
  defaultExpanded?: boolean;
  isProcessing?: boolean;
}

const LIMITS = { arr: 200_000_000, yoy: 500_000, headcount: 100_000 } as const;

// ── Smart Inputs ──

function SmartCurrencyInput({
  value, onChange, onStartEdit, error, onError, shaking, onShake, disabled,
}: { value: string; onChange: (v: string) => void; onStartEdit?: () => void; error: string; onError: (msg: string) => void; shaking: boolean; onShake: () => void; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = local !== value && document.activeElement !== inputRef.current ? value : local;
  const hasError = !!error;

  return (
    <div>
      <div className={`relative ${shaking ? "animate-shake" : ""}`}>
        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={display}
          disabled={disabled}
          onChange={(e) => { setLocal(e.target.value.replace(/[^0-9.,mkbMKB]/g, "")); onStartEdit?.(); }}
          onFocus={() => { onError(""); setLocal(value); }}
          onBlur={() => {
            const raw = parseSmartNumber(local);
            if (raw > LIMITS.arr) {
              onError(`Limit exceeded. Max is $${LIMITS.arr.toLocaleString()}.`);
              onShake();
            } else {
              onError("");
            }
            const capped = Math.min(raw, LIMITS.arr);
            const formatted = formatWithCommas(capped);
            setLocal(formatted);
            onChange(formatted);
          }}
          placeholder="e.g. 1.2m or 1,200,000"
          className={`w-full rounded-lg border bg-background pl-9 pr-9 py-2.5 text-sm text-foreground transition-all focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            hasError ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"
          }`}
        />
        {!hasError && value && <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />}
      </div>
      {hasError && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function SmartPercentageInput({
  value, onChange, onStartEdit, error, onError, shaking, onShake, disabled,
}: { value: string; onChange: (v: string) => void; onStartEdit?: () => void; error: string; onError: (msg: string) => void; shaking: boolean; onShake: () => void; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = local !== value && document.activeElement !== inputRef.current ? value : local;
  const hasError = !!error;

  return (
    <div>
      <div className={`relative ${shaking ? "animate-shake" : ""}`}>
        <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={display}
          disabled={disabled}
          onChange={(e) => { setLocal(e.target.value.replace(/[^0-9.kmKM]/g, "")); onStartEdit?.(); }}
          onFocus={() => { onError(""); setLocal(value); }}
          onBlur={() => {
            const raw = parseSmartNumber(local);
            if (raw > LIMITS.yoy) {
              onError(`Limit exceeded. Max is ${LIMITS.yoy.toLocaleString()}%.`);
              onShake();
            } else {
              onError("");
            }
            const capped = Math.min(raw, LIMITS.yoy);
            const formatted = formatWithCommas(capped);
            setLocal(formatted);
            onChange(formatted);
          }}
          placeholder="e.g. 150"
          className={`w-full rounded-lg border bg-background pl-9 pr-14 py-2.5 text-sm text-foreground transition-all focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            hasError ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"
          }`}
        />
        <span className="absolute right-9 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
        {!hasError && value && <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />}
      </div>
      {hasError && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function SmartIntegerInput({
  value, onChange, onStartEdit, error, onError, shaking, onShake, disabled,
}: { value: string; onChange: (v: string) => void; onStartEdit?: () => void; error: string; onError: (msg: string) => void; shaking: boolean; onShake: () => void; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = local !== value && document.activeElement !== inputRef.current ? value : local;
  const hasError = !!error;

  return (
    <div>
      <div className={`relative ${shaking ? "animate-shake" : ""}`}>
        <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={(e) => { setLocal(e.target.value.replace(/[^0-9kmKM]/g, "")); onStartEdit?.(); }}
          onFocus={() => { onError(""); setLocal(value); }}
          onBlur={() => {
            const raw = parseSmartNumber(local);
            if (raw > LIMITS.headcount) {
              onError(`Limit exceeded. Max is ${LIMITS.headcount.toLocaleString()}.`);
              onShake();
            } else {
              onError("");
            }
            const capped = Math.min(raw, LIMITS.headcount);
            const formatted = formatWithCommas(capped);
            setLocal(formatted);
            onChange(formatted);
          }}
          placeholder="e.g. 25"
          className={`w-full rounded-lg border bg-background pl-9 pr-9 py-2.5 text-sm text-foreground transition-all focus:outline-none focus:ring-2 ${
            hasError ? "border-destructive focus:ring-destructive" : "border-input focus:ring-ring"
          }`}
        />
        {!hasError && value && <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />}
      </div>
      {hasError && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

// ── Main ──

const SOURCE_BADGE_CONFIG: Record<DataSource, { icon: typeof Check; label: string; className: string }> = {
  deck: {
    icon: Check,
    label: "Verified from Pitch Deck",
    className: "border-success/30 bg-success/10 text-success",
  },
  manual: {
    icon: Pencil,
    label: "Manually Updated",
    className: "border-border bg-muted text-muted-foreground",
  },
  ai: {
    icon: Sparkles,
    label: "AI Predicted",
    className: "border-accent/30 bg-accent/10 text-accent",
  },
};

export function GrowthMetrics({
  currentARR, yoyGrowth, totalHeadcount,
  onChange, onConfirm,
  dataSource = "deck",
  onDataSourceChange,
  originalDataSource = "deck",
  defaultExpanded = true,
}: GrowthMetricsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [errors, setErrors] = useState({ arr: "", yoy: "", headcount: "" });
  const arrShake = useShake();
  const yoyShake = useShake();
  const headcountShake = useShake();

  const [originalMetrics] = useState<OriginalMetrics>({
    currentARR, yoyGrowth, totalHeadcount,
  });

  const handleChange = (field: "currentARR" | "yoyGrowth" | "totalHeadcount", value: string) => {
    onChange(field, value);
    if (dataSource !== "manual") {
      onDataSourceChange?.("manual");
    }
  };

  const handleRevert = () => {
    onChange("currentARR", originalMetrics.currentARR);
    onChange("yoyGrowth", originalMetrics.yoyGrowth);
    onChange("totalHeadcount", originalMetrics.totalHeadcount);
    onDataSourceChange?.(originalDataSource);
    setErrors({ arr: "", yoy: "", headcount: "" });
  };

  const badge = SOURCE_BADGE_CONFIG[dataSource];
  const BadgeIcon = badge.icon;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-surface">
      <div className="flex items-center justify-between border-b border-border pb-3 mb-5">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-accent" />
          Growth Metrics
        </span>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-all duration-200 ${badge.className}`}>
            <BadgeIcon className="h-3 w-3" />
            {badge.label}
          </span>
          {dataSource === "manual" && (
            <button
              type="button"
              title="Revert to original data"
              onClick={handleRevert}
              className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Current ARR</label>
              <SmartCurrencyInput
                value={currentARR}
                onChange={(v) => handleChange("currentARR", v)}
                onStartEdit={() => onDataSourceChange?.("manual")}
                error={errors.arr}
                onError={(msg) => setErrors((p) => ({ ...p, arr: msg }))}
                shaking={arrShake.shaking}
                onShake={arrShake.trigger}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">YoY Growth</label>
              <SmartPercentageInput
                value={yoyGrowth}
                onChange={(v) => handleChange("yoyGrowth", v)}
                onStartEdit={() => onDataSourceChange?.("manual")}
                error={errors.yoy}
                onError={(msg) => setErrors((p) => ({ ...p, yoy: msg }))}
                shaking={yoyShake.shaking}
                onShake={yoyShake.trigger}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Total Headcount</label>
              <SmartIntegerInput
                value={totalHeadcount}
                onChange={(v) => handleChange("totalHeadcount", v)}
                onStartEdit={() => onDataSourceChange?.("manual")}
                error={errors.headcount}
                onError={(msg) => setErrors((p) => ({ ...p, headcount: msg }))}
                shaking={headcountShake.shaking}
                onShake={headcountShake.trigger}
              />
            </div>
          </div>

          {onConfirm && (
            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-success/20"
              >
                <ShieldCheck className="h-4 w-4" />
                Confirm Profile
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
