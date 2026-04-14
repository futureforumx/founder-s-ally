import { CheckCircle2, ArrowUpRight } from "lucide-react";
import { FirmFavicon } from "@/components/ui/firm-favicon";
import { InvestorPersonAvatar } from "@/components/ui/investor-person-avatar";
import { investorPrimaryAvatarUrl } from "@/lib/investorAvatarUrl";
import type { VCPerson } from "@/hooks/useVCDirectory";
import { sanitizePersonTitle } from "@/lib/sanitizePersonTitle";
import { safeTrim } from "@/lib/utils";

interface InvestorPartnersTabProps {
  firmName: string;
  /** For `[role] at [favicon] [firm]` on each card. */
  firmWebsiteUrl?: string | null;
  firmLogoUrl?: string | null;
  partners: VCPerson[];
  onSelectPerson?: (person: VCPerson) => void;
}

function partnerDisplayRole(p: VCPerson): string | null {
  const t = sanitizePersonTitle(p.title, p.full_name);
  if (t) return t;
  const r = safeTrim(p.role);
  if (r) return r;
  return null;
}

function PartnerCard({
  p,
  firmName,
  firmWebsiteUrl,
  firmLogoUrl,
  onSelectPerson,
}: {
  p: VCPerson;
  firmName: string;
  firmWebsiteUrl: string | null;
  firmLogoUrl: string | null;
  onSelectPerson?: (person: VCPerson) => void;
}) {
  const role = partnerDisplayRole(p);
  const imageUrl = investorPrimaryAvatarUrl({
    avatar_url: p.avatar_url,
    profile_image_url: p.profile_image_url,
  });

  return (
    <div
      onClick={() => onSelectPerson?.(p)}
      className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 cursor-pointer hover:border-accent/40 hover:shadow-sm transition-all group"
    >
      <InvestorPersonAvatar
        imageUrl={imageUrl}
        initials={safeTrim(p.full_name).charAt(0) || null}
        size="md"
        loading="lazy"
        className="h-12 w-12 border border-border shrink-0 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors truncate">
            {p.full_name}
          </span>
          <CheckCircle2 className="h-3.5 w-3.5 text-accent fill-accent/20 shrink-0" />
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {role ? (
            <>
              <span className="shrink-0">{role}</span>
              <span className="shrink-0 text-muted-foreground/75">at</span>
            </>
          ) : null}
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <FirmFavicon websiteUrl={firmWebsiteUrl} logoUrl={firmLogoUrl} name={firmName} />
            <span className="truncate">{firmName}</span>
          </span>
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
    </div>
  );
}

export function InvestorPartnersTab({
  firmName,
  firmWebsiteUrl,
  firmLogoUrl,
  partners,
  onSelectPerson,
}: InvestorPartnersTabProps) {
  return (
    <div className="space-y-3">
      {partners.map((p) => (
        <PartnerCard
          key={p.id}
          p={p}
          firmName={firmName}
          firmWebsiteUrl={firmWebsiteUrl ?? null}
          firmLogoUrl={firmLogoUrl ?? null}
          onSelectPerson={onSelectPerson}
        />
      ))}
    </div>
  );
}
