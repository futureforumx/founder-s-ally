import { useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@workos-inc/authkit-react";
import { Loader2 } from "lucide-react";

const hasWorkOSConfig = Boolean(String(import.meta.env.VITE_WORKOS_CLIENT_ID ?? "").trim());

function WorkOSAuthFlow() {
  const { user, isLoading, signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/", { replace: true });
      return;
    }
    if (!isLoading && !user) {
      void signIn();
    }
  }, [isLoading, user, navigate, signIn]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
    </div>
  );
}

export default function Auth() {
  if (!hasWorkOSConfig) {
    return <Navigate to="/" replace />;
  }
  return <WorkOSAuthFlow />;
}
