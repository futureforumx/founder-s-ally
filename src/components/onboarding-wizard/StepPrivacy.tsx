import { motion } from "framer-motion";
import { Shield, Rocket, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { OnboardingState } from "./types";

const TOGGLES: { key: keyof OnboardingState; title: string; sub: string }[] = [
  {
    key: "aiInboxPaths",
    title: "Let the AI find warm investor paths in my inbox",
    sub: "Thread subjects + contact names only. Email bodies never stored.",
  },
  {
    key: "shareAnonMetrics",
    title: "Share anonymized metrics with my founder cohort",
    sub: "You see how you compare. They never see it's you.",
  },
  {
    key: "discoverableToInvestors",
    title: "Make me discoverable to matching investors",
    sub: "Only investors whose thesis matches your profile will see you.",
  },
  {
    key: "useMeetingNotes",
    title: "Use my meeting notes to improve recommendations",
    sub: "Granola and calendar data only. Delete anytime in Settings.",
  },
];

interface StepPrivacyProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onBack: () => void;
  onFinish: () => void;
}

export function StepPrivacy({ state, update, onBack, onFinish }: StepPrivacyProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-lg mx-auto space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Privacy & AI Consent</h1>
        <p className="text-sm text-muted-foreground">You're in control. All toggles are off by default.</p>
      </div>

      <div className="space-y-3">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-start gap-4 rounded-xl border border-border p-4">
            <Switch
              checked={state[t.key] as boolean}
              onCheckedChange={(v) => update({ [t.key]: v })}
              className="mt-0.5 shrink-0"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground leading-snug">{t.title}</p>
              <p className="text-[11px] text-muted-foreground">{t.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center space-y-1">
        <a href="#" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          How we protect your data <ExternalLink className="h-3 w-3" />
        </a>
        <p className="text-[10px] text-muted-foreground">Change all of these anytime in Settings → Privacy.</p>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={onFinish} className="gap-2">
          <Rocket className="h-3.5 w-3.5" />
          Launch My Intelligence Engine
        </Button>
      </div>
    </motion.div>
  );
}
