import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { resolveFirmWebsiteContact } from "./api/_firmWebsiteContact";
import { resolveFirmWebsiteThemes } from "./api/_firmWebsiteThemes";
import { resolveFirmWebsiteTeam } from "./api/_firmWebsiteTeam";
import { resolvePersonWebsiteProfile } from "./api/_personWebsiteProfile";
import { handleFirmWebsiteHqPost } from "./api/handleFirmWebsiteHqPost";
import { mirrorFirmInvestorHeadshotsForFirm, supabaseAdminForMirror } from "./api/_mirrorFirmInvestorHeadshots";
import { fetchProxiedExternalImage, parseProxyTargetUrl } from "./api/_proxyExternalImage";
import { ensureFirmElevatorPitchSaved, supabaseAdminForElevatorPitch } from "./api/_ensureFirmElevatorPitch";
import { buildGoogleOAuthStartResponse } from "./api/oauth/_googleStartLogic";
import { buildGoogleOAuthCallbackResponse } from "./api/oauth/_googleCallbackLogic";
import { runLinkedinCsvUpload } from "./api/connectors/_linkedinUploadLogic";
import { runGoogleDisconnect } from "./api/connectors/_googleDisconnectLogic";
import { runGoogleResync } from "./api/connectors/_googleResyncLogic";
import { runLinkedinCsvDisconnect } from "./api/connectors/_linkedinDisconnectLogic";

function freshCapitalStandaloneDevPlugin() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fresh Capital</title>
    <style>
      :root {
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(61,180,242,0.22), transparent 32%),
          radial-gradient(circle at top right, rgba(16,185,129,0.18), transparent 28%),
          linear-gradient(135deg, #050505 0%, #0b0f14 45%, #050505 100%);
        color: #f5f5f5;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        max-width: 1080px;
        margin: 0 auto;
        padding: 56px 24px 80px;
      }
      .eyebrow {
        margin: 0 0 12px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #67e8f9;
      }
      h1 {
        margin: 0;
        font-size: clamp(38px, 6vw, 68px);
        line-height: 0.96;
        letter-spacing: -0.04em;
      }
      .lede {
        max-width: 760px;
        margin: 18px 0 0;
        font-size: 18px;
        line-height: 1.65;
        color: #d4d4d8;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 28px;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 9999px;
        text-decoration: none;
        font-size: 14px;
        font-weight: 700;
      }
      .button-primary {
        background: white;
        color: #050505;
      }
      .button-secondary {
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
      }
      .panel {
        margin-top: 48px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 28px;
        background: rgba(0,0,0,0.6);
        box-shadow: 0 24px 80px rgba(0,0,0,0.35);
        overflow: hidden;
      }
      .panel-head {
        padding: 24px 24px 0;
      }
      .panel-title {
        margin: 0;
        font-size: 13px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #a1a1aa;
      }
      .panel-body {
        padding: 24px;
      }
      .feed-card {
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 22px;
        padding: 28px;
        background: #050505;
      }
      .feed-card strong {
        color: white;
      }
      .sections {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 22px;
      }
      .section {
        border-radius: 22px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        padding: 20px;
      }
      .section h2 {
        margin: 0 0 10px;
        font-size: 18px;
      }
      .section p {
        margin: 0;
        color: #d4d4d8;
        line-height: 1.6;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Fresh Capital</p>
      <h1>See which investors just raised fresh capital</h1>
      <p class="lede">
        This standalone dev page bypasses the app shell and WorkOS entirely so the route stays available while the main
        React implementation is repaired.
      </p>
      <div class="actions">
        <a class="button button-primary" href="/access">Get full access</a>
        <a class="button button-secondary" href="/">Back home</a>
      </div>

      <section class="panel">
        <div class="panel-head">
          <p class="panel-title">Live Intelligence</p>
        </div>
        <div class="panel-body">
          <div class="feed-card">
            <p style="margin:0;font-size:18px;line-height:1.65;color:#d4d4d8;">
              <strong>The Fresh Capital route is now hard-isolated in dev.</strong> If you can see this page, the URL is working
              and auth redirects are no longer able to hijack <code>/fresh-capital</code> during local development.
            </p>
          </div>
          <div class="sections">
            <article class="section">
              <h2>Why This Matters</h2>
              <p>Investors are most responsive right after raising a new fund. Timing matters.</p>
            </article>
            <article class="section">
              <h2>Inside Vekta</h2>
              <p>We’re keeping this page stable first, then restoring the richer live feed safely.</p>
            </article>
            <article class="section">
              <h2>Status</h2>
              <p>The standalone route is active only in dev and is meant to prevent this failure mode from blocking you again.</p>
            </article>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`;
  const redirectHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=/fresh-capital" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Redirecting…</title>
  </head>
  <body style="font-family: system-ui, sans-serif; padding: 24px;">
    <p>Redirecting to <a href="/fresh-capital">/fresh-capital</a>…</p>
  </body>
</html>`;

  return {
    name: "fresh-capital-standalone-dev",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || "/";
        // /fresh-capital is now a real React page — let Vite serve index.html normally.
        // (static HTML bypass removed; main.tsx bootstrapFreshCapital() handles the route)
        if (
          req.method === "GET" &&
          (
            url === "/auth" ||
            url.startsWith("/auth?") ||
            url === "/auth/" ||
            url === "/login" ||
            url.startsWith("/login?") ||
            url === "/login/"
          )
        ) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(redirectHtml);
          return;
        }
        next();
      });
    },
  };
}

