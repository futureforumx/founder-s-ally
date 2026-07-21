import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabaseAuth } from "@/integrations/supabase/client";

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
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const callbackError = useMemo(() => readCallbackError(), []);
  const [exchanging, setExchanging] = useState(true);

  useEffect(() => {
    if (callbackError) {
      navigate(`/login?error=${encodeURIComponent(callbackError)}`, { replace: true });
      return;
    }

    let cancelled = false;

    const finish = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          const { error } = await supabaseAuth.auth.exchangeCodeForSession(code);
          if (error && import.meta.env.DEV) {
            console.warn("[auth] exchangeCodeForSession:", error.message);
          }
        } else {
          // Implicit / detectSessionInUrl path — give the client a beat to hydrate.
          await supabaseAuth.auth.getSession();
        }
      } finally {
        if (!cancelled) setExchanging(false);
      }
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [callbackError, navigate]);

  useEffect(() => {
    if (callbackError || exchanging || loading) return;

    if (user) {
      navigate("/", { replace: true });
    } else {
      navigate("/login?error=callback_failed", { replace: true });
    }
  }, [callbackError, exchanging, loading, navigate, user]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Completing sign-in...</span>
      </div>
    </div>
  );
}
