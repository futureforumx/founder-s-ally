import { useState, useCallback, useEffect } from "react";
import type { OnboardingState } from "@/components/onboarding-wizard/types";
import { defaultOnboardingState } from "@/components/onboarding-wizard/types";

const STORAGE_KEY = "onboarding-wizard-state";

export function useOnboardingState() {
  const [state, setState] = useState<OnboardingState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaultOnboardingState, ...JSON.parse(saved) } : defaultOnboardingState;
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
    setState(defaultOnboardingState);
  }, []);

  return { state, update, reset };
}
