import { ArrowRight, BriefcaseBusiness, Check, Sparkles, UserRoundCog, UsersRound } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InvestorWaitlistForm } from "./InvestorWaitlistForm";
import type { OnboardingState } from "./types";

interface StepWelcomeProps {
  state: OnboardingState;
  update: (partial: Partial<OnboardingState>) => void;
  onNext: () => void;
}

const paths = [
  { id: "founder", label: "Founder", description: "Build your company profile and find the right investors.", icon: UsersRound },
  { id: "operator", label: "Operator", description: "Map your network and discover high-signal opportunities.", icon: UserRoundCog },
  { id: "investor", label: "Investor", description: "Discover companies and build a sharper market view.", icon: BriefcaseBusiness },
] as const;

export function StepWelcome({ state, update, onNext }: StepWelcomeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full"
    >
      <div className="mb-7">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
          <Sparkles className="h-3 w-3" /> Personalized setup
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Welcome to Vekta</h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          Tell us how you work so your intelligence feed, network, and recommendations start relevant.
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Which best describes you?
        </legend>
        {paths.map((path) => {
          const Icon = path.icon;
          const selected = state.userType === path.id;
          return (
            <button
              key={path.id}
              type="button"
              aria-pressed={selected}
              onClick={() => update({ userType: path.id })}
              className={cn(
                "group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all duration-200",
                selected
                  ? "border-primary/70 bg-primary/[0.08] shadow-[0_0_0_1px_hsl(var(--primary)/0.12)]"
                  : "border-border/80 bg-card/70 hover:border-border hover:bg-muted/30",
              )}
            >
              <span className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors",
                selected
                  ? "border-primary/30 bg-primary/15 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground group-hover:text-foreground",
              )}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{path.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{path.description}</span>
              </span>
              <span className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}>
                {selected && <Check className="h-3 w-3" />}
              </span>
            </button>
          );
        })}
      </fieldset>

      {state.userType === "investor" ? (
        <div className="mt-6 border-t border-border/70 pt-6">
          <InvestorWaitlistForm />
        </div>
      ) : (
        <div className="mt-7">
          <Button onClick={onNext} className="h-11 w-full gap-2 text-sm">
            Continue as {state.userType === "operator" ? "an operator" : "a founder"}
            <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            About 2 minutes · You can update everything later
          </p>
        </div>
      )}
    </motion.div>
  );
}
