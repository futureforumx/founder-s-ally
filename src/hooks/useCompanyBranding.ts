import { useEffect, useState } from "react";

export interface CompanyBranding {
  companyName: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  hasProfile: boolean;
}

function readCompanyBranding(): CompanyBranding {
  try {
    const savedProfile = localStorage.getItem("company-profile");
    const parsedProfile = savedProfile ? JSON.parse(savedProfile) : null;

    const explicitLogoUrl = localStorage.getItem("company-logo-url");
    const profileLogoUrl =
      typeof parsedProfile?.logo_url === "string" && parsedProfile.logo_url.trim().length > 0
        ? parsedProfile.logo_url.trim()
        : null;

    return {
      companyName: typeof parsedProfile?.name === "string" && parsedProfile.name.trim().length > 0 ? parsedProfile.name : null,
      logoUrl: explicitLogoUrl || profileLogoUrl,
      websiteUrl: typeof parsedProfile?.website === "string" && parsedProfile.website.trim().length > 0 ? parsedProfile.website : null,
      hasProfile: Boolean(parsedProfile?.name),
    };
  } catch {
    return { companyName: null, logoUrl: null, websiteUrl: null, hasProfile: false };
  }
}

/**
 * Reads the founder's own company branding (name, logo, website) from the
 * same localStorage source used across the app shell (see Index.tsx / GlobalTopNav),
 * so any surface can render the account's real logo without prop-drilling.
 */
export function useCompanyBranding(): CompanyBranding {
  const [branding, setBranding] = useState<CompanyBranding>(() => readCompanyBranding());

  useEffect(() => {
    const sync = () => setBranding(readCompanyBranding());
    window.addEventListener("company-profile-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("company-profile-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return branding;
}
