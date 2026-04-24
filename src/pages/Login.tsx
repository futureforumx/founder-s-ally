import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth as useWorkOSAuth } from "@workos-inc/authkit-react";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, signIn } = useWorkOSAuth();
  const timedOut = new URLSearchParams(location.search).get("timeout") === "1";

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
      return;
    }

    void signIn().catch(() => {
      // Keep the user on a recoverable route if the hosted auth redirect fails.
    });
  }, [navigate, signIn, user]);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Redirecting to sign in</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {timedOut
            ? "Authentication took longer than expected. Retrying with WorkOS now."
            : "Taking you to WorkOS to continue."}
        </p>

        <div className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
          Redirecting...
        </div>

        <p className="mt-4 text-center text-sm text-zinc-600">
          If nothing happens,{" "}
          <Link to="/auth" className="font-medium text-zinc-900 underline underline-offset-4">
            use the fallback sign-in page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
