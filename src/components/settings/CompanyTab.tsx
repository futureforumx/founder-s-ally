import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Globe, MapPin, Layers, TrendingUp,
  CheckCircle2, Unlink, RefreshCw, ExternalLink,
  Search, PlusCircle, Clock, X, Shield, Lock,
  ArrowRight, AlertTriangle, Mail, ShieldCheck, Sparkles, ChevronRight, Loader2, Linkedin
} from "lucide-react";
import { SyncReviewModal, type SyncField } from "@/components/settings/SyncReviewModal";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { getEdgeFunctionAuthToken } from "@/lib/edgeFunctionAuth";
import { isFunctionsHttpError, readFunctionsHttpErrorMessage } from "@/lib/supabaseFunctionErrors";
import { useAuth } from "@/hooks/useAuth";
import { useCapTable } from "@/hooks/useCapTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ensureCompanyWorkspace } from "@/lib/ensureCompanyWorkspace";
import { CompanyProfile, type CompanyData, type AnalysisResult } from "@/components/CompanyProfile";
import { MissionControlInvestors } from "@/components/company-profile/MissionControlInvestors";

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

/** True when `company-profile` in localStorage has a non-empty name (same signal as nav / Index). */
function readPersistedCompanyProfileName(): string | null {
  try {
    const raw = localStorage.getItem("company-profile");
    if (!raw) return null;
    const p = JSON.parse(raw);
    const n = typeof p?.name === "string" ? p.name.trim() : "";
    return n.length > 0 ? n : null;
  } catch {
    return null;
  }
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
  /** One delayed re-fetch when we link via profile/localStorage fallback (avoid infinite retries if RLS never returns a row). */
  const membershipFallbackRetryScheduledRef = useRef(false);
  /** Ignore stale async bootstrap completions (overlapping calls were resetting linked → search). */
  const bootstrapGenRef = useRef(0);

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

  // Company Magic Sync state
  const [companySyncUrl, setCompanySyncUrl] = useState("");
  const [companySyncing, setCompanySyncing] = useState(false);
  const [companySyncSuccessToken, setCompanySyncSuccessToken] = useState(0);
  const [companySyncReviewOpen, setCompanySyncReviewOpen] = useState(false);
  const [companySyncFields, setCompanySyncFields] = useState<SyncField[]>([]);
  const [companySyncApplying, setCompanySyncApplying] = useState(false);
  const [companySyncedKeys, setCompanySyncedKeys] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    membershipFallbackRetryScheduledRef.current = false;
  }, [user?.id]);

  // Bootstrap
  useEffect(() => {
    if (!user) return;
    bootstrapState();
  }, [user]);

  const bootstrapState = async () => {
    const gen = ++bootstrapGenRef.current;
    const isStale = () => gen !== bootstrapGenRef.current;

    setLoading(true);
    try {
    let localSeed: { name: string; website?: string } | null = null;
    try {
      const savedProfile = localStorage.getItem("company-profile");
      if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        const n = typeof profile?.name === "string" ? profile.name.trim() : "";
        if (n) {
          localSeed = { name: n, website: profile.website || "" };
        }
      }
    } catch (e) {
      console.warn("Failed to check local company profile:", e);
    }
    if (!localSeed) {
      try {
        const pending = localStorage.getItem("pending-company-seed");
        if (pending) {
          const j = JSON.parse(pending);
          const cn = typeof j.companyName === "string" ? j.companyName.trim() : "";
          if (cn) {
            localSeed = { name: cn, website: j.websiteUrl || "" };
          }
        }
      } catch (e) {
        console.warn("Failed to read pending-company-seed:", e);
      }
    }

    let { data: mem } = await supabase
      .from("company_members" as any)
      .select("id, company_id, role")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // #region agent log
    fetch("http://127.0.0.1:7495/ingest/6fb0ce79-c45e-47a9-a25c-e1e40763a812", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "35fbb4" },
      body: JSON.stringify({
        sessionId: "35fbb4",
        hypothesisId: "H1",
        location: "CompanyTab.tsx:bootstrap:after-members-query",
        message: "membership row + local seed",
        data: { hasMem: !!mem, localSeedName: localSeed?.name ?? null, userIdLen: user!.id?.length ?? 0 },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (!mem && localSeed) {
      const ensured = await ensureCompanyWorkspace(user!.id, {
        name: localSeed.name,
        website: localSeed.website || "",
      });
      if (!ensured.ok) {
        console.warn("ensureCompanyWorkspace (local profile):", ensured.error);
      } else {
        const refetch = await supabase
          .from("company_members" as any)
          .select("id, company_id, role")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        mem = refetch.data;
        // Server/edge created the workspace but PostgREST often cannot SELECT company_members with a misconfigured Clerk JWT — still link using the id we know is correct.
        if (!mem && ensured.ok) {
          mem = { id: "", company_id: ensured.companyId, role: "manager" } as any;
          try {
            localStorage.setItem("vekta-last-workspace-company-id", ensured.companyId);
          } catch {
            /* ignore */
          }
        }
      }
    }

    if (!mem) {
      const { data: ownCompany } = await supabase
        .from("company_analyses")
        .select("id, company_name")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ownCompany) {
        const ensured = await ensureCompanyWorkspace(user!.id, {
          name: (ownCompany as any).company_name || "Company",
          website: "",
        });
        if (ensured.ok) {
          const refetch = await supabase
            .from("company_members" as any)
            .select("id, company_id, role")
            .eq("user_id", user!.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          mem = refetch.data;
          if (!mem && ensured.ok) {
            mem = { id: "", company_id: ensured.companyId, role: "manager" } as any;
            try {
              localStorage.setItem("vekta-last-workspace-company-id", ensured.companyId);
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    if (isStale()) return;

    if (mem) {
      const m = mem as any;
      if (m.id) {
        try {
          localStorage.removeItem("vekta-last-workspace-company-id");
        } catch {
          /* ignore */
        }
      }
      setMembership({ id: m.id, company_id: m.company_id, role: m.role });

      if (m.role === "pending") {
        setState("pending");
        fetchOwner(m.company_id);
      } else {
        setState("linked");
      }
    } else {
      // Post-onboarding: workspace + profile.company_id often exist before company_members is visible to the client (JWT/RLS timing).
      const { data: prof } = await supabase
        .from("profiles" as any)
        .select("company_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (isStale()) return;
      const profileCompanyId = (prof as { company_id?: string } | null)?.company_id;

      let storedWorkspaceId: string | null = null;
      try {
        storedWorkspaceId = localStorage.getItem("vekta-last-workspace-company-id");
      } catch {
        /* ignore */
      }
      const uuidOk =
        typeof storedWorkspaceId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storedWorkspaceId.trim());

      let lsProfileName: string | null = null;
      try {
        const raw = localStorage.getItem("company-profile");
        if (raw) {
          const p = JSON.parse(raw);
          const n = typeof p?.name === "string" ? p.name.trim() : "";
          lsProfileName = n || null;
        }
      } catch {
        lsProfileName = null;
      }

      // #region agent log
      fetch("http://127.0.0.1:7495/ingest/6fb0ce79-c45e-47a9-a25c-e1e40763a812", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "35fbb4" },
        body: JSON.stringify({
          sessionId: "35fbb4",
          hypothesisId: "H2",
          location: "CompanyTab.tsx:bootstrap:no-mem-branch",
          message: "profile + storage gates",
          data: {
            profileCompanyId: profileCompanyId ?? null,
            uuidOk,
            localSeedName: localSeed?.name ?? null,
            lsProfileName,
            bootstrapGen: gen,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      if (profileCompanyId) {
        // #region agent log
        fetch("http://127.0.0.1:7495/ingest/6fb0ce79-c45e-47a9-a25c-e1e40763a812", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "35fbb4" },
          body: JSON.stringify({
            sessionId: "35fbb4",
            hypothesisId: "H4",
            location: "CompanyTab.tsx:bootstrap:profile-company-id",
            message: "linked via profiles.company_id",
            data: { hasProfileCompanyId: true },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setMembership({ id: "", company_id: profileCompanyId, role: "manager" });
        setState("linked");
        if (!membershipFallbackRetryScheduledRef.current) {
          membershipFallbackRetryScheduledRef.current = true;
          window.setTimeout(() => {
            void bootstrapState();
          }, 2500);
        }
      } else if (uuidOk && localSeed?.name) {
        setMembership({ id: "", company_id: storedWorkspaceId!.trim(), role: "manager" });
        setState("linked");
        if (!membershipFallbackRetryScheduledRef.current) {
          membershipFallbackRetryScheduledRef.current = true;
          window.setTimeout(() => {
            void bootstrapState();
          }, 2500);
        }
      } else if (localSeed?.name) {
        // Last resort: workspace API succeeded before but this client still has no row — call edge again and trust returned id.
        const last = await ensureCompanyWorkspace(user!.id, {
          name: localSeed.name,
          website: localSeed.website || "",
        });
        if (!isStale() && last.ok) {
          setMembership({ id: "", company_id: last.companyId, role: "manager" });
          setState("linked");
          try {
            localStorage.setItem("vekta-last-workspace-company-id", last.companyId);
          } catch {
            /* ignore */
          }
        } else if (!isStale()) {
          // #region agent log
          fetch("http://127.0.0.1:7495/ingest/6fb0ce79-c45e-47a9-a25c-e1e40763a812", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "35fbb4" },
            body: JSON.stringify({
              sessionId: "35fbb4",
              hypothesisId: "H3",
              location: "CompanyTab.tsx:bootstrap:ensure-failed",
              message: "last-resort ensureCompanyWorkspace did not link",
              data: { lastOk: last.ok, stale: isStale(), localSeedName: localSeed.name },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          setState("search");
        }
      } else {
        // #region agent log
        fetch("http://127.0.0.1:7495/ingest/6fb0ce79-c45e-47a9-a25c-e1e40763a812", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "35fbb4" },
          body: JSON.stringify({
            sessionId: "35fbb4",
            hypothesisId: "H5",
            location: "CompanyTab.tsx:bootstrap:search-no-local-seed",
            message: "fallthrough setState(search)",
            data: { hadLocalSeed: !!localSeed?.name },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setState("search");
      }
    }
    } finally {
      if (gen === bootstrapGenRef.current) {
        setLoading(false);
      }
    }
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

    const finishClaimSuccess = (membershipRowId?: string) => {
      setMembership({ id: membershipRowId ?? "", company_id: comp.id, role: "manager" });
      setState("linked");
      setDropdownOpen(false);
      setQuery("");
      setRequesting(false);
      toast.success("Profile claimed! You are now the manager.");
    };

    if (isSupabaseConfigured) {
      const jwt = await getEdgeFunctionAuthToken();
      if (jwt) {
        const { data, error } = await supabase.functions.invoke("claim-company-workspace", {
          body: { companyId: comp.id, userId: user.id },
          headers: { Authorization: `Bearer ${jwt}` },
        });
        const payload = (data || {}) as {
          success?: boolean;
          companyId?: string;
          membershipId?: string;
          error?: string;
        };

        if (payload.success && payload.companyId) {
          finishClaimSuccess(payload.membershipId);
          return;
        }

        if (payload.error) {
          toast.error(payload.error, { duration: 10_000 });
          setRequesting(false);
          return;
        }

        if (error) {
          const jsonErr = await readFunctionsHttpErrorMessage(error);
          if (jsonErr) {
            toast.error(jsonErr, { duration: 10_000 });
            setRequesting(false);
            return;
          }
          if (isFunctionsHttpError(error) && error.context.status !== 404) {
            toast.error(
              `Claim failed (HTTP ${error.context.status}). Deploy claim-company-workspace or configure Clerk "supabase" JWT.`,
              { duration: 12_000 },
            );
            setRequesting(false);
            return;
          }
        }
      }
    }

    const { error: claimError } = await (supabase as any)
      .from("company_analyses")
      .update({ claimed_by: user.id, is_claimed: true })
      .eq("id", comp.id);

    if (claimError) {
      toast.error(
        "Failed to claim company profile: " +
          claimError.message +
          " If you are not the original creator of this row, deploy claim-company-workspace (service role) or add a Clerk \"supabase\" JWT template.",
        { duration: 12_000 },
      );
      setRequesting(false);
      return;
    }

    const { error: memberError } = await supabase
      .from("company_members" as any)
      .insert({ user_id: user.id, company_id: comp.id, role: "manager" });

    if (memberError) {
      toast.error(
        `Could not add you as manager: ${memberError.message}. If this persists, apply DB migration 20260328180000 or deploy claim-company-workspace.`,
      );
      setRequesting(false);
      return;
    }

    const { error: profileError } = await (supabase as any)
      .from("profiles")
      .update({ company_id: comp.id })
      .eq("user_id", user.id);

    if (profileError) {
      toast.error("Profile claimed but failed to update your metadata: " + profileError.message);
      setRequesting(false);
      return;
    }

    const { data: memRef } = await supabase
      .from("company_members" as any)
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", comp.id)
      .maybeSingle();
    finishClaimSuccess((memRef as { id?: string } | null)?.id);
  };

  // ── Scenario C: Create Workspace ──
  const handleCreateWorkspace = async (name: string) => {
    if (!user) return;
    const workspaceName = name.trim();
    if (!workspaceName) {
      toast.error("Enter a workspace name first.");
      return;
    }
    setRequesting(true);

    try {
      const ws = await ensureCompanyWorkspace(user.id, { name: workspaceName, website: "" });
      if (!ws.ok) {
        console.error("Company workspace error:", ws.error);
        let errorMsg = ws.error;
        if (
          ws.error.includes("No suitable key") ||
          ws.error.toLowerCase().includes("wrong key type")
        ) {
          errorMsg =
            "Database rejected your login token. Add a Clerk JWT template named exactly \"supabase\" and enable Clerk in Supabase → Authentication (see Supabase third-party Clerk docs). Or deploy the create-company-workspace edge function.";
        } else if (ws.error.includes("Unauthorized") || ws.error.includes("PGRST301")) {
          errorMsg = "Sign-in session invalid. Sign out and back in, then try again.";
        } else if (ws.error.toLowerCase().includes("duplicate")) {
          errorMsg = "A workspace may already exist for this account. Refresh the page.";
        } else if (ws.error.includes("Missing or invalid bearer")) {
          errorMsg = "Not signed in, or session token missing. Refresh the page and try again.";
        }
        toast.error(errorMsg, { duration: 12_000 });
        setRequesting(false);
        return;
      }

      const newComp = { id: ws.companyId };

      // Step 4: Get user profile for welcome email (optional)
      let userProfile = null;
      try {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        userProfile = data;
      } catch (err) {
        console.warn("Failed to fetch user profile:", err);
      }

      // Step 5: Send welcome email (graceful failure)
      try {
        toast.loading("Sending welcome email...", { id: "welcome-email" });

        await sendEmailNotification({
          type: "workspace_welcome",
          recipientEmail: user.email,
          recipientName: userProfile?.full_name || user.email?.split("@")[0],
          companyName: workspaceName,
        });
      } catch (emailErr) {
        console.warn("Email notification failed (non-critical):", emailErr);
        // Non-fatal - workspace was created successfully
      }

      // Success!
      toast.success("Workspace created successfully!", { id: "welcome-email" });

      try {
        localStorage.setItem(
          "pending-company-seed",
          JSON.stringify({ companyName: workspaceName, websiteUrl: "" }),
        );
        window.dispatchEvent(new CustomEvent("show-onboarding"));
      } catch {
        /* ignore */
      }

      setMembership({ id: "", company_id: newComp.id, role: "manager" });
      setState("linked");
      setDropdownOpen(false);
      setQuery("");
      setRequesting(false);
    } catch (err: any) {
      console.error("Unexpected workspace creation error:", err);
      const errorMsg = err?.message || "An unexpected error occurred. Please try again.";
      toast.error(errorMsg);
      setRequesting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!membership) return;
    if (membership.id) {
      await supabase.from("company_members" as any).delete().eq("id", membership.id);
    } else {
      await supabase
        .from("company_members" as any)
        .delete()
        .eq("user_id", user!.id)
        .eq("company_id", membership.company_id)
        .eq("role", "pending");
    }
    setMembership(null);
    setState("search");
    toast.success("Request cancelled");
  };

  const handleUnlink = async () => {
    if (!membership) return;
    let error: { message: string } | null = null;
    if (membership.id) {
      const res = await supabase.from("company_members" as any).delete().eq("id", membership.id);
      error = res.error;
    } else {
      const res = await supabase
        .from("company_members" as any)
        .delete()
        .eq("user_id", user!.id)
        .eq("company_id", membership.company_id);
      error = res.error;
    }
    if (error) {
      toast.error("Failed to unlink: " + error.message);
      return;
    }
    try {
      localStorage.removeItem("vekta-last-workspace-company-id");
    } catch {
      /* ignore */
    }
    setMembership(null);
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

  // When ensureCompanyWorkspace / DB membership fails (logs: H3), user can still have a real company in localStorage — match nav behavior and do not block the editor.
  const hasLocalCompanyProfile = useMemo(() => {
    const fromState = typeof companyData?.name === "string" && companyData.name.trim().length > 0;
    if (fromState) return true;
    return readPersistedCompanyProfileName() != null;
  }, [companyData?.name]);

  // #region agent log
  useEffect(() => {
    if (!loading && state === "search" && hasLocalCompanyProfile) {
      fetch("http://127.0.0.1:7495/ingest/6fb0ce79-c45e-47a9-a25c-e1e40763a812", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "35fbb4" },
        body: JSON.stringify({
          sessionId: "35fbb4",
          runId: "post-fix",
          hypothesisId: "VFY",
          location: "CompanyTab.tsx:local-profile-ui",
          message: "showing company editor despite search state (local profile bypass)",
          data: { hasLocalCompanyProfile },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
  }, [loading, state, hasLocalCompanyProfile]);
  // #endregion

  const showWorkspaceEditor =
    !loading && (state === "linked" || (state === "search" && hasLocalCompanyProfile));

  // Determine if we need the overlay modal (not linked)
  const needsLinking = state === "pending" || (state === "search" && !hasLocalCompanyProfile);

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

      {/* ── Linked (or local company profile): Full Company Profile Editor ── */}
      {showWorkspaceEditor && (
        <div className="space-y-6">
          {/* ═══ Full-Width Stacked Layout ═══ */}
          <div className="flex flex-col gap-6">

            {/* Profile Strength moved to Copilot Mission Banner modal */}


            {/* Company Profile Editor */}
            <CompanyProfile
              key={profileKey}
              onSave={setCompanyData}
              onAnalysis={handleAnalysis}
              onSectorChange={setSectorClassification}
              onStageClassification={setStageClassification}
              onProfileVerified={setIsProfileVerified}
              onSectionConfirmedChange={setSectionConfirmed}
              onCompletionChange={setProfileCompletion}
              companyId={membership?.company_id}
              onSyncCompany={async (url: string) => {
                setCompanySyncing(true);
                try {
                  const { data, error } = await supabase.functions.invoke("sync-company-linkedin", {
                    body: { companyUrl: url },
                  });
                  if (error) throw error;
                  if (!data?.success) throw new Error(data?.error || "Sync failed");

                  const incoming = data.data;
                  const fields: SyncField[] = [
                    { key: "name", label: "Company Name", existing: companyData?.name || null, incoming: incoming.company_name },
                    { key: "description", label: "Description", existing: companyData?.description || null, incoming: incoming.description?.slice(0, 500) || null },
                    { key: "sector", label: "Sector", existing: companyData?.sector || null, incoming: incoming.sector },
                    { key: "website", label: "Website", existing: companyData?.website || null, incoming: incoming.website_url },
                    { key: "hqLocation", label: "HQ Location", existing: companyData?.hqLocation || null, incoming: incoming.hq_location },
                    { key: "totalHeadcount", label: "Employee Count", existing: companyData?.totalHeadcount || null, incoming: incoming.employee_count },
                  ];

                  // Auto-apply logo if available from sync
                  if (incoming.logo_url) {
                    try {
                      const savedProfile = localStorage.getItem("company-profile");
                      const currentProfile = savedProfile ? JSON.parse(savedProfile) : {};
                      localStorage.setItem("company-profile", JSON.stringify({ ...currentProfile, logo_url: incoming.logo_url }));
                      localStorage.setItem("company-logo-url", incoming.logo_url);
                      window.dispatchEvent(new Event("company-logo-changed"));
                    } catch {}
                  }

                  setCompanySyncFields(fields);
                  setCompanySyncReviewOpen(true);
                  setCompanySyncSuccessToken((current) => current + 1);
                } catch (err: any) {
                  toast.error("Sync failed: " + (err.message || "Unknown error"));
                } finally {
                  setCompanySyncing(false);
                }
              }}
              companySyncing={companySyncing}
              companySyncSuccessToken={companySyncSuccessToken}
              sectionConfirmedState={sectionConfirmed}
              companyData={companyData}
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
                previousSectionApproved={!!sectionConfirmed.social || !!localStorage.getItem("company-profile")}
                onConfirmedChange={setInvestorsConfirmed}
              />
            </div>

            {/* ── Danger Zone: Unlink (only when a server workspace id exists) ── */}
            {membership?.company_id ? (
              <>
                <Separator />
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Unlink Company</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Remove this company from your account. This won't delete any data.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleUnlink} className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                    <Unlink className="h-3.5 w-3.5 mr-1.5" />
                    Unlink
                  </Button>
                </div>
              </>
            ) : null}
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
      {/* Company Sync Review Modal */}
      <SyncReviewModal
        open={companySyncReviewOpen}
        onOpenChange={setCompanySyncReviewOpen}
        title="Review Company Data"
        fields={companySyncFields}
        onApply={(selectedKeys) => {
          setCompanySyncApplying(true);
          const fieldMap = Object.fromEntries(companySyncFields.map(f => [f.key, f.incoming]));

          // Update localStorage company-profile with new values
          try {
            const saved = localStorage.getItem("company-profile");
            const current = saved ? JSON.parse(saved) : {};
            for (const key of selectedKeys) {
              const val = fieldMap[key];
              if (val !== null && val !== undefined && String(val).trim() !== "") {
                current[key] = val;
              }
            }
            localStorage.setItem("company-profile", JSON.stringify(current));
            setCompanyData(current);
          } catch {}

          // Track synced keys for highlight animation
          setCompanySyncedKeys(new Set(selectedKeys));
          setTimeout(() => setCompanySyncedKeys(new Set()), 2500);

          setCompanySyncApplying(false);
          setCompanySyncReviewOpen(false);
          setProfileKey(prev => prev + 1);
          toast.success(`Applied ${selectedKeys.length} company field${selectedKeys.length !== 1 ? "s" : ""}`);
        }}
        applying={companySyncApplying}
      />
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
                    {requesting ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="h-4 w-4 border-2 border-accent/30 border-t-accent rounded-full"
                      />
                    ) : (
                      <PlusCircle className="h-4 w-4 text-accent" />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-accent">
                      {results.length === 0
                        ? `Create "${query.trim()}" workspace`
                        : `Create "${query.trim()}" as new`}
                    </span>
                    {requesting && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Setting up workspace...</p>
                    )}
                  </div>
                  {!requesting && <ArrowRight className="h-3.5 w-3.5 text-accent ml-auto shrink-0" />}
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
