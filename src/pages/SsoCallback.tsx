import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

/**
 * WorkOS AuthKit callback handler — mounted at /auth and /auth/*.
 *
 * ROOT CAUSE NOTE: The WorkOS AuthKit JS SDK calls
 *   window.history.replaceState({}, "", cleanUrl)
 * at the end of handleCallback_fn to strip ?code= (and all other params)
 * from the URL, whether the exchange succeeds or fails. This happens on
 * every AuthKitProvider initialization, asynchronously.
 *
 * If we read window.location.search at React render time, it may be empty
 * by the time a re-render occurs (triggered by the SDK setting isLoading:false
 * or user). That makes hasCode=false on the re-render, which would wrongly
 * redirect to /login via Guard 2.
 *
 * FIX: Capture hasCode / hasError / errorParam ONCE in refs on first mount,
 * before the SDK can call history.replaceState. Never re-read from
 * window.location after that.
 *
 * Behaviour matrix:
 *   - WorkOS ?error= param     → redirect to /login?error=<value>
 *   - No ?code= in URL         → redirect to /login  (direct navigation to /auth)
 *   - SDK still loading        → show spinner while exchange is in progress
 *   - Exchange succeeded       → call /api/ensure-user, then navigate to /
 *   - Exchange failed          → redirect to /login?error=callback_failed
 */
export default function SsoCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const ensureCalledRef = useRef(false);
  const [ensuringUser, setEnsuringUser] = useState(false);

  // ---------------------------------------------------------------------------
  // Capture URL params ONCE on first render — before the SDK strips ?code=
  // via window.history.replaceState in handleCallback_fn.
  // Using a ref (not state) so that a re-render caused by the SDK setting
  // user/isLoading does NOT re-read window.location.search.
  // ---------------------------------------------------------------------------
  const initialParams = useRef<{ hasCode: boolean; hasError: boolean; errorParam: string | null } | null>(null);
  if (initialParams.current === null) {
    // This block runs exactly once: on the first render, synchronously,
    // BEFORE any effects or async SDK work can change window.location.
    const sp = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : ""
    );
    initialParams.current = {
      hasCode: sp.has("code"),
      hasError: sp.has("error"),
      errorParam: sp.get("error"),
    };

    // ── DIAGNOSTICS ──────────────────────────────────────────────────────────
    // Write to localStorage before ANY redirect logic so the data survives.
    try {
      window.localStorage.setItem("_auth_debug_callback_url", typeof window !== "undefined" ? window.location.href : "(ssr)");
      window.localStorage.setItem("_auth_debug_callback_search", typeof window !== "undefined" ? window.location.search : "(ssr)");
      window.localStorage.setItem("_auth_debug_callback_code_present", String(initialParams.current.hasCode));
      window.localStorage.setItem("_auth_debug_callback_error_present", String(initialParams.current.hasError));
      window.localStorage.setItem("_auth_debug_callback_at", new Date().toISOString());
    } catch { /* ignore */ }

    console.log("[AUTH_PROOF] callback landed", {
      href: typeof window !== "undefined" ? window.location.href : "(ssr)",
      search: typeof window !== "undefined" ? window.location.search : "(ssr)",
      code_present: initialParams.current.hasCode,
      error_present: initialParams.current.hasError,
    });
    // ── END DIAGNOSTICS ──────────────────────────────────────────────────────
  }

  const { hasCode, hasError, errorParam } = initialParams.current;

  useEffect(() => {
    // Guard 1: WorkOS returned an explicit error param (e.g. access_denied)
    if (hasError) {
      console.warn("[auth] WorkOS returned error param:", errorParam);
      navigate(`/login?error=${encodeURIComponent(errorParam ?? "workos_error")}`, { replace: true });
      return;
    }

    // Guard 2: No code — user navigated to /auth directly, bounce to /login
    // This is checked against the INITIAL URL (before SDK strips params).
    if (!hasCode) {
      console.log("[auth] /auth hit without ?code= — redirecting to /login");
      navigate("/login", { replace: true });
      return;
    }

    // Code was present on load — wait for the SDK to finish the exchange.
    // The SDK reads the code + codeVerifier from sessionStorage internally
    // via AuthKitProvider's handleCallback_fn.
    if (loading) {
      console.log("[auth] exchange in progress (isLoading=true) — waiting…");
      return;
    }

    if (user) {
      // Exchange succeeded — ensure users + profiles rows exist before navigating
      if (ensureCalledRef.current) return;
      ensureCalledRef.current = true;

      console.log("[auth] exchange succeeded — calling ensure-user for:", user.id);
      setEnsuringUser(true);

      fetch("/api/ensure-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _uid: user.id,
          email: user.email ?? undefined,
          display_name: (user as Record<string, unknown>).firstName
            ? `${(user as Record<string, unknown>).firstName ?? ""} ${(user as Record<string, unknown>).lastName ?? ""}`.trim()
            : undefined,
          avatar_url: (user as Record<string, unknown>).profilePictureUrl as string | undefined,
        }),
      })
        .then((r) => r.json())
        .then((json) => {
          console.log("[auth] ensure-user response:", json);
        })
        .catch((err) => {
          // Non-fatal — the app can still load; profile will be fetched later
          console.warn("[auth] ensure-user request failed (non-fatal):", err);
        })
        .finally(() => {
          console.log("[auth] navigating to /");
          navigate("/", { replace: true });
        });

      return;
    }

    // SDK finished loading but no user — exchange failed (bad or expired code,
    // or codeVerifier missing from sessionStorage).
    console.warn("[auth] exchange failed — isLoading=false but user is null");
    navigate("/login?error=callback_failed", { replace: true });
  }, [hasCode, hasError, errorParam, loading, user, navigate]);

  // Always show a spinner — never a sign-in form
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      {ensuringUser && (
        <span className="sr-only">Setting up your account…</span>
      )}
    </div>
  );
}
