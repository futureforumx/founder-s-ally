/**
 * TEMPORARY debug page - remove before shipping.
 * Visit /debug/env to see which env vars are baked into this build.
 */

function Row({ label, value, secret }: { label: string; value: string | boolean | undefined; secret?: boolean }) {
  const display =
    secret
      ? "(not exposed to browser - server-side only)"
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
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "");
  const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");
  const legacyAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");
  const authProvider = String(import.meta.env.VITE_AUTH_PROVIDER ?? "supabase");
  const vercelEnv = String(import.meta.env.VITE_VERCEL_ENV ?? "");

  const sections: Array<{ heading: string; rows: Array<{ label: string; value?: string | boolean; secret?: boolean }> }> = [
    {
      heading: "Supabase auth config",
      rows: [
        { label: "VITE_SUPABASE_URL", value: supabaseUrl || undefined },
        { label: "VITE_SUPABASE_PUBLISHABLE_KEY", value: publishableKey ? "(set)" : undefined },
        { label: "VITE_SUPABASE_ANON_KEY", value: legacyAnonKey ? "(set)" : undefined },
        { label: "VITE_AUTH_PROVIDER", value: authProvider || undefined },
        { label: "VITE_VERCEL_ENV", value: vercelEnv || undefined },
      ],
    },
    {
      heading: "Server-only vars (never in browser bundle)",
      rows: [
        { label: "SUPABASE_SERVICE_ROLE_KEY", secret: true },
        { label: "SUPABASE_URL", secret: true },
      ],
    },
    {
      heading: "Runtime browser context",
      rows: [
        { label: "window.location.origin", value: typeof window !== "undefined" ? window.location.origin : undefined },
        { label: "window.location.hostname", value: typeof window !== "undefined" ? window.location.hostname : undefined },
        { label: "auth callback URL", value: typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined },
      ],
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", padding: "40px 24px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ color: "#f59e0b", fontSize: 12, marginBottom: 4 }}>
          TEMPORARY DEBUG PAGE - remove before shipping
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
      </div>
    </div>
  );
}
