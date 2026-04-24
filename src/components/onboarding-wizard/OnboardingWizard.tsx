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
import { EMPTY_FORM } from "@/components/company-profile/types";
import type { OnboardingState } from "@/components/onboarding-wizard/types";
import { getPrimaryCompanyLogoUrl } from "@/lib/company-logo";
import { ProgressBar } from "./ProgressBar";
import { StepIdentity } from "./StepIdentity";
import { StepCompanyDNA } from "./StepCompanyDNA";
import { toast } from "@/hooks/use-toast";
import { playSound } from "@/lib/playSound";
import { trackMixpanelEvent } from "@/lib/mixpanel";

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

    // Capture everything from state synchronously before any async work or reset()
    const resolvedCompanyName = overrideCompanyName || state.companyName;
    const resolvedExistingId = overrideExistingCompanyId ?? state.existingCompanyId;
    const derivedLogoUrl = getPrimaryCompanyLogoUrl({ websiteUrl: state.websiteUrl, size: 128 });
    const execSummary = buildExecutiveSummaryForDb(state);
    const snap = { ...state };
    const userId = user.id;

    // ── Write local caches synchronously — never blocks navigation ──
    try {
      localStorage.setItem("pending-company-seed", JSON.stringify({
        companyName: resolvedCompanyName || "",
        websiteUrl: snap.websiteUrl || "",
        deckText: snap.deckText || "",
        stage: snap.stage || "",
        sectors: snap.sectors || [],
      }));
      if (resolvedCompanyName?.trim()) {
        localStorage.setItem(
          "company-profile",
          JSON.stringify({
            ...EMPTY_FORM,
            name: resolvedCompanyName.trim(),
            website: (snap.websiteUrl || "").trim(),
            stage: snap.stage || "",
            sector: snap.sectors?.[0] || "",
            subsectors: snap.sectors?.length ? snap.sectors.slice(1) : [],
          }),
        );
        if (derivedLogoUrl) {
          localStorage.setItem("company-logo-url", derivedLogoUrl);
          window.dispatchEvent(new Event("company-logo-changed"));
        }
      }
    } catch {}

    try {
      localStorage.setItem("user-profile-snapshot", JSON.stringify({
        full_name: snap.fullName,
        first_name: snap.firstName,
        last_name: snap.lastName,
        email: snap.email,
        title: snap.title,
        bio: snap.bio,
        location: snap.location,
        linkedin_url: snap.linkedinUrl,
        twitter_url: snap.twitterUrl,
        avatar_url: snap.avatarUrl,
      }));
    } catch {}

    try { localStorage.setItem("company-profile-verified", "true"); } catch {}

    // ── Mark complete and navigate NOW — the user must never be blocked by DB/network ──
    try { localStorage.setItem("vekta-onboarding-done", userId); } catch {}
    window.dispatchEvent(new CustomEvent("vekta:onboarding-complete"));

    toast({ title: `Welcome, ${snap.fullName || resolvedCompanyName || "Founder"}!`, description: "Let's set up your company profile." });
    trackMixpanelEvent("Conversion", {
      "Conversion Type": "onboarding_complete",
      "Conversion Value": 0,
      user_id: userId,
    });

    reset();
    try { localStorage.setItem("post-onboarding-view", "settings"); } catch {}
    navigate({ pathname: "/", search: "?view=settings&tab=account&tour=true" });

    // ── Background DB sync (fire-and-forget; component is unmounted by now) ──
    try {
      let companyId: string | null = null;

      if (resolvedExistingId) {
        companyId = resolvedExistingId;
        const { supabase: _sb } = await import("@/integrations/supabase/client");
        const { ensureManagerMembership: _emm } = await import("@/lib/ensureManagerMembership");
        const memRes = await _emm(_sb as any, userId, resolvedExistingId);
        if (!memRes.ok) {
          await (_sb as any)
            .from("company_members")
            .insert({ user_id: userId, company_id: resolvedExistingId, role: "pending" });
        }
        await upsertProfile({ company_id: resolvedExistingId } as any);
      } else if (resolvedCompanyName) {
        const ws = await ensureCompanyWorkspace(userId, {
          name: resolvedCompanyName,
          website: snap.websiteUrl?.trim() || "",
        });
        if (ws.ok) companyId = ws.companyId;
      }

      const prefsPayload = {
        onboarding_data: {
          stage: snap.stage,
          sectors: snap.sectors,
          revenueBand: snap.revenueBand,
          cofounderCount: snap.cofounderCount,
          superpowers: snap.superpowers,
          currentlyRaising: snap.currentlyRaising,
          targetRaise: snap.targetRaise,
          roundType: snap.roundType,
          targetCloseDate: snap.targetCloseDate,
          connectedIntegrations: snap.connectedIntegrations,
        },
        privacy_settings: {
          aiInboxPaths: snap.aiInboxPaths,
          shareAnonMetrics: snap.shareAnonMetrics,
          discoverableToInvestors: snap.discoverableToInvestors,
          useMeetingNotes: snap.useMeetingNotes,
        },
      };

      const edgePayload = {
        userId,
        companyId: companyId || undefined,
        companyFields:
          companyId && resolvedCompanyName && !resolvedExistingId
            ? {
                company_name: resolvedCompanyName,
                website_url: snap.websiteUrl || null,
                logo_url: derivedLogoUrl,
                deck_text: snap.deckText || null,
                stage: snap.stage || null,
                sector: snap.sectors?.[0] || null,
                ...(execSummary ? { executive_summary: execSummary } : {}),
              }
            : undefined,
        profile: {
          full_name: snap.fullName || undefined,
          title: snap.title || null,
          bio: snap.bio || null,
          location: snap.location || null,
          avatar_url: snap.avatarUrl || null,
          linkedin_url: snap.linkedinUrl || null,
          twitter_url: snap.twitterUrl || null,
          user_type: snap.userType || "founder",
          has_completed_onboarding: true,
          has_seen_settings_tour: false,
          company_id: companyId,
        },
        preferences: prefsPayload,
      };

      const edge = await completeFounderOnboardingEdge(edgePayload);

      if (!edge.ok && edge.fallbackToClient) {
        if (companyId && resolvedCompanyName) {
          await (supabase as any)
            .from("company_analyses")
            .update({
              company_name: resolvedCompanyName,
              website_url: snap.websiteUrl || null,
              logo_url: derivedLogoUrl,
              deck_text: snap.deckText || null,
              stage: snap.stage || null,
              sector: snap.sectors?.[0] || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", companyId);
        }

        await upsertProfile({
          full_name: snap.fullName || undefined,
          title: snap.title || null,
          bio: snap.bio || null,
          location: snap.location || null,
          avatar_url: snap.avatarUrl || null,
          linkedin_url: snap.linkedinUrl || null,
          twitter_url: snap.twitterUrl || null,
          user_type: snap.userType || "founder",
          has_completed_onboarding: true,
          has_seen_settings_tour: false,
          ...(companyId ? { company_id: companyId } : {}),
        } as any);

        await upsertPrefs(prefsPayload);
      }
    } catch (e: any) {
      console.warn("[onboarding] background sync failed:", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <ProgressBar currentStep={state.step} />

      <div className="flex-1 flex items-start justify-center px-4 py-2 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          {state.step === 1 && (
            <StepIdentity key="s1" state={state} update={update} onNext={() => goTo(2)} />
          )}
          {state.step === 2 && (
            <StepCompanyDNA key="s2" state={state} update={update} onNext={(name, existingId) => { void handleFinish(name, existingId); }} onBack={() => goTo(1)} saving={saving} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
