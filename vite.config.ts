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
import { createClient } from "@supabase/supabase-js";
import { ensureAppUserRows } from "./api/_ensureAppUser";
import { getClerkUserIdFromAuthHeader } from "./api/_clerkFromRequest";
import {
  deleteR2UserAsset,
  parseMultipartAsset,
  parseR2StoredValue,
  r2ConfiguredFor,
  signedR2PitchDeckUrl,
  uploadR2UserAsset,
} from "./api/_r2UserAssets";
import { readJsonBody } from "./api/_readJsonBody";

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

        const supabaseUrl =
          env.SUPABASE_URL ||
          env.VITE_SUPABASE_URL ||
          process.env.SUPABASE_URL ||
          process.env.VITE_SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

        const authHeader = (req.headers.authorization ?? "") as string;
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        if (!token) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "Missing bearer token" }));
          return;
        }

        let userId: string | null = null;
        if (supabaseUrl && serviceKey) {
          try {
            const admin = createClient(supabaseUrl, serviceKey, {
              auth: { persistSession: false, autoRefreshToken: false },
            });
            const {
              data: { user },
            } = await admin.auth.getUser(token);
            if (user?.id) userId = user.id;
          } catch {
            /* fall through */
          }
        }
        if (!userId) {
          try {
            const parts = token.split(".");
            if (parts.length >= 2) {
              let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
              while (b64.length % 4) b64 += "=";
              const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
              userId = typeof payload.sub === "string" ? payload.sub : null;
            }
          } catch {
            /* ok */
          }
        }

        const bodyUid = typeof body._uid === "string" ? body._uid.trim() : "";
        if (!userId && bodyUid) userId = bodyUid;

        const looksLikeClerk = userId ? /^user_[A-Za-z0-9]{20,}$/.test(userId) : false;
        const looksLikeUuid = userId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) : false;
        if (!userId || (!looksLikeClerk && !looksLikeUuid)) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "Could not verify Supabase session or valid user id" }));
          return;
        }

        if (!supabaseUrl || !serviceKey) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" }));
          return;
        }

        const ALLOWED = [
          "full_name",
          "title",
          "bio",
          "location",
          "avatar_url",
          "linkedin_url",
          "twitter_url",
          "user_type",
          "resume_url",
          "company_id",
          "has_completed_onboarding",
          "has_seen_settings_tour",
        ];
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

function ensureUserDevPlugin(env: Record<string, string>) {
  return {
    name: "ensure-user-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/ensure-user", async (req: any, res: any) => {
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
          res.writeHead(400, cors);
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }

        const authHeader = (req.headers.authorization ?? "") as string;
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

        let userId: string | null = null;
        if (token) {
          try {
            const parts = token.split(".");
            if (parts.length >= 2) {
              let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
              while (b64.length % 4) b64 += "=";
              const pl = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
              if (typeof pl.sub === "string" && pl.sub.length > 0) userId = pl.sub;
            }
          } catch {
            /* ok */
          }
        }
        if (!userId) {
          const hint = typeof body._uid === "string" ? body._uid.trim() : "";
          if (hint.length > 0) userId = hint;
        }

        if (!userId) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "Missing bearer token or valid user ID" }));
          return;
        }

        const supabaseUrl =
          env.SUPABASE_URL ||
          env.VITE_SUPABASE_URL ||
          process.env.SUPABASE_URL ||
          process.env.VITE_SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" }));
          return;
        }

        const email = typeof body.email === "string" ? body.email.trim() : null;
        const displayName = typeof body.display_name === "string" ? body.display_name.trim() : null;
        const avatarUrl = typeof body.avatar_url === "string" ? body.avatar_url.trim() : null;

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const result = await ensureAppUserRows(admin, {
          userId,
          email,
          displayName,
          avatarUrl,
        });

        if (!result.ok) {
          res.writeHead(result.status, cors);
          res.end(JSON.stringify({ error: result.error }));
          return;
        }

        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true, profile: result.profile }));
      });
    },
  };
}

