import { format, parseISO } from "date-fns";
import { ExternalLink } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FirmLogo } from "@/components/ui/firm-logo";
import { useCompanyDirectory } from "@/hooks/useProfile";
import { useVCDirectory } from "@/hooks/useVCDirectory";
import { useRecentFundingFeed } from "@/hooks/useRecentFundingFeed";
import {
  buildVcFirmMatchIndex,
  resolveMatchedVcFirm,
  type MatchedVcFirm,
} from "@/lib/fundingFeedEntityMatch";
import { type RecentFundingRound } from "@/lib/recentFundingSeed";
import { sectorLabelsForDisplay } from "@/lib/latestFundingFilters";
import { cn } from "@/lib/utils";
import { EXTERNAL_SOURCE_LINK_ATTRS, formatOutboundUrl } from "@/lib/utils/formatOutboundUrl";

function normalizeOrgNameKey(name: string) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function websiteHost(raw: string | null | undefined): string | null {
  const u = String(raw ?? "").trim();
  if (!u) return null;
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(u) ? u : `https://${u}`);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

type OrgMatch = { id: string; logoUrl: string | null; website: string | null };
type OrgLookupMaps = { byName: Map<string, OrgMatch>; byHost: Map<string, OrgMatch> };

function useOrganizationLookupMaps(): OrgLookupMaps {
  const { companies } = useCompanyDirectory(8000);
  return useMemo(() => {
    const byName = new Map<string, OrgMatch>();
    const byHost = new Map<string, OrgMatch>();
    for (const c of companies) {
      const match: OrgMatch = {
        id: c.id,
        logoUrl: c.logo_url?.trim() || null,
        website: c.website?.trim() || null,
      };
      const nk = normalizeOrgNameKey(c.name);
      if (nk) byName.set(nk, match);
      const h = websiteHost(c.website);
      if (h) byHost.set(h, match);
    }
    return { byName, byHost };
  }, [companies]);
}

function resolveOrganization(row: RecentFundingRound, maps: OrgLookupMaps): OrgMatch | null {
  const nk = normalizeOrgNameKey(row.companyName);
  const fromName = nk ? maps.byName.get(nk) : null;
  if (fromName) return fromName;
  const h = websiteHost(row.websiteUrl);
  if (h) {
    const fromHost = maps.byHost.get(h);
    if (fromHost) return fromHost;
  }
  return null;
}

function announcedLabel(row: RecentFundingRound): string {
  try {
    return format(parseISO(row.announcedAt), "MMM d, yyyy");
  } catch {
    return row.announcedAt || "—";
  }
}

function LeadInvestorIdentity({
  row,
  leadFirm,
  nameClass,
}: {
  row: RecentFundingRound;
  leadFirm: MatchedVcFirm | null;
  nameClass: string;
}) {
  const logo = (
    <FirmLogo
      firmName={row.leadInvestor}
      logoUrl={leadFirm?.logoUrl}
      websiteUrl={leadFirm?.websiteUrl ?? row.leadWebsiteUrl}
      size="sm"
      className="shrink-0"
    />
  );

  const wrapLogo = (node: ReactNode) =>
    leadFirm?.id ? (
      <Link
        to={`/firms/${leadFirm.id}`}
        aria-label={`${row.leadInvestor} investor profile`}
        className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {node}
      </Link>
    ) : (
      node
    );

  return (
    <div className="flex items-center gap-2 min-w-0">
      {wrapLogo(logo)}
      {leadFirm?.id ? (
        <Link to={`/firms/${leadFirm.id}`} className={cn(nameClass, "min-w-0")}>
          {row.leadInvestor}
        </Link>
      ) : row.leadWebsiteUrl ? (
        <a
          href={formatOutboundUrl(row.leadWebsiteUrl)}
          {...EXTERNAL_SOURCE_LINK_ATTRS}
          className={cn(nameClass, "min-w-0")}
        >
          {row.leadInvestor}
        </a>
      ) : (
        <span className="text-sm text-foreground truncate">{row.leadInvestor}</span>
      )}
    </div>
  );
}

const companyNameClass =
  "font-semibold text-sm text-foreground truncate hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm min-w-0";

const linkLeadClass =
  "text-sm text-foreground truncate hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm";

