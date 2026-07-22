import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useOnboardingState } from "@/hooks/useOnboardingState";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";
import { completeFounderOnboardingEdge } from "@/lib/completeFounderOnboardingEdge";
import { ensureCompanyWorkspace } from "@/lib/ensureCompanyWorkspace";
import { EMPTY_FORM, type CompanyData } from "@/components/company-profile/types";
import { defaultOnboardingState, type OnboardingState } from "@/components/onboarding-wizard/types";
import { getPrimaryCompanyLogoUrl } from "@/lib/company-logo";
import { ProgressBar } from "./ProgressBar";
import { StepWelcome } from "./StepWelcome";
import { StepPersonalDetails } from "./StepPersonalDetails";
import { StepCompanyDNA } from "./StepCompanyDNA";
import { StepConnections } from "./StepConnections";
import { StepInvestorMaterials } from "./StepInvestorMaterials";
import { CheckCircle2, LockKeyhole, Network, Radar, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { playSound } from "@/lib/playSound";
import { trackMixpanelEvent } from "@/lib/mixpanel";
import { cn } from "@/lib/utils";
import { ThinkingOrb } from "thinking-orbs";

function buildLocalCompanyProfile(state: OnboardingState, resolvedCompanyName: string): CompanyData {
  const fundBits = [
    state.currentlyRaising && "Currently raising",
    state.targetRaise && `Target raise: ${state.targetRaise}`,
    state.roundType && `Round: ${state.roundType}`,
    state.targetCloseDate && `Target close: ${state.targetCloseDate}`,
  ].filter(Boolean);
  const opsBits = [
    state.revenueBand && `Revenue: ${state.revenueBand}`,
    state.cofounderCount &&
      (state.cofounderCount === "Solo" ? "Solo founder" : `${state.cofounderCount} founders`),
    state.superpowers?.length && `Strengths: ${state.superpowers.join(", ")}`,
    state.role && `Role: ${state.role}`,
  ].filter(Boolean);
  const extra = [fundBits.join(" · "), opsBits.join(" · ")].filter(Boolean).join("\n");
  const description = [state.deckText?.trim(), extra].filter(Boolean).join("\n\n").slice(0, 8000);
  const teamSize =
    state.headcount || (state.cofounderCount === "Solo"
      ? "1"
      : state.cofounderCount && /^\d+$/.test(state.cofounderCount)
        ? state.cofounderCount
        : state.cofounderCount || "");

  return {
    ...EMPTY_FORM,
    name: resolvedCompanyName.trim(),
    website: (state.websiteUrl || "").trim(),
    stage: state.stage || "",
    sector: state.sectors?.[0] || "",
    subsectors: state.sectors?.length > 1 ? state.sectors.slice(1) : [],
    description,
    currentARR: state.recurringRevenue || state.revenueBand || "",
    totalHeadcount: teamSize,
    burnRate: state.burnRate,
    cac: state.cac,
    ltv: state.ltv,
    uniqueValueProp: state.superpowers?.length ? state.superpowers.join(" · ") : "",
  };
}

function parseCompactAmount(value: string): number {
  const cleaned = value.trim().toLowerCase().replace(/[$,\s]/g, "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([kmb]?)$/);
  if (!match) return 0;
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : match[2] === "b" ? 1_000_000_000 : 1;
  return Number(match[1]) * multiplier;
}

function resolvedMonthlyRevenue(state: OnboardingState): string | null {
  if (!state.recurringRevenue.trim()) return null;
  if (state.recurringRevenuePeriod === "mrr") return state.recurringRevenue.trim();
  const annual = parseCompactAmount(state.recurringRevenue);
  return annual ? String(Math.round(annual / 12)) : null;
}

function buildExecutiveSummaryForDb(state: OnboardingState): string | null {
  const parts = [
    state.deckText?.trim()?.slice(0, 2000),
    state.currentlyRaising &&
      `Fundraising: ${[state.targetRaise, state.roundType, state.targetCloseDate].filter(Boolean).join(" · ")}`,
    state.revenueBand && `Revenue: ${state.revenueBand}`,
    state.cofounderCount && `Team: ${state.cofounderCount}`,
    state.superpowers?.length && `Focus areas: ${state.superpowers.join(", ")}`,
  ].filter(Boolean);
  const s = parts.join("\n\n").trim();
  return s ? s.slice(0, 8000) : null;
}

export function OnboardingWizard() {
  const { state, update, reset, hasStoredState } = useOnboardingState();
  const { user } = useAuth();
  const { upsertProfile } = useProfile();
  const { onboardingData, loading: preferencesLoading, upsertPrefs } = useUserPreferences();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [resumeReady, setResumeReady] = useState(false);
  const onboardingDataRef = useRef(onboardingData);
  const lastRemoteCheckpointRef = useRef("");

  useEffect(() => {
    onboardingDataRef.current = onboardingData;
  }, [onboardingData]);

  useEffect(() => {
    if (preferencesLoading || resumeReady) return;

    const remoteState = onboardingData?.wizardState;
    if (!hasStoredState && remoteState) {
      const step = Math.min(5, Math.max(1, Number(remoteState.step) || 1));
      update({ ...remoteState, step });
      lastRemoteCheckpointRef.current = JSON.stringify({ ...defaultOnboardingState, ...remoteState, step });
    }
    setResumeReady(true);
  }, [hasStoredState, onboardingData, preferencesLoading, resumeReady, update]);

  useEffect(() => {
    if (!resumeReady || !user || saving) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastRemoteCheckpointRef.current) return;

    const timeout = window.setTimeout(() => {
      void upsertPrefs({
        onboarding_data: {
          ...(onboardingDataRef.current || {}),
          wizardState: state,
        },
      }).then((result) => {
        if (result.ok) lastRemoteCheckpointRef.current = serialized;
      });
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [resumeReady, saving, state, upsertPrefs, user]);

  const goTo = useCallback((step: number) => update({ step }), [update]);

  const handleFinish = async (
    overrideCompanyName?: string,
    overrideExistingCompanyId?: string,
    overrideConnectedIntegrations?: string[],
  ) => {
    if (!user || saving) return;
    playSound("/sounds/success.wav", 0.6);
    setSaving(true);

    try {
      let companyId: string | null = null;

      const resolvedCompanyName = overrideCompanyName || state.companyName;
      // Existing portals require admin approval; never grant or promote membership here.
      const resolvedExistingId = overrideExistingCompanyId ?? state.existingCompanyId;
      const resolvedConnectedIntegrations = overrideConnectedIntegrations ?? state.connectedIntegrations;

      if (resolvedExistingId) {
        const { error: pendingErr } = await (supabase as any)
          .from("company_members")
          .insert({ user_id: user.id, company_id: resolvedExistingId, role: "pending" });

        if (pendingErr?.code === "23505") {
          // A unique conflict means this user already requested or already has access.
          const { data: existingMembership } = await (supabase as any)
            .from("company_members")
            .select("role")
            .eq("user_id", user.id)
            .eq("company_id", resolvedExistingId)
            .maybeSingle();
          if (existingMembership?.role && existingMembership.role !== "pending") {
            companyId = resolvedExistingId;
          }
        } else if (pendingErr) {
          toast({
            title: "Couldn't request portal access",
            description: pendingErr.message,
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
      } else if (resolvedCompanyName) {
        const ws = await ensureCompanyWorkspace(user.id, {
          name: resolvedCompanyName,
          website: state.websiteUrl?.trim() || "",
        });
        if (!ws.ok) {
          toast({
            title: "Couldn't create company workspace",
            description:
              ws.error +
              (/\b(bearer|JWT|401|deploy|HTTP)\b/i.test(ws.error)
                ? " Deploy the create-company-workspace edge function, or add Clerk's \"supabase\" JWT template for direct database access."
                : ""),
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
        companyId = ws.companyId;
      }

      const isPendingAccessRequest = Boolean(resolvedExistingId && !companyId);

      const prefsPayload = {
        onboarding_data: {
          firstName: state.firstName,
          lastName: state.lastName,
          email: state.email,
          linkedinUrl: state.linkedinUrl,
          twitterUrl: state.twitterUrl,
          substackUrl: state.substackUrl,
          tiktokUrl: state.tiktokUrl,
          requestedCompanyId: isPendingAccessRequest ? resolvedExistingId : undefined,
          requestedCompanyName: isPendingAccessRequest ? resolvedCompanyName : undefined,
          companyLogoUrl: state.companyLogoUrl || undefined,
          stage: state.stage,
          sectors: state.sectors,
          revenueBand: state.revenueBand,
          cofounderCount: state.cofounderCount,
          superpowers: state.superpowers,
          currentlyRaising: state.currentlyRaising,
          targetRaise: state.targetRaise,
          roundType: state.roundType,
          targetCloseDate: state.targetCloseDate,
          connectedIntegrations: resolvedConnectedIntegrations,
          deckFileName: state.deckFileName,
          deckFileUrl: state.deckFileUrl,
          recurringRevenuePeriod: state.recurringRevenuePeriod,
          recurringRevenue: state.recurringRevenue,
          burnRate: state.burnRate,
          cac: state.cac,
          ltv: state.ltv,
          headcount: state.headcount,
        },
        privacy_settings: {
          aiInboxPaths: state.aiInboxPaths,
          shareAnonMetrics: state.shareAnonMetrics,
          discoverableToInvestors: state.discoverableToInvestors,
          useMeetingNotes: state.useMeetingNotes,
        },
      };

      const execSummary = buildExecutiveSummaryForDb(state);
      const derivedLogoUrl = state.companyLogoUrl || getPrimaryCompanyLogoUrl({ websiteUrl: state.websiteUrl, size: 128 });
      const edgePayload = {
        userId: user.id,
        companyId: companyId || undefined,
        // Only update company data when it's a workspace the user OWNS (new company).
        // For existing-company joins, skip companyFields — the edge function checks
        // ownership and returns 403 if the user didn't create that company.
        companyFields:
          companyId && resolvedCompanyName && !resolvedExistingId
            ? {
                company_name: resolvedCompanyName,
                website_url: state.websiteUrl || null,
                logo_url: derivedLogoUrl,
                deck_text: state.deckText || null,
                deck_file_path: state.deckFileUrl || null,
                stage: state.stage || null,
                sector: state.sectors?.[0] || null,
                mrr: resolvedMonthlyRevenue(state),
                burn_rate: state.burnRate || null,
                cac: state.cac || null,
                ltv: state.ltv || null,
                ...(execSummary ? { executive_summary: execSummary } : {}),
              }
            : undefined,
        profile: {
          full_name: state.fullName || undefined,
          title: state.title || null,
          bio: state.bio || null,
          location: state.location || null,
          avatar_url: state.avatarUrl || null,
          linkedin_url: state.linkedinUrl || null,
          twitter_url: state.twitterUrl || null,
          user_type: state.userType || "founder",
          has_completed_onboarding: true,
          has_seen_settings_tour: false,
          company_id: companyId,
        },
        preferences: prefsPayload,
      };

      const edge = await completeFounderOnboardingEdge(edgePayload);

      if (!edge.ok) {
        if (edge.fallbackToClient) {
          if (companyId && resolvedCompanyName) {
            const { error: patchErr } = await (supabase as any)
              .from("company_analyses")
              .update({
                company_name: resolvedCompanyName,
                website_url: state.websiteUrl || null,
                logo_url: derivedLogoUrl,
                deck_text: state.deckText || null,
                deck_file_path: state.deckFileUrl || null,
                stage: state.stage || null,
                sector: state.sectors?.[0] || null,
                mrr: resolvedMonthlyRevenue(state),
                burn_rate: state.burnRate || null,
                cac: state.cac || null,
                ltv: state.ltv || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", companyId);

            if (patchErr) {
              toast({
                title: "Workspace ready — extra details not synced",
                description: `${patchErr.message} Deploy complete-founder-onboarding or add Clerk \"supabase\" JWT.`,
              });
            }
          }

          const profileRes = await upsertProfile({
            full_name: state.fullName || undefined,
            title: state.title || null,
            bio: state.bio || null,
            location: state.location || null,
            avatar_url: state.avatarUrl || null,
            linkedin_url: state.linkedinUrl || null,
            twitter_url: state.twitterUrl || null,
            user_type: state.userType || "founder",
            has_completed_onboarding: true,
            has_seen_settings_tour: false,
            ...(companyId ? { company_id: companyId } : {}),
          } as any);

          if (!profileRes.ok) {
            toast({
              title: "Couldn't save your profile",
              description:
                profileRes.error +
                (profileRes.error.includes("row-level security") ||
                profileRes.error.includes("RLS") ||
                profileRes.error.includes("No suitable key") ||
                profileRes.error.includes("wrong key type")
                  ? " Deploy edge functions create-company-workspace + complete-founder-onboarding, or add Clerk JWT template \"supabase\" in Supabase third-party auth."
                  : ""),
              variant: "destructive",
            });
            setSaving(false);
            return;
          }

          const prefsRes = await upsertPrefs(prefsPayload);

          if (!prefsRes.ok) {
            toast({
              title: "Couldn't save preferences",
              description: prefsRes.error,
              variant: "destructive",
            });
            setSaving(false);
            return;
          }
        } else {
          toast({
            title: "Couldn't finish onboarding",
            description: edge.error,
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
      }

      // ── Seed for Index / Company tab: workspace already exists; avoid "Link Your Workspace" gate ──
      try {
        localStorage.setItem("pending-company-seed", JSON.stringify({
          companyName: resolvedCompanyName || "",
          websiteUrl: state.websiteUrl || "",
          companyLogoUrl: derivedLogoUrl || "",
          deckText: state.deckText || "",
          deckFileName: state.deckFileName || "",
          deckFileUrl: state.deckFileUrl || "",
          recurringRevenuePeriod: state.recurringRevenuePeriod,
          recurringRevenue: state.recurringRevenue,
          burnRate: state.burnRate,
          cac: state.cac,
          ltv: state.ltv,
          headcount: state.headcount,
          stage: state.stage || "",
          sectors: state.sectors || [],
        }));
        if (resolvedCompanyName?.trim() && !isPendingAccessRequest) {
          localStorage.setItem(
            "company-profile",
            JSON.stringify({
              ...EMPTY_FORM,
              name: resolvedCompanyName.trim(),
              website: (state.websiteUrl || "").trim(),
              stage: state.stage || "",
              sector: state.sectors?.[0] || "",
              subsectors: state.sectors?.length ? state.sectors.slice(1) : [],
              currentARR: state.recurringRevenue || "",
              totalHeadcount: state.headcount || "",
              burnRate: state.burnRate || "",
              cac: state.cac || "",
              ltv: state.ltv || "",
            }),
          );
          if (derivedLogoUrl) {
            localStorage.setItem("company-logo-url", derivedLogoUrl);
            window.dispatchEvent(new Event("company-logo-changed"));
          }
        }
      } catch {}

      // Snapshot personal profile for nav HUD + settings pre-fill hints
      try {
        localStorage.setItem("user-profile-snapshot", JSON.stringify({
          full_name: state.fullName,
          first_name: state.firstName,
          last_name: state.lastName,
          email: state.email,
          title: state.title,
          bio: state.bio,
          location: state.location,
          linkedin_url: state.linkedinUrl,
          twitter_url: state.twitterUrl,
          substack_url: state.substackUrl,
          tiktok_url: state.tiktokUrl,
          avatar_url: state.avatarUrl,
        }));
      } catch {}

      // Auto-verify company profile after onboarding completion to unlock features like Generate Profile
      if (!isPendingAccessRequest) {
        try {
          localStorage.setItem("company-profile-verified", "true");
        } catch {}
      }

      toast(
        isPendingAccessRequest
          ? { title: "Portal access requested", description: `A ${resolvedCompanyName || "company"} admin must approve your request.` }
          : { title: `Welcome, ${state.fullName || resolvedCompanyName || "Founder"}!`, description: "Let's set up your company profile." },
      );
      trackMixpanelEvent("Conversion", {
        "Conversion Type": "onboarding_complete",
        "Conversion Value": 0,
        user_id: user.id,
      });
      window.dispatchEvent(new CustomEvent("vekta:onboarding-complete"));
      reset();
      try { localStorage.setItem("post-onboarding-view", "settings"); } catch {}
      navigate({
        pathname: "/",
        search: isPendingAccessRequest ? "?view=settings&tab=company" : "?view=settings&tab=account&tour=true",
      });
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!resumeReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Restoring your progress…
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,hsl(var(--primary)/0.12),transparent_30%),radial-gradient(circle_at_88%_82%,hsl(var(--success)/0.06),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(hsl(var(--foreground))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground))_1px,transparent_1px)] [background-size:48px_48px]" />

      <header className="relative z-10 flex h-16 items-center justify-between border-b border-border/60 px-5 sm:px-8">
        <img src="/brand/vekta-wordmark.png" alt="Vekta" className="h-9 w-24 object-contain" />
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Your setup is private</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl grid-cols-1 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="hidden border-r border-border/60 px-10 py-14 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Start with signal</p>
            <h2 className="mt-4 max-w-sm text-3xl font-semibold leading-tight tracking-tight text-foreground">
              Make every introduction and insight more relevant.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              A few details give Vekta the context to prioritize the people, companies, and opportunities that matter to you.
            </p>

            <div className="mt-10 space-y-5">
              {[
                { icon: Radar, title: "Sharper recommendations", copy: "Ranked against your stage, role, and goals." },
                { icon: Network, title: "Useful network paths", copy: "See the strongest route to the right person." },
                { icon: Sparkles, title: "Less setup later", copy: "Start with a workspace that already knows your context." },
              ].map(({ icon: Icon, title, copy }) => (
                <div key={title} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{title}</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Autosaved as you go
          </div>
        </aside>

        <section className="flex min-w-0 items-start justify-center px-4 py-7 sm:px-8 sm:py-10 lg:px-14 lg:py-14">
          <div className={cn("min-w-0 w-full", state.step >= 4 ? "max-w-2xl" : "max-w-xl")}>
            <div className="mb-7 rounded-xl border border-border/70 bg-card/70 px-5 py-4 shadow-sm backdrop-blur-xl">
              <ProgressBar currentStep={state.step} />
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/85 p-5 shadow-lg backdrop-blur-xl sm:p-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-3 z-0 opacity-25 blur-[0.4px] sm:right-6 sm:top-5"
              >
                <ThinkingOrb state="composing" size={64} speed={0.70} />
              </div>

              <div className="relative z-10">
                <AnimatePresence mode="wait">
                  {state.step === 1 && (
                    <StepPersonalDetails key="s1" state={state} update={update} onNext={() => goTo(2)} />
                  )}
                  {state.step === 2 && (
                    <StepWelcome key="s2" state={state} update={update} onNext={() => goTo(3)} onBack={() => goTo(1)} />
                  )}
                  {state.step === 3 && (
                    <StepCompanyDNA
                      key="s3"
                      state={state}
                      update={update}
                      onNext={(companyName, existingCompanyId) => {
                        update({
                          companyName: companyName ?? state.companyName,
                          existingCompanyId: existingCompanyId ?? state.existingCompanyId,
                          step: 4,
                        });
                      }}
                      onBack={() => goTo(2)}
                    />
                  )}
                  {state.step === 4 && (
                    <StepConnections
                      key="s4"
                      state={state}
                      update={update}
                      onBack={() => goTo(3)}
                      onNext={(connectedIntegrations) => {
                        update({ connectedIntegrations, step: 5 });
                      }}
                    />
                  )}
                  {state.step === 5 && (
                    <StepInvestorMaterials
                      key="s5"
                      state={state}
                      update={update}
                      onBack={() => goTo(4)}
                      onFinish={() => { void handleFinish(); }}
                      saving={saving}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
