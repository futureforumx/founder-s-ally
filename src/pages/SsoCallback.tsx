import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate("/", { replace: true });
      return;
    }
    navigate("/login", { replace: true });
  }, [loading, navigate, user]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
    </div>
  );
}
