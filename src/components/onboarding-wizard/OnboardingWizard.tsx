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
import { StepPowerUp } from "./StepPowerUp";
import { toast } from "@/hooks/use-toast";

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

      toast({ title: `Welcome, ${state.fullName || state.companyName || "Founder"}!`, description: "Review your settings to confirm everything looks right." });
      reset();
      // Navigate to settings page so user can confirm inputs
      navigate("/?view=settings");
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <ProgressBar currentStep={state.step} />

      <div className="flex-1 flex items-start justify-center px-4 py-2 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {state.step === 1 && (
            <StepIdentity key="s1" state={state} update={update} onNext={() => goTo(2)} />
          )}
          {state.step === 2 && (
            <StepCompanyDNA key="s2" state={state} update={update} onNext={() => goTo(3)} onBack={() => goTo(1)} />
          )}
          {state.step === 3 && (
            <StepPowerUp key="s3" state={state} update={update} onNext={handleFinish} onBack={() => goTo(2)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
