import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Building2, Globe, MapPin, Layers, TrendingUp,
  CheckCircle2, Unlink, RefreshCw, ExternalLink,
  Search, PlusCircle, Clock, X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ── Types ──

interface CompanyData {
  id: string;
  company_name: string;
  website_url: string | null;
  sector: string | null;
  stage: string | null;
  health_score: number | null;
  updated_at: string;
}

interface CompanySearchResult {
  id: string;
  company_name: string;
  sector: string | null;
  stage: string | null;
}

interface MembershipRow {
  id: string;
  company_id: string;
  role: string;
  company_analyses: CompanyData;
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

// ── Main Component ──

export function CompanyTab() {
  const { user } = useAuth();
  const [state, setState] = useState<TabState>("search");
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [membership, setMembership] = useState<{ id: string; company_id: string; role: string } | null>(null);
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

  // Bootstrap: check existing membership
  useEffect(() => {
    if (!user) return;
    bootstrapState();
  }, [user]);

  const bootstrapState = async () => {
    setLoading(true);
    // Check for any membership
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

      // Fetch company data
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
      // Fallback: check if user owns a company_analyses record directly
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
    const { data: ownerMem } = await supabase
      .from("company_members" as any)
      .select("user_id")
      .eq("company_id", companyId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (ownerMem) {
      const o = ownerMem as any;
      // Get owner's company analysis for name
      const { data: ownerAnalysis } = await supabase
        .from("company_analyses")
        .select("company_name")
        .eq("user_id", o.user_id)
        .limit(1)
        .maybeSingle();

      setOwnerInfo({
        user_id: o.user_id,
        full_name: ownerAnalysis?.company_name || "Workspace Owner",
        avatar_url: null,
        title: "Owner",
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
      .select("id, company_name, sector, stage")
      .ilike("company_name", `%${term}%`)
      .order("updated_at", { ascending: false })
      .limit(8);

    setResults(data || []);
    setSearching(false);
    setDropdownOpen(true);
  };

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

    setCompany({ ...comp, website_url: null, health_score: null, updated_at: new Date().toISOString() });
    setMembership({ id: "", company_id: comp.id, role: "pending" });
    setState("pending");
    setDropdownOpen(false);
    setQuery("");
    setRequesting(false);
    fetchOwner(comp.id);
    toast.success("Access request sent!");
  };

  const handleCancelRequest = async () => {
    if (!membership) return;
    await supabase
      .from("company_members" as any)
      .delete()
      .eq("id", membership.id);

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

  const handleNavigateToMissionControl = () => {
    window.dispatchEvent(new CustomEvent("navigate-to-tab", { detail: "manage" }));
    toast.info("Switched to Mission Control — run an analysis to create your workspace");
  };

  const lastUpdated = company
    ? new Date(company.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div>
        <h3 className="text-lg font-bold text-foreground">Company</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Link your account to a company workspace
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : state === "search" ? (
        <SearchState
          query={query}
          setQuery={setQuery}
          results={results}
          searching={searching}
          dropdownOpen={dropdownOpen}
          setDropdownOpen={setDropdownOpen}
          containerRef={containerRef}
          requesting={requesting}
          onSelectCompany={handleRequestAccess}
          onNavigateNew={handleNavigateToMissionControl}
        />
      ) : state === "pending" ? (
        <PendingState
          company={company}
          ownerInfo={ownerInfo}
          onCancel={handleCancelRequest}
        />
      ) : (
        <LinkedState
          company={company!}
          lastUpdated={lastUpdated}
          onRefresh={bootstrapState}
          onUnlink={handleUnlink}
        />
      )}
    </motion.div>
  );
}

// ── Search State ──

function SearchState({
  query, setQuery, results, searching, dropdownOpen, setDropdownOpen,
  containerRef, requesting, onSelectCompany, onNavigateNew,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: CompanySearchResult[];
  searching: boolean;
  dropdownOpen: boolean;
  setDropdownOpen: (v: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  requesting: boolean;
  onSelectCompany: (c: CompanySearchResult) => void;
  onNavigateNew: () => void;
}) {
  const showDropdown = dropdownOpen && query.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-dashed border-border p-6 space-y-4">
        <div className="text-center space-y-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 mx-auto mb-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-lg font-bold text-foreground">Link Your Workspace</p>
          <p className="text-xs text-muted-foreground max-w-[300px] mx-auto">
            Search for your company to request access, or create a new workspace.
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
              placeholder="Search companies..."
              autoComplete="off"
              className="w-full h-11 rounded-xl border border-input bg-muted/30 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
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

          {/* Dropdown */}
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
                    results.map((comp) => (
                      <button
                        key={comp.id}
                        onClick={() => onSelectCompany(comp)}
                        disabled={requesting}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 flex items-center gap-3 border-b border-border last:border-0 transition-colors disabled:opacity-50"
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-semibold text-foreground">{comp.company_name}</span>
                          {comp.sector && (
                            <span className="block text-[10px] text-muted-foreground">{comp.sector}{comp.stage ? ` · ${comp.stage}` : ""}</span>
                          )}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-xs text-muted-foreground">
                      No companies found
                    </div>
                  )}

                  {/* Add New — always pinned */}
                  <button
                    onClick={onNavigateNew}
                    className="w-full text-left px-4 py-3 bg-primary/5 hover:bg-primary/10 flex items-center gap-3 text-primary font-bold transition-colors text-sm border-t border-border"
                  >
                    <PlusCircle className="h-4 w-4 shrink-0" />
                    {results.length === 0
                      ? `No companies found. Create "${query.trim()}" workspace →`
                      : `Add "${query.trim()}" as a new company`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pending State ──

function PendingState({
  company, ownerInfo, onCancel,
}: {
  company: CompanyData | null;
  ownerInfo: OwnerInfo | null;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-border bg-card p-6 flex flex-col items-center text-center relative overflow-hidden space-y-4">
      {/* Pulsing status */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
        </span>
        <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[9px] uppercase font-bold">
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
        <div className="mt-2 p-4 bg-muted/30 border border-border rounded-xl w-full max-w-sm flex items-center gap-4 text-left">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border border-border text-sm font-bold text-primary shrink-0">
            {ownerInfo.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Workspace Owner</p>
            <p className="text-sm font-bold text-foreground truncate">{ownerInfo.full_name}</p>
            {ownerInfo.title && <p className="text-xs text-muted-foreground">{ownerInfo.title}</p>}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground max-w-[320px]">
        Your request has been sent.{ownerInfo ? ` ${ownerInfo.full_name} must approve your access before you can view or edit the company profile.` : " The workspace owner must approve your access."}
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
    <>
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
    </>
  );
}
