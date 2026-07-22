import { useState, useCallback, useEffect, useRef } from "react";
import type { OnboardingState } from "@/components/onboarding-wizard/types";
import { defaultOnboardingState } from "@/components/onboarding-wizard/types";

export const ONBOARDING_STORAGE_KEY = "onboarding-wizard-state-v2";
const LEGACY_STORAGE_KEY = "onboarding-wizard-state";

export function useOnboardingState() {
  const hadStoredStateRef = useRef(false);
  const [state, setState] = useState<OnboardingState>(() => {
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (saved) {
        hadStoredStateRef.current = true;
        return { ...defaultOnboardingState, ...JSON.parse(saved) };
      }

      const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacySaved) return defaultOnboardingState;
      hadStoredStateRef.current = true;
      const legacy = JSON.parse(legacySaved) as Partial<OnboardingState>;
      const migratedStep = legacy.step === 2 ? 3 : legacy.firstName ? 2 : 1;
      return { ...defaultOnboardingState, ...legacy, step: migratedStep };
    } catch {
      return defaultOnboardingState;
    }
  });

  useEffect(() => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = useCallback((partial: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    setState(defaultOnboardingState);
  }, []);

  return { state, update, reset, hasStoredState: hadStoredStateRef.current };
}
