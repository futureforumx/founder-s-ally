/**
 * TEMPORARY debug page — remove before shipping.
 * Visit /debug/env to see which env vars are baked into this build.
 *
 * Note: only VITE_* variables (and a few explicitly `define`d ones from vite.config.ts)
 * are available in the browser bundle. Server-only vars like WORKOS_API_KEY are never
 * included in the bundle by design — only their existence is checked server-side at
 * build time via the `define` block.
 */

import {
  resolveWorkOSClientId,
  resolveWorkOSRedirectUri,
  resolveWorkOSDevMode,
  resolveWorkOSApiHostname,
} from "@/lib/workosConfig";

function Row({ label, value, secret }: { label: string; value: string | boolean | undefined; secret?: boolean }) {
  const display =
    secret
      ? "(not exposed to browser — server-side only)"
      : value === undefined || value === ""
      ? "(not set)"
      : String(value);

  const color =
    secret
      ? "#6b7280"
      : value === undefined || value === ""
      ? "#ef4444"
      : "#22c55e";

  return (
    <tr>
      <td style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 13, color: "#e4e4e7", whiteSpace: "nowrap" }}>
        {label}
      </td>
      <td style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 13, color }}>
        {display}
      </td>
    </tr>
  );
}

export default function DebugEnvPage() {
  const clientId = resolveWorkOSClientId();
  const redirectUri = resolveWorkOSRedirectUri();
  const devMode = resolveWorkOSDevMode();
  const apiHostname = resolveWorkOSApiHostname();

  // Raw baked-in values (via vite.config.ts `define` block — reads VITE_ or non-VITE_ at build time)
  const rawClientId = String(import.meta.env.VITE_WORKOS_CLIENT_ID ?? "");
  const rawRedirectUri = String(import.meta.env.VITE_WORKOS_REDIRECT_URI ?? "");
  const rawApiHostname = String(import.meta.env.VITE_WORKOS_API_HOSTNAME ?? "");
  const rawAuthProvider = String(import.meta.env.VITE_AUTH_PROVIDER ?? "");
  const vercelEnv = String(import.meta.env.VITE_VERCEL_ENV ?? "");

  const sections: Array<{ heading: string; rows: Array<{ label: string; value?: string | boolean; secret?: boolean }> }> = [
    {
      heading: "WorkOS config (resolved at runtime)",
      rows: [
        { label: "resolveWorkOSClientId()", value: clientId || undefined },
        { label: "resolveWorkOSRedirectUri()", value: redirectUri },
        { label: "resolveWorkOSDevMode()", value: String(devMode) },
        { label: "resolveWorkOSApiHostname()", value: apiHostname },
      ],
    },
    {
      heading: "Baked-in env vars (import.meta.env.*)",
      rows: [
        { label: "VITE_WORKOS_CLIENT_ID", value: rawClientId || undefined },
        { label: "VITE_WORKOS_REDIRECT_URI", value: rawRedirectUri || undefined },
        { label: "VITE_WORKOS_API_HOSTNAME", value: rawApiHostname || undefined },
        { label: "VITE_AUTH_PROVIDER", value: rawAuthProvider || undefined },
        { label: "VITE_VERCEL_ENV", value: vercelEnv || undefined },
      ],
    },
    {
      heading: "Server-only vars (never in browser bundle)",
      rows: [
        { label: "WORKOS_API_KEY", secret: true },
        { label: "APP_URL / VITE_APP_URL", secret: true },
      ],
    },
    {
      heading: "Runtime browser context",
      rows: [
        { label: "window.location.origin", value: typeof window !== "undefined" ? window.location.origin : undefined },
        { label: "window.location.hostname", value: typeof window !== "undefined" ? window.location.hostname : undefined },
      ],
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", padding: "40px 24px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ color: "#f59e0b", fontSize: 12, marginBottom: 4 }}>
          ⚠ TEMPORARY DEBUG PAGE — remove before shipping
        </p>
        <h1 style={{ color: "#f4f4f5", fontSize: 22, fontWeight: 700, marginBottom: 32 }}>
          /debug/env
        </h1>

        {sections.map((section) => (
          <div key={section.heading} style={{ marginBottom: 32 }}>
            <p style={{ color: "#a1a1aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              {section.heading}
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#18181b", borderRadius: 8, overflow: "hidden" }}>
              <tbody>
                {section.rows.map((row) => (
                  <Row key={row.label} label={row.label} value={row.value} secret={row.secret} />
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <p style={{ color: "#52525b", fontSize: 12, marginTop: 16 }}>
          Note: <code style={{ color: "#71717a" }}>WORKOS_CLIENT_ID</code> and{" "}
          <code style={{ color: "#71717a" }}>WORKOS_REDIRECT_URI</code> (without VITE_ prefix) are also
          read at build time by <code style={{ color: "#71717a" }}>vite.config.ts</code> and baked in
          as <code style={{ color: "#71717a" }}>VITE_WORKOS_CLIENT_ID</code> /{" "}
          <code style={{ color: "#71717a" }}>VITE_WORKOS_REDIRECT_URI</code> — so setting either form
          in Vercel env vars works.
        </p>
      </div>
    </div>
  );
}
