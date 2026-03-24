import { useState } from "react";
import { Linkedin, Sparkles, HelpCircle, ArrowRight, Loader2, Users, UserCog, Briefcase, CheckCircle2 } from "lucide-react";
import { MorphingUrlInput } from "@/components/ui/morphing-url-input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { formatSocialUrl } from "@/lib/socialFormat";
import type { OnboardingState } from "./types";

interface StepIdentityProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: () => void;
}

const USER_TYPES = [
  { id: "founder", label: "Founder", icon: Users, desc: "building a startup." },
  { id: "operator", label: "Operator", icon: UserCog, desc: "working at a startip." },
  { id: "investor", label: "Investor", icon: Briefcase, desc: "finding startups." },
];

export function StepIdentity({ state, update, onNext }: StepIdentityProps) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState(state.linkedinUrl);
  const [xUrl, setXUrl] = useState(state.twitterUrl);
  const [xSyncing, setXSyncing] = useState(false);
  const [xVerified, setXVerified] = useState(false);

  const handleLinkedinBlur = () => {
    const formatted = formatSocialUrl("linkedin_personal", url);
    if (formatted !== url) setUrl(formatted);
    update({ linkedinUrl: formatted });
  };

  const handleXBlur = () => {
    const formatted = formatSocialUrl("x", xUrl);
    if (formatted !== xUrl) setXUrl(formatted);
    update({ twitterUrl: formatted });
  };

  const handleMagicFill = async () => {
    if (!url.trim()) {
      toast({ variant: "destructive", title: "Enter a LinkedIn URL first" });
      return;
    }
    setLoading(true);
    const formattedLinkedin = formatSocialUrl("linkedin_personal", url);
    setUrl(formattedLinkedin);
    update({ linkedinUrl: formattedLinkedin });

    try {
      // Use the LinkedIn-specific sync function for better data extraction
      const { data, error } = await supabase.functions.invoke("sync-linkedin-profile", {
        body: { linkedinUrl: formattedLinkedin },
      });

      if (error) throw error;

      const profileData = data?.data || {};
      const updates: Partial<OnboardingState> = { linkedinUrl: formattedLinkedin };

      if (profileData.full_name) updates.fullName = profileData.full_name;
      if (profileData.title) updates.title = profileData.title;
      if (profileData.bio) updates.bio = profileData.bio.slice(0, 160);
      if (profileData.location) updates.location = profileData.location;
      if (profileData.avatar_url) updates.avatarUrl = profileData.avatar_url;

      update(updates);

      if (xUrl.trim()) {
        await enrichXProfile(formatSocialUrl("x", xUrl));
      }

      onNext();
    } catch {
      toast({
        title: "Couldn't find your profile",
        description: "Fill in manually on the next step.",
      });
      update({ linkedinUrl: formattedLinkedin });
      onNext();
    } finally {
      setLoading(false);
    }
  };

  const enrichXProfile = async (twitterUrl: string) => {
    if (!twitterUrl.trim()) return;
    setXSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-x-profile", {
        body: { twitterUrl },
      });

      if (error || !data?.success) {
        if (data?.skipped) {
          toast({ title: "X enrichment skipped", description: "Please fill bio manually." });
        }
        return;
      }

      const xData = data.data;
      const updates: Partial<OnboardingState> = {};

      if (xData.bio && !state.bio.trim()) updates.bio = xData.bio.slice(0, 160);
      if (xData.location && !state.location.trim()) updates.location = xData.location;
      if (xData.avatar_url && !state.avatarUrl) updates.avatarUrl = xData.avatar_url;

      if (Object.keys(updates).length > 0) update(updates);

      setXVerified(true);
      toast({ title: "X profile enriched successfully" });
    } catch {
      toast({ title: "X enrichment skipped", description: "Please fill bio manually." });
    } finally {
      setXSyncing(false);
    }
  };

  const handleEnrichX = async () => {
    const formatted = formatSocialUrl("x", xUrl);
    setXUrl(formatted);
    update({ twitterUrl: formatted });
    await enrichXProfile(formatted);
  };


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col items-center gap-5 w-full max-w-lg mx-auto"
    >
      <div className="text-center space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Let's start with you
        </h1>
        <p className="text-xs text-muted-foreground max-w-sm">
          We'll personalize your experience based on your background.
        </p>
      </div>

      {/* User Type Selector */}
      <div className="w-full space-y-2">
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">I am a</h3>
        <div className="flex gap-1.5">
          {USER_TYPES.map((type) => {
            const Icon = type.icon;
            const isActive = state.userType === type.id;
            return (
              <button
                key={type.id}
                onClick={() => update({ userType: type.id })}
                className={cn(
                  "flex-1 flex items-center gap-2 rounded-lg border-2 px-2.5 py-2 transition-all",
                  isActive ? "border-accent bg-accent/5 shadow-sm" : "border-border hover:border-border/80 hover:bg-muted/20"
                )}
              >
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0", isActive ? "bg-accent/10" : "bg-muted")}>
                  <Icon className={cn("h-3 w-3", isActive ? "text-accent" : "text-muted-foreground")} />
                </div>
                <div className="text-left">
                  <p className={cn("text-[11px] font-semibold leading-tight", isActive ? "text-foreground" : "text-muted-foreground")}>{type.label}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">{type.desc}</p>
                </div>
                {isActive && <CheckCircle2 className="h-3 w-3 text-accent shrink-0 ml-auto" />}
              </button>
            );
          })}
        </div>
      </div>

      <Separator className="w-full" />

      {loading ? (
        <div className="w-full space-y-3 py-4">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Researching your background...</span>
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 rounded-lg bg-muted animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full space-y-3">
          {/* Social profiles card */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Linkedin className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Social Profiles
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  We extract your name, title, and experience to save you time. Nothing is shared.
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Two-column inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* LinkedIn URL */}
              <MorphingUrlInput
                platform="linkedin"
                label="LinkedIn"
                value={url}
                onChange={(v) => setUrl(v)}
                onBlur={() => {
                  const formatted = formatSocialUrl("linkedin_personal", url);
                  if (formatted !== url) setUrl(formatted);
                  update({ linkedinUrl: formatted });
                }}
                verifyState="idle"
              />

              {/* X / Twitter URL */}
              <MorphingUrlInput
                platform="x"
                label="X / Twitter"
                value={xUrl}
                onChange={(v) => setXUrl(v)}
                onBlur={() => {
                  const formatted = formatSocialUrl("x", xUrl);
                  if (formatted !== xUrl) setXUrl(formatted);
                  update({ twitterUrl: formatted });
                }}
                verifyState={xSyncing ? "syncing" : (xVerified ? "verified" : "idle")}
                onVerify={handleEnrichX}
                verifyLabel="Enrich"
              />
            </div>

            <Button onClick={handleMagicFill} className="w-full gap-1.5 h-8 text-xs" size="sm">
              <Sparkles className="h-3 w-3" />
              Magic Fill My Profile
            </Button>
          </div>

          {/* OAuth option — condensed inline */}
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-[#0A66C2]" />
              <span className="text-[10px] text-muted-foreground">One-click OAuth import</span>
            </div>
            <Button variant="outline" className="h-7 gap-1.5 text-[10px] px-3" size="sm" disabled>
              Connect
              <span className="text-[8px] bg-muted px-1 py-0.5 rounded text-muted-foreground">Soon</span>
            </Button>
          </div>
        </div>
      )}

      {!loading && (
        <button
          onClick={onNext}
          className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1"
        >
          Skip and fill manually <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </motion.div>
  );
}
