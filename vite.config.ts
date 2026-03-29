import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), mode === "development" && componentTagger()].filter(Boolean);
  const enableHttps = process.env.DEV_HTTPS === "true";

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
      // true = listen on 0.0.0.0 — works with http://localhost and http://127.0.0.1 (host "::" often breaks on macOS).
      host: true,
      port: 5173,
      strictPort: false,
      open: true,
      hmr: {
        overlay: false,
      },
    },
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "@radix-ui/react-progress"],
    },
  };
});
