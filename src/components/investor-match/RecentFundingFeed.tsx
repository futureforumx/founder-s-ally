import { format, parseISO } from "date-fns";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FirmLogo } from "@/components/ui/firm-logo";
import { useCompanyDirectory } from "@/hooks/useProfile";
import { useVCDirectory, type VCFirm } from "@/hooks/useVCDirectory";
import { RECENT_FUNDING_ROUNDS, type RecentFundingRound } from "@/lib/recentFundingSeed";
import { cn } from "@/lib/utils";

const GALLERY_URL = "https://startups.gallery/news";

const normalizeFirmName = (name: string | null | undefined) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

const getAliasKeys = (normalizedName: string) => {
  const keys = [normalizedName];
  if (normalizedName.includes("andreessenhorowitz")) keys.push("a16z");
  if (normalizedName === "a16z") keys.push("andreessenhorowitz");
  return keys;
};

/** Match seed labels like "Andreessen Horowitz" to directory names like "Andreessen Horowitz (a16z)". */
function firmDisplayMatchKeys(displayName: string): string[] {
  const variants = new Set<string>();
  const addVariant = (s: string) => {
    const t = s.trim();
    if (!t) return;
    variants.add(t);
    const noParen = t.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (noParen && noParen !== t) variants.add(noParen);
  };
  addVariant(displayName);
  const keys = new Set<string>();
  for (const v of variants) {
    const n = normalizeFirmName(v);
    for (const k of getAliasKeys(n)) keys.add(k);
  }
  return [...keys];
}

function useVcFirmIdByMatchKey() {
  const { firms: vcFirms } = useVCDirectory();
  return useMemo(() => {
    const m = new Map<string, string>();
    const addFirm = (firm: VCFirm) => {
      if (!firm?.name?.trim()) return;
      for (const key of firmDisplayMatchKeys(firm.name)) {
        m.set(key, firm.id);
      }
      for (const a of firm.aliases ?? []) {
        for (const key of firmDisplayMatchKeys(a)) {
          m.set(key, firm.id);
        }
      }
    };
    for (const firm of vcFirms) addFirm(firm);
    return m;
  }, [vcFirms]);
}

function resolveVcFirmId(leadName: string, vcFirmIdByKey: Map<string, string>): string | null {
  for (const k of firmDisplayMatchKeys(leadName)) {
    const id = vcFirmIdByKey.get(k);
    if (id) return id;
  }
  return null;
}

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

type OrgLookupMaps = { byName: Map<string, string>; byHost: Map<string, string> };

function useOrganizationIdLookupMaps(): OrgLookupMaps {
  const { companies } = useCompanyDirectory(8000);
  return useMemo(() => {
    const byName = new Map<string, string>();
    const byHost = new Map<string, string>();
    for (const c of companies) {
      const nk = normalizeOrgNameKey(c.name);
      if (nk) byName.set(nk, c.id);
      const h = websiteHost(c.website);
      if (h) byHost.set(h, c.id);
    }
    return { byName, byHost };
  }, [companies]);
}

