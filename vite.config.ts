import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { resolveFirmWebsiteContact } from "./api/_firmWebsiteContact";
import { resolveFirmWebsiteTeam } from "./api/_firmWebsiteTeam";
import { resolvePersonWebsiteProfile } from "./api/_personWebsiteProfile";

/**
 * Vite dev-server plugin: intercepts POST /api/save-profile so `npm run dev`
 * works the same as the deployed Vercel serverless function.
 * Uses SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY from the shell environment (.env.local).
 */
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

        // Get user ID from Clerk JWT (decode sub without verification for dev convenience)
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
            userId = typeof payload.sub === "string" ? payload.sub : null;
          }
        } catch { /* ok */ }

        // Body _uid as fallback hint (validated against same pattern)
        const bodyUid = typeof body._uid === "string" ? body._uid.trim() : "";
        if (!userId && bodyUid) userId = bodyUid;

        if (!userId || !/^user_[A-Za-z0-9]{20,}$/.test(userId)) {
          res.writeHead(401, cors);
          res.end(JSON.stringify({ error: "Could not extract valid Clerk user ID from token" }));
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
  const plugins = [
    react(),
    mode === "development" && componentTagger(),
    mode === "development" && saveProfileDevPlugin(env),
    mode === "development" && firmWebsiteContactDevPlugin(),
    mode === "development" && firmWebsiteTeamDevPlugin(),
    mode === "development" && personWebsiteProfileDevPlugin(),
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
  };
});
