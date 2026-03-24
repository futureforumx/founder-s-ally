import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { num: 1, label: "Identity" },
  { num: 2, label: "Company" },
  { num: 3, label: "Power Up" },
];

interface ProgressBarProps {
  currentStep: number;
}

export function ProgressBar({ currentStep }: ProgressBarProps) {
  return (
    <div className="w-full px-4 pt-4 pb-1">
      <div className="flex items-center justify-between max-w-md mx-auto">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
                  currentStep > s.num
                    ? "bg-primary text-primary-foreground"
                    : currentStep === s.num
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {currentStep > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium transition-colors",
                  currentStep >= s.num ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 mx-3 mt-[-18px]">
                <div className="h-[2px] w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: currentStep > s.num ? "100%" : "0%" }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-center text-[11px] text-muted-foreground mt-2">About 3 minutes</p>
    </div>
  );
}