/**
 * Vite dev-server plugin: intercepts POST /api/save-profile so `npm run dev`
 * works the same as the deployed Vercel serverless function.
 * Uses SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY from the shell environment (.env.local).
 */
function connectorsOauthDevPlugin() {
  return {
    name: "connectors-oauth-dev",
    configureServer(server: any) {
      async function readDevPostJson(req: any): Promise<Record<string, unknown>> {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        await new Promise((r) => req.on("end", r));
        try {
          const raw = Buffer.concat(chunks).toString("utf8").trim();
          return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          return {};
        }
      }

      const postJsonCors: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
      };

      function mountConnectorPostJson(
        routePath: string,
        runner: (input: { authorization: string | undefined; owner_context_id: string | undefined }) => Promise<{
          status: number;
          json: Record<string, unknown>;
        }>,
      ) {
        server.middlewares.use(routePath, async (req: any, res: any) => {
          if (req.method === "OPTIONS") {
            res.writeHead(204, postJsonCors);
            res.end();
            return;
          }
          if (req.method !== "POST") {
            res.writeHead(405, postJsonCors);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const body = await readDevPostJson(req);
          const owner_context_id = typeof body.owner_context_id === "string" ? body.owner_context_id : undefined;
          const auth = req.headers.authorization;
          const out = await runner({
            authorization: typeof auth === "string" ? auth : undefined,
            owner_context_id,
          });
          res.writeHead(out.status, postJsonCors);
          res.end(JSON.stringify(out.json));
        });
      }

      mountConnectorPostJson("/api/connectors/google/disconnect", runGoogleDisconnect);
      mountConnectorPostJson("/api/connectors/google/resync", runGoogleResync);
      mountConnectorPostJson("/api/connectors/linkedin/disconnect", runLinkedinCsvDisconnect);

      server.middlewares.use("/api/oauth/google/start", async (req: any, res: any) => {
        const corsBase: Record<string, string> = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        };
        if (req.method === "OPTIONS") {
          res.writeHead(204, corsBase);
          res.end();
          return;
        }
        const host = (req.headers.host as string) || "localhost";
        const u = new URL(req.url || "/", `http://${host}`);
        const auth = req.headers.authorization;
        const r = await buildGoogleOAuthStartResponse({
          method: req.method || "GET",
          connector: u.searchParams.get("connector") || undefined,
          owner_context_id: u.searchParams.get("owner_context_id") || undefined,
          authorization: typeof auth === "string" ? auth : undefined,
        });
        if (r.kind === "redirect") {
          res.writeHead(302, { ...corsBase, Location: r.location, "Cache-Control": "no-store" });
          res.end();
          return;
        }
        res.writeHead(r.status, { ...corsBase, "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(r.body));
      });

      server.middlewares.use("/api/oauth/google/callback", async (req: any, res: any) => {
        const host = (req.headers.host as string) || "localhost";
        const u = new URL(req.url || "/", `http://${host}`);
        const r = await buildGoogleOAuthCallbackResponse({
          method: req.method || "GET",
          code: u.searchParams.get("code") || undefined,
          state: u.searchParams.get("state") || undefined,
          error: u.searchParams.get("error") || undefined,
        });
        res.writeHead(302, { Location: r.location, "Cache-Control": "no-store" });
        res.end();
      });

      server.middlewares.use("/api/connectors/linkedin/upload", async (req: any, res: any) => {
        const cors: Record<string, string> = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
        };
        if (req.method === "OPTIONS") {
          res.writeHead(204, cors);
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const auth = req.headers.authorization;
        try {
          const out = await runLinkedinCsvUpload(req, typeof auth === "string" ? auth : undefined);
          res.writeHead(out.status, cors);
          res.end(JSON.stringify(out.json));
        } catch (e) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "upload failed" }));
        }
      });
    },
  };
}

