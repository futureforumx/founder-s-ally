import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Sparkles, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export interface TourStep {
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
  /** If true, show a full-screen intro popup instead of a spotlight */
  isIntro?: boolean;
  /** Section key to expand (dispatches tour-expand-section event) */
  expandSection?: string;
}

const TOUR_STEPS: TourStep[] = [
  // ── Intro: Data Sources ──
  {
    selector: '[data-tour-section="data-sources"]',
    title: "Data Sources",
    description: "First, let's connect your identity sources — LinkedIn, X, and your resume. This powers your AI profile.",
    sectionId: "personal",
    placement: "bottom",
    isIntro: true,
    expandSection: "data-sources",
  },
  {
    selector: '[data-tour-section="data-sources"]',
    title: "Verify Your Data",
    description: "Add your LinkedIn and X URLs, then click 'Verify Data' to auto-fill your profile with AI-extracted information.",
    sectionId: "personal",
    placement: "bottom",
    expandSection: "data-sources",
  },
  // ── Intro: Profile ──
  {
    selector: '[data-tour-section="profile"]',
    title: "Personal information",
    description: "Next up: your personal identity. Confirm your full name and details so investors know who you are.",
    sectionId: "personal",
    placement: "bottom",
    isIntro: true,
    expandSection: "profile",
  },
  {
    selector: '[data-tour-section="profile"]',
    title: "Confirm Your Details",
    description: "Review your personal information and email. Click 'Confirm Details' when everything looks right.",
    sectionId: "personal",
    placement: "bottom",
    expandSection: "profile",
  },
  // ── Intro: Company ──
  {
    selector: '[data-tour="company"]',
    title: "Company",
    description: "Now let's set up your company profile — metrics, pitch deck, and sector information for investor matching.",
    sectionId: "company-sec",
    placement: "bottom",
    isIntro: true,
  },
  {
    selector: '[data-tour="company"]',
    title: "Company Data & Pitch Decks",
    description: "Upload your pitch deck, set your stage and sector, and add financial metrics. The more you fill in, the better your matches.",
    sectionId: "company-sec",
    placement: "bottom",
  },
  // ── Intro: Network ──
  {
    selector: '[data-tour="network"]',
    title: "Intelligence Sensor Suite",
    description: "Connect your Google and LinkedIn accounts to power your AI profile and unlock investor insights.",
    sectionId: "network-sec",
    placement: "bottom",
    isIntro: true,
  },
  {
    selector: '[data-tour="network"]',
    title: "Connect Your Accounts",
    description: "Each connected source increases your profile strength and unlocks more intelligent investor recommendations.",
    sectionId: "network-sec",
    placement: "bottom",
  },
  // ── Profile Strength ──
  {
    selector: '[data-tour="profile-strength"]',
    title: "Profile Strength",
    description: "Your profile updates automatically as you connect more data sources. Aim for 100% to unlock all features!",
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
  const [showIntro, setShowIntro] = useState(false);
  const rafRef = useRef<number>();

  // Check if tour should show
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const tourParam = params.get("tour") === "true";

    if (tourParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      window.history.replaceState({}, "", url.toString());
      setActive(true);
      setChecked(true);
      return;
    }

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

  // Handle section expansion when step changes
  useEffect(() => {
    if (!active) return;
    const step = TOUR_STEPS[currentStep];

    // Navigate to section tab
    if (step.sectionId && onSectionChange) {
      onSectionChange(step.sectionId);
    }

    // Expand the right section card
    if (step.expandSection) {
      window.dispatchEvent(new CustomEvent("tour-expand-section", {
        detail: { section: step.expandSection },
      }));
    }

    // Show intro popup or spotlight
    if (step.isIntro) {
      setShowIntro(true);
      setRect(null);
    } else {
      setShowIntro(false);
    }
  }, [active, currentStep, onSectionChange]);

  // Position the spotlight on the current element
  const positionSpotlight = useCallback(() => {
    if (!active || showIntro) return;
    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.selector);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect(r);
    } else {
      setRect(null);
    }
    rafRef.current = requestAnimationFrame(positionSpotlight);
  }, [active, currentStep, showIntro]);

  useEffect(() => {
    if (!active || showIntro) return;
    const t = setTimeout(() => {
      rafRef.current = requestAnimationFrame(positionSpotlight);
    }, 400);
    return () => {
      clearTimeout(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, currentStep, positionSpotlight, showIntro]);

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
  const totalSteps = TOUR_STEPS.length;

  // Tooltip positioning for spotlight mode
  const getTooltipStyle = (): React.CSSProperties => {
    if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    const placement = step.placement || "bottom";
    switch (placement) {
      case "bottom":
        return {
          top: rect.bottom + padding + 12,
          left: Math.min(Math.max(rect.left + rect.width / 2, 180), window.innerWidth - 180),
          transform: "translateX(-50%)",
        };
      case "top":
        return {
          bottom: window.innerHeight - rect.top + padding + 12,
          left: Math.min(Math.max(rect.left + rect.width / 2, 180), window.innerWidth - 180),
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

  // ── Intro Popup (full-screen centered) ──
  if (showIntro) {
    return (
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={finish}
          />

          {/* Intro card */}
          <motion.div
            className="relative z-10 w-[380px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            key={`intro-${currentStep}`}
          >
            {/* Gradient header */}
            <div className="h-20 bg-gradient-to-br from-accent/20 via-primary/10 to-accent/5 flex items-center justify-center relative">
              <motion.div
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-card border border-border shadow-lg"
                initial={{ rotate: -10 }}
                animate={{ rotate: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Rocket className="h-6 w-6 text-accent" />
              </motion.div>
              {/* Close */}
              <button
                onClick={finish}
                className="absolute top-3 right-3 text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 pt-5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-accent font-bold">
                  Section {Math.ceil((currentStep + 1) / 2)} of {Math.ceil(totalSteps / 2)}
                </span>
              </div>

              <h3 className="text-lg font-bold text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">{step.description}</p>

              {/* Progress dots */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {TOUR_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        i === currentStep
                          ? "w-5 bg-accent"
                          : i < currentStep
                            ? "w-1.5 bg-accent/50"
                            : "w-1.5 bg-muted-foreground/20"
                      )}
                    />
                  ))}
                </div>

                <div className="flex gap-1.5">
                  {currentStep > 0 && (
                    <Button variant="ghost" size="sm" onClick={prev} className="h-8 px-3 text-xs">
                      <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Back
                    </Button>
                  )}
                  <Button size="sm" onClick={next} className="h-8 px-4 text-xs gap-1.5 font-semibold">
                    Got it
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Spotlight mode ──
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
                Step {currentStep + 1} of {totalSteps}
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
                  {currentStep === totalSteps - 1 ? "Done" : "Next"}
                  {currentStep < totalSteps - 1 && <ChevronRight className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
