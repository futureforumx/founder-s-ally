import { useState, useEffect } from "react";
import { CheckCircle2, ArrowUpRight } from "lucide-react";
import { FirmFavicon } from "@/components/ui/firm-favicon";
import { InvestorPersonAvatar, investorPersonImageCandidates } from "@/components/ui/investor-person-avatar";
import type { VCPerson } from "@/hooks/useVCDirectory";

interface InvestorPartnersTabProps {
  firmId: string;
  firmName: string;
  /** For `[role] at [favicon] [firm]` on each card. */
  firmWebsiteUrl?: string | null;
  firmLogoUrl?: string | null;
  partners: VCPerson[];
  onSelectPerson?: (person: VCPerson) => void;
}

function partnerDisplayRole(p: VCPerson): string | null {
  const t = p.title?.trim();
  if (t) return t;
  const r = p.role?.trim();
  if (r) return r;
  return null;
}

/** Lazily fetches a headshot from the firm website when no stored image is available. */
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
  const [fetchedHeadshot, setFetchedHeadshot] = useState<string | null>(null);

  const hasStoredImage = !!(p.profile_image_url?.trim() || p.avatar_url?.trim());

  useEffect(() => {
    if (hasStoredImage || !firmWebsiteUrl || !p.full_name?.trim()) return;
    let cancelled = false;
    async function fetchProfile() {
      try {
        const res = await fetch("/api/person-website-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firmWebsiteUrl,
            fullName: p.full_name,
            title: p.title?.trim() || p.role?.trim() || null,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.headshotUrl) setFetchedHeadshot(data.headshotUrl);
      } catch {
        // silently ignore — fall through to initials
      }
    }
    fetchProfile();
    return () => { cancelled = true; };
  }, [hasStoredImage, firmWebsiteUrl, p.full_name, p.title, p.role]);

  const role = partnerDisplayRole(p);
  const imageUrls = investorPersonImageCandidates({
    profile_image_url: fetchedHeadshot || p.profile_image_url,
    avatar_url: fetchedHeadshot || p.avatar_url,
    firmWebsiteUrl,
    title: p.title,
    role: p.role,
    investorType: p.investor_type,
    email: p.email,
    website_url: p.website_url,
    linkedin_url: p.linkedin_url,
    x_url: p.x_url,
    personal_website_url: p.personal_website_url,
    full_name: p.full_name,
  });

  return (
    <div
      onClick={() => onSelectPerson?.(p)}
      className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 cursor-pointer hover:border-accent/40 hover:shadow-sm transition-all group"
    >
      <InvestorPersonAvatar
        imageUrls={imageUrls}
        size="md"
        className="h-12 w-12 border border-border shrink-0"
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
  firmId: _firmId,
  firmName,
  firmWebsiteUrl = null,
  firmLogoUrl = null,
  partners,
  onSelectPerson,
}: InvestorPartnersTabProps) {
  const displayPartners = partners.length > 0 ? partners : [];

  if (displayPartners.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No partner data available for {firmName}.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Team at {firmName} ({displayPartners.length})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayPartners.map((p) => (
            <PartnerCard
              key={p.id}
              p={p}
              firmName={firmName}
              firmWebsiteUrl={firmWebsiteUrl}
              firmLogoUrl={firmLogoUrl}
              onSelectPerson={onSelectPerson}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