function saveProfileDevPlugin(env: Record<string, string>) {
  return {
    name: "save-profile-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/save-profile", async (req, res) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          res.writeHead(200, cors);
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        // Read body
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        await new Promise((r) => req.on("end", r));
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* ok */ }

        // Get user ID from WorkOS JWT (decode sub without verification for dev convenience)
        const authHeader = (req.headers.authorization ?? "") as string;
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        if (!token) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "Missing bearer token" }));
          return;
        }

        let userId: string | null = null;
        try {
          const parts = token.split(".");
          if (parts.length >= 2) {
            let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            while (b64.length % 4) b64 += "=";
            const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
            userId = typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
          }
        } catch { /* ok */ }

        // Body _uid as fallback hint
        const bodyUid = typeof body._uid === "string" ? body._uid.trim() : "";
        if (!userId && bodyUid) userId = bodyUid;

        if (!userId) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "Could not extract user ID from token" }));
          return;
        }

        // Write to Supabase with service role key
        const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" }));
          return;
        }

        const ALLOWED = ["full_name","title","bio","location","avatar_url","linkedin_url","twitter_url","user_type","resume_url"];
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of ALLOWED) if (k in body && body[k] !== undefined) patch[k] = body[k];

        // Check if row exists
        const sel = await fetch(
          `${supabaseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        const rows = sel.ok ? await sel.json() : [];
        const exists = Array.isArray(rows) && rows.length > 0;

        let dbRes: Response;
        if (exists) {
          dbRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`,
            {
              method: "PATCH",
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify(patch),
            },
          );
        } else {
          dbRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
            method: "POST",
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ user_id: userId, full_name: "", user_type: "founder", is_public: true, ...patch }),
          });
        }

        if (!dbRes.ok) {
          const errText = await dbRes.text();
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: `DB write failed (${dbRes.status}): ${errText}` }));
          return;
        }

        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true }));
      });
    },
  };
}

function firmWebsiteContactDevPlugin() {
  return {
    name: "firm-website-contact-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/firm-website-contact", async (req, res) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          res.writeHead(200, cors);
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        await new Promise((r) => req.on("end", r));
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* ok */ }

        const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
        if (!websiteUrl) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "websiteUrl is required" }));
          return;
        }

        try {
          const contact = await resolveFirmWebsiteContact(websiteUrl);
          res.writeHead(200, cors);
          res.end(JSON.stringify(contact));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Contact lookup failed" }));
        }
      });
    },
  };
}

function firmWebsiteThemesDevPlugin() {
  return {
    name: "firm-website-themes-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/firm-website-themes", async (req, res) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          res.writeHead(200, cors);
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        await new Promise((r) => req.on("end", r));
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* ok */ }

        const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
        if (!websiteUrl) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "websiteUrl is required" }));
          return;
        }

        try {
          const out = await resolveFirmWebsiteThemes(websiteUrl);
          res.writeHead(200, cors);
          res.end(JSON.stringify(out));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Theme lookup failed" }));
        }
      });
    },
  };
}

function firmWebsiteTeamDevPlugin() {
  return {
    name: "firm-website-team-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/firm-website-team", async (req, res) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          res.writeHead(200, cors);
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        await new Promise((r) => req.on("end", r));
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* ok */ }

        const websiteUrl = typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : "";
        if (!websiteUrl) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "websiteUrl is required" }));
          return;
        }

        try {
          const { people, teamMemberEstimate } = await resolveFirmWebsiteTeam(websiteUrl);
          res.writeHead(200, cors);
          res.end(JSON.stringify({ people, teamMemberEstimate }));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Team lookup failed" }));
        }
      });
    },
  };
}

