import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useOnboardingState } from "@/hooks/useOnboardingState";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_FORM, type CompanyData } from "@/components/company-profile/types";
import { ProgressBar } from "./ProgressBar";
import { StepIdentity } from "./StepIdentity";
import { StepCompanyDNA } from "./StepCompanyDNA";

import { toast } from "@/hooks/use-toast";
import { playSound } from "@/lib/playSound";

// ── AI field guessing helpers ──
function guessBusinessModel(sector: string): string[] {
  const s = sector.toLowerCase();
  if (s.includes("saas") || s.includes("devtools") || s.includes("cybersecurity")) return ["B2B SaaS"];
  if (s.includes("marketplace") || s.includes("e-commerce")) return ["Marketplace"];
  if (s.includes("fintech") || s.includes("insurtech")) return ["B2B SaaS", "Usage-Based"];
  if (s.includes("healthtech") || s.includes("biotech") || s.includes("medtech")) return ["B2B SaaS"];
  if (s.includes("edtech")) return ["B2B SaaS", "Freemium"];
  if (s.includes("cleantech") || s.includes("hardware") || s.includes("robotics")) return ["Hardware"];
  if (s.includes("ai") || s.includes("ml")) return ["B2B SaaS", "Usage-Based"];
  if (s.includes("gaming")) return ["Freemium"];
  if (s.includes("media") || s.includes("adtech")) return ["Advertising"];
  return [];
}

function guessTargetCustomer(sector: string): string[] {
  const s = sector.toLowerCase();
  if (s.includes("enterprise") || s.includes("cybersecurity") || s.includes("devtools")) return ["Enterprise"];
  if (s.includes("e-commerce") || s.includes("gaming") || s.includes("edtech")) return ["B2C"];
  if (s.includes("fintech")) return ["SMB", "Enterprise"];
  if (s.includes("govtech") || s.includes("defense")) return ["Government"];
  if (s.includes("proptech") || s.includes("marketplace")) return ["B2B2C"];
  if (s.includes("saas")) return ["SMB"];
  if (s.includes("ai") || s.includes("ml")) return ["Enterprise", "SMB"];
  if (s.includes("healthtech") || s.includes("biotech")) return ["Enterprise"];
  return [];
}

export function OnboardingWizard() {
  const { state, update, reset } = useOnboardingState();
  const { user } = useAuth();
  const { upsertProfile } = useProfile();
  const { upsertPrefs } = useUserPreferences();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const goTo = useCallback((step: number) => update({ step }), [update]);

  const handleFinish = async () => {
    if (!user || saving) return;
    playSound("/sounds/success.wav", 0.6);
    setSaving(true);

    try {
      let companyId: string | null = null;

      if (state.companyName) {
        const { data: existing } = await (supabase as any)
          .from("company_analyses")
          .select("id")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          companyId = existing.id;
          await (supabase as any)
            .from("company_analyses")
            .update({
              company_name: state.companyName,
              website_url: state.websiteUrl || null,
              deck_text: state.deckText || null,
              stage: state.stage || null,
              sector: state.sectors?.[0] || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          const { data: newComp } = await (supabase as any)
            .from("company_analyses")
            .insert({
              user_id: user.id,
              company_name: state.companyName,
              website_url: state.websiteUrl || null,
              deck_text: state.deckText || null,
              stage: state.stage || null,
              sector: state.sectors?.[0] || null,
            })
            .select("id")
            .single();
          if (newComp) companyId = newComp.id;
        }
      }

      await upsertProfile({
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

      await upsertPrefs({
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
          aiInboxPaths: false,
          shareAnonMetrics: false,
          discoverableToInvestors: false,
          useMeetingNotes: false,
        },
      });

      // ── Seed data for the OnboardingStepper popup on the main app ──
      try {
        localStorage.setItem("pending-company-seed", JSON.stringify({
          companyName: state.companyName || "",
          websiteUrl: state.websiteUrl || "",
          deckText: state.deckText || "",
          stage: state.stage || "",
          sectors: state.sectors || [],
        }));
        // Don't set company-profile or company-analysis here —
        // the OnboardingStepper popup on Index will handle the full company setup
      } catch {}

      // Snapshot personal profile for nav HUD completion meter
      try {
        localStorage.setItem("user-profile-snapshot", JSON.stringify({
          full_name: state.fullName,
          title: state.title,
          bio: state.bio,
          location: state.location,
          linkedin_url: state.linkedinUrl,
          twitter_url: state.twitterUrl,
        }));
      } catch {}

      toast({ title: `Welcome, ${state.fullName || state.companyName || "Founder"}!`, description: "Review your settings to confirm everything looks right." });
      reset();
      navigate("/?view=settings&tour=true");
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
            <StepCompanyDNA key="s2" state={state} update={update} onNext={handleFinish} onBack={() => goTo(1)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
