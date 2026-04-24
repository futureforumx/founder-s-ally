import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Linkedin, HelpCircle, ArrowRight, Loader2, Users, UserCog, Briefcase, CheckCircle2, Search, X, Building2, Plus } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { FirmLogo } from "@/components/ui/firm-logo";
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
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatSocialUrl } from "@/lib/socialFormat";
import { ROLE_OPTIONS } from "@/constants/roleOptions";
import { InvestorWaitlistForm } from "./InvestorWaitlistForm";
import type { OnboardingState } from "./types";

interface StepIdentityProps {
  state: OnboardingState;
  update: (p: Partial<OnboardingState>) => void;
  onNext: () => void;
}

const USER_TYPES = [
  { id: "founder", label: "Founder", icon: Users, desc: "building a startup." },
  { id: "operator", label: "Operator", icon: UserCog, desc: "working at a startup." },
  { id: "investor", label: "Investor", icon: Briefcase, desc: "finding startups." },
];

export function StepIdentity({ state, update, onNext }: StepIdentityProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState(state.linkedinUrl);
  const [xUrl, setXUrl] = useState(state.twitterUrl);
  const [socialShake, setSocialShake] = useState(false);
  const [showSocialHint, setShowSocialHint] = useState(false);

  // Company search state
  const [companyQuery, setCompanyQuery] = useState(state.companyName || "");
  const [companyResults, setCompanyResults] = useState<Array<{ id: string; name: string; websiteUrl: string | null; sector: string | null; }>>([]);
  const [isSearchingCompany, setIsSearchingCompany] = useState(false);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [selectedCompanyResult, setSelectedCompanyResult] = useState<{ id: string; name: string; websiteUrl: string | null; sector: string | null } | null>(null);
  const companySearchRef = useRef<HTMLDivElement>(null);
  const companyDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close company dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (companySearchRef.current && !companySearchRef.current.contains(e.target as Node)) {
        setShowCompanyDropdown(false);
      }
    };
    if (showCompanyDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCompanyDropdown]);

  const searchCompanies = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setCompanyResults([]); setShowCompanyDropdown(false); return; }
    setIsSearchingCompany(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-companies", { body: { query: query.trim() } });
      if (error) throw error;
      setCompanyResults(data?.results || []);
      setShowCompanyDropdown(true);
    } catch { setCompanyResults([]); } finally { setIsSearchingCompany(false); }
  }, []);

  const handleCompanyInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCompanyQuery(val);
    update({ companyName: val });
    if (selectedCompanyResult) setSelectedCompanyResult(null);
    if (companyDebounceRef.current) clearTimeout(companyDebounceRef.current);
    companyDebounceRef.current = setTimeout(() => searchCompanies(val), 300);
  };

  const handleSelectCompanyResult = (c: { id: string; name: string; websiteUrl: string | null; sector: string | null }) => {
    setSelectedCompanyResult(c);
    setCompanyQuery(c.name);
    update({ companyName: c.name, websiteUrl: c.websiteUrl || state.websiteUrl });
    setShowCompanyDropdown(false);
  };

  const handleClearCompanySelection = () => {
    setSelectedCompanyResult(null);
    setCompanyQuery("");
    update({ companyName: "" });
  };

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
  const hasSocialProfile =
    state.linkedinUrl.trim().length > 0 ||
    state.twitterUrl.trim().length > 0 ||
    linkedInOAuthVerified ||
    xOAuthVerified;
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
    if (!hasSocialProfile) {
      if (showSocialHint) {
        // User already saw the hint and clicked again — let them skip social sync.
        onNext();
        return;
      }
      setSocialShake(true);
      setShowSocialHint(true);
      setTimeout(() => setSocialShake(false), 600);
      return;
    }
    setShowSocialHint(false);

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
      className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto"
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

      {/* Investor waitlist gate */}
      {state.userType === "investor" ? (
        <InvestorWaitlistForm />
      ) : (
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

          <Separator className="w-full" />

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
              <motion.div
                animate={socialShake ? { x: [0, -6, 6, -4, 4, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                <div className={cn(
                  "rounded-xl border bg-card p-4 space-y-3 transition-colors",
                  showSocialHint && !hasSocialProfile ? "border-destructive/50" : "border-border"
                )}>
                  <div className="flex items-center gap-2">
                    <Linkedin className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Social Profiles <span className="text-destructive">*</span>
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 ml-auto">At least one required</span>
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
                        onChange={(v) => {
                          setUrl(v);
                          if (showSocialHint) setShowSocialHint(false);
                        }}
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
                        onChange={(v) => {
                          setXUrl(v);
                          if (showSocialHint) setShowSocialHint(false);
                        }}
                        onBlur={() => {
                          const formatted = formatSocialUrl("x", xUrl);
                          if (formatted !== xUrl) setXUrl(formatted);
                          update({ twitterUrl: formatted });
                        }}
                        verifyState={xOAuthVerified ? "verified" : "idle"}
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {showSocialHint && !hasSocialProfile && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-[11px] text-destructive font-medium"
                      >
                        Add a LinkedIn or X profile (or confirm with OAuth), or use &quot;Proceed without syncing&quot; below.
                      </motion.p>
                    )}
                  </AnimatePresence>

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

          <div className="flex flex-col items-center gap-3">
            <Button
              onClick={() => void handleValidatedNext()}
              disabled={!canProceedBasic || loading}
              className="w-full max-w-lg gap-1.5 h-9 text-xs"
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

            {!loading && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors underline underline-offset-2">
                    Proceed without syncing
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" className="w-72 p-4 space-y-2.5">
                  <p className="text-xs font-semibold text-foreground">Are you sure?</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Syncing your profile powers the <span className="font-medium text-foreground">recommendation &amp; network engine</span> and unlocks the true value of the app.
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">
                    If you change your mind, you can do this later in Settings.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-[10px]"
                    onClick={onNext}
                  >
                    Skip anyway
                  </Button>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
