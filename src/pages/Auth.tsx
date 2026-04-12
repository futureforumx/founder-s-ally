import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
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

/** Default Mux playback IDs (see https://player.mux.com/{id}) — rotated after each clip ends. */
const AUTH_HERO_MUX_DEFAULT_PLAYBACK_IDS: readonly string[] = [
  "HNOyYRA6pFJoX9F51frOfUsK6XRUewFXa6eHobQAGYE",
  "GwpGwspdiRXiP00bFyarvtSMx9eno01Tfjld2bxSywt3M",
  "hoUpKcH1LBS86dkrgoXP1x9ORxOJusTFFhF5P02Pp5T00",
  "mVGsBCWO5V46YB2cOR14YqV8qQMkbLenCQj66NPP01gk",
  "mus1E01ZlGiMcnJRqP01wTRGcEt4QrmGQD8hE6oKGDFOw",
  "1U00V6TZvQ3t9EmnfP2003tG802kAgP7KtsUMlehWQu01Oo",
  "lv1NDSSrTxFmV4xzCc02vvVDqyxIUflWlr7ZCoMMmgEY",
  "rtDFG2JYsK6XXtHXz6Sj6VKueY6KODyCzNnq63Od00qM",
  "C2tc8dcA7ZQ3kPcaSZsywOCsoLc7sihr228Is1f02HNo",
  "8sKr9J00300jCEI34syMhVQsS2R00t82NigJdUO2XSDIZY",
];

const AUTH_HERO_MARKETING_COPY = [
  {
    label: "Founder Intelligence",
    headline: "The AI command center for startup founders.",
    body: "Search, sync, and operate from a workspace that feels composed even while the market moves underneath it.",
  },
  {
    label: "Agentic fundraising",
    headline: "Your startup command center for capital, competition, and execution.",
    body: "Find the right investors, track competitors, monitor market shifts in real time, and manage your raise from first target to signed term sheet -- all in one place.",
  },
  {
    label: "Network Intelligence",
    headline: "Proactive workflows to supercharge your network and scale.",
    body: "Organize key relationships, manage priorities, capture insights, and stay on top of fundraising and execution, all in one place.",
  },
] as const;

