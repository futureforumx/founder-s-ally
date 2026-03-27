import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Auth() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSignUp = location.pathname === "/auth/sign-up";
  const vantaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [user, authLoading, navigate]);

  // Initialize Vanta.NET animation
  useEffect(() => {
    if (!vantaRef.current) return;

    // Load Three.js
    const threeScript = document.createElement("script");
    threeScript.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

    // Load Vanta.NET
    const vantaScript = document.createElement("script");
    vantaScript.src = "https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.net.min.js";

    const initVanta = () => {
      if (typeof (window as any).VANTA !== "undefined") {
        (window as any).VANTA.NET({
          el: vantaRef.current,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale: 1,
          scaleMobile: 1,
          color: 0x1360f2,
          backgroundColor: 0x001d,
          points: 17,
          maxDistance: 33,
          spacing: 18,
        });
      }
    };

    vantaScript.onload = initVanta;
    document.body.appendChild(threeScript);
    document.body.appendChild(vantaScript);

    return () => {
      if (threeScript.parentNode) document.body.removeChild(threeScript);
      if (vantaScript.parentNode) document.body.removeChild(vantaScript);
    };
  }, []);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const clerkAppearance = {
    elements: {
      rootBox: "w-full flex justify-center",
      card: "shadow-none border-0 bg-transparent w-full",
      socialButtonsBlockButton:
        "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 h-10",
      formButtonPrimary: "bg-zinc-900 hover:bg-zinc-800 text-[15px] font-medium h-11",
      identityPreviewText: "text-zinc-600",
      formFieldInput: "border-zinc-300 bg-white",
      dividerLine: "bg-zinc-200",
      dividerText: "text-zinc-400",
    },
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.98),_rgba(244,244,245,0.92)_45%,_rgba(228,228,231,0.82)_100%)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl overflow-hidden rounded-[32px] border border-zinc-200/80 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.12)]">
        <div className="w-full lg:w-[460px] lg:border-r lg:border-zinc-200/80 xl:w-[520px]">
          <div className="font-clash flex h-full flex-col justify-center px-8 py-8 sm:px-10 lg:px-12">
            <div className="mb-8 flex flex-col items-start gap-4">
              <BrandLogo variant="black" className="w-[132px] sm:w-[148px]" />
            </div>

            {isSignUp ? (
              <>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Create your account</h1>
                <p className="mt-2 text-sm text-zinc-500">
                  Get started in a few steps. You can also continue with Google or other providers if enabled in
                  Clerk.
                </p>
                <div className="mt-8 w-full">
                  <SignUp
                    routing="virtual"
                    signInUrl="/auth"
                    fallbackRedirectUrl="/"
                    appearance={clerkAppearance}
                  />
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Welcome Back.</h1>
                <p className="mt-2 text-sm text-zinc-500">Your founder co-pilot awaits.</p>
                <div className="mt-8 w-full">
                  <SignIn
                    routing="virtual"
                    signUpUrl="/auth/sign-up"
                    fallbackRedirectUrl="/"
                    appearance={clerkAppearance}
                  />
                </div>
              </>
            )}

            <p className="mt-8 text-xs leading-relaxed text-zinc-500">
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

        <div className="relative hidden flex-1 overflow-hidden bg-zinc-950 lg:block">
          <div
            ref={vantaRef}
            className="absolute inset-0 h-full w-full"
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(10,10,10,0.5)_0%,rgba(24,24,27,0.3)_42%,rgba(255,255,255,0.05)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.08),_transparent_38%)]" />

          <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white bg-white/8 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white backdrop-blur-sm">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live Founder Signal
            </div>

            <div className="max-w-xl space-y-5">
              <p className="text-sm font-medium uppercase tracking-[0.34em] text-white drop-shadow-[0_1px_12px_rgba(0,0,0,0.45)]">
                Founder Intelligence
              </p>
              <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
                A calm front door for a fast-moving fundraising system.
              </h2>
              <p className="max-w-lg text-base leading-7 text-white">
                Search, sync, and operate from a workspace that feels composed even while the market moves underneath
                it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
