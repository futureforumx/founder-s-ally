import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), mode === "development" && componentTagger()].filter(Boolean);
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
