import { useState, useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation, Link } from "react-router-dom";
import { trackMixpanelEvent } from "@/lib/mixpanel";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = lazy(() => import("./pages/Index.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AdminIntelligence = lazy(() => import("./pages/AdminIntelligence.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const FirmProfile = lazy(() => import("./pages/FirmProfile.tsx"));

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

function RouteLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [onboardingChecked, setOnboardingChecked] = useState(DEMO_MODE);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "this domain";

  useEffect(() => {
    if (!loading) {
      setAuthTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setAuthTimedOut(true), 15_000);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (DEMO_MODE) return;
    if (!user) { setOnboardingChecked(true); return; }

    let cancelled = false;
    setOnboardingChecked(false);

    // Retry on null-data: right after sign-in the Clerk JWT may not be available
    // yet, causing the query to run as anon (RLS blocks it → null). Retrying a
    // couple of times avoids incorrectly redirecting already-onboarded users to
    // the onboarding flow.
    const attemptCheck = (retriesLeft: number) => {
      supabase
        .from("profiles")
        .select("id, has_completed_onboarding")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setNeedsOnboarding(false);
            setOnboardingChecked(true);
            return;
          }
          if (data === null && retriesLeft > 0) {
            setTimeout(() => { if (!cancelled) attemptCheck(retriesLeft - 1); }, 500);
            return;
          }
          const completed = (data as any)?.has_completed_onboarding === true;
          setNeedsOnboarding(!data || !completed);
          setOnboardingChecked(true);
        });
    };

    attemptCheck(2);
    return () => { cancelled = true; };
  }, [user]); // location.pathname intentionally omitted — render logic already handles /onboarding redirects

  if (loading && authTimedOut) {
    return <Navigate to="/auth?timeout=1" replace />;
  }

  if (loading || !onboardingChecked) {
    return <RouteLoader />;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  // Prevent completed users from seeing onboarding again
  if (!needsOnboarding && location.pathname === "/onboarding") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
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
    return <RouteLoader />;
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
      <BrowserRouter>
        <AuthProvider>
          <MixpanelPageViewTracker />
          <Routes>
            <Route path="/auth/*" element={<Suspense fallback={<RouteLoader />}><Auth /></Suspense>} />
            <Route path="/" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><Index /></Suspense></ProtectedRoute>} />
            <Route path="/intelligence" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><Index /></Suspense></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><Onboarding /></Suspense></ProtectedRoute>} />
            <Route path="/admin/intelligence" element={<ProtectedRoute><AdminRoute><Suspense fallback={<RouteLoader />}><AdminIntelligence /></Suspense></AdminRoute></ProtectedRoute>} />
            <Route path="/firms/:id" element={<ProtectedRoute><Suspense fallback={<RouteLoader />}><FirmProfile /></Suspense></ProtectedRoute>} />
            <Route path="*" element={<Suspense fallback={<RouteLoader />}><NotFound /></Suspense>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
