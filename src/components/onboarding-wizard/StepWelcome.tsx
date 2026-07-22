import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, Sparkles, UserRoundCog, UsersRound } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SmartCombobox, type ComboboxOption } from "@/components/ui/smart-combobox";
import { ROLE_OPTIONS } from "@/constants/roleOptions";
import { cn } from "@/lib/utils";
import { InvestorWaitlistForm } from "./InvestorWaitlistForm";
import type { OnboardingState } from "./types";

interface StepWelcomeProps {
  state: OnboardingState;
  update: (partial: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack?: () => void;
}

const paths = [
  { id: "founder", label: "Founder", description: "Build your company profile and find the right investors.", icon: UsersRound },
  { id: "operator", label: "Operator", description: "Map your network and discover high-signal opportunities.", icon: UserRoundCog },
  { id: "investor", label: "Investor", description: "Discover companies and build a sharper market view.", icon: BriefcaseBusiness },
] as const;

const POPULAR_TITLES: Record<string, string[]> = {
  founder: ["Founder", "Co-Founder", "CEO & Founder", "CEO & Co-Founder", "Solo Founder", "CTO & Co-Founder", "COO", "CPO"],
  operator: ["COO", "Chief of Staff", "VP of Operations", "VP of Product", "Head of Ops", "Head of Product", "Head of Growth", "Strategy & Ops"],
  investor: ["Managing Partner", "General Partner", "Partner", "Venture Partner", "Principal", "Investment Director", "Investment Manager", "Investment Associate", "Investment Analyst", "Angel Investor"],
};

function titleOptionsFor(userType: string): ComboboxOption[] {
  const priorities = POPULAR_TITLES[userType] || [];
  const order = new Map(priorities.map((title, index) => [title, index]));
  return [...ROLE_OPTIONS].sort((a, b) => {
    const aOrder = order.get(a.value) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(b.value) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
}

export function StepWelcome({ state, update, onNext, onBack }: StepWelcomeProps) {
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
              onClick={() => update({ userType: path.id, ...(state.userType === path.id ? {} : { title: "" }) })}
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

      <AnimatePresence initial={false}>
        {state.userType && (
          <motion.div
            key={state.userType}
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-visible"
          >
            <div className="mt-6 border-t border-border/70 pt-6">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                What is your title? <span className="text-primary">*</span>
              </label>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">
                Start typing or select a popular {state.userType} title.
              </p>
              <SmartCombobox
                value={state.title}
                onChange={(title) => update({ title })}
                options={titleOptionsFor(state.userType)}
                placeholder={state.userType === "investor" ? "e.g. General Partner" : state.userType === "operator" ? "e.g. Chief of Staff" : "e.g. CEO & Founder"}
                required
                className="[&_input]:h-11"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {state.userType === "investor" && state.title.trim() ? (
        <div className="mt-6 border-t border-border/70 pt-6">
          <InvestorWaitlistForm />
        </div>
      ) : state.userType && state.userType !== "investor" ? (
        <div className="mt-7">
          <div className="flex gap-3">
            {onBack && (
              <Button variant="outline" onClick={onBack} className="h-11 gap-2 px-4 text-sm">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Button onClick={onNext} disabled={!state.title.trim()} className="h-11 flex-1 gap-2 text-sm">
              Continue as {state.userType === "operator" ? "an operator" : "a founder"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            About 2 minutes · You can update everything later
          </p>
        </div>
      ) : !state.userType && onBack ? (
        <div className="mt-7">
          <Button variant="ghost" onClick={onBack} className="h-10 gap-2 px-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      ) : null}
    </motion.div>
  );
}
