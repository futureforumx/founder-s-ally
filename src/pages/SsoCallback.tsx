import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

/** WorkOS handles SSO callbacks at the configured redirectUri — this page just redirects home. */
export default function SsoCallback() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050506]">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
    </div>
  );
}
