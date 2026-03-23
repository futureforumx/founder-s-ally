import { useState } from "react";
import { Linkedin, Sparkles, HelpCircle, ArrowRight, Loader2, Users, UserCog, Briefcase, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import type { OnboardingState } from "./types";

interface StepIdentityProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: () => void;
}

const USER_TYPES = [
  { id: "founder", label: "Founder", icon: Users, desc: "Building a startup" },
  { id: "operator", label: "Operator", icon: UserCog, desc: "Fractional or advisory" },
  { id: "investor", label: "Investor", icon: Briefcase, desc: "Investing in startups" },
];

export function StepIdentity({ state, update, onNext }: StepIdentityProps) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState(state.linkedinUrl);

  const handleMagicFill = async () => {
    if (!url.trim()) {
      toast({ variant: "destructive", title: "Enter a LinkedIn URL first" });
      return;
    }
    setLoading(true);
    update({ linkedinUrl: url });
    try {
      const { data, error } = await supabase.functions.invoke("scrape-website", {
        body: { url: url.trim() },
      });
      if (error) throw error;
      const name = data?.title?.split("|")?.[0]?.trim() || "";
      update({
        linkedinUrl: url,
        fullName: name || state.fullName,
      });
      onNext();
    } catch {
      toast({
        title: "Couldn't find your profile",
        description: "Fill in manually on the next step.",
      });
      update({ linkedinUrl: url });
      onNext();
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col items-center gap-8 w-full max-w-lg mx-auto"
    >
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Let's start with you
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          We'll personalize your experience based on your background.
        </p>
      </div>

      {/* User Type Selector */}
      <div className="w-full space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">I am a</h3>
        <div className="flex gap-2">
          {USER_TYPES.map((type) => {
            const Icon = type.icon;
            const isActive = state.userType === type.id;
            return (
              <button
                key={type.id}
                onClick={() => update({ userType: type.id })}
                className={cn(
                  "flex-1 flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 transition-all",
                  isActive ? "border-accent bg-accent/5 shadow-sm" : "border-border hover:border-border/80 hover:bg-muted/20"
                )}
              >
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", isActive ? "bg-accent/10" : "bg-muted")}>
                  <Icon className={cn("h-3.5 w-3.5", isActive ? "text-accent" : "text-muted-foreground")} />
                </div>
                <div className="text-left">
                  <p className={cn("text-xs font-semibold", isActive ? "text-foreground" : "text-muted-foreground")}>{type.label}</p>
                  <p className="text-[9px] text-muted-foreground">{type.desc}</p>
                </div>
                {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0 ml-auto" />}
              </button>
            );
          })}
        </div>
      </div>

      <Separator className="w-full" />

      {loading ? (
        <div className="w-full space-y-4 py-8">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Researching your background...</span>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          {/* Option A */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                LinkedIn URL
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  We extract your name, title, and experience to save you time. Nothing is shared.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="linkedin.com/in/yourname"
              className="text-sm"
            />
            <Button onClick={handleMagicFill} className="w-full gap-2" size="sm">
              <Sparkles className="h-3.5 w-3.5" />
              Magic Fill My Profile
            </Button>
          </div>

          {/* Option B */}
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center justify-center gap-4">
            <Linkedin className="h-8 w-8 text-[#0A66C2]" />
            <p className="text-xs text-muted-foreground text-center">
              One-click import via OAuth
            </p>
            <Button variant="outline" className="w-full gap-2" size="sm" disabled>
              <Linkedin className="h-3.5 w-3.5" />
              Connect LinkedIn
              <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Soon</span>
            </Button>
          </div>
        </div>
      )}

      {!loading && (
        <button
          onClick={onNext}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1"
        >
          Skip and fill manually <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </motion.div>
  );
}
