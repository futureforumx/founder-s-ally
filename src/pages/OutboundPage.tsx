import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabasePublicDirectory } from "@/integrations/supabase/client";
import { isValidOutboundUrl } from "@/lib/outboundUrl";

/** Max ms to wait for the DB insert before redirecting anyway. */
const LOG_TIMEOUT_MS = 1200;

export default function OutboundPage() {
  const [params] = useSearchParams();
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;

    const to = params.get("to") ?? "";
    const type = params.get("type") ?? null;
    const context = params.get("context") ?? null;
    const id = params.get("id") ?? null;

    // Safety: reject anything that isn't a plain http(s) URL.
    if (!to || !isValidOutboundUrl(to)) {
      window.location.replace("/");
      return;
    }

    const doRedirect = () => {
      window.location.replace(to);
    };

    // Fire-and-forget with a hard timeout so a slow DB never blocks the user.
    const timer = setTimeout(doRedirect, LOG_TIMEOUT_MS);

    supabasePublicDirectory
      .from("outbound_clicks")
      .insert({
        destination_url: to,
        type,
        context,
        entity_id: id,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
      })
      .then(() => {
        clearTimeout(timer);
        doRedirect();
      })
      .catch(() => {
        clearTimeout(timer);
        doRedirect();
      });

    return () => clearTimeout(timer);
  }, []); // run once on mount

  // Render nothing visible — redirect happens before the user sees any content.
  return null;
}
