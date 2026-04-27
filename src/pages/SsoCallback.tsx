import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

/**
 * WorkOS AuthKit callback handler.
 * AuthKitProvider (mounted at root) processes the ?code= and ?state= params and
 * sets user + flips loading to false. This component waits for that to complete
 * before navigating into the app.
 */
export default function SsoCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const hasCode = searchParams.has("code");
  const hasState = searchParams.has("state");
  const errorParam = searchParams.get("error");

  console.log("[SsoCallback] params:", { hasCode, hasState, hasError: !!errorParam, loading, hasUser: !!user });

  useEffect(() => {
    if (errorParam) {
      console.error("[SsoCallback] WorkOS returned error param:", errorParam);
      navigate("/auth", { replace: true });
      return;
    }

    if (!loading && user) {
      console.log("[SsoCallback] auth complete, navigating home");
      navigate("/", { replace: true });
      return;
    }

    // If AuthKitProvider finished loading but there's no user and no code left,
    // the exchange failed — fall back to the login page.
    if (!loading && !user && !hasCode) {
      console.warn("[SsoCallback] no user after callback, redirecting to /auth");
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate, hasCode, errorParam]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
    </div>
  );
}
