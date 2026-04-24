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
import { StepIdentity } from "./StepIdentity";
import { StepCompanyDNA } from "./StepCompanyDNA";
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
      const resolvedExistingId = overrideExistingCompanyId ?? state.existingCompanyId;

      if (resolvedExistingId) {
        companyId = resolvedExistingId;
        const { supabase: _sb } = await import("@/integrations/supabase/client");
        const { ensureManagerMembership: _emm } = await import("@/lib/ensureManagerMembership");
        const memRes = await _emm(_sb as any, user.id, resolvedExistingId);
        if (!memRes.ok) {
          const { error: pendingErr } = await (_sb as any)
            .from("company_members")
            .insert({ user_id: user.id, company_id: resolvedExistingId, role: "pending" });
          if (pendingErr && pendingErr.code !== "23505") {
            toast({
              title: "Couldn't join company",
              description: pendingErr.message,
            });
          }
        }
        await upsertProfile({ company_id: resolvedExistingId } as any);
      } else if (resolvedCompanyName) {
        const ws = await ensureCompanyWorkspace(user.id, {
          name: resolvedCompanyName,
          website: state.websiteUrl?.trim() || "",
        });
        if (ws.ok) {
          companyId = ws.companyId;
        } else {
          // Non-fatal: let the user through; they can finish setup in Settings
          toast({
            title: "Company workspace couldn't be set up",
            description: "You can finish setting up your company in Settings.",
          });
        }
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

      // ── Local persistence ──
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

      try { localStorage.setItem("company-profile-verified", "true"); } catch {}

      toast({ title: `Welcome, ${state.fullName || resolvedCompanyName || "Founder"}!`, description: "Let's set up your company profile." });
      trackMixpanelEvent("Conversion", {
        "Conversion Type": "onboarding_complete",
        "Conversion Value": 0,
        user_id: user.id,
      });

      // Mark complete and navigate NOW — DB writes happen in the background.
      // This ensures the user always gets through regardless of DB/edge failures.
      try { localStorage.setItem("vekta-onboarding-done", user.id); } catch {}
      window.dispatchEvent(new CustomEvent("vekta:onboarding-complete"));
      reset();
      try { localStorage.setItem("post-onboarding-view", "settings"); } catch {}
      navigate({ pathname: "/", search: "?view=settings&tab=account&tour=true" });

      // ── Background DB sync (best-effort; component is unmounted by now) ──
      const edge = await completeFounderOnboardingEdge(edgePayload);

      if (!edge.ok) {
        if (edge.fallbackToClient) {
          if (companyId && resolvedCompanyName) {
            await (supabase as any)
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
            console.warn("[onboarding] profile save failed:", profileRes.error);
          }

          const prefsRes = await upsertPrefs(prefsPayload);
          if (!prefsRes.ok) {
            console.warn("[onboarding] prefs save failed:", prefsRes.error);
          }
        } else {
          console.warn("[onboarding] complete-founder-onboarding failed:", edge.error);
        }
      }
    } catch (e: any) {
      // Even on unexpected error, mark complete and navigate — don't trap the user.
      try { localStorage.setItem("vekta-onboarding-done", user.id); } catch {}
      window.dispatchEvent(new CustomEvent("vekta:onboarding-complete"));
      reset();
      navigate({ pathname: "/", search: "?view=settings&tab=account&tour=true" });
      toast({ title: "Some data couldn't be saved", description: e.message });
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
