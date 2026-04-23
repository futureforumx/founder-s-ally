import { createContext, useContext, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { trackMixpanelEvent } from "@/lib/mixpanel";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ActiveContextProvider } from "@/context/ActiveContext";
import { ConnectorOAuthReturnListener } from "@/components/ConnectorOAuthReturnListener";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Index = lazy(() => import("./pages/Index.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AdminIntelligence = lazy(() => import("./pages/AdminIntelligence.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const FirmProfile = lazy(() => import("./pages/FirmProfile.tsx"));
const OrganizationProfile = lazy(() => import("./pages/OrganizationProfile.tsx"));
const AccessRequest = lazy(() => import("./pages/AccessRequest.tsx"));
const Referrals = lazy(() => import("./pages/Referrals.tsx"));
const FreshCapitalPage = lazy(() => import("./pages/FreshCapitalPage.tsx"));
const OutboundPage = lazy(() => import("./pages/OutboundPage.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

type ProfileStatusValue = {
  isKnown: boolean;
  loading: boolean;
  needsOnboarding: boolean;
  refresh: () => void;
};

const ProfileStatusContext = createContext<ProfileStatusValue>({
  isKnown: false,
  loading: false,
  needsOnboarding: false,
  refresh: () => {},
});

function readCachedOnboardingState() {
  try {
    const saved = localStorage.getItem("company-profile");
    if (!saved) return { isKnown: false, needsOnboarding: false };
    const parsed = JSON.parse(saved);
    return parsed?.name
      ? { isKnown: true, needsOnboarding: false }
      : { isKnown: false, needsOnboarding: false };
  } catch {
    return { isKnown: false, needsOnboarding: false };
  }
}

function BackgroundProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState(() => ({
    ...readCachedOnboardingState(),
    loading: false,
  }));

  useEffect(() => {
    if (DEMO_MODE) {
      setState({ isKnown: true, loading: false, needsOnboarding: false });
      return;
    }
    if (authLoading) return;
    if (!user) {
      setState({ isKnown: true, loading: false, needsOnboarding: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    supabase
      .from("profiles")
      .select("id, has_completed_onboarding")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ isKnown: true, loading: false, needsOnboarding: false });
          return;
        }
        const completed = (data as { has_completed_onboarding?: boolean } | null)?.has_completed_onboarding === true;
        setState({
          isKnown: true,
          loading: false,
          needsOnboarding: !data || !completed,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, refreshToken]);

  const value = useMemo<ProfileStatusValue>(
    () => ({
      ...state,
      refresh: () => setRefreshToken((prev) => prev + 1),
    }),
    [state],
  );

  return <ProfileStatusContext.Provider value={value}>{children}</ProfileStatusContext.Provider>;
}

function useProfileStatus() {
  return useContext(ProfileStatusContext);
}

function RouteLoader({ fullscreen = true, label = "Loading…" }: { fullscreen?: boolean; label?: string }) {
  const containerClass = fullscreen
    ? "flex h-screen items-center justify-center bg-background"
    : "flex min-h-[220px] items-center justify-center rounded-2xl border border-border/60 bg-card/70 text-muted-foreground";
  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      setAuthTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setAuthTimedOut(true), 15_000);
    return () => window.clearTimeout(t);
  }, [loading]);

  if (loading && authTimedOut) {
    return <Navigate to="/auth?timeout=1" replace />;
  }

  if (loading) {
    return <RouteLoader />;
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function BackgroundProfileNotice() {
  const { loading } = useProfileStatus();

  if (!loading) return null;

  return (
    <div className="mx-8 mt-4 rounded-xl border border-border/60 bg-card/70 px-4 py-3 text-xs text-muted-foreground">
      Syncing your profile in the background…
    </div>
  );
}

function AppIndexRoute() {
  const { isKnown, needsOnboarding } = useProfileStatus();

  if (isKnown && needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <>
      <BackgroundProfileNotice />
      <Suspense fallback={<RouteLoader fullscreen={false} label="Loading workspace…" />}>
        <Index />
      </Suspense>
    </>
  );
}

function AppOnboardingRoute() {
  const { isKnown, needsOnboarding } = useProfileStatus();

  if (isKnown && !needsOnboarding) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <BackgroundProfileNotice />
      <Suspense fallback={<RouteLoader fullscreen={false} label="Loading onboarding…" />}>
        <Onboarding />
      </Suspense>
    </>
  );
}

function MixpanelPageViewTracker() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    trackMixpanelEvent("Page View", {
      page_url: typeof window !== "undefined" ? window.location.href : "",
      page_title: typeof document !== "undefined" ? document.title : "",
      ...(user?.id ? { user_id: user.id } : {}),
    });
  }, [location.pathname, location.search, user?.id]);

  return null;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { isAppAdmin, loading: adminLoading } = useAppAdmin();

  if (authLoading || adminLoading) {
    return <RouteLoader fullscreen={false} label="Checking admin access…" />;
  }

  if (!user || !isAppAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SpeedInsights />
      <BrowserRouter>
        <AuthProvider>
          <ActiveContextProvider>
          <BackgroundProfileProvider>
            <MixpanelPageViewTracker />
            <ConnectorOAuthReturnListener />
            <Routes>
              <Route path="/auth/*" element={<Suspense fallback={<RouteLoader />}><Auth /></Suspense>} />
              <Route
                path="/access"
                element={
                  <Suspense fallback={<RouteLoader label="Loading…" />}>
                    <AccessRequest />
                  </Suspense>
                }
              />
              <Route
                path="/referrals"
                element={
                  <Suspense fallback={<RouteLoader label="Loading…" />}>
                    <Referrals />
                  </Suspense>
                }
              />
              <Route
                path="/fresh-capital"
                element={
                  <Suspense fallback={<RouteLoader fullscreen={false} label="Loading…" />}>
                    <FreshCapitalPage />
                  </Suspense>
                }
              />
              <Route
                path="/fund-watch"
                element={
                  <Suspense fallback={<RouteLoader fullscreen={false} label="Loading…" />}>
                    <FreshCapitalPage />
                  </Suspense>
                }
              />
              <Route
                path="/freshcapital"
                element={
                  <Suspense fallback={<RouteLoader fullscreen={false} label="Loading…" />}>
                    <FreshCapitalPage />
                  </Suspense>
                }
              />
              <Route
                path="/fundwatch"
                element={
                  <Suspense fallback={<RouteLoader fullscreen={false} label="Loading…" />}>
                    <FreshCapitalPage />
                  </Suspense>
                }
              />
              <Route
                path="/newfunds"
                element={
                  <Suspense fallback={<RouteLoader fullscreen={false} label="Loading…" />}>
                    <FreshCapitalPage />
                  </Suspense>
                }
              />
              <Route
                path="/outbound"
                element={
                  <Suspense fallback={null}>
                    <OutboundPage />
                  </Suspense>
                }
              />
              <Route path="/" element={<ProtectedRoute><AppIndexRoute /></ProtectedRoute>} />
              <Route path="/intelligence" element={<ProtectedRoute><AppIndexRoute /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><AppOnboardingRoute /></ProtectedRoute>} />
              <Route path="/admin/intelligence" element={<ProtectedRoute><AdminRoute><Suspense fallback={<RouteLoader fullscreen={false} label="Loading admin tools…" />}><AdminIntelligence /></Suspense></AdminRoute></ProtectedRoute>} />
              <Route path="/firms/:id" element={<ProtectedRoute><Suspense fallback={<RouteLoader fullscreen={false} label="Loading firm profile…" />}><FirmProfile /></Suspense></ProtectedRoute>} />
              <Route
                path="/companies/:id"
                element={
                  <ProtectedRoute>
                    <Suspense fallback={<RouteLoader fullscreen={false} label="Loading company…" />}>
                      <OrganizationProfile />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Suspense fallback={<RouteLoader fullscreen={false} label="Loading page…" />}><NotFound /></Suspense>} />
            </Routes>
          </BackgroundProfileProvider>
          </ActiveContextProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