function FundingRowDesktop({
  row,
  leadFirm,
  organization,
}: {
  row: RecentFundingRound;
  leadFirm: MatchedVcFirm | null;
  organization: OrgMatch | null;
}) {
  const dateLabel = announcedLabel(row);

  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/25 transition-colors">
      <td className="py-3 pr-3 pl-4 align-middle">
        <div className="flex items-center gap-3 min-w-0">
          <FirmLogo
            firmName={row.companyName}
            logoUrl={row.companyLogoUrl ?? organization?.logoUrl}
            websiteUrl={row.websiteUrl || organization?.website}
            size="sm"
            className="shrink-0 rounded-lg"
          />
          {organization?.id ? (
            <Link to={`/companies/${organization.id}`} className={companyNameClass}>
              {row.companyName}
            </Link>
          ) : (
            <span className="font-semibold text-sm text-foreground truncate min-w-0" title="Company is not in the in-app directory yet">
              {row.companyName}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-2 align-middle text-sm text-muted-foreground min-w-[88px] max-w-[200px]">
        <span className="line-clamp-2">{sectorLabelsForDisplay(row.sector).join(", ") || "—"}</span>
      </td>
      <td className="py-3 px-2 align-middle whitespace-nowrap text-sm text-foreground">{row.roundKind}</td>
      <td className="py-3 px-2 align-middle whitespace-nowrap text-sm text-foreground tabular-nums">{row.amountLabel}</td>
      <td className="py-3 px-2 align-middle min-w-0">
        <LeadInvestorIdentity row={row} leadFirm={leadFirm} nameClass={linkLeadClass} />
      </td>
      <td className="py-3 px-2 align-middle text-sm text-muted-foreground min-w-[120px] max-w-[220px]">
        {row.coInvestors.length ? (
          <span className="line-clamp-2">{row.coInvestors.join(", ")}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="py-3 px-2 align-middle whitespace-nowrap text-sm text-muted-foreground tabular-nums">{dateLabel}</td>
      <td className="py-3 pl-2 pr-4 align-middle whitespace-nowrap text-right">
        <a
          href={formatOutboundUrl(row.sourceUrl)}
          {...EXTERNAL_SOURCE_LINK_ATTRS}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Source
          <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
        </a>
      </td>
    </tr>
  );
}

function FundingCardMobile({
  row,
  leadFirm,
  organization,
}: {
  row: RecentFundingRound;
  leadFirm: MatchedVcFirm | null;
  organization: OrgMatch | null;
}) {
  const dateLabel = announcedLabel(row);

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3 shadow-sm">
      <div className="flex items-start gap-3">
        <FirmLogo
          firmName={row.companyName}
          logoUrl={row.companyLogoUrl ?? organization?.logoUrl}
          websiteUrl={row.websiteUrl || organization?.website}
          size="md"
          className="shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          {organization?.id ? (
            <Link
              to={`/companies/${organization.id}`}
              className="font-semibold text-foreground leading-tight hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {row.companyName}
            </Link>
          ) : (
            <span className="font-semibold text-foreground leading-tight" title="Company is not in the in-app directory yet">
              {row.companyName}
            </span>
          )}
          <div className="mt-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sector</p>
            <p className="text-sm text-foreground">{sectorLabelsForDisplay(row.sector).join(", ") || "—"}</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Stage</p>
              <p className="text-foreground">{row.roundKind}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Round size</p>
              <p className="text-foreground tabular-nums">{row.amountLabel}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 text-sm border-t border-border/40 pt-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Lead investor</p>
          <LeadInvestorIdentity row={row} leadFirm={leadFirm} nameClass={cn(linkLeadClass, "text-left")} />
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Co-investors</p>
          <p className="text-muted-foreground">{row.coInvestors.length ? row.coInvestors.join(", ") : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Announced</p>
          <p className="text-muted-foreground tabular-nums">{dateLabel}</p>
        </div>
        <div className="flex items-center justify-between pt-1">
          <a
            href={formatOutboundUrl(row.sourceUrl)}
            {...EXTERNAL_SOURCE_LINK_ATTRS}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Source
            <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

export function RecentFundingFeed({ className }: { className?: string }) {
  const { firms } = useVCDirectory();
  const leadFirmIndex = useMemo(() => buildVcFirmMatchIndex(firms), [firms]);
  const orgMaps = useOrganizationLookupMaps();
  const { rows, isLoading, isFetching } = useRecentFundingFeed();

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Recent funding</h1>
        {isFetching && !isLoading ? (
          <p className="text-[10px] text-muted-foreground mt-1" aria-live="polite">
            Refreshing…
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground">
          Loading latest funding rounds…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-12 text-center text-sm text-muted-foreground">
          No rows to display.
        </div>
      ) : (
        <>
          <div className="hidden md:block rounded-xl border border-border/60 bg-card/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    <th className="py-2.5 pr-3 pl-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">Company</th>
                    <th className="py-2.5 px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold min-w-[100px]">Sector</th>
                    <th className="py-2.5 px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">Stage</th>
                    <th className="py-2.5 px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">Round size</th>
                    <th className="py-2.5 px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">Lead investor</th>
                    <th className="py-2.5 px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">Co-investors</th>
                    <th className="py-2.5 px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">Announced</th>
                    <th className="py-2.5 pl-2 pr-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold text-right">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <FundingRowDesktop
                      key={row.id}
                      row={row}
                      leadFirm={resolveMatchedVcFirm(row.leadInvestor, leadFirmIndex)}
                      organization={resolveOrganization(row, orgMaps)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {rows.map((row) => (
              <FundingCardMobile
                key={row.id}
                row={row}
                leadFirm={resolveMatchedVcFirm(row.leadInvestor, leadFirmIndex)}
                organization={resolveOrganization(row, orgMaps)}
              />
            ))}
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
        Coverage is curated from public announcements for in-product context; verify terms in the original source before relying on it for decisions.
      </p>
    </div>
  );
}
