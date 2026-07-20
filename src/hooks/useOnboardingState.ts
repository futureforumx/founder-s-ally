import { useState, useCallback, useEffect } from "react";
import type { OnboardingState } from "@/components/onboarding-wizard/types";
import { defaultOnboardingState } from "@/components/onboarding-wizard/types";

const STORAGE_KEY = "onboarding-wizard-state-v2";
const LEGACY_STORAGE_KEY = "onboarding-wizard-state";

export function useOnboardingState() {
  const [state, setState] = useState<OnboardingState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaultOnboardingState, ...JSON.parse(saved) };

      const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacySaved) return defaultOnboardingState;
      const legacy = JSON.parse(legacySaved) as Partial<OnboardingState>;
      const migratedStep = legacy.step === 2 ? 3 : legacy.firstName ? 2 : 1;
      return { ...defaultOnboardingState, ...legacy, step: migratedStep };
    } catch {
      return defaultOnboardingState;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = useCallback((partial: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    setState(defaultOnboardingState);
  }, []);

  return { state, update, reset };
}
