import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function Auth() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasCode = searchParams.has("code");

  useEffect(() => {
    // Don't call signIn() while AuthKitProvider is processing the ?code= callback —
    // doing so starts a new OAuth flow that races with and breaks the one in progress.
    if (hasCode) return;
    if (!loading && user) {
      navigate("/", { replace: true });
      return;
    }
    if (!loading && !user) {
      signIn();
    }
  }, [loading, user, navigate, signIn, hasCode]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
    </div>
  );
}
