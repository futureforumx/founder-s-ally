import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Globe, MapPin, Layers, TrendingUp,
  CheckCircle2, Unlink, RefreshCw, ExternalLink,
  Search, PlusCircle, Clock, X, Shield, Lock,
  ArrowRight, AlertTriangle, Mail
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ──

interface CompanyData {
  id: string;
  company_name: string;
  website_url: string | null;
  sector: string | null;
  stage: string | null;
  health_score: number | null;
  updated_at: string;
  is_claimed?: boolean;
  claimed_by?: string | null;
  user_id?: string;
}

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
  const [state, setState] = useState<TabState>("search");
  const [company, setCompany] = useState<CompanyData | null>(null);
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

      const { data: comp } = await supabase
        .from("company_analyses")
        .select("id, company_name, website_url, sector, stage, health_score, updated_at")
        .eq("id", m.company_id)
        .maybeSingle();

      if (comp) setCompany(comp);

      if (m.role === "pending") {
        setState("pending");
        fetchOwner(m.company_id);
      } else {
        setState("linked");
      }
    } else {
      const { data: ownCompany } = await supabase
        .from("company_analyses")
        .select("id, company_name, website_url, sector, stage, health_score, updated_at")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ownCompany) {
        setCompany(ownCompany);
        setState("linked");
      } else {
        setState("search");
      }
    }
    setLoading(false);
  };

  const fetchOwner = async (companyId: string) => {
    // Try profiles first for better data
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

  // ── Scenario A: Company is claimed → Request Access ──
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

    setCompany({ ...comp, health_score: null, updated_at: new Date().toISOString() });
    setMembership({ id: "", company_id: comp.id, role: "pending" });
    setState("pending");
    setDropdownOpen(false);
    setQuery("");
    setRequesting(false);
    fetchOwner(comp.id);
    toast.success("Access request sent to the workspace manager!");
  };

  // ── Scenario B: Company is unclaimed → Claim Profile ──
  const handleClaimProfile = async (comp: CompanySearchResult) => {
    if (!user?.email) return;
    setRequesting(true);

    // Domain verification
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

    // Claim it: update company, create membership as manager
    await (supabase as any)
      .from("company_analyses")
      .update({ claimed_by: user.id, is_claimed: true })
      .eq("id", comp.id);

    await supabase
      .from("company_members" as any)
      .insert({ user_id: user.id, company_id: comp.id, role: "manager" });

    // Link profile
    await (supabase as any)
      .from("profiles")
      .update({ company_id: comp.id })
      .eq("user_id", user.id);

    setCompany({ ...comp, health_score: null, updated_at: new Date().toISOString() });
    setMembership({ id: "", company_id: comp.id, role: "manager" });
    setState("linked");
    setDropdownOpen(false);
    setQuery("");
    setRequesting(false);
    toast.success("Profile claimed! You are now the manager.");
  };

  // ── Scenario C: Create new workspace ──
  const handleCreateWorkspace = async (name: string) => {
    if (!user) return;
    setRequesting(true);

    // Create company row
    const { data: newComp, error: compError } = await supabase
      .from("company_analyses")
      .insert({
        user_id: user.id,
        company_name: name.trim(),
        is_claimed: true,
        claimed_by: user.id,
      } as any)
      .select("id, company_name, website_url, sector, stage, health_score, updated_at")
      .single();

    if (compError || !newComp) {
      toast.error("Failed to create workspace");
      setRequesting(false);
      return;
    }

    // Create membership as manager
    await supabase
      .from("company_members" as any)
      .insert({ user_id: user.id, company_id: newComp.id, role: "manager" });

    // Link profile
    await (supabase as any)
      .from("profiles")
      .update({ company_id: newComp.id })
      .eq("user_id", user.id);

    setCompany(newComp);
    setMembership({ id: "", company_id: newComp.id, role: "manager" });
    setState("linked");
    setDropdownOpen(false);
    setQuery("");
    setRequesting(false);
    toast.success("Workspace created! Redirecting to Company Profile...");

    // Navigate to company profile editor
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("navigate-to-tab", { detail: "company" }));
    }, 600);
  };

  const handleCancelRequest = async () => {
    if (!membership) return;
    await supabase.from("company_members" as any).delete().eq("id", membership.id);
    setMembership(null);
    setCompany(null);
    setState("search");
    toast.success("Request cancelled");
  };

  const handleUnlink = async () => {
    if (membership) {
      await supabase.from("company_members" as any).delete().eq("id", membership.id);
      setMembership(null);
    }
    setCompany(null);
    setState("search");
    toast.success("Company unlinked from your account");
  };

  const lastUpdated = company
    ? new Date(company.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

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
      <div className={cn("space-y-6 transition-all duration-300", needsLinking && "opacity-20 blur-[2px] pointer-events-none select-none")}>
        <div>
          <h3 className="text-lg font-bold text-foreground">Entity Settings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your company workspace, team, and profile
          </p>
        </div>
        <Separator />
        {/* Placeholder entity content */}
        <div className="space-y-3">
          {[
            { icon: Globe, label: "Website", value: company?.website_url || "Not set" },
            { icon: Layers, label: "Sector", value: company?.sector || "Not classified" },
            { icon: TrendingUp, label: "Stage", value: company?.stage || "Not set" },
            { icon: MapPin, label: "Health Score", value: company?.health_score != null ? `${company.health_score}/100` : "Not analyzed" },
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
            <div className="w-full max-w-md rounded-2xl border-2 border-border bg-card shadow-2xl shadow-foreground/5 overflow-hidden">
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
                  company={company}
                  ownerInfo={ownerInfo}
                  onCancel={handleCancelRequest}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Linked State (no overlay) */}
      {state === "linked" && !loading && company && (
        <LinkedState
          company={company}
          lastUpdated={lastUpdated}
          onRefresh={bootstrapState}
          onUnlink={handleUnlink}
        />
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

  // Determine scenario for each result
  function getScenario(comp: CompanySearchResult): "claimed" | "unclaimed" {
    // If a company has an owner/manager (claimed_by set or is_claimed=true and user_id exists)
    if (comp.is_claimed && comp.claimed_by) return "claimed";
    // If the company exists but nobody has claimed it
    return "unclaimed";
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 mx-auto">
          <Lock className="h-6 w-6 text-accent" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Link Your Workspace</h3>
        <p className="text-xs text-muted-foreground max-w-[320px] mx-auto">
          Entity settings are locked until you link or create a company workspace.
        </p>
      </div>

      {/* Search Input */}
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

        {/* Results Dropdown */}
        {showDropdown && (
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-popover shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
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
                        onClick={() => {
                          if (scenario === "claimed") {
                            onRequestAccess(comp);
                          } else {
                            onClaimProfile(comp);
                          }
                        }}
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

                {/* Create new — always pinned */}
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

      {/* Info footer */}
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
  company, ownerInfo, onCancel,
}: {
  company: CompanyData | null;
  ownerInfo: OwnerInfo | null;
  onCancel: () => void;
}) {
  return (
    <div className="p-6 flex flex-col items-center text-center space-y-4">
      {/* Pulsing status */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning" />
        </span>
        <Badge className="bg-warning/10 text-warning border-warning/20 text-[9px] uppercase font-bold">
          Access Pending
        </Badge>
      </div>

      {company && (
        <div className="space-y-1">
          <p className="text-base font-bold text-foreground">{company.company_name}</p>
          {company.sector && <p className="text-xs text-muted-foreground">{company.sector}</p>}
        </div>
      )}

      {/* Owner gatekeeper card */}
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
        Your request has been sent.{ownerInfo ? ` ${ownerInfo.full_name} must approve your access before you can view or edit the entity profile.` : " The workspace manager must approve your access."}
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

// ── Linked State ──

function LinkedState({
  company, lastUpdated, onRefresh, onUnlink,
}: {
  company: CompanyData;
  lastUpdated: string | null;
  onRefresh: () => void;
  onUnlink: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground">Entity Settings</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage your company workspace, team, and profile
        </p>
      </div>

      {/* Linked Company Card */}
      <div className="rounded-2xl border-2 border-accent/20 bg-accent/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 border border-accent/20">
              <Building2 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">
                  {company.company_name || "Unnamed Company"}
                </span>
                <Badge className="bg-accent/10 text-accent border-accent/20 text-[9px] uppercase font-bold">
                  Linked
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Last updated {lastUpdated}
              </p>
            </div>
          </div>
          <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-1" />
        </div>
      </div>

      {/* Company Details */}
      <div className="space-y-2.5">
        {[
          { icon: Globe, label: "Website", value: company.website_url || "Not set", hasValue: !!company.website_url },
          { icon: Layers, label: "Sector", value: company.sector || "Not classified", hasValue: !!company.sector },
          { icon: TrendingUp, label: "Stage", value: company.stage || "Not set", hasValue: !!company.stage },
          { icon: MapPin, label: "Health Score", value: company.health_score != null ? `${company.health_score}/100` : "Not analyzed", hasValue: company.health_score != null },
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
                  <p className={`text-sm font-medium ${item.hasValue ? "text-foreground" : "text-muted-foreground"}`}>{item.value}</p>
                </div>
              </div>
              {item.label === "Website" && item.hasValue && (
                <a href={company.website_url!} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      <Separator />

      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" className="rounded-lg text-xs font-semibold" onClick={onRefresh}>
          <RefreshCw className="h-3 w-3 mr-1.5" />
          Refresh
        </Button>
        <button onClick={onUnlink} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors">
          <Unlink className="h-3 w-3" />
          Unlink Company
        </button>
      </div>
    </div>
  );
}
