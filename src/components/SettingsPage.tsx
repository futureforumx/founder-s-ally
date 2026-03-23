import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  User, LogOut, Mail, Linkedin, Twitter, Bell, BellOff,
  CreditCard, CheckCircle2, Shield, Camera, Lock, ArrowRight,
  Sparkles, Crown, Zap, ExternalLink, Building2, Users, UserCog, Briefcase,
  Eye, Globe, Phone, MapPin, Sun, Moon, Monitor, Download, Trash2,
  MessageSquare, AlertTriangle, Loader2
} from "lucide-react";
import { SensorSuiteGrid } from "@/components/connections/SensorSuiteGrid";
import { SmartCombobox, type ComboboxOption } from "@/components/ui/smart-combobox";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CompanyTab } from "@/components/settings/CompanyTab";
import { CopilotMissionBanner } from "@/components/settings/CopilotMissionBanner";
import { getCompletionPercent, EMPTY_FORM, type CompanyData } from "@/components/company-profile/types";
import { SyncReviewModal, type SyncField } from "@/components/settings/SyncReviewModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Section & Tab definitions ──
type SettingsSection = "personal" | "entity" | "network-sec" | "preferences" | "account-sec";
type SettingsTab = "account" | "company" | "network" | "notifications" | "privacy" | "theme" | "security" | "subscription";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "entity", label: "Entity" },
  { id: "network-sec", label: "Network" },
  { id: "preferences", label: "Preferences" },
  { id: "account-sec", label: "Account" },
];

const SECTION_TABS: Record<SettingsSection, { id: SettingsTab; label: string }[]> = {
  "personal": [
    { id: "account", label: "Profile" },
  ],
  "entity": [
    { id: "company", label: "Company" },
  ],
  "network-sec": [
    { id: "network", label: "Connections" },
  ],
  "preferences": [
    { id: "notifications", label: "Notifications" },
    { id: "privacy", label: "Privacy" },
    { id: "theme", label: "Theme" },
    { id: "security", label: "Security" },
  ],
  "account-sec": [
    { id: "subscription", label: "Subscription" },
  ],
};

