/**
 * TEMPORARY diagnostic page — remove before shipping.
 * Visit /debug/auth-proof after a login attempt to see exactly what happened.
 *
 * Reads all _auth_debug_* keys from localStorage and displays them.
 */

const DEBUG_KEYS = [
  // Written synchronously in Auth.tsx button onClick — before SDK signIn()
  "_auth_debug_clicked_at",
  "_auth_debug_preRedirect_href",
  // Written by window.location.assign intercept — EXACT URL sent to WorkOS
  "_auth_debug_authorize_hostname",
  "_auth_debug_authorize_client_id",
  "_auth_debug_authorize_redirect_uri",
  "_auth_debug_authorize_url",
  // Written in main.tsx BEFORE React renders — ground truth of what WorkOS sent
  "_auth_debug_mainjs_at",
  "_auth_debug_mainjs_href",
  "_auth_debug_mainjs_search",
  // Written by SsoCallback.tsx — when callback page first renders
  "_auth_debug_callback_at",
  "_auth_debug_callback_url",
  "_auth_debug_callback_search",
  "_auth_debug_callback_code_present",
  "_auth_debug_callback_error_present",
] as const;

function Row({ label, value }: { label: string; value: string | null }) {
  const missing = value === null || value === "";
  const display = value ?? "(missing)";
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

function elapsedBetween(a: string | null, b: string | null): string {
  if (!a || !b) return "(unavailable)";
  try {
    const ms = new Date(b).getTime() - new Date(a).getTime();
    if (isNaN(ms)) return "(unavailable)";
    return `${(ms / 1000).toFixed(1)}s`;
  } catch {
    return "(unavailable)";
  }
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

  const clicked = Boolean(values["_auth_debug_clicked_at"]);
  const mainjsSearch = values["_auth_debug_mainjs_search"];
  const mainjsHadCode = Boolean(mainjsSearch && mainjsSearch !== "(empty)" && mainjsSearch.includes("code="));
  const callbackLanded = Boolean(values["_auth_debug_callback_at"]);
  const codePresent = values["_auth_debug_callback_code_present"];
  const errorPresent = values["_auth_debug_callback_error_present"];
  const elapsed = elapsedBetween(values["_auth_debug_clicked_at"], values["_auth_debug_callback_at"]);

  let diagnosis = "";
  let diagColor = "#a1a1aa";

  if (!clicked) {
    diagnosis = "❌ Login button onClick never fired — no _auth_debug_clicked_at written. Check for JS errors on the /login page preventing the button from rendering.";
    diagColor = "#ef4444";
  } else if (!callbackLanded) {
    diagnosis = "❌ SDK signIn() was called but /auth never loaded. WorkOS did not redirect back. Check the redirect URI allowlist in the WorkOS dashboard for this client ID.";
    diagColor = "#ef4444";
  } else if (mainjsHadCode && codePresent !== "true") {
    diagnosis = "🔴 RACE: main.tsx saw ?code= on load, but SsoCallback saw none. The SDK's history.replaceState stripped the URL before SsoCallback's first render.";
    diagColor = "#ef4444";
  } else if (codePresent === "true") {
    diagnosis = "✅ /auth received ?code= — SDK exchange should have run. Check browser console for [auth] onRedirectCallback or exchange errors.";
    diagColor = "#22c55e";
  } else if (errorPresent === "true") {
    diagnosis = "⚠️ WorkOS returned ?error= — see _auth_debug_callback_url for the error value.";
    diagColor = "#f97316";
  } else if (mainjsSearch === "(empty)") {
    diagnosis = "❌ WorkOS redirected to /auth with zero query params (confirmed by main.tsx ground-truth). This is a WorkOS-side issue: the AuthKit application for this client ID has no sign-in methods configured, or the redirect URI is not allowlisted in the WorkOS dashboard.";
    diagColor = "#ef4444";
  } else {
    diagnosis = `❌ Callback landed with no ?code= and no ?error=. main.tsx saw: "${mainjsSearch ?? "(no capture — trigger a fresh attempt)"}".`;
    diagColor = "#ef4444";
  }

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", padding: "40px 24px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <p style={{ color: "#f59e0b", fontSize: 12, marginBottom: 4 }}>⚠ TEMPORARY DIAGNOSTIC PAGE — remove before shipping</p>
        <h1 style={{ color: "#f4f4f5", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>/debug/auth-proof</h1>
        <p style={{ color: "#71717a", fontSize: 13, marginBottom: 8 }}>
          Login flow: Auth.tsx button → SDK <code style={{ color: "#a1a1aa" }}>signIn()</code> → api.workos.com → /auth?code= → SsoCallback → /
        </p>
        <p style={{ color: "#71717a", fontSize: 13, marginBottom: 32 }}>
          Open this page after a login attempt. Values persist across the WorkOS round-trip via localStorage.
        </p>

        {/* Diagnosis */}
        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "14px 16px", marginBottom: 32 }}>
          <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Diagnosis</p>
          <p style={{ color: diagColor, fontSize: 13, margin: 0 }}>{diagnosis}</p>
          {elapsed !== "(unavailable)" && (
            <p style={{ color: "#71717a", fontSize: 11, marginTop: 8, marginBottom: 0 }}>Time spent at WorkOS: {elapsed}</p>
          )}
        </div>

        {/* Button click + departure */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Step 1 — button click (Auth.tsx onClick, synchronous)
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#18181b", borderRadius: 8, overflow: "hidden" }}>
            <tbody>
              {(["_auth_debug_clicked_at", "_auth_debug_preRedirect_href"] as const).map((k) => (
                <Row key={k} label={k} value={values[k]} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Authorize URL — what SDK actually sent to WorkOS */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Step 1b — authorize URL (intercepted from SDK before redirect)
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#18181b", borderRadius: 8, overflow: "hidden" }}>
            <tbody>
              {(["_auth_debug_authorize_hostname", "_auth_debug_authorize_client_id", "_auth_debug_authorize_redirect_uri", "_auth_debug_authorize_url"] as const).map((k) => (
                <Row key={k} label={k} value={values[k]} />
              ))}
            </tbody>
          </table>
          <p style={{ color: "#52525b", fontSize: 11, marginTop: 6 }}>
            _auth_debug_authorize_client_id should be client_01KPVXV8TX9P50WV1J795J51F4 (production).
            <br />
            _auth_debug_authorize_redirect_uri should be https://vekta.so/auth (no trailing slash).
            <br />
            If these are wrong, the Vercel env var is still stale — hard-refresh and try again.
          </p>
        </div>

        {/* Ground-truth main.tsx capture */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Step 2 — /auth page load (main.tsx, before React + SDK run)
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#18181b", borderRadius: 8, overflow: "hidden" }}>
            <tbody>
              {(["_auth_debug_mainjs_at", "_auth_debug_mainjs_href", "_auth_debug_mainjs_search"] as const).map((k) => (
                <Row key={k} label={k} value={values[k]} />
              ))}
            </tbody>
          </table>
          <p style={{ color: "#52525b", fontSize: 11, marginTop: 6 }}>
            _auth_debug_mainjs_search = "(empty)" → WorkOS sent no params → WorkOS config issue, not client-side code.
            <br />
            _auth_debug_mainjs_search contains "code=" → code arrived but was stripped by SDK before SsoCallback rendered.
          </p>
        </div>

        {/* SsoCallback values */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Step 3 — SsoCallback first render
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#18181b", borderRadius: 8, overflow: "hidden" }}>
            <tbody>
              {(["_auth_debug_callback_at", "_auth_debug_callback_url", "_auth_debug_callback_search", "_auth_debug_callback_code_present", "_auth_debug_callback_error_present"] as const).map((k) => (
                <Row key={k} label={k} value={values[k]} />
              ))}
            </tbody>
          </table>
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
