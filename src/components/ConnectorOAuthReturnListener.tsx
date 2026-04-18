import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useActiveContext } from "@/context/ActiveContext";
import {
  consumeConnectorOAuthResumeView,
  invalidateConnectorSurfaceQueries,
} from "@/lib/connectorClient";
import { CONNECTOR_MANAGE_DENIED_MESSAGE } from "@/lib/connectorPermissions";

/**
 * Cleans `connector_oauth` query params after Google OAuth redirect and refreshes connector queries.
 */
export function ConnectorOAuthReturnListener() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeContextId } = useActiveContext();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get("connector_oauth");
    if (!flag) return;

    const ownerFromQuery = params.get("owner_context_id");
    const oc = (ownerFromQuery?.trim() || activeContextId || "").trim();

    if (flag === "success") {
      invalidateConnectorSurfaceQueries(queryClient, oc);
      toast.success("Connector linked", { description: "Refreshing connected accounts for this context." });
      const resume = consumeConnectorOAuthResumeView();
      if (resume === "targeting") {
        queueMicrotask(() =>
          window.dispatchEvent(new CustomEvent("navigate-view", { detail: "targeting" })),
        );
      }
    } else if (flag === "error") {
      consumeConnectorOAuthResumeView();
      const reason = params.get("reason") || "unknown";
      const detail = params.get("detail");
      invalidateConnectorSurfaceQueries(queryClient, oc);
      if (reason === "connector_forbidden") {
        toast.error("Connector setup blocked", { description: CONNECTOR_MANAGE_DENIED_MESSAGE });
      } else {
        toast.error("Connector OAuth failed", {
          description: detail?.trim() ? `${reason}: ${detail}` : reason,
        });
      }
    }

    params.delete("connector_oauth");
    params.delete("owner_context_id");
    params.delete("connector");
    params.delete("reason");
    params.delete("detail");
    const search = params.toString() ? `?${params.toString()}` : "";
    navigate({ pathname: location.pathname, search, hash: location.hash }, { replace: true });
  }, [location.search, location.pathname, location.hash, navigate, queryClient, activeContextId]);

  return null;
}
