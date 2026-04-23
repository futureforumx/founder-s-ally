import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth as useWorkOSAuth } from "@workos-inc/authkit-react";

export default function Auth() {
  const navigate = useNavigate();
  const { user, isLoading, signIn } = useWorkOSAuth();

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch {
      // AuthKit surfaces detailed errors in provider logs; keep UI message generic.
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to VEKTA</h1>
        <p className="mt-2 text-sm text-zinc-600">Sign in with your WorkOS identity provider to continue.</p>

        <button
          type="button"
          onClick={() => void handleSignIn()}
          disabled={isLoading}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            "Continue with WorkOS"
          )}
        </button>
      </div>
    </div>
  );
}
