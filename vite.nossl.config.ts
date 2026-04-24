import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  server: {
    host: "localhost",
    port: 5173,
    open: false,
  },
  preview: {
    host: "localhost",
    port: 5173,
    open: false,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@radix-ui/react-progress"],
  },
});
