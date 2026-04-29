import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

function readCallbackError(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return (
    params.get("error") ||
    params.get("error_code") ||
    hashParams.get("error") ||
    hashParams.get("error_code")
  );
}

export default function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const callbackError = useMemo(() => readCallbackError(), []);

  useEffect(() => {
    if (callbackError) {
      navigate(`/login?error=${encodeURIComponent(callbackError)}`, { replace: true });
      return;
    }

    if (loading) return;

    if (user) {
      navigate("/", { replace: true });
    } else {
      navigate("/login?error=callback_failed", { replace: true });
    }
  }, [callbackError, loading, navigate, user]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Completing sign-in...</span>
      </div>
    </div>
  );
}
