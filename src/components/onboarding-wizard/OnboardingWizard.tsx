import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useOnboardingState } from "@/hooks/useOnboardingState";
import { ProgressBar } from "./ProgressBar";
import { StepIdentity } from "./StepIdentity";
import { StepCompanyDNA } from "./StepCompanyDNA";
import { StepPowerUp } from "./StepPowerUp";
import { StepPrivacy } from "./StepPrivacy";
import { toast } from "@/hooks/use-toast";

export function OnboardingWizard() {
  const { state, update, reset } = useOnboardingState();
  const navigate = useNavigate();

  const goTo = useCallback((step: number) => update({ step }), [update]);

  const handleFinish = () => {
    toast({ title: `Welcome, ${state.fullName || state.companyName || "Founder"}!`, description: "Here's your Intelligence Engine." });
    reset();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ProgressBar currentStep={state.step} />

      <div className="flex-1 flex items-start justify-center px-4 py-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          {state.step === 1 && (
            <StepIdentity key="s1" state={state} update={update} onNext={() => goTo(2)} />
          )}
          {state.step === 2 && (
            <StepCompanyDNA key="s2" state={state} update={update} onNext={() => goTo(3)} onBack={() => goTo(1)} />
          )}
          {state.step === 3 && (
            <StepPowerUp key="s3" state={state} update={update} onNext={() => goTo(4)} onBack={() => goTo(2)} />
          )}
          {state.step === 4 && (
            <StepPrivacy key="s4" state={state} update={update} onBack={() => goTo(3)} onFinish={handleFinish} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
