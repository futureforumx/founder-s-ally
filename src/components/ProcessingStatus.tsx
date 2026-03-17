import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const steps = [
  { id: "parse", label: "Parsing Financials" },
  { id: "tam", label: "Checking TAM Logic" },
  { id: "team", label: "Scanning Team Moat" },
  { id: "gtm", label: "Reviewing GTM Strategy" },
  { id: "comp", label: "Mapping Competitive Landscape" },
  { id: "score", label: "Calculating Diligence Score" },
];

interface ProcessingStatusProps {
  onComplete: () => void;
}

export function ProcessingStatus({ onComplete }: ProcessingStatusProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(timer);
          setTimeout(onComplete, 800);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className="surface-card p-6">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">Diligence Checklist</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">The Associate is reviewing your deck</p>

      <div className="mt-5 space-y-3">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-3">
            {i < currentStep ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/10">
                <Check className="h-3 w-3 text-success" />
              </div>
            ) : i === currentStep ? (
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            ) : (
              <div className="h-5 w-5 rounded-full border border-border" />
            )}
            <span className={`font-mono text-xs ${
              i <= currentStep ? "text-foreground" : "text-muted-foreground/50"
            }`}>
              {step.label}
              {i === currentStep && (
                <span className="ml-2 animate-pulse text-accent">...</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
