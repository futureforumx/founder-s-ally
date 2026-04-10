import { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { buildCompanyLogoCandidates } from "@/lib/company-logo";

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
  const candidates = useMemo(
    () => buildCompanyLogoCandidates({ logoUrl, websiteUrl, size }),
    [logoUrl, websiteUrl, size],
  );
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
        onError={() => setCandidateIndex((prev) => prev + 1)}
      />
    );
  }

  if (hasProfile) {
    return <span className={initialClassName}>{initial}</span>;
  }

  return <Building2 className={iconClassName} aria-hidden />;
}
