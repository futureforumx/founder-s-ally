import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface TourStep {
  /** CSS selector for the element to spotlight */
  selector: string;
  /** Title displayed in the tooltip */
  title: string;
  /** Description displayed in the tooltip */
  description: string;
  /** Which settings section tab to activate before highlighting */
  sectionId?: string;
  /** Placement of the tooltip relative to the spotlight */
  placement?: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="personal"]',
    title: "Your Verified Identity",
    description: "This is where you manage your personal profile — name, title, social links, and resume.",
    sectionId: "personal",
    placement: "bottom",
  },
  {
    selector: '[data-tour="company"]',
    title: "Company Data & Pitch Decks",
    description: "Here you can manage your company data, metrics, and pitch decks for investor matching.",
    sectionId: "company-sec",
    placement: "bottom",
  },
  {
    selector: '[data-tour="network"]',
    title: "Intelligence Sensor Suite",
    description: "Connect your Google and LinkedIn accounts here to power your AI profile and unlock investor insights.",
    sectionId: "network-sec",
    placement: "bottom",
  },
  {
    selector: '[data-tour="profile-strength"]',
    title: "Profile Strength",
    description: "Your profile updates automatically as you connect more data sources. Aim for 100% to unlock all features.",
    placement: "bottom",
  },
];

interface SettingsTourProps {
  onSectionChange?: (sectionId: string) => void;
}

export function SettingsTour({ onSectionChange }: SettingsTourProps) {
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [checked, setChecked] = useState(false);
  const rafRef = useRef<number>();

  // Check if tour should show
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const tourParam = params.get("tour") === "true";

    if (tourParam) {
      // Clear the tour param from URL
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      window.history.replaceState({}, "", url.toString());
      setActive(true);
      setChecked(true);
      return;
    }

    // Check DB: has_completed_onboarding=true AND has_seen_settings_tour=false
    (supabase as any)
      .from("profiles")
      .select("has_completed_onboarding, has_seen_settings_tour")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.has_completed_onboarding && !data?.has_seen_settings_tour) {
          setActive(true);
        }
        setChecked(true);
      });
  }, [user]);

  // Position the spotlight on the current element
  const positionSpotlight = useCallback(() => {
    if (!active) return;
    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.selector);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect(r);
    } else {
      setRect(null);
    }
    rafRef.current = requestAnimationFrame(positionSpotlight);
  }, [active, currentStep]);

  useEffect(() => {
    if (!active) return;
    // Navigate to the right section before highlighting
    const step = TOUR_STEPS[currentStep];
    if (step.sectionId && onSectionChange) {
      onSectionChange(step.sectionId);
    }
    // Small delay so DOM updates
    const t = setTimeout(() => {
      rafRef.current = requestAnimationFrame(positionSpotlight);
    }, 350);
    return () => {
      clearTimeout(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, currentStep, positionSpotlight, onSectionChange]);

  const markSeen = useCallback(async () => {
    if (!user) return;
    await (supabase as any)
      .from("profiles")
      .update({ has_seen_settings_tour: true })
      .eq("user_id", user.id);
  }, [user]);

  const finish = useCallback(() => {
    setActive(false);
    markSeen();
  }, [markSeen]);

  const next = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      finish();
    }
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  };

  if (!checked || !active) return null;

  const step = TOUR_STEPS[currentStep];
  const padding = 8;

  // Tooltip positioning
  const getTooltipStyle = (): React.CSSProperties => {
    if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    const placement = step.placement || "bottom";
    switch (placement) {
      case "bottom":
        return {
          top: rect.bottom + padding + 12,
          left: rect.left + rect.width / 2,
          transform: "translateX(-50%)",
        };
      case "top":
        return {
          bottom: window.innerHeight - rect.top + padding + 12,
          left: rect.left + rect.width / 2,
          transform: "translateX(-50%)",
        };
      case "right":
        return {
          top: rect.top + rect.height / 2,
          left: rect.right + padding + 12,
          transform: "translateY(-50%)",
        };
      case "left":
        return {
          top: rect.top + rect.height / 2,
          right: window.innerWidth - rect.left + padding + 12,
          transform: "translateY(-50%)",
        };
      default:
        return {
          top: rect.bottom + padding + 12,
          left: rect.left + rect.width / 2,
          transform: "translateX(-50%)",
        };
    }
  };

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-[9999]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Dark overlay with cutout */}
          <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
            <defs>
              <mask id="tour-mask">
                <rect width="100%" height="100%" fill="white" />
                {rect && (
                  <rect
                    x={rect.left - padding}
                    y={rect.top - padding}
                    width={rect.width + padding * 2}
                    height={rect.height + padding * 2}
                    rx={12}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="hsl(var(--background) / 0.75)"
              mask="url(#tour-mask)"
              style={{ pointerEvents: "auto" }}
              onClick={finish}
            />
          </svg>

          {/* Spotlight ring */}
          {rect && (
            <motion.div
              className="absolute border-2 border-accent rounded-xl pointer-events-none"
              style={{
                left: rect.left - padding,
                top: rect.top - padding,
                width: rect.width + padding * 2,
                height: rect.height + padding * 2,
              }}
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="absolute inset-0 rounded-xl shadow-[0_0_24px_hsl(var(--accent)/0.35)] animate-pulse" />
            </motion.div>
          )}

          {/* Tooltip card */}
          <motion.div
            className="absolute z-10 w-80 rounded-xl border border-border bg-card shadow-2xl p-5"
            style={getTooltipStyle()}
            key={currentStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, delay: 0.1 }}
          >
            {/* Close */}
            <button
              onClick={finish}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-accent">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </span>
            </div>

            <h3 className="text-sm font-semibold text-foreground mb-1">{step.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">{step.description}</p>

            {/* Progress dots */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {TOUR_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === currentStep
                        ? "w-4 bg-accent"
                        : i < currentStep
                          ? "w-1.5 bg-accent/50"
                          : "w-1.5 bg-muted-foreground/20"
                    )}
                  />
                ))}
              </div>

              <div className="flex gap-1.5">
                {currentStep > 0 && (
                  <Button variant="ghost" size="sm" onClick={prev} className="h-7 px-2 text-xs">
                    <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Back
                  </Button>
                )}
                <Button size="sm" onClick={next} className="h-7 px-3 text-xs gap-1">
                  {currentStep === TOUR_STEPS.length - 1 ? "Done" : "Next"}
                  {currentStep < TOUR_STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
