import { useState, useEffect } from "react";
import { Linkedin, HelpCircle, ArrowRight, Loader2 } from "lucide-react";
import { MorphingUrlInput } from "@/components/ui/morphing-url-input";
import { SmartCombobox } from "@/components/ui/smart-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatSocialUrl } from "@/lib/socialFormat";
import { ROLE_OPTIONS } from "@/constants/roleOptions";
import type { OnboardingState } from "./types";

interface StepIdentityProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepIdentity({ state, update, onNext, onBack }: StepIdentityProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [xUrl, setXUrl] = useState("");

  // Clear social URLs on mount — never auto-populate from previous sessions
  useEffect(() => {
    update({ linkedinUrl: "", twitterUrl: "" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill from auth metadata
  useEffect(() => {
    if (!user) return;
    const meta = user.user_metadata || {};
    const updates: Partial<OnboardingState> = {};
    if (user.email && !state.email) updates.email = user.email;
    if (meta.first_name && !state.firstName) {
      updates.firstName = meta.first_name;
      updates.fullName = [meta.first_name, meta.last_name].filter(Boolean).join(" ");
    }
    if (meta.last_name && !state.lastName) {
      updates.lastName = meta.last_name;
      updates.fullName = [meta.first_name || state.firstName, meta.last_name].filter(Boolean).join(" ");
    }
    if (Object.keys(updates).length > 0) update(updates);
  }, [user]);

  const linkedInOAuthVerified = false;
  const xOAuthVerified = false;
  const canProceedBasic = state.firstName.trim().length > 0 && state.lastName.trim().length > 0 && state.title.trim().length > 0;

  const handleValidatedNext = async () => {
    if (!canProceedBasic) {
      const missing: string[] = [];
      if (!state.firstName.trim()) missing.push("First Name");
      if (!state.lastName.trim()) missing.push("Last Name");
      if (!state.title.trim()) missing.push("Role");
      toast({ title: "Required fields", description: `Please fill in: ${missing.join(", ")}.`, variant: "destructive" });
      return;
    }
    const liFromInput = url.trim() ? formatSocialUrl("linkedin_personal", url) : "";
    const linkedinUrlToSync = liFromInput;

    const xFromInput = xUrl.trim() ? formatSocialUrl("x", xUrl) : "";
    const xUrlToSync = xFromInput;

    if (linkedinUrlToSync) {
      if (linkedinUrlToSync !== url) setUrl(linkedinUrlToSync);
      update({ linkedinUrl: linkedinUrlToSync });
    }
    if (xUrlToSync) {
      if (xUrlToSync !== xUrl) setXUrl(xUrlToSync);
      update({ twitterUrl: xUrlToSync });
    }

    const shouldSync = Boolean(linkedinUrlToSync || xUrlToSync);
    if (!shouldSync) {
      onNext();
      return;
    }

    setLoading(true);
    try {
      if (linkedinUrlToSync) {
        try {
          const { data, error } = await supabase.functions.invoke("sync-linkedin-profile", {
            body: { linkedinUrl: linkedinUrlToSync },
          });
          if (error) throw error;
          const profileData = data?.data || {};
          const updates: Partial<OnboardingState> = { linkedinUrl: linkedinUrlToSync };
          if (profileData.full_name) {
            updates.fullName = profileData.full_name;
            const parts = profileData.full_name.trim().split(/\s+/);
            updates.firstName = parts[0] || "";
            updates.lastName = parts.slice(1).join(" ") || "";
          }
          if (profileData.title) updates.title = profileData.title;
          if (profileData.bio) updates.bio = profileData.bio.slice(0, 160);
          if (profileData.location) updates.location = profileData.location;
          if (profileData.avatar_url) updates.avatarUrl = profileData.avatar_url;
          update(updates);
        } catch {
          toast({
            title: "Couldn't find your LinkedIn profile",
            description: "We saved your link—you can edit details on the next step.",
          });
        }
      }
      if (xUrlToSync) {
        await enrichXProfile(xUrlToSync, { silent: true });
      }
    } finally {
      setLoading(false);
    }
    onNext();
  };


  const enrichXProfile = async (twitterUrl: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!twitterUrl.trim()) return;
    try {
      const { data, error } = await supabase.functions.invoke("sync-x-profile", {
        body: { twitterUrl },
      });
      if (error || !data?.success) {
        if (data?.skipped && !silent) {
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
      if (!silent) toast({ title: "X profile enriched successfully" });
    } catch {
      if (!silent) toast({ title: "X enrichment skipped", description: "Please fill bio manually." });
    }
  };

  // Sync fullName from firstName + lastName
  const handleNameChange = (first: string, last: string) => {
    const full = [first, last].filter(Boolean).join(" ");
    update({ firstName: first, lastName: last, fullName: full });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex w-full flex-col items-center gap-5"
    >
      <div className="w-full space-y-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Your profile</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Put a name to your network
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Add the essentials. A social profile can fill in extra context and is always optional.
        </p>
      </div>

      <>
          {/* Personal Details */}
          <div className="w-full space-y-3">
            <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">Your details</h3>
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    First Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={state.firstName}
                    onChange={(e) => handleNameChange(e.target.value, state.lastName)}
                    placeholder="Jane"
                    className="rounded-lg h-9 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Last Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={state.lastName}
                    onChange={(e) => handleNameChange(state.firstName, e.target.value)}
                    placeholder="Doe"
                    className="rounded-lg h-9 text-sm"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Role <span className="text-destructive">*</span>
                </label>
                <SmartCombobox
                  value={state.title}
                  onChange={(v) => update({ title: v })}
                  options={ROLE_OPTIONS}
                  placeholder="e.g. CEO & Co-Founder"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Email</label>
                <Input
                  value={state.email}
                  onChange={(e) => update({ email: e.target.value })}
                  placeholder="jane@acme.com"
                  type="email"
                  className="rounded-lg h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="w-full space-y-3 py-4">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Pulling your LinkedIn &amp; X profile…</span>
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
              <motion.div>
                <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Linkedin className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Personal social profiles
                    </span>
                    <span className="ml-auto text-[9px] text-muted-foreground/60">Optional</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        We extract your name, title, and experience to save you time. Nothing is shared.
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <MorphingUrlInput
                        platform="linkedin"
                        label="LinkedIn"
                        value={url}
                        onChange={setUrl}
                        onBlur={() => {
                          const formatted = formatSocialUrl("linkedin_personal", url);
                          if (formatted !== url) setUrl(formatted);
                          update({ linkedinUrl: formatted });
                        }}
                        verifyState={linkedInOAuthVerified ? "verified" : "idle"}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <MorphingUrlInput
                        platform="x"
                        label="X / Twitter"
                        value={xUrl}
                        onChange={setXUrl}
                        onBlur={() => {
                          const formatted = formatSocialUrl("x", xUrl);
                          if (formatted !== xUrl) setXUrl(formatted);
                          update({ twitterUrl: formatted });
                        }}
                        verifyState={xOAuthVerified ? "verified" : "idle"}
                      />
                    </div>
                  </div>

                </div>
              </motion.div>

              {/* OAuth option */}
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

          <div className="flex w-full items-center justify-between gap-3 pt-1">
            <Button variant="ghost" size="sm" onClick={onBack} className="h-9 px-4 text-xs">
              Back
            </Button>
            <Button
              onClick={() => void handleValidatedNext()}
              disabled={!canProceedBasic || loading}
              className="h-9 flex-1 gap-1.5 text-xs"
              size="sm"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Syncing…
                </>
              ) : (
                <>
                  Continue <ArrowRight className="h-3 w-3" />
                </>
              )}
            </Button>
          </div>
      </>
    </motion.div>
  );
}
