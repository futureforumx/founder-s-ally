import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SignIn, SignUp, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import { readClerkPublishableKey } from "@/lib/clerkPublishableKey";

const clerkAppearance = {
  elements: {
    rootBox: "w-full flex justify-start",
    socialButtonsBlockButton:
      "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 h-10",
    formButtonPrimary: "bg-zinc-900 hover:bg-zinc-800 text-[15px] font-medium h-11",
    formFieldInput: "border-zinc-300 bg-white",
    dividerLine: "bg-zinc-200",
    dividerText: "text-zinc-400",
  },
};

const fallback = (
  <div className="flex min-h-[280px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-10">
    <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
    <p className="text-center text-xs text-zinc-500">Loading…</p>
  </div>
);

/**
 * Path-based routes under `/auth/*` — set the same paths in Clerk Dashboard → Paths if prompted.
 */
export default function Auth() {
  const { isLoaded, userId } = useClerkAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clerkLoadTimedOut, setClerkLoadTimedOut] = useState(false);
  const clerkKey = readClerkPublishableKey();
  const showLocalPreviewFallback =
    import.meta.env.DEV && clerkKey.startsWith("pk_live_") && !isLoaded;
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "this domain";

  useEffect(() => {
    if (isLoaded) {
      setClerkLoadTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setClerkLoadTimedOut(true), 15_000);
    return () => window.clearTimeout(t);
  }, [isLoaded]);

  useEffect(() => {
    if (isLoaded && userId) navigate("/", { replace: true });
  }, [isLoaded, userId, navigate]);

  if (showLocalPreviewFallback) {
    return (
      <div className="min-h-screen bg-zinc-100 px-4 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-zinc-200/80 bg-white p-8 shadow-sm sm:p-10">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Preview mode</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            This localhost build is using a production Clerk key, so sign-in cannot load here. Add{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY_DEV=pk_test_…</code> in{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded && !clerkLoadTimedOut) {
    return shell(
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const isSignUp = location.pathname.startsWith("/auth/sign-up");

  return shell(
    isSignUp ? (
      <>
        {clerkLoadTimedOut && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
            Clerk is still initializing for <span className="font-semibold">{currentOrigin}</span>. If sign-in does not appear,
            add this domain in Clerk → Domains, disable blockers for this site, and hard-refresh.
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Create your account</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Get started in a few steps. You can also continue with Google or other providers if enabled in Clerk.
        </p>
        <div className="mt-8 w-full min-w-0">
          <SignUp
            routing="path"
            path="/auth/sign-up"
            signInUrl="/auth"
            fallbackRedirectUrl="/"
            appearance={clerkAppearance}
            fallback={fallback}
          />
        </div>
      </>
    ) : (
      <>
        {clerkLoadTimedOut && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
            Clerk is still initializing for <span className="font-semibold">{currentOrigin}</span>. If sign-in does not appear,
            add this domain in Clerk → Domains, disable blockers for this site, and hard-refresh.
          </div>
        )}
        <h1 className="hidden md:block text-2xl font-semibold tracking-tight text-zinc-900">Welcome Back.</h1>
        <p className="hidden md:block mt-2 text-sm text-zinc-500">Your founder co-pilot awaits.</p>
        <div className="mt-8 w-full min-w-0">
          <SignIn
            routing="path"
            path="/auth"
            signUpUrl="/auth/sign-up"
            fallbackRedirectUrl="/"
            appearance={clerkAppearance}
            fallback={fallback}
          />
        </div>
      </>
    )
  );
}
