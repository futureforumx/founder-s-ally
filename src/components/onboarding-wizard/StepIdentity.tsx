import { useState, useEffect, useCallback, useRef } from "react";
import { Linkedin, Sparkles, HelpCircle, ArrowRight, Loader2, Users, UserCog, Briefcase, CheckCircle2, Search, X, Building2, Plus } from "lucide-react";
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
import { formatSocialUrl } from "@/lib/socialFormat";
import { ROLE_OPTIONS } from "@/constants/roleOptions";
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
  const [xSyncing, setXSyncing] = useState(false);
  const [xVerified, setXVerified] = useState(false);

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

  // Pre-fill email from auth user
  useEffect(() => {
    if (user?.email && !state.email) {
      update({ email: user.email });
    }
  }, [user]);

  const canProceed = state.firstName.trim().length > 0 && state.lastName.trim().length > 0 && state.title.trim().length > 0;

  const handleValidatedNext = () => {
    if (!canProceed) {
      toast({ title: "Required fields", description: "Please fill in First Name, Last Name, and Role.", variant: "destructive" });
      return;
    }
    onNext();
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
      const { data, error } = await supabase.functions.invoke("sync-linkedin-profile", {
        body: { linkedinUrl: formattedLinkedin },
      });
      if (error) throw error;

      const profileData = data?.data || {};
      const updates: Partial<OnboardingState> = { linkedinUrl: formattedLinkedin };

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
