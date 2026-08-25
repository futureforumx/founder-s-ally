import { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { buildCompanyLogoCandidates } from "@/lib/company-logo";
import { isThirdPartyFaviconProxyUrl } from "@/lib/firmLogoUrl";
import { safeTrim } from "@/lib/utils";

type CompanySettingsLogoProps = {
  companyName?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  size?: number;
  hasProfile?: boolean;
  alt?: string;
  imgClassName: string;
  initialClassName: string;
  iconClassName: string;
};

export function CompanySettingsLogo({
  companyName,
  logoUrl,
  websiteUrl,
  size = 128,
  hasProfile = false,
  alt = "",
  imgClassName,
  initialClassName,
  iconClassName,
}: CompanySettingsLogoProps) {
  const candidates = useMemo(() => {
    const built = buildCompanyLogoCandidates({ logoUrl, websiteUrl, size });
    const raw = safeTrim(logoUrl);
    // Keep an explicitly synced Google favicon so it is not dropped before site fallbacks.
    if (raw && isThirdPartyFaviconProxyUrl(raw) && !built.includes(raw)) {
      return [raw, ...built];
    }
    return built;
  }, [logoUrl, websiteUrl, size]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const currentSrc = candidates[candidateIndex] ?? null;
  const initial = companyName?.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  if (currentSrc) {
    return (
      <img
        key={currentSrc}
        src={currentSrc}
        alt={alt}
        className={imgClassName}
        referrerPolicy="no-referrer"
        onError={() => setCandidateIndex((prev) => prev + 1)}
      />
    );
  }

  if (hasProfile) {
    return <span className={initialClassName}>{initial}</span>;
  }

  return <Building2 className={iconClassName} aria-hidden />;
}
