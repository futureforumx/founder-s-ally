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

  return {
    server: {
      host: "::",
      port: 8080,
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
