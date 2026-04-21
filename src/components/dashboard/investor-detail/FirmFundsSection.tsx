import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { supabaseVcDirectory, isSupabaseConfigured } from "@/integrations/supabase/client";
import {
  formatAumBandLabel,
  formatAumBandWithRange,
  representativeFundUsd,
  resolveAumBandFromUsd,
} from "@/lib/aumBand";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { stripRedundantFirmPrefixFromFundName } from "@/lib/fundNameNormalizer";
import { cn, safeLower, safeTrim } from "@/lib/utils";

type FundRow = {
  id: string;
  fund_name: string;
  fund_status?: string | null;
  fund_type?: string | null;
  vintage_year?: number | null;
  size_usd?: number | null;
  aum_usd?: number | null;
  actively_deploying?: boolean | null;
  deployed_pct?: number | null;
  strategy?: string | null;
  deleted_at?: string | null;
};

function fmtUsd(n: unknown): string {
  if (n == null || typeof n !== "number") return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function sortFunds(rows: FundRow[]): FundRow[] {
  return [...rows].sort((a, b) => {
    const ay = typeof a.vintage_year === "number" ? a.vintage_year : 0;
    const by = typeof b.vintage_year === "number" ? b.vintage_year : 0;
    return by - ay; // most recent first
  });
}

interface FirmFundsSectionProps {
  /** `firm_records.id` UUID — used to query `fund_records.firm_id` directly */
  firmRecordsId: string | null;
  /** Firm name — used to resolve `firm_records.id` when `firmRecordsId` is unavailable */
  firmName?: string | null;
  /** Fallback: `firm_records.is_actively_deploying` */
  isActivelyDeploying?: boolean | null;
  /** Fallback: AUM string from firm_records or static JSON */
  firmAum?: string | null;
  className?: string;
}

const DB = supabaseVcDirectory as unknown as { from: (t: string) => any };

export function FirmFundsSection({ firmRecordsId, firmName, isActivelyDeploying, firmAum, className }: FirmFundsSectionProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["investor-panel-fund-records", firmRecordsId, safeLower(firmName)],
    queryFn: async () => {
      // Resolve firm UUID: use direct ID if available, otherwise look up by name
      let resolvedId = safeTrim(firmRecordsId) || null;
      const nameT = safeTrim(firmName);
      if (!resolvedId && nameT) {
        const { data: fr } = await DB
          .from("firm_records")
          .select("id")
          .ilike("firm_name", nameT)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        resolvedId = (fr as { id: string } | null)?.id ?? null;
      }
      if (!resolvedId) return [];

      const { data, error } = await DB
        .from("fund_records")
        .select("id, fund_name, fund_status, fund_type, vintage_year, size_usd, aum_usd, actively_deploying, deployed_pct, strategy, deleted_at")
        .eq("firm_id", resolvedId)
        .is("deleted_at", null)
        .order("vintage_year", { ascending: false });
      if (error) throw new Error(error.message);
      return sortFunds((data ?? []) as FundRow[]);
    },
    enabled: Boolean(safeTrim(firmRecordsId) || safeTrim(firmName)) && isSupabaseConfigured,
    retry: false,
  });

  const funds = data ?? [];

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-border/60 bg-card p-4 space-y-3", className)}>
        <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Funds
        </h4>
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  // ── Error or no resolvable firm → show fallback from firm_records ──────
  if (isError || (!safeTrim(firmRecordsId) && !safeTrim(firmName)) || !isSupabaseConfigured) {
    const deploying = isActivelyDeploying === true;
    return (
      <div className={cn("rounded-xl border border-border/60 bg-card/50 p-4 space-y-2", className)}>
        <div className="flex items-center gap-2">
          <Landmark className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Funds
          </h4>
          {deploying && (
            <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Deploying
            </span>
          )}
        </div>
        {firmAum ? (
          <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5 space-y-1">
            <p className="text-sm font-semibold text-foreground leading-tight">Current Fund</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              <span><span className="text-muted-foreground/70">AUM</span>{" "}<span className="font-medium text-foreground/90">{firmAum}</span></span>
              {deploying && (
                <span><span className="text-muted-foreground/70">Status</span>{" "}<span className="font-medium text-emerald-600 dark:text-emerald-400">Active</span></span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Fund details not yet synced from the VC directory.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Landmark className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Funds
        </h4>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">({funds.length})</span>
      </div>

      {funds.length === 0 ? (
        <p className="text-xs text-muted-foreground">No funds listed in directory for this firm.</p>
      ) : (
        <ul className="space-y-2">
          {funds.map((f) => {
            const repUsd = representativeFundUsd(
              typeof f.aum_usd === "number" ? f.aum_usd : null,
              typeof f.size_usd === "number" ? f.size_usd : null,
            );
            const aumBand = resolveAumBandFromUsd(repUsd);
            const pct = typeof f.deployed_pct === "number" ? f.deployed_pct : null;
            const isDeploying = f.actively_deploying === true;

            return (
              <li
                key={f.id}
                className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5 space-y-2"
              >
                {/* Header row: fund name + status badges */}
                <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {stripRedundantFirmPrefixFromFundName(firmName ?? "", f.fund_name)}
                  </p>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {f.fund_status ? (
                      <Badge variant="outline" className="text-[9px] font-medium px-1.5 py-0 h-5 capitalize">
                        {f.fund_status}
                      </Badge>
                    ) : null}
                    {isDeploying ? (
                      <Badge className="text-[9px] font-medium px-1.5 py-0 h-5 bg-emerald-600 hover:bg-emerald-600">
                        Deploying
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {/* Key stats row */}
                <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <div>
                    <p className="text-muted-foreground/60 mb-0.5">Total Size</p>
                    <p className="font-semibold text-foreground/90 tabular-nums text-xs">
                      {fmtUsd(f.size_usd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60 mb-0.5">Vintage</p>
                    <p className="font-semibold text-foreground/90 text-xs">
                      {f.vintage_year ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60 mb-0.5">Band</p>
                    {aumBand ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="cursor-help border-b border-dotted border-muted-foreground/40 font-semibold text-foreground/90 text-xs w-fit">
                              {formatAumBandLabel(aumBand)}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            {formatAumBandWithRange(aumBand)}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <p className="font-semibold text-foreground/90 text-xs">—</p>
                    )}
                  </div>
                </div>

                {/* % Deployed progress bar */}
                {pct != null && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-muted-foreground/70">Deployed</span>
                      <span className="font-semibold tabular-nums text-foreground/80">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isDeploying ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {f.strategy ? (
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{f.strategy}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
