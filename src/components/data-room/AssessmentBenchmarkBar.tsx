import { useMemo } from "react";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCompanyGeo } from "@/lib/resolveCompanyGeo";
import type { CompanyData } from "@/components/company-profile/types";
import type { AuditResult } from "@/components/deck-audit/types";

interface AssessmentBenchmarkBarProps {
  profile: CompanyData | null;
  auditResult?: AuditResult | null;
  className?: string;
}

function competitiveSummary(
  audit: AuditResult | null | undefined,
  sector: string,
  stage: string,
  geo: string,
): string {
  if (!sector) {
    return "Set your primary sector in Company Profile to benchmark against peers in your market.";
  }

  const cohortParts = [stage, sector, geo].filter(Boolean);
  const cohortLabel = cohortParts.join(" · ");

  if (!audit) {
    return cohortLabel
      ? `Benchmarks compare your deck to other ${cohortLabel} companies. Upload a pitch deck in Files to see where you rank.`
      : `Benchmarks compare your deck to other companies in ${sector}. Upload a pitch deck in Files to see where you rank.`;
  }

  const { percentile, key_takeaway } = audit.benchmark_insights;
  const rank =
    percentile >= 50
      ? `Top ${100 - percentile}% on investor readiness`
      : `Bottom ${100 - percentile}% on investor readiness`;

  const base = cohortLabel
    ? `${rank} vs. other ${cohortLabel} decks.`
    : `${rank} vs. peer decks in ${sector}.`;

  return key_takeaway ? `${base} ${key_takeaway}` : base;
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

export function AssessmentBenchmarkBar({ profile, auditResult, className }: AssessmentBenchmarkBarProps) {
  const sector = profile?.sector?.trim() || "";
  const stage = profile?.stage?.trim() || "Not set";
  const geo = resolveCompanyGeo(profile?.hqLocation);

  const summary = useMemo(
    () => competitiveSummary(auditResult, sector, stage === "Not set" ? "" : stage, geo),
    [auditResult, sector, stage, geo],
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card/50 px-4 py-4 space-y-3",
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Primary sector</p>
        <p className="text-base font-semibold text-foreground leading-snug">
          {sector || "Not set — choose a primary sector in Company Profile"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <MetaItem label="Stage" value={stage} />
        <MetaItem label="Geo" value={geo} />
      </div>

      <div className="flex gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
        <Target className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">{summary}</p>
      </div>
    </div>
  );
}
