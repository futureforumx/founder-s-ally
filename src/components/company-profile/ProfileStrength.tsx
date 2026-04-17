import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, ChevronRight, Sparkles, PartyPopper } from "lucide-react";
import confetti from "canvas-confetti";

interface ProfileStrengthProps {
  completionPercent: number;
  sectionConfirmed: Record<string, boolean>;
  investorsConfirmed: boolean;
  investorSectionRef: React.RefObject<HTMLDivElement | null>;
}

interface StepItem {
  key: string;
  label: string;
  bonus: string;
  isComplete: boolean;
  scrollTarget: string | null;
}

function getColorClass(percent: number) {
  if (percent >= 81) return "text-emerald-500";
  if (percent >= 50) return "text-amber-400";
  return "text-rose-500";
}

function getBarColor(percent: number) {
  if (percent >= 81) return "bg-emerald-500";
  if (percent >= 50) return "bg-amber-400";
  return "bg-rose-500";
}

export function ProfileStrength({
  completionPercent,
  sectionConfirmed,
  investorsConfirmed,
  investorSectionRef,
}: ProfileStrengthProps) {
  const [didPop, setDidPop] = useState(false);
  const [hasCelebrated, setHasCelebrated] = useState(false);
  const prevPercent = useRef(completionPercent);

  // Pop animation when percentage increases
  useEffect(() => {
    if (completionPercent > prevPercent.current) {
      setDidPop(true);
      const t = setTimeout(() => setDidPop(false), 400);
      prevPercent.current = completionPercent;
      return () => clearTimeout(t);
    }
    prevPercent.current = completionPercent;
  }, [completionPercent]);

  // Confetti on 100%
  useEffect(() => {
    if (completionPercent === 100 && !hasCelebrated) {
      setHasCelebrated(true);
      const end = Date.now() + 1500;
      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60 + Math.random() * 60,
          spread: 55,
          origin: { x: Math.random(), y: 0.6 },
          colors: ["#2EE6A6", "#4de9b8", "#6eedcc", "#fbbf24", "#5B5CFF"],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
    if (completionPercent < 100) setHasCelebrated(false);
  }, [completionPercent, hasCelebrated]);

  const allSteps: StepItem[] = useMemo(() => [
    {
      key: "overview",
      label: "Confirm Overview section",
      bonus: "+25%",
      isComplete: !!sectionConfirmed.overview,
      scrollTarget: "overview",
    },
    {
      key: "positioning",
      label: "Verify Positioning details",
      bonus: "+25%",
      isComplete: !!sectionConfirmed.positioning,
      scrollTarget: "positioning",
    },
    {
      key: "metrics",
      label: "Verify LTV/CAC ratio",
      bonus: "+25%",
      isComplete: !!sectionConfirmed.metrics,
      scrollTarget: "metrics",
    },
    {
      key: "social",
      label: "Add Social Links",
      bonus: "+25%",
      isComplete: !!sectionConfirmed.social,
      scrollTarget: "social",
    },
    {
      key: "investors",
      label: "Confirm Investors",
      bonus: "Unlock",
      isComplete: investorsConfirmed,
      scrollTarget: null, // uses ref
    },
  ], [sectionConfirmed, investorsConfirmed]);

  const incompleteSteps = allSteps.filter(s => !s.isComplete);
  const visibleSteps = incompleteSteps.slice(0, 3);
  const isComplete = completionPercent === 100;

  const handleStepClick = (step: StepItem) => {
    if (step.key === "investors") {
      investorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (step.scrollTarget) {
      window.dispatchEvent(new CustomEvent("scroll-to-section", { detail: step.scrollTarget }));
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
      {/* Hero Percentage */}
      <div className="flex flex-col items-start">
        <motion.span
          className={`text-4xl font-extrabold tabular-nums leading-none ${isComplete ? "text-emerald-500" : getColorClass(completionPercent)}`}
          animate={{
            scale: didPop ? 1.12 : 1,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          style={{
            textShadow: isComplete ? "0 0 16px rgba(16,185,129,0.35)" : "none",
          }}
        >
          <span className={isComplete ? "" : "animate-pulse"}>
            {completionPercent}%
          </span>
        </motion.span>
        <p className="text-[10px] text-muted-foreground mt-1">
          {isComplete ? "All sections verified" : `${incompleteSteps.length} step${incompleteSteps.length !== 1 ? "s" : ""} remaining`}
        </p>
      </div>

      {/* Traffic-light progress bar */}
      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${getBarColor(completionPercent)}`}
          initial={{ width: 0 }}
          animate={{ width: `${completionPercent}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {/* Next Steps or Celebration */}
      <AnimatePresence mode="wait">
        {isComplete ? (
          <motion.div
            key="complete"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-2.5 pt-1"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <PartyPopper className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                ✨ You are ready to match!
              </p>
              <p className="text-[10px] text-muted-foreground">All sections verified — investor matching is active.</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="steps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-1 pt-1"
          >
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Next steps to reach 100%
            </p>
            <div className="flex flex-col gap-1 mt-1.5">
              <AnimatePresence>
                {visibleSteps.map((step) => (
                  <motion.button
                    key={step.key}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => handleStepClick(step)}
                    className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors group text-left"
                  >
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    <span className="text-xs text-foreground flex-1">{step.label}</span>
                    <span className="text-[10px] font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-md">
                      {step.bonus}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-accent transition-colors" />
                  </motion.button>
                ))}
              </AnimatePresence>
              {incompleteSteps.length > 3 && (
                <p className="text-[10px] text-muted-foreground pl-2 pt-1">
                  +{incompleteSteps.length - 3} more step{incompleteSteps.length - 3 > 1 ? "s" : ""}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
