/**
 * TEMPORARY diagnostic page — remove before shipping.
 * Visit /debug/auth-proof after a login attempt to see exactly what happened.
 *
 * Reads all _auth_debug_* keys from localStorage and displays them.
 */

const DEBUG_KEYS = [
  // Written synchronously in Auth.tsx button onClick — before any async work
  "_auth_debug_clicked_at",
  // Written by redirectToWorkOS() in useAuth.tsx after PKCE completes
  "_auth_debug_authorize_url",
  "_auth_debug_authorize_hostname",
  "_auth_debug_redirect_uri",
  "_auth_debug_client_id_present",
  "_auth_debug_code_challenge_present",
  // Written if redirectToWorkOS() throws (e.g. crypto.subtle failure)
  "_auth_debug_error",
  // Written by SsoCallback.tsx — when callback page first renders
  "_auth_debug_callback_at",
  "_auth_debug_callback_url",
  "_auth_debug_callback_search",
  "_auth_debug_callback_code_present",
  "_auth_debug_callback_error_present",
  // codeVerifier backup state (written by redirectToWorkOS)
  "_wos_cv_bk",
] as const;

function Row({ label, value }: { label: string; value: string | null }) {
  const missing = value === null || value === "";
  const isCv = label === "_wos_cv_bk";

  const display = isCv
    ? value
      ? `(present — ${value.length} chars)`
      : "(missing)"
    : (value ?? "(missing)");

  const color = missing ? "#ef4444" : value === "false" ? "#f97316" : "#22c55e";

  return (
    <tr>
      <td style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 12, color: "#a1a1aa", whiteSpace: "nowrap", verticalAlign: "top" }}>
        {label}
      </td>
      <td style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 12, color, wordBreak: "break-all" }}>
        {display}
      </td>
    </tr>
  );
}

export default function DebugAuthProof() {
  const values: Record<string, string | null> = {};
  try {
    for (const key of DEBUG_KEYS) {
      values[key] = window.localStorage.getItem(key);
    }
  } catch {
    // localStorage unavailable
  }

  // Derive diagnosis
  const clicked = Boolean(values["_auth_debug_clicked_at"]);
  const pkceError = values["_auth_debug_error"];
  const hasHostname = values["_auth_debug_authorize_hostname"];
  const callbackLanded = Boolean(values["_auth_debug_callback_at"]);
  const codePresent = values["_auth_debug_callback_code_present"];
  const errorPresent = values["_auth_debug_callback_error_present"];

  let diagnosis = "";
  let diagColor = "#a1a1aa";

  if (!clicked) {
    diagnosis = "❌ Login button was never clicked (no _auth_debug_clicked_at). The button onClick is not firing — check for React hydration errors or JS crashes on the /login page.";
    diagColor = "#ef4444";
  } else if (pkceError && pkceError !== "") {
    diagnosis = `❌ Button was clicked but redirectToWorkOS() threw before building the URL: ${pkceError}. Most likely crypto.subtle is unavailable (insecure context / non-HTTPS).`;
    diagColor = "#ef4444";
  } else if (!hasHostname || hasHostname !== "api.workos.com") {
    diagnosis = `❌ Authorize URL hostname is "${hasHostname ?? "(missing)"}" — expected "api.workos.com". WorkOS config is wrong.`;
    diagColor = "#ef4444";
  } else if (!callbackLanded) {
    diagnosis = "❌ SsoCallback never mounted. WorkOS did not redirect back to /auth. Check the redirect_uri in the WorkOS dashboard matches _auth_debug_redirect_uri above.";
    diagColor = "#ef4444";
  } else if (codePresent === "true") {
    diagnosis = "✅ Flow reached /auth with ?code= present. Exchange should have worked. Check SsoCallback logs for exchange failure reason.";
    diagColor = "#22c55e";
  } else if (errorPresent === "true") {
    diagnosis = "⚠️ WorkOS redirected back with ?error= (no code). Check _auth_debug_callback_url for the error param value.";
    diagColor = "#f97316";
  } else {
    diagnosis = "❌ Callback landed at /auth with neither ?code= nor ?error=. The URL was stripped before SsoCallback mounted — SDK history.replaceState ran first, or something else navigated to /auth directly.";
    diagColor = "#ef4444";
  }

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", padding: "40px 24px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <p style={{ color: "#f59e0b", fontSize: 12, marginBottom: 4 }}>⚠ TEMPORARY DIAGNOSTIC PAGE — remove before shipping</p>
        <h1 style={{ color: "#f4f4f5", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>/debug/auth-proof</h1>
        <p style={{ color: "#71717a", fontSize: 13, marginBottom: 32 }}>
          Open this page after a login attempt to see what happened. Values persist across the WorkOS round-trip via localStorage.
        </p>

        {/* Diagnosis banner */}
        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "14px 16px", marginBottom: 32 }}>
          <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Diagnosis</p>
          <p style={{ color: diagColor, fontSize: 13, margin: 0 }}>{diagnosis}</p>
        </div>

        {/* Before-redirect values */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Written before redirect (in redirectToWorkOS)
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#18181b", borderRadius: 8, overflow: "hidden" }}>
            <tbody>
              {(["_auth_debug_clicked_at", "_auth_debug_error", "_auth_debug_authorize_url", "_auth_debug_authorize_hostname", "_auth_debug_redirect_uri", "_auth_debug_client_id_present", "_auth_debug_code_challenge_present"] as const).map((k) => (
                <Row key={k} label={k} value={values[k]} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Callback values */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Written on callback (in SsoCallback first render)
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#18181b", borderRadius: 8, overflow: "hidden" }}>
            <tbody>
              {(["_auth_debug_callback_at", "_auth_debug_callback_url", "_auth_debug_callback_search", "_auth_debug_callback_code_present", "_auth_debug_callback_error_present"] as const).map((k) => (
                <Row key={k} label={k} value={values[k]} />
              ))}
            </tbody>
          </table>
        </div>

        {/* codeVerifier backup */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            PKCE codeVerifier backup (cleared after callback exchange)
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#18181b", borderRadius: 8, overflow: "hidden" }}>
            <tbody>
              <Row label="_wos_cv_bk" value={values["_wos_cv_bk"]} />
            </tbody>
          </table>
          <p style={{ color: "#52525b", fontSize: 11, marginTop: 6 }}>
            This key is cleared after a successful exchange. If it's present after a failed attempt, the backup survived but the exchange still failed.
            If it's missing after a failed attempt, the backup was wiped (Safari ITP).
          </p>
        </div>

        {/* Clear button */}
        <button
          style={{ background: "#27272a", color: "#a1a1aa", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}
          onClick={() => {
            try {
              for (const key of DEBUG_KEYS) window.localStorage.removeItem(key);
            } catch { /* ignore */ }
            window.location.reload();
          }}
        >
          Clear all debug values and reload
        </button>
      </div>
    </div>
  );
}
