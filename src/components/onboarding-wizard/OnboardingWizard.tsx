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
import { ProgressBar } from "./ProgressBar";
import { StepIdentity } from "./StepIdentity";
import { StepCompanyDNA } from "./StepCompanyDNA";
import { toast } from "@/hooks/use-toast";
import { playSound } from "@/lib/playSound";
import { trackMixpanelEvent } from "@/lib/mixpanel";

function googleFaviconFromWebsite(websiteUrl?: string | null, size = 128): string | null {
  const raw = (websiteUrl || "").trim();
  if (!raw) return null;
  try {
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const domain = new URL(normalized).hostname.replace(/^www\./, "");
    if (!domain) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
  } catch {
    return null;
  }
}

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
        await (_sb as any).from("profiles").update({ company_id: resolvedExistingId }).eq("user_id", user.id);
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
      const derivedLogoUrl = googleFaviconFromWebsite(state.websiteUrl, 128);
      const edgePayload = {
        userId: user.id,
        companyId: companyId || undefined,
        companyFields:
          companyId && resolvedCompanyName
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
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <ProgressBar currentStep={state.step} />

      <div className="flex-1 flex items-start justify-center px-4 py-2 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          {state.step === 1 && (
            <StepIdentity key="s1" state={state} update={update} onNext={() => goTo(2)} />
          )}
          {state.step === 2 && (
            <StepCompanyDNA key="s2" state={state} update={update} onNext={(name, existingId) => { void handleFinish(name, existingId); }} onBack={() => goTo(1)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
