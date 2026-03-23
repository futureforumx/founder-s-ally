import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PrivacySettings {
  aiInboxPaths: boolean;
  shareAnonMetrics: boolean;
  discoverableToInvestors: boolean;
  useMeetingNotes: boolean;
}

export interface AppToggleSettings {
  liveSync: boolean;
  copilotMode: boolean;
}

export interface OnboardingData {
  stage?: string;
  sectors?: string[];
  revenueBand?: string;
  cofounderCount?: string;
  superpowers?: string[];
  currentlyRaising?: boolean;
  targetRaise?: string;
  roundType?: string;
  targetCloseDate?: string;
  connectedIntegrations?: string[];
}

export interface NotificationSettings {
  emailDigest: boolean;
  matchAlerts: boolean;
  communityUpdates: boolean;
  productNews: boolean;
  pushEnabled: boolean;
}

const DEFAULT_PRIVACY: PrivacySettings = {
  aiInboxPaths: false,
  shareAnonMetrics: false,
  discoverableToInvestors: false,
  useMeetingNotes: false,
};

const DEFAULT_APP_TOGGLES: AppToggleSettings = {
  liveSync: true,
  copilotMode: false,
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  emailDigest: true,
  matchAlerts: true,
  communityUpdates: false,
  productNews: true,
  pushEnabled: false,
};

export function useUserPreferences() {
  const { user } = useAuth();
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [appToggles, setAppToggles] = useState<AppToggleSettings>(DEFAULT_APP_TOGGLES);
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [loading, setLoading] = useState(true);

  const fetchPrefs = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      const privData = data.privacy_settings || {};
      setPrivacy({ ...DEFAULT_PRIVACY, ...privData });
      setAppToggles({ ...DEFAULT_APP_TOGGLES, ...(privData._appToggles || {}) });
      setOnboardingData(data.onboarding_data || null);
      setNotifications({ ...DEFAULT_NOTIFICATIONS, ...(data.notification_settings || {}) });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

  const upsertPrefs = useCallback(async (updates: {
    privacy_settings?: PrivacySettings;
    onboarding_data?: OnboardingData;
    notification_settings?: NotificationSettings;
    app_toggles?: AppToggleSettings;
  }) => {
    if (!user) return;

    // Merge app_toggles into privacy_settings JSONB
    let privacyPayload = updates.privacy_settings;
    if (updates.app_toggles) {
      const merged = privacyPayload || privacy;
      privacyPayload = { ...merged, _appToggles: updates.app_toggles } as any;
    }

    const payload: any = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (privacyPayload) payload.privacy_settings = privacyPayload;
    if (updates.onboarding_data) payload.onboarding_data = updates.onboarding_data;
    if (updates.notification_settings) payload.notification_settings = updates.notification_settings;

    const { data: existing } = await (supabase as any)
      .from("user_preferences")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await (supabase as any)
        .from("user_preferences")
        .update(payload)
        .eq("user_id", user.id);
    } else {
      await (supabase as any)
        .from("user_preferences")
        .insert(payload);
    }

    // Update local state
    if (updates.privacy_settings) setPrivacy(updates.privacy_settings);
    if (updates.app_toggles) setAppToggles(updates.app_toggles);
    if (updates.onboarding_data) setOnboardingData(updates.onboarding_data);
    if (updates.notification_settings) setNotifications(updates.notification_settings);
  }, [user, privacy]);

  return { privacy, appToggles, onboardingData, notifications, loading, upsertPrefs, refetch: fetchPrefs };
}