const ALL_TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "company", label: "Company" },
  { id: "network", label: "Network" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy" },
  { id: "theme", label: "Theme" },
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
      setTimeout(() => {
        const el = document.querySelector(`[data-field="${field}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          // Pulse highlight
          el.classList.add("ring-2", "ring-warning", "ring-offset-2", "rounded-xl", "shadow-[0_0_16px_hsl(var(--warning)/0.35)]", "transition-all", "duration-300");
          // Shake animation
          el.classList.add("animate-shake");
          setTimeout(() => {
            el.classList.remove("animate-shake");
          }, 500);
          setTimeout(() => {
            el.classList.remove("ring-2", "ring-warning", "ring-offset-2", "rounded-xl", "shadow-[0_0_16px_hsl(var(--warning)/0.35)]", "transition-all", "duration-300");
          }, 2500);
        }
      }, 400);
    }
  }, []);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const displayEmail = user?.email || "";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen">
      {/* Copilot Mission Banner */}
      <CopilotMissionBanner
        profileCompletion={profileCompletion}
        onNavigate={handleMissionNavigate}
        completedFields={completedFields}
        saveStatus={saveStatus}
      />

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

// ── Dirty form footer ──
function StickyFormFooter({ dirty, saving, onDiscard, onSave }: { dirty: boolean; saving: boolean; onDiscard: () => void; onSave: () => void }) {
  return (
    <AnimatePresence>
      {dirty && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm px-8 py-3 flex items-center justify-end gap-3 shadow-lg"
        >
          <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={onDiscard}>Discard</Button>
          <Button size="sm" className="rounded-lg text-xs font-semibold" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Account Tab ──
function AccountTab({ displayName, displayEmail, initials, userId, onSignOut }: { displayName: string; displayEmail: string; initials: string; userId?: string; onSignOut: () => Promise<void> }) {
  const { profile, upsertProfile } = useProfile();
  const [name, setName] = useState(displayName);
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [userType, setUserType] = useState<string>("founder");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Magic Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncReviewOpen, setSyncReviewOpen] = useState(false);
  const [syncFields, setSyncFields] = useState<SyncField[]>([]);
  const [syncApplying, setSyncApplying] = useState(false);
  const [syncedKeys, setSyncedKeys] = useState<Set<string>>(new Set());

  // Track original values for dirty detection
  const [original, setOriginal] = useState({ name: displayName, title: "", bio: "", location: "", userType: "founder", linkedinUrl: "", twitterUrl: "" });

  useEffect(() => {
    if (profile) {
      const vals = {
        name: profile.full_name || displayName,
        title: profile.title || "",
        bio: profile.bio || "",
        location: profile.location || "",
        userType: profile.user_type || "founder",
        linkedinUrl: profile.linkedin_url || "",
        twitterUrl: profile.twitter_url || "",
      };
      setName(vals.name);
      setTitle(vals.title);
      setBio(vals.bio);
      setLocation(vals.location);
      setUserType(vals.userType);
      setLinkedinUrl(vals.linkedinUrl);
      setTwitterUrl(vals.twitterUrl);
      setOriginal(vals);
      if (profile.avatar_url) {
        setAvatarUrl(profile.avatar_url);
        setAvatarError(false);
      }
    }
  }, [profile, displayName]);

  const isDirty = name !== original.name || title !== original.title || bio !== original.bio || location !== original.location || userType !== original.userType || linkedinUrl !== original.linkedinUrl || twitterUrl !== original.twitterUrl;

  const handleDiscard = () => {
    setName(original.name);
    setTitle(original.title);
    setBio(original.bio);
    setLocation(original.location);
    setUserType(original.userType);
    setLinkedinUrl(original.linkedinUrl);
    setTwitterUrl(original.twitterUrl);
  };

  const USER_TYPES = [
    { id: "founder", label: "Founder", icon: Users, desc: "Building a startup" },
    { id: "operator", label: "Operator", icon: UserCog, desc: "Fractional or advisory" },
    { id: "investor", label: "Investor", icon: Briefcase, desc: "Investing in startups" },
  ];

  const ROLE_OPTIONS: ComboboxOption[] = [
    { value: "CEO & Founder", label: "CEO & Founder", desc: "Chief Executive Officer" },
    { value: "CEO & Co-Founder", label: "CEO & Co-Founder", desc: "Co-founded the company" },
    { value: "CTO & Co-Founder", label: "CTO & Co-Founder", desc: "Technical co-founder" },
    { value: "CTO", label: "CTO", desc: "Chief Technology Officer" },
    { value: "COO", label: "COO", desc: "Chief Operating Officer" },
    { value: "CPO", label: "CPO", desc: "Chief Product Officer" },
    { value: "Head of Product", label: "Head of Product", desc: "Product leadership" },
    { value: "Head of Engineering", label: "Head of Engineering", desc: "Engineering leadership" },
    { value: "Solo Founder", label: "Solo Founder", desc: "Single founder" },
    { value: "Managing Partner", label: "Managing Partner", desc: "Fund or firm partner" },
    { value: "General Partner", label: "General Partner", desc: "GP at a fund" },
    { value: "VP of Engineering", label: "VP of Engineering", desc: "Engineering executive" },
    { value: "VP of Operations", label: "VP of Operations", desc: "Operations executive" },
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

  // Auto-save on blur for combobox fields
  const handleFieldBlur = useCallback(async (field: string, val: string) => {
    if (!userId) return;
    const updates: Record<string, string> = { [field]: val };
    await upsertProfile(updates as any);
    setOriginal(prev => ({ ...prev, [field === "title" ? "title" : "location"]: val }));
  }, [userId, upsertProfile]);

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

  const handleSave = async () => {
    setSaving(true);
    let companyId: string | null = null;
    if (userType === "founder" && userId) {
      const { data: comp } = await (supabase as any)
        .from("company_analyses")
        .select("id")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (comp) companyId = comp.id;
    }
    await upsertProfile({
      full_name: name,
      title,
      bio,
      location,
      user_type: userType,
      linkedin_url: linkedinUrl || null,
      twitter_url: twitterUrl || null,
      ...(companyId ? { company_id: companyId } : {}),
    } as any);
    setOriginal({ name, title, bio, location, userType, linkedinUrl, twitterUrl });
    setSaving(false);
    toast.success("Profile saved");
  };

  // ── Magic Sync ──
  const handleSyncProfile = async () => {
    if (!linkedinUrl.trim()) {
      toast.error("Enter a LinkedIn URL first");
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-linkedin-profile", {
        body: { linkedinUrl: linkedinUrl.trim() },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Sync failed");

      const incoming = data.data;
      const fields: SyncField[] = [
        { key: "full_name", label: "Full Name", existing: name, incoming: incoming.full_name },
        { key: "title", label: "Title / Role", existing: title, incoming: incoming.title },
        { key: "bio", label: "Bio", existing: bio, incoming: incoming.bio?.slice(0, 160) || null },
        { key: "location", label: "Location", existing: location, incoming: incoming.location },
      ];

      setSyncFields(fields);
      setSyncReviewOpen(true);
    } catch (err: any) {
      toast.error("Sync failed: " + (err.message || "Unknown error"));
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
    }

    // Save to profile
    await upsertProfile(updates as any);
    setOriginal(prev => ({ ...prev, ...updates }));

    // Track synced keys for highlight animation
    setSyncedKeys(new Set(selectedKeys));
    setTimeout(() => setSyncedKeys(new Set()), 2500);

    setSyncApplying(false);
    setSyncReviewOpen(false);
    toast.success(`Applied ${selectedKeys.length} field${selectedKeys.length !== 1 ? "s" : ""} from LinkedIn`);
  };

  // ── Progressive disclosure logic ──
  const isLinkedinValid = /linkedin\.com\/in\/.+/i.test(linkedinUrl.trim());
  const hasSynced = !!(name && name !== displayName) || !!(title && title.trim()) || syncedKeys.size > 0;
  const isComplete = !!(name.trim() && title.trim() && bio.trim() && location.trim() && linkedinUrl.trim());
  const showTwitter = isLinkedinValid || isComplete;
  const showPersonalInfo = hasSynced || isComplete;

  // LinkedIn domain extraction for favicon
  const linkedinDomain = (() => {
    try {
      if (!linkedinUrl.trim()) return null;
      let u = linkedinUrl.trim();
      if (!/^https?:\/\//i.test(u)) u = "https://" + u;
      return new URL(u).hostname.replace(/^www\./, "") || null;
    } catch { return null; }
  })();

  return (
    <TabWrapper>
      <div className="space-y-4">
        {/* ── Social Profiles (Data Sources style) ── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-border/60">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground font-semibold flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Social Profiles
            </h3>
          </div>

          <div className="p-5 space-y-4">
            {/* 2-column grid: Left = inputs, Right = Identity Verification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left column */}
              <div className="space-y-3">
                {/* LinkedIn URL (always visible) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">LinkedIn URL</label>
                  <div className="relative">
                    {linkedinDomain && (
                      <img
                        src={`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${linkedinDomain}&size=32`}
                        alt=""
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-sm"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <input
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                      className={cn(
                        "flex w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm h-9 ring-offset-background",
                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        linkedinDomain ? "pl-9" : ""
                      )}
                    />
                    {/* Inline sync + info icons */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {isLinkedinValid && !syncing && (
                        <motion.button
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          onClick={(e) => { e.stopPropagation(); handleSyncProfile(); }}
                          className="text-[10px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-0.5"
                          title="Sync from LinkedIn"
                        >
                          <Sparkles className="h-3 w-3" />
                          Sync
                        </motion.button>
                      )}
                      {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
                      {!isLinkedinValid && linkedinUrl.trim() && (
                        <span className="text-[9px] text-destructive font-mono">Invalid</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* X / Twitter URL (appears after LinkedIn is valid) */}
                <AnimatePresence>
                  {showTwitter && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="space-y-1 overflow-hidden"
                    >
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">X / Twitter URL</label>
                      <input
                        value={twitterUrl}
                        onChange={(e) => setTwitterUrl(e.target.value)}
                        placeholder="https://x.com/..."
                        className="flex w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm h-9 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Right column: Identity Verification zone */}
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 min-h-[120px] p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 mb-2">
                  <Shield className="h-5 w-5 text-accent" />
                </div>
                <p className="text-xs font-semibold text-foreground mb-0.5">Identity Verification</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[180px]">
                  Connect LinkedIn & X to unlock verified founder badge
                </p>
                {(isLinkedinValid || twitterUrl.trim()) && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {isLinkedinValid && (
                      <Badge className="bg-success/10 text-success border-success/20 text-[8px] uppercase font-bold gap-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5" /> LinkedIn
                      </Badge>
                    )}
                    {twitterUrl.trim() && (
                      <Badge className="bg-success/10 text-success border-success/20 text-[8px] uppercase font-bold gap-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5" /> X
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* AI Insight Banner */}
            <div className="flex items-start gap-2.5 rounded-lg bg-accent/5 border border-accent/10 px-3.5 py-2.5">
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

            {/* Primary CTA */}
            <Button
              onClick={handleSyncProfile}
              disabled={syncing || !linkedinUrl.trim()}
              className="w-full rounded-lg h-10 text-sm font-semibold gap-2"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mining Data...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Sync & Enrich Profile
                </>
              )}
            </Button>

            {/* Footer */}
            <p className="text-[9px] text-muted-foreground/60 text-center font-mono tracking-wide">
              Identity verification: LinkedIn + X + Public Data
            </p>
          </div>
        </div>

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
                      <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg h-9 text-sm" />
                    </div>
                    <div className={cn("space-y-1 rounded-lg transition-all", syncedKeys.has("title") && "ring-2 ring-accent ring-offset-2 ring-offset-background animate-shake")} data-field="title">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Title / Role</label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CEO & Co-Founder" className="rounded-lg h-9 text-sm" />
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
                      <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="San Francisco, CA" className="rounded-lg h-9 text-sm" />
                    </div>
                  </div>
                  <div className={cn("space-y-1 rounded-lg transition-all", syncedKeys.has("bio") && "ring-2 ring-accent ring-offset-2 ring-offset-background animate-shake")} data-field="bio">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Bio</label>
                      <span className={cn("text-[10px] font-mono", bio.length > 160 ? "text-destructive" : "text-muted-foreground")}>{bio.length}/160</span>
                    </div>
                    <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))} placeholder="Brief description of what you're building..." rows={2} className="flex w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sign Out */}
        <button
          onClick={async () => { await onSignOut(); }}
          className="flex items-center gap-2 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors py-1"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>

        <div className="h-12" />
      </div>
      <StickyFormFooter dirty={isDirty} saving={saving} onDiscard={handleDiscard} onSave={handleSave} />

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


// ── Network Tab (Sensor Suite) ──
function NetworkTab() {
  return (
    <TabWrapper>
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#050505" }}>
        <div className="p-6">
          <SensorSuiteGrid compact={false} showHeader={true} showTerminal={true} />
        </div>
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

// ── Security Tab ──
function SecurityTab() {
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
        <p className="text-xs text-muted-foreground mt-0.5">Manage your account security settings</p>
      </div>

      <div className="space-y-3">
        <button className="w-full flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-muted/30 transition-colors text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Change Password</p>
            <p className="text-[10px] text-muted-foreground">Last updated 30 days ago</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
        </button>

        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
              <p className="text-[10px] text-muted-foreground">Add an extra layer of protection</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[9px] uppercase font-bold">Off</Badge>
        </div>
      </div>
    </motion.div>
  );
}

// ── Subscription Tab ──
function SubscriptionTab() {
  const { profile, upsertProfile } = useProfile();
  const [userType, setUserType] = useState(profile?.user_type || "founder");

  useEffect(() => {
    if (profile?.user_type) setUserType(profile.user_type);
  }, [profile?.user_type]);

  const handleUserTypeChange = (type: string) => {
    setUserType(type);
    upsertProfile({ user_type: type });
  };

  const USER_TYPES = [
    { id: "founder", label: "Founder", icon: Users, desc: "Building a startup" },
    { id: "operator", label: "Operator", icon: UserCog, desc: "Fractional or advisory" },
    { id: "investor", label: "Investor", icon: Briefcase, desc: "Investing in startups" },
  ];

  const PLANS = [
    {
      name: "Free",
      price: "$0",
      features: ["5 investor matches/mo", "Basic deck audit", "Community access"],
      current: false,
    },
    {
      name: "Pro",
      price: "$49",
      features: ["Unlimited matches", "AI-powered deck audit", "Network intelligence", "Priority support"],
      current: true,
    },
    {
      name: "Scale",
      price: "$149",
      features: ["Everything in Pro", "Team seats (5)", "API access", "Custom integrations", "Dedicated CSM"],
      current: false,
    },
  ];

  const INVOICES = [
    { date: "Mar 22, 2026", amount: "$49.00", status: "Paid" },
    { date: "Feb 22, 2026", amount: "$49.00", status: "Paid" },
    { date: "Jan 22, 2026", amount: "$49.00", status: "Paid" },
  ];

  return (
    <TabWrapper>
      <div className="space-y-8">
        {/* User Type Selector */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">I am a</h3>
          <div className="flex gap-2">
            {USER_TYPES.map((type) => {
              const Icon = type.icon;
              const isActive = userType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => handleUserTypeChange(type.id)}
                  className={cn(
                    "flex-1 flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 transition-all",
                    isActive ? "border-accent bg-accent/5 shadow-sm" : "border-border hover:border-border/80 hover:bg-muted/20"
                  )}
                >
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", isActive ? "bg-accent/10" : "bg-muted")}>
                    <Icon className={cn("h-3.5 w-3.5", isActive ? "text-accent" : "text-muted-foreground")} />
                  </div>
                  <div className="text-left">
                    <p className={cn("text-xs font-semibold", isActive ? "text-foreground" : "text-muted-foreground")}>{type.label}</p>
                    <p className="text-[9px] text-muted-foreground">{type.desc}</p>
                  </div>
                  {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0 ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Current Plan — Dark Bento Card */}
        <div className="rounded-2xl p-6 text-white" style={{ backgroundColor: "#0A0A0A" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-400" />
              <span className="text-lg font-bold">Pro Plan</span>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] uppercase font-bold">Active</Badge>
          </div>
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-4xl font-black">$49</span>
            <span className="text-sm text-white/40">/month</span>
          </div>
          <p className="text-[11px] text-white/30 font-mono">Renews April 22, 2026</p>
          <div className="mt-4 space-y-1.5">
            {["Unlimited investor matches", "AI-powered deck audit", "Community network access", "Priority support"].map((f) => (
              <div key={f} className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                <span className="text-[11px] text-white/50">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plan Comparison */}
        <div className="space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">Compare Plans</h3>
          <div className="grid grid-cols-3 gap-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "rounded-xl border-2 p-4 space-y-3",
                  plan.current ? "border-accent bg-accent/5" : "border-border"
                )}
              >
                <div>
                  <p className="text-sm font-bold text-foreground">{plan.name}</p>
                  <p className="text-2xl font-black text-foreground">{plan.price}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                </div>
                <div className="space-y-1.5">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-accent shrink-0" />
                      <span className="text-[10px] text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>
                {plan.current ? (
                  <Badge className="bg-accent/10 text-accent border-accent/20 text-[9px] uppercase font-bold w-full justify-center">Current</Badge>
                ) : (
                  <Button variant="outline" size="sm" className="w-full rounded-lg text-xs">
                    {plan.price === "$0" ? "Downgrade" : "Upgrade"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Billing History */}
        <div className="space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">Billing History</h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {INVOICES.map((inv) => (
                  <tr key={inv.date} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-xs text-foreground">{inv.date}</td>
                    <td className="px-4 py-3 text-xs font-medium text-foreground">{inv.amount}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-success/10 text-success border-success/20 text-[8px] uppercase font-bold">{inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-[10px] text-accent hover:text-accent/80 font-medium transition-colors">Download PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Method */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold">Payment Method</h3>
          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-12 items-center justify-center rounded-md bg-muted border border-border">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">•••• 4242</p>
                <p className="text-[10px] text-muted-foreground">Expires 12/27</p>
              </div>
            </div>
            <button className="text-xs font-medium text-accent hover:text-accent/80 transition-colors">Update</button>
          </div>
        </div>
      </div>
    </TabWrapper>
  );
}