function getProfileDevPlugin(env: Record<string, string>) {
  return {
    name: "get-profile-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/get-profile", async (req: any, res: any) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          res.writeHead(200, cors);
          res.end();
          return;
        }
        if (req.method !== "GET" && req.method !== "POST") {
          res.writeHead(405, cors);
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        let body: Record<string, unknown> = {};
        if (req.method === "POST") {
          const chunks: Buffer[] = [];
          req.on("data", (c: Buffer) => chunks.push(c));
          await new Promise((r) => req.on("end", r));
          try {
            body = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            body = {};
          }
        }

        const authHeader = (req.headers.authorization ?? "") as string;
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

        function extractUserIdFromToken(t: string): string | null {
          try {
            const parts = t.split(".");
            if (parts.length < 2) return null;
            let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            while (b64.length % 4) b64 += "=";
            const pl = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
            if (typeof pl.sub === "string" && pl.sub.length > 0) return pl.sub;
            return null;
          } catch {
            return null;
          }
        }

        let userId: string | null = token ? extractUserIdFromToken(token) : null;

        let uidFromQuery = "";
        try {
          const u = new URL(req.url || "/", "http://127.0.0.1");
          uidFromQuery = u.searchParams.get("_uid")?.trim() || "";
        } catch {
          uidFromQuery = "";
        }

        if (!userId) {
          const uidHint = uidFromQuery || (typeof body._uid === "string" ? body._uid.trim() : "");
          if (uidHint.length > 0) userId = uidHint;
        }

        if (!userId) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "Missing bearer token or valid user ID" }));
          return;
        }

        const supabaseUrl =
          env.SUPABASE_URL ||
          env.VITE_SUPABASE_URL ||
          process.env.SUPABASE_URL ||
          process.env.VITE_SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" }));
          return;
        }

        const sel = await fetch(
          `${supabaseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        if (!sel.ok) {
          const errText = await sel.text();
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: errText || "profile fetch failed" }));
          return;
        }
        const rows = await sel.json();
        const profile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true, profile }));
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

/**
 * Vite dev-server plugin: intercepts POST /api/r2-user-assets/* so `pnpm dev`
 * can upload/sign/delete pitch decks against Cloudflare R2 the same way the
 * deployed Vercel serverless functions do. Requires CF_R2_* vars in .env.local.
 */
function r2UserAssetsDevPlugin() {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  return {
    name: "r2-user-assets-dev",
    configureServer(server: any) {
      server.middlewares.use("/api/r2-user-assets/upload", async (req: any, res: any) => {
        if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
        if (req.method !== "POST") { res.writeHead(405, cors); res.end(JSON.stringify({ error: "Method not allowed" })); return; }

        try {
          const parsed = await parseMultipartAsset(req);
          if (!parsed.ok) { res.writeHead(400, cors); res.end(JSON.stringify({ error: parsed.error })); return; }

          const userId = await getClerkUserIdFromAuthHeader(req.headers.authorization);
          if (!userId) { res.writeHead(401, cors); res.end(JSON.stringify({ error: "Missing or invalid Authorization bearer token" })); return; }

          const configured = r2ConfiguredFor(parsed.assetType);
          if (!configured.ok) { res.writeHead(500, cors); res.end(JSON.stringify({ error: "R2 upload is not configured", missing: configured.missing })); return; }

          const out = await uploadR2UserAsset({
            userId,
            assetType: parsed.assetType,
            fileName: parsed.fileName,
            mimeType: parsed.mimeType,
            fileData: parsed.fileData,
          });
          res.writeHead(200, cors);
          res.end(JSON.stringify({ ok: true, key: out.key, url: out.url, bucket: out.bucket }));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "R2 upload failed" }));
        }
      });

      server.middlewares.use("/api/r2-user-assets/signed-url", async (req: any, res: any) => {
        if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
        if (req.method !== "POST") { res.writeHead(405, cors); res.end(JSON.stringify({ error: "Method not allowed" })); return; }

        try {
          const userId = await getClerkUserIdFromAuthHeader(req.headers.authorization);
          if (!userId) { res.writeHead(401, cors); res.end(JSON.stringify({ error: "Missing or invalid Authorization bearer token" })); return; }

          const body = await readJsonBody(req).catch(() => ({}) as Record<string, unknown>);
          const fileUrl = typeof body.file_url === "string" ? body.file_url : "";
          const key = parseR2StoredValue(fileUrl);
          if (!key || !key.startsWith(`pitch-decks/${userId}/`)) { res.writeHead(400, cors); res.end(JSON.stringify({ error: "Invalid pitch deck key" })); return; }

          const configured = r2ConfiguredFor("pitch-deck");
          if (!configured.ok) { res.writeHead(500, cors); res.end(JSON.stringify({ error: "R2 pitch decks are not configured", missing: configured.missing })); return; }

          const signedUrl = await signedR2PitchDeckUrl(key);
          res.writeHead(200, cors);
          res.end(JSON.stringify({ ok: true, signedUrl }));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to sign R2 URL" }));
        }
      });

      server.middlewares.use("/api/r2-user-assets/delete", async (req: any, res: any) => {
        if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
        if (req.method !== "POST") { res.writeHead(405, cors); res.end(JSON.stringify({ error: "Method not allowed" })); return; }

        try {
          const userId = await getClerkUserIdFromAuthHeader(req.headers.authorization);
          if (!userId) { res.writeHead(401, cors); res.end(JSON.stringify({ error: "Missing or invalid Authorization bearer token" })); return; }

          const body = await readJsonBody(req).catch(() => ({}) as Record<string, unknown>);
          const fileUrl = typeof body.file_url === "string" ? body.file_url : "";
          const key = parseR2StoredValue(fileUrl);
          if (!key || !key.startsWith(`pitch-decks/${userId}/`)) { res.writeHead(400, cors); res.end(JSON.stringify({ error: "Invalid pitch deck key" })); return; }

          const configured = r2ConfiguredFor("pitch-deck");
          if (!configured.ok) { res.writeHead(500, cors); res.end(JSON.stringify({ error: "R2 pitch decks are not configured", missing: configured.missing })); return; }

          await deleteR2UserAsset(key, "pitch-deck");
          res.writeHead(200, cors);
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to delete R2 object" }));
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
    mode === "development" && componentTagger(),
    mode === "development" && saveProfileDevPlugin(env),
    mode === "development" && ensureUserDevPlugin(env),
    mode === "development" && getProfileDevPlugin(env),
    mode === "development" && connectorsOauthDevPlugin(),
    mode === "development" && firmWebsiteContactDevPlugin(),
    mode === "development" && firmWebsiteThemesDevPlugin(),
    mode === "development" && firmWebsiteTeamDevPlugin(),
    mode === "development" && firmWebsiteHqDevPlugin(),
    mode === "development" && proxyExternalImageDevPlugin(),
    mode === "development" && mirrorFirmInvestorHeadshotsDevPlugin(),
    mode === "development" && ensureFirmElevatorPitchDevPlugin(),
    mode === "development" && personWebsiteProfileDevPlugin(),
    mode === "development" && r2UserAssetsDevPlugin(),
  ].filter(Boolean);
  const enableHttps = process.env.DEV_HTTPS === "true";
  const devHost = process.env.DEV_HOST || "127.0.0.1";
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
  const authProvider =
    process.env.VITE_AUTH_PROVIDER ||
    "supabase";

  return {
    /** Expose Vercel's deployment kind at build time (production | preview | development). */
    define: {
      "import.meta.env.VITE_VERCEL_ENV": JSON.stringify(vercelEnv),
      "import.meta.env.VITE_AUTH_PROVIDER": JSON.stringify(authProvider),
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
            /**
             * Keep Radix with the main React vendor graph.
             * A separate `radix` chunk can end up importing from `react-vendor`
             * while `react-vendor` also reaches back into `radix`, which breaks
             * boot on production deploys with `undefined.useLayoutEffect`.
             */
            if (id.includes("@supabase/") || id.includes("@clerk/") || id.includes("@auth0/")) return "auth-data";
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
    optimizeDeps: {
      // wasm-bindgen "web" target packages resolve their .wasm binary via
      // `new URL('*_bg.wasm', import.meta.url)`; esbuild's dep pre-bundling doesn't
      // preserve that relative asset, so exclude it and let Vite serve it untouched.
      exclude: ["@firecrawl/pdf-inspector-wasm"],
    },
  };
});