function extractMuxPlaybackId(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const fromPlayer = s.match(/player\.mux\.com\/([^/?#]+)/i);
  if (fromPlayer?.[1]) return fromPlayer[1];
  const fromStream = s.match(/stream\.mux\.com\/([^/.?#]+)/i);
  if (fromStream?.[1]) return fromStream[1];
  if (/^[A-Za-z0-9]{20,}$/.test(s)) return s;
  return undefined;
}

function parseCommaMuxIds(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const out: string[] = [];
  for (const part of value.split(",")) {
    const id = extractMuxPlaybackId(part);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function isDirectVideoFileUrl(s: string): boolean {
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(s) || s.startsWith("blob:");
}

type AuthHeroPlayback =
  | { mode: "mux"; ids: string[] }
  | { mode: "video"; src: string }
  | { mode: "none" };

function authHeroPlayback(isSignUp: boolean): AuthHeroPlayback {
  const primary = (
    isSignUp
      ? (import.meta.env.VITE_AUTH_VIDEO_SIGNUP as string | undefined)
      : (import.meta.env.VITE_AUTH_VIDEO_SIGNIN as string | undefined)
  )?.trim();
  const shared = (import.meta.env.VITE_AUTH_VIDEO_URL as string | undefined)?.trim();
  const muxEnvList = (() => {
    const globalList = parseCommaMuxIds(import.meta.env.VITE_AUTH_MUX_PLAYBACK_IDS as string | undefined);
    if (globalList.length) return globalList;
    return isSignUp
      ? parseCommaMuxIds(import.meta.env.VITE_AUTH_MUX_PLAYBACK_IDS_SIGNUP as string | undefined)
      : parseCommaMuxIds(import.meta.env.VITE_AUTH_MUX_PLAYBACK_IDS_SIGNIN as string | undefined);
  })();

  if (primary && isDirectVideoFileUrl(primary)) {
    return { mode: "video", src: primary };
  }

  const ids: string[] = [];
  const pushRaw = (raw: string | undefined) => {
    if (!raw) return;
    const id = extractMuxPlaybackId(raw);
    if (id && !ids.includes(id)) ids.push(id);
  };

  for (const id of muxEnvList) {
    if (!ids.includes(id)) ids.push(id);
  }
  pushRaw(primary);
  if (shared && !isDirectVideoFileUrl(shared)) pushRaw(shared);

  for (const id of AUTH_HERO_MUX_DEFAULT_PLAYBACK_IDS) {
    if (!ids.includes(id)) ids.push(id);
  }

  if (ids.length > 0) return { mode: "mux", ids };

  if (shared && isDirectVideoFileUrl(shared)) return { mode: "video", src: shared };

  return { mode: "none" };
}

/** Native hero background video: fill parent; dimensions forced in CSS with !important. */
const authHeroNativeVideoClass =
  "auth-hero-native-video pointer-events-none absolute inset-0 h-full w-full object-cover";

/** Strict background-media container: both layers clip; outer pins to the hero card with inset-0. */
function AuthHeroMediaStage({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 h-full w-full min-h-0 overflow-hidden">
      <div className="relative h-full w-full min-h-0 overflow-hidden bg-black">{children}</div>
    </div>
  );
}

function AuthHeroMedia({ isSignUp }: { isSignUp: boolean }) {
  const playback = useMemo(() => authHeroPlayback(isSignUp), [isSignUp]);
  const [muxIndex, setMuxIndex] = useState(0);
  const muxIdsKey = playback.mode === "mux" ? playback.ids.join("|") : "";

  useEffect(() => {
    setMuxIndex(0);
  }, [isSignUp, muxIdsKey]);

  useEffect(() => {
    if (playback.mode !== "mux" || playback.ids.length <= 1) return;
    const intervalId = window.setInterval(() => {
      setMuxIndex((i) => (i + 1) % playback.ids.length);
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [playback]);

  if (playback.mode === "none") {
    return (
      <AuthHeroMediaStage>
        <div
          className="absolute inset-0 h-full w-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black"
          aria-hidden
        />
      </AuthHeroMediaStage>
    );
  }

  if (playback.mode === "video") {
    const src = playback.src;
    return (
      <AuthHeroMediaStage>
        <video
          key={src}
          className={authHeroNativeVideoClass}
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      </AuthHeroMediaStage>
    );
  }

  const { ids } = playback;
  const activeId = ids[muxIndex % ids.length]!;
  const muxLoop = ids.length <= 1;
  const muxEmbedSrc = `https://player.mux.com/${activeId}?autoplay=1&muted=1&playsinline=1&loop=${muxLoop ? 1 : 0}&controls=0`;

  return (
    <AuthHeroMediaStage>
      <div className="auth-hero-mux relative h-full w-full min-h-0 overflow-hidden">
        <iframe
          key={activeId}
          src={muxEmbedSrc}
          title="Authentication hero video"
          className="auth-hero-mux-player block h-full w-full pointer-events-none border-0"
          allow="autoplay; fullscreen"
          loading="eager"
          tabIndex={-1}
        />
      </div>
    </AuthHeroMediaStage>
  );
}

function AuthHeroCopy({ copyIndex }: { copyIndex: number }) {
  const activeMessage = AUTH_HERO_MARKETING_COPY[copyIndex % AUTH_HERO_MARKETING_COPY.length]!;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4 md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/20 px-3 py-1.5 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/90">
            Live founder signal
          </span>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/25 to-transparent px-5 pb-5 pt-14 max-md:pt-10 md:px-10 md:pb-12 md:pt-32">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55 md:text-[11px]">
          {activeMessage.label}
        </p>
        <h2 className="mt-1.5 max-w-xl text-lg font-semibold leading-snug tracking-tight text-white max-md:line-clamp-2 md:mt-3 md:text-2xl md:leading-tight lg:text-3xl md:line-clamp-none">
          {activeMessage.headline}
        </h2>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-white/75 max-md:line-clamp-2 md:mt-3 md:text-sm md:line-clamp-none">
          {activeMessage.body}
        </p>
        <div className="mt-3 flex items-center gap-2 md:mt-5">
          {AUTH_HERO_MARKETING_COPY.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full transition-all ${
                i === copyIndex % AUTH_HERO_MARKETING_COPY.length ? "bg-white/90" : "bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function shell(children: ReactNode, isSignUp: boolean, heroCopyIndex: number) {
  const leftPadMd = isSignUp ? "md:py-14" : "md:py-10";
  return (
    <div className="fixed inset-0 z-[100] flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-zinc-50 md:grid md:grid-cols-2 md:grid-rows-1">
      <div
        className={`order-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 sm:px-10 md:order-1 md:h-full md:max-h-full md:flex-none ${leftPadMd} py-8 md:py-10`}
      >
        <div className="mx-auto w-full max-w-[440px]">{children}</div>
      </div>
      <div className="relative order-1 h-[min(42vh,280px)] min-h-[200px] w-full shrink-0 overflow-hidden border-b border-zinc-800/80 bg-black md:order-2 md:h-full md:max-h-full md:min-h-0 md:self-stretch md:border-y md:border-l md:border-b-0">
        {/* h-full + min-height: absolute children do not contribute to flex intrinsic height; pin box to parent */}
        <div className="relative h-full min-h-[200px] w-full overflow-hidden shadow-2xl md:min-h-0 md:rounded-l-[28px]">
          <AuthHeroMedia isSignUp={isSignUp} />
          <AuthHeroCopy copyIndex={heroCopyIndex} />
        </div>
      </div>
    </div>
  );
}

/**
 * Path-based routes under `/auth/*` — set the same paths in Clerk Dashboard → Paths if prompted.
 */
function AuthWithClerk() {
  const { isLoaded, userId } = useClerkAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSignUpRoute = location.pathname.startsWith("/auth/sign-up");
  const isSignUpVerifyEmailRoute =
    isSignUpRoute && location.pathname.includes("verify-email-address");
  const forceAuthPreview = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("preview") === "1";
  }, [location.search]);
  const [clerkLoadTimedOut, setClerkLoadTimedOut] = useState(false);
  const [heroCopyIndex, setHeroCopyIndex] = useState(0);
  const clerkKey = readClerkPublishableKey();
  const showLocalPreviewFallback =
    import.meta.env.DEV && Boolean(clerkKey?.trim()) && clerkKey.startsWith("pk_live_") && !isLoaded;
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "this domain";
  const isVercelHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "vercel.app" || window.location.hostname.endsWith(".vercel.app"));

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    const scrollY = window.scrollY;

    const prevHtml = {
      overflow: html.style.overflow,
      position: html.style.position,
      inset: html.style.inset,
      width: html.style.width,
      height: html.style.height,
    };
    const prevBody = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      width: body.style.width,
      minHeight: body.style.minHeight,
      height: body.style.height,
    };
    const prevRoot = root
      ? {
          overflow: root.style.overflow,
          height: root.style.height,
          minHeight: root.style.minHeight,
          maxHeight: root.style.maxHeight,
        }
      : null;

    html.classList.add("auth-route-lock");
    body.classList.add("auth-route-lock");
    root?.classList.add("auth-route-lock");

    html.style.overflow = "hidden";
    html.style.position = "fixed";
    html.style.inset = "0";
    html.style.width = "100%";
    html.style.height = "100%";

    body.style.overflow = "hidden";
    body.style.position = "relative";
    body.style.top = "0";
    body.style.left = "0";
    body.style.width = "100%";
    body.style.minHeight = "100%";
    body.style.height = "100%";

    if (root) {
      root.style.overflow = "hidden";
      root.style.height = "100%";
      root.style.minHeight = "100%";
      root.style.maxHeight = "100%";
    }

    return () => {
      html.classList.remove("auth-route-lock");
      body.classList.remove("auth-route-lock");
      root?.classList.remove("auth-route-lock");

      html.style.overflow = prevHtml.overflow;
      html.style.position = prevHtml.position;
      html.style.inset = prevHtml.inset;
      html.style.width = prevHtml.width;
      html.style.height = prevHtml.height;

      body.style.overflow = prevBody.overflow;
      body.style.position = prevBody.position;
      body.style.top = prevBody.top;
      body.style.left = prevBody.left;
      body.style.width = prevBody.width;
      body.style.minHeight = prevBody.minHeight;
      body.style.height = prevBody.height;

      if (root && prevRoot) {
        root.style.overflow = prevRoot.overflow;
        root.style.height = prevRoot.height;
        root.style.minHeight = prevRoot.minHeight;
        root.style.maxHeight = prevRoot.maxHeight;
      }

      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    if (isLoaded) {
      setClerkLoadTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setClerkLoadTimedOut(true), 15_000);
    return () => window.clearTimeout(t);
  }, [isLoaded]);

  useEffect(() => {
    if (isLoaded && userId && !forceAuthPreview) navigate("/", { replace: true });
  }, [isLoaded, userId, navigate, forceAuthPreview]);

  useEffect(() => {
    setHeroCopyIndex(0);
  }, [isSignUpRoute]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setHeroCopyIndex((prev) => (prev + 1) % AUTH_HERO_MARKETING_COPY.length);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    try {
      if (isSignUpRoute) {
        sessionStorage.setItem("vekta_mp_signup_intent", "1");
      } else if (location.pathname.startsWith("/auth")) {
        sessionStorage.setItem("vekta_mp_signup_intent", "0");
      }
    } catch {
      /* ignore */
    }
  }, [isSignUpRoute, location.pathname]);

  if (showLocalPreviewFallback) {
    return shell(
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Preview mode</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          This localhost build is using a production Clerk key, so sign-in cannot load here. Add{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY_DEV=pk_test_…</code> in{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">.env.local</code>.
        </p>
      </div>,
      isSignUpRoute,
      heroCopyIndex,
    );
  }

  if (!isLoaded && !clerkLoadTimedOut) {
    return shell(
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>,
      isSignUpRoute,
      heroCopyIndex
    );
  }

  return shell(
    isSignUpRoute ? (
      <>
        {clerkLoadTimedOut && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
            <p>
              Clerk is still initializing for <span className="font-semibold">{currentOrigin}</span>. If sign-in does not appear,
              add this domain in Clerk → <span className="font-semibold">Domains</span>, allow the URL in{" "}
              <span className="font-semibold">Redirect URLs</span> (for Google/GitHub), disable blockers, and hard-refresh.
            </p>
            {isVercelHost ? (
              <p className="mt-2 border-t border-amber-200/80 pt-2 text-amber-950/90">
                <span className="font-semibold">Vercel preview:</span> in Vercel → Project → Settings → Environment Variables, ensure{" "}
                <code className="rounded bg-amber-100/90 px-1 py-0.5 font-mono text-[11px]">VITE_CLERK_PUBLISHABLE_KEY</code> (and other{" "}
                <code className="rounded bg-amber-100/90 px-1 py-0.5 font-mono text-[11px]">VITE_*</code> secrets) are enabled for{" "}
                <span className="font-semibold">Preview</span>, not only Production—then redeploy.
              </p>
            ) : null}
          </div>
        )}
        {!isSignUpVerifyEmailRoute && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Create your account</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Get started in a few steps. You can also continue with Google or other providers if enabled in Clerk.
            </p>
          </>
        )}
        <div className={`w-full min-w-0 ${isSignUpVerifyEmailRoute ? "mt-0" : "mt-8"}`}>
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
            <p>
              Clerk is still initializing for <span className="font-semibold">{currentOrigin}</span>. If sign-in does not appear,
              add this domain in Clerk → <span className="font-semibold">Domains</span>, allow the URL in{" "}
              <span className="font-semibold">Redirect URLs</span> (for Google/GitHub), disable blockers, and hard-refresh.
            </p>
            {isVercelHost ? (
              <p className="mt-2 border-t border-amber-200/80 pt-2 text-amber-950/90">
                <span className="font-semibold">Vercel preview:</span> in Vercel → Project → Settings → Environment Variables, ensure{" "}
                <code className="rounded bg-amber-100/90 px-1 py-0.5 font-mono text-[11px]">VITE_CLERK_PUBLISHABLE_KEY</code> (and other{" "}
                <code className="rounded bg-amber-100/90 px-1 py-0.5 font-mono text-[11px]">VITE_*</code> secrets) are enabled for{" "}
                <span className="font-semibold">Preview</span>, not only Production—then redeploy.
              </p>
            ) : null}
          </div>
        )}
        <h1 className="hidden md:block text-2xl font-semibold tracking-tight text-zinc-900">Welcome Back.</h1>
        <p className="hidden md:block mt-2 text-sm text-zinc-500">Your founder co-pilot awaits.</p>
        <div className="mt-6 w-full min-w-0">
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
    ),
    isSignUpRoute,
    heroCopyIndex
  );
}

/** When VITE_DEMO_MODE is true and no publishable key, `main.tsx` omits ClerkProvider — redirect home. */
export default function Auth() {
  const demoNoClerk = import.meta.env.VITE_DEMO_MODE === "true" && !readClerkPublishableKey().trim();
  if (demoNoClerk) {
    return <Navigate to="/" replace />;
  }
  return <AuthWithClerk />;
}
