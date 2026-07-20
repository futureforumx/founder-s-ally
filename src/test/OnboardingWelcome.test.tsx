import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepWelcome } from "@/components/onboarding-wizard/StepWelcome";
import { defaultOnboardingState } from "@/components/onboarding-wizard/types";

describe("first-login onboarding welcome", () => {
  it("lets a founder continue into profile setup", () => {
    const onNext = vi.fn();
    render(
      <StepWelcome state={defaultOnboardingState} update={vi.fn()} onNext={onNext} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue as a founder/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("switches the selected path", () => {
    const update = vi.fn();
    render(
      <StepWelcome state={defaultOnboardingState} update={update} onNext={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /operator/i }));
    expect(update).toHaveBeenCalledWith({ userType: "operator" });
  });
});
