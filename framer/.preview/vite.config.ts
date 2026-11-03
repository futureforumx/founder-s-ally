import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    root,
    server: { port: 5197, strictPort: true },
    resolve: {
        alias: [
            { find: "framer", replacement: path.resolve(root, "framer-shim.ts") },
            {
                find: /^https:\/\/framer\.com\/m\/WebGLGuard.*$/,
                replacement: path.resolve(root, "webgl-guard-shim.tsx"),
            },
            {
                find: /^https:\/\/framer\.com\/m\/PointShapeMorph.*$/,
                replacement: path.resolve(root, "point-morph-shim.tsx"),
            },
            {
                find: /^https:\/\/framer\.com\/m\/framer\/default-utils.*$/,
                replacement: path.resolve(root, "framer-shim.ts"),
            },
            {
                find: /^https:\/\/jspm\.dev\/lottie-web.*$/,
                replacement: path.resolve(root, "lottie-shim.ts"),
            },
        ],
    },
})
