import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
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
  const clerkKey = readClerkPublishableKey();
  const showLocalPreviewFallback =
    import.meta.env.DEV && clerkKey.startsWith("pk_live_") && !isLoaded;

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

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-zinc-200/80 bg-white p-8 shadow-sm sm:p-10">
        <Routes>
          <Route
            path="sign-in/*"
            element={
              <SignIn
                routing="path"
                path="/auth/sign-in"
                signUpUrl="/auth/sign-up"
                forceRedirectUrl="/"
                signInFallbackRedirectUrl="/"
                appearance={clerkAppearance}
                fallback={fallback}
              />
            }
          />
          <Route
            path="sign-up/*"
            element={
              <SignUp
                routing="path"
                path="/auth/sign-up"
                signInUrl="/auth/sign-in"
                forceRedirectUrl="/onboarding"
                signUpFallbackRedirectUrl="/onboarding"
                appearance={clerkAppearance}
                fallback={fallback}
              />
            }
          />
          <Route path="*" element={<Navigate to="/auth/sign-in" replace />} />
        </Routes>
        <p className="mt-8 text-center text-xs leading-relaxed text-zinc-500">
          Our privacy standards are worldclass. Find them{" "}
          <a
            href="https://tryvekta.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
          >
            here
          </a>
          .
        </p>
      </div>
    </div>
  );
}
