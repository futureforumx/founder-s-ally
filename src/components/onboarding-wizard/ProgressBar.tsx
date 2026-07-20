import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { num: 1, label: "Your path" },
  { num: 2, label: "Profile" },
  { num: 3, label: "Company" },
];

interface ProgressBarProps {
  currentStep: number;
}

export function ProgressBar({ currentStep }: ProgressBarProps) {
  return (
    <div className="w-full">
      <div className="flex items-start justify-between">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition-all duration-300",
                  currentStep > s.num
                    ? "border-primary bg-primary text-primary-foreground"
                    : currentStep === s.num
                    ? "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15"
                    : "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {currentStep > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] font-medium transition-colors sm:text-[11px]",
                  currentStep >= s.num ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="mx-2 mt-3 flex-1 sm:mx-3">
                <div className="h-px w-full overflow-hidden rounded-full bg-border">
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
    </div>
  );
}
