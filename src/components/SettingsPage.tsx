import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatSocialUrl } from "@/lib/socialFormat";
import { useAutosave } from "@/hooks/useAutosave";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  User, Star, Mail, Linkedin, Twitter, Bell, BellOff,
  CreditCard, CheckCircle2, Shield, Camera, Lock, ArrowRight, Check,
  Sparkles, Crown, Zap, ExternalLink, Building2, Users, UserCog, Briefcase,
  Eye, Globe, Phone, MapPin, Sun, Moon, Monitor, Download, Trash2, Network,
  MessageSquare, AlertTriangle, Loader2, Upload, FileText, CloudUpload, X, ChevronDown
} from "lucide-react";
import { SensorSuiteGrid } from "@/components/connections/SensorSuiteGrid";
import { SmartCombobox, type ComboboxOption } from "@/components/ui/smart-combobox";
import { ROLE_OPTIONS } from "@/constants/roleOptions";
import { MorphingUrlInput } from "@/components/ui/morphing-url-input";
import { useAuth } from "@/hooks/useAuth";
import { useClerk } from "@clerk/clerk-react";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CompanyTab } from "@/components/settings/CompanyTab";
import { CopilotMissionBanner } from "@/components/settings/CopilotMissionBanner";
import { SettingsTour } from "@/components/settings/SettingsTour";
import { getCompletionPercent, EMPTY_FORM, type CompanyData } from "@/components/company-profile/types";
import { SyncReviewModal, type SyncField } from "@/components/settings/SyncReviewModal";
import { useLinkedInVerify } from "@/hooks/useLinkedInVerify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Section & Tab definitions ──
type SettingsSection = "personal" | "company-sec" | "network-sec" | "preferences-sec" | "subscription-sec" | "account-sec";
type SettingsTab = "account" | "company" | "network" | "notifications" | "privacy" | "theme" | "activity" | "security" | "subscription";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "company-sec", label: "Company" },
  { id: "network-sec", label: "Network" },
  { id: "preferences-sec", label: "Preferences" },
  { id: "subscription-sec", label: "Subscription" },
  { id: "account-sec", label: "Account" },
];

const SECTION_TABS: Record<SettingsSection, { id: SettingsTab; label: string }[]> = {
  "personal": [
    { id: "account", label: "Profile" },
  ],
  "company-sec": [
    { id: "company", label: "Company" },
  ],
  "network-sec": [
    { id: "network", label: "Connections" },
  ],
  "preferences-sec": [
    { id: "notifications", label: "Notifications" },
    { id: "privacy", label: "Privacy" },
  ],
  "subscription-sec": [
    { id: "subscription", label: "Subscription" },
  ],
  "account-sec": [
    { id: "security", label: "Security" },
    { id: "theme", label: "Theme" },
    { id: "activity", label: "Activity" },
  ],
};

const ALL_TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "company", label: "Company" },
  { id: "network", label: "Network" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy" },
  { id: "theme", label: "Theme" },
  { id: "activity", label: "Activity" },
  { id: "security", label: "Security" },
  { id: "subscription", label: "Subscription" },
];

function getSectionForTab(tab: SettingsTab): SettingsSection {
  for (const [section, tabs] of Object.entries(SECTION_TABS)) {
    if (tabs.some(t => t.id === tab)) return section as SettingsSection;
  }
  return "personal";
}

// ── URL sync helper ──
function getTabFromUrl(): SettingsTab {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") as SettingsTab | null;
  if (tab && ALL_TABS.some(t => t.id === tab)) return tab;
  return "account";
}

function setTabInUrl(tab: SettingsTab) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url.toString());
}