function firmWebsiteHqDevPlugin() {
  return {
    name: "firm-website-hq-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/firm-website-hq", async (req, res) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          res.writeHead(200, cors);
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        await new Promise((r) => req.on("end", r));
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* ok */ }

        const firmWebsiteUrl = typeof body.firmWebsiteUrl === "string" ? body.firmWebsiteUrl.trim() : "";
        if (!firmWebsiteUrl) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "firmWebsiteUrl is required" }));
          return;
        }

        try {
          const out = await handleFirmWebsiteHqPost(body);
          res.writeHead(200, cors);
          res.end(JSON.stringify(out));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "HQ lookup failed" }));
        }
      });
    },
  };
}

function proxyExternalImageDevPlugin() {
  return {
    name: "proxy-external-image-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/proxy-external-image", async (req: any, res: any) => {
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
          });
          res.end();
          return;
        }
        if (req.method !== "GET") {
          res.writeHead(405, { "Content-Type": "text/plain" });
          res.end("Method not allowed");
          return;
        }
        try {
          const full = new URL(req.url ?? "", "http://dev.local");
          const rawU = full.searchParams.get("u") ?? "";
          let decoded: string;
          try {
            decoded = decodeURIComponent(rawU);
          } catch {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Bad u param");
            return;
          }
          const target = parseProxyTargetUrl(decoded);
          if (!target) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("URL not allowed");
            return;
          }
          const out = await fetchProxiedExternalImage(target);
          if (!out.ok) {
            res.writeHead(out.status, { "Content-Type": "text/plain" });
            res.end(out.message);
            return;
          }
          res.writeHead(200, {
            "Content-Type": out.contentType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(out.body);
        } catch (error) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(error instanceof Error ? error.message : "Proxy error");
        }
      });
    },
  };
}

function mirrorFirmInvestorHeadshotsDevPlugin() {
  return {
    name: "mirror-firm-investor-headshots-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/mirror-firm-investor-headshots", async (req, res) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          res.writeHead(200, cors);
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        await new Promise((r) => req.on("end", r));
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* ok */ }

        const firmRecordId = typeof body.firmRecordId === "string" ? body.firmRecordId.trim() : "";
        if (!firmRecordId || !/^[0-9a-f-]{36}$/i.test(firmRecordId)) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "firmRecordId (uuid) is required" }));
          return;
        }

        const admin = supabaseAdminForMirror();
        if (!admin) {
          res.writeHead(200, cors);
          res.end(
            JSON.stringify({
              configured: false,
              firmRecordId,
              candidates: 0,
              mirrored: 0,
              failed: 0,
              message: "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not set",
            }),
          );
          return;
        }

        try {
          const result = await mirrorFirmInvestorHeadshotsForFirm(admin, firmRecordId);
          res.writeHead(200, cors);
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Mirror failed" }));
        }
      });
    },
  };
}

function ensureFirmElevatorPitchDevPlugin() {
  return {
    name: "ensure-firm-elevator-pitch-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/ensure-firm-elevator-pitch", async (req: any, res: any) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          res.writeHead(200, cors);
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        await new Promise((r) => req.on("end", r));
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          /* ok */
        }

        const firmRecordId = typeof body.firmRecordId === "string" ? body.firmRecordId.trim() : "";
        if (!firmRecordId || !/^[0-9a-f-]{36}$/i.test(firmRecordId)) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "firmRecordId (uuid) is required" }));
          return;
        }

        const admin = supabaseAdminForElevatorPitch();
        if (!admin) {
          res.writeHead(200, cors);
          res.end(
            JSON.stringify({
              ok: false,
              updated: false,
              firmRecordId,
              message: "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not set",
            }),
          );
          return;
        }

        try {
          const result = await ensureFirmElevatorPitchSaved(admin, firmRecordId);
          const status = !result.ok ? (result.message === "Firm not found" ? 404 : 500) : 200;
          res.writeHead(status, cors);
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(
            JSON.stringify({
              ok: false,
              updated: false,
              firmRecordId,
              error: error instanceof Error ? error.message : "ensure pitch failed",
            }),
          );
        }
      });
    },
  };
}

