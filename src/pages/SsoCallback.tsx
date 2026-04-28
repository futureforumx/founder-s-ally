import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

/**
 * WorkOS AuthKit callback handler — mounted at /auth and /auth/*.
 *
 * This is the ONLY component that handles the WorkOS redirect URI
 * (https://vekta.so/auth?code=...). It never renders standalone sign-in UI.
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
  const logged = useRef(false);
  const ensureCalledRef = useRef(false);
  const [ensuringUser, setEnsuringUser] = useState(false);

  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const hasCode = searchParams.has("code");
  const hasError = searchParams.has("error");
  const errorParam = searchParams.get("error");

  // Log once on mount — no secrets, safe in prod
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    if (import.meta.env.DEV) {
      console.log("[auth] SsoCallback mounted —", {
        url: window.location.href,
        hasCode,
        hasError,
        error: errorParam,
      });
    }
  }, [hasCode, hasError, errorParam]);

  useEffect(() => {
    // Guard 1: WorkOS returned an explicit error param (e.g. access_denied)
    if (hasError) {
      if (import.meta.env.DEV) {
        console.warn("[auth] WorkOS returned error param:", errorParam);
      }
      navigate(`/login?error=${encodeURIComponent(errorParam ?? "workos_error")}`, { replace: true });
      return;
    }

    // Guard 2: No code — user landed on /auth directly, bounce to /login
    if (!hasCode) {
      if (import.meta.env.DEV) {
        console.log("[auth] /auth hit without ?code= — redirecting to /login");
      }
      navigate("/login", { replace: true });
      return;
    }

    // Code is present — wait for the SDK to finish the exchange
    if (loading) return;

    if (user) {
      // Exchange succeeded — ensure users + profiles rows exist before navigating
      if (ensureCalledRef.current) return;
      ensureCalledRef.current = true;

      if (import.meta.env.DEV) {
        console.log("[auth] exchange succeeded — calling ensure-user for:", user.id);
      }

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
          if (import.meta.env.DEV) {
            console.log("[auth] ensure-user response:", json);
          }
        })
        .catch((err) => {
          // Non-fatal — the app can still load; profile will be fetched later
          if (import.meta.env.DEV) {
            console.warn("[auth] ensure-user request failed (non-fatal):", err);
          }
        })
        .finally(() => {
          if (import.meta.env.DEV) {
            console.log("[auth] navigating to /");
          }
          navigate("/", { replace: true });
        });

      return;
    }

    // SDK finished loading but no user — exchange failed (bad or expired code)
    if (import.meta.env.DEV) {
      console.warn("[auth] exchange failed — loading done but no user set");
    }
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