function resolveOrganizationId(row: RecentFundingRound, maps: OrgLookupMaps): string | null {
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

const companyNameClass =
  "font-semibold text-sm text-foreground truncate hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm min-w-0";

const linkLeadClass =
  "text-sm text-foreground truncate hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm";

function FundingRowDesktop({
  row,
  vcFirmIdByKey,
  organizationId,
}: {
  row: RecentFundingRound;
  vcFirmIdByKey: Map<string, string>;
  organizationId: string | null;
}) {
  const dateLabel = (() => {
    try {
      return format(parseISO(row.announcedAt), "MMM d, yyyy");
    } catch {
      return row.announcedAt;
    }
  })();

  const leadFirmId = resolveVcFirmId(row.leadInvestor, vcFirmIdByKey);

  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/25 transition-colors">
      <td className="py-3 pr-3 align-middle">
        <div className="flex items-center gap-3 min-w-0">
          <FirmLogo firmName={row.companyName} websiteUrl={row.websiteUrl} size="sm" className="shrink-0 rounded-lg" />
          {organizationId ? (
            <Link to={`/companies/${organizationId}`} className={companyNameClass}>
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
        <span className="line-clamp-2">{row.sector}</span>
      </td>
      <td className="py-3 px-2 align-middle whitespace-nowrap text-sm text-foreground">{row.roundKind}</td>
      <td className="py-3 px-2 align-middle whitespace-nowrap text-sm text-foreground tabular-nums">{row.amountLabel}</td>
      <td className="py-3 px-2 align-middle min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {row.leadWebsiteUrl ? (
            <FirmLogo firmName={row.leadInvestor} websiteUrl={row.leadWebsiteUrl} size="sm" className="shrink-0" />
          ) : null}
          {leadFirmId ? (
            <Link to={`/firms/${leadFirmId}`} className={cn(linkLeadClass, "min-w-0")}>
              {row.leadInvestor}
            </Link>
          ) : row.leadWebsiteUrl ? (
            <a
              href={row.leadWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(linkLeadClass, "min-w-0")}
            >
              {row.leadInvestor}
            </a>
          ) : (
            <span className="text-sm text-foreground truncate">{row.leadInvestor}</span>
          )}
        </div>
      </td>
      <td className="py-3 px-2 align-middle text-sm text-muted-foreground min-w-[120px] max-w-[220px]">
        {row.coInvestors.length ? (
          <span className="line-clamp-2">{row.coInvestors.join(", ")}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="py-3 px-2 align-middle whitespace-nowrap text-sm text-muted-foreground tabular-nums">{dateLabel}</td>
      <td className="py-3 pl-2 align-middle whitespace-nowrap text-right">
        <a
          href={row.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
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
  vcFirmIdByKey,
  organizationId,
}: {
  row: RecentFundingRound;
  vcFirmIdByKey: Map<string, string>;
  organizationId: string | null;
}) {
  const dateLabel = (() => {
    try {
      return format(parseISO(row.announcedAt), "MMM d, yyyy");
    } catch {
      return row.announcedAt;
    }
  })();

  const leadFirmId = resolveVcFirmId(row.leadInvestor, vcFirmIdByKey);

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3 shadow-sm">
      <div className="flex items-start gap-3">
        <FirmLogo firmName={row.companyName} websiteUrl={row.websiteUrl} size="md" className="shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          {organizationId ? (
            <Link
              to={`/companies/${organizationId}`}
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
            <p className="text-sm text-foreground">{row.sector}</p>
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
          <div className="flex items-center gap-2 min-w-0">
            {row.leadWebsiteUrl ? (
              <FirmLogo firmName={row.leadInvestor} websiteUrl={row.leadWebsiteUrl} size="sm" className="shrink-0" />
            ) : null}
            {leadFirmId ? (
              <Link to={`/firms/${leadFirmId}`} className={cn(linkLeadClass, "text-left")}>
                {row.leadInvestor}
              </Link>
            ) : row.leadWebsiteUrl ? (
              <a href={row.leadWebsiteUrl} target="_blank" rel="noopener noreferrer" className={linkLeadClass}>
                {row.leadInvestor}
              </a>
            ) : (
              <span className="text-foreground">{row.leadInvestor}</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Co-investors</p>
          <p className="text-muted-foreground">{row.coInvestors.length ? row.coInvestors.join(", ") : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Date</p>
          <p className="text-muted-foreground tabular-nums">{dateLabel}</p>
        </div>
        <div className="flex items-center justify-between pt-1">
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
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
  const vcFirmIdByKey = useVcFirmIdByMatchKey();
  const orgMaps = useOrganizationIdLookupMaps();

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Recent funding</h1>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
          Newly funded early-stage companies with sector, stage, round size, lead, co-investors, and primary press link — same shape as{" "}
          <a href={GALLERY_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
            startups.gallery/news
          </a>
          .
        </p>
      </div>

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
                <th className="py-2.5 px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">Date</th>
                <th className="py-2.5 pl-2 pr-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold text-right">Source</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_FUNDING_ROUNDS.map((row) => (
                <FundingRowDesktop
                  key={row.id}
                  row={row}
                  vcFirmIdByKey={vcFirmIdByKey}
                  organizationId={resolveOrganizationId(row, orgMaps)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {RECENT_FUNDING_ROUNDS.map((row) => (
          <FundingCardMobile
            key={row.id}
            row={row}
            vcFirmIdByKey={vcFirmIdByKey}
            organizationId={resolveOrganizationId(row, orgMaps)}
          />
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
        Coverage is curated from public announcements for in-product context; verify terms in the original source before relying on it for decisions.
      </p>
    </div>
  );
}