// ── Main Page ──
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(getTabFromUrl);

  // Re-sync tab from URL when navigated externally (e.g. dropdown)
  useEffect(() => {
    const syncTab = () => {
      const urlTab = getTabFromUrl();
      setActiveTab(prev => prev !== urlTab ? urlTab : prev);
    };
    // Check on every render cycle in case replaceState was called
    const interval = setInterval(syncTab, 300);
    return () => clearInterval(interval);
  }, []);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user, signOut } = useAuth();

  // Derive profile completion from real localStorage data
  const [formSnapshot, setFormSnapshot] = useState<CompanyData>(() => {
    try {
      const saved = localStorage.getItem("company-profile");
      return saved ? { ...EMPTY_FORM, ...JSON.parse(saved) } : EMPTY_FORM;
    } catch { return EMPTY_FORM; }
  });

  // Listen for localStorage changes from the CompanyProfile editor
  useEffect(() => {
    const sync = () => {
      try {
        const saved = localStorage.getItem("company-profile");
        if (saved) setFormSnapshot((prev) => {
          const next = { ...EMPTY_FORM, ...JSON.parse(saved) };
          if (JSON.stringify(prev) !== JSON.stringify(next)) return next;
          return prev;
        });
      } catch {}
    };
    window.addEventListener("storage", sync);
    const interval = setInterval(sync, 2000);
    return () => { window.removeEventListener("storage", sync); clearInterval(interval); };
  }, []);

  // Auto-save indicator lifecycle
  const prevFormRef = useRef(formSnapshot);
  useEffect(() => {
    if (prevFormRef.current === formSnapshot) return;
    prevFormRef.current = formSnapshot;

    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus("saved");
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
    }, 2500);
  }, [formSnapshot]);

  const profileCompletion = useMemo(() => getCompletionPercent(formSnapshot), [formSnapshot]);

  // Milestone toast notifications
  const lastMilestoneRef = useRef<number>(0);
  useEffect(() => {
    const milestones = [25, 50, 75];
    const reached = milestones.filter(m => profileCompletion >= m && lastMilestoneRef.current < m);
    if (reached.length > 0) {
      const highest = reached[reached.length - 1];
      lastMilestoneRef.current = highest;
      const messages: Record<number, { title: string; desc: string }> = {
        25: { title: "🚀 25% Complete", desc: "Great start! Keep going to unlock investor matching." },
        50: { title: "🔥 Halfway There!", desc: "You're 50% done — visibility is increasing." },
        75: { title: "⚡ 75% Complete", desc: "Almost there! Just a few more steps to Tier-1." },
      };
      const m = messages[highest];
      if (m) toast.success(m.title, { description: m.desc, duration: 5000 });
    }
  }, [profileCompletion]);

  const completedFields = useMemo(() => {
    const fields: string[] = [];
    if (formSnapshot.website) fields.push("website");
    if (formSnapshot.sector) fields.push("sector");
    if (formSnapshot.ltv && formSnapshot.cac) fields.push("ltv-cac");
    if (formSnapshot.currentARR) fields.push("mrr");
    if (formSnapshot.description) fields.push("executive-summary");
    // Check if a pitch deck exists
    try {
      const deckActive = localStorage.getItem("company-profile");
      if (deckActive) {
        const parsed = JSON.parse(deckActive);
        // If analysis was completed, deck was likely uploaded
        const analysisRaw = localStorage.getItem("company-analysis");
        if (analysisRaw) fields.push("pitch-deck");
      }
    } catch {}
    return fields;
  }, [formSnapshot]);

  const activeSection = getSectionForTab(activeTab);
  const currentTabs = SECTION_TABS[activeSection];

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    setTabInUrl(tab);
  };

  const handleSectionChange = (section: SettingsSection) => {
    const firstTab = SECTION_TABS[section][0];
    handleTabChange(firstTab.id);
  };

  const handleMissionNavigate = useCallback((tab: string, field?: string) => {
    handleTabChange(tab as SettingsTab);
    if (field) {
      // Dispatch event so CompanyProfile can open the correct section first
      window.dispatchEvent(new CustomEvent("mission-navigate-field", { detail: { field } }));
      // Retry finding the element after section opens
      const tryScroll = (attempts: number) => {
        const el = document.querySelector(`[data-field="${field}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-warning", "ring-offset-2", "rounded-xl", "shadow-[0_0_16px_hsl(var(--warning)/0.35)]", "transition-all", "duration-300");
          el.classList.add("animate-shake");
          setTimeout(() => el.classList.remove("animate-shake"), 500);
          setTimeout(() => el.classList.remove("ring-2", "ring-warning", "ring-offset-2", "rounded-xl", "shadow-[0_0_16px_hsl(var(--warning)/0.35)]", "transition-all", "duration-300"), 2500);
        } else if (attempts > 0) {
          setTimeout(() => tryScroll(attempts - 1), 200);
        }
      };
      setTimeout(() => tryScroll(5), 300);
    }
  }, []);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const displayEmail = user?.email || "";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen">
      {/* Settings Tour */}
      <SettingsTour onSectionChange={(sectionId) => handleSectionChange(sectionId as SettingsSection)} />

      {/* Copilot Mission Banner */}
      <div data-tour="profile-strength">
        <CopilotMissionBanner
          profileCompletion={profileCompletion}
          onNavigate={handleMissionNavigate}
          completedFields={completedFields}
          saveStatus={saveStatus}
        />
      </div>

      {/* Sticky Section + Tab Bar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        {/* Top-level sections */}
        <div className="px-8 pt-3">
          <div className="flex items-center gap-1">
            {SECTIONS.map((sec) => {
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  data-tour={sec.id === "personal" ? "personal" : sec.id === "company-sec" ? "company" : sec.id === "network-sec" ? "network" : undefined}
                  onClick={() => handleSectionChange(sec.id)}
                  className={cn(
                    "px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded-md transition-all",
                    isActive
                      ? "bg-accent/10 text-accent font-bold"
                      : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  {sec.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Sub-tabs (only when section has multiple tabs) */}
        {currentTabs.length > 1 && (
          <div className="px-8">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide relative">
              {currentTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      "relative px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab.label}
                    {isActive && (
                      <motion.div
                        layoutId="settings-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="px-8 py-5 max-w-7xl">
        <AnimatePresence mode="wait">
          {activeTab === "account" && (
            <AccountTab key="account" displayName={displayName} displayEmail={displayEmail} initials={initials} userId={user?.id} onSignOut={signOut} />
          )}
          {activeTab === "company" && <CompanyTab key="company" />}
          {activeTab === "network" && <NetworkTab key="network" />}
          {activeTab === "notifications" && <NotificationsTab key="notifications" />}
          {activeTab === "privacy" && <PrivacyTab key="privacy" />}
          {activeTab === "theme" && <ThemeTab key="theme" />}
          {activeTab === "activity" && <ActivityTab key="activity" />}
          {activeTab === "security" && <SecurityTab key="security" />}
          {activeTab === "subscription" && <SubscriptionTab key="subscription" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Shared animation wrapper ──
function TabWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

// StickyFormFooter removed — autosave handles persistence

// ── Account Tab ──
function AccountTab({ displayName, displayEmail, initials, userId, onSignOut }: { displayName: string; displayEmail: string; initials: string; userId?: string; onSignOut: () => Promise<void> }) {
  const { verify: verifyLinkedIn } = useLinkedInVerify();
  const { profile, upsertProfile } = useProfile();
  const [name, setName] = useState(displayName);
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [userType, setUserType] = useState<string>("founder");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Magic Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncReviewOpen, setSyncReviewOpen] = useState(false);
  const [syncFields, setSyncFields] = useState<SyncField[]>([]);
  const [syncApplying, setSyncApplying] = useState(false);
  const [syncedKeys, setSyncedKeys] = useState<Set<string>>(new Set());
  const [xVerified, setXVerified] = useState(false);
  const [xSyncing, setXSyncing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(true);
  const [profileConfirmed, setProfileConfirmed] = useState(false);

  // Listen for tour-expand-section events to auto-collapse/expand sections
  useEffect(() => {
    const handler = (e: Event) => {
      const section = (e as CustomEvent).detail?.section;
      if (section === "profile") {
        setProfileOpen(true);
      } else if (section === "data-sources") {
        // Collapse profile when focusing data sources
        setProfileOpen(false);
      }
    };
    window.addEventListener("tour-expand-section", handler);
    return () => window.removeEventListener("tour-expand-section", handler);
  }, []);

  // ── Autosave ──
  const persistProfile = useCallback(async (updates: Record<string, any>) => {
    // Map field names to DB column names
    const dbUpdates: Record<string, any> = {};
    if ("name" in updates) dbUpdates.full_name = updates.name;
    if ("title" in updates) dbUpdates.title = updates.title;
    if ("bio" in updates) dbUpdates.bio = updates.bio;
    if ("location" in updates) dbUpdates.location = updates.location;
    if ("userType" in updates) dbUpdates.user_type = updates.userType;
    if ("linkedinUrl" in updates) dbUpdates.linkedin_url = updates.linkedinUrl || null;
    if ("twitterUrl" in updates) dbUpdates.twitter_url = updates.twitterUrl || null;
    if ("resumeUrl" in updates) dbUpdates.resume_url = updates.resumeUrl || null;
    // Handle company_id for founders
    if (updates.userType === "founder" && userId) {
      const { data: comp } = await (supabase as any)
        .from("company_analyses")
        .select("id")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (comp) dbUpdates.company_id = comp.id;
    }
    await upsertProfile(dbUpdates as any);
  }, [userId, upsertProfile]);

  const { save: autosave, saveImmediate } = useAutosave(persistProfile);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name || displayName);
      setTitle(profile.title || "");
      setBio(profile.bio || "");
      setLocation(profile.location || "");
      setUserType(profile.user_type || "founder");
      
      let initialLiUrl = profile.linkedin_url || "";
      let initialTwUrl = profile.twitter_url || "";
      try {
        const stored = localStorage.getItem("onboarding-wizard-state");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!initialLiUrl && parsed.linkedinUrl) initialLiUrl = parsed.linkedinUrl;
          if (!initialTwUrl && parsed.twitterUrl) initialTwUrl = parsed.twitterUrl;
        }
      } catch {}

      setLinkedinUrl(initialLiUrl);
      setTwitterUrl(initialTwUrl);

      if ((!profile.linkedin_url && initialLiUrl) || (!profile.twitter_url && initialTwUrl)) {
        setTimeout(() => {
          try { saveImmediate({ linkedinUrl: initialLiUrl, twitterUrl: initialTwUrl }); } catch {}
        }, 1500);
      }
      if (profile.resume_url) {
        setResumeUrl(profile.resume_url);
        // Extract filename from URL
        try {
          const parts = profile.resume_url.split("/");
          setResumeFileName(decodeURIComponent(parts[parts.length - 1]?.replace(/^\d+-/, "") || "Resume.pdf"));
        } catch { setResumeFileName("Resume.pdf"); }
      }
      if (profile.avatar_url) {
        setAvatarUrl(profile.avatar_url);
        setAvatarError(false);
      }
      // Snapshot for global profile completion meter
      try {
        localStorage.setItem("user-profile-snapshot", JSON.stringify({
          full_name: profile.full_name,
          title: profile.title,
          bio: profile.bio,
          location: profile.location,
          linkedin_url: profile.linkedin_url,
          twitter_url: profile.twitter_url,
        }));
      } catch {}
    }
  }, [profile, displayName]);

  const USER_TYPES = [
    { id: "founder", label: "Founder", icon: Users, desc: "building a startup." },
    { id: "operator", label: "Operator", icon: UserCog, desc: "working at a startup." },
    { id: "investor", label: "Investor", icon: Briefcase, desc: "finding and backing startups." },
  ];

  

  const LOCATION_OPTIONS: ComboboxOption[] = [
    { value: "San Francisco, CA", label: "San Francisco, CA", desc: "Bay Area" },
    { value: "New York, NY", label: "New York, NY", desc: "East Coast" },
    { value: "Los Angeles, CA", label: "Los Angeles, CA", desc: "SoCal" },
    { value: "Austin, TX", label: "Austin, TX", desc: "Texas" },
    { value: "Miami, FL", label: "Miami, FL", desc: "Florida" },
    { value: "Boston, MA", label: "Boston, MA", desc: "New England" },
    { value: "Seattle, WA", label: "Seattle, WA", desc: "Pacific NW" },
    { value: "Chicago, IL", label: "Chicago, IL", desc: "Midwest" },
    { value: "London, UK", label: "London, UK", desc: "Europe" },
    { value: "Berlin, Germany", label: "Berlin, Germany", desc: "Europe" },
    { value: "Singapore", label: "Singapore", desc: "Asia-Pacific" },
    { value: "Tel Aviv, Israel", label: "Tel Aviv, Israel", desc: "Middle East" },
    { value: "Toronto, Canada", label: "Toronto, Canada", desc: "North America" },
    { value: "Dubai, UAE", label: "Dubai, UAE", desc: "Middle East" },
    { value: "Bangalore, India", label: "Bangalore, India", desc: "Asia" },
  ];

  // Auto-save on blur for combobox fields — delegates to autosave
  const handleFieldBlur = useCallback(async (field: string, val: string) => {
    if (!userId) return;
    await saveImmediate({ [field]: val });
  }, [userId, saveImmediate]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setAvatarUploading(true);
    setAvatarError(false);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      await upsertProfile({ avatar_url: publicUrl } as any);
      setAvatarUrl(publicUrl);
      toast.success("Photo updated");
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Unknown error"));
      setAvatarError(true);
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleResumeUpload = async (file: File) => {
    if (!userId) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }
    setResumeUploading(true);
    try {
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("resumes")
        .getPublicUrl(path);

      await saveImmediate({ resumeUrl: publicUrl });
      setResumeUrl(publicUrl);
      setResumeFileName(file.name);
      toast.success("Resume uploaded");
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setResumeUploading(false);
      if (resumeInputRef.current) resumeInputRef.current.value = "";
    }
  };

  const handleRemoveResume = async () => {
    await saveImmediate({ resumeUrl: "" });
    setResumeUrl(null);
    setResumeFileName(null);
    toast.success("Resume removed");
  };

  // handleSave removed — autosave handles persistence

  // ── Magic Sync (Auth0 LinkedIn OAuth) ──
  const handleSyncProfile = async () => {
    setSyncing(true);
    try {
      const incoming = await verifyLinkedIn();

      const fields: SyncField[] = [
        { key: "full_name", label: "Full Name", existing: name, incoming: incoming.full_name },
        { key: "title", label: "Title / Role", existing: title, incoming: incoming.title },
        { key: "bio", label: "Bio", existing: bio, incoming: incoming.bio?.slice(0, 160) || null },
        { key: "location", label: "Location", existing: location, incoming: incoming.location },
      ];

      // If we got an avatar, include it
      if (incoming.avatar_url) {
        fields.push({ key: "avatar_url", label: "Profile Photo", existing: avatarUrl, incoming: incoming.avatar_url });
      }

      // Auto-set LinkedIn URL if returned email or name verifies identity
      if (incoming.full_name) {
        // Mark as verified via LinkedIn OAuth
        setSyncedKeys(prev => new Set([...prev, "__linkedin_verified"]));
      }

      // If we got a LinkedIn URL from the OAuth, update it
      if (!linkedinUrl.trim() && incoming.full_name) {
        const slug = incoming.full_name.toLowerCase().replace(/\s+/g, "");
        const guessedUrl = `https://linkedin.com/in/${slug}`;
        setLinkedinUrl(guessedUrl);
        saveImmediate({ linkedinUrl: guessedUrl });
      }

      setSyncFields(fields);
      setSyncReviewOpen(true);
    } catch (err: any) {
      if (err?.message?.includes("cancelled") || err?.message?.includes("Popup closed")) {
        toast("LinkedIn sync cancelled", { description: "You can try again anytime." });
      } else {
        toast.error("Sync failed: " + (err.message || "Unknown error"));
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleApplySyncFields = async (selectedKeys: string[]) => {
    setSyncApplying(true);
    const fieldMap = Object.fromEntries(syncFields.map(f => [f.key, f.incoming]));
    const updates: Record<string, string> = {};

    for (const key of selectedKeys) {
      const val = fieldMap[key];
      if (!val) continue;
      updates[key] = val;
      if (key === "full_name") setName(val);
      if (key === "title") setTitle(val);
      if (key === "bio") setBio(val);
      if (key === "location") setLocation(val);
      if (key === "avatar_url") { setAvatarUrl(val); setAvatarError(false); }
    }

    // Save to profile via autosave (immediate)
    await saveImmediate(updates);

    // Track synced keys for highlight animation
    setSyncedKeys(new Set([...selectedKeys, "__linkedin_verified"]));
    setTimeout(() => setSyncedKeys(new Set()), 2500);

    setSyncApplying(false);
    setSyncReviewOpen(false);
    toast.success(`Applied ${selectedKeys.length} field${selectedKeys.length !== 1 ? "s" : ""} from LinkedIn`);

    // ── Auto-trigger X enrichment in background after LinkedIn sync ──
    if (twitterUrl.trim()) {
      enrichXProfile(twitterUrl);
    }
  };

  const enrichXProfile = async (url: string) => {
    setXSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-x-profile", {
        body: { twitterUrl: url },
      });

      if (error || !data?.success) {
        const msg = data?.error || error?.message || "Unknown error";
        if (data?.skipped) {
          toast("X enrichment skipped", { description: "Please fill bio manually." });
        } else {
          console.warn("X sync error:", msg);
        }
        return;
      }

      const xData = data.data;
      const updates: Record<string, string> = {};

      // Only apply bio if user hasn't written one
      if (xData.bio && !bio.trim()) {
        setBio(xData.bio.slice(0, 160));
        updates.bio = xData.bio.slice(0, 160);
      }
      // Only apply location if empty
      if (xData.location && !location.trim()) {
        setLocation(xData.location);
        updates.location = xData.location;
      }
      // Only apply avatar if user hasn't uploaded one
      if (xData.avatar_url && !avatarUrl) {
        setAvatarUrl(xData.avatar_url);
        setAvatarError(false);
        updates.avatar_url = xData.avatar_url;
      }

      if (Object.keys(updates).length > 0) {
        await saveImmediate(updates);
      }

      setXVerified(true);
      toast.success("X profile enriched successfully");
    } catch (err: any) {
      console.warn("X enrichment failed:", err);
      toast("X enrichment skipped", { description: "Please fill bio manually." });
    } finally {
      setXSyncing(false);
    }
  };

  // ── Progressive disclosure logic ──
  // Accept full linkedin URLs, partial paths, or bare usernames (alphanumeric, dots, hyphens)
  const isLinkedinInvalid = linkedinUrl.trim() !== "" && /[@\s]|^\d+$/.test(linkedinUrl.trim()) && !/linkedin\.com/i.test(linkedinUrl.trim());
  const isLinkedinValid = linkedinUrl.trim() !== "" && !isLinkedinInvalid;
  const hasSynced = syncedKeys.has("__linkedin_verified") || !!(name && name !== displayName) || !!(title && title.trim()) || syncedKeys.size > 0;
  const isComplete = !!(name.trim() && title.trim() && bio.trim() && location.trim() && linkedinUrl.trim());
  const showTwitter = isLinkedinValid || isComplete;
  const showPersonalInfo = hasSynced || isComplete;


  return (
    <TabWrapper>
      <div className="space-y-4">
        {/* ── User Type Selector (condensed) ── */}
        {(() => {
          const activeType = USER_TYPES.find(t => t.id === userType) || USER_TYPES[0];
          const ActiveIcon = activeType.icon;
          return (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground font-semibold">I am a</h3>
                  <div className="flex items-center gap-1.5 rounded-md bg-accent/10 px-2.5 py-1">
                    <ActiveIcon className="h-3 w-3 text-accent" />
                    <span className="text-[11px] font-semibold text-foreground">{activeType.label}</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground">{activeType.desc}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">Change</button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[160px]">
                    {USER_TYPES.map((type) => {
                      const Icon = type.icon;
                      return (
                        <DropdownMenuItem
                          key={type.id}
                          onClick={() => { setUserType(type.id); saveImmediate({ userType: type.id }); }}
                          className={cn("flex items-center gap-2", userType === type.id && "bg-accent/10")}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="text-[11px]">{type.label}</span>
                          {userType === type.id && <CheckCircle2 className="h-3 w-3 text-accent ml-auto" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })()}

        {/* ── Data Sources ── */}
        <div className="space-y-3" data-tour-section="data-sources">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Data Sources</h3>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
              {/* Left column: URL inputs + AI Insight */}
              <div className="flex flex-col gap-2.5">
                {/* LinkedIn URL */}
                <MorphingUrlInput
                  platform="linkedin"
                  label="LinkedIn URL"
                  value={linkedinUrl}
                  onChange={(v) => { setLinkedinUrl(v); autosave({ linkedinUrl: v }); }}
                  onBlur={(v) => {
                    const formatted = formatSocialUrl("linkedin_personal", v);
                    if (formatted !== linkedinUrl) { setLinkedinUrl(formatted); saveImmediate({ linkedinUrl: formatted }); }
                  }}
                  verifyState={syncing ? "syncing" : (syncedKeys.has("__linkedin_verified") ? "verified" : "idle")}
                  onVerify={handleSyncProfile}
                  verifyLabel="Sync"
                />

                {/* X / Twitter URL */}
                <MorphingUrlInput
                  platform="x"
                  label="X / Twitter URL"
                  value={twitterUrl}
                  onChange={(v) => { setTwitterUrl(v); autosave({ twitterUrl: v }); }}
                  onBlur={(v) => {
                    const formatted = formatSocialUrl("x", v);
                    if (formatted !== twitterUrl) { setTwitterUrl(formatted); saveImmediate({ twitterUrl: formatted }); }
                  }}
                  verifyState={xSyncing ? "syncing" : (xVerified ? "verified" : "idle")}
                  onVerify={() => enrichXProfile(twitterUrl)}
                  verifyLabel="Enrich"
                />

                {/* AI Insight Banner */}
                <div className="flex items-start gap-2.5 rounded-lg bg-accent/5 border border-accent/10 px-3.5 py-2.5 mt-auto">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/10 shrink-0 mt-0.5">
                    <Sparkles className="h-3 w-3 text-accent" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-foreground leading-snug">AI Insight</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                      Founders with verified LinkedIn profiles see a 40% higher response rate from investors.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right column: Resume PDF Dropzone */}
              <div className="flex flex-col">
                <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Resume (PDF)</label>
                <input
                  ref={resumeInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f); }}
                />
                {resumeUrl ? (
                  <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-success/30 bg-success/5 p-4 min-h-[140px]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 mb-2">
                      <FileText className="h-5 w-5 text-success" />
                    </div>
                    <p className="text-xs font-medium text-foreground truncate max-w-full">{resumeFileName || "Resume.pdf"}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <button onClick={() => resumeInputRef.current?.click()} className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors">Replace</button>
                      <button onClick={handleRemoveResume} className="text-[10px] font-medium text-destructive hover:text-destructive/80 transition-colors">Remove</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => resumeInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-accent/50", "bg-accent/5"); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove("border-accent/50", "bg-accent/5"); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("border-accent/50", "bg-accent/5");
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleResumeUpload(f);
                    }}
                    disabled={resumeUploading}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-all min-h-[140px]",
                      "border-border/60 bg-secondary/50 hover:border-accent/50 hover:bg-accent/5",
                      resumeUploading && "opacity-60 pointer-events-none"
                    )}
                  >
                    {resumeUploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60 mb-2">
                          <Upload className="h-5 w-5 text-muted-foreground/60" />
                        </div>
                        <p className="text-xs text-muted-foreground font-medium">Drop PDF here or <span className="text-primary">browse</span></p>
                        <p className="text-[9px] text-muted-foreground/50 mt-0.5">Max 10MB</p>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Primary CTA */}
            <div className="mt-4">
             {(() => {
                const isIdentityVerified = syncedKeys.has("__linkedin_verified") && hasSynced;
                const hasDataPresent = !!(linkedinUrl.trim() || twitterUrl.trim() || resumeUrl || hasSynced);
                return (
                  <Button
                    onClick={handleSyncProfile}
                    disabled={syncing || isIdentityVerified}
                    variant="default"
                    className={cn(
                      "w-full rounded-lg h-10 text-sm font-semibold gap-2 transition-shadow duration-300 bg-primary text-primary-foreground",
                      isIdentityVerified && "opacity-60 cursor-not-allowed",
                      !isIdentityVerified && !syncing && (
                        hasDataPresent
                          ? "shadow-[0_0_12px_hsl(var(--success)/0.35)]"
                          : "shadow-[0_0_12px_hsl(45_90%_55%/0.35)]"
                      )
                    )}
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying Data…
                      </>
                    ) : isIdentityVerified ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">✓ Data Verified</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Verify Data
                      </>
                    )}
                  </Button>
                );
              })()}
              <p className="text-[9px] text-muted-foreground/60 text-center font-mono tracking-wide mt-2">
                Triple-source triangulation: Resume + LinkedIn + X
              </p>
            </div>
          </div>
        </div>

        {/* ── Profile (First Name, Last Name, Email) ── */}
        {(() => {
          const firstName = name.split(" ")[0]?.trim() || "";
          const lastName = name.split(" ").slice(1).join(" ")?.trim() || "";
          const isProfileEmpty = !firstName && !lastName;
          const isProfileComplete = !!firstName && !!lastName;

          const statusDot = profileConfirmed && isProfileComplete ? (
            <span className="inline-flex rounded-full h-2 w-2 bg-success" />
          ) : isProfileEmpty ? (
            <span className="inline-flex rounded-full h-2 w-2 bg-destructive/40" />
          ) : isProfileComplete ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
            </span>
          );

          return (
            <div className="rounded-xl border border-border bg-card overflow-hidden" data-tour-section="profile">
              {/* Collapsible header */}
              <button
                onClick={() => setProfileOpen(prev => !prev)}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground font-semibold flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  Profile
                  {statusDot}
                </h3>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", profileOpen && "rotate-180")} />
              </button>

              {/* Collapsible content */}
              <AnimatePresence initial={false}>
                {profileOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 pt-2 border-t border-border/60">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1" data-field="first_name">
                          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            First Name <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={firstName}
                            onChange={(e) => {
                              const newName = lastName ? `${e.target.value} ${lastName}` : e.target.value;
                              setName(newName);
                              autosave({ name: newName });
                              if (profileConfirmed) setProfileConfirmed(false);
                            }}
                            placeholder="First name"
                            className="rounded-lg h-9 text-sm"
                            required
                          />
                        </div>
                        <div className="space-y-1" data-field="last_name">
                          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            Last Name <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={lastName}
                            onChange={(e) => {
                              const newName = e.target.value ? `${firstName} ${e.target.value}` : firstName;
                              setName(newName);
                              autosave({ name: newName });
                              if (profileConfirmed) setProfileConfirmed(false);
                            }}
                            placeholder="Last name"
                            className="rounded-lg h-9 text-sm"
                            required
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2" data-field="email">
                          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                            Email <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={displayEmail}
                            disabled
                            className="rounded-lg h-9 text-sm opacity-70"
                          />
                          <p className="text-[9px] text-muted-foreground/60">
                            Want to change your email?{" "}
                            <button
                              type="button"
                              onClick={() => {
                                const url = new URL(window.location.href);
                                url.searchParams.set("tab", "security");
                                window.history.replaceState({}, "", url.toString());
                                window.dispatchEvent(new Event("popstate"));
                              }}
                              className="text-accent hover:text-accent/80 underline underline-offset-2 font-medium transition-colors"
                            >
                              Go to Account → Security
                            </button>
                          </p>
                        </div>
                      </div>
                      <Separator className="my-4" />
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (!firstName || !lastName) {
                              toast.error("First Name and Last Name are required");
                              return;
                            }
                            saveImmediate({ name });
                            setProfileConfirmed(true);
                            setProfileOpen(false);
                            toast.success("Profile details confirmed");
                          }}
                          className="rounded-full px-5 h-9 text-sm font-medium gap-2 border-border"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Confirm Details
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* ── Personal Information (revealed after sync / or if complete) ── */}
        <AnimatePresence>
          {showPersonalInfo && (
            <motion.div
              initial={{ opacity: 0, y: 16, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 16, height: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-border/60">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground font-semibold flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Personal Information
                  </h3>
                </div>
                <div className="p-5 space-y-4">
                  {/* Avatar & Name */}
                  <div className="flex items-center gap-4">
                    <div className="relative group">
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                      {avatarUploading ? (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted border-2 border-border">
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full" />
                        </div>
                      ) : avatarUrl && !avatarError ? (
                        <img src={avatarUrl} alt="Profile" className="h-14 w-14 rounded-full object-cover border-2 border-primary/20" onError={() => setAvatarError(true)} />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20 text-base font-bold text-primary">{initials}</div>
                      )}
                      <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/60 text-background opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <Camera className="h-4 w-4" />
                      </button>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{displayName}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] text-muted-foreground">{displayEmail}</p>
                        <Badge className="bg-success/10 text-success border-success/20 text-[8px] uppercase font-bold">Verified</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Form grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className={cn("space-y-1 rounded-lg transition-all", syncedKeys.has("full_name") && "ring-2 ring-accent ring-offset-2 ring-offset-background animate-shake")} data-field="full_name">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Full Name</label>
                      <Input value={name} onChange={(e) => { setName(e.target.value); autosave({ name: e.target.value }); }} className="rounded-lg h-9 text-sm" />
                    </div>
                    <div className={cn("space-y-1 rounded-lg transition-all", syncedKeys.has("title") && "ring-2 ring-accent ring-offset-2 ring-offset-background animate-shake")} data-field="title">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Title / Role</label>
                      <SmartCombobox
                        value={title}
                        onChange={setTitle}
                        onBlur={() => handleFieldBlur("title", title)}
                        options={ROLE_OPTIONS}
                        placeholder="e.g. CEO & Co-Founder"
                        verified={syncedKeys.has("title")}
                        highlightSync={syncedKeys.has("title")}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Email</label>
                      <div className="relative">
                        <Input value={displayEmail} disabled className="rounded-lg h-9 text-sm bg-muted/30 text-muted-foreground pr-20" />
                        <Badge className="absolute right-2 top-1/2 -translate-y-1/2 bg-success/10 text-success border-success/20 text-[8px] uppercase font-bold">Verified</Badge>
                      </div>
                    </div>
                    <div className={cn("space-y-1 rounded-lg transition-all", syncedKeys.has("location") && "ring-2 ring-accent ring-offset-2 ring-offset-background animate-shake")} data-field="location">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Location</label>
                      <SmartCombobox
                        value={location}
                        onChange={setLocation}
                        onBlur={() => handleFieldBlur("location", location)}
                        options={LOCATION_OPTIONS}
                        placeholder="San Francisco, CA"
                        verified={syncedKeys.has("location")}
                        highlightSync={syncedKeys.has("location")}
                      />
                    </div>
                  </div>
                  <div className={cn("space-y-1 rounded-lg transition-all", syncedKeys.has("bio") && "ring-2 ring-accent ring-offset-2 ring-offset-background animate-shake")} data-field="bio">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Bio</label>
                      <span className={cn("text-[10px] font-mono", bio.length > 160 ? "text-destructive" : "text-muted-foreground")}>{bio.length}/160</span>
                    </div>
                    <textarea value={bio} onChange={(e) => { const v = e.target.value.slice(0, 160); setBio(v); autosave({ bio: v }); }} placeholder="Brief description of what you're building..." rows={2} className="flex w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>


      </div>

      {/* Sync Review Modal */}
      <SyncReviewModal
        open={syncReviewOpen}
        onOpenChange={setSyncReviewOpen}
        title="Review LinkedIn Data"
        fields={syncFields}
        onApply={handleApplySyncFields}
        applying={syncApplying}
      />
    </TabWrapper>
  );
}


// ── Personal Network Integrations ──
const PERSONAL_STORAGE_KEY = "personal-connections-status";

function loadPersonalConnected(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PERSONAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { linkedin: false, twitter: false, google: false };
}
function savePersonalConnected(s: Record<string, boolean>) {
  localStorage.setItem(PERSONAL_STORAGE_KEY, JSON.stringify(s));
}

const PERSONAL_INTEGRATIONS = [
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: "https://cdn.simpleicons.org/linkedin/0A66C2",
    fallbackIcon: Linkedin,
    description: "Connect your personal LinkedIn to map your own network graph, separate from company data.",
    connectedLabel: "Personal profile linked",
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    icon: "https://cdn.simpleicons.org/x/000000",
    fallbackIcon: Twitter,
    description: "Connect your personal X account for individual social signals and investor tracking.",
    connectedLabel: "Personal feed linked",
  },
  {
    key: "google",
    label: "Google",
    icon: "https://cdn.simpleicons.org/google/4285F4",
    fallbackIcon: Mail,
    description: "Connect a personal Google account for your own inbox and calendar, separate from company workspace.",
    connectedLabel: "Personal account linked",
  },
] as const;

function PersonalNetworkSection() {
  const [connected, setConnected] = useState(loadPersonalConnected);
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleToggle = useCallback((key: string) => {
    if (syncing) return;
    const isConnected = connected[key];
    if (isConnected) {
      const next = { ...connected, [key]: false };
      setConnected(next);
      savePersonalConnected(next);
      toast.success(`Personal ${PERSONAL_INTEGRATIONS.find(i => i.key === key)?.label} disconnected`);
      return;
    }
    setSyncing(key);
    setTimeout(() => {
      const next = { ...connected, [key]: true };
      setConnected(next);
      savePersonalConnected(next);
      setSyncing(null);
      toast.success(`Personal ${PERSONAL_INTEGRATIONS.find(i => i.key === key)?.label} connected`);
    }, 1800);
  }, [connected, syncing]);

  const connectedCount = Object.values(connected).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <User className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Personal Accounts</h3>
          <Badge variant="outline" className="text-[9px] font-mono ml-1">{connectedCount}/{PERSONAL_INTEGRATIONS.length}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Connect your <span className="font-semibold text-foreground">personal</span> accounts here. These are separate from the company integrations above and map to your individual identity.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PERSONAL_INTEGRATIONS.map((integration) => {
          const isConnected = connected[integration.key];
          const isSyncing = syncing === integration.key;
          const FallbackIcon = integration.fallbackIcon;

          return (
            <div
              key={integration.key}
              className={`rounded-xl border p-4 transition-all ${
                isConnected
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-card hover:border-primary/20"
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 border border-border shrink-0">
                  <img
                    src={integration.icon}
                    alt={integration.label}
                    className="h-5 w-5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                  <FallbackIcon className="h-4 w-4 text-muted-foreground hidden" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground">{integration.label}</p>
                  {isConnected && (
                    <p className="text-[10px] text-primary font-medium flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="h-3 w-3" /> {integration.connectedLabel}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground leading-relaxed mb-3">
                {integration.description}
              </p>

              <Button
                variant={isConnected ? "outline" : "default"}
                size="sm"
                className="w-full text-[10px] h-7"
                disabled={isSyncing}
                onClick={() => handleToggle(integration.key)}
              >
                {isSyncing ? (
                  <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Connecting...</>
                ) : isConnected ? (
                  "Disconnect"
                ) : (
                  "Connect Personal Account"
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Network Tab (Sensor Suite) ──
function NetworkTab() {
  const [networkView, setNetworkView] = useState<"company" | "personal">("company");

  return (
    <TabWrapper>
      <div className="space-y-6">
        {/* View Toggle */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted w-fit">
          {(["company", "personal"] as const).map((view) => (
            <button
              key={view}
              onClick={() => setNetworkView(view)}
              className={cn(
                "px-4 py-1.5 rounded-md text-xs uppercase tracking-wide transition-all font-mono font-medium text-muted-foreground",
                networkView === view
                  ? "bg-background text-foreground shadow-sm"
                  : "hover:text-foreground"
              )}
            >
              {view}
            </button>
          ))}
        </div>

        {networkView === "company" && (
          <div className="rounded-2xl overflow-hidden">
            <div className="p-6">
              <SensorSuiteGrid compact={false} showHeader={true} showTerminal={true} showCategoryFilter={true} />
            </div>
          </div>
        )}

        {networkView === "personal" && (
          <PersonalNetworkSection />
        )}
      </div>
    </TabWrapper>
  );
}

// ── Notifications Tab ──
function NotificationsTab() {
  const { notifications, upsertPrefs } = useUserPreferences();
  const [prefs, setPrefs] = useState(notifications);

  useEffect(() => { setPrefs(notifications); }, [notifications]);

  const toggle = (key: keyof typeof prefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    upsertPrefs({ notification_settings: next });
  };

  const EMAIL_ITEMS: { key: keyof typeof prefs; label: string; desc: string; icon: React.ElementType }[] = [
    { key: "matchAlerts", label: "Match Found", desc: "When a new investor match is discovered", icon: Zap },
    { key: "emailDigest", label: "Weekly Digest", desc: "Summary of activity, matches, and community", icon: Mail },
    { key: "productNews", label: "Product Updates", desc: "New features and improvements", icon: Sparkles },
  ];

  const INAPP_ITEMS: { key: keyof typeof prefs; label: string; desc: string; icon: React.ElementType }[] = [
    { key: "communityUpdates", label: "Community Activity", desc: "New reviews, intro requests, founder updates", icon: Users },
    { key: "pushEnabled", label: "Push Notifications", desc: "Browser alerts for time-sensitive updates", icon: Bell },
  ];

  return (
    <TabWrapper>
      <div className="space-y-8">
        {/* Email */}
        <div className="space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">Email Notifications</h3>
          <div className="space-y-1">
            {EMAIL_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="flex items-center justify-between rounded-xl p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <Switch checked={prefs[item.key]} onCheckedChange={() => toggle(item.key)} />
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* In-App */}
        <div className="space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">In-App Notifications</h3>
          <div className="space-y-1">
            {INAPP_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="flex items-center justify-between rounded-xl p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                  <Switch checked={prefs[item.key]} onCheckedChange={() => toggle(item.key)} />
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Slack */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">Slack Integration</h3>
          <div className="rounded-xl border border-border p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4A154B]/10">
                <MessageSquare className="h-4 w-4 text-[#4A154B]" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Connect Slack</p>
                <p className="text-[10px] text-muted-foreground">Get match alerts in your Slack workspace</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-lg text-xs">Connect</Button>
          </div>
        </div>
      </div>
    </TabWrapper>
  );
}

// ── Privacy Tab ──
function PrivacyTab() {
  const { privacy, upsertPrefs } = useUserPreferences();
  const [prefs, setPrefs] = useState(privacy);

  useEffect(() => { setPrefs(privacy); }, [privacy]);

  const togglePref = (key: keyof typeof prefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    upsertPrefs({ privacy_settings: next });
  };

  const TOGGLES = [
    { key: "aiInboxPaths" as const, title: "Inbox Analysis", sub: "Let AI find warm investor paths. Thread subjects + contact names only.", icon: Mail },
    { key: "shareAnonMetrics" as const, title: "Anonymized Benchmarking", sub: "Share metrics with your cohort. They never see it's you.", icon: Users },
    { key: "discoverableToInvestors" as const, title: "Discoverability", sub: "Make profile visible to matching investors.", icon: Eye },
    { key: "useMeetingNotes" as const, title: "Meeting Notes", sub: "Use Granola + calendar data to improve recommendations.", icon: Bell },
  ];

  return (
    <TabWrapper>
      <div className="space-y-8">
        {/* AI Toggles */}
        <div className="space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">AI Data Consent</h3>
          <div className="space-y-2">
            {TOGGLES.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.key} className="flex items-start gap-3 rounded-xl border border-border p-4 hover:bg-muted/20 transition-colors">
                  <Switch checked={prefs[t.key]} onCheckedChange={() => togglePref(t.key)} className="mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{t.title}</p>
                    <p className="text-[10px] text-muted-foreground">{t.sub}</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Stealth Mode */}
        <div className="rounded-xl border-2 border-destructive/20 bg-destructive/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-bold text-foreground">Stealth Mode</h3>
          </div>
          <p className="text-xs text-muted-foreground">Hides your profile from all public discovery. Investors will not be able to find you in search or recommendations.</p>
          <Switch />
        </div>

        <Separator />

        {/* Data Rights */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">Data Rights</h3>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 text-sm text-foreground hover:text-accent transition-colors">
              <Download className="h-4 w-4" />
              Download JSON Export
            </button>
            <button className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors">
              <Trash2 className="h-4 w-4" />
              Delete Account
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-muted/20 border border-border p-4">
          <div className="flex items-center gap-2">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">Your data is encrypted at rest and in transit. We never sell your information.</p>
          </div>
        </div>
      </div>
    </TabWrapper>
  );
}

// ── Theme Tab ──
function ThemeTab() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Choose your preferred color theme</p>
      </div>

      <div className="space-y-3">
        {([
          { id: "light" as const, icon: Sun, label: "Light", desc: "Clean and bright interface" },
          { id: "dark" as const, icon: Moon, label: "Dark", desc: "Easy on the eyes in low light" },
          { id: "system" as const, icon: Monitor, label: "System", desc: "Follows your OS preference" },
        ]).map(({ id, icon: Icon, label, desc }) => (
          <button
            key={id}
            onClick={() => setTheme(id)}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl border p-4 transition-all text-left",
              theme === id
                ? "border-accent/40 bg-accent/5 ring-1 ring-accent/20"
                : "border-border hover:bg-muted/30"
            )}
          >
            <div className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
              theme === id ? "bg-accent/10" : "bg-muted"
            )}>
              <Icon className={cn("h-4 w-4", theme === id ? "text-accent" : "text-muted-foreground")} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </div>
            {theme === id && <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ── Activity Tab ──
interface FeedbackItem {
  id: string;
  nps_score: number;
  interaction_type: string;
  comment: string | null;
  created_at: string;
  did_respond: boolean;
  firm_id: string;
  firm: { firm_name: string; logo_url?: string | null };
}

interface ConnectionItem {
  id: string;
  name: string;
  subtitle: string | null;
  type: "investor" | "founder" | "operator";
  sector?: string | null;
  stage?: string | null;
  amount?: number;
  date?: string | null;
}

type ConnFilter = "all" | "investor" | "founder" | "operator";

function ActivityTab() {
  const { user } = useAuth();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(true);
  const [loadingConns, setLoadingConns] = useState(true);
  const [connFilter, setConnFilter] = useState<ConnFilter>("all");

  // Fetch investor feedback (reviews left by this user)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function fetchFeedback() {
      const { data, error } = await supabase
        .from("investor_reviews")
        .select("id, nps_score, interaction_type, comment, created_at, did_respond, firm_id")
        .eq("founder_id", user!.id)
        .order("created_at", { ascending: false });
      if (!cancelled && !error && data && data.length > 0) {
        const firmIds = [...new Set(data.map((r) => r.firm_id))];
        const { data: firms } = await supabase
          .from("investor_database")
          .select("id, firm_name, logo_url")
          .in("id", firmIds);
        const firmMap = Object.fromEntries((firms || []).map((f) => [f.id, f]));
        if (!cancelled) {
          setFeedback(
            data.map((r) => ({
              ...r,
              firm: firmMap[r.firm_id] || { firm_name: "Unknown Firm" },
            }))
          );
        }
      }
      if (!cancelled) setLoadingFeedback(false);
    }
    fetchFeedback();
    return () => { cancelled = true; };
  }, [user]);

  // Fetch connections (investors from cap_table + founders/operators from community)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function fetchConnections() {
      const [{ data: capData }, { data: capFirst }] = await Promise.all([
        supabase
          .from("cap_table")
          .select("id, investor_name, entity_type, instrument, amount, date")
          .eq("user_id", user!.id)
          .order("date", { ascending: false }),
        supabase
          .from("cap_table")
          .select("investor_name")
          .eq("user_id", user!.id)
          .limit(1)
          .maybeSingle(),
      ]);

      const investorConns: ConnectionItem[] = (capData || []).map((c) => ({
        id: c.id,
        name: c.investor_name,
        subtitle: c.instrument || null,
        type: "investor" as const,
        amount: c.amount,
        date: c.date,
      }));

      let communityConns: ConnectionItem[] = [];
      if (capFirst?.investor_name) {
        const { data: conns } = await supabase.rpc("find_connections_by_investor", {
          _investor_name: capFirst.investor_name,
        });
        if (conns && !cancelled) {
          const filtered = (conns as { user_id: string; company_name: string; sector: string | null; stage: string | null }[]).filter(
            (c) => c.user_id !== user!.id
          );
          const userIds = filtered.map((c) => c.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, user_type, title")
            .in("user_id", userIds);
          const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));
          communityConns = filtered.map((c) => {
            const profile = profileMap[c.user_id];
            const rawType = profile?.user_type?.toLowerCase() || "founder";
            const type: ConnectionItem["type"] =
              rawType === "operator" ? "operator" : rawType === "investor" ? "investor" : "founder";
            return {
              id: c.user_id,
              name: profile?.full_name || c.company_name,
              subtitle: profile?.title || c.company_name || null,
              type,
              sector: c.sector,
              stage: c.stage,
            };
          });
        }
      }

      if (!cancelled) {
        setConnections([...investorConns, ...communityConns]);
        setLoadingConns(false);
      }
    }
    fetchConnections();
    return () => { cancelled = true; };
  }, [user]);

  const filteredConns =
    connFilter === "all" ? connections : connections.filter((c) => c.type === connFilter);

  const connCounts = useMemo(() => ({
    all: connections.length,
    investor: connections.filter((c) => c.type === "investor").length,
    founder: connections.filter((c) => c.type === "founder").length,
    operator: connections.filter((c) => c.type === "operator").length,
  }), [connections]);

  function npsColor(score: number) {
    if (score >= 9) return "bg-success/10 text-success border-success/20";
    if (score >= 7) return "bg-accent/10 text-accent border-accent/20";
    if (score >= 5) return "bg-warning/10 text-warning border-warning/20";
    return "bg-destructive/10 text-destructive border-destructive/20";
  }

  function typeColor(type: ConnectionItem["type"]) {
    if (type === "investor") return "bg-accent/10 text-accent";
    if (type === "operator") return "bg-warning/10 text-warning";
    return "bg-primary/10 text-primary";
  }

  function typeIcon(type: ConnectionItem["type"]) {
    if (type === "investor") return Building2;
    return User;
  }

  function initials(name: string) {
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className="space-y-8"
    >
      {/* ── Investor Feedback ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
            <MessageSquare className="h-3.5 w-3.5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Investor Feedback</h3>
            <p className="text-[10px] text-muted-foreground">Reviews you've submitted about investors</p>
          </div>
        </div>

        {loadingFeedback ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : feedback.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/20 p-5 text-center text-sm text-muted-foreground">
            No feedback submitted yet.
          </div>
        ) : (
          <div className="space-y-2">
            {feedback.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-muted/10 p-4 space-y-2 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{item.firm.firm_name}</span>
                    {item.interaction_type && (
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {item.interaction_type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                        npsColor(item.nps_score)
                      )}
                    >
                      NPS {item.nps_score}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                {item.comment && (
                  <p className="text-xs text-muted-foreground leading-relaxed pl-9">{item.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* ── Connections ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
            <Network className="h-3.5 w-3.5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Connections</h3>
            <p className="text-[10px] text-muted-foreground">Investors, founders, and operators in your network</p>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "investor", "founder", "operator"] as ConnFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setConnFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-medium transition-all capitalize",
                connFilter === f
                  ? "border-accent/40 bg-accent/10 text-accent ring-1 ring-accent/20"
                  : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
              )}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1) + "s"}&nbsp;
              <span className="opacity-60">{connCounts[f]}</span>
            </button>
          ))}
        </div>

        {loadingConns ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filteredConns.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/20 p-5 text-center text-sm text-muted-foreground">
            No {connFilter === "all" ? "" : connFilter + " "}connections found.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredConns.map((conn) => {
              const Icon = typeIcon(conn.type);
              return (
                <div
                  key={conn.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-muted/10 p-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-semibold text-muted-foreground">
                    {initials(conn.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{conn.name}</p>
                    {conn.subtitle && (
                      <p className="text-[10px] text-muted-foreground truncate">{conn.subtitle}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {conn.sector && (
                      <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground border border-border">
                        {conn.sector}
                      </span>
                    )}
                    {conn.stage && (
                      <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground border border-border">
                        {conn.stage}
                      </span>
                    )}
                    <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", typeColor(conn.type))}>
                      <Icon className="h-2.5 w-2.5" />
                      {conn.type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Security Tab ──
function SecurityTabDemo() {
  const { user } = useAuth();
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">Security</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Demo mode — sign-in is simulated</p>
      </div>
      <div className="rounded-xl border border-border p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">Email</p>
        <p className="text-[10px] text-muted-foreground">{user?.email || "No email set"}</p>
      </div>
    </motion.div>
  );
}

function SecurityTabClerk() {
  const { user } = useAuth();
  const { openUserProfile } = useClerk();

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">Security</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Email, password, and 2FA are managed in your Clerk account.</p>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Account email</p>
              <p className="text-[10px] text-muted-foreground truncate">{user?.email || "No email set"}</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="rounded-lg text-xs gap-1.5 w-full sm:w-auto"
            onClick={() => openUserProfile()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open account & security
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
              <p className="text-[10px] text-muted-foreground">Configure in Clerk account settings</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[9px] uppercase font-bold">Clerk</Badge>
        </div>
      </div>
    </motion.div>
  );
}

function SecurityTab() {
  if (import.meta.env.VITE_DEMO_MODE === "true") return <SecurityTabDemo />;
  return <SecurityTabClerk />;
}

// ── Subscription Tab ──
function SubscriptionTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  const POLAR_PLANS = [
    {
      name: "Basic",
      productId: "4c9f357d-b420-486f-827d-2901b96afd4b",
      tier: "FREE",
      tierColor: "bg-amber-500",
      price: "$0",
      features: [
        "Basic company profile",
        "Limited investor directory access",
        "Community dashboard view",
        "Single pitch deck upload",
        "Basic sector tagging",
      ],
      highlighted: false,
    },
    {
      name: "Pro",
      productId: "2e689769-7782-456a-88b3-687e0e825df7",
      tier: "PRO",
      tierColor: "bg-amber-500",
      price: "$29",
      features: [
        "Full investor matching engine",
        "Unlimited pitch deck audits",
        "Competitive benchmarking",
        "Contact reveals (unlimited)",
        "Priority community features",
      ],
      highlighted: true,
    },
    {
      name: "Premiere",
      productId: "ca6f76eb-8c2d-4593-847f-2f66c59838a5",
      tier: "PREMIERE",
      tierColor: "bg-emerald-500",
      price: "$99",
      features: [
        "Everything in Pro",
        "AI-powered investor intelligence",
        "Warm intro pathfinder",
        "Dedicated account support",
        "Full API access and exports",
      ],
      highlighted: false,
    },
  ];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutId = params.get("checkout_id");
    if (checkoutId && user) {
      (async () => {
        try {
          const { data } = await supabase.functions.invoke("polar-checkout", {
            body: { action: "verify_checkout", checkout_id: checkoutId },
          });
          if (data?.status === "succeeded") {
            setCheckoutSuccess(true);
            const url = new URL(window.location.href);
            url.searchParams.delete("checkout_id");
            window.history.replaceState({}, "", url.toString());
          }
        } catch {}
      })();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("polar-checkout", {
          body: { action: "get_subscription", user_id: user.id },
        });
        if (data?.subscription?.product_id) {
          setCurrentProductId(data.subscription.product_id);
        }
        if (data?.customer_id) {
          setCustomerId(data.customer_id);
        }
      } catch {}
    })();
  }, [user, checkoutSuccess]);

  const handleCheckout = async (productId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("polar-checkout", {
        body: { action: "create_checkout", product_id: productId, user_id: user.id },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("polar-checkout", {
        body: { action: "customer_portal", customer_id: customerId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Portal error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TabWrapper>
      <div className="space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-foreground text-xs font-mono font-semibold">PLAN</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Keep track of your subscription details, update your billing information, and control your account's payment
            </p>
          </div>
          {customerId && (
            <Button variant="outline" size="sm" onClick={handleManage} disabled={loading} className="text-xs">
              <ExternalLink className="h-3 w-3 mr-1.5" />
              Manage Billing
            </Button>
          )}
        </div>

        {checkoutSuccess && (
          <div className="rounded-xl border border-success/30 bg-success/5 p-4 flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <p className="text-sm text-foreground">Your subscription has been activated successfully!</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {POLAR_PLANS.map((plan) => {
            const isCurrent = currentProductId === plan.productId;
            return (
              <div
                key={plan.name}
                className={cn(
                  "relative rounded-2xl border p-6 flex flex-col justify-between transition-all",
                  plan.highlighted
                    ? "bg-primary text-primary-foreground border-primary shadow-surface-lg"
                    : "bg-card border-border"
                )}
              >
                <div className={cn("absolute top-3 left-3 h-1.5 w-1.5 rounded-full", plan.highlighted ? "bg-primary-foreground/20" : "bg-muted-foreground/15")} />
                <div className={cn("absolute top-3 right-3 h-1.5 w-1.5 rounded-full", plan.highlighted ? "bg-primary-foreground/20" : "bg-muted-foreground/15")} />
                <div className={cn("absolute bottom-3 left-3 h-1.5 w-1.5 rounded-full", plan.highlighted ? "bg-primary-foreground/20" : "bg-muted-foreground/15")} />
                <div className={cn("absolute bottom-3 right-3 h-1.5 w-1.5 rounded-full", plan.highlighted ? "bg-primary-foreground/20" : "bg-muted-foreground/15")} />

                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className={cn("text-sm font-bold", plan.highlighted ? "text-primary-foreground" : "text-foreground")}>
                      {plan.name}
                    </h3>
                    <Badge className={cn(
                      "text-[9px] uppercase font-bold tracking-wider border-0 gap-1.5",
                      plan.highlighted
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", plan.tierColor)} />
                      {plan.tier}
                    </Badge>
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span className={cn("text-4xl font-black tracking-tight", plan.highlighted ? "text-primary-foreground" : "text-foreground")}>
                      {plan.price}
                    </span>
                    <span className={cn("text-sm", plan.highlighted ? "text-primary-foreground/40" : "text-muted-foreground")}>
                      /month
                    </span>
                  </div>

                  <Button
                    variant={plan.highlighted ? "secondary" : "outline"}
                    className={cn(
                      "w-full rounded-xl font-semibold text-xs h-10",
                      plan.highlighted
                        ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                        : isCurrent
                          ? "bg-muted border-border text-foreground cursor-default"
                          : plan.price === "$0"
                            ? "bg-muted border-border text-foreground cursor-default"
                            : ""
                    )}
                    disabled={loading || isCurrent || plan.price === "$0"}
                    onClick={() => handleCheckout(plan.productId)}
                  >
                    {isCurrent ? "Current Plan" : plan.price === "$0" ? "Free Forever" : "Upgrade Plan"}
                  </Button>

                  <Separator className={plan.highlighted ? "bg-primary-foreground/10" : ""} />

                  <div className="space-y-2.5">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2">
                        <CheckCircle2 className={cn(
                          "h-3.5 w-3.5 shrink-0 mt-0.5",
                          plan.highlighted ? "text-primary-foreground/50" : "text-muted-foreground/50"
                        )} />
                        <span className={cn(
                          "text-xs leading-relaxed",
                          plan.highlighted ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {f}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {customerId && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">Billing & Invoices</h3>
              <div className="flex items-center justify-between rounded-xl border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-12 items-center justify-center rounded-md bg-muted border border-border">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Manage via Polar</p>
                    <p className="text-[10px] text-muted-foreground">View invoices, update payment methods, and cancel</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleManage} disabled={loading} className="text-xs">
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Open Portal
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </TabWrapper>
  );
}