import { useInvestorFitMatches } from "@/hooks/useInvestorFitMatches";
import type { CompanyFitInput } from "@/lib/investorFit";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const avatarClass =
  "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[11px] font-semibold text-foreground";

/** Investors ranked against the Company Details strip above. */
export function BestMatchesPanel({ company }: { company: CompanyFitInput }) {
  const { matches, loading, hasInputs } = useInvestorFitMatches(company);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Best Matches
        </h3>
        <p className="text-[13px] leading-[18px] text-muted-foreground">From Company Details</p>
      </div>

      {!hasInputs ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          Set a sector and round above and your closest-fitting investors will appear here.
        </p>
      ) : loading ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">Finding investors…</p>
      ) : matches.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          No strong matches for this combination yet. Try a broader sector or industry.
        </p>
      ) : (
        <div>
          {matches.map((match) => (
            <div
              key={match.id}
              className="flex items-center gap-4 border-b border-border py-4"
            >
              {match.logo_url ? (
                <img
                  src={match.logo_url}
                  alt=""
                  className="size-8 shrink-0 rounded-lg border border-border bg-muted object-contain"
                />
              ) : (
                <div className={avatarClass}>{initials(match.firm_name)}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-5 text-foreground">
                  {match.firm_name}
                </p>
                <p className="mt-1 truncate text-[13px] leading-[18px] text-muted-foreground">
                  {match.reasons.slice(0, 2).join(" · ")}
                </p>
              </div>
              <span className="w-12 shrink-0 text-right text-[13px] font-medium leading-[18px] tabular-nums text-primary">
                {match.score}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BestMatchesPanel;
