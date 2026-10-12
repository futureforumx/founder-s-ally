import { useCallback, useEffect, useState } from "react";
import type { CompanyData } from "@/components/company-profile/types";

export type ProfileFields = Partial<CompanyData>;

export function readStoredProfileFields(): ProfileFields {
  try {
    const saved = localStorage.getItem("company-profile");
    return saved ? (JSON.parse(saved) as ProfileFields) : {};
  } catch {
    return {};
  }
}

/**
 * Reads the raw stored profile rather than going through useStoredCompanyProfile,
 * which returns null until a company name exists — the Data Room fields should be
 * editable before then.
 */
export function useCompanyProfileFields() {
  const [profile, setProfile] = useState<ProfileFields>(readStoredProfileFields);

  useEffect(() => {
    const sync = () => setProfile(readStoredProfileFields());
    window.addEventListener("company-profile-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("company-profile-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const patch = useCallback((changes: ProfileFields) => {
    const next = { ...readStoredProfileFields(), ...changes };
    try {
      localStorage.setItem("company-profile", JSON.stringify(next));
    } catch {
      return;
    }
    setProfile(next);
    window.dispatchEvent(new Event("company-profile-changed"));
  }, []);

  return { profile, patch };
}