function personWebsiteProfileDevPlugin() {
  return {
    name: "person-website-profile-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/person-website-profile", async (req, res) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          res.writeHead(200, cors);
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        await new Promise((r) => req.on("end", r));
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* ok */ }

        const firmWebsiteUrl = typeof body.firmWebsiteUrl === "string" ? body.firmWebsiteUrl.trim() : "";
        const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
        const title = typeof body.title === "string" ? body.title.trim() : null;

        if (!firmWebsiteUrl || !fullName) {
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "firmWebsiteUrl and fullName are required" }));
          return;
        }

        try {
          const profile = await resolvePersonWebsiteProfile({ firmWebsiteUrl, fullName, title });
          res.writeHead(200, cors);
          res.end(JSON.stringify(profile));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Profile lookup failed" }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  // Load ALL env vars (including non-VITE_ server-only vars) for use in plugins/middleware
  const env = loadEnv(mode, process.cwd(), "");
  // Dev API middleware (`/api/firm-website-team`, etc.) reads `process.env` — merge loaded files
  // so `.env.local` CF_R2_* / Supabase keys match production (Vercel injects those automatically).
  for (const [key, value] of Object.entries(env)) {
    if (value === "" || value == null) continue;
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
  const plugins = [
    react(),
    mode === "development" && freshCapitalStandaloneDevPlugin(),
    mode === "development" && componentTagger(),
    mode === "development" && saveProfileDevPlugin(env),
    mode === "development" && connectorsOauthDevPlugin(),
    mode === "development" && firmWebsiteContactDevPlugin(),
    mode === "development" && firmWebsiteThemesDevPlugin(),
    mode === "development" && firmWebsiteTeamDevPlugin(),
    mode === "development" && firmWebsiteHqDevPlugin(),
    mode === "development" && proxyExternalImageDevPlugin(),
    mode === "development" && mirrorFirmInvestorHeadshotsDevPlugin(),
    mode === "development" && ensureFirmElevatorPitchDevPlugin(),
    mode === "development" && personWebsiteProfileDevPlugin(),
  ].filter(Boolean);
  const enableHttps = process.env.DEV_HTTPS === "true";
  const devHost = process.env.DEV_HOST || "localhost";
  const devPort = Number(process.env.DEV_PORT || "5173");

  if (enableHttps) {
    try {
      const { default: basicSsl } = await import("@vitejs/plugin-basic-ssl");
      plugins.splice(1, 0, basicSsl());
    } catch {
      // Allow local dev to run even when the optional SSL plugin is not installed.
    }
  }

  const vercelEnv = process.env.VERCEL_ENV ?? "";

  return {
    /** Clerk preview deploys: expose Vercel’s deployment kind at build time (production | preview | development). */
    define: {
      "import.meta.env.VITE_VERCEL_ENV": JSON.stringify(vercelEnv),
    },
    server: {
      // Use an explicit localhost host so VS Code browser previews have a stable URL on macOS.
      host: devHost,
      port: devPort,
      strictPort: false,
      open: false,
      hmr: {
        overlay: false,
      },
    },
    // Listen on all interfaces so `vite preview`, Cursor/VS Code “Simple Browser”, and LAN devices can open the URL.
    preview: {
      host: true,
      port: devPort,
      strictPort: false,
      open: false,
    },
    plugins,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;

            if (id.includes("pdfjs-dist")) return "pdf";
            if (id.includes("@react-three/drei")) return "three-drei";
            if (id.includes("@react-three/fiber")) return "three-fiber";
            if (id.match(/\/node_modules\/three\//)) return "three-core";
            if (id.includes("react-dom") || id.includes("react-router") || id.includes("react/jsx-runtime") || id.match(/\/node_modules\/react\//)) {
              return "react-vendor";
            }
            if (id.includes("framer-motion")) return "framer-motion";
            if (id.includes("@radix-ui/")) return "radix";
            if (id.includes("@supabase/") || id.includes("@auth0/")) return "auth-data";
            if (id.includes("@tanstack/react-query")) return "query";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "@radix-ui/react-progress"],
    },
  };
});
