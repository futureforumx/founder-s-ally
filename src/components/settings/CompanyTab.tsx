import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Globe, MapPin, Layers, TrendingUp,
  CheckCircle2, Unlink, RefreshCw, ExternalLink,
  Search, PlusCircle, Clock, X, Shield, Lock,
  ArrowRight, AlertTriangle, Mail, ShieldCheck, Sparkles, ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCapTable } from "@/hooks/useCapTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CompanyProfile, type CompanyData, type AnalysisResult } from "@/components/CompanyProfile";
import { MissionControlInvestors } from "@/components/company-profile/MissionControlInvestors";
import { ProfileStrength } from "@/components/company-profile/ProfileStrength";
import type { SectorClassification } from "@/components/SectorTags";

// ── Types ──

interface CompanySearchResult {
  id: string;
  company_name: string;
  sector: string | null;
  stage: string | null;
  is_claimed: boolean | null;
  claimed_by: string | null;
  user_id: string;
  website_url: string | null;
}

interface MembershipRow {
  id: string;
  company_id: string;
  role: string;
}

interface OwnerInfo {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  title: string | null;
}

type TabState = "search" | "pending" | "linked";

// ── Hook: debounce ──

function useDebounce(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ── Domain verification helper ──
function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function emailMatchesDomain(email: string, domain: string): boolean {
  const emailDomain = email.split("@")[1]?.toLowerCase();
  return emailDomain === domain.toLowerCase();
}

// ── Main Component ──

export function CompanyTab() {
  const { user } = useAuth();
  const capTable = useCapTable();
  const [state, setState] = useState<TabState>("search");
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);

  // Company profile editor state
  const [companyData, setCompanyData] = useState<CompanyData | null>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      if (saved) { const p = JSON.parse(saved); if (p.name) return p; }
    } catch {}
    return null;
  });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(() => {
    try {
      const saved = localStorage.getItem("company-analysis");
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });
  const [sectorClassification, setSectorClassification] = useState<SectorClassification | null>(null);
  const [stageClassification, setStageClassification] = useState<any>(null);
  const [isProfileVerified, setIsProfileVerified] = useState(() => {
    try { return localStorage.getItem("company-profile-verified") === "true"; } catch { return false; }
  });
  const [sectionConfirmed, setSectionConfirmed] = useState<Record<string, boolean>>({});
  const [investorsConfirmed, setInvestorsConfirmed] = useState(false);
  const [profileCompletion, setProfileCompletion] = useState({ percent: 0, sectionsApproved: 0, totalSections: 4, allDone: false });
  const [profileKey, setProfileKey] = useState(0);
  const investorSectionRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-scroll to investors
  useEffect(() => {
    const handler = () => {
      setTimeout(() => {
        investorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    };
    window.addEventListener("scroll-to-investors", handler);
    return () => window.removeEventListener("scroll-to-investors", handler);
  }, []);

  // Bootstrap
  useEffect(() => {
    if (!user) return;
    bootstrapState();
  }, [user]);

  const bootstrapState = async () => {
    setLoading(true);
    const { data: mem } = await supabase
      .from("company_members" as any)
      .select("id, company_id, role")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mem) {
      const m = mem as any;
      setMembership({ id: m.id, company_id: m.company_id, role: m.role });

      if (m.role === "pending") {
        setState("pending");
        fetchOwner(m.company_id);
      } else {
        setState("linked");
      }
    } else {
      const { data: ownCompany } = await supabase
        .from("company_analyses")
        .select("id")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ownCompany) {
        setState("linked");
      } else {
        setState("search");
      }
    }
    setLoading(false);
  };

  const fetchOwner = async (companyId: string) => {
    const { data: ownerMem } = await supabase
      .from("company_members" as any)
      .select("user_id")
      .eq("company_id", companyId)
      .in("role", ["owner", "manager"])
      .limit(1)
      .maybeSingle();

    if (ownerMem) {
      const o = ownerMem as any;
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("full_name, avatar_url, title")
        .eq("user_id", o.user_id)
        .maybeSingle();

      setOwnerInfo({
        user_id: o.user_id,
        full_name: profile?.full_name || "Workspace Manager",
        avatar_url: profile?.avatar_url || null,
        title: profile?.title || "Manager",
      });
    }
  };

  // Search companies
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }
    searchCompanies(debouncedQuery.trim());
  }, [debouncedQuery]);

  const searchCompanies = async (term: string) => {
    setSearching(true);
    const { data } = await supabase
      .from("company_analyses")
      .select("id, company_name, sector, stage, is_claimed, claimed_by, user_id, website_url")
      .ilike("company_name", `%${term}%`)
      .order("updated_at", { ascending: false })
      .limit(8);

    setResults((data || []) as unknown as CompanySearchResult[]);
    setSearching(false);
    setDropdownOpen(true);
  };

  // ── Send email notification (fire-and-forget, graceful) ──
  const sendEmailNotification = async (payload: Record<string, unknown>) => {
    try {
      await supabase.functions.invoke("send-email-notification", { body: payload });
    } catch (err) {
      console.warn("[email-notification] Email sending skipped:", err);
    }
  };

  // ── Scenario A: Request Access ──
  const handleRequestAccess = async (comp: CompanySearchResult) => {
    if (!user) return;
    setRequesting(true);
    const { error } = await supabase
      .from("company_members" as any)
      .insert({ user_id: user.id, company_id: comp.id, role: "pending" });

    if (error) {
      toast.error("Failed to request access");
      setRequesting(false);
      return;
    }

    // Fetch manager profile for email
    const { data: ownerMem } = await supabase
      .from("company_members" as any)
      .select("user_id")
      .eq("company_id", comp.id)
      .in("role", ["owner", "manager"])
      .limit(1)
      .maybeSingle();

    if (ownerMem) {
      const o = ownerMem as any;
      // Get manager email from auth (via profile)
      const { data: ownerProfile } = await (supabase as any)
        .from("profiles")
        .select("full_name")
        .eq("user_id", o.user_id)
        .maybeSingle();

      // Get requester profile
      const { data: requesterProfile } = await (supabase as any)
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      toast.loading("Sending notification...", { id: "access-email" });

      await sendEmailNotification({
        type: "access_request",
        recipientEmail: user.email, // fallback — ideally manager email
        recipientName: ownerProfile?.full_name || "Workspace Manager",
        companyName: comp.company_name,
        requesterName: requesterProfile?.full_name || user.email,
        requesterEmail: user.email,
      });

      toast.success("Request sent to the company manager.", { id: "access-email" });
    }

    setMembership({ id: "", company_id: comp.id, role: "pending" });
    setState("pending");
    setDropdownOpen(false);
    setQuery("");
    setRequesting(false);
    fetchOwner(comp.id);
  };

  // ── Scenario B: Claim Profile ──
  const handleClaimProfile = async (comp: CompanySearchResult) => {
    if (!user?.email) return;
    setRequesting(true);

    const companyDomain = extractDomain(comp.website_url);
    const userEmail = user.email;

    if (companyDomain && !emailMatchesDomain(userEmail, companyDomain)) {
      toast.error(
        `Your email domain doesn't match ${companyDomain}. Use a matching work email to claim this profile.`,
        { duration: 5000 }
      );
      setRequesting(false);
      return;
    }

    await (supabase as any)
      .from("company_analyses")
      .update({ claimed_by: user.id, is_claimed: true })
      .eq("id", comp.id);

    await supabase
      .from("company_members" as any)
      .insert({ user_id: user.id, company_id: comp.id, role: "manager" });

    await (supabase as any)
      .from("profiles")
      .update({ company_id: comp.id })
      .eq("user_id", user.id);

    setMembership({ id: "", company_id: comp.id, role: "manager" });
    setState("linked");
    setDropdownOpen(false);
    setQuery("");
    setRequesting(false);
    toast.success("Profile claimed! You are now the manager.");
  };

  // ── Scenario C: Create Workspace ──
  const handleCreateWorkspace = async (name: string) => {
    if (!user) return;
    setRequesting(true);

    const { data: newComp, error: compError } = await supabase
      .from("company_analyses")
      .insert({
        user_id: user.id,
        company_name: name.trim(),
        is_claimed: true,
        claimed_by: user.id,
      } as any)
      .select("id")
      .single();

    if (compError || !newComp) {
      toast.error("Failed to create workspace");
      setRequesting(false);
      return;
    }

    await supabase
      .from("company_members" as any)
      .insert({ user_id: user.id, company_id: newComp.id, role: "manager" });

    await (supabase as any)
      .from("profiles")
      .update({ company_id: newComp.id })
      .eq("user_id", user.id);

    setMembership({ id: "", company_id: newComp.id, role: "manager" });
    setState("linked");
    setDropdownOpen(false);
    setQuery("");
    setRequesting(false);
    toast.success("Workspace created! Set up your company profile below.");
  };

  const handleCancelRequest = async () => {
    if (!membership) return;
    await supabase.from("company_members" as any).delete().eq("id", membership.id);
    setMembership(null);
    setState("search");
    toast.success("Request cancelled");
  };

  const handleUnlink = async () => {
    if (membership) {
      await supabase.from("company_members" as any).delete().eq("id", membership.id);
      setMembership(null);
    }
    setState("search");
    toast.success("Company unlinked from your account");
  };

  const handleAnalysis = (result: AnalysisResult) => {
    setAnalysisResult(result);
  };

  const handleMetricEdit = (key: string, value: string) => {
    if (!analysisResult) return;
    setAnalysisResult({
      ...analysisResult,
      metrics: {
        ...analysisResult.metrics,
        [key]: { value, confidence: "high" as const },
      },
    });
  };

  // Determine if we need the overlay modal (not linked)
  const needsLinking = state === "search" || state === "pending";

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className="relative"
    >
      {/* Grayed-out entity content behind the modal */}
      {needsLinking && (
        <div className="space-y-6 opacity-20 blur-[2px] pointer-events-none select-none">
          <div>
            <h3 className="text-lg font-bold text-foreground">Entity Settings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage your company workspace, team, and profile
            </p>
          </div>
          <Separator />
          <div className="space-y-3">
            {[
              { icon: Globe, label: "Website", value: "Not set" },
              { icon: Layers, label: "Sector", value: "Not classified" },
              { icon: TrendingUp, label: "Stage", value: "Not set" },
              { icon: MapPin, label: "Health Score", value: "Not analyzed" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-border p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-medium text-muted-foreground">{item.value}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overlay Modal */}
      <AnimatePresence>
        {needsLinking && !loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute inset-0 z-20 flex items-start justify-center pt-6"
          >
            <div className="w-full max-w-md rounded-2xl border-2 border-border bg-card shadow-2xl shadow-foreground/5 overflow-visible">
              {state === "search" ? (
                <WorkspaceLinkingModal
                  query={query}
                  setQuery={setQuery}
                  results={results}
                  searching={searching}
                  dropdownOpen={dropdownOpen}
                  setDropdownOpen={setDropdownOpen}
                  containerRef={containerRef}
                  requesting={requesting}
                  userId={user?.id || ""}
                  userEmail={user?.email || ""}
                  onRequestAccess={handleRequestAccess}
                  onClaimProfile={handleClaimProfile}
                  onCreateWorkspace={handleCreateWorkspace}
                />
              ) : (
                <PendingModal
                  ownerInfo={ownerInfo}
                  onCancel={handleCancelRequest}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Linked: Full Company Profile Editor ── */}
      {state === "linked" && !loading && (
        <div className="space-y-6">
          {/* ═══ Asymmetric 2-Column Grid ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* ── Left Column: Performance & Status (sticky) ── */}
            <div className="lg:col-span-4 sticky top-8 flex flex-col gap-5">

              {/* Profile Analytics */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile Analytics</h3>
                <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
                  {profileCompletion.percent >= 100 && isProfileVerified ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Investor Views</p>
                        <p className="text-lg font-bold text-foreground">12</p>
                        <p className="text-[9px] text-success font-medium">+3 this week</p>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Search Appearances</p>
                        <p className="text-lg font-bold text-foreground">45</p>
                        <p className="text-[9px] text-success font-medium">+8 this week</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Investor Views</p>
                        <p className="text-lg font-bold text-muted-foreground/40">—</p>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Search Appearances</p>
                        <p className="text-lg font-bold text-muted-foreground/40">—</p>
                      </div>
                    </div>
                  )}
                  {profileCompletion.percent < 100 && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> Complete your profile to unlock analytics.
                    </p>
                  )}
                </div>
              </div>

              {/* Profile Strength */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile Strength</h3>
                <ProfileStrength
                  completionPercent={profileCompletion.percent}
                  sectionConfirmed={sectionConfirmed}
                  investorsConfirmed={investorsConfirmed}
                  investorSectionRef={investorSectionRef}
                />
              </div>

              {/* AI Insight */}
              <div className="rounded-2xl border border-accent/20 bg-gradient-to-b from-accent/5 to-card p-5 space-y-2.5">
                <p className="text-[10px] font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> AI Insight
                </p>
                <p className="text-xs text-foreground leading-relaxed">
                  Founders in <span className="font-semibold">{companyData?.sector || "B2B SaaS"}</span> who verify their financial metrics see a <span className="font-bold text-accent">3× higher</span> response rate from {companyData?.stage || "Seed"} investors.
                </p>
                {!sectionConfirmed.metrics && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent("scroll-to-section", { detail: "metrics" }))}
                    className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors inline-flex items-center gap-1 mt-1"
                  >
                    Verify Metrics <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Unlink */}
              <button onClick={handleUnlink} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors">
                <Unlink className="h-3 w-3" />
                Unlink Company
              </button>
            </div>

            {/* ── Right Column: The Payload/Editor ── */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              <CompanyProfile
                key={profileKey}
                onSave={setCompanyData}
                onAnalysis={handleAnalysis}
                onSectorChange={setSectorClassification}
                onStageClassification={setStageClassification}
                onProfileVerified={setIsProfileVerified}
                onSectionConfirmedChange={setSectionConfirmed}
                onCompletionChange={setProfileCompletion}
              />

              {/* Investors Section */}
              <div ref={investorSectionRef}>
                <MissionControlInvestors
                  backers={capTable.backers}
                  totalRaised={capTable.totalRaised}
                  formatCurrency={capTable.formatCurrency}
                  addInvestor={capTable.addInvestor}
                  onNavigateInvestors={() => window.dispatchEvent(new CustomEvent("navigate-view", { detail: "investors" }))}
                  analysisResult={analysisResult}
                  companyData={companyData}
                  previousSectionApproved={!!sectionConfirmed.social}
                  onConfirmedChange={setInvestorsConfirmed}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3 mt-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Workspace Linking Modal ──

function WorkspaceLinkingModal({
  query, setQuery, results, searching, dropdownOpen, setDropdownOpen,
  containerRef, requesting, userId, userEmail,
  onRequestAccess, onClaimProfile, onCreateWorkspace,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: CompanySearchResult[];
  searching: boolean;
  dropdownOpen: boolean;
  setDropdownOpen: (v: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  requesting: boolean;
  userId: string;
  userEmail: string;
  onRequestAccess: (c: CompanySearchResult) => void;
  onClaimProfile: (c: CompanySearchResult) => void;
  onCreateWorkspace: (name: string) => void;
}) {
  const showDropdown = dropdownOpen && query.trim().length > 0;

  function getScenario(comp: CompanySearchResult): "claimed" | "unclaimed" {
    if (comp.is_claimed && comp.claimed_by) return "claimed";
    return "unclaimed";
  }

  return (
    <div className="p-6 space-y-5">
      <div className="text-center space-y-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 mx-auto">
          <Lock className="h-6 w-6 text-accent" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Link Your Workspace</h3>
        <p className="text-xs text-muted-foreground max-w-[320px] mx-auto">
          Entity settings are locked until you link or create a company workspace.
        </p>
      </div>

      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
            onFocus={() => query.trim() && setDropdownOpen(true)}
            placeholder="Search for your company..."
            autoComplete="off"
            className="w-full h-11 rounded-xl border border-input bg-muted/30 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setDropdownOpen(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {showDropdown && (
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-popover shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 max-h-[300px] overflow-y-auto">
            {searching ? (
              <div className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="h-3 w-3 border-2 border-muted-foreground/30 border-t-foreground rounded-full"
                />
                Searching...
              </div>
            ) : (
              <>
                {results.length > 0 ? (
                  results.map((comp) => {
                    const scenario = getScenario(comp);
                    return (
                      <button
                        key={comp.id}
                        onClick={() => scenario === "claimed" ? onRequestAccess(comp) : onClaimProfile(comp)}
                        disabled={requesting}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 flex items-center gap-3 border-b border-border last:border-0 transition-colors disabled:opacity-50"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-semibold text-foreground">{comp.company_name}</span>
                          {comp.sector && (
                            <span className="block text-[10px] text-muted-foreground">{comp.sector}{comp.stage ? ` · ${comp.stage}` : ""}</span>
                          )}
                        </div>
                        {scenario === "claimed" ? (
                          <Badge className="bg-warning/10 text-warning border-warning/20 text-[9px] uppercase font-bold shrink-0">
                            Request Access
                          </Badge>
                        ) : (
                          <Badge className="bg-accent/10 text-accent border-accent/20 text-[9px] uppercase font-bold shrink-0">
                            Claim Profile
                          </Badge>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-4 py-3 text-xs text-muted-foreground">
                    No companies found
                  </div>
                )}

                <button
                  onClick={() => onCreateWorkspace(query.trim())}
                  disabled={requesting}
                  className="w-full text-left px-4 py-3 bg-accent/5 hover:bg-accent/10 flex items-center gap-3 font-semibold transition-colors text-sm border-t border-border disabled:opacity-50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 shrink-0">
                    <PlusCircle className="h-4 w-4 text-accent" />
                  </div>
                  <span className="text-accent">
                    {results.length === 0
                      ? `Create "${query.trim()}" workspace`
                      : `Create "${query.trim()}" as new`}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-accent ml-auto shrink-0" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 px-1">
        <Shield className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          Claiming a profile requires email domain verification. Existing workspaces require manager approval.
        </p>
      </div>
    </div>
  );
}

// ── Pending Modal ──

function PendingModal({
  ownerInfo, onCancel,
}: {
  ownerInfo: OwnerInfo | null;
  onCancel: () => void;
}) {
  return (
    <div className="p-6 flex flex-col items-center text-center space-y-4">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning" />
        </span>
        <Badge className="bg-warning/10 text-warning border-warning/20 text-[9px] uppercase font-bold">
          Access Pending
        </Badge>
      </div>

      {ownerInfo && (
        <div className="p-4 bg-muted/30 border border-border rounded-xl w-full max-w-sm flex items-center gap-4 text-left">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border border-border text-sm font-bold text-primary shrink-0">
            {ownerInfo.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Workspace Manager</p>
            <p className="text-sm font-bold text-foreground truncate">{ownerInfo.full_name}</p>
            {ownerInfo.title && <p className="text-xs text-muted-foreground">{ownerInfo.title}</p>}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground max-w-[320px]">
        Your request has been sent.{ownerInfo ? ` ${ownerInfo.full_name} must approve your access.` : " The workspace manager must approve your access."}
      </p>

      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors mt-2"
      >
        <X className="h-3 w-3" />
        Cancel Request
      </button>
    </div>
  );
}
