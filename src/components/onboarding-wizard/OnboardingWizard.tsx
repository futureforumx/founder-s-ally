import { useCallback, useState } from "react";
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
import type { OnboardingState } from "@/components/onboarding-wizard/types";
import { getPrimaryCompanyLogoUrl } from "@/lib/company-logo";
import { ProgressBar } from "./ProgressBar";
import { StepWelcome } from "./StepWelcome";
import { StepIdentity } from "./StepIdentity";
import { StepCompanyDNA } from "./StepCompanyDNA";
import { CheckCircle2, LockKeyhole, Network, Radar, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { playSound } from "@/lib/playSound";
import { trackMixpanelEvent } from "@/lib/mixpanel";

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
    state.cofounderCount === "Solo"
      ? "1"
      : state.cofounderCount && /^\d+$/.test(state.cofounderCount)
        ? state.cofounderCount
        : state.cofounderCount || "";

  return {
    ...EMPTY_FORM,
    name: resolvedCompanyName.trim(),
    website: (state.websiteUrl || "").trim(),
    stage: state.stage || "",
    sector: state.sectors?.[0] || "",
    subsectors: state.sectors?.length > 1 ? state.sectors.slice(1) : [],
    description,
    currentARR: state.revenueBand || "",
    totalHeadcount: teamSize,
    uniqueValueProp: state.superpowers?.length ? state.superpowers.join(" · ") : "",
  };
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
  const { state, update, reset } = useOnboardingState();
  const { user } = useAuth();
  const { upsertProfile } = useProfile();
  const { upsertPrefs } = useUserPreferences();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const goTo = useCallback((step: number) => update({ step }), [update]);

  const handleFinish = async (overrideCompanyName?: string, overrideExistingCompanyId?: string) => {
    if (!user || saving) return;
    playSound("/sounds/success.wav", 0.6);
    setSaving(true);

    try {
      let companyId: string | null = null;

      const resolvedCompanyName = overrideCompanyName || state.companyName;
      // When the user joins an existing in-network company, use its real DB id directly
      // instead of creating a duplicate company_analyses row with the same name.
      const resolvedExistingId = overrideExistingCompanyId ?? state.existingCompanyId;

      if (resolvedExistingId) {
        // Joining an existing company — just ensure membership, then link profile
        companyId = resolvedExistingId;
        const { supabase: _sb } = await import("@/integrations/supabase/client");
        const { ensureManagerMembership: _emm } = await import("@/lib/ensureManagerMembership");
        const memRes = await _emm(_sb as any, user.id, resolvedExistingId);
        if (!memRes.ok) {
          // Membership insert likely blocked by RLS (company owned by someone else).
          // Fall back to a pending membership request — users can request access.
          const { error: pendingErr } = await (_sb as any)
            .from("company_members")
            .insert({ user_id: user.id, company_id: resolvedExistingId, role: "pending" });
          if (pendingErr && pendingErr.code !== "23505") {
            toast({
              title: "Couldn't join company",
              description: pendingErr.message,
              variant: "destructive",
            });
            setSaving(false);
            return;
          }
        }
        // Keep the service-role route as the stable path across auth providers.
        // Use the service-role API route instead. company_id will also be saved via
        // completeFounderOnboardingEdge below, so this is just a best-effort early link.
        await upsertProfile({ company_id: resolvedExistingId } as any);
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

      const prefsPayload = {
        onboarding_data: {
          stage: state.stage,
          sectors: state.sectors,
          revenueBand: state.revenueBand,
          cofounderCount: state.cofounderCount,
          superpowers: state.superpowers,
          currentlyRaising: state.currentlyRaising,
          targetRaise: state.targetRaise,
          roundType: state.roundType,
          targetCloseDate: state.targetCloseDate,
          connectedIntegrations: state.connectedIntegrations,
        },
        privacy_settings: {
          aiInboxPaths: state.aiInboxPaths,
          shareAnonMetrics: state.shareAnonMetrics,
          discoverableToInvestors: state.discoverableToInvestors,
          useMeetingNotes: state.useMeetingNotes,
        },
      };

      const execSummary = buildExecutiveSummaryForDb(state);
      const derivedLogoUrl = getPrimaryCompanyLogoUrl({ websiteUrl: state.websiteUrl, size: 128 });
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
                stage: state.stage || null,
                sector: state.sectors?.[0] || null,
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
                stage: state.stage || null,
                sector: state.sectors?.[0] || null,
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
          deckText: state.deckText || "",
          stage: state.stage || "",
          sectors: state.sectors || [],
        }));
        if (resolvedCompanyName?.trim()) {
          localStorage.setItem(
            "company-profile",
            JSON.stringify({
              ...EMPTY_FORM,
              name: resolvedCompanyName.trim(),
              website: (state.websiteUrl || "").trim(),
              stage: state.stage || "",
              sector: state.sectors?.[0] || "",
              subsectors: state.sectors?.length ? state.sectors.slice(1) : [],
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
          avatar_url: state.avatarUrl,
        }));
      } catch {}

      // Auto-verify company profile after onboarding completion to unlock features like Generate Profile
      try {
        localStorage.setItem("company-profile-verified", "true");
      } catch {}

      toast({ title: `Welcome, ${state.fullName || resolvedCompanyName || "Founder"}!`, description: "Let's set up your company profile." });
      trackMixpanelEvent("Conversion", {
        "Conversion Type": "onboarding_complete",
        "Conversion Value": 0,
        user_id: user.id,
      });
      window.dispatchEvent(new CustomEvent("vekta:onboarding-complete"));
      reset();
      try { localStorage.setItem("post-onboarding-view", "settings"); } catch {}
      navigate({ pathname: "/", search: "?view=settings&tab=account&tour=true" });
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

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

        <section className="flex items-start justify-center px-4 py-7 sm:px-8 sm:py-10 lg:px-14 lg:py-14">
          <div className="w-full max-w-xl">
            <div className="mb-7 rounded-xl border border-border/70 bg-card/70 px-5 py-4 shadow-sm backdrop-blur-xl">
              <ProgressBar currentStep={state.step} />
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/85 p-5 shadow-lg backdrop-blur-xl sm:p-8">
              <AnimatePresence mode="wait">
                {state.step === 1 && (
                  <StepWelcome key="s1" state={state} update={update} onNext={() => goTo(2)} />
                )}
                {state.step === 2 && (
                  <StepIdentity key="s2" state={state} update={update} onNext={() => goTo(3)} onBack={() => goTo(1)} />
                )}
                {state.step === 3 && (
                  <StepCompanyDNA key="s3" state={state} update={update} onNext={(name, existingId) => { void handleFinish(name, existingId); }} onBack={() => goTo(2)} />
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
