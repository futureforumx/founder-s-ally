import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabaseAuth } from "@/integrations/supabase/client";
import { resolveAuthCallbackUser } from "@/lib/completeAuthCallback";
import { waitlistSignup } from "@/lib/waitlist";

function readCallbackError(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return (
    params.get("error_description") ||
    params.get("error") ||
    params.get("error_code") ||
    hashParams.get("error_description") ||
    hashParams.get("error") ||
    hashParams.get("error_code")
  );
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const callbackError = useMemo(() => readCallbackError(), []);
  const requestAccess = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("intent") === "request-access";
  }, []);
  const [statusLabel, setStatusLabel] = useState(
    requestAccess ? "Verifying your connected account..." : "Completing sign-in...",
  );
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (callbackError) {
      const target = requestAccess ? "/register" : "/login";
      navigate(`${target}?error=${encodeURIComponent(callbackError)}`, { replace: true });
      return;
    }

    let cancelled = false;

    const finish = async () => {
      try {
        const user = await resolveAuthCallbackUser(supabaseAuth, window.location.search);
        if (cancelled) return;

        if (!requestAccess) {
          navigate("/", { replace: true });
          return;
        }

        setStatusLabel("Submitting your access request...");
        const params = new URLSearchParams(window.location.search);
        const metadata = user.user_metadata ?? {};
        const fullName =
          (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
          (typeof metadata.name === "string" && metadata.name.trim()) ||
          [metadata.first_name, metadata.last_name]
            .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
            .map((part) => part.trim())
            .join(" ");
        const provider =
          user.app_metadata && typeof user.app_metadata.provider === "string"
            ? user.app_metadata.provider
            : "oauth";
        const signupResult = await waitlistSignup({
          email: user.email ?? "",
          name: fullName || undefined,
          source: `register_${provider}`,
          referral_code: params.get("ref")?.trim() || undefined,
          metadata: {
            oauth_provider: provider,
            oauth_user_id: user.id,
            avatar_url: typeof metadata.avatar_url === "string" ? metadata.avatar_url : undefined,
            terms_accepted: true,
          },
        });

        const referralCode = signupResult.referral_code?.trim() || "";
        const confirmationState = {
          email: (user.email ?? "").trim().toLowerCase(),
          confirmationEmailSent: signupResult.confirmation_email_sent === true,
          referralCode,
          referralLink: referralCode
            ? `${window.location.origin}/register?ref=${encodeURIComponent(referralCode)}`
            : "",
        };
        try {
          window.sessionStorage.setItem("vekta.waitlistConfirmation", JSON.stringify(confirmationState));
        } catch {
          // Route state still carries the confirmation details when storage is unavailable.
        }

        await supabaseAuth.auth.signOut({ scope: "local" });
        if (!cancelled) {
          navigate("/register/confirmation", { replace: true, state: confirmationState });
        }
      } catch (error) {
        if (import.meta.env.DEV) console.warn("[auth] callback failed:", error);
        if (requestAccess) {
          await supabaseAuth.auth.signOut({ scope: "local" }).catch(() => {});
        }
        if (!cancelled) {
          navigate(requestAccess ? "/register?error=request_failed" : "/login?error=callback_failed", {
            replace: true,
          });
        }
      }
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [callbackError, navigate, requestAccess]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{statusLabel}</span>
      </div>
    </div>
  );
}
