import { useEffect } from "react";
import { ArrowRight, AtSign, Linkedin, LockKeyhole, Music2, Newspaper } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { formatSocialUrl, type SocialPlatform } from "@/lib/socialFormat";
import type { OnboardingState } from "./types";

interface StepMeta {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

interface StepPersonalDetailsProps {
  state: OnboardingState;
  update: (partial: Partial<OnboardingState>) => void;
  onNext: () => void;
  meta?: StepMeta;
}

interface SocialFieldProps {
  icon: typeof Linkedin;
  label: string;
  placeholder: string;
  value: string;
  platform: SocialPlatform;
  onChange: (value: string) => void;
}

function SocialField({ icon: Icon, label, placeholder, value, platform, onChange }: SocialFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onChange(formatSocialUrl(platform, event.target.value))}
        placeholder={placeholder}
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        className="h-11 rounded-lg border-border/80 bg-background/70 px-3 text-sm"
      />
    </div>
  );
}

export function StepPersonalDetails({ state, update, onNext, meta }: StepPersonalDetailsProps) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const metadata = user.user_metadata || {};
    const firstName = state.firstName || metadata.first_name || "";
    const lastName = state.lastName || metadata.last_name || "";
    const updates: Partial<OnboardingState> = {};

    if (!state.firstName && firstName) updates.firstName = firstName;
    if (!state.lastName && lastName) updates.lastName = lastName;
    if (!state.email && user.email) updates.email = user.email;
    if (!state.fullName && (firstName || lastName)) {
      updates.fullName = [firstName, lastName].filter(Boolean).join(" ");
    }

    if (Object.keys(updates).length > 0) update(updates);
  }, [state.email, state.firstName, state.fullName, state.lastName, update, user]);

  const updateName = (firstName: string, lastName: string) => {
    update({
      firstName,
      lastName,
      fullName: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
    });
  };

  const handleContinue = () => {
    const missing = [
      !state.firstName.trim() && "first name",
      !state.lastName.trim() && "last name",
      !state.email.trim() && "email",
    ].filter(Boolean);

    if (missing.length > 0) {
      toast({
        title: "Check your details",
        description: `Please add your ${missing.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }

    update({
      fullName: [state.firstName.trim(), state.lastName.trim()].join(" "),
      linkedinUrl: formatSocialUrl("linkedin_personal", state.linkedinUrl),
      twitterUrl: formatSocialUrl("x", state.twitterUrl),
      substackUrl: formatSocialUrl("substack", state.substackUrl),
      tiktokUrl: formatSocialUrl("tiktok", state.tiktokUrl),
    });
    onNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full"
    >
      <div className="mb-7">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{meta?.eyebrow ?? "Your profile"}</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{meta?.title ?? "Let’s confirm your details"}</h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          {meta?.subtitle ?? "Make sure your name is right, then add any profiles you want Vekta to connect to your account."}
        </p>
      </div>

      <div className="space-y-6">
        <fieldset>
          <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Personal details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="onboarding-first-name" className="text-xs font-medium text-foreground">First name <span className="text-primary">*</span></label>
              <Input id="onboarding-first-name" value={state.firstName} onChange={(event) => updateName(event.target.value, state.lastName)} placeholder="Jane" autoComplete="given-name" className="h-11 rounded-lg border-border/80 bg-background/70 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="onboarding-last-name" className="text-xs font-medium text-foreground">Last name <span className="text-primary">*</span></label>
              <Input id="onboarding-last-name" value={state.lastName} onChange={(event) => updateName(state.firstName, event.target.value)} placeholder="Doe" autoComplete="family-name" className="h-11 rounded-lg border-border/80 bg-background/70 text-sm" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="onboarding-email" className="text-xs font-medium text-foreground">Email <span className="text-primary">*</span></label>
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="onboarding-email" value={state.email} readOnly type="email" autoComplete="email" className="h-11 rounded-lg border-border/80 bg-muted/30 pl-9 pr-9 text-sm" />
                <LockKeyhole className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground">This is the email connected to your Vekta account.</p>
            </div>
          </div>
        </fieldset>

        <div className="h-px bg-border/70" />

        <fieldset>
          <div className="mb-3 flex items-end justify-between gap-3">
            <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Social profiles</legend>
            <span className="text-[10px] text-muted-foreground">Optional</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SocialField icon={Linkedin} label="LinkedIn" placeholder="linkedin.com/in/yourname" value={state.linkedinUrl} platform="linkedin_personal" onChange={(linkedinUrl) => update({ linkedinUrl })} />
            <SocialField icon={AtSign} label="X" placeholder="@yourhandle" value={state.twitterUrl} platform="x" onChange={(twitterUrl) => update({ twitterUrl })} />
            <SocialField icon={Newspaper} label="Substack" placeholder="@yourpublication" value={state.substackUrl} platform="substack" onChange={(substackUrl) => update({ substackUrl })} />
            <SocialField icon={Music2} label="TikTok" placeholder="@yourhandle" value={state.tiktokUrl} platform="tiktok" onChange={(tiktokUrl) => update({ tiktokUrl })} />
          </div>
        </fieldset>
      </div>

      <div className="mt-8">
        <Button onClick={handleContinue} className="h-11 w-full gap-2 text-sm">Confirm and continue <ArrowRight className="h-4 w-4" /></Button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">Your progress is saved automatically</p>
      </div>
    </motion.div>
  );
}
