import type { OnboardingData } from "@/hooks/useUserPreferences";
import type { OnboardingState } from "@/components/onboarding-wizard/types";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;

  return {};
}

function asIso(value: unknown): string | undefined {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function asNumberMap(value: unknown): Record<string, number> {
  const source = asRecord(value);
  const next: Record<string, number> = {};

  for (const [key, raw] of Object.entries(source)) {
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) next[key] = raw;
  }

  return next;
}

function asStringMap(value: unknown): Record<string, string> {
  const source = asRecord(value);
  const next: Record<string, string> = {};

  for (const [key, raw] of Object.entries(source)) {
    if (typeof raw === "string") next[key] = raw;
  }

  return next;
}

export function withOnboardingTelemetry(
  existing: OnboardingData | null | undefined,
  state: OnboardingState,
  event: "autosave" | "complete",
): OnboardingData {
  const now = new Date().toISOString();
  const prior = existing ?? {};
  const lastStep = typeof prior.lastStep === "number" ? prior.lastStep : state.step;
  const lastStepAt = asIso(prior.lastStepAt) ?? now;
  const stepEnteredAt = asStringMap(prior.stepEnteredAt);
  const stepDurationsMs = asNumberMap(prior.stepDurationsMs);
  const stepKey = String(state.step);

  if (!stepEnteredAt[stepKey]) stepEnteredAt[stepKey] = now;

  if (state.step !== lastStep) {
    const elapsed = Date.now() - Date.parse(lastStepAt);

    if (Number.isFinite(elapsed) && elapsed > 0) {
      const key = String(lastStep);
      stepDurationsMs[key] = (stepDurationsMs[key] ?? 0) + elapsed;
    }
  }

  if (event === "complete") {
    const elapsed = Date.now() - Date.parse(asIso(prior.lastStepAt) ?? lastStepAt);

    if (Number.isFinite(elapsed) && elapsed > 0) {
      stepDurationsMs[stepKey] = (stepDurationsMs[stepKey] ?? 0) + elapsed;
    }
  }

  return {
    ...prior,
    wizardState: state,
    startedAt: asIso(prior.startedAt) ?? now,
    completedAt: event === "complete" ? now : asIso(prior.completedAt),
    lastStep: state.step,
    lastStepAt: now,
    stepEnteredAt,
    stepDurationsMs,
  };
}
