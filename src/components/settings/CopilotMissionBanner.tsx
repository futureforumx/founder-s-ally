import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, TrendingUp, Target, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";

// ── Types ──

interface MissionStep {
  id: string;
  label: string;
  field: string;
  tab: string;
  section: string;
  valueProp: string;
  insight: string;
}

type SaveStatus = "idle" | "saving" | "saved";

interface CopilotMissionBannerProps {
  profileCompletion: number;
  onNavigate: (tab: string, field?: string) => void;
  completedFields?: string[];
  saveStatus?: SaveStatus;
}

// ── Mission Steps (ordered by impact) ──

const MISSION_STEPS: MissionStep[] = [
  {
    id: "pitch-deck",
    label: "Upload Pitch Deck",
    field: "pitch-deck",
    tab: "company",
    section: "entity",
    valueProp: "+45% Match Quality",
    insight: "Investors spend 3m 44s on decks with uploaded assets",
  },
  {
    id: "sector",
    label: "Set Sector Tags",
    field: "sector-tags",
    tab: "company",
    section: "entity",
    valueProp: "+30% Investor Interest",
    insight: "Sector-tagged profiles appear in 3× more searches",
  },
  {
    id: "ltv-cac",
    label: "Add LTV/CAC Ratio",
    field: "ltv-cac",
    tab: "company",
    section: "entity",
    valueProp: "+25% Due Diligence Score",
    insight: "Unit economics are the #1 requested metric by Series A leads",
  },
  {
    id: "mrr",
    label: "Report MRR",
    field: "mrr",
    tab: "company",
    section: "entity",
    valueProp: "+20% Visibility",
    insight: "Revenue metrics unlock the Growth Trajectory badge",
  },
  {
    id: "executive-summary",
    label: "Write Executive Summary",
    field: "executive-summary",
    tab: "company",
    section: "entity",
    valueProp: "+15% Intro Acceptance",
    insight: "Summaries under 200 words convert 2× better",
  },
  {
    id: "website",
    label: "Add Website URL",
    field: "website-url",
    tab: "company",
    section: "entity",
    valueProp: "+10% Trust Score",
    insight: "Profiles with verified domains rank higher",
  },
];

// ── Radial Progress Circle ──

function RadialProgress({
  percent,
  size = 72,
  strokeWidth = 5,
  showConfetti,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  showConfetti?: boolean;
}) {
  const circleRef = useRef<HTMLDivElement>(null);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const controls = useAnimation();

  // Breathing animation
  useEffect(() => {
    controls.start({
      scale: [1, 1.03, 1],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      },
    });
  }, [controls]);

  // Confetti burst
  useEffect(() => {
    if (showConfetti && circleRef.current) {
      const rect = circleRef.current.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { x, y },
        colors: ["#22c55e", "#3b82f6", "#a855f7"],
        scalar: 0.7,
        gravity: 1.2,
        ticks: 80,
      });
    }
  }, [showConfetti]);

  return (
    <motion.div ref={circleRef} animate={controls} className="relative shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          opacity={0.4}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--success))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ filter: "drop-shadow(0 0 6px hsl(var(--success) / 0.4))" }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={percent}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-lg font-bold text-foreground leading-none"
        >
          {percent}%
        </motion.span>
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
          Complete
        </span>
      </div>
    </motion.div>
  );
}

// ── Main Banner ──

export function CopilotMissionBanner({
  profileCompletion,
  onNavigate,
  completedFields = [],
}: CopilotMissionBannerProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [prevCompletion, setPrevCompletion] = useState(profileCompletion);

  // Find next incomplete step
  const nextStep = MISSION_STEPS.find(
    (step) => !completedFields.includes(step.id)
  );

  // Detect completion increase → confetti
  useEffect(() => {
    if (profileCompletion > prevCompletion) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 1500);
      setPrevCompletion(profileCompletion);
      return () => clearTimeout(t);
    }
    setPrevCompletion(profileCompletion);
  }, [profileCompletion, prevCompletion]);

  const handleClick = useCallback(() => {
    if (nextStep) {
      onNavigate(nextStep.tab, nextStep.field);
    }
  }, [nextStep, onNavigate]);

  if (profileCompletion >= 100) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-8 mt-4 mb-1 rounded-2xl border border-success/20 bg-success/5 backdrop-blur-xl p-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
            <Sparkles className="h-5 w-5 text-success" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Profile Complete — Tier-1 Visibility Unlocked</p>
            <p className="text-xs text-muted-foreground">Your profile is now featured in premium investor searches.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.998 }}
      onClick={handleClick}
      className={cn(
        "w-[calc(100%-4rem)] mx-8 mt-4 mb-1 text-left rounded-2xl cursor-pointer",
        "border border-border/50 bg-card/40 backdrop-blur-xl",
        "shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]",
        "transition-shadow duration-300",
        "group"
      )}
    >
      {/* Desktop: row layout / Mobile: stacked */}
      <div className="flex flex-col sm:flex-row items-center gap-4 p-4 sm:p-5">
        {/* Left: Radial Progress */}
        <RadialProgress
          percent={profileCompletion}
          size={72}
          strokeWidth={5}
          showConfetti={showConfetti}
        />

        {/* Right: Copilot Insight */}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5 mb-1">
            <div className="flex items-center gap-1.5 justify-center sm:justify-start">
              <Target className="h-3.5 w-3.5 text-accent shrink-0" />
              <h3 className="text-xs sm:text-sm font-bold text-foreground tracking-tight truncate">
                Mission: Unlock Tier-1 Visibility
              </h3>
            </div>
            {nextStep && (
              <Badge
                className={cn(
                  "bg-success/10 text-success border-success/20",
                  "text-[9px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0",
                  "w-fit mx-auto sm:mx-0"
                )}
              >
                <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                {nextStep.valueProp}
              </Badge>
            )}
          </div>

          {/* Dynamic recommendation */}
          <AnimatePresence mode="wait">
            {nextStep && (
              <motion.div
                key={nextStep.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.25 }}
              >
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground/80">Next → {nextStep.label}:</span>{" "}
                  {nextStep.insight}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA hint */}
          <div className="flex items-center gap-1 mt-2 text-[10px] font-mono uppercase tracking-widest text-accent/70 group-hover:text-accent transition-colors justify-center sm:justify-start">
            <Zap className="h-3 w-3" />
            <AnimatePresence mode="wait">
              <motion.span
                key={nextStep?.id ?? "done"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {nextStep ? `Click to ${nextStep.label}` : "All done"}
              </motion.span>
            </AnimatePresence>
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </motion.button>
  );
}
