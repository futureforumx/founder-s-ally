import { useEffect, useState } from "react";
import { EMPTY_FORM, sanitizeCompanyData, type CompanyData } from "@/components/company-profile/types";

function readStoredCompanyProfile(): CompanyData | null {
  try {
    const saved = localStorage.getItem("company-profile");
    if (!saved) return null;
    return sanitizeCompanyData(JSON.parse(saved));
  } catch {
    return null;
  }
}

/** Founder company profile from localStorage (same source as Index / Settings). */
export function useStoredCompanyProfile(): CompanyData | null {
  const [profile, setProfile] = useState<CompanyData | null>(() => readStoredCompanyProfile());

  useEffect(() => {
    const sync = () => setProfile(readStoredCompanyProfile());
    window.addEventListener("company-profile-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("company-profile-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return profile;
}

export function storedCompanyProfileOrEmpty(): CompanyData {
  return readStoredCompanyProfile() ?? EMPTY_FORM;
}
